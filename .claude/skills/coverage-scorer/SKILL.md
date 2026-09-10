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

## Output
```json
{
  "coverage_score": {
    "overall_percentage": 78.5,
    "by_category": {
      "Components": 85,
      "States": 72,
      "Interactions": 68,
      "Design_Tokens": 92
    },
    "by_screen": [
      {
        "screen_name": "Dashboard",
        "coverage": 92,
        "missing_components": [],
        "missing_states": []
      },
      {
        "screen_name": "Form",
        "coverage": 65,
        "missing_components": ["DatePicker", "FileUpload"],
        "missing_states": ["error", "validation"]
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
    "Add 8 missing states"
  ],
  "coverage_trend": "improving|stable|declining"
}
```

## Notes
- Calculates weighted coverage scores
- Identifies critical gaps
- Prioritizes missing components
- Provides implementation guidance

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
