---
name: developer-handoff
description: PHASE 4 — package the approved module into a developer-ready handoff: per-page specs, design-system token names and component links, props, states, breakpoints, edge cases, and a change-log of every component the build added to the library.
---

# Phase 4 — Developer Handoff

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `gate-3-pages`, `figma-modifier`, `figma-component-pass`, `figma-use`,
`design-system-loader`, `prd-analyzer` · **Optional:** `component-analyzer`, `screen-planner`

```bash
node utils/pipeline.mjs plan developer-handoff
```

Then follow its output exactly:

1. **`RUN THESE SKILLS FIRST`** — invoke each listed skill with the Skill tool, **in the printed order**,
   one at a time, letting each finish and write its artifact before starting the next.
2. **`ALREADY SATISFIED`** — do **not** re-run these. Read their artifacts and reuse them.
3. **`INPUTS NEEDED`** — anything marked `NOT SET` must come from the user before the chain can run.
4. **`READY: yes`** — proceed with the work described below.

> Never fabricate an upstream result. If an artifact is missing, run the skill that produces it.

This is the artifact engineering actually builds from, and it is the **terminal** phase.

## Prerequisite that is not negotiable

`gate-3-pages` is a **hard** requirement: every page in the module must be approved. Unlike
`/closure-reporter`, which must be producible on any outcome including a failed run, a handoff must not
exist for a module whose pages were never all signed off. Engineering builds from this document, so
describing unapproved work here presents it as shippable.

If a page is still pending, `plan` reports this stage `blocked`. Go finish gate 3.

## This package describes TWO files, and must name both

Conflating them is how an engineer ends up looking for a component in the wrong place.

- **`figma_url` — the PRODUCT file.** Where the gate-3-approved pages are. Each `pages[].figma_url`
  links to a live frame in it.
- **`design_system` — the LIBRARY.** Where every component an engineer implements actually lives, and
  where every token name in this package is defined. Copy `name`, `file_url`, `file_key`, `version` and
  `last_updated` from `05_design_system.json`. The version matters more than it looks: a handoff is a
  dated snapshot, and a reader six weeks later needs to know which state of the library it describes.

Every entry in `components_used` carries a **`source_url` into the library**, not a link to the instance
on the page. An instance link sends a reader to this feature rather than to the thing they have to build
and maintain. **A `source_url` pointing into the product file is a finding, not a link** — it means the
component was built in the wrong file, and this package is the last place anyone would notice.

## Step 1 — Re-inspect the live files. Do not trust any prior state

Read **both** files at full depth or via the Plugin API: the product file for the frames, the design
system library for the component and token names you are about to reference. Then verify every one of
those names against what you actually found.

This is not ceremony. Gate 3 explicitly permits the designer to edit a frame by hand — any page with
`manually_edited: true` in `G3_page_signoffs.json` is a frame that changed after assembly last saw it.
So the frame you are specifying is routinely **not** the one `12_figma_build.json` describes. **Carry
that flag through into `pages[].manually_edited`**: an engineer comparing this package against the build
record needs to know which pages will not match, and nothing else in the package surfaces it.

The named failure modes for this phase are:

- a spec built from a stale or since-edited version of a frame rather than its final approved state
- a spec referencing a component or token name that has since been renamed or removed
- new components from phase 3 missing from the change-log entirely

Record how you read the files in `verification.extraction_method`, the time in `verification.verified_at`,
and the result in `verification.names_verified_against_live_file`. A depth-limited REST walk returns
nested nodes with `children` absent, which is indistinguishable from a genuinely empty frame — so it
will report a populated page as bare. Anything you could not resolve goes in `verification.unresolved`;
a non-empty list means the package says it is incomplete rather than shipping a name nobody can find.

## Step 2 — One spec per approved page

For each entry in `G3_page_signoffs.json` with `status: "approved"` — **all of them, no exceptions; an
approved page without a spec is this phase's failure criterion** — write a `pages[]` entry:

| Field | What goes in it |
|---|---|
| `page`, `figma_url`, `node_id` | A link to the **live frame** in the product file. Not a pasted copy — a snapshot drifts from the file it describes and nobody can tell when it has. |
| `manually_edited` | From this page's gate-3 signoff. See step 1. |
| `layout` | Structure, auto-layout direction, spacing, constraints, as built. |
| `tokens` | Every design token/variable the frame binds, **by name**, each with `used_for`. See below. |
| `components_used` | Each instance: name, variant, props, `source_url` to the **live library component**, and its Code Connect mapping where one exists. |
| `states` | Default, hover, focus, loading, empty, error — as built, each with its `behavior`. |
| `breakpoints` | Responsive behaviour per breakpoint. |
| `edge_cases` | Text overflow, zero/one/many, permission-denied, offline — each with its specified behaviour. |
| `requirements_traced` | Requirement ids from `01_prd_requirements.json`, so every piece traces back to why it exists. |

**All of these are schema-required.** `layout`, `tokens` and `breakpoints` used to be optional while
this table presented them as mandatory — so a package with no layout, no tokens and no responsive
behaviour validated clean, and the prose that said otherwise lost. Those are the three things an
engineer cannot reconstruct from a screenshot, which makes them the three a handoff exists to carry.

**`states` and `edge_cases` are required, and an empty array is a claim.** The named failure is leaving
behaviour that was approved visually but never specified for developers to guess. Approval on sight is
not a specification: if the empty state was never discussed, say that explicitly in `notes` rather than
omitting the field and letting it read as "nothing to say".

### Tokens go over as names, resolved against the design system

`token` must be a name that resolves in `05_design_system.json` `design_tokens` — that artifact is the
only enumeration of what the library actually defines, and a handoff naming a token nobody can look up
is a name an engineer invents a value for.

`used_for` is required alongside it ("card surface", "row gap"). A bare token list is a glossary, not a
spec.

`value` is optional and is a **reading convenience only** — the live library is the source of truth, and
a value copied here goes stale silently while the name never does.

If a hardcoded value survived phase 3, put it in `notes` as a defect. Do **not** document the raw value
as though it were intended. `12a_figma_components.json`'s `hardcoded[]` is where the component pass
recorded what it could not bind; start there rather than rediscovering it.

## Step 3 — The change-log

Every component or variant created or modified during the build goes in `change_log[]`, **however small
the addition felt at the time**. Sources: `12a_figma_components.json` `built` (the gate-2-reviewed
component pass), `12_figma_build.json`, `11_build_phase.json` `figma_modifications.components`, and
each page's `deviations_approved[]`.

**Every entry here is a change to the design system, not to this feature.** That is what makes the log
matter to anyone but this module: the next feature inherits these components. So each entry names the
change (`net-new` / `extended` / `variant-added` / `renamed` / `retired`), links to its **live library
entry** (`figma_url` — the component in the library, not the instance on a page), records `location`
within the library, says **why** it exists, sets `in_design_system`, and records `approved_at_gate` —
**`gate-2-components`** for a component inspected as a live node, or the gate-3 page whose signoff
recorded it as an approved deviation.

> `approved_at_gate` was documented here as `gate-2-mapping` — a gate that does not exist — while the
> schema said `gate-2-components`. With no enum behind the field, both spellings validated and nothing
> caught the drift. Use `gate-2-components`.

`why` and `approved_at_gate` are both required. A component whose existence has no stated reason is one
the next person deletes or duplicates; a component in the change-log with no gate behind it is one
nobody signed off, and finding that out here is better than not finding it out.

**`in_design_system: false` is not a footnote.** It means the pipeline wrote a component into the
product file rather than the library — the failure `11_build_phase.json`'s `build_target` and gate 2's
`built_in_design_system_file` check exist to prevent. Raise it rather than filing it.

A variant added mid-assembly and left out entirely becomes invisible technical debt: the design system
drifts out of sync with what shipped and nobody knows to look.

