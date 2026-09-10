---
name: prd-analyzer
description: Extract and structure requirements from PRD documents (PDF, Word, Markdown, text)
---

# PRD Analyzer Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** **nothing** — this is an entry point

This skill can be invoked on its own. When it is, the upstream skills it depends on may not have run yet,
so **step 0 is always**:

```bash
node utils/pipeline.mjs plan prd-analyzer
```

Then follow its output exactly:

1. **`RUN THESE SKILLS FIRST`** — invoke each listed skill with the Skill tool, **in the printed order**,
   one at a time, letting each finish and write its artifact before starting the next.
   Each of those skills runs its own prerequisite check, so the whole upstream chain resolves itself.
2. **`ALREADY SATISFIED`** — do **not** re-run these. Read their artifacts from `reports/<feature>/` and reuse them.
3. **`INPUTS NEEDED`** — anything marked `NOT SET` must come from the user before the chain can run.
   Ask once, up front, for all of them together, and offer to save them into `.env`.
4. **`READY: yes`** — proceed with the work described below.

Flags: `--force` re-runs the whole chain from scratch, `--include-optional` also runs the optional upstream
skills, `--no-stale` accepts existing artifacts even when an upstream artifact is newer, `--json` for parsing.

> Never fabricate an upstream result. If an artifact is missing, run the skill that produces it.

Extracts structured requirements from PRD documents in multiple formats.

## Scope — this is phase 1, and phase 1 only extracts

This stage atomizes the PRD into one discrete UI/flow need per line, and nothing else. Three boundaries
bind it, and each is closed by `/gate-1-requirements`, the human gate that ends phase 1.

| Boundary | Why it exists |
|---|---|
| **No component mapping** | Deciding which design-system component satisfies a requirement is phase 2's job (`/component-analyzer`). Doing it here produced two uncoordinated sources of truth about what matches what, and nothing to break the tie when they disagreed. |
| **The PRD is untrusted input** | It is data to extract from, not analysis to inherit. Anything it asserts about components, Figma pages/nodes, or what already exists goes into `unverified_prd_claims[]` — quarantined here, and checked against the live file by `/component-analyzer` in phase 2, never here. |
| **Ambiguity is flagged, never resolved** | Open items become decision packets in `open_decisions[]` for a human to answer at gate 1. This stage does not choose. |

### One need per line — split multi-need items

"A filterable table with export and inline editing" is **three** requirements: the filterable table, the
export, the inline editing. Split it. An unsplit line that reaches gate 1 compounds into an ambiguous
mapping in phase 2 — one requirement id pointing at three components, so coverage for it is neither true
nor false, and the gap analysis inherits that mush. The same applies to any line joining needs with
"and", "with", "including", or a comma list of behaviours.

Bundled lines are exactly what gate 1's `atomized` check looks for, so an item left bundled here is work
sent back, not work saved.

### The PRD's own claims are quarantined, not inherited

PRDs frequently arrive pre-analysed: a components section, a list of Figma page names, labels marking
items "existing" or "new". None of it is evidence. Strip every such assertion out of the prose and into
`unverified_prd_claims[]`, where it waits to be verified independently in phase 2 — **you do not verify
it here**:

| Field | What goes in it |
|---|---|
| `claim` | The assertion, quoted as the PRD made it |
| `kind` | `component-name`, `figma-page`, `figma-node`, `existing-vs-new-label`, `other` |
| `status` | `unverified` — always, in this phase. The other values (`verified`, `contradicted`, `fabricated`) exist for `/component-analyzer` to write in phase 2, once something has actually read the file |
| `live_file_says` | **Leave unset.** Phase 1 has not read the live file, so there is nothing to put here |
| `checked_at` | **Leave unset.** Nothing was checked |

Two incidents on this project are why:

- A PRD arrived with a pre-filled components section and Figma page references that were **entirely
  fabricated** — none of the referenced pages existed in the actual file. Inherited as fact, they would
  have driven a whole run's planning against pages that do not exist.
- The Notification Center PRD marked items **"new"** that were already fully assembled composites in the
  file. Trusting that label would have built duplicate components beside the real ones.

