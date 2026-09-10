# Setting Up the PRD-to-UI Workflow Skills

The skills have been created and are ready to use. Here's how to use them in Claude Code.

The pipeline is **four AI phases with three human validation gates**. It is not unattended: it halts
at gate 1, gate 2, and after every assembled page, and waits for a person. Parking at a gate is a
correct outcome, not a stall.

One thing to be clear about up front: **gate 2 does not gate the creation of components.** The
component pass writes them into Figma at the end of phase 2, before any human has approved anything
about the build. Gate 2 governs whether those components may be **used** — it blocks page assembly
until a person has inspected them as live nodes, and `--changes-requested` sends the component pass
back to correct writes that already happened.

## How to Use the Skills

These skills are designed to guide Claude through structured tasks. You have two ways to use them:

### Option 1: Use Individual Skills via Claude Code

When working in Claude Code, you can invoke each skill by reading its documentation and asking Claude to follow it:

```
Read .claude/skills/prd-analyzer/SKILL.md and help me extract requirements from my PRD file at /path/to/prd.pdf
```

Each skill is documented in:
```
.claude/skills/
├── design-system-loader/SKILL.md            ← phase 0
├── figma-extractor/SKILL.md                 ← phase 0
├── prd-analyzer/SKILL.md                    ← phase 1
├── prd-design-requirements/SKILL.md         ← phase 1
├── gate-1-requirements/SKILL.md             ← ══ HUMAN GATE ══ closes phase 1
├── screen-planner/SKILL.md                  ← phase 2
├── screen-validator/SKILL.md                ← phase 2
├── component-analyzer/SKILL.md              ← phase 2
├── coverage-scorer/SKILL.md                 ← phase 2
├── coverage-reporter/SKILL.md               ← phase 2
├── figma-modifier/SKILL.md                  ← phase 2 (the build checklist)
├── gate-2-components/SKILL.md               ← ══ HUMAN GATE ══ closes phase 2
├── gate-3-pages/SKILL.md                    ← ══ HUMAN GATE ══ one per PAGE
├── developer-handoff/SKILL.md               ← phase 4
├── closure-reporter/SKILL.md                ← phase 4
├── run-prd-workflow/SKILL.md
├── evaluate-design-system/SKILL.md          ← standalone
└── requirements-to-prototype/SKILL.md       ← standalone
```

`/figma-component-pass` and `/figma:figma-use` are not in that list: they are external stages with no
`SKILL.md` in this repo. `/figma:figma-use` ships with the Figma plugin, which is what the `figma:`
prefix means, and `/figma-component-pass` loads it. They are still stages of the pipeline —
`/figma-modifier` only writes build specs, and those two are what actually build them.

### Option 2: Run the Complete Workflow

To run the entire workflow end-to-end, ask Claude:

```
Read the workflow file at .claude/workflows/prd-to-figma.js and help me execute this complete PRD-to-Figma workflow with:
- Figma URL: https://www.figma.com/file/...
- PRD: /path/to/prd.pdf
- Design System: https://design-system-url
```

## Configuring and Recording the Gates

The gates are not configuration you can switch off — each is a stage in
[`.claude/pipeline.json`](.claude/pipeline.json) that the stages after it **require**, so the resolver
enforces them whether you run the whole workflow or a single skill. Their decisions are recorded with
their own commands:

```bash
node utils/pipeline.mjs status                          # where the run stands, by phase
node utils/pipeline.mjs gate 1                          # where does this gate stand?
node utils/pipeline.mjs gate 1 --approve --by "<person>" --checked all [--note "..."]
node utils/pipeline.mjs gate 2 --approve --by "<person>" --checked all
node utils/pipeline.mjs gate 2 --changes-requested --by "<person>" --note "what to fix"
node utils/pipeline.mjs gate 2 --reject --by "<person>" --note "why"

node utils/pipeline.mjs gate 3 --init                   # seed the page roster from the checklist
node utils/pipeline.mjs gate 3 --page "<name>" --approve --by "<person>" [--manually-edited]
node utils/pipeline.mjs next-page                       # the ONE page assembly may work on
node utils/pipeline.mjs pages                           # the per-page decision ledger
```

- **`done` refuses a gate.** `done` is the reflex every other skill ends with; only `gate` records a
  decision. `--by` is required, and `claude`, `ai`, `assistant`, `auto`, `self` and friends are
  rejected — a gate signed by the thing being gated is not a gate.
- **The gate opens only on `approved`.** A rejection is a perfectly well-formed record; it just
  doesn't pass. And a gate will not open while a raised decision has an empty `answer`, even after an
  explicit `--approve`.
- **Approvals go stale.** Regenerate an artifact a gate signed off and `plan` says the gate needs
  re-taking. `--force` does *not* re-open a gate.

