# Claude Code Project Configuration

## Project: PRD-to-UI Workflow

PRD to developer handoff: **four AI phases held apart by three human validation gates.** It maps every
requirement onto the design system, builds the missing pieces in Figma one page at a time, and packages
the approved module for engineering.

**This pipeline is not unattended, and that is deliberate.** It stops at least three times — at the
requirements, at the components as they exist in live Figma, and after every single assembled page —
and waits for a person. Parking at a gate is a correct outcome, not a stall.

**Phase 2 has one gate, and it reviews built components rather than the plan for them.** There was
once a second gate here signing off the mapping table and the build checklist before anything was
written. It was removed deliberately, and the trade is worth understanding rather than discovering: a
checklist review judges a claim about components that do not exist yet, while gate 2 now judges the
components themselves — variants, token bindings, naming, library location — which is the evidence
that actually settles the question. What is lost is real and is stated wherever it matters below: the
component pass **writes to Figma before any human approves**. Nothing gates the *creation* of
components. Gate 2 governs whether they may be **used**, so a defect is corrected by sending the
component pass back rather than by never having built it.

### Quick Commands

```bash
# PHASE 1 — requirement extraction (PRD only — no Figma reads)
/prd-analyzer              # Atomize the PRD; quarantine its own claims; raise open decisions
/prd-design-requirements   # PRD → design-ready doc: personas, flows, frames, components
/screen-planner            # Plan screens from the requirements — still PRD-only, still before the gate

/gate-1-requirements       # ══ HUMAN GATE ══ validate the requirements AND the screen plans

# PHASE 2 — live inspection, design system mapping, then the component build
/design-system-loader      # Load design system components (shared across features)
/figma-extractor           # Extract screens from Figma
/screen-validator          # Validate screen plans
/component-analyzer        # Map every requirement: direct / modify / combine / no match
/coverage-scorer           # Calculate coverage metrics
/coverage-reporter         # Generate PDF report
/figma-modifier            # Spec the missing components AND the screens — the BUILD CHECKLIST
/figma-component-pass      # External (loads /figma:figma-use) — components/variants, then STOP
                           #   NOTE: no gate in front of it — these Figma writes are unreviewed

/gate-2-components         # ══ HUMAN GATE ══ inspect the components as live Figma NODES

# PHASE 3 — screen assembly, ONE PAGE AT A TIME
/figma:figma-use           # External (Figma plugin) — one page, then stop
/gate-3-pages              # ══ HUMAN GATE ══ one decision PER PAGE — and the LAST check on the build

# PHASE 4 — handoff
/developer-handoff         # Per-page specs, tokens, props, states, edge cases, change-log
/closure-reporter          # Final PDF: what was added, what is missing, which decisions were taken

# Run the whole thing (halts at each gate)
/run-prd-workflow

# Standalone — in the graph, but NOT part of the workflow above; invoke directly
/evaluate-design-system    # Grade the library as a UI/UX expert; spec what it lacks (shared)
/requirements-to-prototype # Build the requirements doc into ONE interactive .dc.html prototype
```

### Skill Dependencies (auto-resolved)

Skills are not independent — most need artifacts produced by earlier skills. **Any skill invoked on its own must
resolve its own prerequisites first.** The graph and the artifact contract live in one place:
[`.claude/pipeline.json`](.claude/pipeline.json), read by [`utils/pipeline.mjs`](utils/pipeline.mjs).

```bash
node utils/pipeline.mjs plan <skill>       # what must run before <skill>, in order
node utils/pipeline.mjs status             # which stages are done, stale, or invalid
node utils/pipeline.mjs check              # validate the manifest: cycles, missing schemas, unreachable stages
node utils/pipeline.mjs validate <skill>   # do its artifacts exist and match their schema?
node utils/pipeline.mjs done <skill>       # validate, then record the inputs it was built from
node utils/pipeline.mjs path --ensure      # this run's output folder, created if missing
node utils/pipeline.mjs projects           # features that already have output
node utils/pipeline.mjs graph              # the full dependency graph
node utils/pipeline.mjs log "<what happened>" [--stage <skill>] [--kind build|decision|note]
```

`plan`, `done`, `gate`, `next-page` and `path --ensure` all write themselves into
**`reports/<feature>/workflow_log.md`** — the per-PRD record of every step, skill and action, and the first
thing to read when picking a run up. `log` is for what the CLI cannot see: Figma writes, escalations,
decisions taken in conversation. See "`workflow_log.md` — read this before anything else" below.

Gates are recorded with their own commands, never with `done`:

```bash
node utils/pipeline.mjs gate 1                          # where does this gate stand?
node utils/pipeline.mjs gate 1 --approve --by "<person>" --checked all --note "..."
node utils/pipeline.mjs gate 2 --changes-requested --by "<person>" --note "what to rebuild"
node utils/pipeline.mjs gate 2 --approve --by "<person>" --checked all    # the live components
node utils/pipeline.mjs gate 3 --init                   # seed the page roster from the checklist
node utils/pipeline.mjs gate 3 --page "<name>" --approve --by "<person>" [--manually-edited]
node utils/pipeline.mjs next-page                       # the ONE page assembly may work on
node utils/pipeline.mjs pages                           # the per-page decision ledger
```

### Four phases, three human gates

```
   PHASE 1  requirement extraction ····· the PRD and nothing else — NO Figma reads
              │      ↳ /prd-analyzer · /prd-design-requirements · /screen-planner
              │
   ══════════ GATE 1 (HUMAN) ══════════ ──(changes)──► back to phase 1
              │ approved requirements AND screen plans
   PHASE 2  live inspection ····· /design-system-loader · /figma-extractor
              │      ↳ every read of the live file happens HERE, behind gate 1
            design system mapping → the build checklist
              │
            component pass — builds the specified components/variants ONLY
              │                          [UNGATED WRITES: this is the one place the
              │                           pipeline writes to Figma unreviewed]
   ══════════ GATE 2 (HUMAN) ══════════ ──(changes)──► back to the component pass
              │ approved live components   [inspected as NODES, not as a plan]
   PHASE 3  screen assembly — ONE PAGE AT A TIME
              │
   ══════════ GATE 3 (HUMAN) ══════════ ──(edit)──► same page
              │ approve ──► more pages? ──yes──► next page
              │ no — every page approved   [the LAST look at what was built]
   PHASE 4  /developer-handoff · /closure-reporter
```

**A gate is a stage in the graph, not a paragraph in the orchestrator.** The graph is the only thing
every entry point respects: a gate living only in `/run-prd-workflow` would be bypassed by every direct
invocation of a downstream skill, which is most of how these skills actually get used. So
`/figma-extractor`, `/screen-validator` and `/component-analyzer` each **require**
`gate-1-requirements`, `/figma:figma-use` requires `gate-2-components`, and `/developer-handoff`
requires `gate-3-pages`. `/figma-component-pass`
deliberately requires **no** gate — it is the stage whose output gate 2 exists to review, so a gate in
front of it would be a cycle. `/screen-planner` requires no gate either, for the mirror-image reason:
it is phase 1's last stage and an *input* to gate 1, so an edge there would be a cycle too. Phase 2 used
to be gated on that single stage; when it moved in front of the gate, the edge had to be re-placed onto
the three stages that no longer inherited one, which is why there are three now instead of one. `check` reports an **error** if any phase-N+1 stage fails to depend — even transitively
— on the gate closing phase N; that edge is impossible to eyeball, because a stage can sit visibly
after a gate in `order` and `status` while its dependency chain reaches back around it.

Two rules make a gate a gate:

**`done` refuses a gate.** `done` is the reflex every other skill ends with, so a gate that accepted it
would be closed by habit rather than by a decision. Only `pipeline.mjs gate` writes a signoff, `--by`
is required, and `claude`, `ai`, `assistant`, `auto`, `self` and friends are rejected outright. A gate
signed by the thing being gated is not a gate.

