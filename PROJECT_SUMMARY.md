# PRD-to-UI Workflow - Project Summary

## What This System Does

It takes a PRD all the way to a developer handoff package in **four AI phases**, and the first three
each end at a **human validation gate**:

**Phase 1 — requirement extraction (the PRD and nothing else — no Figma reads)**
1. 📋 **Extracts requirements** from PRD documents (PDF, Word, Markdown, text), atomized one need per
   line — and quarantines the PRD's own component/page claims for independent verification
2. 📝 **Writes design requirements** — a design-ready prose reference: personas, user flows,
   pages/frames, and the components each frame **needs**. It makes no claim about what already
   exists; that is phase 2's answer, on better evidence
3. ❓ **Raises every ambiguity as a decision packet** — options, a recommendation, the consequence of
   each. It does *not* decide

> ✍️ **GATE 1 (human)** — validate the requirements. Blocks all of phase 2.

**Phase 2 — live inspection, design system mapping, then the component build**
4. 🔍 **Loads design system** components and design tokens — once for every feature
5. 🎨 **Analyzes Figma designs** to understand current component state — **every read of the live
   file happens here, behind gate 1**
6. 📊 **Plans screens** from requirements with full specifications
7. ✅ **Validates screens** against PRD to ensure nothing is missed
8. 🔗 **Maps every requirement** onto the design system with one of four statuses — direct match,
   match with modification, combinable match, no match — each with recorded evidence. This is where
   "does it already exist?" gets answered
9. 📈 **Scores coverage** - showing how well design system meets requirements (e.g., 78.5%)
10. 📑 **Generates comprehensive PDF report** with gaps and recommendations
11. 📋 **Specs the missing components and the screens they assemble into** — the **build checklist**
12. 🏗 **Builds the specified components** in Figma — and **only** those. No gate stands in front of
    this write

> ✍️ **GATE 2 (human)** — inspect those components as live Figma **nodes**: variants, token bindings,
> naming, library location. It does not gate their creation, which has already happened; it gates
> their **use** — no page may be assembled until it passes.

**Phase 3 — screen assembly**
13. 🚀 **Assembles the screens** from instances of those components, because components are not the
    deliverable, screens are — **one page at a time**

> ✍️ **GATE 3 (human)** — one approve / edit / reject **per page**. Phase 3 never advances past an
> unapproved page, and phase 3 **ends** here.

**Phase 4 — handoff**
14. 📦 **Packages the developer handoff** — per-page specs (layout, tokens, props and variants,
    states, breakpoints, edge cases) plus a change-log of every component created during assembly,
    cross-linked to the live Figma frames
15. 📄 **Closes the run** with a report of what was added, what is still missing, and the option a
    person chose at a gate on each open decision
16. 🎯 **Provides implementation roadmap** - what to build, in what order

**This pipeline is not unattended, and that is deliberate.** It stops three times — and at gate 3,
once per page — and waits for a person. Parking at a gate is a correct outcome, not a stall.

**Gate 3 is the last comparison between the PRD and the built file.** A `/prd-auditor` stage used to
sit after it, re-reading the live file at full depth against the PRD and looping back through gate 2
while gaps remained. It was removed, and the loop with it. What is left is a per-page human judgement,
not a machine read of the whole module: nothing re-reads the file once the last page is approved, and
a requirement dropped back in phase 2 has no downstream stage that can still catch it.

**Every live read sits behind gate 1, and that is the phase boundary.** `/design-system-loader` used
to run first so that step 2 could mark each component existing vs. new — one edge that dragged the
most expensive extraction in the pipeline in front of a gate with nothing to say about it, and
duplicated step 8, which answers the same question against a mapping table recording the variants it
actually checked. So phase 1 is PRD work, and the two inspection stages open phase 2 instead. What
that gives up is real: gate 1 no longer sees how much of the module is new.

They sit together at the top of phase 2 but are held there by different mechanisms.
`/figma-extractor` is per-feature, so it takes the real edge — it **requires** gate 1, and invoking it
directly stops there. `/design-system-loader` is `shared`, and a shared stage can never be gate-gated,
so its phase number documents when its output is first needed rather than enforcing anything; having
no dependencies, it generally runs whenever it is asked. Being shared is also why it is cached once in
`reports/_shared/` and reused by every feature instead of re-walked per PRD.

Two skills sit outside that sequence and are invoked directly — `/evaluate-design-system`, which
grades the library itself, and `/requirements-to-prototype`, which turns step 2's document into one
interactive prototype. See **Standalone Skills** below.