**Every gate is asked as a POPUP, not as prose.** The AI presents the packet in chat — the requirement
list, the live component URLs, the frame and its node id — and then asks with `AskUserQuestion`. The
popup carries the verdict; the gate's checks as a **multi-select**, so what you tick is exactly what
lands in `--checked`; one question per **open decision** at gate 1; and **who is approving**, asked at
every gate and once per page at gate 3.

Two of those are worth the friction they cost. Read out as prose, five checks get answered "looks
good"; as a multi-select, the two you did not actually verify come back unticked — an honest record
and a gate that correctly stays shut. And the name is re-asked every page because a name captured once
and stamped onto nine pages records nine decisions where one was made, which is the exact failure the
per-page gate exists to prevent. The AI never supplies that name, and never carries it over.

Anything else that blocks the run is asked the same way, including an input `plan` reports `NOT SET`.

### 🚪 `/gate-1-requirements`
**══ HUMAN GATE ══ validate the requirements. Closes phase 1.**
- Presents four checks with evidence: `atomized`, `flows_broken_to_frames`, `ambiguity_flagged`,
  `prd_claims_verified` — plus the requirement list and every raised decision as a *packet*
- Nothing in phase 2 may run until it passes, enforced by the graph: `/screen-planner` requires it
- Outputs: `G1_requirements_signoff.json` (written by `pipeline.mjs gate`, not by the skill)
- **Read**: `.claude/skills/gate-1-requirements/SKILL.md`

### 🚪 `/gate-2-components`
**══ HUMAN GATE ══ validate the components as live Figma nodes. Closes phase 2.**

Not configurable, and not a skill you run to produce something. Phase 2 ends by *creating* components;
phase 3 assembles pages out of instances of them, and those fail differently, so there is a gate
between them. A component that read correctly on the build checklist can still be misnamed, missing a
variant, unbound from its tokens, or in the wrong library location once it exists as a real Figma node
— and once a page is built on top of it, that defect sits behind a screen that looks finished.

`/figma-component-pass` builds the checklist's components and writes `12a_figma_components.json`
(node ids included, so the gate can resolve them live). It requires **no** gate of its own: it runs
straight after `/figma-modifier`, so **its writes land in your Figma file before anyone reviews them.**
This gate governs their *use*, not their creation — it gates `/figma:figma-use`, so no page can be
assembled while it is open, and `--changes-requested` sends the component pass back to correct writes
that have already happened. There is no longer a gate reviewing the mapping table or the build
checklist itself.

```bash
node utils/pipeline.mjs gate 2                                          # where does it stand?
node utils/pipeline.mjs gate 2 --approve --by "<person>" --checked all
node utils/pipeline.mjs gate 2 --changes-requested --by "<person>" --note "<what to fix>"
```

Checks: `all_approved_components_present`, `live_nodes_and_variants_verified`,
`tokens_and_variables_bound`, `naming_location_and_retirement_verified`,
`no_unapproved_component_changes`. As with gate 1, `--approve` alone records the approval and leaves
the gate **shut** until every check is confirmed.

- Outputs: `G2_component_signoff.json`
- **Read**: `.claude/skills/gate-2-components/SKILL.md`

Address a gate by its `gate_id` (`1`, `2`, `3`), never by phase number.

### 🚪 `/gate-3-pages`
**══ HUMAN GATE ══ one decision PER PAGE.**
- The single hard rule of the whole pipeline: **phase 3 never advances past an unapproved page**
- `next-page` names one page and refuses to name a second while one is undecided; the gate is
  satisfied only when **every** page is approved
- The roster is seeded from the build checklist's `screens`, not from what assembly built — otherwise a
  silently dropped page would never appear as pending
- `--manually-edited` records a designer's hand edit and obliges assembly *and* phase 4 to re-inspect
  that frame live
- Outputs: `G3_page_signoffs.json`
- **Read**: `.claude/skills/gate-3-pages/SKILL.md`

## Individual Skills Reference

### 🔧 `/design-system-loader`
**Load design system components** — runs first, and once for every feature
- Supports: Figma design systems, Markdown specs, external URLs
- Extracts: Components, variants, properties, design tokens
- Outputs: Structured component library, written to `reports/_shared/`
- Loaded first because `/prd-design-requirements` marks each component existing vs. new, and cannot
  do that before the library is known. Shared rather than per-feature, and expires on its own after
  7 days since no local check can see a remote Figma edit — use `--force` to refresh sooner.
- **Read**: `.claude/skills/design-system-loader/SKILL.md`

### 📋 `/prd-analyzer` 
**Extract requirements from PRD documents**
- Supports: PDF, Word, Markdown, plain text
- Atomizes to **one discrete UI/flow need per line**; it does **not** map requirements to design
  system components — that is phase 2, and doing it here produced two competing sources of truth