**Validating is not passing.** Everywhere else in this resolver "the file exists and matches its
schema" is the whole test. A gate artifact validates whatever the verdict is — a rejection is a
well-formed decision record — so the gate is satisfied only when the recorded verdict is `approved`.
Reusing the normal test would open a gate on the strength of having been *answered*.

Beyond that, three checks exist because each failure was silent:

- **A gate cannot pass with an open decision unanswered, or a check unconfirmed.** `--approve`
  records, and then the gate *still* refuses to open and names the decisions whose `answer` is empty
  or the checks that are not `true`. This is the governance failure signal for gates 1 and 2 — a
  checklist approved while a "needs product decision" item is still open — and it fires even after an
  explicit approval. Each gate's checks are declared in `pipeline.json` (`checks: [...]`), and
  `--checked all` / `--checked "a,b"` is how the person's confirmation is recorded. Declaring them in
  the manifest is also what lets the command write a **schema-valid** signoff: it used to write
  `checked: {}`, which the schema rejects, so every approval the tool recorded was invalid and
  hand-writing the artifact was the only way to produce a valid one — exactly backwards.
- **A signoff that does not match its contract does not open the gate.** `plan` used to read the
  verdict alone, so it reported READY while `validate` reported INVALID: three commands, three answers,
  and the permissive one deciding.
- **An approval goes stale.** Regenerate an artifact the gate signed off and `plan` reports the gate as
  needing to be re-taken. Gate 2 additionally pins `checklist_fingerprint` — a **content hash**, not
  size+mtime, because an edit of the same length with the mtime restored was invisible and `cp -p`,
  `rsync -t` and archive extraction all restore mtimes incidentally. Unlike every other staleness
  check here, this one ignores `--no-stale`: that flag means "reuse cached work rather than rebuilding
  it", which is a statement about compute, and a flag about caching must not revoke a person's
  judgement. While it honoured the flag, `--no-stale` turned "a human must re-approve this" into
  `READY: yes`.
- **`changes_requested` sends the phase back.** `plan` marks the gate's own dependencies `run` again —
  that is the backwards arrow in the chart, and every verdict stays in `history`, because a gate that
  bounced twice before passing is a different fact from one that passed first time.

`--force` does **not** re-open a gate, and neither does `--no-stale`. A gate closed by a person stays
closed until it goes stale or is re-taken.

**What this does not achieve, stated plainly.** `done` refusing a gate is a *boundary*, not a control.
An agent that can write files can write a signoff directly, and nothing here signs, MACs or
append-only-logs the record. What the design buys is that closing a gate requires a deliberate,
conspicuous act that no normal instruction leads to — every reflex, every hook message and every
`plan` output pushes the other way. It does not make self-approval impossible, and it should not be
described as if it did.

### Gate 2 reviews components, not the plan for them

Building components and assembling pages out of *instances* of them fail differently, and the gate sits
between the two. A component that read correctly on the checklist can still be misnamed, missing a
variant, unbound from its tokens, or sitting in the wrong library location once it actually exists as a
node. None of that is visible in a plan, all of it is cheap to fix before anything is built on top of
it, and once a page is assembled the defect is behind a screen that looks finished. So
`figma-component-pass` builds the components and stops, **`gate-2-components`** inspects the real
nodes, and only then does page assembly begin.

**What this arrangement gives up.** Because the review is of built components, the build is not
reviewed first: the component pass writes to Figma with no signoff in front of it. Two protections the
old checklist gate carried are therefore gone, and neither should be discovered later by surprise:

- **An unapproved component is created, then caught.** `discovered_gaps` with
  `action: "stopped-and-flagged"` is still the required move when assembly reveals something the
  checklist missed — but nothing now prevents a wrong component from existing in the file in the first
  place. Gate 2's `no_unapproved_component_changes` check is what catches it, *after* the write.
- **A product decision has no gate.** `/component-analyzer`'s `escalation` — a taxonomy or data-model
  conflict — used to be a decision packet that gate 2 refused to open around while it was unanswered.
  No gate seeds decisions now, so an escalation is raised in `06_component_analysis.json`, surfaced in
  the gate 2 packet by convention rather than by enforcement, and otherwise appears only in the closure
  report. If it matters, it has to be raised out loud.

The component pass and page assembly both load `/figma:figma-use` but are **separate stages with
separate artifacts**
(`12a_figma_components.json` and `12_figma_build.json`) and separate handles. That matters
operationally: `command` must be unique, because the resolver finds a stage by first match, so while
both claimed `figma:figma-use` there was no way to address the component pass at all — `done
figma:figma-use` recorded the *page* stage, `12a_figma_components.json` was never marked done, and
every resume rebuilt the components. The component pass now declares `invokes` (which skill to load)
and is addressed by its own key; `check` errors on a duplicate `command`.

A gate is addressed by its declared `gate_id` — `1`, `2`, `3` — and **never** by its phase, even though
the two currently agree again. They have already come apart once: while phase 3 briefly held two gates,
the shorthand resolved a number against `phase` and `gate 3` began addressing the component gate, so
every documented `gate 3 --page ... --approve` hit the wrong gate and nothing said so. The ids are
declared, and `check` errors on a missing or duplicated `gate_id`, so the next time they diverge it is
a manifest error rather than a silent misroute.

### Phase 3 has the one hard rule

> **Phase 3 never advances past an unapproved page.**

`gate-3-pages` carries `"per_item": "pages"`: one decision per page, and the gate is satisfied only
when **every** page is approved. `next-page` names one page, lists the rest under `NOT YET`, and
refuses to name a second while one is undecided — the rule as a command that exits non-zero, rather
than as a paragraph that gets skimmed.

The page roster is seeded from `11_build_phase.json`'s `screens` — the **gate-2-approved checklist**,
not from whatever assembly built. Seeded from the build, a page that was silently dropped would never
appear as pending, and the module would read as fully approved with a page missing. That source is
**declared** on the stage (`roster_source`, `roster_field`, `roster_item_key`) rather than assumed by
the resolver, and `check` errors on a per-item gate that omits it: a roster pointed at the wrong
artifact is precisely the failure above, and it is not visible in any output once it has happened.

`12_figma_build.json` is therefore written **incrementally** — after the component pass, then after
each page — and carries `pages_remaining`. An end-of-run write could only exist after every page was
built, which is the state the gate exists to prevent, so it would have made the gate unenforceable.

`pages` flags an approval recorded while an earlier page was still pending. It is not refused — a
designer reviewing page 3 first is making a real decision — but it is never left silent, because after
the fact that ledger is the only evidence the rule was followed.

Assembly is bound by three things, each from a real failure: **only checklist-approved components** (a
gap gate 2 missed is a *stop* into `discovered_gaps`, not an improvisation — an improvised component is
indistinguishable from an approved one once it is in the file); **bind tokens, never hardcode where one
exists**; **honour earlier naming and retirement decisions**. And `--manually-edited` on a page signoff
obliges assembly *and* phase 4 to re-inspect the frame live: gate 3 explicitly permits a designer to
hand-edit a frame, which is where the "spec built from a stale frame" failure starts.

### Decisions are raised by the AI and taken by a human

This reverses what this pipeline used to do, and the reversal is worth understanding rather than just
obeying. The old rule was that the workflow takes the recommended option rather than stalling, on the
grounds that a workflow which halts on every open question never finishes. That was the right answer
for an **unattended** run and the wrong answer once a gate exists: a default taken in phase 1 is a
decision made before the person accountable for it ever saw the question.

