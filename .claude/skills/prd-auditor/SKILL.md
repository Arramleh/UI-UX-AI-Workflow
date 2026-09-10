# PRD Auditor Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/prd-analyzer`, `/figma:figma-use`, `/gate-3-pages`  ·  **Optional:** `/screen-planner`, `/design-system-loader`, `/component-analyzer`

```bash
node utils/pipeline.mjs plan prd-auditor
```

Then follow its output exactly: run anything under `RUN THESE SKILLS FIRST` in the printed order, skip
what is `ALREADY SATISFIED`, and ask the user for any input marked `NOT SET`.

> Never fabricate an upstream result. If an artifact is missing, run the skill that produces it.

---

Audits **what was actually built in Figma** against the PRD, and decides whether the workflow is done.

## Why this stage exists

Every other analysis stage in this pipeline measures *intent*. `/coverage-scorer` scores the screen
plans; `/component-analyzer` compares the plans to the library; `/coverage-reporter` renders those
numbers. All of them can report a feature as fully covered while the Figma file contains something
quite different — because none of them look at it.

This stage looks at it. It is the only stage that reads the built result, so it is the only stage that
can catch a build defect. It is also the loop condition: `/run-prd-workflow` reads `verdict` and, while
gaps remain and iterations are left, sends the gaps back through phase 2 — a re-spec, a rebuilt
component pass and a fresh gate-2 approval of those components — then has the pages rebuilt and
re-approved at gate 3, and calls this stage again.

**It runs after EVERY page has cleared gate 3** — `gate-3-pages` is a hard requirement, so an
unapproved page blocks this audit rather than being audited around. That ordering makes this stage the
**machine counterpart to gate 3**: gate 3 asks a human whether each page *looks* right, this asks the
live file whether the PRD is actually *covered*. Both are needed and neither substitutes for the other.
A page can be approved on sight and still be missing a state the PRD named — a designer validating the
default view has no reason to notice that the empty state was never assembled, and this check has no
opinion about whether the page looks good. Treat a clean gate-3 record as no evidence at all about
coverage.

**Audit the PRD, not the plans.** `03_screen_plans.json` is an *interpretation* of the PRD. An item the
PRD names but the plan never captured is invisible to a plan-derived check, and will stay invisible no
matter how many times you re-run it. Read the PRD's own component and flow lists and resolve each item
against the file.

## Usage

```
/prd-auditor                 # audit the current build (iteration inferred from 13_prd_audit.json)
/prd-auditor --iteration 2   # explicit
```

## The seven checks

Run all of them. Record counts per section in `sections`, and put anything actionable in `gaps`.

1. **Components** — every component the PRD's component list names, resolved to a real `COMPONENT` or
   `COMPONENT_SET` node id. Not "something like it exists" — the node, by id, with its name checked.
2. **Frames** — every page/frame the PRD lists, present as a top-level frame.
3. **States** — every state the PRD or the screen plans call for, expressible by a component variant
   *and* assembled as a frame where the PRD names it. A state that exists only as a variant is covered
   in the library and missing from the screens; say which.
4. **Flows** — every flow in the PRD, wired as a prototype connection whose destination is one of this
   feature's frames. Screens existing side by side is not a flow.
5. **Assembly** — the PRD's assembly rules, checked structurally: element order within a frame, what is
   pinned above or below what, which control carries which badge.
6. **Content** — copy the PRD specifies verbatim (cap wording, empty-state messages, confirmation text
   that must state counts). Two states the PRD requires to be *distinct* must not share copy.
7. **Consistency** — the same concept expressed the same way everywhere. A count shown in two places
   must agree; a tag used on two surfaces must be the same component.

## How to read the file — this is not optional

**Never walk the Figma REST API at a fixed depth.** A node at the depth limit is returned with its
`children` array absent, which is indistinguishable from a genuinely empty frame. That produces
confident findings about things you never looked at — a button nested seven levels down gets reported
as missing, and the report says so with no hint that the check was truncated. Fetch the full document,
or read through the Plugin API.