- **Never trusts embedded analysis in the document.** A PRD arrived here with a pre-filled components
  section and Figma page references that were entirely fabricated, so every component name, node/page
  reference and "existing vs. new" label the PRD supplies is stripped into the required
  `unverified_prd_claims[]` for independent verification — never laundered into `requirements[]`
- **Raises** ambiguity as an `open_decisions[]` packet rather than picking an interpretation
- Outputs: Structured requirements, screens, flows, use cases, `unverified_prd_claims[]`,
  `open_decisions[]`
- **Read**: `.claude/skills/prd-analyzer/SKILL.md`

### 🎨 `/figma-extractor`
**Extract design state from Figma files**
- Extracts: Pages, frames, components, usage patterns
- Outputs: Design structure and current component library
- **Read**: `.claude/skills/figma-extractor/SKILL.md`

### 📝 `/prd-design-requirements`
**Turn the PRD into a design-ready prose reference**
- Sections: Overview, Objectives, Personas, Common/Special User Flows, Pages/Frames,
  Components per frame (each marked **existing** vs. **new**), Assembly, Open Decisions
- Inspects the design system's own pages before naming components — `search_design_system` only
  searches *published* libraries, while most in-house systems keep components on a file's own pages
- **Raises** the PRD's open decisions in §8 rather than taking them: each item gets its options, a
  **recommended** option, and the consequence of each — a decision *packet*. A human answers at
  gate 1, and gate 1 will not pass while any §8 item is unanswered.

  This is a **reversal** of how the skill used to behave, and the reason is worth knowing: it used to
  take the defensible default and record the call, because a stage that blocks on a question hangs an
  unattended run. Once a gate exists that trade-off flips — a default taken in phase 1 is a decision
  made before the person accountable for it ever saw the question. It still does not write
  `14_closure_notes.json`; `/closure-reporter` owns that ledger
- Outputs: `design_requirements.md`
- **Read**: `.claude/skills/prd-design-requirements/SKILL.md`

### 📐 `/screen-planner`
**Plan screens from PRD requirements**
- Maps requirements to UI elements
- Plans states, interactions, layouts
- Reads `design_requirements.md` as *optional* context when it exists, but derives the plans from
  `01_prd_requirements.json` regardless. The prose feeds the plans and never replaces them: the
  numbered JSON stays authoritative, because unschema'd prose cannot be machine-checked
- Outputs: Detailed screen specifications
- **Read**: `.claude/skills/screen-planner/SKILL.md`

### ✅ `/screen-validator`
**Validate screens against PRD**
- Checks requirement coverage
- Identifies missing elements
- Outputs: Validation report with recommendations
- **Read**: `.claude/skills/screen-validator/SKILL.md`

### 🔍 `/component-analyzer`
**Map every requirement onto the design system**
- Writes the **`mapping_table`: one row per atomized requirement**, each with exactly one of four
  statuses — `direct-match`, `match-with-modification`, `combinable-match`, `no-match` — and its own
  recorded `evidence`. Nothing gates this table, so a requirement missing from it will not be caught
  by a human until the components are inspected at gate 2 — and, since `/prd-auditor` was removed,
  never after that. A requirement absent from this table produces no checklist entry, no page, and so
  nothing for gate 3 to look wrong at
- A **direct match** is a claim about variants, states, icon support and content behaviour, not family
  resemblance, so it needs `evidence.variants_checked`. "It's a button" says nothing, and a match
  asserted from resemblance only surfaces as wrong during assembly — after the components were built
- A **no-match** needs its nested-children walk recorded: `evidence.method: "keyword-search-only"` is
  not evidence, because absence from a keyword search is not absence from the file
- Keeps the PRD's own "existing vs. new" claim in `prd_label_was`, beside the verified answer — those
  labels are unreliable, and trusting one would have produced duplicates of existing composites
- **Escalates** a mismatch that is really a product decision (a taxonomy or data-model conflict)
  rather than designing around it. Be aware there is no longer a gate that refuses to open while such
  an escalation is unanswered — it is carried forward and reported by `/closure-reporter`
- Also: maps component usage in screens, identifies gaps and adequacy
- Outputs: Mapping table + coverage analysis by component
- **Read**: `.claude/skills/component-analyzer/SKILL.md`

### 📊 `/coverage-scorer`
**Calculate coverage metrics**
- Scores component coverage %
- Identifies gaps by priority
- Creates implementation roadmap
- Outputs: Coverage score and gap analysis
- **Read**: `.claude/skills/coverage-scorer/SKILL.md`

### 📄 `/coverage-reporter`
**Generate comprehensive PDF report**
- Includes all findings, visuals, recommendations
- Outputs: coverage_report_[date].pdf
- **Read**: `.claude/skills/coverage-reporter/SKILL.md`