## Four things this phase must not do

1. **Introduce or reinterpret a design decision.** Handoff documents what was built and approved. It is
   not a second design pass. If something is wrong, that is a finding to raise — not a thing to fix here.
2. **Invent implementation guidance.** A specific CSS approach not backed by the design system's own
   conventions or its Code Connect mappings does not go in. Invented guidance reads exactly like
   documented guidance and gets built.
3. **Omit a small addition** from the change-log. See above.
4. **Reopen the pipeline.** This phase is terminal. If developers surface an issue after handoff, it
   re-enters as a new requirement or gap through phase 1 or phase 2 — it is not a reason to quietly redo
   phase 3 assembly outside the gated flow.

## Artifact contract

**Reads** (produced by upstream skills):

- `reports/<feature>/G3_page_signoffs.json` — from `/gate-3-pages` — the approved page roster, each
  page's `approved_at` / `approved_by`, its `manually_edited` flag and its `deviations_approved[]`
- `reports/<feature>/12_figma_build.json` — from `/figma:figma-use` — what assembly reports it built,
  per page: node ids, states built, `discovered_gaps`
- `reports/<feature>/12a_figma_components.json` — from `/figma-component-pass` — the components as live
  library nodes: `design_system_file`, and per component `location`, `tokens_bound`, `hardcoded`
- `reports/<feature>/11_build_phase.json` — from `/figma-modifier` — `build_target` (which file is
  which) and the specced components the change-log is checked against
- `reports/_shared/05_design_system.json` — from `/design-system-loader` (**shared**, not per-feature) —
  the library's identity for the `design_system` block, and `design_tokens` as the only enumeration
  every token name in this package must resolve against
- `reports/<feature>/01_prd_requirements.json` — from `/prd-analyzer` — requirement ids for
  `requirements_traced`

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/<feature>/15_developer_handoff.json` — the structured package
- `reports/<feature>/handoff_<date>.md` — the same content as a document a developer can read top to
  bottom. Dated, unlike `design_requirements.md`, because a handoff is a snapshot of an approved module
  rather than a living document.

The markdown is **existence-checked, not schema-checked** — wildcard artifacts always are — so nothing
downstream will catch a section you skipped. Write it in this order:

1. **Module and provenance** — feature, date, the product file, the design system library and its version
2. **How to read this** — which pages were `manually_edited`, and anything in `verification.unresolved`
3. **One section per page**, in roster order — frame link, layout, tokens, components used (each linked
   into the library), states, breakpoints, edge cases, requirements traced
4. **The change-log** — what this build added to the design system, and under which gate
5. **Known gaps** — `verification.unresolved`, surviving hardcoded values, `discovered_gaps`

Resolve and create the output folder in one step:

```bash
node utils/pipeline.mjs path --stage developer-handoff --ensure
```

The shape is **enforced, not just documented**. The machine-checkable version lives in
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json), keyed by the filenames above — read it
before writing and satisfy it exactly. Where this document and the schema differ, the schema decides.

Three top-level fields are required and are easy to miss because nothing in the steps above produces
them as a by-product: **`module`** (the run slug), **`generated_at`**, and **`figma_url`** (the product
file). Alongside them, **`design_system`**, and inside `verification`, **`verified_at`** and
**`names_verified_against_live_file`**. This skill used to describe none of those six, so a writer who
followed it faithfully produced an artifact that failed validation.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done developer-handoff
```

That validates the artifacts and records the inputs they were built from. If `done` reports problems,
fix the artifact and run it again. Never hand-edit `.pipeline-state.json` to make a stage look finished.

`/closure-reporter` runs after this and reads it — it reports what was *decided*, this reports what was
*built*. Neither subsumes the other, and the audiences differ: engineering builds from this one.
`/closure-reporter` cross-checks each page's `deviations_approved` against this `change_log`; a
deviation in one and not the other means the design system has drifted, so make the change-log complete
enough for that comparison to mean something.