So `/prd-analyzer`'s `open_decisions[]`, `/prd-design-requirements` §8 and `/component-analyzer`'s
`escalation` all produce a decision **packet** — options, a recommendation, and the consequence of each
— and none of them has a `taken` field. The human answers at gate 1 or gate 2, and the gate record
keeps `recommended` beside `answer` **specifically so that a human choosing against the recommendation
survives**.

`/closure-reporter` therefore builds `open_decisions[]` from the **gate records**, with §8 supplying the
question and the options. Re-deriving them from the PRD yields a list of what the workflow *should* have
decided, which reads identically to the truth and is wrong wherever the human chose differently.
`01_prd_requirements.json` is still read, but to catch **omissions**: a PRD decision in no gate record
was answered by nobody, and that is itself a finding. `/closure-reporter` adds `reversible_by` — what
changing a decision would now cost, only knowable once the thing is built — and remains the sole owner
of `14_closure_notes.json`.

An **ambiguity that is really a product decision gets escalated, not designed around.** A taxonomy or
data-model conflict is not a component problem: the `kind`/`category` conflict against
`Notification Types` was correctly escalated, and Customizable Dashboards' complete absence of any
data-bound chart-rendering component was systemic across multiple frames. Forcing a combinable match
that does not hold ships the conflict into the build.

### Every blocking question is asked as a popup, never as prose

Anything that stops the run from moving to the next phase — a gate verdict, a gate's checks, an open
decision, an input `plan` reports `NOT SET` — is asked with **`AskUserQuestion`**, and the answer that
comes back is what gets recorded. Not a paraphrase of a chat reply, not a default taken because the
reply was ambiguous.

The reason is the same one behind `--by` being required and `claude`/`ai`/`auto` being rejected. A
decision asked as prose in a wall of packet text is a decision *you* resolve when you translate the
reply into a command — and an open decision buried in paragraph four simply stops being mentioned. In
a popup an unanswered question is visibly unanswered, and a check the person did not confirm comes
back unselected, which is an honest record and a gate that correctly stays shut.

Every gate popup carries, at minimum:

- **the verdict** — approve / request changes / reject (at gate 3, for **that page only**);
- **the gate's checks as a multi-select**, where it declares any — gate 1's four and gate 2's five.
  What the person selects is exactly what goes in `--checked`; nothing is pre-selected for them;
- **one question per open decision**, where the gate seeds them. Gate 1 is the gate that does, and it
  is declared as `seeds_decisions` in `pipeline.json` rather than inferred, so `plan` and the prereq
  hook both demand it. Options carry the consequence in their `description`, the recommendation is
  labelled and listed first, and it stays a recommendation;
- **who is approving** — asked at every gate, *every time it is taken*, including once per page at
  gate 3. Never carried over from an earlier gate, never taken from the git author or the session
  user, never supplied by you. That name is the only evidence a person was present at **that**
  decision, and a name captured once and stamped onto nine pages records nine decisions where one was
  made.

`AskUserQuestion` allows four questions per call, so a gate with several open decisions needs several
calls: ask the **decisions first**, then the verdict and checks. Approving a requirement list whose
internal questions are still open is not a thing a person can meaningfully do, and asking in that order
makes the dependency obvious rather than leaving them to notice it.

The popup carries the decision, not the evidence. The packet — the requirement list, the live node
URLs, the frame screenshot and node id, the tokens bound, the values you had to hardcode — still goes
in the chat message above it. Four short options with no packet in front of them is a question being
approved, not a page.

### Six cross-phase rules, each from a real incident

These bind every phase, and none of them is generic advice — each has caused a real problem here:

1. **Never trust embedded analysis in an uploaded document.** A PRD arrived with a pre-filled
   components section and Figma page references that were **entirely fabricated** — none of the
   referenced pages existed. Anything of that kind in a PRD goes into
   `01_prd_requirements.json`'s `unverified_prd_claims[]` and is verified against the live file, never
   laundered into `requirements[]`. The array is *required*, so an empty one is a positive claim rather
   than an omission.
2. **"Existing vs. new" labels from a PRD are unreliable.** Notification Center had items marked "new"
   that were already fully assembled composites; trusting the label would have produced duplicates.
   `06_component_analysis.json` keeps the label in `prd_label_was`, beside the verified answer.
3. **Absence from a keyword search is not absence from the file.** The bell icon was reported missing
   from `Icons/General` while nested inside the `Notification Bill` component set. `evidence.method:
   "keyword-search-only"` is rejected by gate 2, and `search_design_system` searches *published*
   libraries only — most in-house systems keep components on a file's own pages.
4. **Prefer slot-based, system-wide reusable architecture.** Module-specific is a last resort you
   justify in `scope_rationale`, not a default. Gap resolution runs **extend → combine → net-new**, and
   `resolution_path` records which.
5. **Resolve ambiguous decisions in context, not speculatively.** If a decision genuinely depends on
   work not yet done, defer it explicitly rather than guessing now.
6. **Design system state has a shelf life.** The Reconnecting banner was recorded as having no adequate
   Alert state; a later live look found an `Alerts → State=Info` variant had since been added.
   `design-system-loader`'s `max_age_days: 7` is that rule mechanized.

### A "direct match" is a claim about variants, not resemblance

`06_component_analysis.json` requires a **`mapping_table`: one row per atomized requirement**, not one
per component. It was absent before, and the absence mattered: the artifact described the *design
system* — which components exist, which are covered — but never answered "does requirement R map to
component C, and how do we know". Coverage bucket arrays cannot answer it, because they lose the
requirement, so a requirement never mapped at all was invisible in them, and gate 2's first success
criterion (every requirement appears in the table) was not checkable.

Every row carries one of four statuses — `direct-match`, `match-with-modification`,
`combinable-match`, `no-match` — and its own `evidence`, because two of those statuses have been wrong
here. A direct match needs `evidence.variants_checked`: "it's a button" says nothing about whether the
variant, state, icon support and content behaviour the requirement needs actually exist, and a match
asserted from family resemblance only surfaces as wrong during assembly, *after* the checklist was
signed off. A no-match needs its nested-children walk recorded (see rule 3).

### Two rules that make resume trustworthy

**A stage is done only when its artifacts exist *and* validate.** The required shape of every artifact
lives in [`.claude/schemas/artifacts.json`](.claude/schemas/artifacts.json), keyed by filename, and the
resolver checks it. Existence alone was never evidence: a skill that wrote `{}` used to mark itself
complete and hand the mess to everything downstream. A rejected artifact now reports the stage as
invalid and re-runs it.

**Every skill ends with `node utils/pipeline.mjs done <stage>`.** That validates the artifact and
records the inputs it was built from. The recording is what makes an edited PRD invalidate
`/prd-analyzer` and every stage built on it — without it, changing the PRD and re-running silently
produced a report for the previous one, because artifact mtimes say nothing about whether the source
still matches. Skip `done` and the stage is treated as stale and redone.

`--force` is only for what no local check can see: the Figma file or the design system library edited
remotely under an unchanged URL.

### What is PRD-relative, and what is not

This distinction decides a stage's `scope`, and getting it wrong is the easiest way to corrupt the
pipeline:

**PRD-relative** — `/prd-analyzer`, `/prd-design-requirements`, `/screen-planner`, `/screen-validator`,
`/component-analyzer`, `/coverage-scorer`, `/coverage-reporter`, `/figma-modifier`, `/figma:figma-use`,
`/developer-handoff`, `/closure-reporter`, `/requirements-to-prototype`, **and all three
gates**. A gate is per-feature because a decision about *this* feature's requirements says nothing about
the next one's — a shared gate would let one signoff open the gate for every feature that followed,
which is the exact opposite of what a gate is for. These answer questions
*about a feature* ("does the design system cover the screens **this** PRD needs"). Their answers change
with every PRD, so they are per-feature and live in `reports/<feature>/`.

