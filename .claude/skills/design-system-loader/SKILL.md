---
name: design-system-loader
description: Load and parse external design system reference
---

# Design System Loader Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** **nothing** — this is an entry point

This skill can be invoked on its own. When it is, the upstream skills it depends on may not have run yet,
so **step 0 is always**:

```bash
node utils/pipeline.mjs plan design-system-loader
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

Loads component libraries from external design system sources.

This opens **phase 2 — live inspection**, and it runs at **shared scope**: what it records is the library
every feature's phase-2 mapping is measured against. Two governance rules follow from that, and both
exist because a loader that gets them wrong does not fail visibly — it hands phase 2 a library that is
quietly missing things, and phase 2 then declares gaps that are not real.

**Its phase number is documentation, not a gate.** Phase 1 reads the PRD and nothing else, so nothing
before gate 1 needs this artifact — `phase: 2` records where it is first wanted. But gates are
per-feature and a shared stage must never depend on a per-feature one, so `check` exempts
`scope: "shared"` from the phase-gate rule and this stage carries no gate edge. It has no dependencies
at all and will run whenever first asked for, including before gate 1. That is correct: a library walk
is a fact about the library, and no requirements signoff changes it. The per-feature half of phase 2's
inspection, `/figma-extractor`, is the one that genuinely blocks on gate 1.

### This is the library, and it is the only thing that answers "what components exist"

Two files are in play across this pipeline and they must never be conflated. **This stage reads the
design system library.** `/figma-extractor` reads the **product file** — the feature's screens — and
what it finds there is frames and *instances*, not library components. Nothing downstream may treat
`02_figma_state.json` as a component source: a thing that exists on a screen is not a thing the system
offers, and mapping a requirement onto one produces a component that cannot be reused and was never in
the library to begin with. `/component-analyzer`'s `mapping_table` is built against
`05_design_system.json` alone.

The same split decides where things get **built**. Components go into this library; screens go into the
product file. So the artifact has to record the library's *identity*, not just its contents:
`design_system.figma_library` carries the `file_key`, the `file_url`, the component pages, and
`is_write_target`. That block is what `/figma-component-pass` checks before its first write, and what
gate 2's `built_in_design_system_file` check is judged against.

It exists because the pipeline had no file-level notion of a design system at all. The component pass
was instructed to build "into the file at `FIGMA_URL`" — the product file — so components this pipeline
created were never in the library: invisible to the next feature's walk, reported as gaps, and built
again. No artifact recorded the destination, so nothing could notice.

Set **`is_write_target: false`** when the design system is documentation rather than a live, writable
Figma library — a Markdown spec, a JSON export, a published-only library this token cannot write to.
This is not a formality. `/figma-component-pass` **refuses to build** when it is false, because the only
remaining destination would be the product file, and a component there is worse than a component
missing: it looks built.

### Record the rules, not only the parts

`design_system.conventions` is **required**, and it is the half of this artifact the pipeline's whole
"follow what the design system declares" rule rests on. `/figma-modifier` is told to match the library's
naming, its variant axes and its spacing rhythm; before this block existed the artifact guaranteed none
of the three were in it, so there was nothing to match against and every new component declared its own
conventions — each defensible on the handful of neighbours its author happened to look at.

| Field | What to capture, and how to find it |
|---|---|
| `naming.pattern` + `naming.examples` | The library's naming grammar, with **real examples taken from it**. A pattern alone reads differently to everyone: `Category/Name` does not say whether it is `Button/Primary` or `Buttons/Primary`, and the difference is a component nobody can find. Examples are required for that reason. |
| `variant_axes` | The canonical variant **property names** and the values each admits, keyed by axis name. Read them off the existing component sets — this is what stops a new component shipping a `type` axis into a library that everywhere else says `variant`. |
| `location_pattern` | Where a component belongs inside the file, as a pattern. Every `location` in the build checklist is written against this, and gate 2 judges placement by it. |
| `token_binding.hardcode_policy` | `forbidden` / `discouraged` / `allowed` — the library's own rule about raw values, plus whether it uses Figma variables. |
| `spacing_scale` | The ordered ramp of spacing token names. `design_tokens.spacing` is an opaque object and cannot express order; "match the spacing rhythm" needs the ramp, not the set. |
| `required_states` | States every component here is expected to carry. Record a **systemic absence as a gap**, not as a convention — if nothing in the library has a focus state, that is a thing to fix in what gets built, not a precedent to copy into twenty new components. |
| `retired` | Names that must not come back. A retired component reached for by the name someone remembers returns looking exactly like an approved reuse. |

These are observations about the library, so derive them from the walk rather than assuming a house
style. Where the library is genuinely inconsistent, record the **dominant** convention and say so in
`naming.notes` — an inconsistency named is one the next component does not have to re-litigate.

### Walk INTO component sets, not just across their top level

The library walk must **descend into component sets** and record their nested children, not stop at the
component sets' own top level. Absence from a keyword search is not absence from the file. The bell icon
was reported missing from `Icons/General` while sitting nested inside the `Notification Bill` component
set — present in the file the whole time, invisible to anything that only enumerated promoted top-level
components.

`search_design_system` alone does not satisfy this rule. It searches **published** libraries only, while
most in-house systems keep components directly on a file's own pages, so a library-only search silently
reports "missing" for components that plainly exist. Inspect the design system file's own pages, then
descend through each component set.

A loader that records only promoted, top-level components produces `05_design_system.json` describing a
library in which those components **do not exist**. `/component-analyzer` reads that artifact as ground
truth and correctly concludes there is a gap; the gap is an artefact of the walk, not of the library, and
nothing downstream can tell the difference.

### Design system state has a shelf life

A conclusion from an earlier session is **re-verified against the live file**, not assumed to still hold.
The library is edited by people between runs, so a note that was accurate when written is a guess by the
time it is read. The Reconnecting banner was once recorded as having "no adequate Alert state"; a later
live inspection found an `Alerts → State=Info` variant that had since been added — the earlier note had
gone stale and had to be corrected, not treated as settled.

`max_age_days: 7` on this stage is that rule mechanized. Because `DESIGN_SYSTEM_URL` points at something
remote, no local fingerprint can see the library change, so the cache expires on a clock instead. Pass
`--force` when you know the library was edited sooner, and record `last_updated` from **this** inspection
rather than carrying the previous value forward.

## Usage

```
/design-system-loader "https://design-system-url"
/design-system-loader "path/to/design-system.md"
/design-system-loader "path/to/figma-design-system.url"
```

## Input
- **Design System Source**: URL, file path, or Figma design system link

## Output
```json
{
  "design_system": {
    "name": "Design System Name",
    "version": "2.0",
    "source": "URL or file path",
    "last_updated": "2026-09-15",
    "figma_library": {
      "file_key": "DSKEY",
      "file_url": "https://www.figma.com/design/DSKEY/Acme-Design-System",
      "name": "Acme Design System",
      "is_write_target": true,
      "component_pages": ["Atoms", "Molecules", "Organisms"],
      "published": true
    },
    "conventions": {
      "naming": {
        "pattern": "Components/<Category>/<Name>",
        "examples": ["Components/Inputs/TextField", "Components/Actions/Button"],
        "case": "PascalCase",
        "separator": "/",
        "notes": "Icons break the pattern — Icons/<Set>/<Name>. Dominant convention recorded; the four legacy `btn-*` sets are the exception, not the rule."
      },
      "variant_axes": {
        "variant": ["primary", "secondary", "ghost"],
        "size": ["sm", "md", "lg"],
        "state": ["default", "hover", "focus", "disabled"]
      },
      "location_pattern": "Components/<Category>/<Name>",
      "token_binding": {
        "hardcode_policy": "forbidden",
        "uses_figma_variables": true
      },
      "spacing_scale": ["spacing.xs", "spacing.sm", "spacing.md", "spacing.lg", "spacing.xl"],
      "layer_order": ["Atoms", "Molecules", "Organisms"],
      "required_states": ["default", "hover", "focus", "disabled"],
      "retired": ["NotifBell", "btn-legacy"]
    },
    "categories": {
      "Atoms": [
        {
          "name": "Button",
          "description": "Primary action button",
          "variants": ["primary", "secondary", "disabled"],
          "properties": {
            "size": ["sm", "md", "lg"],
            "state": ["default", "hover", "active", "disabled"],
            "icon": "optional"
          }
        }
      ],
      "Molecules": [],
      "Organisms": [],
      "Pages": []
    },
    "design_tokens": {
      "colors": { "color.surface.raised": "#FFFFFF", "color.border.default": "#D8DCE3" },
      "typography": { "type.body.md": "14/20 Inter Regular", "type.heading.lg": "24/32 Inter Semibold" },
      "spacing": { "spacing.xs": 4, "spacing.sm": 8, "spacing.md": 16, "spacing.lg": 24 },
      "shadows": { "elevation.md": "0 2px 8px rgba(16,24,40,.08)" },
      "border_radius": { "radius.md": 8 }
    }
  }
}
```

## Notes
- Supports multiple source types (Figma, Markdown, JSON) — but only a live, writable Figma library can
  be a build target; anything else records `figma_library.is_write_target: false` and stops the
  component pass rather than sending it somewhere else
- Records the library's **identity** (`figma_library`) and its **rules** (`conventions`), not just its
  parts — those are what the component pass writes into and builds to
- Extracts component hierarchy — including component-set children, which is the part that gets skipped
- Maps design tokens
- Documents component properties
- Records variants and states per component: phase 2 verifies direct matches at variant level, and it can
  only do that against what this stage wrote down
- `last_updated` is **required** and records *this* inspection, never the previous value carried
  forward. It was optional while the shelf-life rule above told you to write it, so a library walk could
  satisfy the schema without ever saying when it happened — which is the one fact the staleness rule needs

## Artifact contract

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/_shared/05_design_system.json`

