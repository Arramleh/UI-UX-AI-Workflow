# PRD-to-UI Workflow

PRD to developer handoff: **four AI phases, and three human validation gates hold them apart.**
It maps every PRD requirement onto your design system, builds the missing pieces in Figma one page at a
time, and packages the approved module for engineering.

> ⚠️ **This workflow is not unattended, and that is deliberate.** It stops at gate 1, at gate 2, and
> after **every single assembled page**, and waits for a person. **Parking at a gate is a correct
> outcome, not a stall.**
>
> ⚠️ **Be clear about what gate 2 does and does not stop.** The component pass writes components into
> your Figma file *before* any human has approved anything about the build. Nothing gates the
> **creation** of components. Gate 2 governs whether they may be **used**: it blocks page assembly
> until a person has inspected the components as live nodes. `--changes-requested` at gate 2 sends the
> component pass back to correct writes that have already landed in the file.

## Quick Start

### 1. Setup

```bash
# Copy environment template
cp .env.example .env

# Add your API tokens:
# - FIGMA_API_TOKEN: Get from https://www.figma.com/developers
# - DESIGN_SYSTEM_URL: URL to your design system
```

### 2. Run the Complete Workflow

Ask Claude to execute the workflow by asking it to read and follow the skill documentation:

```
I have a PRD at /path/to/prd.pdf and Figma file at https://www.figma.com/file/...
My design system is at https://design-system-url

Read .claude/skills/run-prd-workflow/SKILL.md and execute this workflow.
```

Or use individual skills:

```
Read .claude/skills/prd-analyzer/SKILL.md and extract requirements from my PRD
```

**See [SETUP_SKILLS.md](SETUP_SKILLS.md) for detailed instructions on using each skill.**

### 3. Expect to be Asked

The run will halt and present you a **gate packet** three times. The packet — links, node IDs,
failures, deviations — goes in the chat; the **decision is asked as a popup question**, via
`AskUserQuestion`, not as prose you reply to. That is not cosmetic: a gate answered in free text is a
gate answered by whoever paraphrases the reply into a command, and that is Claude. A popup returns
your own selections, and an unanswered question is visibly unanswered rather than quietly dropped from
paragraph four of a packet.

Every gate popup carries:

- **the verdict** — approve / request changes / reject;
- **that gate's declared checks** as a multi-select, nothing pre-selected — what you tick is exactly
  what goes into `--checked` (gates 1 and 2; gate 3 declares no checks);
- **one question per open decision** at gate 1, with the recommended option labelled and each option's
  consequence spelled out;
- **who is approving** — asked at *every* gate, and again for **every page** at gate 3. Never carried
  over from the previous page, never taken from the git author or the session, never supplied by
  Claude. That name is what goes into `--by`.

Inputs the resolver reports as `NOT SET` are asked the same way.

```bash
node utils/pipeline.mjs status                    # where this feature stands, by phase
node utils/pipeline.mjs gate 1                    # where does gate 1 stand?
node utils/pipeline.mjs gate 1 --approve --by "Dana R." --checked all --note "atomization looks right"
```

