---
name: evaluate-design-system
description: Evaluate the design system as a UI/UX expert and write build-ready specs for what the library itself lacks
---

# Evaluate Design System Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/design-system-loader` — and nothing else.

This skill can be invoked on its own. When it is, the upstream skills it depends on may not have run yet,
so **step 0 is always**:

```bash
node utils/pipeline.mjs plan evaluate-design-system
```

Then follow its output exactly:

1. **`RUN THESE SKILLS FIRST`** — invoke each listed skill with the Skill tool, **in the printed order**,
   one at a time, letting each finish and write its artifact before starting the next.
   Each of those skills runs its own prerequisite check, so the whole upstream chain resolves itself.
2. **`ALREADY SATISFIED`** — do **not** re-run these. Read their artifacts and reuse them.
3. **`INPUTS NEEDED`** — anything marked `NOT SET` must come from the user before the chain can run.
   Ask once, up front, for all of them together, and offer to save them into `.env`.
4. **`READY: yes`** — proceed with the work described below.

Flags: `--force` re-runs the whole chain from scratch, `--include-optional` also runs the optional upstream
skills, `--no-stale` accepts existing artifacts even when an upstream artifact is newer, `--json` for parsing.

> Never fabricate an upstream result. If an artifact is missing, run the skill that produces it.

## This skill is NOT PRD-relative — do not make it so

**It judges the design system, not any feature.** Whether the library has focus states, a coherent
spacing scale, adequate contrast, composable primitives — that is the same answer for every PRD. So this
stage carries `"scope": "shared"`, writes to `reports/_shared/`, depends on `/design-system-loader` alone,
and every feature reads the same verdict.

It must **not** depend on `/component-analyzer`, `/coverage-scorer`, `/screen-planner` or `/prd-analyzer`.
Those are PRD-relative: they answer "does the design system cover the screens *this* PRD needs", and their
output changes with every PRD. Coupling to them would let one feature's requirements silently shape the
verdict on a library that every other feature shares — and would re-grade the same library once per PRD.

**Do not read `09_gap_analysis.json` or `03_screen_plans.json`, even if they happen to exist on disk.**
If you find yourself wanting a requirement id, you are answering the wrong question.

## What this skill is for

It does two things, and they are one job:

1. **Grades the design system as it stands** — so systemic faults surface as findings instead of being
   faithfully reproduced in every component specced below. A library with no focus states anywhere will
   otherwise get twenty new components with no focus states.
2. **Writes a build-ready spec for each thing the library lacks** — anatomy, variants, states, token
   bindings, layout, keyboard and a11y behaviour, in enough detail to build the real thing rather than a
   correctly-named empty frame. "Build-ready" is about being specific, not about being scheduled:
   nothing builds these automatically (see *Handoff* below).

"Lacks" means *as a design system*: no date-input equivalent, no loading treatment, no popover elevation
token, no error state on anything. Not "this PRD needs a DatePicker" — that is `09_gap_analysis.json`'s
job, and it belongs to a feature, not to the library.

## This skill stands alone — `/run-prd-workflow` does not run it

It is marked `"standalone": true` in [`.claude/pipeline.json`](../../pipeline.json), which means two things:

- **Nothing depends on it.** `/figma-modifier` used to require it; that edge is gone. A feature build
  works from its own `09_gap_analysis.json` and the existing `05_design_system.json`, and designs what it
  needs itself. It should not wait on a library-wide critique it never asked for, and the critique should
  not be re-run every time a feature ships.
- **No orchestrator invokes it.** `/run-prd-workflow` skips it by design. Run
  `/evaluate-design-system` directly when you want to know whether the library is any good — that is a
  design system review with its own audience and its own cadence, not a step in shipping a feature.

`pipeline.mjs check` enforces the first point: it reports an error if any stage declares a dependency on
a standalone stage, because such an edge would pull this stage into every plan that reaches the
dependant while the manifest still claimed it was opted out.

`node utils/pipeline.mjs status` shows it as `[-]  standalone` rather than pending — it is not missing
work, it is work nobody scheduled.

## Usage

```
/evaluate-design-system
# Reads only the shared design system. Needs no feature slug and no PRD.
```

Because it is shared, it can run **before a run is even named** — there is no `--project` to supply:

```bash
node utils/pipeline.mjs plan evaluate-design-system          # no feature required
node utils/pipeline.mjs path --stage evaluate-design-system --ensure   # -> reports/_shared/
```

On the second and later features `plan` will report it already satisfied. That is correct: the library
has not changed, so the verdict has not either. It goes stale when `05_design_system.json` is refreshed,
or on `--force`.

## How to evaluate

Judge the **library**, not the screens — the screens are `/screen-validator`'s job. Score each dimension
0–100 and justify it with findings, not vibes. Every finding needs a concrete observation and an
actionable recommendation; "improve consistency" is not a finding.

