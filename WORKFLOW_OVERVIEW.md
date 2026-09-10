# PRD-to-UI Workflow - Complete Overview

**Four AI phases, and four human validation gates hold them apart.** The pipeline is not
unattended: it halts at gate 1, at gate 2, and after **every single assembled page**, and waits for a
person. Parking at a gate is a correct outcome, not a stall.

A gate is a **stage in the dependency graph**, not a paragraph in the orchestrator — which is what
makes it unavoidable. Every entry point respects the graph, so `/figma-extractor`, `/screen-validator`
and `/component-analyzer` each hold their own *direct* edge to gate 1,
`/figma:figma-use` requires gate 2B, and
`/developer-handoff` requires gate 3. A gate that lived only
in `/run-prd-workflow` would be bypassed by every direct invocation of a downstream skill, which is
most of how these skills actually get used.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  INPUT SOURCES                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Figma URL          │  PRD Document       │  Design System Reference    │
│  (figma.com/file/…) │  (PDF/Word/MD/txt)  │  (URL / File / Figma)       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: REQUIREMENT EXTRACTION — the PRD only, NO Figma reads         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────┐        ┌────────────────────────────┐     │
│  │ prd-analyzer             │───────▶│  prd-design-requirements   │     │
│  │                          │        │                            │     │
│  │ • One need per line      │        │ • Personas & roles         │     │
│  │ • unverified_prd_claims  │        │ • Common / Special flows   │     │
│  │ • open_decisions RAISED  │        │ • Pages / Frames           │     │
│  │ • NO component mapping   │        │ • Components each frame    │     │
│  │   (that is phase 2)      │        │   NEEDS — no existing/new  │     │
│  │                          │        │ • Assembly                 │     │
│  └──────────────────────────┘        │ • §8 Open Decisions RAISED │     │
│                                      └────────────────────────────┘     │
│                                │                                        │
│                    📝 design_requirements.md   (source of record)       │
│                    📄 design_requirements.docx (reviewed at gate 1)     │
│                                                                         │
│  Never trust embedded analysis in an uploaded document. A PRD arrived   │
│  here with a pre-filled components section and Figma page references    │
│  that were entirely FABRICATED. Claims of that kind go into             │
│  unverified_prd_claims[] and are checked against the live file — never  │
│  laundered into requirements[] as fact. The array is required, so an    │
│  empty one is a positive claim rather than an omission. That check      │
│  happens in phase 2, against the live file; phase 1 only quarantines.   │
│                                                                         │
│  prd-design-requirements requires prd-analyzer ONLY. It reads no        │
│  Figma-derived artifact — no use_figma call, no search_design_system,   │
│  and neither 05_design_system.json nor 02_figma_state.json — and that   │
│  is the phase boundary. design-system-loader used to be a HARD          │
│  requirement here, purely so §6 could mark each component existing vs.  │
│  new; that one edge dragged the most expensive extraction in the        │
│  pipeline in front of a gate with nothing to say about it, and it       │
│  duplicated component-analyzer, which answers the same question in      │
│  phase 2 with the variants it actually checked recorded per             │
│  requirement. So §6 names what a frame NEEDS and claims nothing about   │
│  what already exists, and the visual PDF's page–component graph lost    │
│  its green-existing/orange-new shading. What that gives up is real:     │
│  gate 1 no longer sees how much of the module is new.                   │
│                                                                         │
│  Prose feeds the plans and never replaces them. The numbered JSON       │
│  artifacts stay authoritative and machine-checked; where this doc and   │
│  01_prd_requirements.json disagree, the requirements win.               │
│                                                                         │
│  §8 RAISES the PRD's open decisions rather than taking them: options,   │
│  a RECOMMENDED option, and the consequence of each. A human answers at  │
│  gate 1. (This is a reversal — see "Decisions" below.) It does not      │
│  write 14_closure_notes.json; closure-reporter owns that ledger, and    │
│  two stages writing one ledger lose entries.                            │
│                                                                         │
│                                │                                        │
│                                ▼                                        │
│                    ┌──────────────────────────┐                         │
│                    │ screen-planner           │                         │
│                    │                          │                         │
│                    │ • Elements in order      │                         │
│                    │ • requirement_link on    │                         │
│                    │   every element          │                         │
│                    │ • Every state planned    │                         │
│                    │ • NO Figma input         │                         │
│                    └──────────────────────────┘                         │
│                                                                         │
│                    💾 03_screen_plans.json                              │
│                                                                         │
│  screen-planner is the LAST stage of phase 1 and runs BEFORE gate 1.    │
│  It was phase 2's entry point, and the move is deliberate:              │
│  03_screen_plans.json is an INTERPRETATION of the PRD that nearly all   │
│  of phase 2 derives from, so a requirement the PRD names but the plan   │
│  never captures is permanently invisible to every plan-derived check    │
│  downstream — and invisible to gate 3 too, since a requirement that     │
│  produced no checklist entry produces no page to ask about. Reviewed    │
│  at gate 1, beside the requirements it claims to cover, that omission   │
│  is visible while it is still cheap.                                    │
│                                                                         │
│  What the move gives up is real: the plans get no existing-screens      │
│  context from 02_figma_state.json, which is a phase-2 artifact behind   │
│  gate 1, so they are derived from the PRD alone. Reconciling them       │
│  against what is already in the file is component-analyzer's job in     │
│  phase 2.                                                               │
│                                                                         │
│  It reads design_requirements.md as OPTIONAL context — a persona table  │
│  is exactly what tells you which states a screen needs — but derives    │
│  03_screen_plans.json from 01_prd_requirements.json regardless. Prose   │
│  cannot be schema-checked, so making it a hard dependency would gate    │
│  the graph on unverifiable quality.                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
╔═════════════════════════════════════════════════════════════════════════╗
║  ══ GATE 1 (HUMAN) ══  /gate-1-requirements    closes phase 1           ║
╠═════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║  It signs off the requirement list AND the screen plans built from it,  ║
║  together, because the plans are what phase 2 actually builds against.  ║
║                                                                         ║
║  Is that list complete, correctly atomized, free of unresolved          ║
║  ambiguity — and do the plans cover it? FIVE checks, recorded as        ║
║  booleans so a pass is auditable:                                       ║
║    atomized · flows_broken_to_frames · ambiguity_flagged ·              ║
║    prd_claims_quarantined · screens_cover_requirements                  ║
║                                                                         ║
║  screens_cover_requirements is the check that only exists here: every   ║
║  requirement id in 01_prd_requirements.json appears as some element's   ║
║  requirement_link in 03_screen_plans.json. Name the unmapped ids — a    ║
║  count is not evidence. It is the ONLY place that comparison is ever    ║
║  made: a requirement that became no element is invisible to every       ║
║  plan-derived check afterwards, and to gate 3 too.                      ║
║                                                                         ║
║  ✓ approve            ──▶ phase 2 may start                             ║
║  ~ changes_requested  ──▶ BACK TO PHASE 1, and `plan` re-runs those     ║
║  ! reject             ──▶ same, above assembly                          ║
║                                                                         ║
║  node utils/pipeline.mjs gate 1 --approve --by "<person>"               ║
║                                                                         ║
║  `done` REFUSES this stage. --by is required and "claude", "ai",        ║
║  "auto", "self" are rejected: a gate signed by the thing being gated    ║
║  is not a gate. The gate will not open while any raised decision has    ║
║  an empty answer — even after an explicit --approve.                    ║
║                                                                         ║
║  A HAND-EDITED REQUIREMENT IS changes_requested, NOT AN APPROVAL.       ║
║  Record the ids in requirements_edited[] and take the verdict as        ║
║  changes_requested. While screen planning happened after the gate, a    ║
║  correction here was absorbable: phase 2 simply planned from the        ║
║  corrected wording. The plans now already exist and were built from     ║
║  the superseded text, so an approval carrying requirements_edited[]     ║
║  forward would leave 03_screen_plans.json derived from requirements     ║
║  nobody approved, while every downstream check reported the phase       ║
║  approved. changes_requested re-runs phase 1 and regenerates them.      ║
║                                                                         ║
╚═════════════════════════════════════════════════════════════════════════╝
                              │ approved
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: LIVE INSPECTION — every read of the live file, behind gate 1  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────┐        ┌──────────────────────────┐       │
│  │ design-system-loader     │        │ figma-extractor          │       │
│  │   [shared]               │        │   REQUIRES gate 1        │       │
│  │ • Parse system           │        │ • Extract frames         │       │
│  │ • Extract tokens         │        │ • List components        │       │
│  │ • Walk INTO component    │        │ • Map usage              │       │
│  │   sets, not just the top │        │                          │       │
│  └──────────────────────────┘        └──────────────────────────┘       │
│           │                                       │                     │
│           └───────────────────┬───────────────────┘                     │
│                                                                         │
│  Not a governance phase itself, but every claim the rest of phase 2     │
│  and phases 3–4 make about what exists has to resolve against the LIVE  │
│  file rather than a memory of it. Absence from a keyword search is not  │
│  absence from the file — the bell icon was reported missing while       │
│  nested inside a component set.                                         │
│                                                                         │
│  These two open phase 2, and different mechanisms hold them there.      │
│  figma-extractor is per-feature, so it takes the real edge: it          │
│  REQUIRES gate 1, and invoking it directly stops at the gate.           │
│  design-system-loader is shared, and a shared stage can never be        │
│  gate-gated — its phase 2 is documentation of where its output is       │
│  first needed, NOT enforcement. Do not read it as gate-blocked.         │
│                                                                         │
│  The design system is shared, not per-feature: extracted once into      │
│  reports/_shared/ and read by every feature, with max_age_days to       │
│  expire the cache, because design system state has a shelf life.        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 2 (cont.): DESIGN SYSTEM MAPPING — writes NOTHING to Figma       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                    ┌──────────────────────────┐                         │
│                    │ screen-validator         │                         │
│                    │   REQUIRES gate 1        │                         │
│                    │ • Check coverage         │                         │
│                    │ • Validate reqs          │                         │
│                    │ • Recommend              │                         │
│                    └──────────────────────────┘                         │
│                                                                         │
│  The plans it validates are 03_screen_plans.json, written back in       │
│  PHASE 1 and signed off at gate 1. screen-planner is no longer here.    │
│                                                                         │
│  screen-planner used to be this half's single entry point, and it       │
│  carried the gate-1 edge for everything behind it — gating there gated  │
│  them all. Now that it sits in FRONT of the gate, that edge had to be   │
│  re-placed onto the three stages that no longer inherited one:          │
│  figma-extractor, screen-validator and component-analyzer each hold a   │
│  DIRECT gate-1 edge. coverage-scorer, coverage-reporter and             │
│  figma-modifier reach the gate transitively through those three.        │
│                                                                         │
│                    ┌──────────────────────┐                             │
│                    │ component-analyzer   │                             │
│                    │   REQUIRES gate 1    │                             │
│                    │ • mapping_table:     │                             │
│                    │   ONE ROW PER        │                             │
│                    │   REQUIREMENT        │                             │
│                    │ • four statuses      │                             │
│                    │ • evidence recorded  │                             │
│                    │ • escalate, don't    │                             │
│                    │   design around      │                             │
│                    └──────────────────────┘                             │
│                                                                         │
│  Every atomized requirement gets exactly one of four statuses:          │
│    direct-match · match-with-modification · combinable-match · no-match │
│                                                                         │
│  A "direct match" is a claim about VARIANTS, states, icon support and   │
│  content behaviour — not about family resemblance. "It's a button" says │
│  nothing, and a match asserted from resemblance only surfaces as wrong  │
│  during assembly, after the checklist was signed off. So a direct match │
│  needs evidence.variants_checked, and a no-match needs its nested-      │
│  children walk recorded: evidence.method "keyword-search-only" is       │
│  REJECTED by gate 2.                                                    │
│                                                                         │
│  Coverage bucket arrays cannot answer "does requirement R map to        │
│  component C, and how do we know" — they lose the requirement, so a     │
│  requirement never mapped at all was invisible in them. That is why     │
│  mapping_table is required.                                             │
│                                                                         │
│  An ambiguity that is really a PRODUCT decision (a taxonomy or data-    │
│  model conflict) is escalated for gate 2, not designed around. Forcing  │
│  a combinable match that does not hold ships the conflict into the      │
│  build.                                                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 2 (cont.): SCORE & PRIORITIZE                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                    ┌──────────────────────┐                             │
│                    │ coverage-scorer      │                             │
│                    │                      │                             │
│                    │ • Calculate %        │                             │
│                    │ • Priority matrix    │                             │
│                    │ • Gap analysis       │                             │
│                    └──────────────────────┘                             │
│                              │                                          │
│            ┌─────────────────┴─────────────────┐                        │
│            │ Coverage Score: X%                │                        │
│            │ Critical gaps: Y                  │                        │
│            │ Priority roadmap: Z phases        │                        │
│            └─────────────────┬─────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 2 (cont.): REPORT & CHECKLIST                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────┐        ┌──────────────────────────────┐       │
│  │ coverage-reporter    │───────▶│ figma-modifier               │       │
│  │                      │        │                              │       │
│  │ • Generate PDF       │        │ • Spec missing components    │       │
│  │ • Include all data   │        │ • Spec the SCREENS they      │       │
│  │ • Visual summaries   │        │   assemble into              │       │
│  └──────────────────────┘        │ • extend ▶ combine ▶ net-new │       │
│            │                     └──────────────────────────────┘       │
│  📄 coverage_report.pdf                        │                        │
│                                  📋 11_build_phase.json                 │
│                                     = THE BUILD CHECKLIST               │
│                                                                         │
│  Phase 2 writes NOTHING into Figma. figma-modifier produces specs only  │
│  — that separation is why gate 2 can be the single point of control     │
│  over write access, rather than the build skill's good behaviour.       │
│                                                                         │
│  Gap resolution runs extend ▶ combine ▶ net-new, and resolution_path    │
│  records which. Prefer slot-based, system-wide reusable architecture;   │
│  module-specific is a last resort justified in scope_rationale, because │
│  a component built for this feature alone is one the next feature       │
│  rebuilds. Earlier naming and RETIREMENT decisions hold.                │
│                                                                         │
│  Components are not the deliverable — screens are. `screens` is a       │
│  REQUIRED array beside the components: a run with zero component gaps   │
│  still has screens to build, and gating the build on the gap count      │
│  alone meant a feature the library already covered built nothing.       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
╔═════════════════════════════════════════════════════════════════════════╗
║  ══ GATE 2 (HUMAN) ══  /gate-2-mapping         closes phase 2           ║
╠═════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║  THE ONLY THING BETWEEN ANALYSIS AND WRITE ACCESS TO FIGMA.             ║
║  It gates figma-use, the pipeline's single write stage — so until this  ║
║  verdict is `approved`, nothing can be created in the file.             ║
║                                                                         ║
║  Pass: every requirement has a status, every gap has a real             ║
║  resolution path, every flagged product-level ambiguity has an ANSWER.  ║
║  Fail: an incomplete mapping, an unconvincing resolution path, a        ║
║  decision still open, or evidence.method "keyword-search-only".         ║
║                                                                         ║
║  ✓ approve            ──▶ phase 3 may write                             ║
║  ~ changes_requested  ──▶ BACK TO PHASE 2 for re-mapping or a deeper    ║
║                            live look                                    ║
║                                                                         ║
║  node utils/pipeline.mjs gate 2 --approve --by "<person>"               ║
║                                                                         ║
║  `decisions` is required and each entry must carry an answer: a         ║
║  checklist cannot be approved while a "needs product decision" item is  ║
║  still open. Gate 2 also pins checklist_fingerprint, so rewriting       ║
║  11_build_phase.json in place invalidates the approval.                 ║
║                                                                         ║
╚═════════════════════════════════════════════════════════════════════════╝
                              │ approved checklist
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: SCREEN ASSEMBLY — ONE PAGE AT A TIME                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                    ┌──────────────────────────────┐                     │
│                    │ figma:figma-use              │                     │
│                    │ (external skill)             │                     │
│                    │ component pass: ONCE         │                     │
│                    │   → real nodes               │                     │
│                    │ then ONE page, as named      │                     │
│                    │   instances → then STOP      │                     │
│                    └──────────────────────────────┘                     │
│                                            │                            │
│                            ✅ One page in Figma, awaiting gate 3        │
│                                                                         │
│  figma-modifier only writes specs (the REST API cannot create           │
│  components), so figma-use is what actually builds. The ordering is     │
│  forced, not stylistic: a page places component INSTANCES, which are    │
│  not real nodes until the component pass has run. A screen whose        │
│  component failed goes in `failed` with kind "screen" — reported        │
│  blocked, never assembled around the hole.                              │
│                                                                         │
│  12_figma_build.json is written INCREMENTALLY — after the component     │
│  pass, then after each page — and carries pages_remaining. An end-of-   │
│  run write could only exist after every page was built, which is the    │
│  state the gate exists to prevent, so it would have made gate 3         │
│  unenforceable.                                                         │
│                                                                         │
│  Three boundaries bind assembly, each from a real failure:              │
│   • ONLY checklist-approved components. A gap gate 2 missed is a STOP   │
│     into discovered_gaps, not an improvisation — an improvised          │
│     component is indistinguishable from an approved one once it is in   │
│     the file, and closing it may mean looping back to phase 2.          │
│   • BIND TOKENS; never hardcode where a token exists.                   │
│   • HONOUR earlier naming and retirement decisions.                     │
│                                                                         │
│  node utils/pipeline.mjs next-page   # the ONE page you may work on     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
╔═════════════════════════════════════════════════════════════════════════╗
║  ══ GATE 2B (HUMAN) ══ /gate-2b-components   THE COMPONENTS AS NODES    ║
║  ══ GATE 3 (HUMAN) ══  /gate-3-pages    ONE DECISION PER PAGE           ║
╠═════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║   ▶▶ THE SINGLE HARD RULE OF THE WHOLE PIPELINE ◀◀                      ║
║      PHASE 3 NEVER ADVANCES PAST AN UNAPPROVED PAGE.                    ║
║                                                                         ║
║  A narrow question: does THIS page, exactly as built, match the         ║
║  approved checklist and the requirement underneath it?                  ║
║                                                                         ║
║  ✓ approve            ──▶ more pages? ──yes──▶ next page, phase 3       ║
║  ~ changes_requested  ──▶ THE SAME PAGE goes back to assembly,          ║
║                            revised, and is re-presented (iterations++)  ║
║  ! reject             ──▶ needs a decision above assembly; may loop     ║
║                            all the way back to phase 2                  ║
║                                                                         ║
║  node utils/pipeline.mjs gate 3 --init          # seed the roster       ║
║  node utils/pipeline.mjs next-page              # the ONE page          ║
║  node utils/pipeline.mjs gate 3 --page "<name>" --approve --by "<who>"  ║
║  node utils/pipeline.mjs pages                  # the ledger            ║
║                                                                         ║
║  The roster is seeded from the GATE-2-APPROVED CHECKLIST (screens),     ║
║  not from what assembly built — seeded from the build, a page silently  ║
║  dropped would never appear as pending and the module would read as     ║
║  fully approved with a page missing.                                    ║
║                                                                         ║
║  next-page refuses to name a second page while one is undecided.        ║
║  `pages` flags an approval recorded while an earlier page was pending:  ║
║  not refused (reviewing page 3 first is a real decision), but never     ║
║  silent, because that ledger is the only evidence the rule held.        ║
║                                                                         ║
║  --manually-edited: gate 3 explicitly permits a designer to hand-edit   ║
║  a frame, and it obliges assembly AND phase 4 to RE-INSPECT it live.    ║
║  "Spec built from a stale frame" starts exactly here.                   ║
║                                                                         ║
║  The gate is satisfied only when EVERY page is approved.                ║
║                                                                         ║
╚═════════════════════════════════════════════════════════════════════════╝
                              │ every page approved
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 3 ENDS AT GATE 3 — AND NOTHING RE-READS THE BUILD                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Every page approved ──▶ PHASE 4. There is no loop.                     │
│                                                                         │
│  There WAS a prd-auditor stage here. It read the LIVE Figma file at     │
│  full depth — plus the Plugin API for what REST cannot see, since an    │
│  orphaned master appears in no page tree at any depth — resolved every  │
│  PRD item against it, and looped gaps back through GATE 2 for up to 5   │
│  iterations. It has been removed, with 13_prd_audit.json and its        │
│  verdict.                                                               │
│                                                                         │
│  WHAT THAT COSTS, stated rather than discovered:                        │
│                                                                         │
│  • GATE 3 IS NOW THE ONLY comparison between the PRD and what was       │
│    actually built — and it is one person looking at one frame, not a    │
│    machine reading the whole module.                                    │
│  • Everything before it measures INTENT. Those stages can report a      │
│    feature fully covered while the Figma file contains something else,  │
│    and figma-use reports only what it BELIEVES it built.                │
│  • A requirement dropped back in phase 2 is now uncatchable: it         │
│    produced no checklist entry, so no page, so nothing looks wrong.     │
│  • An orphaned master is undetectable by any remaining stage.           │
│                                                                         │
│  "Every page approved" is a true claim about the pages. It is NOT the   │
│  claim that the PRD is covered, and must not be reported as one.        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: DEVELOPER HANDOFF                                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────┐   ┌──────────────────────────────┐    │
│  │ developer-handoff            │──▶│ closure-reporter             │    │
│  │                              │   │                              │    │
│  │ Per APPROVED page:           │   │ • What was created           │    │
│  │  • layout as built           │   │ • What is still missing,     │    │
│  │  • design tokens / variables │   │    and why                   │    │
│  │  • props and variants used   │   │ • Every decision, the ANSWER │    │
│  │  • interaction states        │   │    given at a gate, by whom, │    │
│  │  • responsive breakpoints    │   │    and reversible_by         │    │
│  │  • EDGE CASES, explicitly    │   │ • How the gates went         │    │
│  │ + change-log of every        │   └──────────────────────────────┘    │
│  │   component created/modified │        │                              │
│  │   during assembly            │   📄 closure_report.pdf              │
│  └──────────────────────────────┘   💾 14_closure_notes.json            │
│            │                                                            │
│  📦 handoff_<date>.md  💾 15_developer_handoff.json                     │
│                                                                         │
│  developer-handoff requires GATE 3 HARD; every closure-reporter edge is │
│  OPTIONAL. The asymmetry is the point: a closure report must be         │
│  producible on EVERY outcome — an exhausted loop, a module parked at    │
│  gate 2, a run abandoned at gate 1 — because it explains what was       │
│  decided on the reader's behalf. A handoff must NOT: engineering builds │
│  from it, so a spec for a module whose pages were never all approved    │
│  presents unapproved work as shippable. The two also have different     │
│  subjects — the handoff records what was BUILT, the closure report what │
│  was DECIDED — and neither subsumes the other.                          │
│                                                                         │
│  Everything is cross-linked to the LIVE frames and every name is re-    │
│  verified at write time (verification.unresolved lists any that could   │
│  not be): gate 3 permits hand edits, so the frame being specced is      │
│  routinely NOT the one assembly last saw. Behaviour approved visually   │
│  but never specified — empty, error, overflow — is called out, because  │
│  approval on sight is not a specification. And no implementation        │
│  guidance that the design system's own conventions do not back: a       │
│  plausible invented CSS approach reads exactly like a documented one.   │
│                                                                         │
│  This phase is TERMINAL. An issue developers surface afterwards re-     │
│  enters as a new requirement through phase 1 or 2 — never by quietly    │
│  redoing phase 3 assembly outside the gated flow.                       │
│                                                                         │
│  An OPEN GATE is a legitimate closure outcome: a run parked at gate 2   │
│  awaiting a taxonomy decision is reported as PARKED. "Complete" is not  │
│  an available answer while a gate is open.                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  FINAL OUTPUTS                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  📊 PDF Reports            📁 Requirements        🎨 Figma Updates      │
│  ├─ Coverage report        ├─ Personas & flows    ├─ Approved comps     │
│  ├─ Closure report         ├─ Pages / Frames      ├─ Assembled screens  │
│  ├─ Gap matrix             ├─ Components list     ├─ Extensions         │
│  ├─ Missing specs          └─ Decisions RAISED    └─ Documentation      │
│  └─ Roadmap                    for the gates          (behind gates     │
│                                                        2 and 3)         │
│  📦 Developer Handoff      📁 Screen Plans        💾 JSON Artifacts     │
│  ├─ Per-page specs         ├─ Screen specs        ├─ 01 … 15, numbered  │
│  ├─ Tokens, props, states  ├─ Interactions        ├─ G1 / G2 / G3       │
│  ├─ Edge cases             └─ States              │    signoffs         │
│  └─ Assembly change-log                           ├─ Build & audit log  │
│                                                   └─ Decision ledger    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  STANDALONE — in the graph, but no orchestrator runs them               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────┐    ┌──────────────────────────┐           │
│  │ evaluate-design-system   │    │ requirements-to-         │           │
│  │ [shared]                 │    │   prototype              │           │
│  │                          │    │                          │           │
│  │ Grades the LIBRARY, not  │    │ One .dc.html Design      │           │
│  │ a feature: focus states, │    │ Component — every frame  │           │
│  │ spacing scale, contrast, │    │ is a STATE, personas be- │           │
│  │ composable primitives.   │    │ come a role switcher.    │           │
│  └──────────────────────────┘    └──────────────────────────┘           │
│   requires design-system-loader   requires prd-design-requirements      │
│                                   + GATE 1 (a prototype propagates an   │
│                                     unvalidated reading fast; gate 2 is │
│                                     not required — no Figma writes)     │
│                                                                         │
│  Neither is part of /run-prd-workflow, and nothing depends on either.   │
│                                                                         │
│  Grading the library has its own audience and cadence — you read it to  │
│  decide what to invest in the design system, not every time a feature   │
│  ships. Its answer is the same for every PRD, so it is shared.          │
│                                                                         │
│  The prototype is standalone for two independent reasons. It is a       │
│  PARALLEL deliverable to the Figma build, not a step in it: it does no  │
│  Figma writes, and gate 3 signs off Figma frames rather than the        │
│  prototype. And it needs dc_write and ready_for_verification, which     │
│  exist only where Design Component tooling does — as a non-standalone   │
│  stage, a missing tool would fail every run on a deliverable that run   │
│  never asked for.                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Skills Overview

