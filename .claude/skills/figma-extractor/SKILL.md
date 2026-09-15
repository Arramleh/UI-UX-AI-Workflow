---
name: figma-extractor
description: Extract screens, frames, and components from Figma files
---

# Figma Extractor Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** **nothing** — this is an entry point

This skill can be invoked on its own. When it is, the upstream skills it depends on may not have run yet,
so **step 0 is always**:

```bash
node utils/pipeline.mjs plan figma-extractor
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

Extracts current design state from Figma files via API.

## It reads the PRODUCT file, and it is not a component source

Two files are in play and they must never be conflated. This stage reads the **product file** — the
feature's screens. `/design-system-loader` reads the **design system library**, and that artifact is the
only thing in this pipeline that answers *"what components exist"*.

What this stage finds is frames and **instances**. `02_figma_state.json`'s `components` array is what is
*used on the screens*, not what the system offers — so nothing downstream may map a requirement onto an
entry in it. Doing so produces a component that cannot be reused and was never in the library to begin
with. `/component-analyzer` builds its `mapping_table` against `05_design_system.json` alone, and that
is deliberate rather than an oversight.

What this artifact is legitimately for:

- **Seeing what already exists**, so an `extend` in the build checklist targets the real component
  instead of creating a parallel one.
- **Checking a name** against earlier rename and retirement decisions before speccing against it.
- **Resolving `unverified_prd_claims`** — a PRD's own claims about Figma pages are checked here.

This stage is **read-only**, and nothing is ever built into this file except **screens**, in phase 3.
Components go into the design system library; see
[`/figma-component-pass`](../figma-component-pass/SKILL.md).

## Usage

```
/figma-extractor "https://www.figma.com/file/..."
```

## Input
- **Figma URL**: the **product** file — the one holding this feature's screens. Not the design system
  library URL; that is `/design-system-loader`'s input, and passing it here produces a `02_figma_state.json`
  describing the library, which every stage downstream will read as "what this feature's screens contain".
- **Figma API Token**: (from `.env` or prompt)

## Output
```json
{
  "file_id": "...",
  "file_name": "...",
  "pages": [
    {
      "name": "Page Name",
      "frames": [
        {
          "id": "...",
          "name": "Screen Name",
          "description": "Frame description from notes",
          "components_used": ["ComponentName", "ComponentName2"],
          "layers": ["layer 1", "layer 2"],
          "size": { "width": 1920, "height": 1080 }
        }
      ]
    }
  ],
  "components": [
    {
      "id": "...",
      "name": "Component Name",
      "description": "What it does",
      "category": "Button|Input|Card|etc",
      "status": "ready|wip|deprecated"
    }
  ]
}
```

## Notes
- Requires valid Figma API token
- Extracts all pages and frames
- Maps component usage across screens
- Reads frame descriptions from Figma notes

## Artifact contract

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/<feature>/02_figma_state.json`

Write these files as the **last step** of the skill, into this run's own output folder — resolve and
create it in one step with:

```bash
node utils/pipeline.mjs path --stage figma-extractor --ensure
```

The shape above is **enforced, not just documented**. The machine-checkable version lives in
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json), keyed by the filenames listed above —
read it before writing and satisfy it exactly. Where the JSON block above and the schema differ, the
schema decides.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done figma-extractor
```

That validates the artifacts and records the inputs they were built from. Both halves matter:

- A stage counts as done only when its files exist **and** validate. Writing a partial file no longer
  marks the stage complete — the resolver reports it as invalid and re-runs it. So if you cannot
  produce a complete artifact, say so plainly instead of writing a stub.
- Recording the inputs is what lets a later edit to the PRD (or to `DESIGN_SYSTEM_URL`) invalidate this
  stage and everything downstream. Skip `done` and the stage is treated as stale and redone.

If `done` reports problems, fix the artifact and run it again. Never hand-edit `.pipeline-state.json`
to make a stage look finished.