**Not PRD-relative** — `/design-system-loader` and `/evaluate-design-system`. These answer questions about the
**design system**: what is in it, and whether it is any good. Whether the library has focus states, a
coherent spacing scale, adequate contrast, composable primitives is the same answer for every PRD. Both
carry `"scope": "shared"`, write to `reports/_shared/`, need no feature slug — so they can run before a
run is even named — and every feature reads the same copy. On later features `plan` reports them already
satisfied; that is correct, not a bug.

A shared stage must never depend on a PRD-relative one. That would let one feature's requirements shape
an artifact every other feature reads, and re-derive the same global answer once per PRD. `/evaluate-design-system`
therefore requires `/design-system-loader` **alone** — not `/component-analyzer` or `/coverage-scorer`.

**One consequence to know before reading `/design-system-loader`'s phase number as a guarantee.** Gates
are PRD-relative, so a shared stage cannot depend on one — which means a shared stage can never be
gate-gated, and `check` exempts `scope: "shared"` from the phase-gate rule outright
([`utils/pipeline.mjs`](utils/pipeline.mjs) — the `scopeOf(n) === 'shared'` skip). `/design-system-loader`
carries `phase: 2` because phase 2 is where its output is **first needed**, now that phase 1 reads no
Figma artifact. That is documentation, not enforcement: nothing stops it running earlier, and having no
dependencies at all, it generally will. `/figma-extractor` is per-feature, so it takes the real edge —
it **requires** `gate-1-requirements`, and invoking it directly stops at the gate. The two sit together
at the top of phase 2 and are held there by different mechanisms; do not assume the loader is blocked
just because the extractor is.

Caching the design system matters on its own terms too — it is the most expensive extraction here, so
one library walk instead of twenty is the difference across twenty features.

The two shared stages go stale differently. `/design-system-loader` reads a **remote** source, which no
local fingerprint can see change, so it declares `max_age_days: 7` and expires on its own.
`/evaluate-design-system` reads only `05_design_system.json` — a local artifact — so it needs no max age:
it goes stale exactly when the library it graded is refreshed.

### Standalone stages: in the graph, but not in the run

`/evaluate-design-system` and `/requirements-to-prototype` both carry `"standalone": true`. Two things
follow, and both are enforced:

**Nothing depends on them, and no orchestrator runs them.** Grading the library is a review with its own
audience and its own cadence — you read it to decide what to invest in the design system, not every time
a feature ships. It was briefly a hard dependency of `/figma-modifier`, which meant every PRD run dragged
a full library critique along with it and re-graded the same library once per feature. Invoke
`/evaluate-design-system` directly when you want it.

`/requirements-to-prototype` is standalone for two independent reasons. It is a **parallel deliverable to
the Figma build, not a step in it**: it turns `design_requirements.md` into one interactive `.dc.html`
prototype, it explicitly does no Figma writes, and gate 3 signs off Figma frames rather than the
prototype — so it neither feeds nor consumes `/figma-modifier` → `/figma:figma-use`. It also needs
`dc_write` and `ready_for_verification`, which exist only where Design Component tooling does; as a
non-standalone stage a missing tool would fail **every** run, on a deliverable that run never asked for.
The skill checks for the tool and refuses to hand-roll an HTML file as a substitute — a fake deliverable
that marks the stage done is worse than an unwritten one.

**`/figma-modifier` designs the components it builds.** Its inputs are `09_gap_analysis.json` (what this
feature needs) and `05_design_system.json` (the idiom to build in) — anatomy, variants, states and token
bindings are derived there, from how comparable components in the library are already built. It must not
read `08_ux_evaluation.json`.

### Prose feeds the plans; it never replaces them

`/prd-design-requirements` writes `design_requirements.md` — the design-ready reference a human keeps open
while building: overview, objectives, personas, single-line flow chains, named pages/frames, components per
frame, assembly — and **`design_requirements.docx` beside it, which is the deliverable a human actually
reads**: the same content as a categorized Word document, with a table of contents, styled §1–§8
headings, Word tables for the personas and the per-frame components, and §4's flows and §5–§6's
pages/components drawn as **graphs**. The rendition exists because the two sections a designer works
from are the two the markdown serves worst: a wall of arrow chains, and a nested list in which a
component shared by three frames looks like three components. As a graph, a shared component is one node
with three parents. Word rather than PDF because the gate 1 reviewer needs to comment and redline on it.

**The markdown does not go away, and the roles must not swap.** The `.md` is the source of record —
`/screen-planner`, `/closure-reporter` (§8) and `/requirements-to-prototype` all read it, and a `.docx`
is a ZIP archive, so making it the machine-read artifact would mean three stages unpacking XML to read
prose. The `.docx` adds no facts, is rebuilt *from* the markdown and never in parallel with it, and a
reviewer's comments on it are `changes_requested` notes that get written back into the markdown — not an
edit to the deliverable. Both are rendered locally, because phase 1 neither reads Figma nor writes to it
(`generate_diagram` would put those graphs in FigJam). It overlaps `/prd-analyzer`, `/screen-planner` and
`/component-analyzer` **on purpose**, and the direction of that overlap is the whole design:

- It sits **downstream** of `/prd-analyzer` and is only an **optional** input to `/screen-planner`. So the
  numbered JSON artifacts stay authoritative and the doc stays a readable projection of them. Reversed —
  prose as a hard dependency — the graph would be gated on an artifact nothing can validate, and the same
  facts would have two sources of truth with no tie-breaker.
- Its artifacts are the wildcards `design_requirements*.md` and `design_requirements*.docx`, so they are
  **existence-checked, not schema-checked**, exactly like `coverage_report_*`. There is no
  machine-checkable shape for prose, which means the §1–§8 templates in the skill are the only thing
  standing between it and a half-written doc. Nothing downstream will catch a skipped section, a missing
  graph, or a `.docx` that is really renamed markdown — the extension is checked, the file format is
  not. Two patterns rather than one bare `design_requirements*`: that single wildcard was satisfied by
  **either** file, so a run could skip the Word rendition entirely and still record the stage as done.
- **It reads no Figma-derived artifact, and that is the phase boundary.** `/design-system-loader` used
  to be a **hard** requirement, purely so §6 could mark each component existing vs. new off the back of
  a live library walk. That single edge dragged the most expensive extraction in the pipeline in front
  of a gate with nothing to say about it, and it duplicated `/component-analyzer` — which answers the
  same question in phase 2 against its `mapping_table`, recording the variants it checked per
  requirement rather than a bare existing/new mark. Two sources of truth, and the weaker one ran first.
  So §6 now names what each frame **needs** and makes no claim about what already exists; phase 1 is
  the PRD and nothing else. What that gives up is real: gate 1 no longer sees how much of the module is
  new, and the PDF's page–component graph lost its green-existing/orange-new shading. The protection
  behind that shading is not lost, only relocated — `search_design_system` searches *published*
  libraries only, while most in-house systems keep components on a file's own pages, so a library-only
  search reports "new" for things that already exist. That walk is `/design-system-loader`'s step 2 and
  `/component-analyzer`'s rule 3, both in phase 2, both before anything is built.

**It decides open decisions rather than asking.** The skill this was vendored from ends by asking the user
to resolve its open items and says outright not to pick one and move on. That rule is correct for a
one-shot interactive skill and fatal inside `/run-prd-workflow`, where a blocking question hangs the run —
so the vendored copy takes the defensible default and records the call, the alternative not taken, and why,
in its §8. It does **not** write `14_closure_notes.json`: `/closure-reporter` owns that ledger end to end,
and two stages writing one artifact is how a ledger loses entries. §8 is what `/closure-reporter` reads.

### Components are not the deliverable — screens are

