---
name: screen-planner
description: Plan screens and wireframes based on PRD requirements
---

# Screen Planner Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/prd-analyzer`  ·  **Optional:** `/prd-design-requirements`

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
- **Design Requirements doc** (from prd-design-requirements, optional)

### This is the LAST stage of phase 1, and gate 1 reviews what it writes

This stage was phase 2's entry point and has been moved deliberately. It is now the **final stage of
phase 1**, it runs **before** `/gate-1-requirements`, and `03_screen_plans.json` is one of the things
that gate signs off — beside the requirement list it claims to cover.

The reason is the omission nothing else could catch. `03_screen_plans.json` is an *interpretation* of
the PRD, and nearly all of phase 2 derives from it: `/screen-validator`, `/component-analyzer`,
`/coverage-scorer`, `/coverage-reporter` and `/figma-modifier`'s layout. So a requirement the PRD names
but the plan never captures is **permanently invisible** to every plan-derived check downstream — and
invisible to gate 3 too, because a requirement that produced no checklist entry produces no page to ask
about. Reviewed at gate 1, against the requirements, that gap is visible while it is still cheap to fix.
Gate 1's `screens_cover_requirements` check is exactly this question.

**Do not require `/gate-1-requirements`.** This stage is an *input* to that gate now; the edge would be
a cycle, and `check` rejects it. Phase 2 is held shut instead by three direct gate-1 edges, on
`/figma-extractor`, `/screen-validator` and `/component-analyzer` — everything else in phase 2 reaches
one of those transitively. If you ever move this stage back, those edges move with it.

**You cannot read the gate 1 signoff, and must not plan around one.** This stage used to read
`G1_requirements_signoff.json`'s `requirements_edited[]` — the ids a reviewer corrected **by hand** at
the gate rather than sending back for a re-run — so it could plan from the corrected wording. Running in
front of the gate, it cannot: the signoff does not exist yet. What replaces it is a rule at the gate — a
hand-edit to a requirement is `changes_requested`, which marks phase 1 `run` again and regenerates these
plans from the corrected text. An approval that silently carried `requirements_edited[]` would leave the
screen plans built from superseded requirements while every downstream check reported the phase approved.

**No Figma, because this is phase 1.** `/figma-extractor` is no longer an optional input: it is a phase-2
stage behind gate 1, and consuming its artifact here would pull a gated stage in front of its own gate.
So the plans get no existing-screens context from `02_figma_state.json` and are derived from the PRD
alone. Reconciling them against what is already in the file is `/component-analyzer`'s job in phase 2.

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
- `design_requirements.md` — from `/prd-design-requirements`, when it has run (optional, context only)

That is the whole list, and both omissions are the phase boundary. **`G1_requirements_signoff.json` does
not exist yet** — this stage runs in front of that gate and is an input to it. **`02_figma_state.json` is
a phase-2 artifact** behind the same gate. Phase 1 reads the PRD and nothing else.

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

## After `done`, the run stops at gate 1

`done` is the last step of this skill, and this skill is now the **last stage of phase 1**. What follows
is not phase 2 but the human gate that closes phase 1 — and this stage's own output is part of what that
gate reviews:

```bash
node utils/pipeline.mjs plan gate-1-requirements
```

`/gate-1-requirements` presents the requirement list, the §8 decision packets **and these screen plans**,
asks for approve / request changes / reject, and records the answers. Do **not** begin `/screen-validator`,
`/component-analyzer` or anything else in phase 2: all three phase-2 entry points require the gate stage,
so the graph blocks them, and offering to run one "while they review" is how the boundary erodes.

If the gate comes back `changes_requested`, `plan` marks phase 1 `run` again — including this stage.
**Regenerate the plans from the corrected requirements rather than patching them**, and re-run
`/prd-design-requirements` too if §5–§6 changed. That re-run is the mechanism that replaced reading
`requirements_edited[]` from the signoff, so a plan carried over unchanged through a `changes_requested`
is the exact failure this arrangement exists to prevent.
