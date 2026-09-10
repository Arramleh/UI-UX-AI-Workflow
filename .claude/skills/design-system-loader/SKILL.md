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
    "last_updated": "2024-08-31",
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
      "colors": {},
      "typography": {},
      "spacing": {},
      "shadows": {},
      "border_radius": {}
    }
  }
}
```

## Notes
- Supports multiple source types (Figma, Markdown, JSON)
- Extracts component hierarchy — including component-set children, which is the part that gets skipped
- Maps design tokens
- Documents component properties
- Records variants and states per component: phase 2 verifies direct matches at variant level, and it can
  only do that against what this stage wrote down

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