`/figma-modifier` specs **both halves** of the build: the missing components, and the **screens those
components assemble into**. `11_build_phase.json` therefore has a required `screens` array beside
`figma_modifications.components`, and `/figma:figma-use` builds in two passes — components first, then
screens — because a screen is made of component *instances*, which do not exist as nodes until the
component pass has run.

This is why the stage requires `/screen-planner` and `/component-analyzer` on top of the scorer.
`09_gap_analysis.json` is a **lossy projection** of the screen plans: it answers "which components are
missing" and discards layout, element order, per-screen states and flows. Fed only the gap analysis, the
stage could not assemble a screen even when told to — so the pipeline used to finish with a freshly
populated component library and not one screen built out of it. `03_screen_plans.json` restores the
layout; `06_component_analysis.json` supplies the element → component binding, so a planned element
becomes a **named instance** rather than a fresh frame.

Two consequences worth knowing before you rely on it:

- **A run with zero component gaps still has screens to build.** `components` may legitimately be
  empty; `screens` may not, because `03_screen_plans.json` always holds at least one plan. The
  orchestrator is gated on components **or** screens for exactly this reason — gating on the gap count
  alone meant a feature the library already covered built nothing at all.
- **The screen spec names components on the assumption they will build.** It cannot consult
  `12_figma_build.json`, which is its own downstream stage — that edge would be the cycle
  `figma-modifier → figma-use → figma-modifier`, which `check` rejects. So `/figma:figma-use` resolves
  each instance by name during pass 2 and reports a screen whose component failed as **blocked**
  (`failed`, `kind: "screen"`) instead of assembling around the hole. That check lives in the build
  stage, not the spec stage.

One limitation is upstream and unchanged: `03_screen_plans.json` stores `layout` as a bare string
(`"grid"`, `"stacked"`) and elements as `element` + `type`, with no geometry. That is enough to drive
auto-layout frames in a sensible order, not enough for pixel-faithful screens. Raising that fidelity
means enriching `/screen-planner`'s schema first.

Prefer `"standalone": true` over reintroducing a hand-written `runs_all` list. The exclusion then lives on
the stage it describes, and a stage added tomorrow is still picked up by `/run-prd-workflow`
automatically unless it opts out too — which is the whole point of deriving that list. `check` reports an
**error** if any stage declares a dependency on a standalone stage, because such an edge pulls it into
every plan that reaches the dependant while the manifest still claims it was opted out. `check` also
lists standalone stages explicitly, and `status` shows them as `[-]` rather than a misleading `[x]` —
"never scheduled" is not the same state as "done".

```bash
node utils/pipeline.mjs path --stage design-system-loader --ensure     # -> reports/_shared/
node utils/pipeline.mjs path --stage evaluate-design-system --ensure   # -> reports/_shared/
```

### The run ends at gate 3, and nothing after it re-reads the build

The run is over when every page has been approved at gate 3. Then phase 4, and that is the end — there
is no loop.

**Know what that costs, because the pipeline used to do more.** Stages 1–8 measure **intent**: they
score `03_screen_plans.json` against the library, and every one of them can report a feature fully
covered while the Figma file contains something else. `/figma:figma-use` then reports what it
*believes* it built. There was a `/prd-auditor` stage after gate 3 that read the **PRD itself** —
not the plans — against the live file at full depth, produced `13_prd_audit.json`, and looped the
gaps back through gate 2 for up to 5 iterations. It has been removed, along with its artifact and
its schema.

So **gate 3 is now the only comparison between what the PRD asked for and what is actually in Figma**,
and it is a different kind of check: one person looking at one frame at a time, rather than a machine
resolving every named component, frame, state, flow and piece of specified copy across the whole
module. Three specific things nothing catches any more:

- **A requirement dropped in phase 2.** `03_screen_plans.json` is an interpretation of the PRD, and an
  item the PRD names but the plan never captured is invisible to every plan-derived check,
  permanently. It was invisible to gate 3 too — the gate asks whether *this page* matches *its*
  checklist entry, so a requirement that produced no checklist entry produces no page to ask about.
- **What REST cannot see.** An *orphaned master* — a component set whose parent is `null` — appears in
  no page tree at any depth while its instances still render. Finding one meant resolving an
  instance's `mainComponent` through the Plugin API, which only the audit did.
- **The module as a whole.** Every check that remains is scoped to one page or one component.

Whether that trade is right is a call about this project, not a defect. But do not describe a run that
cleared gate 3 as "the PRD is covered": what was verified is that every page a person was shown looked
correct to them.

Decisions and how they reach the ledger are covered above under "Decisions are raised by the AI and
taken by a human". Two consequences worth restating: §8's "needs a human in the Figma editor" group is
**not** a decision anyone took, so it goes to `still_missing[]` with `closeable_by` rather than into
`open_decisions[]` with a fabricated answer; and `/closure-reporter` remains the sole owner of the
ledger — `/prd-design-requirements` is forbidden from writing it — so an entry missing there is missing
everywhere.

**An open gate is a legitimate closure outcome.** A run parked at gate 2 awaiting a taxonomy decision
must be reported as parked. "Complete" is not an available answer while a gate is open. That is what
`14_closure_notes.json`'s `final_state` records — `all-pages-approved`, `parked-at-gate` (with
`stopped_at` and `pages_pending`), or `abandoned`. It replaced `final_verdict` / `converged` /
`iterations_run`, which were all statements about a loop that no longer exists.

### The reports tree is output, not workflow state

`reports/` is **not part of the workflow** — nothing reads it as an input to decide *what* to build, and it is
not committed. It is where a run's results land, one folder per feature:

```
reports/notification-center/01_prd_requirements.json ... 12_figma_build.json
reports/billing-settings/...
```

Every command above takes `--project <feature>` **or `--prd <file>`**, so each feature has its own artifacts
**and its own resume state** — running a second PRD never clobbers the first.

**Handing over a PRD is enough to name the run.** Point the pipeline at any PRD and the feature slug comes from
its filename, so no `.env` edit is needed first:

```bash
node utils/pipeline.mjs path --prd "prds/Billing Settings.pdf" --ensure
#   -> reports/billing-settings/   (created)
```

`--prd` also *supplies* `PRD_SOURCE`, so a run started this way is not asked for the PRD again. The slug is
resolved in this order: `--project`, then `--prd`'s filename, then `$PROJECT`, then `$PRD_SOURCE`
(`Notification Center.pdf` → `notification-center`; punctuation and case are normalised away).

**A PRD pasted into the chat must be saved to a file first** — write it verbatim to `prds/<feature>.md`,
then run with `--prd prds/<feature>.md`. Pasted text is not a file and is not in the environment, so on
its own it gives the run no name *and* no freshness signal: the stage records `PRD_SOURCE: NOT SET —
untracked`, and a completely different PRD pasted later still reads as "already satisfied", which is the
exact failure the input fingerprints exist to prevent. `done` warns when an input is unset — that warning
means the run is not resumable, not that it is noisy. The PRD belongs in `prds/` rather than beside the
artifacts because `reports/` is regenerable output and the PRD is an input that must outlive it.
See [`/prd-analyzer`](.claude/skills/prd-analyzer/SKILL.md) → "Pasted PRDs".

When none of those resolve there is no output folder, and the tools say so rather than guessing: `plan` and
`status` report the feature as `NOT SET — ask the user`, and `path` **exits non-zero** instead of echoing the
shared `reports/` root — so `mkdir -p "$(… path)"` can never scatter one feature's artifacts across the root.

Create the folder with `path --ensure` (idempotent) before the first write; bare `path` stays read-only.

### `workflow_log.md` — read this before anything else in a feature folder

Every feature folder opens with **`reports/<feature>/workflow_log.md`**: one log per PRD, holding a snapshot
of every step, every triggered skill and every action taken on that PRD. It is the first thing to look at
when picking a run up, and the first thing to point a person at.