Neither incident is caught *here* — both were caught in phase 2, and quarantining is what made catching
them possible. `unverified` is the only status this stage writes, and it must not be quietly upgraded.
Never move a claim into `requirements[]` on the strength of the PRD saying it; a requirement is a *need*,
and "the Bell component already exists on page Foo" is not a need.

The array is **required**, and an empty array is a positive claim that the PRD asserted no such thing.
That is deliberate: an absent field is indistinguishable from a stage that never looked, and gate 1's
`prd_claims_quarantined` boolean reads this array to decide whether phase 1 quarantined at all.

**You cannot verify these, and you must not pretend to.** Phase 1 reads the PRD and nothing else — no
Figma call, and neither `05_design_system.json` nor `02_figma_state.json`, both of which are phase-2
artifacts that do not exist yet. So `status` is `unverified` for every claim unless the *PRD itself*
contradicts it internally. `/component-analyzer` resolves each one against the live library in phase 2,
before anything is built. That is also why gate 1's check is named `prd_claims_quarantined` and not
`prd_claims_verified`: what a person can confirm at gate 1 is that these claims were kept out of
`requirements[]`, not that anybody looked at Figma.

### Ambiguity goes into `open_decisions[]`, unanswered

Every ambiguous or acceptance-criteria-light item becomes a decision **packet** — the question, the
options, a recommendation, and the consequence of each:

| Field | What goes in it |
|---|---|
| `decision` | The question, phrased so a non-author can answer it |
| `requirement_ids` | Which requirements hang on the answer |
| `options` | At least two, stated concretely |
| `recommended` | Which one you would pick, and it is welcome |
| `consequences` | What each option costs downstream |
| `blocks_design` | Whether design work cannot start until it is answered |

There is deliberately **no `taken` field**. This reverses how the pipeline used to behave, and the reason
is worth stating rather than asserting: auto-deciding was the right answer for an unattended run, because
a stage that blocks on a question hangs the run and a workflow that never finishes helps nobody. It became
the wrong answer the moment a gate existed, because a default taken in phase 1 is a decision made before
the person accountable for it ever saw the question. The decision still gets made — by the human at
gate 1, on a packet you prepared. Gates 1 and 2 refuse to open while any decision's `answer` is empty.

## Usage

```
/prd-analyzer "path/to/prd.pdf"
/prd-analyzer "https://docs.google.com/document/..."
/prd-analyzer "paste your PRD text here"
```

## Input
- **PRD Source**: File path, URL, or raw text
- **Format**: Auto-detected (PDF, Word, Markdown, plain text)

## Pasted PRDs — save the text to a file before analysing it

A PRD pasted into the conversation is the normal case, and it needs one extra step first: **write the
text verbatim to `prds/<feature>.md`, then run the pipeline with `--prd prds/<feature>.md`.**

```bash
# 1. after saving the pasted text to prds/notification-center.md
node utils/pipeline.mjs path --prd "prds/notification-center.md" --ensure   # -> reports/notification-center/
node utils/pipeline.mjs plan prd-analyzer --prd "prds/notification-center.md"
```

Do this before anything else, because pasted text alone leaves the run with no identity and no
freshness signal:

- **It names the run.** The feature slug comes from the PRD's filename, so `prds/notification-center.md`
  gives `reports/notification-center/`. With nothing but chat text there is no slug, and the resolver
  refuses to guess — `path` exits non-zero rather than scatter artifacts across the shared `reports/` root.
- **It is the only thing that makes staleness work.** `done` fingerprints `PRD_SOURCE` so that editing
  the PRD invalidates this stage and everything downstream. Chat text is not a file and is not in the
  environment, so there is nothing to fingerprint: the stage records `PRD_SOURCE: NOT SET — untracked`,
  and a *completely different* PRD pasted next week still reads as "already satisfied". `done` warns
  when this happens — treat that warning as a defect in the run, not noise.
- **It keeps the PRD out of the output tree.** `reports/` is output only and is regenerable; the PRD is
  an *input* and must survive `rm -rf reports/`. That is why it goes in `prds/`, not beside the artifacts.