### 🚀 `/figma-modifier`
**Spec the missing components — and the screens they assemble into. THE BUILD CHECKLIST.**
- Specs missing components, in the design system's own idiom
- Specs the **screens** those components assemble into; components are not the deliverable, screens are.
  `screens` is required even when `components` is legitimately empty
- Gap resolution runs **extend ▶ combine ▶ net-new**, and `resolution_path` records which. Prefer
  slot-based, system-wide reusable architecture; module-specific is a last resort you justify in
  `scope_rationale`. Earlier naming and retirement decisions hold
- Writes specs only: `/figma-modifier` itself puts nothing into Figma. The component pass immediately
  after it does, and no gate stands between the two
- Outputs: `11_build_phase.json` — the checklist the component pass executes (`components` **and**
  `screens`)
- **Read**: `.claude/skills/figma-modifier/SKILL.md`

### 🏗 `/figma-component-pass`
**Build the checklist's components in Figma** (external stage; loads `/figma:figma-use`) — **ungated**
- Requires only `/figma-modifier`. There is no gate before it, so its writes reach your Figma file
  before any human has reviewed them
- The approved components → real nodes, then **STOP**: no page is assembled in this pass
- **Binds tokens**, never hardcoding where a token exists
- Outputs: `12a_figma_components.json`, with node ids so gate 2 can resolve each component live —
  write it yourself, the external skill will not, and then run
  `node utils/pipeline.mjs done figma-component-pass`

### 🏗 `/figma:figma-use`
**Assemble the screens in Figma** (external skill, from the Figma plugin) — **behind gate 2**
- Requires `gate-2-components` in the graph, so the resolver refuses to assemble a page while that
  gate is open
- **ONE page at a time**: each element placed as an *instance* of its named component, then **stop**
  and present that page to gate 3. `node utils/pipeline.mjs next-page` names the page it may work on
  and refuses to name a second while one is undecided
- The order is forced, not stylistic: a page places instances, so the component pass must have made
  them real. A screen whose component failed is reported **blocked** (`failed`, `kind: "screen"`),
  never assembled around the hole
- **Only checklist components.** A gap the checklist missed goes in `discovered_gaps` as a *stop* —
  an improvised component is indistinguishable from a specified one once it is in the file
- **Binds tokens**, never hardcoding where a token exists (`tokens_applied` is what gate 3 checks)
- Outputs: `12_figma_build.json`, written **incrementally** (after the component pass, then after each
  page) with `pages_remaining` — write it yourself, the external skill will not, and then run
  `node utils/pipeline.mjs done figma-use`

### 📦 `/developer-handoff`
**Package the approved module for engineering** — phase 4, and what developers actually build from
- One spec per **gate-3-approved** page: layout as built, design token/variable values, component
  props and variants used, interaction states, responsive breakpoints, and edge cases
- A **change-log** of every component created or modified during assembly, however small it felt at
  the time — a variant added mid-assembly and left out is invisible technical debt
- Cross-linked to the **live** Figma frames rather than pasted as static copies, and every component
  and token name re-verified at write time (`verification.unresolved` lists any that could not be).
  Gate 3 permits hand edits, so the frame being specced is routinely not the one assembly last saw
- Behaviour approved *visually* but never specified — empty, error, overflow — is called out
  explicitly. Approval on sight is not a specification
- No implementation guidance the design system's own conventions or Code Connect mappings don't back:
  a plausible invented CSS approach reads exactly like a documented one and gets built
- Requires `gate-3-pages` **hard**: a spec for a module whose pages were never all approved presents
  unapproved work as shippable. **Terminal** — an issue surfaced afterwards re-enters through phase 1
  or 2, never by quietly redoing assembly
- Outputs: `handoff_[date].md` + `15_developer_handoff.json`
- **Read**: `.claude/skills/developer-handoff/SKILL.md`

### 📄 `/closure-reporter`
**Close the run**
- Records what was created, what remains uncovered and why
- Records every open decision with **the answer a person gave at a gate**, who gave it, the
  `recommended` option it was chosen from, the rationale, and `reversible_by`
- Builds `open_decisions[]` **from the gate signoff records**, not by re-deriving them from the PRD:
  re-deriving yields a list of what the workflow *should* have decided, which reads identically to the
  truth and is wrong wherever the human chose against the recommendation. `01_prd_requirements.json`
  is read to catch **omissions** — a PRD decision in no gate record was answered by nobody
- Also reports **how the gates went**: verdict, who decided, how many rounds, what each
  `changes_requested` sent back