Every other file in `reports/` answers *"what is the state of X"*. None of them answers **"what actually
happened, in what order, and who decided it"** — that history lived only in the terminal scrollback of
whoever ran it, so a run resumed a day later, or by somebody else, began by guessing. Artifact mtimes give
an order and no reasons; a gate's `history` is the closest thing and covers one gate.

The file has two halves:

- **A regenerated header** — the PRD, where the run stands (running / parked at a named gate / complete),
  the exact next command, and a phase-by-phase stage board. Rewritten on every write, so it is never a
  stale summary of a live run.
- **An append-only ledger** below the `<!-- LEDGER -->` marker — one dated line per event, never rewritten.
  Content already in the file is always preserved beneath the new header, including a file with no marker
  at all, because a format upgrade that eats an audit trail is worse than no upgrade.

**The resolver writes it, not the skills.** "Every skill must remember to append to the log" is the same
shape as every other convention here that had to be mechanized before it held — and a ledger with silent
holes is worse than none, because a hole is indistinguishable from nothing having happened. Every
meaningful transition already funnels through `pipeline.mjs`, so these log themselves:

| Command | Logged as |
|---|---|
| `plan <skill>` | the stage was reached — with its prerequisites, or the gate it stopped at (deduped: a repeat becomes `×N`, since the hook runs `plan` on every prompt) |
| `done <skill>` | the artifacts it wrote — **and the rejection when they fail their contract** |
| `gate … --approve/--changes-requested/--reject` | the verdict, who gave it, and **whether the gate actually opened** |
| `gate … --approve --by "claude"` | the **refusal**, before it throws |
| `gate 3 --init` | the seeded roster, and any decision the re-seed dropped |
| `next-page` | the page handed to assembly |
| `path --ensure` | the run starting |

Recording the *refusal* matters as much as recording the approval: an attempted self-approval that leaves
no trace is, in the record, identical to never having happened — and this is the one failure the gates
exist to prevent. Likewise a `done` that failed its contract and was then quietly abandoned.

**`log` is for what the CLI cannot see** — a Figma write, an escalation, a decision taken in conversation,
a page hand-edited by the designer:

```bash
node utils/pipeline.mjs log "built the Notification Row component set" --stage figma-use --kind build
node utils/pipeline.mjs log "escalated the kind/category taxonomy conflict" --kind decision --by "<person>"
#   --kind: note (default) · build · decision · failed · start
```

Log each Figma write pass and each escalation as it happens. Those are the actions with no artifact of
their own until much later, so they are exactly the ones the ledger would otherwise be missing.

The log is **not a stage** and has no schema: nothing depends on it, it gates nothing, and it is not in
`produces`. It is a record of the run, not an input to it — putting it in the graph would make a narrative
file a precondition for building, which is the wrong direction for every reason `reports/` is output-only.

**Step 0 of every skill** is `node utils/pipeline.mjs plan <that-skill>`; then invoke everything under
`RUN THESE SKILLS FIRST` in the printed order (one at a time), skip everything under `ALREADY SATISFIED`,
and ask the user for any input marked `NOT SET`. **The last step of every skill** is
`node utils/pipeline.mjs done <that-skill>`. A `UserPromptSubmit` hook
([`.claude/hooks/prereq-check.mjs`](.claude/hooks/prereq-check.mjs)) runs the prerequisite check automatically
whenever a prompt starts with a pipeline skill command.

**When `plan` prints a `STOP — HUMAN GATE` box, that is the whole instruction.** It is printed *above*
the runnable list on purpose: an orchestrator reads top-down and acts on the first thing it finds, so a
gate announced underneath "run these skills" is a gate a run walks straight through. Load that gate's
skill, build its packet, present it, ask, and wait. Everything downstream is marked `blocked` rather
than `run` — not "ok" either, because there *is* real work there and it is not allowed to start. The
hook does the same thing: on a gated stage it emits the gate notice **alone** and nothing else.

A gate is the one stage whose last step is **not** `done`, which refuses it. Use
`pipeline.mjs gate <n> --approve --by "<person>"`, and never on your own judgement.

| Ph | Skill | Requires | Writes | Where |
|----|-------|----------|--------|-------|
| 1 | `/prd-analyzer` | — | `01_prd_requirements.json` | `reports/<feature>/` |
| 1 | `/prd-design-requirements` | `prd-analyzer` **only** — phase 1 reads no Figma artifact | `design_requirements.md` (source of record), `design_requirements.docx` (the deliverable) | `reports/<feature>/` |
| 1 | `/screen-planner` | `prd-analyzer` **only** (`prd-design-requirements` optional) — still PRD-only, and it runs **before** gate 1 | `03_screen_plans.json` | `reports/<feature>/` |
| **G** | **`/gate-1-requirements`** | `prd-analyzer`, `prd-design-requirements`, **`screen-planner`** | `G1_requirements_signoff.json` | `reports/<feature>/` |
| 2 | `/design-system-loader` | — (`shared`, so **not** gate-gated — see below) | `05_design_system.json` | **`reports/_shared/`** |
| 2 | `/figma-extractor` | **`gate-1-requirements`** | `02_figma_state.json` | `reports/<feature>/` |
| 2 | `/screen-validator` | `prd-analyzer`, `screen-planner`, **`gate-1-requirements`** | `04_screen_validation.json` | `reports/<feature>/` |
| 2 | `/component-analyzer` | `design-system-loader`, `screen-planner`, **`gate-1-requirements`** | `06_component_analysis.json` (incl. `mapping_table`) | `reports/<feature>/` |
| 2 | `/coverage-scorer` | `prd-analyzer`, `screen-planner`, `component-analyzer` | `07_coverage_scores.json`, `09_gap_analysis.json` | `reports/<feature>/` |
| 2 | `/coverage-reporter` | `prd-analyzer`, `screen-planner`, `component-analyzer`, `coverage-scorer` | `coverage_report_<date>.pdf`, `10_roadmap.json` | `reports/<feature>/` |
| 2 | `/figma-modifier` | `figma-extractor`, `design-system-loader`, `screen-planner`, `component-analyzer`, `coverage-scorer`, `coverage-reporter` | `11_build_phase.json` — **the build checklist** | `reports/<feature>/` |
| 2 | `/figma-component-pass` (loads `/figma:figma-use`) | `figma-modifier` — **no gate**: its output is what gate 2 reviews | `12a_figma_components.json` — the components as live nodes | `reports/<feature>/` |
| **G** | **`/gate-2-components`** | `figma-component-pass` | `G2_component_signoff.json` | `reports/<feature>/` |
| 3 | `/figma:figma-use` | `figma-modifier`, `figma-component-pass`, **`gate-2-components`** | `12_figma_build.json` (written **incrementally**) | `reports/<feature>/` |
| **G** | **`/gate-3-pages`** | `figma-use` | `G3_page_signoffs.json` — **one decision per page** | `reports/<feature>/` |
| 4 | `/developer-handoff` | **`gate-3-pages`**, `figma-modifier`, `figma-component-pass`, `figma-use`, `prd-analyzer` | `15_developer_handoff.json`, `handoff_<date>.md` | `reports/<feature>/` |
| 4 | `/closure-reporter` | `prd-analyzer` **only** — all three gates are optional, and it is the one stage marked `ungated` | `closure_report_<date>.pdf`, `14_closure_notes.json` | `reports/<feature>/` |
| — | `/run-prd-workflow` | runs the whole pipeline, halting at each gate | all of the above | — |
| — | `/evaluate-design-system` | `design-system-loader` only | `08_ux_evaluation.json` | **`reports/_shared/`** |
| — | `/requirements-to-prototype` | `prd-design-requirements` only | `prototype_<date>.dc.html` | `reports/<feature>/` |

