# Closure Reporter Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/prd-analyzer`  ·  **Optional:** `/coverage-reporter`,
`/figma-modifier`, `/figma-component-pass`, `/figma:figma-use`, `/prd-design-requirements`,
`/gate-1-requirements`, `/gate-2-components`, `/gate-3-pages`, `/developer-handoff`

```bash
node utils/pipeline.mjs plan closure-reporter
```

Follow its output exactly. Never fabricate an upstream result.

---

The final deliverable of phase 4, written once every page has cleared gate 3 — and written on
**every** outcome, including a run that never got past a gate.

## Two documents in phase 4, and this is the second

`/developer-handoff` runs **before** this stage and answers a different question. It records what was
**built**: one spec per approved page — layout, tokens, props and variants, states, breakpoints, edge
cases — plus a change-log of every component created during assembly, cross-linked to the live Figma
frames. It is what engineering builds from.

This report records what was **decided**, and what is **still missing**. Neither document subsumes the
other and the audiences differ: a developer reading only this one would have nothing to implement, and a
reader reading only the handoff would believe every open question was settled and every requirement met.

The two also have deliberately opposite prerequisites. `/developer-handoff` requires `gate-3-pages`
**hard**; every edge into this stage is **optional**, including the gate records themselves. A handoff
describing unapproved work as shippable is worse than no handoff, so it must not exist for a
partially-approved module. This report is the opposite case: it is the one document that explains what
was decided on the reader's behalf, so it must be producible on any outcome — a loop that exhausted its
iterations, a module parked at gate 2, a run abandoned at gate 1. A hard edge here would let a missing
upstream artifact suppress exactly the report someone needs when things went wrong.

## What this report is for

`/coverage-reporter` answers *"does the design system cover this PRD?"* and it runs **before** anything
is built. This report answers a different question, and it can only be written afterwards:

> What did this workflow actually do, what is still not done, and what did it decide on your behalf?

Someone picking this up cold needs three things, and they are the three required sections.

## The three sections

### 1. What was created from scratch

Every component, screen, state and flow the workflow brought into existence, across **all** iterations —
with the PRD reference that justified it and the iteration it appeared in. Keep modifications of
existing things in `modified_existing`, separately: creating a component is additive and low-risk,
while changing one can break every consumer already bound to it, and a reviewer's attention should go
to the second list first.

### 2. What is still missing

Every uncovered item with `why_not_closed`, and `closeable_by` naming who or what could close it. Four
honest reasons dominate:

- a decision still open — raised at a gate and never answered, or raised nowhere at all
- something the PRD never specified, so there was nothing to build against
- an action requiring a human **in the Figma editor** — publishing a library is the recurring one. This
  is §8's "needs a human in the editor" group, and it belongs **here**, with `closeable_by` naming the
  action, not in `open_decisions[]` with a fabricated `taken`. Nobody took a decision; the work simply
  has not been done, and dressing it up as a decision hides it from whoever could do it. Cross-check
  against the audit's `blocked_items` and merge duplicates rather than listing the same item twice
- **a gate that is still open.** A module parked at gate 2 awaiting a taxonomy answer, or a run
  abandoned at gate 1, is a legitimate closure outcome and must be reported as *parked* — naming the
  gate, what it is waiting on and who it is waiting on. Every edge into this stage is optional so that
  this report can be written in exactly that situation; writing it and then describing the run as
  complete would waste the affordance

Do not soften this section, and do not omit an item because it was out of scope for the build. A reader
seeing "covered" in the audit and nothing here will assume the feature is finished.

### 3. Open decisions, and what was answered at each gate

Every open decision the workflow raised, the options, the recommended one, **the answer a person gave**,
who gave it, and why.

#### Decisions are RAISED upstream and TAKEN BY A HUMAN AT A GATE

Nothing in the AI phases resolves a product decision. Phase 1 and phase 2 **raise** them as packets —
question, options, consequences, a recommendation — and gate 1 and gate 2 are where a person answers.
Both gates refuse to pass while any raised item has no `answer`, which is why a completed run has
answers to find rather than assumptions to reconstruct.

So build `open_decisions[]` **from the gate signoff records**, and use the upstream artifacts only for
the question and the options that were on the table:

| Source | What it supplies |
|---|---|
| `G1_requirements_signoff.json` → `decisions[]` | The answer to every phase-1 item: `answer`, `decided_by`, `decided_at`, and the `recommended` option it was chosen from. |
| `G2_mapping_signoff.json` → `decisions[]` | The same for every phase-2 escalation — taxonomy conflicts, data-model conflicts, systemic component absences. Also `iteration`, so an answer given after a re-spec is distinguishable from one given at the first approval. |
| `design_requirements.md` §8 | The **question**, the options and the consequences as originally raised. §8 does not answer anything — see below. |
| `06_component_analysis.json` → each gap's `escalation` | The question for anything phase 2 escalated rather than mapped, with its `raised_by` trail. |
| `11_build_phase.json` | Spec-time choices that were the AI's to make and did not need a person — a variant set narrowed, a state dropped as unbuildable, a `module-specific` architecture justified in `scope_rationale`. |
| `12_figma_build.json` → `discovered_gaps` | Gaps assembly stopped on with `action: "stopped-and-flagged"`. With no audit stage left, this is the only machine-recorded evidence of something that was wrong with the build, and anything still unresolved here belongs in `still_missing[]`. |

Map `answer` onto `taken` and carry `recommended` across unchanged. Where the two differ, that is the
most important thing in this section: say so plainly rather than smoothing it over.

**§8 raises; it does not take.** `/prd-design-requirements` writes its open items as decision packets
for gate 1, so an §8 entry on its own is an unanswered question. If §8 has an item and no gate record
answers it, that item was resolved by nobody — put it in `still_missing[]` with `why_not_closed`, and
treat the omission as a finding in its own right rather than inferring what was probably decided.

**Why not re-derive from the PRD.** Re-reading the PRD and working out what should have been decided
produces a list that reads *identically* to the truth — same decisions, same phrasing, plausible
rationales — and is wrong at exactly the points that matter: wherever the human chose **against** the
recommendation. The gate records keep `recommended` alongside `answer` precisely so that divergence
survives; re-deriving overwrites the answer with the recommendation and erases the only trace that
someone overruled it. It also attributes to a person a choice they never made, in a document whose whole
purpose is accountability for choices made on the reader's behalf.

**Never invent an entry.** If an item appears in none of the sources above it was not decided, and
recording it as decided is worse than omitting it. Conversely, if a gate answer and the built file
contradict each other, that is a **defect found by building** — record it in that section, and do not
quietly rewrite the decision to match what got built.

This stage is the **sole owner** of `14_closure_notes.json`. `/prd-design-requirements` is explicitly
forbidden from writing it, so this ledger is the one authoritative copy of the decision record — which is
also why an entry missing here is missing everywhere.

#### What this stage adds: `reversible_by`

The gate records say what was chosen; they cannot say what changing it would now cost, because that is
only knowable once the thing is built. Work it out from the built file and the handoff and record it.
"Switch a variant on one component" and "redesign three screens and re-take gate 2" are very different,
and the reader needs to know which they are looking at before deciding whether to reopen a decision that
a person already answered.

Set `needs_human_confirmation: true` on any decision where the answer could still mislead — a permission
model, anything with a legal or accessibility dimension, or an answer that contradicts what the PRD
appears to prefer. An answered gate is not a guarantee that every consequence was visible at the time it
was answered.

### Also record: how the gates went

A gate that bounced its phase back twice before passing is a **different fact** from one that passed
first time, and the reader is owed it — a module rebuilt after two rounds of requirements corrections
carries more residual risk than one approved on sight. Read `history[]` on each signoff, oldest first,
and report per gate: verdict, who decided, how many rounds, and what each `changes_requested` sent back
(`bounced_to`).

`G3_page_signoffs.json` supplies the per-page picture, and three of its fields belong in the report:

| Field | Why it belongs here |
|---|---|
| `iterations` per page | Revision rounds. A page that took four rounds is where the requirement was least well understood, and probably where the next defect is. |
| `manually_edited` | The designer changed the frame by hand. The file is then ahead of every spec written from assembly's own state, so a reader must know which pages those are. |
| `deviations_approved` | Components used that were **not** on the gate-2 checklist but which the designer approved in the moment. Recorded rather than tolerated: an unrecorded deviation is indistinguishable from an invented component, and this is where it stops being invisible. |

Cross-check `deviations_approved` against `/developer-handoff`'s `change_log`. A deviation in one and not
the other means the design system has drifted from what shipped with nothing recording it.