`--by` is required, and the obvious self-approval values (`claude`, `ai`, `auto`, `self`, …) are
refused: a gate signed by the thing being gated is not a gate. `--checked` is required in practice too
— an approval without it is recorded and the gate stays **closed**, because gates 1 and 2 open only
once every check they declare is confirmed. See [Human Gates](#human-gates-the-three-stops) below.

### 4. Review Results

- **Design Requirements**: `design_requirements.md` — personas, flows, frames and components
- **Coverage PDF**: Detailed analysis of what's missing/needed
- **Figma Components & Screens**: Components created from the build checklist and then reviewed as
  live nodes at **gate 2**, and the screens assembled from them — one page at a time, each approved at
  gate 3 before the next starts
- **Screen Plans**: Validated screen specifications
- **Developer Handoff**: `handoff_[date].md` + `15_developer_handoff.json` — per-page specs and a
  change-log of every component created during assembly
- **Closure PDF**: What was added, what is still missing, and the option a person chose at a gate on
  each open decision
- **Recommendations**: Prioritized implementation roadmap

---

## Individual Skills

Run specific skills for targeted analysis:

### Phase 0 — Live Inspection
```
/design-system-loader  # Load design system components (shared across features)
/figma-extractor       # Extract screens from Figma
```

### Phase 1 — Requirement Extraction
```
/prd-analyzer             # Atomize the PRD; quarantine its own claims; RAISE open decisions
/prd-design-requirements  # Turn the PRD into a design-ready prose reference
```

### ══ GATE 1 (HUMAN) ══
```
/gate-1-requirements   # Present the requirements, ask, record the person's decision
```

### Phase 2 — Design System Mapping, then the Component Pass
```
/screen-planner        # Plan screens from the gate-1-approved requirements
/screen-validator      # Validate plans against PRD
/component-analyzer    # Map every requirement: direct / modify / combine / no match
/coverage-scorer       # Calculate coverage metrics
/coverage-reporter     # Generate detailed PDF report
/figma-modifier        # Spec the missing components AND the screens — the BUILD CHECKLIST
/figma-component-pass  # External (loads /figma:figma-use) — WRITES the components, then STOP
```

### ══ GATE 2 (HUMAN) ══
```
/gate-2-components     # Inspect the components as live Figma NODES; blocks page assembly
```

### Phase 3 — Screen Assembly, ONE PAGE AT A TIME
```
/figma:figma-use       # External (Figma plugin) — ONE page, then stop
/gate-3-pages          # ══ HUMAN GATE ══ one decision PER PAGE — and the LAST look at the build
```

### Phase 4 — Handoff
```
/developer-handoff     # Per-page specs: layout, tokens, props/variants, states, breakpoints,
                       #   edge cases, plus a change-log cross-linked to the live Figma frames
/closure-reporter      # Final PDF: what was added, what is missing, which decisions were taken
```

### Standalone Skills

Not part of `/run-prd-workflow` — nothing depends on them, and you invoke them directly:

```
/evaluate-design-system     # Grade the design system library itself, as a UI/UX expert
/requirements-to-prototype  # Turn design_requirements.md into one interactive .dc.html prototype
```

---

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRD-TO-FIGMA WORKFLOW                        │
└─────────────────────────────────────────────────────────────────┘

INPUT:
├─ Figma URL
├─ PRD (PDF, Word, Markdown, Text)
└─ Design System Reference URL

PHASE 0: LIVE INSPECTION
├─ design-system-loader  → Load component library (shared across features)
└─ figma-extractor       → Extract current design

PHASE 1: REQUIREMENT EXTRACTION
├─ prd-analyzer          → Atomize the PRD, quarantine its claims, RAISE decisions
└─ prd-design-requirements → Design-ready prose: personas, flows,
                             pages/frames, components existing vs. new
        │
════════ GATE 1 (HUMAN) ════════  gate-1-requirements
        │                          changes_requested ──▶ back to PHASE 1
        │ approved
PHASE 2: DESIGN SYSTEM MAPPING, THEN THE COMPONENT PASS
├─ screen-planner        → Create screen specifications
├─ screen-validator      → Validate against requirements
├─ component-analyzer    → Map each requirement: direct / modify / combine / no match
├─ coverage-scorer       → Calculate coverage %
├─ coverage-reporter     → Generate detailed PDF
├─ figma-modifier        → THE BUILD CHECKLIST: missing components + the screens
│                          they assemble into  (specs only — no Figma writes)
└─ figma-component-pass  → WRITES the components/variants into Figma, then STOPS
                           [no gate before this — the writes land unreviewed]
        │
════════ GATE 2 (HUMAN) ════════  gate-2-components — the components as live NODES
        │                          changes_requested ──▶ back to the component pass,
        │                            to correct writes that already happened
        │ approved components      [does not gate creation; it gates USE — no page
        │                           may be assembled until this verdict is approved]
PHASE 3: SCREEN ASSEMBLY — ONE PAGE AT A TIME
└─ figma:figma-use       → ONE page of named instances, then stop
        │
════════ GATE 3 (HUMAN) ════════  gate-3-pages — one decision PER PAGE
        │                          changes_requested ──▶ same page, reassembled
        │ approve ──▶ more pages? ──yes──▶ next page
        │ no — every page approved, and phase 3 ENDS here
        │                          [this is the LAST comparison anyone makes between
        │                           the PRD and the built file — nothing downstream
        │                           re-reads the module]
PHASE 4: HANDOFF
├─ developer-handoff     → Per-page specs + change-log, cross-linked to live Figma
└─ closure-reporter      → Final PDF: what was added, what is still missing,
                           and the option a person chose at a gate on each decision

OUTPUT:
├─ coverage_report_[date].pdf
├─ handoff_[date].md
├─ closure_report_[date].pdf
├─ design_requirements.md
├─ Screen plans (JSON)
├─ Gate signoffs: G1 / G2 / G3 (JSON)
├─ Gap analysis and build log (JSON)
└─ Implementation recommendations

STANDALONE (invoke directly — not run by /run-prd-workflow):
├─ evaluate-design-system    → Grade the design system library
└─ requirements-to-prototype → One interactive .dc.html prototype
```

---

## Human Gates: the three stops

A gate is a **stage in the dependency graph**, not a paragraph in the orchestrator — so it applies
whether you run `/run-prd-workflow` or invoke a single skill directly. `/screen-planner` *requires*
gate 1, `/figma:figma-use` requires gate 2, and `/developer-handoff` requires gate 3.
`/figma-component-pass` requires **no** gate: it runs straight after `/figma-modifier`.

| Gate | Closes | Question it asks | Blocks |
|------|--------|------------------|--------|
| **1** `/gate-1-requirements` | Phase 1 | Is the requirement list complete, correctly atomized, free of unresolved ambiguity? | all of phase 2 |
| **2** `/gate-2-components` | Phase 2 | Do the components that were just written actually exist, correctly, as live Figma nodes? | **all page assembly** — not the component writes, which already happened |
| **3** `/gate-3-pages` | Phase 3 | Does *this page*, exactly as built, match the approved checklist? (one decision **per page**) | all of phase 4 |

**Gate 3 is now the only comparison between the PRD and what was actually built.** There used to be a
`/prd-auditor` stage after it that re-read the live Figma file at full depth against the PRD and
looped back through gate 2 while gaps remained. It is gone, and so is the loop. What replaces it is a
person looking at one frame at a time — a human judgement about the page in front of them, not a
machine read of the whole module. Two consequences, worth knowing before you rely on this:

- **Nothing re-reads the module after the last page is approved.** A page can be approved on sight and
  still be missing a state the PRD named, and no stage downstream will say so.
- **A requirement dropped in phase 2 has nothing left to catch it.** Every stage before assembly
  measures *intent* — it scores the screen plans, not the file — so a requirement the plans never
  captured is invisible to all of them, and gate 3 only ever asks about the pages the checklist named.
  If it never became a page, nobody is asked about it.

There is **no gate on the mapping table or the build checklist.** `/component-analyzer` and
`/figma-modifier` run, the component pass executes what they specify, and the first human decision
about any of it comes at gate 2, looking at the result. One consequence to be aware of: a product-level
ambiguity `/component-analyzer` escalates no longer has a gate that refuses to open while it is
unanswered — it is carried forward and reported by `/closure-reporter`.

### Recording a decision

The gate skills **ask with `AskUserQuestion`** — a popup, not prose in chat — and record only what
came back: the verdict, the checks you ticked, the answer to each open decision, and the name you gave
for `--by`. The name is asked at every gate and re-asked for every page at gate 3, because a name
captured once and stamped onto pages 2 through 9 records nine decisions where one was made.

`done` is what every *other* skill ends with. It **refuses** a gate — only `gate` records one:

```bash
node utils/pipeline.mjs gate 1                      # where does this gate stand?
node utils/pipeline.mjs gate 1 --approve --by "Dana R." --checked all --note "..."
node utils/pipeline.mjs gate 2 --approve --by "Dana R." --checked all
node utils/pipeline.mjs gate 2 --changes-requested --by "Dana R." --note "what to fix in the components"
node utils/pipeline.mjs gate 1 --reject --by "Dana R." --note "why"

node utils/pipeline.mjs gate 3 --init               # seed the page roster from the checklist
node utils/pipeline.mjs next-page                   # the ONE page assembly may work on
node utils/pipeline.mjs gate 3 --page "Inbox" --approve --by "Dana R." [--manually-edited]
node utils/pipeline.mjs pages                       # the per-page decision ledger
```

Four things worth knowing before you rely on them:

- **`--by` is required**, and `claude`, `ai`, `assistant`, `auto`, `self` and friends are rejected.
- **Validating is not passing.** A rejection is a perfectly well-formed record; the gate is satisfied
  only when the recorded verdict is `approved`.
- **A gate cannot pass with an open decision unanswered.** `--approve` records, and the gate *still*
  refuses to open while any raised decision has an empty `answer` — even after an explicit approval.
- **An approval goes stale.** Regenerate an artifact a gate signed off and `plan` reports the gate as
  needing to be re-taken. `--force` does **not** re-open a gate.

### Phase 3 has the one hard rule

> **Phase 3 never advances past an unapproved page.**

`next-page` names one page, lists the rest under `NOT YET`, and refuses to name a second while one is
undecided. `--manually-edited` on a page signoff — gate 3 explicitly lets a designer hand-edit a frame
— obliges assembly *and* phase 4 to re-inspect that frame live rather than trusting a remembered one.

### Open decisions are raised, not taken

Where an earlier version of this workflow took the recommended option and moved on, **it now raises a
decision packet** — the options, a recommendation, and the consequence of each — and a **person**
answers it at gate 1. That reversal is worth understanding rather than just obeying: auto-deciding was
the right answer for an unattended run and the wrong answer once a gate exists, because a default taken
in phase 1 is a decision made before the person accountable for it ever saw the question.

`/prd-analyzer`'s `open_decisions[]`, `/prd-design-requirements` §8 and `/component-analyzer`'s
escalations therefore have no "taken" field. The gate record keeps `recommended` beside `answer`
specifically so that **a human choosing against the recommendation survives** into the closure report.

Phase 2's escalations are the exception, and it is worth stating plainly: a taxonomy or data-model
conflict `/component-analyzer` escalates has **no gate that refuses to open while it is unanswered**.
Gate 1 has already closed by then and gate 2 asks about live nodes, not about the mapping. Such an
escalation is carried into `/closure-reporter` and reported there as an open decision nobody answered.

---

## Input Formats

### PRD Sources
- **PDF**: `.pdf` files
- **Word**: `.docx` documents  
- **Markdown**: `.md` files with structured content
- **Text**: Direct paste or `.txt` files

### Design System Sources
- **Figma Design System**: Figma file with component library
- **Markdown Spec**: Design system documented in Markdown
- **External URL**: Link to design system documentation
- **JSON**: Component library as JSON structure

### Figma URL
Full Figma file URL: `https://www.figma.com/file/FILE_ID/file-name`

---

## Output Structure

### Coverage Report PDF
Includes:
- Executive Summary (overall coverage %)
- PRD Requirements Checklist
- Screen Plan Details
- Component Coverage Matrix
- Gap Analysis with Priority Matrix
- Missing Component Specifications
- Implementation Roadmap with Phases
- Design System Extension Needs

### Design Requirements Document
`design_requirements.md` — the design-ready prose reference a designer keeps open while building:
Overview, Objectives, Personas, Common/Special User Flows, Pages/Frames, Components per frame
(each marked existing vs. new), Assembly, and §8 Open Decisions — each **raised** with its options, a
recommendation and the consequence of each, for a person to answer at gate 1.

It feeds `/screen-planner` as optional context and never replaces it: the numbered JSON artifacts
stay authoritative, so where the doc and `01_prd_requirements.json` disagree, the requirements win.

### Components and Screens Created in Figma
The components are written by the component pass **before** any human has approved them; **gate 2** is
where a person inspects them as live nodes, and no screen is assembled until that verdict is
`approved`:
- New components in `/Components/[Category]/` folders — **only** those on the build checklist. A
  gap discovered mid-assembly is a *stop* recorded in `discovered_gaps`, never an improvisation
- The screens those components assemble into, built as named instances — **one page at a time**, each
  presented for its own gate-3 decision before the next page is touched
- Applied design tokens and variables, bound rather than hardcoded wherever a token exists
- Documented with specifications in notes

### Developer Handoff
`handoff_[date].md` + `15_developer_handoff.json` — what engineering actually builds from, produced
only once **every** page has cleared gate 3:
- One spec per approved page: layout, design token/variable values, component props and variants
  used, interaction states, responsive breakpoints, and edge cases
- A **change-log** of every component created or modified during assembly, however small — a variant
  added mid-assembly and left out is invisible technical debt
- Cross-linked to the **live** Figma frames rather than pasted as static copies, and every referenced
  name re-verified against the current file at write time

This phase is terminal: an issue developers surface afterwards re-enters as a new requirement through
phase 1 or 2, not by quietly redoing assembly outside the gated flow.

### Closure Report PDF
`closure_report_[date].pdf` — written on **every** outcome, including a run parked at gate 2 and a run
abandoned at gate 1: what was created from scratch, what remains uncovered and why, and every open PRD
decision with **the answer a person gave at a gate**, who gave it, and `reversible_by` — what changing
it would now cost.

Its `final_state` is `all-pages-approved`, `parked-at-gate` (with `stopped_at` naming the gate) or
`abandoned`, and it is derived from the **gate records** — principally gate 3's per-page ledger, with
`pages_pending` listing what never got a decision. There is no machine verdict about the built file to
derive it from any more.

A run parked at an open gate is a legitimate closure outcome and is reported as *parked*.
"Complete" is not an available answer while a gate is open.

### Data Outputs (JSON)
- `01_prd_requirements.json` - Extracted PRD requirements, plus the required `unverified_prd_claims[]`
  (every component/page claim the PRD made about itself, quarantined for verification) and
  `open_decisions[]`
- `02_figma_state.json` - Current Figma design state
- `03_screen_plans.json` - Detailed screen specifications
- `04_screen_validation.json` - Plans checked against requirements
- `05_design_system.json` - Component library and tokens (shared)
- `06_component_analysis.json` - The **`mapping_table`**: one row per atomized requirement, each with
  one of four statuses (`direct-match` / `match-with-modification` / `combinable-match` / `no-match`)
  and its recorded `evidence` — plus element → component bindings and gaps
- `07_coverage_scores.json` / `09_gap_analysis.json` - Coverage metrics and gaps
- `10_roadmap.json` - Implementation priorities
- `11_build_phase.json` - **The build checklist** the component pass executes: components **and**
  screens. No gate signs it off
- `12a_figma_components.json` - The components as live nodes (node ids included), so gate 2 can
  resolve them in the file
- `12_figma_build.json` - What was actually built. Written **incrementally** — after the component
  pass, then after each page — and carries `pages_remaining`
- `15_developer_handoff.json` - Per-page specs and the assembly change-log
- `14_closure_notes.json` - Decision ledger with `reversible_by`, plus `final_state`
  (`all-pages-approved` / `parked-at-gate` / `abandoned`) and the `gate_trail`

### Gate Signoffs (JSON)
Written by `pipeline.mjs gate`, never by a skill:
- `G1_requirements_signoff.json` - Verdict, who decided, `checked` booleans, and every phase-1
  decision with its `answer`; `history` keeps every round
- `G2_component_signoff.json` - The same for the components as they exist in live Figma: the five
  component checks, who decided, and every round in `history`
- `G3_page_signoffs.json` - One entry **per page**, seeded from the build checklist's `screens`

### Interactive Prototype
`prototype_[date].dc.html` — from the standalone `/requirements-to-prototype`: one Design Component in
which every page/frame from `design_requirements.md` is a **state**, not a separate file, and the
personas table becomes a role switcher driving permission booleans.

---

## Configuration

### .env File

```bash
# Required
FIGMA_API_TOKEN=your_figma_token_here

# Optional (for specific integrations)
DESIGN_SYSTEM_URL=https://your-design-system-url
OUTPUT_FOLDER=./reports
PDF_FORMAT=full|summary  # Default: full
```

### Customization

Edit skill definitions in `.claude/skills/` to customize:
- PDF report sections
- Coverage thresholds
- Component naming conventions
- Figma folder structure
- Design token mappings

---

## Common Workflows

### Validate Existing Design
```
1. /run-prd-workflow
2. Answer the gate 1 packet (approve, or send it back)
3. Review coverage_report PDF and the build checklist
4. Check missing components
5. Decide at gate 2, with the built components in front of you: approve them for
   assembly, or send the component pass back
```
Stopping after step 3 is a perfectly good use of this workflow — you can read the coverage report and
go no further. Note that if you let the run continue past `/figma-modifier`, the component pass writes
those components into Figma without waiting for you; stopping *before* it is what leaves the file
untouched.

### Update Design System
```
1. /design-system-loader "new_system_url"
2. /component-analyzer
3. /coverage-scorer
4. Review improvement in coverage %
```

### Create Single Component
```
1. /figma-modifier (specs the missing component — writes nothing to Figma)
2. /figma-component-pass (actually builds it — the REST API cannot create components)
3. /gate-2-components (a human inspects it as a live node)
4. /figma:figma-use (assembles the pages that use it — blocked until step 3 approves)
5. Apply to component library
```
Step 3 is not skippable by discipline or by `--force`: `/figma:figma-use` *requires* gate 2 in the
graph, so the resolver refuses to assemble a page while the gate is open. Step 2 has no such guard —
it runs as soon as the checklist exists.

### Iterate on PRD
```
1. Update PRD document
2. /prd-analyzer "new_prd.pdf"
3. /prd-design-requirements
4. /gate-1-requirements   ← the edited requirements need re-approving
5. /screen-planner
6. /screen-validator
7. /coverage-scorer
8. Review changes in coverage
```
An edited PRD invalidates `/prd-analyzer` and everything downstream on its own, **including the gate**:
an approval describing requirements that have since been rewritten reads as passed but is not, so
`plan` reports gate 1 as needing to be re-taken.

### Prototype the Requirements
```
1. /prd-design-requirements
2. /gate-1-requirements   ← required: a prototype propagates an unvalidated reading fast
3. /requirements-to-prototype
4. Open the .dc.html and drive it with the role switcher
```
Gate 2 is deliberately *not* required here — it approves components built in Figma, and this stage does
no Figma writes. It runs beside the Figma build rather than inside it: nothing in the build reads the
prototype, and nothing in the prototype reads the build.

### Grade the Design System
```
1. /design-system-loader
2. /evaluate-design-system
3. Review what the library lacks (not what a given PRD is missing)
```

---

## Tips & Best Practices

### PRD Writing
- Clear acceptance criteria for each requirement
- User flows and journey mappings
- Edge cases and error states
- Performance and accessibility requirements

### Screen Planning
- Map each requirement to UI elements
- Document all necessary states (loading, error, empty, etc.)
- Define user interactions clearly
- Plan for responsive behavior

### Design System Maintenance
- Keep component documentation updated
- Document all variants and properties
- Maintain design tokens consistently
- Version your design system

### Workflow Execution
- Start with a complete PRD
- Expect to be asked three times, and budget time for it — the gates are the workflow, not overhead
- Answer every raised decision packet: gate 1 will not open while one is unanswered
- Read the coverage PDF and the build checklist *before* the component pass runs — that is the last
  point at which your Figma file is still untouched
- At gate 2, open Figma. The question is about the live nodes, not about the JSON
- At gate 3, judge one page at a time and say so if a frame needs a hand edit (`--manually-edited`)
- **Read gate 3 as the last check, not as a formality.** Nothing after it re-reads the built file
  against the PRD, so a page waved through on sight is a page nobody ever checked against the
  requirement underneath it

---

## Troubleshooting

### No Components Found in Figma
- Verify Figma URL is correct
- Check FIGMA_API_TOKEN is valid
- Ensure file has components in library

### Coverage Score Too Low
- Check PRD requirements are comprehensive
- Verify design system is complete
- Look for missing states or variants
- Review gap analysis for priorities

### PDF Generation Issues
- Ensure all previous steps completed successfully
- Check output folder has write permissions
- Verify design system was properly loaded

### "No screens were assembled in Figma"
- Check `node utils/pipeline.mjs gate 2` — until that verdict is `approved`, no page can be assembled
- If it says `AWAITING`, the run is parked correctly and is waiting on you. The components themselves
  are already in the file; that is what the gate is asking you to look at

### "A gate won't open even though I approved it"
- A raised decision still has an empty `answer`. The gate names them; answer those and re-record
- Or the approval went **stale**: an artifact it signed off was regenerated. Re-take the gate
- `--force` does not re-open a gate, by design

### "`done` refused my gate"
- Correct, and deliberate. Use `node utils/pipeline.mjs gate <n> --approve --by "<person>"`
- And never on your own judgement — `--by` rejects `claude`, `ai`, `auto`, `self` and friends

### "next-page won't give me the next page"
- An earlier page is still undecided. Record its gate-3 decision first
- `node utils/pipeline.mjs pages` shows the ledger and what it is waiting on

---

## Next Steps

After completing the workflow:

1. **Review PDF Report** - Understand coverage and gaps
2. **Check the Gate Ledger** - `node utils/pipeline.mjs pages` and the G1/G2/G3 signoffs record who
   approved what, how many rounds each gate took, and which decisions were answered
3. **Hand Off** - Give engineering `handoff_[date].md`; it links to the live frames
4. **Plan Implementation** - Use roadmap to prioritize work
5. **Build Screens** - Use screen plans for implementation
6. **Update System** - Keep design system in sync

---

## Support

For issues or questions:
1. Check individual skill documentation
2. Review workflow output for errors
3. Verify API token and URLs are correct
4. Run individual skills to isolate problems

---

**Gate 2 reviews components, not a plan.** A component that read correctly on the checklist can still
be misnamed, missing a variant, unbound from its tokens, or in the wrong library location once it
exists as a real node. None of that shows up in a plan, all of it is cheap to fix before anything is
built on top of it, and once a page is assembled the defect sits behind a screen that looks finished.
So `/figma-component-pass` builds the components and stops, **`/gate-2-components`** inspects the
actual nodes, and only then does page assembly begin.

```bash
node utils/pipeline.mjs gate 2 --approve --by "<person>" --checked all
node utils/pipeline.mjs gate 2 --changes-requested --by "<person>" --note "<what to fix>"
```

Its five checks are `all_approved_components_present`, `live_nodes_and_variants_verified`,
`tokens_and_variables_bound`, `naming_location_and_retirement_verified` and
`no_unapproved_component_changes`, and it writes `G2_component_signoff.json`.

The cost of reviewing real nodes instead of a plan is that the nodes have to exist first, which means
the writes are already in your file when you are asked. `--changes-requested` sends the component pass
back to correct them; it does not undo them. A gate is addressed by its `gate_id` — `1`, `2`, `3`.