The last two rows are below `/run-prd-workflow` on purpose: both are **standalone**, so neither is part of
"all of the above" and nothing else in the table depends on either. Run them on their own.

**`/developer-handoff` requires `gate-3-pages` hard; `/closure-reporter` requires only
`prd-analyzer` and is the one stage marked `"ungated": true`.** The asymmetry is the point. A closure
report must be producible on *every* outcome — including a run parked at gate 3 with pages still
pending and a run abandoned at gate 1 — because it is the document explaining what was decided on the reader's behalf. A
handoff must not: engineering builds from it, so a spec for a module whose pages were never all approved
presents unapproved work as shippable. The two documents also have different subjects — the handoff
records what was **built**, the closure report what was **decided** — and neither subsumes the other.

Marking the optional edges optional was not enough, and the way it failed is instructive. The stage
also hard-required the old `prd-auditor`, which reached `gate-3-pages` → `gate-2-components` →
`gate-1-requirements` transitively — so the stage documented as running on any outcome could not run on
any outcome where a gate was open. The prose said one thing and the graph decided another. That
particular edge is gone with the auditor, but the flag is what keeps the next one from recurring. `ungated` is now a declared flag
that exempts a stage from the phase-gate rule *and from gate blocking, transitively*; `check` lists the
exemptions and warns if one carries no `$ungated` explanation, because an undocumented exemption is
indistinguishable from a mistake.

A stage counts as done only when **every** file it `produces` exists **and every one of them validates**
against [`.claude/schemas/artifacts.json`](.claude/schemas/artifacts.json) — one file present is not evidence
the rest are, and a present-but-empty file is worse than a missing one, because it marks a stage done that
never really ran. A stage is re-run when an artifact is missing or invalid, when an upstream artifact is newer,
when an upstream stage is itself being re-run, when the **inputs it was recorded against have changed**, when it
is past its `max_age_days`, or when `--force` is passed. That is what lets a second run resume instead of
redoing everything — and what stops a resume from quietly reusing work that no longer matches the inputs.

### Adding a stage

Three files, then one command that tells you what you forgot:

1. **[`.claude/pipeline.json`](.claude/pipeline.json)** — add the stage: `requires`, `optional`, `produces`,
   `inputs`, plus `order` (display only), `scope: "shared"` if its output does not vary per feature, and
   `standalone: true` if it should not be part of `/run-prd-workflow` at all.
2. **[`.claude/schemas/artifacts.json`](.claude/schemas/artifacts.json)** — add a schema for each artifact
   it produces, keyed by filename.
3. **`.claude/skills/<name>/SKILL.md`** — the skill itself, with the prerequisite preamble and the
   artifact contract (copy the shape from a neighbouring skill).

```bash
node utils/pipeline.mjs check     # then fix whatever it reports
```

`check` validates the manifest rather than any artifact, and every check in it exists because the failure
it catches used to be **silent**:

- a dependency cycle produced a confident, wrong plan instead of an error
- an artifact with no schema quietly degraded validation back to "the file exists", so an empty `{}` passed
- a stage in the graph with no `SKILL.md` had nothing to invoke
- an `order` number that contradicted `requires` printed a sequence telling you to run a stage before its
  own dependency — the plan is topologically ordered now, so `order` is cosmetic, but a backwards number
  still reads as a bug
- a hand-written `runs_all` omitted whatever was added last, so `/run-prd-workflow` skipped it entirely.
  It is derived from the stage list now; to keep a stage out, mark it `standalone` rather than
  reintroducing the list, and `check` reports omissions either way
- a `standalone` stage that something still depended on ran anyway, as a prerequisite, while the manifest
  claimed it was opted out — now an error. A standalone stage must be a leaf
- **a gate nothing depended on was a gate you walked around.** It appeared in `status`, got approved out
  of habit, and gated nothing. `check` now errors when no stage `requires` a gate, and separately when
  any phase-N+1 stage fails to reach the phase-N gate through its dependency chain — the check that
  matters most and the one impossible to eyeball, because a stage can sit visibly after a gate in
  `order` and `status` while its dependencies reach back around it. A gate must also produce exactly
  one artifact (the resolver reads `produces[0]` as the decision record), and may be neither
  `standalone` — an unscheduled gate is not a gate — nor `external`, since `pipeline.mjs` writes its
  artifact rather than a skill

Then wire it into the prose that humans and agents read: the tables in this file and in
[`/run-prd-workflow`](.claude/skills/run-prd-workflow/SKILL.md), the `Reads` list of any skill that
consumes the new artifact, and [`.claude/workflows/prd-to-figma.js`](.claude/workflows/prd-to-figma.js)
if it belongs in the automated run. `check` cannot verify prose — that part is still on you.

**The final stage is an external skill.** `/figma:figma-use` ships with the Figma plugin, not this repo — hence the
`figma:` prefix, and hence `"external": true` plus `"command": "figma:figma-use"` on its stage in
`pipeline.json` (the resolver prints the name a skill is actually invoked with, which is why `plan` and `status`
show `/figma:figma-use` rather than the bare stage key). It runs **implicitly as the last step**: `/figma-modifier`
only writes build *specs*, because the Figma REST API cannot create components, so `/figma:figma-use` is what
actually builds them through the Plugin API. Three consequences:

- Never call `use_figma` without loading `/figma:figma-use` first — the skill carries the Plugin API contract.
- It builds in **two passes: components, then screens** — one `use_figma` call each, so a single failure
  does not lose the rest. The order is forced, not stylistic: pass 2 places component *instances*, so
  pass 1 has to have made them real nodes. Results go in `built` and `screens_built` respectively; a
  screen blocked by a failed component goes in `failed` with `kind: "screen"`.
- The external skill will not write our artifact, so whoever invokes it must write `12_figma_build.json`
  **and run `node utils/pipeline.mjs done figma-use`** afterwards, or the pipeline has no record the build ran
  and will rebuild on the next pass.

### Environment Setup

**There is nothing to set up.** `PRD_SOURCE` is the only input any stage declares, and it is embedded
once in [`.claude/pipeline.json`](.claude/pipeline.json) under `defaults` —
`prds/PRD-customizable-dashboards-v2.pdf`, which also names the run
(`reports/prd-customizable-dashboards-v2/`). So `plan` never reports an input `NOT SET` and never has to
ask, and a run works with no `.env` present at all.

Precedence is environment → `.env` → the manifest default, lowest last: `--prd <file>` or an exported
`PRD_SOURCE` still wins, because a value someone typed for *this* run must not lose to a file-level
default. To point the pipeline at a different PRD, pass `--prd`, or change the one line in `defaults`.

`FIGMA_URL`, `DESIGN_SYSTEM_URL`, `FIGMA_API_TOKEN` and `AUTO_CREATE_COMPONENTS` are **no longer
declared as inputs by any stage**. Everything Figma-side goes through the Figma MCP server, which
carries its own auth and target, so declaring them only produced `NOT SET` prompts for values the
workflow never read. They may still sit in `.env` — nothing in the graph consults them.

### Project Structure