### Individual Skills (Can be run separately)

| # | Ph | Skill | Purpose | Input | Output |
|---|----|-------|---------|-------|--------|
| 1 | 1 | **prd-analyzer** | Atomize requirements; quarantine the PRD's own claims; **raise** decisions | PRD (PDF/Word/MD/text) | Requirements, screens, flows, `unverified_prd_claims[]`, `open_decisions[]` |
| 2 | 1 | **prd-design-requirements** | Write the design-ready prose reference | Requirements **only** — no Figma-derived input | `design_requirements.md` (source of record), `design_requirements.docx` (the deliverable reviewed at gate 1) |
| 3 | 1 | **screen-planner** | Plan screens from the PRD requirements — the **last** stage of phase 1, and an **input to** gate 1 | PRD requirements (+ requirements doc, optional) — **no Figma input** | Screen specifications, layouts |
| **4** | **G** | **gate-1-requirements** | **══ HUMAN GATE ══** validate the requirements **and the screen plans**, together | The packet + a person | `G1_requirements_signoff.json` |
| 5 | 2 | **design-system-loader** | Load design system (shared, cached) | URL/File | Component library, tokens |
| 6 | 2 | **figma-extractor** | Extract design state (**requires gate 1**) | Figma URL | Components, frames, structure |
| 7 | 2 | **screen-validator** | Validate screen plans (**requires gate 1**) | Requirements + Plans | Coverage report, issues |
| 8 | 2 | **component-analyzer** | Map **every requirement**: direct / modify / combine / no match, with evidence (**requires gate 1**) | Design system + Plans | `mapping_table`, coverage analysis, gaps |
| 9 | 2 | **coverage-scorer** | Score coverage | All analyses | Coverage %, priority matrix |
| 10 | 2 | **coverage-reporter** | Generate PDF report | All analyses | coverage_report.pdf, roadmap |
| 11 | 2 | **figma-modifier** | Spec the missing components **and** the screens — the build checklist | Gap analysis + Design system + Plans | `11_build_phase.json` (components + screens) |
| 12 | 2 | **figma-component-pass** | Build the specified components and variants, then STOP (loads `/figma:figma-use`) | Approved checklist | `12a_figma_components.json` |
| **13** | **G** | **gate-2-components** | **══ HUMAN GATE ══** inspect the components as live NODES | The packet + a person | `G2_component_signoff.json` |
| 14 | 3 | **figma:figma-use** | Build in Figma (external skill) — **one page**, then stop | Approved checklist + approved components | `12_figma_build.json`, written incrementally |
| **15** | **G** | **gate-3-pages** | **══ HUMAN GATE ══** one decision **per page** | Each built page + a person | `G3_page_signoffs.json` |
| 16 | 4 | **developer-handoff** | Per-page specs + assembly change-log, linked to live frames | Approved pages + checklist | `handoff_<date>.md`, `15_developer_handoff.json` |
| 17 | 4 | **closure-reporter** | Final report and decision ledger | Gate records | closure_report.pdf, decision ledger |
| — | — | **run-prd-workflow** | Run the complete workflow, **halting at each gate** | Figma URL + PRD + System | All outputs |