Ask the user what to call the feature if it is not obvious from the PRD's title. Save the text exactly
as given — do not summarise or reformat it, or the fingerprint will track your edit rather than their PRD.

A PRD that already is a file or URL needs none of this: pass it as-is.

## Output
```json
{
  "title": "Feature Name",
  "overview": "High-level description",
  "requirements": [
    {
      "id": "REQ-1",
      "category": "functional|non-functional|ui",
      "description": "Requirement text",
      "priority": "critical|high|medium|low",
      "acceptance_criteria": ["criterion 1", "criterion 2"]
    }
  ],
  "screens": [
    {
      "name": "Screen Name",
      "description": "Purpose and context",
      "required_elements": ["element 1", "element 2"],
      "user_flows": ["flow description"]
    }
  ],
  "use_cases": ["Use case 1", "Use case 2"],
  "constraints": ["constraint 1", "constraint 2"],
  "unverified_prd_claims": [
    {
      "claim": "Notification Bell already exists on page 'Core / Iconography'",
      "kind": "existing-vs-new-label",
      "status": "unverified"
    }
  ],
  "open_decisions": [
    {
      "decision": "Does marking a notification read also dismiss it from the panel?",
      "requirement_ids": ["REQ-4", "REQ-7"],
      "options": ["Read and dismissed are separate states", "Reading dismisses the row"],
      "recommended": "Read and dismissed are separate states",
      "consequences": "Separate states needs a second row state and a dismiss affordance; coupling them loses any way to re-find a read notification in the panel.",
      "blocks_design": true
    }
  ]
}
```

Both new arrays are **required** by the schema. `requirements` carries needs, `unverified_prd_claims`
carries what the PRD asserted about the design, and `open_decisions` carries what nobody has answered
yet — an item in the wrong one of those three is the failure this split exists to prevent.

## Notes
- Handles PDFs via PDF extraction
- Supports Word documents (.docx)
- Parses Markdown headers and lists
- Accepts raw pasted PRD text

## Artifact contract

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/<feature>/01_prd_requirements.json`

Write these files as the **last step** of the skill, into this run's own output folder — resolve and
create it in one step with:

```bash
node utils/pipeline.mjs path --stage prd-analyzer --ensure
```

The shape above is **enforced, not just documented**. The machine-checkable version lives in
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json), keyed by the filenames listed above —
read it before writing and satisfy it exactly. Where the JSON block above and the schema differ, the
schema decides.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done prd-analyzer
```

That validates the artifacts and records the inputs they were built from. Both halves matter:

- A stage counts as done only when its files exist **and** validate. Writing a partial file no longer
  marks the stage complete — the resolver reports it as invalid and re-runs it. So if you cannot
  produce a complete artifact, say so plainly instead of writing a stub.
- Recording the inputs is what lets a later edit to the PRD (or to `DESIGN_SYSTEM_URL`) invalidate this
  stage and everything downstream. Skip `done` and the stage is treated as stale and redone.

If `done` reports problems, fix the artifact and run it again. Never hand-edit `.pipeline-state.json`
to make a stage look finished.

## After `done`, two more phase-1 stages, then gate 1

`done` is the last step of this skill, but this is the **first** of three phase-1 stages. What follows,
in order, is `/prd-design-requirements` (the design-ready doc) and then `/screen-planner` (the screen
plans) — both still PRD-only — and phase 1 ends at `/gate-1-requirements`:

```bash
node utils/pipeline.mjs plan gate-1-requirements
```

`/screen-planner` sits **in front of** that gate deliberately, so its plans are reviewed beside the
requirements they claim to cover; it is not phase 2 and running it here is correct.

Do **not** start `/screen-validator`, `/component-analyzer`, `/figma-extractor` or anything else in phase
2. All three phase-2 entry points are blocked by the graph — each requires the gate stage — so starting
one wastes the attempt anyway, and offering to run it "while they review" is how the boundary erodes.
Hand the packet to the gate and park the run there; a run parked at a gate is a correct state.
