---
name: figma-component-pass
description: PHASE 2 — build the checklist's components and variants into the DESIGN SYSTEM LIBRARY, to the library's own conventions and tokens. Builds no screens, and writes into no other file.
---

# Figma Component Pass

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/figma-modifier` (and, read directly, `/design-system-loader`)

```bash
node utils/pipeline.mjs plan figma-component-pass
```

Then follow its output exactly:

1. **`RUN THESE SKILLS FIRST`** — invoke each listed skill with the Skill tool, **in the printed order**,
   one at a time, letting each finish and write its artifact before starting the next.
2. **`ALREADY SATISFIED`** — do **not** re-run these. Read their artifacts from `reports/<feature>/` and reuse them.
3. **`INPUTS NEEDED`** — anything marked `NOT SET` must come from the user before the chain can run.
4. **`READY: yes`** — proceed with the work described below.

> Never fabricate an upstream result. If an artifact is missing, run the skill that produces it.

This stage is **where the pipeline writes components**, and it is the only one. `/figma-modifier` plans
and writes nothing; `/figma:figma-use` assembles screens after gate 2. Everything below is a constraint
on a write, which is why it lives here rather than in the stage that planned it.

**No gate stands in front of this stage.** `/gate-2-components` reviews what it produces, as live nodes.
So a defect here is corrected by being sent back, not by having been prevented — write as though what
you build is what a reviewer will find, because it is.

---

## Rule 1 — Build into the design system library. Only there.

The write target is the file named in `reports/_shared/05_design_system.json` at
`design_system.figma_library`, carried into `reports/<feature>/11_build_phase.json` at
`build_target.design_system_file`. **Read both and confirm the `file_key` matches before the first
write.**

This is stated first because it was wrong. The instruction used to read "build every component into the
file at `FIGMA_URL`" — the **product** file, the one holding the feature's screens. So components this
pipeline created were never in the library: the next feature's `/design-system-loader` walk would not
find them, `/component-analyzer` would report them as gaps, and someone would build them a second time.
Nothing recorded the destination, so nothing could notice.

A component in the product file is not a design system component. It cannot be found, reused, or
maintained, and it looks identical to one that was done properly.

**Three stops, not warnings:**

- **`figma_library.is_write_target` is `false`.** The design system is documentation, a published-only
  library, or something this token cannot write to. Stop and say so. Do not fall back to the product
  file — that is the failure this rule exists to prevent, and a component there is worse than a
  component missing, because it looks built.
- **The `file_key` in `05_design_system.json` and `11_build_phase.json` disagree.** One of the two is
  stale. Resolve which before writing, rather than picking one.
- **`build_target.same_file` is true.** Permitted — some teams keep the library in the product file —
  but only when `same_file_rationale` says so deliberately. An unset target is not the same as a
  chosen one.

Screens are **not** built here, and they do not go in this file when they are. That is
`/figma:figma-use`'s work, into `build_target.product_file`, after gate 2.

## Rule 2 — Build to the library's rules, not to your own

`05_design_system.json` `design_system.conventions` is what the library declares about itself. Every
component you create conforms to it:

| Convention | What it binds |
|---|---|
| `naming.pattern` + `naming.examples` | The name you give the component set and its layers. The examples are there because a pattern alone reads differently to everyone — `Category/Name` does not say whether it is `Button/Primary` or `Buttons/Primary`, and the difference is a component nobody can find. |
| `variant_axes` | The **property names** and their permitted values. A component with a `type` axis in a library that everywhere else calls it `variant` is off-system in a way no screenshot shows. |
| `location_pattern` | Where the node goes inside the library file. Match `11_build_phase.json`'s per-component `location` against it, and put the node there — not on whatever page the plugin was last on. |
| `token_binding.hardcode_policy` | Whether a raw value is permitted at all. Under `forbidden`, a value you could not bind is a **finding**, not a hex code. |
| `spacing_scale` | The ordered ramp. "Match the library's spacing rhythm" needs the ramp, not the set of values. |
| `required_states` | The states every component here is expected to carry. |
| `retired` | Names that must not come back. A retired component reached for by the name you remember returns looking exactly like an approved reuse. |

**A systemic absence is a gap, not a precedent.** If nothing in the library has a focus state, that is
something to fix in what you build — not a convention to copy into twenty new components. Record it in
`actions_log` so the correction is visible rather than silent.

Where a spec in `11_build_phase.json` and a convention in `05_design_system.json` genuinely conflict,
**build to the convention and record the conflict** in `actions_log`. The checklist describes one
feature; the conventions describe the library every feature inherits.

## Rule 3 — Bind tokens by name. Never hardcode where a token exists

Every colour, type style, spacing value, radius and shadow binds to a token or variable from
`design_tokens`, **by name**. Check each one resolves in the live library before binding it.

A token that does not exist is a finding for `actions_log` and an entry in the component's `hardcoded`
array — not something to paper over with a raw value. Unresolved tokens are how a "built" component
ends up off-system, and `tokens_applied: true` with an unreported hardcoded value is exactly the claim
gate 2's `tokens_and_variables_bound` check exists to test.

Record both: `tokens_bound` (the names actually bound) and `hardcoded` (what you could not). This is the
only place in the pipeline where a built component's real bindings are written down — without it
`/developer-handoff` has to re-derive every one of them from the live file.

## Rule 4 — Build the checklist. Nothing else

Every component in `figma_modifications.components`, and **only** those. A component that is not on the
checklist is one that appeared from nowhere, and in the library it looks exactly like one that was
specced. Gate 2's `no_unapproved_component_changes` is what catches it — **after** the write.

Do **not** assemble a screen, a frame, or an example layout. `11_build_phase.json`'s `screens` array is
read by `/figma:figma-use` after gate 2, and building one here puts an unreviewed page in the file.

If a component cannot be built as specified, it goes in `failed` with a reason. Do not substitute a
simplified version and report it as `built` — a reviewer comparing the checklist against the file sees
a name they recognise and moves on.

## Process

1. **Load `/figma:figma-use` with the Skill tool.** Mandatory before any `use_figma` call — it carries
   the Plugin API contract. Never call `use_figma` without loading it first.
2. **Read `05_design_system.json` and `11_build_phase.json`.** Confirm the write target per rule 1 and
   note the conventions per rule 2 *before* the first write.
3. **One `use_figma` call per component**, so a single failure does not lose the rest. Build in
   `10_roadmap.json` priority order where the checklist gives one; a primitive other components are
   composed from is built before them regardless.
4. **Verify each node after building it** — its name, its location in the library, its variant axes and
   values, its states, and its token bindings. Record what you found, not what you asked for.
5. **Write `reports/<feature>/12a_figma_components.json`** (below), then run `done`.
6. **Take the live nodes to `/gate-2-components`.** Component links and node ids, not screenshots — a
   screenshot is a picture of a claim, and it cannot show which file the node is in.

`AUTO_CREATE_COMPONENTS` matters more here than anywhere else, because nothing gates this stage: when
it is false, report the build plan and **ask before writing**. It is the only brake in front of these
writes.

## Artifact contract

**Reads:**

- `reports/<feature>/11_build_phase.json` — from `/figma-modifier` — the build checklist:
  `build_target.design_system_file` (where to write) and `figma_modifications.components` (what to build)
- `reports/_shared/05_design_system.json` — from `/design-system-loader` (**shared**, not per-feature) —
  `figma_library` (the library's identity, checked against the checklist's target) and `conventions`
  (the rules every component is built to)
- `reports/<feature>/10_roadmap.json` — priority order, where it exists

**Writes:**

- `reports/<feature>/12a_figma_components.json`

```bash
node utils/pipeline.mjs path --stage figma-component-pass --ensure
```

```json
{
  "figma_url": "https://www.figma.com/design/DSKEY/Acme-Design-System",
  "design_system_file": {
    "file_key": "DSKEY",
    "file_url": "https://www.figma.com/design/DSKEY/Acme-Design-System",
    "name": "Acme Design System",
    "matches_design_system_artifact": true
  },
  "built": [
    {
      "name": "DatePicker",
      "node_id": "12:345",
      "location": "Components/Inputs/DatePicker",
      "variants": 3,
      "tokens_applied": true,
      "tokens_bound": ["color.surface.raised", "color.border.default", "spacing.xs", "radius.md"],
      "hardcoded": [],
      "conforms_to_conventions": true,
      "status": "built",
      "gate_2_approved": false,
      "action": "create"
    }
  ],
  "skipped": [
    { "name": "FileUpload", "reason": "escalated in 06_component_analysis.json — product decision still open" }
  ],
  "failed": [],
  "actions_log": [
    "✓ Confirmed write target DSKEY against 05_design_system.json figma_library — match",
    "✓ Built DatePicker (3 variants) at Components/Inputs/DatePicker, all tokens bound",
    "→ Library declares no focus token; added color.border.focus rather than shipping without focus states (systemic absence, not a precedent)"
  ]
}
```

`gate_2_approved` is **false** on write. This stage produces the evidence; gate 2 decides. Setting it
true here records an approval nobody gave.

The shape above is **enforced, not just documented**. The machine-checkable version lives in
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json) — read it before writing and satisfy
it exactly. Where this block and the schema differ, the schema decides.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done figma-component-pass
```

Address it by **this stage key**, never by `figma:figma-use`. `done figma-use` records the *page*
stage — so `12a_figma_components.json` is never marked done and every resume rebuilds the components.

Log the write itself, which no artifact records until much later:

```bash
node utils/pipeline.mjs log "built DatePicker into the design system library (DSKEY)" \
  --stage figma-component-pass --kind build
```

## Handoff

Next is **`/gate-2-components`** — a human inspects these nodes in the live library. Do not start page
assembly: `/figma:figma-use` requires an approved `G2_component_signoff.json`, and the gate governs
whether these components may be **used**, not whether they may exist.

A `changes_requested` verdict comes back **here**. Correct the writes that already happened, rewrite
`12a_figma_components.json`, and take it to gate 2 again — approval pins this artifact by content hash,
so a rebuild correctly invalidates the previous signoff.