---

## Quick Start

### 1. Setup (30 seconds)
```bash
cd /home/elsheikh/Desktop/prd-to-ui-workflow
cp .env.example .env
# Edit .env - add FIGMA_API_TOKEN from https://www.figma.com/developers
```

### 2. Run Workflow (halts at each gate)
```
/run-prd-workflow
# Provide:
# - Figma URL: https://www.figma.com/file/...
# - PRD source: path/to/prd.pdf or paste text
# - Design system: https://design-system-url
```

### 3. Answer the Gates
```bash
node utils/pipeline.mjs status                     # where the run stands, by phase
node utils/pipeline.mjs gate 1 --approve --by "Dana R."
node utils/pipeline.mjs gate 3 --page "Inbox" --approve --by "Dana R."
```
`done` refuses a gate — only `gate` records one; `--by` is required and self-approval values are
rejected.

Each gate is **asked as a popup** (`AskUserQuestion`), not as prose you reply to in chat: the verdict,
that gate's declared checks as a multi-select (gates 1 and 2; gate 3 declares none), one question per
open decision at gate 1, and **who is approving** — asked at every gate, and again for every page at
gate 3, never carried over and never supplied by the AI. That name is what `--by` records. A gate
answered in free text is a gate answered by whoever paraphrases the reply into the command.

### 4. Get Results
```
📝 design_requirements.md   (source of record)
   ├─ Personas and what differs per role
   ├─ Common / Special user flows
   ├─ Pages / Frames + the components each one needs
   └─ §8 Open decisions, each RAISED with options + a recommendation, for gate 1

📄 design_requirements.docx   (the deliverable reviewed at gate 1)
   ├─ Table of contents + styled §1–§8 headings
   ├─ Word tables for §3 personas and §6 per-frame components
   ├─ Flow graph + page–component graph as images on landscape pages
   └─ Word, not PDF — the reviewer can comment and redline

📊 coverage_report_2024-08-31.pdf
   ├─ Overall coverage: 78.5%
   ├─ Missing: 5 components
   ├─ Need to extend: 3 components
   └─ Implementation phases: 3 phases

✍️ G1 / G2 / G3 signoffs
   ├─ Verdict, who decided, when, and how many rounds it took
   └─ Each decision's answer, beside the recommendation it was chosen from

✅ Created in Figma (from the gate-2-approved checklist only):
   ├─ DatePicker component
   ├─ FileUpload component
   ├─ Extended Button with new variants
   └─ The screens assembled from their instances, one gate-3-approved page at a time

📦 handoff_2024-08-31.md
   ├─ Per approved page: layout, tokens, props/variants, states, breakpoints, edge cases
   └─ Change-log of every component created or modified during assembly

📄 closure_report_2024-08-31.pdf
   ├─ What was created
   ├─ What is still uncovered, and why
   └─ Decisions, the answer given at each gate, and what reversing each would cost
```

---

## Key Features

✅ **Multi-format PRD parsing**
- PDF documents
- Word (.docx) files
- Markdown
- Plain text (copy/paste)

✅ **Intelligent analysis**
- Extracts requirements, screens, flows — atomized one need per line
- Maps every requirement to a component with one of four statuses **and its evidence**
- Identifies missing components and states
- Calculates weighted coverage scores

✅ **Visual insights**
- Coverage percentage by category
- Priority matrix (critical → low)
- Screen-by-screen breakdown
- Implementation roadmap

✅ **Human validation gates, enforced by the graph**
- Three gates, closing phases 1, 2 and 3 — each a stage every entry point respects, and gate 3 takes
  one decision per page
- Each is asked as a **popup question**, and the approver's name is asked every time
- `done` refuses a gate; only `pipeline.mjs gate --by "<person>"` records one
- Self-approval values (`claude`, `ai`, `auto`, `self`, …) are rejected outright
- A gate will not open while a raised decision is unanswered, even after `--approve`
- An approval **goes stale** when work it signed off is regenerated

✅ **Figma integration behind a gate**
- Extracts current design state (read-only, at the top of phase 2 — behind gate 1)
- Creates missing components **only from the gate-2-approved checklist** — a gap discovered
  mid-assembly is a *stop*, not an improvisation
- Assembles screens **one page at a time**, each approved at gate 3 before the next starts
- Binds design tokens rather than hardcoding values
- Documents specifications

✅ **Comprehensive reporting**
- PDF with all findings
- Developer handoff package: per-page specs plus the assembly change-log
- JSON data exports
- Actionable recommendations
- Phased implementation plan