The numbers are the execution order the dependency graph produces — check it with
`node utils/pipeline.mjs graph`. **Stage 5 is shared rather than per-feature:** the design system
does not vary by PRD, so it is extracted once and every feature reads the same copy. It used to run
first, before stage 2, purely so that document could mark each component **existing vs. new** — and
that edge is gone. Phase 1 reads the PRD and nothing else, so the two live-inspection stages open
phase 2 instead, and existence is answered by stage 8's `mapping_table` on better evidence.

The two are held at the top of phase 2 by different mechanisms. Stage 6 is per-feature and so takes
the real edge: it **requires** gate 1, and invoking it directly stops there. Stage 5 is `shared`,
and a shared stage can never be gate-gated — its `Ph 2` records where its output is first needed,
not where the graph holds it.

**Stage 3 sits in phase 1, in front of stage 4, and that is a move.** It was phase 2's single entry
point, so every mapping stage behind it reached gate 1 through it and gating there gated them all.
`03_screen_plans.json` is an *interpretation* of the PRD that nearly all of phase 2 derives from, so
a requirement the PRD names but the plan never captures is permanently invisible to every
plan-derived check downstream — and invisible to gate 3 too, since a requirement that produced no
checklist entry produces no page to ask about. Reviewed at gate 1, beside the requirements it claims
to cover, that omission is visible while it is still cheap. With the planner in front of the gate,
its gate-1 edge had to be re-placed onto the three stages that no longer inherited one — stages 6, 7
and 8 each hold a **direct** `gate-1-requirements` edge, and stages 9, 10 and 11 reach the gate
transitively through them. What the move gives up: the plans get no existing-screens context from
`02_figma_state.json`, a phase-2 artifact behind gate 1, so they are derived from the PRD alone;
reconciling them against what is already in the file is stage 8's job.