- Runs regardless of how the run ended — including the 5-iteration cap hit with `converged: false`, a
  module parked at gate 2, and a run abandoned at gate 1. Hence every one of its dependencies being
  optional. An exhausted loop presented as a finished one is the worst possible output, and **an open
  gate is a legitimate closure outcome**: report it as *parked*, because "complete" is not available
  while a gate is open
- Outputs: `closure_report_[date].pdf` + decision ledger
- **Read**: `.claude/skills/closure-reporter/SKILL.md`

### 🔄 `/run-prd-workflow`
**Run the complete workflow — halting at each gate**
- Orchestrates all skills in dependency order across the four phases, **stops at gate 1, gate 2 and
  after every assembled page**, and iterates re-spec → component pass → gate 2 → assemble → gate 3 →
  audit while gaps remain (max 5 iterations)
- When `plan` prints a `STOP — HUMAN GATE` box, that is the whole instruction: load the gate's skill,
  build the packet, present it, ask, and wait. Everything downstream is marked `blocked`
- Outputs: PDF reports + developer handoff + Figma updates + JSON data + gate signoffs
- **Read**: `.claude/skills/run-prd-workflow/SKILL.md`

---

## Standalone Skills

These two are in the dependency graph but outside the run: nothing depends on either, and
`/run-prd-workflow` invokes neither. Run them directly when you want them.

### 🏅 `/evaluate-design-system`
**Grade the design system library itself**
- Judges the *library*, not a feature: focus states, spacing scale, contrast, composable primitives
- That answer is the same for every PRD, so it is shared — it depends on `/design-system-loader`
  alone and caches beside the library it grades
- Its component specs describe what the **library** lacks, not what a given PRD is missing
- **Read**: `.claude/skills/evaluate-design-system/SKILL.md`

### 🖥 `/requirements-to-prototype`
**Turn `design_requirements.md` into one interactive prototype**
- Every listed Page/Frame becomes a **state** of a single `.dc.html` Design Component, never a
  separate file; the personas table becomes a role switcher driving `can*` permission booleans
- Standalone for two independent reasons: it is a **parallel deliverable to the Figma build, not a
  step in it** (it does no Figma writes, and gate 3 signs off Figma frames rather than the
  prototype); and it needs `dc_write` and `ready_for_verification`, which exist only where Design
  Component tooling does — as a non-standalone stage a missing tool would fail every run, on a
  deliverable that run never asked for
- It does still require **gate 1**: a prototype is a thing people look at and form opinions from, so
  building one from unvalidated requirements propagates that reading further and faster than any JSON
  artifact would. Gate 2 is not required — it approves a Figma build checklist, and this does no
  Figma writes
- Outputs: `prototype_[date].dc.html`
- **Read**: `.claude/skills/requirements-to-prototype/SKILL.md`

---

## Quick Start Using Skills

### Step 1: Setup
```bash
cp .env.example .env
# Edit .env and add FIGMA_API_TOKEN
```

### Step 2: Use Skills in Claude Code

**To run the complete workflow:**
```
I have a PRD at /path/to/prd.pdf and a Figma file at https://www.figma.com/file/...
My design system is at https://design-system-url

Read .claude/skills/run-prd-workflow/SKILL.md and help me execute this workflow.
```

**To use individual skills:**

Extract PRD:
```
Read .claude/skills/prd-analyzer/SKILL.md and extract requirements from /path/to/prd.pdf
```

Analyze Figma:
```
Read .claude/skills/figma-extractor/SKILL.md and extract the design from https://www.figma.com/file/...
```

Score Coverage:
```
Read .claude/skills/coverage-scorer/SKILL.md and calculate coverage for my design system
```

Generate Report:
```
Read .claude/skills/coverage-reporter/SKILL.md and create a comprehensive PDF report
```

---

## Workflow Execution Flow

When you ask Claude to execute the workflow:

```
User Input
    ↓
Claude reads workflow file (.claude/workflows/prd-to-figma.js)
    ↓
Claude executes the phases in dependency order:
    ├─ PHASE 0 · INSPECT: Load Design System (shared), read the live Figma file
    ├─ PHASE 1 · EXTRACT: Atomize the PRD, quarantine its claims, RAISE decisions,
    │                     write design_requirements.md
    │
    ├─ ══ GATE 1 (HUMAN) ══  STOP AND WAIT
    │     ├─ approve            ──▶ phase 2
    │     └─ changes_requested  ──▶ back to phase 1
    │
    ├─ PHASE 2 · MAP, then BUILD THE COMPONENTS:
    │     ├─ Create & validate screen plans
    │     ├─ Map every requirement (four statuses + evidence)
    │     ├─ Calculate coverage %
    │     ├─ Generate coverage PDF
    │     ├─ Spec the BUILD CHECKLIST: components AND screens  (no Figma writes)
    │     └─ COMPONENT PASS: write the components into Figma, then stop
    │          ↑ no gate stands here — these writes are not reviewed first
    │
    ├─ ══ GATE 2 (HUMAN) ══  STOP AND WAIT  ← the components, as LIVE NODES
    │     ├─ approve            ──▶ phase 3 may assemble
    │     └─ changes_requested  ──▶ back to the component pass, to correct
    │                               writes that already happened
    │
    ├─ PHASE 3 · ASSEMBLE: ONE page, then stop
    │     │
    │     ├─ ══ GATE 3 (HUMAN), PER PAGE ══  STOP AND WAIT
    │     │     ├─ approve            ──▶ next page (if any)
    │     │     └─ changes_requested  ──▶ the SAME page, reassembled
    │     │
    │     └─ AUDIT: check the built file against the PRD
    │           └─ gaps_found ──▶ back to PHASE 2, THROUGH GATE 2 (max 5 iterations)
    │
    └─ PHASE 4 · HAND OFF: developer handoff, then closure PDF + decision ledger
    ↓
Outputs generated:
    ├─ design_requirements.md
    ├─ coverage_report_[date].pdf
    ├─ G1_requirements_signoff.json
    ├─ G2_component_signoff.json
    ├─ G3_page_signoffs.json
    ├─ 03_screen_plans.json
    ├─ 06_component_analysis.json   (incl. the mapping_table)
    ├─ 09_gap_analysis.json
    ├─ 10_roadmap.json
    ├─ 11_build_phase.json          (the build checklist)
    ├─ 12a_figma_components.json    (the components as live nodes)
    ├─ 12_figma_build.json          (written incrementally)
    ├─ 15_developer_handoff.json + handoff_[date].md
    ├─ closure_report_[date].pdf
    └─ 14_closure_notes.json
```

**A gate is a stage in the graph, not a paragraph in the orchestrator.** That is what makes it
unavoidable: `/screen-planner` requires gate 1, `/figma:figma-use` requires gate 2, and
`/developer-handoff` requires gate 3 — so a gate applies to a directly-invoked skill exactly as it
does to the full run, which is most of how these skills actually get used. `/figma-component-pass`
requires no gate, which is exactly why its writes are unreviewed.

The run ends when every page has cleared **gate 3**. Know what that does not establish. Every stage
before it measures *intent* — it scores the screen plans against the library, and can report a feature
fully covered while the Figma file contains something else. `/figma:figma-use` reports what it
*believes* it built. There was a `/prd-auditor` stage that read the **PRD itself** against the live
file at full depth afterwards; it has been removed, along with its artifact and its loop back through
gate 2.

So gate 3 is the last look, and it asks a narrower question: does *this page* look right to a person.
A page can be approved on sight and still be missing a state the PRD named, and a requirement that
never reached the checklist produces no page to approve or reject at all. "Every page approved" is a
true statement about the pages; it is not a statement about the PRD.

---

## Expected Outputs

### Coverage Report PDF
```
📄 coverage_report_2024-08-31.pdf

Sections:
├─ Executive Summary
│   └─ Coverage Score: 78.5%
├─ Requirements Checklist
│   └─ All PRD requirements mapped to screens
├─ Screen Plan Details
│   └─ Detailed specifications per screen
├─ Component Coverage Matrix
│   └─ Which components cover which requirements
├─ Gap Analysis
│   ├─ Critical gaps (red)
│   ├─ High priority (orange)
│   └─ Low priority (yellow)
├─ Missing Components
│   └─ Detailed specs for new components needed
├─ Implementation Roadmap
│   ├─ Phase 1: Critical (2-3 weeks)
│   ├─ Phase 2: High Priority (1-2 weeks)
│   └─ Phase 3: Low Priority (1 week)
└─ Recommendations
    └─ Prioritized action items
```

### Design Requirements Document
```
📝 design_requirements.md

Sections:
├─ 1. Overview
├─ 2. Objectives
├─ 3. Target Users / Personas
├─ 4. User Flows
│   ├─ Common Flows (persona-agnostic, one arrow chain each)
│   └─ Special Flows (grouped by persona, only what differs)
├─ 5. Pages / Frames
├─ 6. Components per Page/Frame
│   └─ Each marked existing (with page name) or new
├─ 7. Assembly
└─ 8. Open Decisions  — RAISED, not taken
    ├─ Resolved upstream
    ├─ Raised here: options, a RECOMMENDED option, the consequence of each
    │   (a human answers at gate 1; the gate won't pass while one is unanswered)
    └─ Needs a human in the editor
```