| Dimension | What you are asking |
|-----------|---------------------|
| `component_coverage` | Does the library have the primitives a product of this kind needs — inputs, selection, navigation, feedback, data display — without one-offs? |
| `state_coverage` | Does each interactive component define default / hover / focus / active / disabled / loading / error? |
| `token_coverage` | Are colour, type, spacing, radius and elevation tokenised — or hardcoded in components? |
| `accessibility` | Contrast ratios, visible focus, target sizes, keyboard paths, semantic roles |
| `naming_consistency` | One convention, predictable paths, no `Button2` / `ButtonNew` |
| `composability` | Do components compose, or does every variation need a new component? |

Cite WCAG criteria by number when a finding is an accessibility failure (e.g. `1.4.3` for contrast).
Be honest and specific: a maturity score of 45 with six sharp findings is far more useful than 80 with
three vague ones. **Do not inflate the score** — everything downstream, including what gets built, is
shaped by what you flag here.

## How to spec what the library lacks

Derive the list from the **library itself** — the categories in `05_design_system.json`, the states and
variants its existing components do and do not define, the tokens it does and does not have. A component
family with no equivalent, a state missing across the board, an elevation token nothing can reference:
those are the gaps. Do not go looking for a feature's requirements to justify one.

Write each spec so someone could build from it without asking questions:

- **Prefer `extend` or `modify` over `create`.** If `Input` exists and the gap is a date field, extending
  it keeps the system coherent; a brand-new `DatePicker` that shares nothing with `Input` makes it worse.
  Set `based_on` to the component you are building from.
- **Bind tokens by name**, from `05_design_system.json` — `color.surface.default`, not `#0af`. A spec that
  hardcodes hex has left the design system rather than extended it. If a token you genuinely need does
  not exist, do not invent a value silently: add it to `token_gaps` with a rationale.
- **Anatomy before pixels.** Name the parts (trigger, field, popover, footer) and what each one is, so
  the Figma layer structure follows the component's structure.
- **Every state, not just the happy one.** Include focus and error; they are the two most often missing,
  and they are the ones users hit under stress.
- **Accessibility per component.** Role, keyboard model, ARIA, contrast minimum, target size, focus
  treatment. A non-interactive component (a Card, a Divider) has no keyboard model — say so in `notes`
  rather than leaving the block empty or inventing one.
- **Justify it from the library**, in `purpose` — what the system cannot express today. Do not cite
  requirement ids; this artifact is shared by every feature and outlives all of them.

Leave `component_specs` empty if the library genuinely lacks nothing. That is a real result; say so
plainly rather than manufacturing work.

## Output

```json
{
  "evaluation": {
    "design_system": "Acme DS",
    "maturity_score": 62,
    "by_dimension": {
      "component_coverage": 70,
      "state_coverage": 45,
      "token_coverage": 88,
      "accessibility": 40,
      "naming_consistency": 75,
      "composability": 60
    },
    "strengths": [
      "Colour and spacing are fully tokenised with a consistent 4px scale",
      "Button covers all six interaction states"
    ],
    "findings": [
      {
        "id": "UX-1",
        "dimension": "accessibility",
        "severity": "critical",
        "component": "Input",
        "observation": "No visible focus state defined; focus relies on the browser default, which is removed by the reset",
        "recommendation": "Add a focus state using a 2px color.border.focus ring at 2px offset on every input-like component",
        "wcag": "2.4.7"
      },
      {
        "id": "UX-2",
        "dimension": "state_coverage",
        "severity": "high",
        "component": null,
        "observation": "No component defines a loading state, though six planned screens have async actions",
        "recommendation": "Define a shared loading treatment (spinner slot + disabled interaction) and apply it to Button, Input and Card"
      }
    ]
  },
  "component_specs": [
    {
      "name": "DatePicker",
      "action": "create",
      "category": "Molecules",
      "location": "Components/Inputs/DatePicker",
      "purpose": "The library has no date-entry primitive; today a date field is a plain Input with a format hint, so validation and calendar affordances are re-invented per screen",
      "based_on": "Input",
      "anatomy": [
        { "part": "Trigger", "element": "Input", "required": true, "notes": "Reuses Input; adds a calendar icon in the trailing slot" },
        { "part": "Popover", "element": "Surface", "required": true, "notes": "Anchored below the trigger, flips above when clipped" },
        { "part": "MonthGrid", "element": "grid", "required": true, "notes": "7 columns, 6 rows, fixed height so the popover does not resize between months" },
        { "part": "Footer", "element": "container", "required": false, "notes": "Clear and Today actions" }
      ],
      "variants": [
        { "name": "single", "properties": { "range": "false" } },
        { "name": "range", "properties": { "range": "true" } }
      ],
      "states": [
        { "state": "default", "description": "Closed, placeholder visible", "tokens": { "border": "color.border.default" } },
        { "state": "focus", "description": "Closed, focus ring on trigger", "tokens": { "border": "color.border.focus" } },
        { "state": "open", "description": "Popover visible, trigger keeps focus ring" },
        { "state": "error", "description": "Invalid or out-of-range date", "tokens": { "border": "color.border.error" } },
        { "state": "disabled", "description": "Non-interactive, 40% opacity" }
      ],
      "tokens": {
        "background": "color.surface.default",
        "text": "color.text.primary",
        "border": "color.border.default",
        "radius": "radius.md",
        "shadow": "shadow.popover"
      },
      "layout": {
        "direction": "vertical",
        "padding": "space.md",
        "gap": "space.sm",
        "min_width": "280px"
      },
      "accessibility": {
        "role": "combobox",
        "keyboard": [
          "Enter / Space opens the popover",
          "Arrow keys move by day, PageUp/PageDown by month",
          "Escape closes and returns focus to the trigger",
          "Tab moves to the footer actions, never trapping focus"
        ],
        "aria": ["aria-expanded", "aria-controls", "aria-activedescendant", "aria-invalid on error"],
        "contrast_min": "4.5:1",
        "min_target_px": 44,
        "focus_visible": true
      },
      "content": { "placeholder": "YYYY-MM-DD", "truncation": "none — field width is fixed to the format" },
      "responsive": { "mobile": "Popover becomes a full-width bottom sheet below 480px" },
      "figma": {
        "component_set": true,
        "variant_properties": ["range", "state"],
        "auto_layout": { "direction": "vertical", "padding": 16, "gap": 8 },
        "constraints": { "horizontal": "scale", "vertical": "top" }
      }
    }
  ],
  "token_gaps": [
    {
      "token": "shadow.popover",
      "why_needed": "DatePicker and Select both need a floating-surface elevation; the system defines only shadow.card",
      "proposed_value": "0 8px 24px rgba(0,0,0,0.12)"
    }
  ]
}
```