Every gate is per-feature, never shared: a decision about *this* feature's requirements says nothing
about the next one's, and a shared gate would let one signoff open the gate for every feature that
followed — the exact opposite of what a gate is for.

### Recording gate decisions

```bash
node utils/pipeline.mjs gate 1                          # where does this gate stand?
node utils/pipeline.mjs gate 1 --approve --by "<person>" [--note "..."]
node utils/pipeline.mjs gate 2 --changes-requested --by "<person>" --note "what to re-map"
node utils/pipeline.mjs gate 2 --reject --by "<person>" --note "why"

node utils/pipeline.mjs gate 3 --init                   # seed the page roster
node utils/pipeline.mjs gate 3 --page "<name>" --approve --by "<person>" [--manually-edited]
node utils/pipeline.mjs next-page                       # the ONE page assembly may work on
node utils/pipeline.mjs pages                           # the per-page decision ledger
```

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

Four properties make a gate a gate, and each was a silent failure before it was a rule:

1. **`done` refuses a gate.** `done` is the reflex every other skill ends with, so a gate that
   accepted it would be closed by habit rather than by a decision. `--by` is required, and `claude`,
   `ai`, `assistant`, `auto`, `self` and friends are rejected outright.
2. **Validating is not passing.** Everywhere else "the file exists and matches its schema" is the whole
   test. A gate artifact validates whatever the verdict is — a rejection is a well-formed decision
   record — so the gate is satisfied only when the recorded verdict is `approved`.
