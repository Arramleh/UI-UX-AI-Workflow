---
name: screen-validator
description: Validate planned screens against PRD requirements
---

# Screen Validator Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/prd-analyzer`, `/screen-planner`

This skill can be invoked on its own. When it is, the upstream skills it depends on may not have run yet,
so **step 0 is always**:

```bash
node utils/pipeline.mjs plan screen-validator
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

Validates screen plans meet all PRD requirements.

## Usage

```
/screen-validator
# Validates screen plans from /screen-planner against PRD
```

## Input (from pipeline)
- **PRD Requirements** (from prd-analyzer)
- **Screen Plans** (from screen-planner)

## Output
```json
{
  "validation_results": {
    "total_requirements": 15,
    "covered_requirements": 14,
    "coverage_percentage": 93.3,
    "issues": [
      {
        "type": "missing|incomplete|unclear",
        "requirement_id": "REQ-5",
        "description": "Requirement not addressed in screens",
        "screens_affected": [],
        "severity": "critical|high|medium|low",
        "suggested_fix": "Recommendation to fix"
      }
    ]
  },
  "recommendations": [
    "Add loading state to Screen A",
    "Clarify data validation in Form Screen"
  ],
  "status": "approved|needs_revision",
  "revision_count": 0
}
```

## Notes
- Validates 100% requirement coverage
- Identifies missing interactions
- Checks for edge cases handling
- Recommends improvements

## Artifact contract

**Reads** (from `reports/<feature>/`, produced by upstream skills):

- `01_prd_requirements.json` — from `/prd-analyzer`
- `03_screen_plans.json` — from `/screen-planner`

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/<feature>/04_screen_validation.json`

Write these files as the **last step** of the skill, into this run's own output folder — resolve and
create it in one step with:

```bash
node utils/pipeline.mjs path --stage screen-validator --ensure
```

The shape above is **enforced, not just documented**. The machine-checkable version lives in
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json), keyed by the filenames listed above —
read it before writing and satisfy it exactly. Where the JSON block above and the schema differ, the
schema decides.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done screen-validator
```

That validates the artifacts and records the inputs they were built from. Both halves matter:

- A stage counts as done only when its files exist **and** validate. Writing a partial file no longer
  marks the stage complete — the resolver reports it as invalid and re-runs it. So if you cannot
  produce a complete artifact, say so plainly instead of writing a stub.
- Recording the inputs is what lets a later edit to the PRD (or to `DESIGN_SYSTEM_URL`) invalidate this
  stage and everything downstream. Skip `done` and the stage is treated as stale and redone.

If `done` reports problems, fix the artifact and run it again. Never hand-edit `.pipeline-state.json`
to make a stage look finished.