## Notes
- **Not PRD-relative**: shared across features, depends on the design system alone
- **Standalone**: nothing depends on it and `/run-prd-workflow` does not run it — invoke it directly
- Grades the library, not the screens — screens are `/screen-validator`'s job
- Specs what the library lacks, in enough detail to be built; scheduling that build is a human decision
- Prefers extending existing components over inventing parallel ones
- Binds design tokens by name and reports genuinely missing ones as `token_gaps`
- Never inflates the maturity score: what it flags shapes what gets built

## Artifact contract

**Reads** — exactly one artifact, on purpose:

- `reports/_shared/05_design_system.json` — from `/design-system-loader` (**shared**, not per-feature)

Nothing else. Every other artifact in the pipeline is PRD-relative, and reading one would tie the
shared verdict on the library to a single feature.

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/_shared/08_ux_evaluation.json`

> **Shared, not per-feature** — like the design system it grades, and for the same reason. It is written
> once to `reports/_shared/` and every feature reads the same copy. It needs no feature slug, so it can
> run before the run is named, and on later features `plan` correctly reports it already satisfied. It
> goes stale when `05_design_system.json` is refreshed.

Write these files as the **last step** of the skill, into this run's own output folder — resolve and
create it in one step with:

```bash
node utils/pipeline.mjs path --stage evaluate-design-system --ensure
```

The shape above is **enforced, not just documented**. The machine-checkable version lives in
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json), keyed by the filenames listed above —
read it before writing and satisfy it exactly. Where the JSON block above and the schema differ, the
schema decides.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done evaluate-design-system
```

That validates the artifacts and records the inputs they were built from. Both halves matter:

- A stage counts as done only when its files exist **and** validate. Writing a partial file no longer
  marks the stage complete — the resolver reports it as invalid and re-runs it. So if you cannot
  produce a complete artifact, say so plainly instead of writing a stub.
- Recording the inputs is what lets a later edit to the PRD (or to `DESIGN_SYSTEM_URL`) invalidate this
  stage and everything downstream. Skip `done` and the stage is treated as stale and redone.

If `done` reports problems, fix the artifact and run it again. Never hand-edit `.pipeline-state.json`
to make a stage look finished.

## Handoff — there isn't one, and that is the point

Nothing consumes this artifact automatically. `/figma-modifier` does **not** read it: it builds what a
feature needs from `09_gap_analysis.json` and the existing `05_design_system.json`, and designs those
components itself. So this skill's output is for a person deciding what to invest in the library, not a
step in shipping a feature.

Two consequences worth stating plainly:

- **Its specs are not scheduled to be built.** They describe what the *library* lacks — for the whole
  library, independent of any PRD. Filling those gaps is a decision someone makes after reading the
  evaluation. If you want one of them built, hand it to `/figma:figma-use` deliberately, or add it to a
  feature's design system so the gap analysis picks it up on the next run.
- **Do not filter these specs to one feature's needs.** That would be `09_gap_analysis.json`'s question,
  and this artifact is shared: a feature-specific filter applied here is wrong for every other feature.
  Keep the judgement about the library global.

The vocabulary — `action`, `location`, `variants`, token bindings by name — still matches
`11_build_phase.json` on purpose, so a spec can be carried across by hand without translation.