3. **A gate cannot pass with an open decision unanswered.** `--approve` records, and the gate *still*
   refuses to open and names the decisions whose `answer` is empty. It fires even after an explicit
   approval, because a checklist approved while a "needs product decision" item is still open is the
   governance failure this exists to catch.
4. **An approval goes stale.** Regenerate an artifact the gate signed off and `plan` reports the gate
   as needing to be re-taken; gate 2 additionally pins `checklist_fingerprint`. `--force` does **not**
   re-open a gate — a gate closed by a person stays closed until it goes stale or is re-taken.

`changes_requested` sends the phase back: `plan` marks the gate's own dependencies `run` again — that
is the backwards arrow in the diagram — and every verdict stays in `history`, because a gate that
bounced twice before passing is a different fact from one that passed first time.

### Decisions are raised by the AI and taken by a human

This **reverses** what this pipeline used to do, and the reversal is worth understanding rather than
just obeying. The old rule was that the workflow takes the recommended option rather than stalling, on
the grounds that a workflow which halts on every open question never finishes. That was the right
answer for an **unattended** run and the wrong answer once a gate exists: a default taken in phase 1 is
a decision made before the person accountable for it ever saw the question.

So `/prd-analyzer`'s `open_decisions[]`, `/prd-design-requirements` §8 and `/component-analyzer`'s
escalations all produce a decision **packet** — options, a recommendation, and the consequence of each
— and none of them has a `taken` field. The human answers at gate 1 or gate 2, and the gate record
keeps `recommended` beside `answer` **specifically so that a human choosing against the recommendation
survives**. `/closure-reporter` then builds `open_decisions[]` from the gate records, with §8 supplying
the question and the options, and adds `reversible_by` — what changing the decision would now cost,
which is only knowable once the thing is built.