---

## What You Provide

| Input | Format | Example |
|-------|--------|---------|
| **Figma File** | URL | `https://www.figma.com/file/ABC123/my-project` |
| **Requirements (PRD)** | PDF / Word / Markdown / Text | `prd.pdf` or `requirements.md` |
| **Design System** | URL / File / Figma | `https://design-system.company.com` |

---

## What You Get

| Output | Type | Contains |
|--------|------|----------|
| **Design Requirements** | Markdown | Personas, flows, pages/frames, the components each frame needs, decisions **raised** for gate 1 |
| **Coverage Report** | PDF | Summary, analysis, gaps, roadmap |
| **Mapping Table** | JSON | One row per requirement: four-status match + evidence (`06_component_analysis.json`) |
| **Build Checklist** | JSON | The components and screens gate 2 signs off (`11_build_phase.json`) |
| **Gate Signoffs** | JSON | G1 / G2 / G3: verdict, who decided, every answer, and the full `history` |
| **Screen Plans** | JSON | Detailed screen specifications |
| **Figma Updates** | Behind gate 2 | Approved components with tokens applied, and the screens built page by page behind gate 3 |
| **PRD Audit** | JSON | Every PRD item resolved against the live file; gaps vs. blocked items |
| **Developer Handoff** | Markdown + JSON | Per-page specs (layout, tokens, props, states, breakpoints, edge cases) + assembly change-log |
| **Closure Report** | PDF | What was created, what is still uncovered, and the answer a person gave at each gate |
| **Recommendations** | JSON | Priority, effort, dependencies |
| **Interactive Prototype** | `.dc.html` | Every frame as a state, personas as a role switcher (standalone stage) |

---

## Example Results

### Coverage Score Breakdown
```
Overall: 78.5%

By Category:
├─ Components: 85% (have most needed)
├─ States: 72% (some missing error/loading states)
├─ Interactions: 68% (missing some hover/focus effects)
└─ Design Tokens: 92% (colors/spacing well documented)

By Screen:
├─ Dashboard: 92% (almost complete)
├─ Forms: 65% (missing DatePicker, FileUpload)
└─ Settings: 87% (mostly covered)
```

### Gap Analysis (Priority Order)
```
🔴 CRITICAL (blocks core features)
├─ DatePicker - needed by Form & Filter
├─ FileUpload - needed by Form
└─ CustomChart - needed by Dashboard

🟠 HIGH (impacts UX)
├─ Button ghost variant - used in 7 screens
├─ Input error state - missing validation feedback
└─ Modal sizes - need small/large variants

🟡 MEDIUM (nice to have)
├─ Loading skeleton - for empty states
└─ Toast notifications - feedback messages
```

### Implementation Roadmap
```
Phase 1: Critical Components (2-3 weeks)
├─ Create DatePicker with variants
├─ Create FileUpload component
└─ Create CustomChart wrapper

Phase 2: High-Priority Extensions (1-2 weeks)
├─ Add ghost variant to Button
├─ Add error/validation states to Input
└─ Add size variants to Modal

Phase 3: Polish (1 week)
├─ Add loading skeleton
└─ Add toast notification
```

---

## Skills Reference

Run individual skills for targeted analysis:

```
# PHASE 1 — requirement extraction (the PRD only — no Figma reads)
/prd-analyzer "prd.pdf"
/prd-design-requirements

/gate-1-requirements        # ══ HUMAN GATE ══

# PHASE 2 — live inspection, then design system mapping (writes nothing into Figma)
/design-system-loader "https://design-system-url"
/figma-extractor "https://figma.com/file/..."   # requires gate 1
/screen-planner
/screen-validator
/component-analyzer
/coverage-scorer
/coverage-reporter
/figma-modifier             # the BUILD CHECKLIST

/gate-2-mapping             # ══ HUMAN GATE ══ the only thing before Figma write access

# PHASE 3 — assembly, one page at a time
/figma:figma-use
/gate-3-pages               # ══ HUMAN GATE ══ one decision PER PAGE

# PHASE 4 — handoff
/developer-handoff
/closure-reporter
```

Or run the whole thing (it halts at each gate and waits):
```
/run-prd-workflow
```

Every skill resolves its own prerequisites — including the gates, because a gate is a stage in the
graph rather than a paragraph in the orchestrator. Invoking `/screen-planner` directly still requires
gate 1 to have passed.

---

## Standalone Skills