**Orphaned masters are invisible to REST entirely.** A component set whose parent is `null` appears in
no page tree at any depth, yet instances still resolve to it and still render. The only way to find one
is through the Plugin API: resolve an instance's `mainComponent` and check whether its parent is null.
A component in that state is worse than missing — it drives real UI while being unfindable,
unselectable and undocumentable. Check for it explicitly; a REST-only audit cannot.

**Verify, do not assert.** Resolve each claim against the file and list what you checked in
`verified_claims`. The characteristic failure of this stage is a status assigned from intent — marking
an item resolved because you remember building it, when it was built on one surface and not the other.
If you did not check it, it does not go in `passed`.

## What `12_figma_build.json` reports, and how to read it

It is now written **incrementally** — once after the component pass, then again after each page — rather
than as an end-of-run summary. An artifact that only appeared after every page was built could not exist
while a page was sitting with the designer, which is the state phase 3 spends most of its time in. Two
fields matter to this audit:

| Field | What it means here |
|---|---|
| `pages_remaining` | Pages from the build checklist that were never assembled. A non-empty list when you are asked to audit means phase 3 did not finish — say so rather than auditing a partial module as though it were the whole thing. |
| `discovered_gaps` | Gaps assembly found that neither the build checklist nor the gate-2 component review caught. |

**A `discovered_gaps` entry with `action: "stopped-and-flagged"` is assembly behaving correctly.** It
stopped rather than improvising a component, which is the outcome the field exists to produce. So it is
**phase-2 work, not an audit gap**: it goes back for a re-spec, a re-run of the component pass and a
fresh gate-2 approval of the rebuilt components. Do not
re-report it in `gaps` as though this audit discovered it and a rebuild could close it — that
double-counts the same item and burns an iteration on work that is already correctly routed. Reference
it, name where it is being handled, and keep your own `gaps` for what *you* found in the file.

An entry with `action: "deviation-approved-in-the-moment"` is different: something was built that was
not on the checklist, with a designer's name against it. Audit it like anything else in the file — the
approval says a human accepted it, not that it satisfies the PRD.

## Gaps versus blocked items

`gaps` are things a rebuild can close: a missing component, an unassembled state, an unwired flow,
wrong copy. These drive the loop.

`blocked_items` are things no rebuild can close:

- **Open PRD decisions.** Record them here with the options and your recommendation; they are answered
  by a human, not by this stage and not by a rebuild. `blocked_items` is how they reach
  `/closure-reporter`, so a decision left out here is one that appears nowhere. Do not stall the loop
  waiting on one, and do not resolve one yourself — an audit that decides is an audit that grades its
  own answer.

  This matters more than it once did. Gate 1 still refuses to open while a phase-1 decision is
  unanswered, but **no gate holds a phase-2 escalation open** — gate 2 reviews live component nodes and
  seeds no decisions. A taxonomy or data-model conflict raised in `06_component_analysis.json` can
  therefore travel all the way to the end unanswered, and this list is often the first place it is
  named again. Record it even if it looks like somebody else's problem.
- **Requirements the PRD never specified.** Accessibility is the usual one. Guessing would bake an
  unreviewed decision into every frame; the honest output is to name the gap.
- **Actions needing a human.** Publishing a Figma library cannot be done through the REST or Plugin API.

Putting a blocked item in `gaps` makes the loop run until it exhausts its iterations and then report
failure for something that was never buildable. Classify carefully.

## Converging

- `verdict: "covered"` — `gaps` is empty. The orchestrator stops and goes to phase 4:
  `/developer-handoff`, then `/closure-reporter`.
- `verdict: "gaps_found"` — the orchestrator re-specs, **re-takes gate 2**, rebuilds page by page
  through gate 3, and re-audits. See below.