An **ambiguity that is really a product decision gets escalated, not designed around.** A taxonomy or
data-model conflict is not a component problem; forcing a combinable match that does not hold ships the
conflict into the build.

### Standalone Skills (in the graph, but no orchestrator runs them)

| Skill | Purpose | Input | Output |
|-------|---------|-------|--------|
| **evaluate-design-system** | Grade the library itself, as a UI/UX expert (shared) | Design system | UX evaluation, library specs |
| **requirements-to-prototype** | Turn the requirements doc into one interactive prototype | `design_requirements.md` | `prototype_<date>.dc.html` |

Both are marked `"standalone": true`: nothing depends on either, and `/run-prd-workflow` runs
neither. Invoke them directly.

`/evaluate-design-system` grades the *library*, which is not a PRD-relative question — whether it has
focus states, a coherent spacing scale, adequate contrast, composable primitives is the same answer
for every PRD. It has its own audience and its own cadence: you read it to decide what to invest in
the design system, not every time a feature ships.

`/requirements-to-prototype` is standalone for two independent reasons. It is a **parallel deliverable
to the Figma build, not a step in it** — it does no Figma writes, and gate 3 signs off Figma frames
rather than the prototype. And it needs `dc_write` and `ready_for_verification`, which exist only
in environments with Design Component tooling; as a non-standalone stage, a missing tool would fail
every single run on a deliverable that run never asked for. It does still require **gate 1** — a
prototype is a thing people look at and form opinions from, so building one out of unvalidated
requirements propagates that reading further and faster than any JSON artifact would. Gate 2 is
deliberately *not* required: it approves a Figma build checklist, and this stage does no Figma writes.

---

## Data Flow Diagram

```
PRD Analysis
    │
    ├─▶ Requirements Extract
    │       ├─ List of PRD requirements, atomized one need per line
    │       ├─ Screen descriptions
    │       ├─ User flows
    │       ├─ Use cases
    │       ├─ unverified_prd_claims[] — the PRD's own component/page claims,
    │       │   quarantined for verification against the live file (required,
    │       │   so an empty array is a positive claim, not an omission)
    │       └─ open_decisions[] — RAISED, with options and a recommendation
    │
    ├─▶ Design Requirements (prose)
    │       ├─ Overview and objectives
    │       ├─ Personas / roles table
    │       ├─ Common and Special user flows
    │       ├─ Pages / Frames, and the components each frame NEEDS
    │       ├─ Assembly
    │       └─ §8 Open decisions, each RAISED as a packet for gate 1
    │           (feeds screen planning as context; never replaces it —
    │            the numbered JSON stays authoritative)
    │
    ├─▶ Screen Planning  (still phase 1 — the PRD only, no Figma input)
    │       ├─ Map requirements to screens
    │       ├─ List required elements per screen, each with a requirement_link
    │       ├─ Identify states and interactions
    │       └─ Create screen specifications
    │
    ├─▶ ══ GATE 1 (HUMAN) ══  the requirements AND the plans, together
    │       ├─ atomized · flows_broken_to_frames · ambiguity_flagged ·
    │       │   prd_claims_quarantined · screens_cover_requirements
    │       │   — recorded as booleans
    │       ├─ screens_cover_requirements: every requirement id appears as
    │       │   some element's requirement_link — the unmapped ids NAMED,
    │       │   not counted. The only place that comparison is ever made
    │       ├─ Every raised decision, with the ANSWER a person gave
    │       ├─ A requirement hand-edited here is changes_requested, never an
    │       │   approval — the plans were built from the superseded text
    │       └─ approve ─▶ phase 2 · changes_requested ─▶ back to phase 1
    │
    └─▶ Screen Validation  (phase 2 — requires gate 1)
            ├─ Check all requirements covered
            ├─ Flag missing/incomplete elements
            ├─ Generate recommendations
            └─ Approve/reject plans

Design System Analysis
    │
    ├─▶ Load Components
    │       ├─ Fetch design system
    │       ├─ Parse components
    │       ├─ Extract variants/properties
    │       └─ Document design tokens
    │
    └─▶ Component Analysis
            ├─ mapping_table: ONE ROW PER REQUIREMENT, with exactly one of
            │   direct-match / match-with-modification / combinable-match / no-match
            ├─ evidence per row (variants_checked for a direct match; the
            │   nested-children walk for a no-match — "keyword-search-only"
            │   is rejected by gate 2)
            ├─ prd_label_was: the PRD's "existing vs. new" claim, kept beside
            │   the verified answer, because those labels are unreliable
            ├─ Compare screen needs vs. available
            ├─ Identify coverage gaps
            ├─ Flag missing variants
            ├─ Escalate product-level conflicts for gate 2
            └─ Score component adequacy

Coverage Analysis
    │
    ├─▶ Scoring
    │       ├─ Calculate component coverage %
    │       ├─ Score by category (buttons, forms, etc.)
    │       ├─ Analyze by screen
    │       └─ Prioritize gaps
    │
    └─▶ Gap Analysis
            ├─ List missing components
            ├─ List needed extensions
            ├─ Prioritize by impact
            └─ Create implementation roadmap

Output Generation
    │
    ├─▶ PDF Report
    │       ├─ Executive summary
    │       ├─ Detailed findings
    │       ├─ Visual charts
    │       └─ Roadmap
    │
    ├─▶ Build Checklist  (phase 2 — nothing written to Figma yet)
    │       ├─ Spec the missing components (extend ▶ combine ▶ net-new)
    │       ├─ Spec the screens they assemble into (required, even with zero
    │       │   component gaps)
    │       └─ 11_build_phase.json
    │
    ├─▶ ══ GATE 2 (HUMAN) ══
    │       ├─ Every requirement has a status; every gap a real resolution path
    │       ├─ Every escalated product decision has an ANSWER
    │       └─ approve ─▶ WRITE ACCESS · changes_requested ─▶ back to phase 2
    │
    ├─▶ Figma Build  (phase 3)
    │       ├─ Component pass, once: create the approved components, bind tokens
    │       ├─ Then ONE page: assemble it from named instances — and stop
    │       ├─ 12_figma_build.json written incrementally, with pages_remaining
    │       └─ A gap gate 2 missed ──▶ discovered_gaps, a STOP not an improvisation
    │
    ├─▶ ══ GATE 3 (HUMAN), ONE DECISION PER PAGE ══
    │       ├─ approve ─▶ next page · changes_requested ─▶ the SAME page again
    │       ├─ --manually-edited ─▶ re-inspect that frame live, downstream
    │       └─ Satisfied only when EVERY page is approved
    │
    │       └─ THE LAST check against what was built — no audit stage follows
    │
    ├─▶ Handoff & Close  (phase 4)
    │       ├─ Per-page specs: layout, tokens, props/variants, states,
    │       │   breakpoints, edge cases — linked to the LIVE frames
    │       ├─ Change-log of every component created during assembly
    │       └─ Decision ledger: the answer given at each gate, by whom,
    │           the recommendation it was chosen from, and reversible_by
    │
    └─▶ Data Exports
            ├─ Screen plans (JSON)
            ├─ Coverage analysis and mapping table (JSON)
            ├─ Gate signoffs G1 / G2 / G3 (JSON)
            ├─ Build log (JSON)
            ├─ Developer handoff (JSON + Markdown)
            └─ Recommendations (JSON)

Parallel deliverable (standalone, invoke directly)
    │
    └─▶ Interactive Prototype
            ├─ Reads design_requirements.md, not 03_screen_plans.json
            │   (which stores layout as a bare string with no geometry)
            ├─ Every page/frame becomes a STATE of one .dc.html file
            ├─ The personas table becomes a role switcher
            └─ Each role's distinctions become can* permission booleans
```