### Gate Signoffs
```
✍️ G1_requirements_signoff.json
├─ verdict: approved | changes_requested | rejected
├─ decided_by / decided_at  (a person — never the AI)
├─ checked: atomized, flows_broken_to_frames, ambiguity_flagged,
│           prd_claims_verified
├─ decisions[]: each with the ANSWER given, beside the recommendation
└─ history[]: every round — a gate that bounced twice is a different fact

✍️ G2_mapping_signoff.json
├─ The same, for the mapping and the build checklist
├─ checklist_ref + checklist_fingerprint (a rewritten checklist invalidates it)
└─ iteration — an answer given during a later audit pass is distinguishable

✍️ G3_page_signoffs.json
├─ pages[]: one entry per page, in checklist order
├─ status per page: pending | approved | changes_requested | rejected
├─ manually_edited, iterations, node_id
└─ verdict: approved only when EVERY page is approved
```

### Figma Updates
```
✓ Components created in Figma — from the GATE-2-APPROVED checklist only
├─ DatePicker
├─ FileUpload
└─ CustomChart

✓ Screens assembled from instances of those components — ONE PAGE AT A TIME,
  each approved at gate 3 before the next was touched
✓ Design tokens bound, not hardcoded
✓ Component documentation added
✓ discovered_gaps: anything gate 2 missed, recorded as a STOP rather than
  improvised around
```

### Developer Handoff
```
📦 handoff_2024-08-31.md  +  15_developer_handoff.json

Per gate-3-approved page:
├─ Layout as built (auto-layout direction, spacing, constraints)
├─ Design tokens / variables bound, by name
├─ Component props and variants used
├─ Interaction states
├─ Responsive breakpoints
└─ Edge cases, explicitly — empty, error, overflow

Plus:
├─ change_log: every component created or modified during assembly
├─ Links to the LIVE Figma frames, not pasted copies
└─ verification.unresolved: any name that could not be re-verified
```

### Closure Report PDF
```
📄 closure_report_2024-08-31.pdf

├─ What was created from scratch
├─ What remains uncovered, and why
├─ Blocked items (needs a human in the Figma editor)
├─ Every open decision, with the ANSWER given at a gate, by whom, and reversible_by
├─ How the gates went: verdict, rounds, what each bounce sent back
└─ Or: PARKED at gate N, waiting on X — a legitimate outcome, not a failure
```

### JSON Data Files
```
03_screen_plans.json
├─ Detailed screen specifications
├─ Required elements per screen
└─ User flows and interactions

09_gap_analysis.json
├─ Missing components
├─ Needed extensions
└─ Priority levels

10_roadmap.json
├─ Implementation order
├─ Effort estimates
└─ Dependencies

06_component_analysis.json
├─ mapping_table: one row per requirement
├─ match_status: direct-match / match-with-modification /
│                combinable-match / no-match
└─ evidence per row (variants checked, or the nested-children walk)

11_build_phase.json
├─ figma_modifications.components — what to build
├─ screens — what those components assemble into (required)
└─ The artifact gate 2 signs off

12_figma_build.json    ← written INCREMENTALLY, not at the end
├─ built (component pass)
├─ screens_built (one page at a time)
├─ pages_remaining
├─ discovered_gaps — anything gate 2 missed
└─ Failed / blocked, with reasons

├─ Verdict: covered / gaps_found / blocked
├─ Actionable gaps
└─ Blocked items (open decisions, editor-only work — kept OUT of gaps so
   they don't consume every iteration and then report failure)
```

### Interactive Prototype (standalone stage)
```
🖥 prototype_2024-08-31.dc.html

├─ One Design Component, not one file per frame
├─ Every page/frame from §5 is a state
├─ Role switcher built from the §3 personas table
└─ Every arrow in a Common Flow is a real interaction
```

---

## Example Usage

### Full Workflow Example

```
I want to validate my SaaS dashboard PRD against our design system.

Here are my inputs:
- Figma file: https://www.figma.com/file/abc123/SaaS-Dashboard
- PRD: /Users/mahmoud/projects/prd.pdf
- Design system: https://www.figma.com/file/xyz789/Design-System

Read .claude/skills/run-prd-workflow/SKILL.md and execute this complete workflow. 
When done, show me:
1. The coverage score percentage
2. Critical gaps that need components
3. The implementation roadmap
```

Expect it to come back to you three times: once with the requirements packet (gate 1), once with the
mapping and build checklist (gate 2), and once per assembled page (gate 3). Nothing is written into
the Figma file before you approve gate 2.

### Targeted Analysis Example

```
I just updated my design system. Can you check how much of my PRD it covers now?

1. Read .claude/skills/design-system-loader/SKILL.md and reload my design system from https://design-system-url
2. Read .claude/skills/prd-analyzer/SKILL.md and extract requirements from /path/to/prd.pdf
3. Read .claude/skills/prd-design-requirements/SKILL.md and write the design requirements doc
4. Read .claude/skills/gate-1-requirements/SKILL.md and present the requirements for my sign-off
5. Read .claude/skills/screen-planner/SKILL.md and plan the screens
6. Read .claude/skills/component-analyzer/SKILL.md and analyze coverage
7. Read .claude/skills/coverage-scorer/SKILL.md and calculate the new coverage percentage
```