> **This artifact is shared, not per-feature.** The design system is global — it does not vary by PRD —
> and it is the most expensive thing in this pipeline to extract, since it means walking a whole Figma
> library. So it is written once to `reports/_shared/` and every feature reads the same copy instead of
> re-extracting it. That is why this stage carries `"scope": "shared"` in
> [`.claude/pipeline.json`](../../pipeline.json), why it needs no feature slug, and why it can run
> before the run has even been named.
>
> Because `DESIGN_SYSTEM_URL` points at something remote, no local check can see the library being
> edited in Figma. The stage therefore declares `max_age_days: 7` and expires on its own; pass
> `--force` to refresh it sooner.

Write these files as the **last step** of the skill, into this run's own output folder — resolve and
create it in one step with:

```bash
node utils/pipeline.mjs path --stage design-system-loader --ensure
```

The shape above is **enforced, not just documented**. The machine-checkable version lives in
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json), keyed by the filenames listed above —
read it before writing and satisfy it exactly. Where the JSON block above and the schema differ, the
schema decides.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done design-system-loader
```

That validates the artifacts and records the inputs they were built from. Both halves matter:

- A stage counts as done only when its files exist **and** validate. Writing a partial file no longer
  marks the stage complete — the resolver reports it as invalid and re-runs it. So if you cannot
  produce a complete artifact, say so plainly instead of writing a stub.
- Recording the inputs is what lets a later edit to the PRD (or to `DESIGN_SYSTEM_URL`) invalidate this
  stage and everything downstream. Skip `done` and the stage is treated as stale and redone.

If `done` reports problems, fix the artifact and run it again. Never hand-edit `.pipeline-state.json`
to make a stage look finished.
