---
name: coverage-scorer
description: Score how well design system covers screen requirements
---

# Coverage Scorer Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/prd-analyzer`, `/screen-planner`, `/component-analyzer`  ·  **Optional:** `/screen-validator`

This skill can be invoked on its own. When it is, the upstream skills it depends on may not have run yet,
so **step 0 is always**:

```bash
node utils/pipeline.mjs plan coverage-scorer
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

Scores design system coverage against screen requirements.

## Usage

```
/coverage-scorer
# Generates coverage scores from previous analyses
```

## Input (from pipeline)
- **Screen Plans** (from screen-planner)
- **Component Analysis** (from component-analyzer)
- **PRD Requirements** (from prd-analyzer)

## The percentage is arithmetic, not a judgement

**Do not estimate this number.** Compute it, and write the derivation beside it so any reader can
recompute it from the artifact alone.

```
overall_percentage = 100 × credit_earned / requirements_scored
```

- **The denominator is requirements**, taken from `06_component_analysis.json`'s `mapping_table` —
  one row per atomized requirement. That is the only denominator in this pipeline anyone can check
  independently, because "every requirement appears in the table" is gate 2's first success
  criterion. Count rows, not components, not screens, not elements.
- **The numerator is weighted credit**, one weight per row, by `match_status`:

  | `match_status` | Weight | Why |
  |---|---|---|
  | `direct-match` | **1.0** | Nothing to build |
  | `combinable-match` | **0.7** | Composed from components that all already exist — no library change |
  | `match-with-modification` | **0.5** | An existing component must be extended, which changes it for every other consumer |
  | `no-match` | **0.0** | Net-new |

**The weights are pinned in [`artifacts.json`](../../schemas/artifacts.json), not chosen per run.** They
are `enum`-constrained, so a run that scores on its own scale fails validation. Carry them in the
artifact anyway — the number has to be readable standalone — but never invent them. Changing them is a
deliberate edit to the schema that re-bases every report in the repo at once.

That ordering deliberately differs from CLAUDE.md's `extend → combine → net-new` resolution
preference. That ranks by *architectural health* — extending one component beats gluing two together.
This ranks by **how much the library already supplies**, and by that measure combining changes nothing
in the library while extending changes a shared component. Both orderings are right about different
questions; don't reconcile them.

### Two rows that are not scored

- **An `escalation` row is excluded from both halves of the fraction.** It is a product decision for
  gate 2, not a component gap. Scoring it as a gap hides an unanswered taxonomy conflict behind a
  number; scoring it as covered is a lie. Exclusion is only safe while it is visible, so
  `escalations_excluded` is required — **and you must state it in prose wherever you quote the
  percentage.** A feature with ten escalations can otherwise report 100%.
- **A requirement with no row at all is a defect, not a low score.** List its id in
  `method.unmapped_requirements` and raise it. It means `/component-analyzer` dropped a requirement —
  a gate-2 failure criterion — and quietly scoring it `no-match` would convert a process failure into
  a number that looks merely disappointing. An empty array is a positive claim that the table is
  complete.

### Worked example — check your arithmetic against this

20 mapping_table rows, 1 of them escalated:

```
counts: direct-match 9, combinable-match 3, match-with-modification 4, no-match 3   (= 19 scored)
credit: 9(1.0) + 3(0.7) + 4(0.5) + 3(0)  =  9 + 2.1 + 2 + 0  =  13.1
score : 100 × 13.1 / 19  =  68.9%
```

Round to one decimal. The counts must sum to `requirements_scored`; if they don't, you have
double-counted or dropped a row.

### `by_category` are diagnostics, and they do not feed the overall

`overall_percentage` **is** the requirement score — it is not a blend of the four categories. Blending
re-introduces exactly the arbitrary inter-category weights this contract exists to remove. Each
category carries its own denominator, stated in words:

| Category | Covered / Total | Source |
|---|---|---|
| `requirements` | the formula above, restated | `06` `mapping_table` |
| `components` | distinct components: `adequately_covered` ×1.0, `partially_covered` ×0.5, `not_covered` ×0 | `06` `coverage_analysis` |
| `states` | planned states some component mapped to that screen declares in `states_supported` | `03` `screen_plans[].states` × `06` `component_details` |
| `interactions` | elements declaring an `interaction` whose bound component is not in `not_covered` | `03` `required_elements[].interaction` |

**`percentage` is `null`, never `0`, when `total` is `0`.** `interaction` is optional in
`03_screen_plans.json`, so a run where no element declares one has no evidence — and no evidence is
not full coverage, nor is it zero coverage.

**`Design_Tokens` is gone, and it is not coming back here.** This skill reads `01`, `03` and `06`;
none contains a token inventory, so every token percentage it ever emitted was unverifiable. Whether
components are actually bound to tokens is asked at gate 2's `tokens_and_variables_bound` check
against live nodes — better evidence than anything derivable from a plan.

### `by_screen` — same formula, restricted

One entry per screen in `03_screen_plans.json`. Score the requirements that screen's elements link to
via `required_elements[].requirement_link`, using the same weights.

A screen whose elements carry **no** `requirement_link` gets `coverage: null` with
`basis.unscoreable_reason` — not `0`. Zero linked requirements means nobody checked, and `0%` reads as
"nothing is covered", which is the opposite conclusion. **A null here is a finding**: put it in
`recommendations`, because an unlinked screen is invisible to every requirement-derived check
afterwards, and invisible to gate 3 too.

## Output
```json
{
  "coverage_score": {
    "overall_percentage": 68.9,
    "method": {
      "basis": "mapping_table.match_status",
      "weights": {
        "direct-match": 1.0,
        "combinable-match": 0.7,
        "match-with-modification": 0.5,
        "no-match": 0.0
      },
      "counts": {
        "direct-match": 9,
        "combinable-match": 3,
        "match-with-modification": 4,
        "no-match": 3
      },
      "requirements_scored": 19,
      "credit_earned": 13.1,
      "escalations_excluded": 1,
      "unmapped_requirements": []
    },
    "by_category": {
      "requirements": {
        "percentage": 68.9,
        "covered": 13.1,
        "total": 19,
        "denominator": "atomized requirements with a mapping_table row, excluding 1 escalated",
        "evidence": "06_component_analysis.json mapping_table"
      },
      "components": {
        "percentage": 79.2,
        "covered": 9.5,
        "total": 12,
        "denominator": "distinct components required by the screen plans",
        "evidence": "06 coverage_analysis: 8 adequate, 3 partial, 1 not covered"
      },
      "states": {
        "percentage": 72.0,
        "covered": 18,
        "total": 25,
        "denominator": "planned states across all 6 screens",
        "evidence": "03 screen_plans[].states vs 06 component_details[].states_supported"
      },
      "interactions": {
        "percentage": null,
        "covered": 0,
        "total": 0,
        "denominator": "elements declaring an interaction — none do in this run",
        "evidence": "03 required_elements[].interaction is unset on every element"
      }
    },
    "by_screen": [
      {
        "screen_name": "Dashboard",
        "coverage": 91.7,
        "basis": {
          "requirements_counted": 6,
          "credit": 5.5,
          "requirement_ids": ["REQ-1", "REQ-2", "REQ-3", "REQ-4", "REQ-5", "REQ-9"]
        },
        "missing_components": [],
        "missing_states": []
      },
      {
        "screen_name": "Form",
        "coverage": 60.0,
        "basis": {
          "requirements_counted": 5,
          "credit": 3.0,
          "requirement_ids": ["REQ-6", "REQ-7", "REQ-8", "REQ-10", "REQ-11"]
        },
        "missing_components": ["DatePicker", "FileUpload"],
        "missing_states": ["error", "validation"]
      },
      {
        "screen_name": "Settings",
        "coverage": null,
        "basis": {
          "requirements_counted": 0,
          "credit": 0,
          "unscoreable_reason": "no element on this screen carries a requirement_link"
        },
        "missing_components": [],
        "missing_states": []
      }
    ]
  },
  "gap_analysis": {
    "critical_gaps": [
      {
        "component": "DatePicker",
        "screens": ["Form", "Filter"],
        "impact": "high",
        "recommendation": "Create DatePicker component"
      }
    ],
    "medium_gaps": [],
    "low_gaps": []
  },
  "recommendations": [
    "Create 3 new components",
    "Extend 5 existing components",
    "Add 8 missing states",
    "Settings has no requirement_link on any element — it is unscoreable and invisible to every requirement-derived check"
  ]
}
```

`coverage_trend` was dropped from this example: a run has no previous run to compare against, so
`improving|stable|declining` was always a guess. If you want a trend, compare `method.credit_earned`
and `method.requirements_scored` against the previous `07_coverage_scores.json` explicitly, and say
which run you compared with.

## Notes
- **Sort gaps by how many screens they block**, not by feel: a component blocking 3+ screens is
  `critical`, 2 is `medium`, 1 is `low`. State the screen list in each gap so the ranking is checkable.
- An escalated row is **not** a gap — it belongs to gate 2, and `09_gap_analysis.json` must not absorb it.
- Prioritizes missing components; provides implementation guidance.

## Reporting the number

Whenever you quote `overall_percentage` — in chat, in the coverage report, in a summary — quote it with
the three things that make it meaningful, or it is misreporting:

> **68.9% coverage** — 19 requirements scored (9 direct, 3 combinable, 4 need modification, 3 net-new).
> **1 requirement is excluded**, pending an escalated product decision at gate 2.

If `method.unmapped_requirements` is non-empty, lead with that instead. A requirement nobody mapped is
a bigger finding than any percentage.

## Artifact contract

**Reads** (from `reports/<feature>/`, produced by upstream skills):

- `01_prd_requirements.json` — from `/prd-analyzer`
- `03_screen_plans.json` — from `/screen-planner`
- `06_component_analysis.json` — from `/component-analyzer`

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/<feature>/07_coverage_scores.json`
- `reports/<feature>/09_gap_analysis.json`

Write these files as the **last step** of the skill, into this run's own output folder — resolve and
create it in one step with:

```bash
node utils/pipeline.mjs path --stage coverage-scorer --ensure
```

The shape above is **enforced, not just documented**. The machine-checkable version lives in
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json), keyed by the filenames listed above —
read it before writing and satisfy it exactly. Where the JSON block above and the schema differ, the
schema decides.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done coverage-scorer
```

That validates the artifacts and records the inputs they were built from. Both halves matter:

- A stage counts as done only when its files exist **and** validate. Writing a partial file no longer
  marks the stage complete — the resolver reports it as invalid and re-runs it. So if you cannot
  produce a complete artifact, say so plainly instead of writing a stub.
- Recording the inputs is what lets a later edit to the PRD (or to `DESIGN_SYSTEM_URL`) invalidate this
  stage and everything downstream. Skip `done` and the stage is treated as stale and redone.

If `done` reports problems, fix the artifact and run it again. Never hand-edit `.pipeline-state.json`
to make a stage look finished.
