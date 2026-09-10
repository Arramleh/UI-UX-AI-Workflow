---
name: coverage-reporter
description: Generate comprehensive coverage analysis PDF report
---

# Coverage Reporter Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/prd-analyzer`, `/screen-planner`, `/component-analyzer`, `/coverage-scorer`  ·  **Optional:** `/figma-extractor`, `/screen-validator`

This skill can be invoked on its own. When it is, the upstream skills it depends on may not have run yet,
so **step 0 is always**:

```bash
node utils/pipeline.mjs plan coverage-reporter
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

Generates detailed PDF report of system design coverage analysis.

## Usage

```
/coverage-reporter
# Generates PDF from all previous analyses
```

## Input (from pipeline)
- All previous analyses (prd-analyzer, screen-planner, coverage-scorer, etc.)

## Output
- **PDF Report** with sections:
  - Executive Summary (overall coverage %)
  - PRD Requirements Checklist
  - Screen Plan Details
  - Component Coverage Analysis
  - Gap Analysis & Priority Matrix
  - Missing Components Specification
  - Implementation Roadmap
  - Recommendations

## Report Includes

### Coverage Summary Table
- Overall score: X%
- By category breakdown
- Critical, medium, low priority gaps

### Detailed Sections
1. **What's Covered** - Components meeting requirements
2. **What's Missing** - New components needed
3. **What Needs Extension** - Existing components needing new states/variants
4. **Implementation Priority** - Phased roadmap

### Visual Elements
- Coverage percentage charts
- Gap heatmaps
- Component usage diagrams
- Screen-to-component mapping matrix

## Output Format
- **File**: `coverage_report_[date].pdf`
- **Location**: Project output folder
- **Size**: 10-30 pages depending on complexity

## Notes
- Includes all recommendation details
- Links requirements to missing components
- Provides actionable implementation specs
- Includes visual comparisons

## Artifact contract

**Reads** (from `reports/<feature>/`, produced by upstream skills):

- `01_prd_requirements.json` — from `/prd-analyzer`
- `03_screen_plans.json` — from `/screen-planner`
- `04_screen_validation.json` — from `/screen-validator` (optional)
- `06_component_analysis.json` — from `/component-analyzer`
- `07_coverage_scores.json` — from `/coverage-scorer`
- `09_gap_analysis.json` — from `/coverage-scorer`

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/<feature>/coverage_report_<date>.pdf` — or `.html` when PDF generation is unavailable;
  the pipeline matches `coverage_report_*` and accepts either, because both are a real report
- `reports/<feature>/10_roadmap.json`

Write these files as the **last step** of the skill, into this run's own output folder — resolve and
create it in one step with:

```bash
node utils/pipeline.mjs path --stage coverage-reporter --ensure
```

The shape above is **enforced, not just documented**. The machine-checkable version lives in
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json), keyed by the filenames listed above —
read it before writing and satisfy it exactly. Where the JSON block above and the schema differ, the
schema decides.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done coverage-reporter
```

That validates the artifacts and records the inputs they were built from. Both halves matter:

- A stage counts as done only when its files exist **and** validate. Writing a partial file no longer
  marks the stage complete — the resolver reports it as invalid and re-runs it. So if you cannot
  produce a complete artifact, say so plainly instead of writing a stub.
- Recording the inputs is what lets a later edit to the PRD (or to `DESIGN_SYSTEM_URL`) invalidate this
  stage and everything downstream. Skip `done` and the stage is treated as stale and redone.

If `done` reports problems, fix the artifact and run it again. Never hand-edit `.pipeline-state.json`
to make a stage look finished.