Two skills are in the dependency graph but deliberately outside the run — nothing depends on them and
`/run-prd-workflow` does not invoke them:

```
/evaluate-design-system     # Grade the design system library itself
/requirements-to-prototype  # Turn design_requirements.md into one interactive .dc.html prototype
```

**`/evaluate-design-system`** answers a question about the *library*, not about a feature. Whether it
has focus states, a coherent spacing scale, adequate contrast, composable primitives is the same
answer for every PRD — so it is shared, cached beside the library it grades, and depends on
`/design-system-loader` alone. It has its own audience and its own cadence: you read it to decide
what to invest in the design system, not every time a feature ships.

**`/requirements-to-prototype`** builds a single Design Component in which every page/frame from
`design_requirements.md` is a **state** rather than a separate file, and the personas table becomes a
role switcher driving permission booleans. It is standalone for two independent reasons:

- It is a **parallel deliverable to the Figma build, not a step in it.** It does no Figma writes, and
  gate 3 signs off Figma frames rather than the prototype. Neither feeds the other.
- It needs `dc_write` and `ready_for_verification`, which exist only in environments with Design
  Component tooling. As a non-standalone stage, a missing tool would fail **every** run — on a
  deliverable that run never asked for.

It does still require **gate 1**, standalone or not: a prototype is a thing people look at and form
opinions from, so building one out of requirements nobody has validated propagates the unvalidated
reading further and faster than any JSON artifact would. Gate 2 is deliberately *not* required — that
gate approves a Figma build checklist, and this stage does no Figma writes.

---

## Common Use Cases

### 1. Validate New Feature PRD
**Goal:** Check if design system can support this feature

```
→ Run /run-prd-workflow with new PRD
→ Approve (or bounce) the requirements at gate 1
→ Review coverage score
→ Review gap analysis and the build checklist
→ Approve gate 2 if you want it built — or stop here and nothing is written to Figma
```

**Output:** Know exactly what to build before starting

---

### 2. Update Design System
**Goal:** Measure improvement after adding new components

```
→ Update design system file
→ Run /design-system-loader with updated URL
→ Run /coverage-scorer to see new coverage
→ Verify improvements
```

**Output:** Quantified improvement in coverage %

---

### 3. Plan Feature Development
**Goal:** Create detailed spec for developers

```
→ Run /run-prd-workflow
→ Review coverage_report.pdf
→ Check 03_screen_plans.json for detailed specs
→ Use roadmap to prioritize work
```

**Output:** Detailed implementation plan with priorities

---

### 4. Handoff to Development
**Goal:** Clear specs for builders

```
→ Complete the run: every page approved at gate 3
→ Run /developer-handoff → handoff_<date>.md
→ Share it with engineering; it links to the LIVE frames, not pasted copies
→ Use roadmap to schedule sprints
```

**Output:** Everyone knows what to build and in what order

`/developer-handoff` requires gate 3 **hard**, unlike `/closure-reporter` whose every edge is
optional. The asymmetry is the point: a closure report must be producible on every outcome, because it
explains what was decided on the reader's behalf. A handoff must not — a spec for a module whose pages
were never all approved presents unapproved work as shippable. It is also **terminal**: an issue
developers surface afterwards re-enters as a new requirement through phase 1 or 2, not by quietly
redoing assembly outside the gated flow.

---

### 5. Get a Clickable Prototype from the PRD
**Goal:** Something stakeholders can drive before anything is built in Figma

```
→ Run /prd-design-requirements
→ Check its Pages/Frames and Personas sections — together they are the brief
→ Take gate 1 (required: don't build a prototype from unvalidated requirements)
→ Run /requirements-to-prototype
→ Drive the .dc.html: the role switcher changes permissions, every frame is a state
```

**Output:** One interactive file covering every frame, no Figma writes involved

Runs beside the Figma build rather than inside it, and needs an environment with Design Component
tooling (`dc_write`, `ready_for_verification`).

---

## Architecture Overview