```
prd-to-ui-workflow/
├── .claude/
│   ├── pipeline.json              # Skill dependency graph: what each stage needs and produces
│   ├── schemas/
│   │   └── artifacts.json         # Enforced shape of every artifact, keyed by filename
│   ├── settings.json              # Claude Code settings (hooks, permissions)
│   ├── hooks/
│   │   └── prereq-check.mjs       # Injects the prerequisite plan on /skill prompts
│   ├── skills/                    # One directory per skill, each with a SKILL.md
│   │   │                          #   listed in graph order; /figma:figma-use is absent because it
│   │   │                          #   ships with the Figma plugin, not this repo
│   │   ├── prd-analyzer/SKILL.md                # phase 1
│   │   ├── prd-design-requirements/SKILL.md     # phase 1 — PRD only, no Figma reads
│   │   ├── screen-planner/SKILL.md              # phase 1 — PRD only, and BEFORE gate 1
│   │   ├── gate-1-requirements/SKILL.md         # ══ HUMAN GATE ══ closes phase 1
│   │   ├── design-system-loader/SKILL.md        # phase 2 — shared, so not gate-gated
│   │   ├── figma-extractor/SKILL.md             # phase 2 — requires gate 1
│   │   ├── screen-validator/SKILL.md            # phase 2 — requires gate 1
│   │   ├── component-analyzer/SKILL.md          # phase 2 — the mapping table; requires gate 1
│   │   ├── coverage-scorer/SKILL.md             # phase 2
│   │   ├── coverage-reporter/SKILL.md           # phase 2
│   │   ├── figma-modifier/SKILL.md              # phase 2 — writes the build checklist
│   │   ├── gate-2-components/SKILL.md           # ══ HUMAN GATE ══ closes phase 2 (live nodes)
│   │   ├── gate-3-pages/SKILL.md                # ══ HUMAN GATE ══ one decision PER PAGE
│   │   ├── developer-handoff/SKILL.md           # phase 4 — what engineering builds from
│   │   ├── closure-reporter/SKILL.md            # phase 4 — what was decided
│   │   ├── run-prd-workflow/SKILL.md
│   │   ├── evaluate-design-system/SKILL.md      # standalone — not part of the run
│   │   └── requirements-to-prototype/SKILL.md   # standalone — not part of the run
│   └── workflows/
│       └── prd-to-figma.js        # Main workflow orchestrator
├── utils/
│   └── pipeline.mjs               # Resolver: plan / status / validate / done / path / graph
├── reports/                        # OUTPUT ONLY, not committed — one folder per feature
│   ├── _shared/                    #   design system, cached once for every feature
│   │   └── 05_design_system.json
│   └── notification-center/        #   one folder per PRD
│       ├── workflow_log.md         #   READ FIRST — every step, skill and action on this PRD
│       ├── 01_prd_requirements.json  ... 12_figma_build.json
│       └── .pipeline-state.json    #   which inputs each stage was built from (resume state)
├── .env                           # Configuration (copy from .env.example)
├── .env.example                   # Configuration template
├── README.md                      # Full documentation
└── CLAUDE.md                      # This file
```

### Workflow Phases

**Phase 1 — Extract.** Atomize the PRD into one need per line; quarantine the PRD's own component and
page claims into `unverified_prd_claims[]`; raise every ambiguity as a decision packet. Then write the
design-ready doc: personas, flows, named frames, and the components each frame needs. Then plan the
screens — elements in order, each linked back to a `REQ-*` id, plus every state. **This phase
reads the PRD and nothing else** — no Figma call, and neither Figma-derived artifact. So §6 names what
a frame *needs* and makes no claim about what the library already has; that is phase 2's answer, on
better evidence. What gate 1 therefore does not see is how much of the module is new.

**══ GATE 1 (human) ══** Validate the requirements **and the screen plans built from them**. Blocks all
of phase 2. The screen plans are reviewed here rather than after the gate because they are an
*interpretation* of the PRD that nearly all of phase 2 derives from: a requirement that never became an
element is invisible to every plan-derived check afterwards, and invisible to gate 3 too, since a
requirement that produced no checklist entry produces no page to ask about. `screens_cover_requirements`
is the only place that comparison is ever made.

**Phase 2 — Inspect, map, then build the components.** Load the design system (shared, walked *into* its
component sets) and read the live Figma file — **every live read happens here, behind gate 1**. Then
validate the approved screen plans; map every requirement onto the
design system with one of four statuses and its evidence; score coverage; generate the coverage PDF;
spec the missing components **and the screens they assemble into**. Everything to this point is
analysis and writes nothing into Figma — then the component pass builds the specified components and
variants, and **only** those. It stops before assembling any screen.

**══ GATE 2 (human) ══** Inspect the components as they now exist in the live file: present, with the
right variants and states, bound to tokens, correctly named and located, and nothing added outside the
checklist. This gate does not stand between analysis and write access — the components have already
been written by the time it is taken. What it stands between is a component library and everything
assembled from it: no page may be built out of a component nobody has inspected.

**Phase 3 — Assemble.** Build the pages **one at a time**, each presented for its own decision.

**══ GATE 3 (human) ══** One approve / edit / reject per page, asked as a popup. This is where the run
ends: there is no audit stage behind it, so this per-page decision is the **only** comparison anyone
makes between the PRD and what is actually in Figma.

**Phase 4 — Hand off.** `/developer-handoff`: per-page specs — layout, tokens, props and variants,
states, breakpoints, edge cases — plus a change-log of every component created during assembly,
cross-linked to the live Figma sources. Then `/closure-reporter`: what was created, what is still
missing, and every open decision with the option that was taken at a gate and by whom.

### Input Formats

**PRD Sources:**
- PDF documents (`.pdf`)
- Word documents (`.docx`)
- Markdown files (`.md`)
- Plain text (copy/paste)

**Design System:**
- Figma design system file
- Markdown specification
- External URL to design system docs
- JSON component library

**Figma:**
- Full Figma file URL

### Outputs

1. **Coverage Report PDF** (`coverage_report_[date].pdf`)
   - Executive summary
   - Requirement checklist
   - Component coverage matrix
   - Gap analysis with priorities
   - Missing component specs
   - Implementation roadmap

2. **Figma Updates**
   - Auto-created components
   - Applied design tokens
   - Component documentation

3. **Data Outputs** (JSON)
   - Screen plans
   - Coverage analysis
   - Recommendations

### Key Features

✅ Multi-format PRD parsing (PDF, Word, Markdown, text)
✅ Figma design extraction and analysis
✅ Automated screen planning from requirements
✅ Design system component coverage scoring
✅ Comprehensive PDF report generation
✅ Auto-component creation in Figma
✅ Gap analysis and priority matrices
✅ Implementation roadmap generation

### Tips for Best Results

1. **PRD Quality**
   - Clear, specific requirements
   - Acceptance criteria for each requirement
   - User flows and edge cases
   - Performance and accessibility needs

2. **Screen Planning**
   - Map each requirement to UI elements
   - Document all states (loading, error, empty)
   - Define interactions clearly
   - Plan responsive behavior

3. **Design System**
   - Keep documentation updated
   - Document all variants
   - Maintain consistent naming
   - Version your system

4. **Workflow Usage**
   - Review each phase output
   - Validate before moving forward
   - Approve component creation
   - Iterate on results

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Figma API errors | Verify token in `.env`, check file ID |
| Low coverage score | Check design system completeness, review gaps |
| PDF generation fails | Ensure all previous steps completed |
| Missing components | Design system may be incomplete, add to it |

### Next Steps After Workflow

1. Review coverage PDF
2. Approve auto-created components
3. Use screen plans for development
4. Keep design system updated
5. Iterate on requirements

### Support & Customization

- Edit skill definitions in `.claude/skills/<name>/SKILL.md` to customize behavior
- Modify workflow in `.claude/workflows/prd-to-figma.js`
- Add or change a stage in [`.claude/pipeline.json`](.claude/pipeline.json) — the graph is read from
  there, so a new stage needs no resolver change
- Tighten or relax an artifact's required shape in
  [`.claude/schemas/artifacts.json`](.claude/schemas/artifacts.json)
- Update PDF template sections in coverage-reporter skill

### Related Documentation

- [`README.md`](README.md) - Complete guide with examples
- [`.env.example`](.env.example) - Configuration template
- [`.claude/pipeline.json`](.claude/pipeline.json) - Dependency graph and per-stage inputs
- [`.claude/schemas/artifacts.json`](.claude/schemas/artifacts.json) - Enforced artifact contract