- `verdict: "blocked"` — `gaps` is empty but `blocked_items` is not. Stop; this is a real, honest end
  state, not a failure.

### The loop goes back through gate 2, not straight to page assembly

```
/figma-modifier → /figma-component-pass → GATE 2 again → /figma:figma-use (page by page) → GATE 3 per page → here
```

An audit gap means **the build checklist was wrong or incomplete**, so closing it is a phase-2 change:
re-spec `11_build_phase.json`, **rebuild the components**, and re-take gate 2 on those rebuilt
components with `iteration` set on the new signoff. Only then is a page assembled — one at a time, each
decided at gate 3 again. Nothing in this loop hands work to `/figma:figma-use` without a current
gate-2 signoff behind it.

Be precise about what that buys, because half of it is gone. The component pass is **ungated**, so
iteration 2 writes its components into Figma before any person sees them; nothing prevents that. What
gate 2 prevents is those components being **assembled into pages** unreviewed. In the file an
unreviewed iteration-2 component looks exactly like a reviewed iteration-1 one, and re-taking the gate
on each rebuild is the only thing that tells them apart — so skipping it does not merely omit a
formality, it makes the two indistinguishable for good.

**Cap the loop at 5 iterations.** At the cap, phase 4 runs anyway with `converged: false`. An exhausted
loop presented as a finished one is the worst output this pipeline can produce, because it looks exactly
like success.

**Each iteration must close gaps, not restate them.** If a gap survives an iteration unchanged, say why
in its `action` — usually the rebuild could not address it and it belongs in `blocked_items` instead.
A loop that reports the same gap three times is not converging, and the cap will hide that unless the
audit says so.

**Withdraw false positives loudly.** If this pass disproves an earlier finding, put it in
`false_positives_withdrawn` with the reason. A gap that quietly disappears between iterations looks
like it was fixed.

## Artifact contract

**Reads:**

- `reports/<feature>/01_prd_requirements.json` — the requirement list
- The PRD itself at `PRD_SOURCE` — **read it directly**; the component and flow lists are what you audit
  against, and `01_prd_requirements.json` is a summary that can omit an item
- `reports/<feature>/12_figma_build.json` — what the build claims it did, to be checked, not trusted.
  Written incrementally, so also read `pages_remaining` (pages never assembled) and `discovered_gaps`
  (gaps assembly stopped on, which are phase-2 work rather than audit gaps)
- `reports/<feature>/12a_figma_components.json` — the component pass, and the record gate 2 signed off.
  It is what distinguishes a component a person reviewed from one that merely exists in the file
- `reports/<feature>/G3_page_signoffs.json` — which pages a human approved, with how many revision
  rounds each took and whether the frame was hand-edited. Read it to know *what was validated by eye*;
  it is not evidence of PRD coverage, which is this stage's whole job
- `reports/<feature>/03_screen_plans.json`, `06_component_analysis.json` (optional) — for cross-reference

**Writes:**

- `reports/<feature>/13_prd_audit.json`

```bash
node utils/pipeline.mjs path --stage prd-auditor --ensure
```

The shape is enforced by [`.claude/schemas/artifacts.json`](../../schemas/artifacts.json). Then:

```bash
node utils/pipeline.mjs done prd-auditor
```

## Handoff

Return `verdict` and the gap count to `/run-prd-workflow`. It owns the loop — this stage never invokes
`/figma-modifier` itself, and it certainly never invokes `/figma:figma-use`: the return path runs through
`/gate-2-components`, and a stage that started page assembly itself would be routing around a human
gate. The
dependency graph is acyclic and [`check`](../../pipeline.json) rejects a cycle, which is precisely why
the iteration lives in the orchestrator and the condition lives here.

On `covered` or `blocked`, phase 4 follows: `/developer-handoff` (what was built, for engineering) and
then `/closure-reporter` (what was decided and what is still missing, on every outcome).