## Also record: defects found by building

`defects_found_by_building` is the section that justifies the loop existing. These are problems
invisible in the plans, which surfaced only because something was built and then audited — a component
that existed but was unreachable, a state whose copy said the wrong thing, a count shown in two places
that disagreed. If this list is empty across several iterations, the audit is probably not looking hard
enough.

## Output

- `reports/<feature>/closure_report_<date>.pdf` — or `.html` when PDF generation is unavailable; the
  pipeline matches `closure_report_*` and accepts either, because both are a real report
- `reports/<feature>/14_closure_notes.json`

Generate the PDF the same way `/coverage-reporter` does: build an HTML document and render it with
headless Chrome (`google-chrome --headless --print-to-pdf`). Match that report's visual language so the
two read as a pair.

**Report where the run actually stopped, in the summary line and not only in a field.** That is what
`final_state` is for — `all-pages-approved`, `parked-at-gate` (with `stopped_at` and `pages_pending`),
or `abandoned`. It replaced `final_verdict` / `converged` / `iterations_run`, which described a loop
that no longer exists. "Parked at gate 2 awaiting a taxonomy answer" is a result and it goes in the
summary; **"complete" is not a result if a gate is still open or a page is still unapproved.**

**And do not let `all-pages-approved` be read as "the PRD is covered".** It is not the same claim, and
since the audit stage was removed nothing in this pipeline makes the stronger one. What it means is
that every page a person was shown looked correct to them, one at a time. A requirement dropped from
the checklist in phase 2 produced no page, so no page looked wrong. Where the coverage scores or the
gap analysis named something the build never reached, that belongs in `still_missing[]` — the scores
are now the closest thing to a completeness check the report has, and they measured intent, not the
file.

## Artifact contract

**Reads:**

- `reports/<feature>/G1_requirements_signoff.json`, `reports/<feature>/G2_mapping_signoff.json`
  (optional) — **the primary source for `open_decisions[]`**: `decisions[]` carries the `answer`,
  `decided_by`, `decided_at` and the `recommended` option it was chosen from. Also `history[]` and
  `bounced_to`, for how many rounds each gate took and what it sent back
- `reports/<feature>/G3_page_signoffs.json` (optional) — per-page outcomes: `iterations`,
  `manually_edited`, `deviations_approved`
- `reports/<feature>/15_developer_handoff.json` (optional) — from `/developer-handoff`, which runs first.
  Read its `change_log` to cross-check deviations, and its page specs to work out `reversible_by`. Do not
  restate it: that document is what was **built**, this one is what was **decided**
- `reports/<feature>/12_figma_build.json` — what was built, including `discovered_gaps` (gaps assembly
  stopped on) and any `pages_remaining` that were never assembled
- `reports/<feature>/11_build_phase.json` — the gate-2-approved checklist, and the spec-time choices the
  AI made within it (a narrowed variant set, a `module-specific` architecture and its `scope_rationale`)
- `reports/<feature>/design_requirements.md` (optional) — **§8 supplies the question, the options and the
  consequences**, not the answer; see "Decisions are RAISED upstream and TAKEN BY A HUMAN AT A GATE"
  above. Optional because this stage must run on every outcome: a missing requirements doc must not
  suppress the closure report. When it is absent, say so in the report rather than presenting a decision
  list as complete
- `reports/<feature>/06_component_analysis.json` (optional) — each gap's `escalation`: the phase-2
  questions that went to gate 2, with their options and `raised_by` trail
- `reports/<feature>/01_prd_requirements.json` — requirements and constraints, including the PRD's own
  open-decision list. Use it to check for **omissions** — a PRD decision that appears in neither a gate
  record, nor §8, nor the audit was resolved by nobody, and that is itself a finding — not as a
  substitute source and never as a basis for re-deriving an answer
- `reports/<feature>/10_roadmap.json` (optional) — for what remains

**Writes:**

```bash
node utils/pipeline.mjs path --stage closure-reporter --ensure
```

- `reports/<feature>/closure_report_<date>.pdf`
- `reports/<feature>/14_closure_notes.json`

Enforced by [`.claude/schemas/artifacts.json`](../../schemas/artifacts.json). Then, as the last action:

```bash
node utils/pipeline.mjs done closure-reporter
```