---

## Configuration Files

### `.env` - Environment Configuration
```bash
FIGMA_API_TOKEN=your_token_here
DESIGN_SYSTEM_URL=https://...
OUTPUT_FOLDER=./reports
PDF_FORMAT=full
AUTO_CREATE_COMPONENTS=false
APPLY_DESIGN_TOKENS=auto
```

### `.claude/` - Skills & Workflows
```
.claude/
├── pipeline.json                       # Dependency graph: what each stage needs and produces
├── schemas/
│   └── artifacts.json                  # Enforced shape of every artifact, keyed by filename
├── skills/
│   ├── design-system-loader/SKILL.md        # phase 2 — shared, so not gate-gated
│   ├── figma-extractor/SKILL.md             # phase 2 — requires gate 1
│   ├── prd-analyzer/SKILL.md                # phase 1
│   ├── prd-design-requirements/SKILL.md     # phase 1 — PRD only, no Figma reads
│   ├── screen-planner/SKILL.md              # phase 1 — PRD only, and BEFORE gate 1
│   ├── gate-1-requirements/SKILL.md         # ══ HUMAN GATE ══ closes phase 1
│   ├── screen-validator/SKILL.md            # phase 2 — requires gate 1
│   ├── component-analyzer/SKILL.md          # phase 2 — the mapping table; requires gate 1
│   ├── coverage-scorer/SKILL.md             # phase 2
│   ├── coverage-reporter/SKILL.md           # phase 2
│   ├── figma-modifier/SKILL.md              # phase 2 — the build checklist
│   ├── gate-2-mapping/SKILL.md              # ══ HUMAN GATE ══ closes phase 2
│   ├── gate-3-pages/SKILL.md                # ══ HUMAN GATE ══ one per PAGE
│   ├── developer-handoff/SKILL.md           # phase 4 — what engineering builds from
│   ├── closure-reporter/SKILL.md            # phase 4 — what was decided
│   ├── run-prd-workflow/SKILL.md
│   ├── evaluate-design-system/SKILL.md      # standalone
│   └── requirements-to-prototype/SKILL.md   # standalone
└── workflows/
    └── prd-to-figma.js
```

The three gate skills prepare the packet, present it and ask. They never write their own artifact:
`pipeline.mjs gate` does, and `pipeline.mjs done` refuses them.

`/figma:figma-use` has no directory here: it ships with the Figma plugin rather than this repo, which
is what the `figma:` prefix means. Its stage is declared `"external": true` in `pipeline.json`, and
whoever invokes it writes `12_figma_build.json` afterwards, since the external skill will not.

---

## Usage Patterns

### Pattern 1: Complete Run (with the three stops)
```
/run-prd-workflow
↓
[Phase 1 runs — the PRD only, no Figma reads]
↓
══ GATE 1 ══  you approve, or send it back
↓
[Phase 2 runs — live inspection, then analysis]
↓
══ GATE 2 ══  you approve the build checklist (or nothing is written to Figma)
↓
[Phase 3: one page assembled]
↓
══ GATE 3 ══  you approve that page  →  repeat until every page is approved
              (the last check on what was built — no audit stage follows)
↓
[Phase 4: handoff + closure]
↓
[Outputs: PDFs + handoff + Figma + JSON files]
```

### Pattern 2: Focused Analysis
```
/prd-analyzer "prd.pdf"
↓
[Review output — including unverified_prd_claims[] and the raised decisions]
↓
/prd-design-requirements
↓
[Review design_requirements.md — personas, flows, frames, components, §8]
↓
/screen-planner             ← still phase 1: the PRD only, and BEFORE the gate
↓
[Review screen plans]
↓
/gate-1-requirements        ← required before phase 2; answer every §8 item, and
                              check the plans cover every requirement id
↓
/screen-validator
↓
[Approve/iterate]
```
The planner runs before the gate on purpose: gate 1 signs off the requirements **and** the plans
built from them, and `screens_cover_requirements` is the only check that ever compares the two.

### Pattern 3: Component Coverage Only
```
/design-system-loader "system_url"
↓
/component-analyzer
↓
[Review the mapping table: one row per requirement, with evidence]
↓
/coverage-scorer
↓
[Check coverage %]
```
`/component-analyzer` holds its own **direct** edge to gate 1 — and needs `/screen-planner`, which
runs in phase 1 in front of that gate — so this pattern still passes through the first gate, and
plans the screens on the way. Run `node utils/pipeline.mjs plan component-analyzer` and it will
tell you.