```
INPUTS                                                        PHASE 1 — the PRD only
└─ PRD ────────▶ prd-analyzer ──────────▶ Requirements        [NO Figma reads at all]
                     │                     (+ unverified_prd_claims[], open_decisions[])
                     ▼
    prd-design-requirements ─▶ design_requirements.md   (source of record)
        │                    └─▶ design_requirements.docx (reviewed at gate 1)
        │                      (requires prd-analyzer ONLY: personas, flows, frames, and the
        │                       components each frame NEEDS — no existing/new claim;
        │                       §8 RAISES each open decision — options, a recommendation,
        │                       the consequence of each. It does not decide.)
        ▼
 ══════ GATE 1 (HUMAN) ══════ gate-1-requirements ─(changes_requested)─▶ back to phase 1
        │ approved
        ▼                                             PHASE 2 — live inspection, then analysis
    design-system-loader ───▶ Component library   ◀── Design Sys
        │                      [shared, so NOT gate-gated: phase 2 is where its output
        │                       is first needed, not where the graph holds it]
        ▼
    figma-extractor ────────▶ Design state        ◀── Figma URL
        │                      [per-feature, so it REQUIRES gate 1 — every read of the
        │                       live file happens here, behind the gate]
        ▼
    screen-planner ─────────▶ Screen specifications
        │                      (reads the doc as optional context; derives the plans
        │                       from 01_prd_requirements.json regardless)
        ▼
    screen-validator ───────▶ Validation report
        ▼
    component-analyzer ─────▶ mapping_table: one row per requirement, four statuses + evidence
        ▼
    coverage-scorer ────────▶ Coverage %, gaps, roadmap
        ▼
    coverage-reporter ──────▶ Coverage PDF
        ▼
    figma-modifier ─────────▶ THE BUILD CHECKLIST: components AND screens
        ▼
 ══════ GATE 2 (HUMAN) ══════ gate-2-mapping ─(changes_requested)─▶ back to phase 2
        │ approved checklist   [the only thing between analysis and Figma write access]
        ▼                                                     PHASE 3 — one page at a time
    figma:figma-use ────────▶ Components once · then ONE page · then stop
        ▼                      (12_figma_build.json written incrementally, + pages_remaining)
 ══════ GATE 2B (HUMAN) ═════ gate-2b-components — the components as live NODES
 ══════ GATE 3 (HUMAN) ══════ gate-3-pages — one decision PER PAGE
        │ every page approved  ─(changes_requested)─▶ same page, reassembled
        ▼
        │                      gaps_found ──▶ phase 2, THROUGH GATE 2 AGAIN (max 5 loops)
        ▼  covered | blocked                                  PHASE 4 — handoff
    developer-handoff ──────▶ Per-page specs + assembly change-log, linked to live frames
        ▼
    closure-reporter ───────▶ Closure PDF + decision ledger

STANDALONE — invoke directly, not run by /run-prd-workflow
├─ design-system-loader ─────▶ evaluate-design-system ────▶ Library grade
└─ prd-design-requirements ──▶ requirements-to-prototype ─▶ prototype_<date>.dc.html
      (+ gate-1-requirements: a prototype propagates an unvalidated reading fast)

OUTPUTS
├─ Design Requirements (design_requirements.md — source of record,
│                       design_requirements.docx — reviewed at gate 1)
├─ Coverage Report (coverage_report_<date>.pdf)
├─ Gate Signoffs (G1 / G2 / G3 …_signoff.json)
├─ Developer Handoff (handoff_<date>.md + 15_developer_handoff.json)
├─ Closure Report (closure_report_<date>.pdf)
├─ Screen Plans (JSON)
├─ Figma Components and Screens (built from the approved checklist, page by page)
├─ Gap Analysis, Build Log, PRD Audit (JSON)
└─ Decision Ledger (14_closure_notes.json)
```

**Prose feeds the plans and never replaces them.** `design_requirements.md` is a readable projection
of the same facts the numbered JSON carries, not a second source of truth: where the document and
`01_prd_requirements.json` disagree, the requirements win. Reversing that — letting unschema'd prose
feed the graph as a hard dependency — would gate the whole pipeline on an artifact whose quality
nothing can verify.

**It raises rather than decides — and this is a reversal.** `/prd-design-requirements` §8 used to take
the defensible default and record the call, on the grounds that a workflow which halts on every
ambiguity never finishes. That was the right answer for an **unattended** run and the wrong answer
once a gate exists: a default taken in phase 1 is a decision made before the person accountable for it
ever saw the question. So §8 now lists each open item with its options, a **recommended** option, and
the consequence of each — a decision *packet*, not a decision — and gates 1 and 2 refuse to open while
any of them is unanswered. It still does not write `14_closure_notes.json`; `/closure-reporter` owns
that ledger end to end, and two stages writing one ledger is how it loses entries.

**The ledger is built from the gate records, not re-derived.** `/closure-reporter` reads the answer, who
gave it and when from the G1/G2 signoffs, with §8 supplying the question and the options. Re-deriving
from the PRD yields a list of what the workflow *should* have decided — which reads identically to the
truth and is wrong wherever the human chose against the recommendation. It adds `reversible_by`: what
changing a decision would now cost, which is only knowable once the thing is built.

