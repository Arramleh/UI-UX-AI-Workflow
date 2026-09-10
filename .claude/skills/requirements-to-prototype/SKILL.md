---
name: requirements-to-prototype
description: Convert a design-requirements markdown file (PRD-derived — Overview, Objectives, Personas, User Flows, Pages/Frames, Components, Open Decisions) into a single interactive Design Component prototype covering every listed frame, with a role switcher that drives permissions. Use whenever the user attaches or references a requirements/PRD/design-requirements .md and asks to "convert this into design", "turn this into screens", "design this", "prototype this", or "build the frames" — even if they don't say "skill". Do NOT use for building individual design-system atoms, for Figma writes, or for requirements extraction (that is prd-design-requirements, which runs before this).
---

# Requirements → interactive prototype

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/prd-design-requirements`

This skill is **standalone**: nothing depends on it, and `/run-prd-workflow` does not run it. You invoke it
directly. It still has an upstream dependency, so **step 0 is always**:

```bash
node utils/pipeline.mjs plan requirements-to-prototype
```

Then follow its output exactly:

1. **`RUN THESE SKILLS FIRST`** — invoke each listed skill with the Skill tool, **in the printed order**,
   one at a time, letting each finish and write its artifact before starting the next.
2. **`ALREADY SATISFIED`** — do **not** re-run these. Read their artifacts from `reports/<feature>/` and reuse them.
3. **`INPUTS NEEDED`** — anything marked `NOT SET` must come from the user before the chain can run.
4. **`READY: yes`** — proceed with the work described below.

> Never fabricate an upstream result. If an artifact is missing, run the skill that produces it.

### Required tooling — check this first

This skill writes through `dc_write` and verifies with `ready_for_verification`. Those tools exist only in
environments with Design Component tooling; they are **not** present in a plain Claude Code session.

**If `dc_write` is unavailable, stop and say so plainly.** Do not fall back to writing a hand-rolled HTML
file with `Write` and calling it done — that produces something that looks like the deliverable, is not a
Design Component, and marks the stage complete. Report that the stage needs an environment with
Design Component tooling and leave the artifact unwritten.

This missing-tool risk is exactly why the stage is standalone: as part of `/run-prd-workflow` it would fail
every run, on a deliverable that run never asked for.

## Why this stage is standalone

It is a **parallel deliverable to the Figma build, not a step in it.** It produces a working HTML prototype;
`/figma-modifier` → `/figma:figma-use` produce Figma components and screens. Neither feeds the other, and
nothing in the gated flow reads this prototype: `/gate-3-pages` reviews the assembled Figma pages, and it
is the only review of what was built. Do **not** use this skill for Figma writes, and do not treat a
verified prototype as evidence about the Figma module — the two are built from the same doc and can
diverge from each other without anything noticing.

It reads the requirements prose and not `03_screen_plans.json`, on purpose: that artifact stores `layout` as
a bare string (`"grid"`, `"stacked"`) with no geometry, so it would add no fidelity the prose does not
already carry.

## Order of operations

1. **Read the requirements file end to end.** Do not skim. Then read the attached design system
   (`list_files` its project root, read the index/README, read any `.css` for real token names).
   `05_design_system.json` in `reports/_shared/` is the already-extracted walk of the library — start
   there. If the design system project is empty or has no tokens, say so in one line and set the visual
   direction yourself — do not silently guess token names.
2. **Extract the build spec** into working memory (below). Do not write it out as a document unless asked.
3. **Decide the open decisions yourself.** The doc's §8 will already carry decisions taken upstream —
   honour those as constraints. For anything still genuinely open, pick the defensible default, build it,
   and list your calls in the closing message as "easy to change". Never open a form just to resolve them.
4. **Ask questions only if the doc lacks Pages/Frames or Personas.** A doc with both is a complete brief — build.
5. **Write one `dc_write` call.** Verify with `ready_for_verification`.

## What to extract from the doc

| Doc section | Becomes |
|---|---|
| Pages / Frames | The **states** of the single prototype — never separate files |
| Personas table | A **role switcher** in the app chrome; each role's "What's distinct here" becomes a `can*` boolean |
| Common Flows | The clickable happy path; every arrow in a flow must be a real interaction |
| Special Flows | Role-gated controls that appear/disappear with the switcher |
| Components list | Which parts reuse an existing family vs. are marked **new** — build the "new" ones with the most care, they are the actual design work |
| Objectives | The checklist you self-audit against before verifying |
| Open Decisions → Resolved upstream / Decided here | Hard constraints. Honour them exactly (e.g. "Formulas have only My and Shared") |
| Open Decisions → Needs a human in the editor | Not yours to resolve. Build the neutral version and name it in the closing message |

## Non-negotiable rules for the build

- **Frames are states, not files.** Dialogs are overlays in the same DC, the empty state is a conditional
  inside the canvas, the recipient/viewer frame is the same canvas under a different role. One file.
- **Absent, not disabled.** When a persona row says a control is absent from their navigation, remove it
  from the DOM — never render it greyed out.
- **Every flow arrow works.** If the doc says "drag an item → drop it on the canvas", implement real
  `onDragStart`/`onDrop`, not a click-only shortcut. Add click-to-place as a *second* affordance, never as
  the only one.
- **Respect stated variance.** If the doc says sizes are not uniform across element types, give each type
  its own size list. Uniform-by-default is a bug against the requirements.
- **Realistic domain content.** Use the product's actual vocabulary and plausible values (real site names,
  real units, real formula expressions). Never "Lorem", "Item 1", "Card title", or invented metrics that
  don't fit the domain.
- **One conditional per requirement, no filler screens.** Do not add sections, settings pages, or
  onboarding the doc doesn't ask for.

## Structure of the DC

- **Template** = the whole layout in markup with inline styles only. Every value the user might edit
  (labels, copy, numbers) must be template text or a simple `{{ hole }}`, never a `React.createElement`
  subtree.
- **Logic class** holds: a `CATALOG`/data constant, a `SIZES` map, a `USERS` list, one `state` object with
  the mode, the role, the placed/selected collections, and the dialog flags; `renderVals()` derives every
  `can*` permission boolean, every precomputed style string, and every handler.
- **Style strings are computed in `renderVals`**, applied via `style="{{ x.style }}"` — only for genuinely
  runtime values (selection, size span, validation). Static styling stays as literal inline `style`
  attributes so the page paints while streaming.
- **Props (`d_props_json`)**: 1–3 functional toggles that switch prototype state (e.g. `startPopulated`),
  never colors or copy.
- Chrome pattern that works: dark app bar (title + mode badge + role-gated action buttons + role switcher)
  → icon rail → main canvas → conditional right panel → fixed overlays for dialogs → toast for
  confirmations.

## Self-audit before verifying

Walk the doc's Objectives list and the numbered Common Flows one by one and confirm each is clickable in the
prototype. Then walk the Personas table and confirm each role's distinct action is present for that role and
absent for the others. Fix gaps before calling `ready_for_verification`.

## Closing message

Two short paragraphs, no more:
1. What the prototype covers and how to drive it (which control switches states).
2. The calls you made on the doc's still-open decisions, framed as easy to change.

Never restate the requirements back to the user.

## Artifact contract

**Reads** (from `reports/<feature>/` and `reports/_shared/`, produced by upstream skills):

- `design_requirements.md` — from `/prd-design-requirements`
- `05_design_system.json` — from `/design-system-loader` (in `reports/_shared/`), for real token names

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/<feature>/prototype_<date>.dc.html`

Resolve and create the output folder in one step with:

```bash
node utils/pipeline.mjs path --stage requirements-to-prototype --ensure
```

This artifact is declared in the manifest as the wildcard `prototype*`, so it is **existence-checked, not
schema-checked** — there is no machine-checkable shape for a generated prototype. Nothing downstream will
catch a frame you skipped, which is what the self-audit above is for.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done requirements-to-prototype
```

That validates the artifact and records the inputs it was built from. If `dc_write` was unavailable and you
wrote nothing, **do not run `done`** — leave the stage unsatisfied so it is retried in an environment that
can actually build it. Never hand-edit `.pipeline-state.json` to make a stage look finished.