### Pattern 3b: Analysis Only, Nothing Written
```
/run-prd-workflow
↓
══ GATE 1 ══  approve
↓
[Phase 2 runs: coverage PDF + build checklist]
↓
══ GATE 2 ══  DON'T approve
↓
[Read the coverage report. Your Figma file is untouched.]
```
A perfectly good use of this workflow, and the reason gate 2 exists where it does.

### Pattern 4: Update & Compare
```
1. /run-prd-workflow [Initial analysis]
2. Update design system
3. /design-system-loader --force [Reload the remote library]
4. /coverage-scorer [Compare new coverage]
5. Approve improvements
```

### Pattern 5: Interactive Prototype
```
/prd-design-requirements
↓
[Review the Pages/Frames and Personas sections — they are the brief]
↓
/gate-1-requirements   ← required: don't prototype an unvalidated reading
↓
/requirements-to-prototype
↓
[Drive the .dc.html: the role switcher changes permissions,
 every frame is a state of the same file]
```
Standalone, and parallel to the Figma build rather than part of it. Needs an environment with
Design Component tooling (`dc_write`, `ready_for_verification`).

### Pattern 6: Grade the Library
```
/design-system-loader
↓
/evaluate-design-system
↓
[Review what the LIBRARY lacks — not what a given PRD is missing]
```
Standalone, and shared: the verdict does not vary per PRD, so one grading serves every feature.

---

## Integration Points

### Inputs
- 🔗 **Figma** - URL to design file
- 📄 **Documents** - PDF, Word, Markdown, plain text
- 🔗 **URLs** - Design system, external references
- 📋 **Copy/Paste** - Direct text input

### API Integrations
- 🎨 **Figma API** - Extract designs, create components
- 📝 **Document Processing** - Parse PDFs, Word docs
- 🌐 **HTTP** - Fetch design system specs

### Outputs
- 📊 **PDF Reports** - Coverage report, and the closure report that ends the run
- 📝 **Design Requirements** - `design_requirements.md`, the designer-facing reference and source of
  record
- 📄 **Design Requirements (Word)** - `design_requirements.docx`, the categorized document reviewed —
  and redlined — at gate 1
- ✍️ **Gate Signoffs** - G1 / G2 / G3: who approved what, when, and every answer given
- 🎨 **Figma Components & Screens** - Created in the design file **behind gate 2**, assembled page by
  page **behind gate 3**
- 📦 **Developer Handoff** - `handoff_<date>.md`, per-page specs plus the assembly change-log
- 🖥 **Interactive Prototype** - `prototype_<date>.dc.html`, from the standalone stage
- 💾 **JSON Data** - Machine-readable results
- 📋 **Summaries** - Quick reference insights

---

## Key Metrics

### Coverage Score
- **Overall %** - How well design system covers requirements
- **By Category** - Component, state, interaction coverage
- **By Screen** - Coverage per screen
- **Trend** - Improving vs. declining

### Gap Analysis
- **Critical** - Blocks core features
- **High** - Important for UX
- **Medium** - Nice to have
- **Low** - Polish/refinements

### Implementation Roadmap
- **Phase 1** - Critical components (2-3 weeks)
- **Phase 2** - High-priority extensions (1-2 weeks)
- **Phase 3** - Low-priority enhancements (1 week)

---

## File Locations

```
prd-to-ui-workflow/
├── README.md                    # Full documentation
├── QUICKSTART.md               # Get started guide
├── CLAUDE.md                   # Project config
├── WORKFLOW_OVERVIEW.md        # This file
├── .env.example                # Configuration template
├── .env                        # Your configuration (create from .example)
├── .claude/
│   ├── pipeline.json           # Dependency graph
│   ├── schemas/
│   │   └── artifacts.json      # Enforced artifact contract
│   ├── skills/                 # One directory per skill, each with a SKILL.md
│   │   └── */SKILL.md
│   └── workflows/              # Workflow scripts
│       └── prd-to-figma.js
├── utils/
│   └── pipeline.mjs            # Resolver: plan / status / validate / done / path / graph
│                               #   + gate / next-page / pages  (the human gates)
├── prds/                       # Input PRDs (a pasted PRD is saved here first)
├── examples/                   # Sample files
│   ├── sample-prd.md
│   └── sample-design-system.md
└── reports/                    # OUTPUT ONLY, not committed — one folder per feature
    ├── _shared/                #   design system and its evaluation, cached once
    │   ├── 05_design_system.json
    │   └── 08_ux_evaluation.json
    └── <feature>/
        ├── 01_prd_requirements.json … 15_developer_handoff.json
        ├── G1_requirements_signoff.json    # written by `pipeline.mjs gate`,
        ├── G2_mapping_signoff.json         #   never by a skill
        ├── G3_page_signoffs.json           #   one entry per page
        ├── design_requirements.md          # the source of record
        ├── design_requirements.docx        # what the gate 1 reviewer opens
        ├── coverage_report_*.pdf
        ├── handoff_*.md
        ├── closure_report_*.pdf
        ├── prototype_*.dc.html      # standalone stage, when it has run
        └── .pipeline-state.json     # which inputs each stage was built from
```

---

## Next Steps

1. **Setup**: Copy `.env.example` to `.env` and add your API tokens
2. **Test**: Run with sample files in `examples/` folder
3. **Use**: Run `/run-prd-workflow` with your actual PRD and design system
4. **Iterate**: Use feedback to improve designs and system
5. **Maintain**: Keep design system updated with new components

---

## Troubleshooting Checklist

- [ ] `.env` file created with valid tokens
- [ ] Figma URL is complete (includes file ID)
- [ ] PRD source is accessible (file exists or URL works)
- [ ] Design system URL is valid
- [ ] Output folder has write permissions
- [ ] No special characters in file paths
- [ ] `node utils/pipeline.mjs status` — is the run *parked at a gate* rather than broken?
- [ ] Nothing built in Figma? Check `gate 2` — until it reads `approved`, that is correct behaviour
- [ ] Gate won't open after `--approve`? A raised decision still has an empty `answer`, or the
      approval went stale because an artifact it signed off was regenerated
- [ ] `next-page` refusing? An earlier page is still undecided — `pages` shows which
- [ ] `done` refused a gate? Correct — use `gate <n> --approve --by "<person>"`
- [ ] Review error messages for specific issues

---

For detailed instructions, see:
- 📖 [README.md](README.md)
- ⚡ [QUICKSTART.md](QUICKSTART.md)
- ⚙️ [CLAUDE.md](CLAUDE.md)

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
