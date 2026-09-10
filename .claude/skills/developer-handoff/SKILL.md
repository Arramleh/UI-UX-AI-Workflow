---
name: developer-handoff
description: PHASE 4 — package the approved module into a developer-ready handoff: per-page specs, tokens, props, states, breakpoints, edge cases, and a change-log of every component created during assembly.
---

# Phase 4 — Developer Handoff

```bash
node utils/pipeline.mjs plan developer-handoff
```

This is the artifact engineering actually builds from, and it is the **terminal** phase.

## Prerequisite that is not negotiable

`gate-3-pages` is a **hard** requirement: every page in the module must be approved. Unlike
`/closure-reporter`, which must be producible on any outcome including a failed run, a handoff must not
exist for a module whose pages were never all signed off. Engineering builds from this document, so
describing unapproved work here presents it as shippable.

If a page is still pending, `plan` reports this stage `blocked`. Go finish gate 3.

## Step 1 — Re-inspect the live file. Do not trust any prior state

Read `FIGMA_URL` at **full depth or via the Plugin API**. Then verify, against the live file, every
component and token name you are about to reference.

This is not ceremony. Gate 3 explicitly permits the designer to edit a frame by hand — any page with
`manually_edited: true` in `G3_page_signoffs.json` is a frame that changed after assembly last saw it.
So the frame you are specifying is routinely **not** the one `12_figma_build.json` describes. The named
failure modes for this phase are:

- a spec built from a stale or since-edited version of a frame rather than its final approved state
- a spec referencing a component or token name that has since been renamed or removed
- new components from phase 3 missing from the change-log entirely

Record how you read the file in `verification.extraction_method`. A depth-limited REST walk returns
nested nodes with `children` absent, which is indistinguishable from a genuinely empty frame — so it
will report a populated page as bare. Anything you could not resolve goes in `verification.unresolved`;
a non-empty list means the package says it is incomplete rather than shipping a name nobody can find.

## Step 2 — One spec per approved page

For each entry in `G3_page_signoffs.json` with `status: "approved"` — **all of them, no exceptions; an
approved page without a spec is this phase's failure criterion** — write a `pages[]` entry:

| Field | What goes in it |
|---|---|
| `figma_url`, `node_id` | A link to the **live frame**. Not a pasted copy — a snapshot drifts from the file it describes and nobody can tell when it has. |
| `layout` | Structure, auto-layout direction, spacing, constraints, as built. |
| `tokens` | Every design token/variable the frame binds, by name. If a hardcoded value survived phase 3, put it in `notes` as a defect — do **not** document the raw value as though it were intended. |
| `components_used` | Each instance: name, variant, props, a link to the live design-system component, and its Code Connect mapping where one exists. |
| `states` | Default, hover, focus, loading, empty, error — as built. |
| `breakpoints` | Responsive behaviour per breakpoint. |
| `edge_cases` | Text overflow, zero/one/many, permission-denied, offline — each with its specified behaviour. |
| `requirements_traced` | Requirement ids from `01_prd_requirements.json`, so every piece traces back to why it exists. |

**`states` and `edge_cases` are required, and an empty array is a claim.** The named failure is leaving
behaviour that was approved visually but never specified for developers to guess. Approval on sight is
not a specification: if the empty state was never discussed, say that explicitly here rather than
omitting the field and letting it read as "nothing to say".

## Step 3 — The change-log

Every component or variant created or modified during phase 3 goes in `change_log[]`, **however small
the addition felt at the time**. Sources: `12a_figma_components.json` `built` (the Gate-2B-reviewed
component pass), `12_figma_build.json`, `11_build_phase.json` `figma_modifications.components`, and
each page's `deviations_approved[]`.

Each entry names the change (`net-new` / `extended` / `variant-added` / `renamed` / `retired`), links to
its **live** design-system entry, says why it exists, and records `approved_at_gate` — `gate-2-mapping`
for a planned component, or the gate-3 page whose signoff recorded it as an approved deviation.

A component in the change-log with no gate behind it is one nobody signed off, and finding that out here
is better than not finding it out. A variant added mid-assembly and left out entirely becomes invisible
technical debt: the design system drifts out of sync with what shipped and nobody knows to look.

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

## Artifacts

- `reports/<feature>/15_developer_handoff.json` — the structured package, shape enforced by
  [`.claude/schemas/artifacts.json`](../../schemas/artifacts.json)
- `reports/<feature>/handoff_<date>.md` — the same content as a document a developer can read top to
  bottom, one section per page then the change-log. Dated, unlike `design_requirements.md`, because a
  handoff is a snapshot of an approved module rather than a living document.

```bash
node utils/pipeline.mjs done developer-handoff
```

`/closure-reporter` runs after this and reads it — it reports what was *decided*, this reports what was
*built*. Neither subsumes the other, and the audiences differ: engineering builds from this one.
