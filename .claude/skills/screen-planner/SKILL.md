---
name: screen-planner
description: Plan screens and wireframes based on PRD requirements
---

# Screen Planner Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/prd-analyzer`, `/gate-1-requirements`  ·  **Optional:** `/figma-extractor`, `/prd-design-requirements`

This skill can be invoked on its own. When it is, the upstream skills it depends on may not have run yet,
so **step 0 is always**:

```bash
node utils/pipeline.mjs plan screen-planner
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

Creates detailed screen plans from PRD requirements.

## Usage

```
/screen-planner
# Reads from previous /prd-analyzer output
```

## Input (from pipeline)
- **PRD Requirements** (from prd-analyzer)
- **Gate 1 signoff** (from gate-1-requirements — the approved requirement list)
- **Existing Screens** (from figma-extractor, optional)
- **Design Requirements doc** (from prd-design-requirements, optional)

### This stage is where phase 2 begins, so it is where phase 2 is gated

This is the **entry point of phase 2** (design system mapping), and it `requires` `/gate-1-requirements`
in addition to `/prd-analyzer`. That single edge is what stops phase 2 from starting on unvalidated
requirements: every other phase-2 stage — `/screen-validator`, `/component-analyzer`, `/coverage-scorer`,
`/coverage-reporter`, `/figma-modifier` — reaches this one transitively, so gating **here** gates the
whole phase. Without it, `/component-analyzer` invoked directly would happily map requirements that no
human had ever read, and the gate would exist only for whoever went through `/run-prd-workflow`.

Derive the plans from the **gate-1-approved requirement text**, not from whatever phase 1 first extracted.
Read `G1_requirements_signoff.json` and check `requirements_edited[]`: those ids were **corrected by hand
at the gate** rather than sent back for a re-run, so for each of them the human's corrected wording is the
requirement and `01_prd_requirements.json` still holds the superseded text. Planning from the extracted
text there produces screens for requirements the gate explicitly rejected, while every downstream check
reports the phase as approved.

### Using the design requirements doc

When `design_requirements.md` exists, read it as **context** — it is prose written for a designer, and it
carries three things this stage otherwise has to infer: a **personas table** (which tells you directly which
per-role states a screen needs), **single-line user flows** (`Trigger → Screen → Action → Result`), and
**named pages/frames** in designer vocabulary. Prefer its frame names so the plan, the build and the doc all
call the same screen the same thing.

It is **optional and never authoritative.** Derive the plans from `01_prd_requirements.json` regardless, and
if the doc and the PRD requirements disagree, the requirements win — the doc is unschema'd prose that
nothing validates. `03_screen_plans.json` is the machine-checked answer, which is what keeps these two from
becoming competing sources of truth. Never skip a requirement just because the doc omitted it.

## Output
```json
{
  "screen_plans": [
    {
      "name": "Screen Name",
      "purpose": "What users accomplish here",
      "required_elements": [
        {
          "element": "Element Name",
          "type": "text|input|button|card|form|table|etc",
          "requirement_link": "REQ-1",
          "priority": "critical|high|medium",
          "interaction": "click|hover|scroll|submit|etc",
          "content_source": "Where data comes from"
        }
      ],
      "layout": "grid|flex|stacked|custom",
      "states": ["default", "loading", "error", "empty"],
      "user_flows": ["Flow 1", "Flow 2"],
      "notes": "Additional context"
    }
  ],
  "information_architecture": {
    "screens_count": 5,
    "primary_flows": ["Flow A", "Flow B"],
    "critical_paths": ["Path 1", "Path 2"]
  }
}
```

## Notes
- Creates comprehensive screen specifications
- Maps requirements to UI elements
- Identifies all necessary states
- Plans user interaction flows

## Artifact contract

**Reads** (from `reports/<feature>/`, produced by upstream skills):

- `01_prd_requirements.json` — from `/prd-analyzer`
- `G1_requirements_signoff.json` — from `/gate-1-requirements`; the approved requirement list, and
  `requirements_edited[]` names the ids whose gate-corrected text supersedes the extracted one
- `02_figma_state.json` — from `/figma-extractor`, when it has run (optional)
- `design_requirements.md` — from `/prd-design-requirements`, when it has run (optional, context only)

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/<feature>/03_screen_plans.json`

Write these files as the **last step** of the skill, into this run's own output folder — resolve and
create it in one step with:

```bash
node utils/pipeline.mjs path --stage screen-planner --ensure
```

The shape above is **enforced, not just documented**. The machine-checkable version lives in
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json), keyed by the filenames listed above —
read it before writing and satisfy it exactly. Where the JSON block above and the schema differ, the
schema decides.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done screen-planner
```

That validates the artifacts and records the inputs they were built from. Both halves matter:

- A stage counts as done only when its files exist **and** validate. Writing a partial file no longer
  marks the stage complete — the resolver reports it as invalid and re-runs it. So if you cannot
  produce a complete artifact, say so plainly instead of writing a stub.
- Recording the inputs is what lets a later edit to the PRD (or to `DESIGN_SYSTEM_URL`) invalidate this
  stage and everything downstream. Skip `done` and the stage is treated as stale and redone.

If `done` reports problems, fix the artifact and run it again. Never hand-edit `.pipeline-state.json`
to make a stage look finished.