---

## Files & Directories

```
prd-to-ui-workflow/
├── QUICKSTART.md              ← Start here
├── README.md                  ← Full docs
├── CLAUDE.md                  ← Configuration
├── WORKFLOW_OVERVIEW.md       ← Architecture
├── PROJECT_SUMMARY.md         ← This file
│
├── .env                       ← Your configuration
├── .env.example               ← Config template
│
├── .claude/
│   ├── pipeline.json          ← Dependency graph: what each stage needs and produces
│   ├── schemas/
│   │   └── artifacts.json     ← Enforced artifact contract
│   ├── skills/                ← Individual skills, one directory each
│   │   └── [19 skills, incl. 3 human gates and 2 standalone]
│   └── workflows/             ← Orchestration
│       └── prd-to-figma.js
│
├── utils/
│   └── pipeline.mjs           ← Resolver: plan / status / validate / done
│                                 + gate / next-page / pages
│
├── prds/                      ← Input PRDs (a pasted PRD is saved here first)
│
├── examples/                  ← Sample files
│   ├── sample-prd.md
│   └── sample-design-system.md
│
└── reports/                   ← Generated files, one folder per feature
    ├── _shared/               ← design system + its evaluation, cached once
    └── <feature>/             ← 01 … 15, G1/G2/G3 signoffs,
                                  design_requirements.md + .docx, PDFs, handoff, prototype
```

---

## Next Steps

### Immediate
1. ✅ Copy `.env.example` to `.env`
2. ✅ Add FIGMA_API_TOKEN from https://www.figma.com/developers
3. ✅ Run `/run-prd-workflow` to test

### Short-term
1. Prepare your actual PRD (PDF, Word, or Markdown)
2. Get your Figma file URL
3. Point to your design system (Figma file or URL)
4. Run the workflow and review results

### Ongoing
1. Use the coverage report to guide design work
2. Keep design system updated
3. Re-run workflow as requirements change
4. Track coverage improvement over time

---

## Support

Questions? Check these files:

| Question | See File |
|----------|----------|
| How do I get started? | [QUICKSTART.md](QUICKSTART.md) |
| What's the full workflow? | [README.md](README.md) |
| How do I configure it? | [CLAUDE.md](CLAUDE.md) |
| How does it work? | [WORKFLOW_OVERVIEW.md](WORKFLOW_OVERVIEW.md) |
| What skills are available? | [.claude/skills/](./claude/skills/) |
| Can I see examples? | [examples/](./examples/) |

---

## Summary

This workflow **saves time** by:
- Automatically analyzing PRDs (no manual extraction)
- Scoring design system coverage (no guessing)
- Identifying exactly what's missing (no surprises)
- Building the approved components and screens for you (no manual setup) — behind gate 2, and page by
  page behind gate 3
- Packaging the developer handoff (no spec-writing session)
- Generating roadmaps (no planning overhead)

And it **spends** your time deliberately, in three places: validating the requirements, validating the
mapping, and reviewing each assembled page. Those three reviews are what make everything above
trustworthy. An unattended run that decided its own open questions and approved its own build was
faster and produced work nobody had accountably signed off.

**Result:** Faster feature delivery with fewer gaps between design and development — and a written
record of who approved what.

---

**Ready to start?** → Read [QUICKSTART.md](QUICKSTART.md)

---

**Phase 3 has two gates, not one.** It does two different things — it creates components, then it
assembles pages out of *instances* of them — and those fail differently. A component that read
correctly on the checklist can still be misnamed, missing a variant, unbound from its tokens, or in
the wrong library location once it exists as a real node. None of that shows up in a plan, all of it
is cheap to fix before anything is built on top of it, and once a page is assembled the defect sits
behind a screen that looks finished. So `/figma-component-pass` builds the components and stops,
**`/gate-2b-components`** inspects the actual nodes, and only then does page assembly begin.

```bash
node utils/pipeline.mjs gate 2b --approve --by "<person>" --checked all
```

Its five checks are `all_approved_components_present`, `live_nodes_and_variants_verified`,
`tokens_and_variables_bound`, `naming_location_and_retirement_verified` and
`no_unapproved_component_changes`. A gate is addressed by its `gate_id` — `1`, `2`, `2B`, `3` — never
by its phase number, since 2B and 3 share phase 3.