Each skill resolves its own prerequisites first (`node utils/pipeline.mjs plan <skill>`), so you can
also just invoke the last one and let the chain fill itself in — **including the gate**. Step 4 is not
optional politeness: `/screen-planner` requires it in the graph and the resolver will refuse to treat
phase 2 as runnable until the gate's verdict is `approved`.

### Prototype Example

```
Read .claude/skills/requirements-to-prototype/SKILL.md and turn my design requirements into a
clickable prototype. I want to be able to switch roles and see the permissions change.
```

Standalone — it is not part of `/run-prd-workflow`, and it needs an environment with Design Component
tooling (`dc_write`, `ready_for_verification`).

---

## Tips for Success

✅ **Be specific with inputs**
- Full Figma URLs (including file ID)
- Complete file paths or URLs for PRDs
- Clear design system references

✅ **Start simple**
- Try one skill at a time first
- Test with sample files in `examples/`
- Build confidence before running full workflow

✅ **Review outputs carefully**
- Read the PDF report completely
- Understand the gap analysis
- Prioritize missing components

✅ **Take the gates seriously — they are the workflow, not overhead**
- Read the packet, not the summary of the packet
- Answer every raised decision: the gate will not open while one is unanswered
- `--by` should be whoever is actually accountable for the decision; it goes in the closure report
- Reviewing one page at a time feels slow and is the point — an improvised component is
  indistinguishable from an approved one once it's in the file

✅ **Iterate and improve**
- Update design system based on gaps
- Re-run workflow to see improvements
- Track coverage over time

---

## File Structure

```
prd-to-ui-workflow/
├── .claude/
│   ├── pipeline.json           ← Dependency graph
│   ├── schemas/
│   │   └── artifacts.json      ← Enforced artifact contract
│   ├── skills/                 ← Read SKILL.md from each
│   │   ├── design-system-loader/
│   │   ├── figma-extractor/
│   │   ├── prd-analyzer/
│   │   ├── prd-design-requirements/
│   │   ├── gate-1-requirements/         ← ══ HUMAN GATE ══
│   │   ├── screen-planner/
│   │   ├── screen-validator/
│   │   ├── component-analyzer/
│   │   ├── coverage-scorer/
│   │   ├── coverage-reporter/
│   │   ├── figma-modifier/
│   │   ├── gate-2-mapping/              ← ══ HUMAN GATE ══
│   │   ├── gate-3-pages/                ← ══ HUMAN GATE ══ per page
│   │   ├── developer-handoff/
│   │   ├── closure-reporter/
│   │   ├── run-prd-workflow/
│   │   ├── evaluate-design-system/      ← standalone
│   │   └── requirements-to-prototype/   ← standalone
│   └── workflows/
│       └── prd-to-figma.js     ← Complete workflow
│
├── utils/
│   └── pipeline.mjs            ← Resolver: plan / status / validate / done
│                                  + gate / next-page / pages
│
├── prds/                       ← Input PRDs (a pasted PRD is saved here first)
│
├── examples/                   ← Sample files to learn with
│   ├── sample-prd.md
│   └── sample-design-system.md
│
├── reports/                    ← Output only, one folder per feature
│   ├── _shared/                ← design system + its evaluation
│   └── <feature>/              ← 01 … 15, G1/G2/G3 signoffs,
│                                  design_requirements.md, PDFs, handoff, prototype
│
├── README.md                   ← Full documentation
├── QUICKSTART.md               ← 5-minute guide
├── SETUP_SKILLS.md             ← This file
└── .env.example                ← Config template
```

---

## Next Steps

1. **Setup** - Copy `.env.example` to `.env` and add your Figma API token
2. **Explore** - Read skill files to understand each step, and the three gate skills first
3. **Test** - Try with sample files in `examples/`
4. **Execute** - Run with your actual PRD and Figma file
5. **Decide** - Answer the gate packets; `node utils/pipeline.mjs status` shows where you are
6. **Review** - Analyze the generated PDF report and the developer handoff
7. **Iterate** - Update designs and re-run workflow (an edited PRD re-opens gate 1 on its own)

---

## Support

- 📖 See [README.md](README.md) for complete documentation
- ⚡ See [QUICKSTART.md](QUICKSTART.md) for quick start guide  
- 📋 See individual `.claude/skills/*/SKILL.md` for skill-specific docs
- 📁 See `examples/` for sample PRD and design system

**Need help?** Ask Claude to read the skill documentation and guide you through each step!
