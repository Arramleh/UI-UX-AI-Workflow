---
name: figma-modifier
description: PHASE 2 — spec the missing components and the screens they assemble into as the build checklist the component pass executes. Writes nothing into Figma itself.
---

# Figma Modifier Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/figma-extractor`, `/design-system-loader`, `/screen-planner`, `/component-analyzer`,
`/coverage-scorer`, `/coverage-reporter`

This skill can be invoked on its own. When it is, the upstream skills it depends on may not have run yet,
so **step 0 is always**:

```bash
node utils/pipeline.mjs plan figma-modifier
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

Specs the components this feature is missing **and the screens that assemble them**, for
`/figma:figma-use` to build.

## This is the build checklist — and nobody signs it before it is built

`11_build_phase.json` **is** the build checklist. It used to be reviewed by a human gate of its own
before anything was built; that gate has been removed. `/figma-component-pass` now runs straight off
this artifact, and the first human stop is **`/gate-2-components`**, which reviews the components once
they exist as live Figma nodes.

Two consequences follow, and they should be stated rather than glossed:

- **The quality bar on this artifact went up, not down.** A vague `resolution_path`, an invented
  component name or a gap with no reasoning used to be caught by a person reading the checklist. Now it
  is caught — if at all — by a reviewer looking at the component that was built from it, after the
  Figma write has already happened. There is no longer a reader between you and the file.
- **A product-level escalation raised by `/component-analyzer` has no gate that refuses to open while
  it is unanswered.** A taxonomy or data-model conflict stays in `06_component_analysis.json`, is worth
  surfacing in the gate-2 review packet, and otherwise surfaces only in `/closure-reporter` — after the
  module is built. Do not spec around such a conflict as though it were settled; leave the component
  out and say so in `actions_log`, so the unanswered question is visible as a hole rather than buried
  in a component that assumed an answer.

**This stage still writes nothing into Figma.** That has not changed: it produces specs, and
`/figma-component-pass` and `/figma:figma-use` are the stages with write access. Keep it that way — do
not "just make a start" in the file, and do not call `use_figma` from here for any reason. A stage that
plans and a stage that writes being separate is what makes the checklist reviewable at all, and it is
what lets a change request at gate 2 name exactly which spec produced the wrong node.

## Usage

```
/figma-modifier
# Specs the missing components, then the screens those components make up
```

## Input (from pipeline)
- **Figma URL** (original file)
- **Coverage Gaps** (from coverage-scorer) — the component work list
- **Screen Plans** (from screen-planner) — the screen work list: layout, ordered elements, states
- **Component Analysis** (from component-analyzer) — which component covers each planned element
- **Existing Design System** (from design-system-loader) — components, variant axes and tokens to build with
- **Current Figma State** (from figma-extractor) — what to extend rather than duplicate
- **Roadmap** (from coverage-reporter) — priority order

## Output
This artifact is a **plan**, so `action` is imperative (`create` / `modify` / `extend`) and the counts
describe what is *to be* done. Whether it actually happened is recorded separately, by the build stage,
in `12_figma_build.json`.

```json
{
  "figma_modifications": {
    "new_components_to_create": 5,
    "existing_components_to_modify": 3,
    "components": [
      {
        "name": "DatePicker",
        "action": "create",
        "location": "Components/Inputs/DatePicker",
        "variants": ["default", "with-range", "disabled"],
        "status": "ready",
        "resolution_path": "combine-existing",
        "resolution_rationale": "No date component of any kind; Input + IconButton + Popover cover the whole anatomy, so combining beats a net-new primitive. Nothing to extend — the nested-children walk recorded in 06_component_analysis.json found no calendar or day-cell inside any component set.",
        "architecture": "slot-based-system-wide",
        "scope_rationale": "Trigger and footer are slots, so Billing and Reports can reuse it without a fork.",
        "respects_retirement_decisions": true,
        "based_on": ["Input", "IconButton", "Popover", "Text"],
        "anatomy": [
          "Popover (surface, elevation.md) wrapping:",
          "  Input (size.md) + IconButton (icon: calendar) as the trigger row",
          "  Text (type.caption) day-of-week header row",
          "  grid of 7x6 IconButton (variant: ghost, size.sm) day cells"
        ],
        "states": ["default", "hover", "focus", "disabled", "error", "loading"],
        "tokens": {
          "surface": "color.surface.raised",
          "border": "color.border.default",
          "border_focus": "color.border.focus",
          "gap": "spacing.xs",
          "radius": "radius.md"
        }
      }
    ]
  },
  "screens": [
    {
      "name": "Notification Preferences",
      "page": "Notification Center",
      "layout": "stacked",
      "states": ["default", "loading", "error", "empty"],
      "elements": [
        { "element": "Page title", "component": "Text", "variant": "type.heading.lg", "requirement_link": "REQ-1" },
        { "element": "Channel toggles", "component": "Switch", "variant": "size.md", "requirement_link": "REQ-3" },
        { "element": "Quiet hours range", "component": "DatePicker", "variant": "with-range", "requirement_link": "REQ-7", "from_this_build": true },
        { "element": "Save", "component": "Button", "variant": "primary", "requirement_link": "REQ-1" }
      ],
      "tokens": { "gap": "spacing.md", "padding": "spacing.lg", "surface": "color.surface.default" }
    }
  ],
  "actions_log": [
    "→ Create DatePicker by combining Input + IconButton + Popover (combine-existing; nothing extendable found in the nested walk)",
    "→ Extend Button with a new 'ghost' variant (extend-existing — cheapest correct path)",
    "→ Add error states to Input",
    "→ No focus token in the library — added color.border.focus rather than shipping without focus states",
    "→ NotificationDigestCard specced module-specific: the digest layout is unique to this feature and slotting it would have invented three slots no other surface uses (scope_rationale)",
    "→ 'NotifBell' NOT reused — retired in favour of Icons/General/Bell in an earlier session; specced against the current name",
    "→ FileUpload: needs a product decision before building — escalated in 06_component_analysis.json and left unspecced; no gate blocks on it, so raise it in the gate-2 packet",
    "→ Screen 'Notification Preferences' depends on DatePicker from this same build (from_this_build)"
  ],
  "next_steps": [
    "/figma-component-pass builds every component in this checklist in one pass — it needs no gate, so this checklist is what reaches Figma",
    "Gate 2 then reviews those components as live nodes; only after it opens does /figma:figma-use assemble ONE page at a time behind Gate 3",
    "Publish to the component library (a human action in the editor)"
  ]
}
```

`screens` carries **one entry per screen plan**, and `elements` is in layout order. Each element binds a
planned element to a component **by name** — the components do not exist as Figma nodes yet, so
`/figma:figma-use` resolves them during its build pass. Set `from_this_build: true` when the component
comes from this spec's own `components` array rather than the existing library; that is what tells the
build pass which screens are at risk if a component fails.

`screens` also **seeds gate 3's page roster** — `node utils/pipeline.mjs gate 3 --init` reads the page
list from this checklist, not from whatever assembly happened to build. That direction is deliberate:
seeded from the build, a page dropped during assembly would never appear as pending, and the module
would read as fully approved with a page missing. So a screen omitted here is a screen no human is ever
asked about. If one genuinely cannot be specced, it goes in `actions_log` with the reason rather than
out of the array.

## Process

**This stage answers one question: given what THIS PRD needs and the design system that already
exists, what should be built?** The answer has two halves — the **components** the feature is missing,
and the **screens** those components assemble into. Both go in `11_build_phase.json`. Designing each
component and laying out each screen is your job here; nothing upstream hands you a spec.

The screen half exists because `09_gap_analysis.json` is a *lossy* projection of the screen plans: it
answers "which components are missing" and throws away layout, per-screen states, element order and
flows. A stage fed only the gap analysis therefore cannot assemble a screen — which is why this
pipeline used to finish with a freshly populated component library and not one screen built out of it.
`03_screen_plans.json` restores the layout, and `06_component_analysis.json` supplies the
element → component binding.

Steps 1–8 spec the components; steps 9–11 spec the screens; steps 12–13 write the checklist and hand it
to the component pass.

It does **not** read `08_ux_evaluation.json`. `/evaluate-design-system` grades the library as a whole,
on its own cadence and for its own audience, and a feature build should not wait on a library-wide
critique it never asked for. If you want that review, run `/evaluate-design-system` yourself — but do
not make this stage depend on it.

1. **Take the gaps as the work list** - `09_gap_analysis.json` is what this PRD is missing, already
   ranked by how many screens each gap blocks. Build these and nothing else; a component no screen in
   this feature needs does not belong in this plan
2. **Resolve every gap in a fixed order of preference** - `extend an existing component` →
   `combine existing components` → `net-new`, and record which of the three in `resolution_path` with
   `resolution_rationale` saying **why not the cheaper one above it**. `resolution_path` is not the same
   axis as `action`: `action` is what to do in Figma, `resolution_path` is why that is the cheapest
   correct thing to do. The order is not thrift for its own sake — a second Button that shares nothing
   with the first makes the system worse, not better, and every net-new component is one more thing to
   maintain, restyle and keep in sync forever. Set `based_on` when you extend or combine.

   **"Nothing existed" only counts for `net-new` once the nested-children walk is recorded in
   `06_component_analysis.json`.** Absence from a keyword search is not absence from the file:
   `search_design_system` searches *published* libraries only, and an in-house system keeps components
   on a file's own pages, so an empty search says nothing. The bell icon was declared missing from
   `Icons/General` while sitting nested inside the `Notification Bill` component set. A net-new whose
   rationale is an empty search builds a duplicate of something the file already had — and since no gate
   reads this checklist before it is executed, that duplicate is now a real node in the library by the
   time anyone looks, which gate 2's `no_unapproved_component_changes` check has to catch after the fact
3. **Prefer slot-based, system-wide reusable architecture** - record it in `architecture`. A slot-based
   component takes its content through slots and serves every surface that needs the pattern;
   `module-specific` is a **last resort you justify in `scope_rationale`**, not a default you reach for,
   because a component built for this feature alone is one the next feature rebuilds — and then there
   are two of them, drifting apart. Justifying it means naming what about this feature the rest of the
   system does not share, not saying it was faster
4. **Honour naming and retirement decisions from earlier sessions** - set
   `respects_retirement_decisions` to confirm you checked. A component that was renamed or retired stays
   that way; reaching for the old name because it is the one you remember is exactly how a retired
   component comes back, and it comes back looking like an approved reuse. Check the current name in
   `05_design_system.json` and `02_figma_state.json` before you spec against it, and say in
   `actions_log` when you deliberately did not reuse something because it was retired
5. **Compose from the first layer, do not draw from scratch** - the component inventory in
   `05_design_system.json` is keyed by layer (`Atoms`, `Molecules`, `Organisms`, or whatever this
   library calls its tiers). A missing component is assembled out of the primitives that already
   exist: a DatePicker is a text Input plus an IconButton inside a Popover surface, not a new
   rectangle with a hand-placed calendar. For each component in the plan, name the existing
   components it is built from in `based_on`, and describe its anatomy as a composition of them.
   Reaching for a raw frame where a primitive exists is what produces a component that looks right
   and behaves like nothing else in the system. If a needed primitive genuinely does not exist, that
   is a finding for `actions_log` — and the primitive is the thing to build first
6. **Then design what composition alone does not settle** - derive variants and **every** state
   (default, hover, focus, active, disabled, loading, error, empty) from how comparable components in
   the same layer are already built: match their naming, their variant axes, their spacing rhythm.
   Two rules:
   - Read a systemic absence as a decision, not a precedent. If nothing in the library has a focus
     state, that is a gap to fix in what you build, not a convention to copy into twenty new
     components. Note it in `actions_log` so it is visible rather than silently corrected
   - Cover the states the screen plans actually use. A component whose loading and error states were
     never designed gets improvised at build time, which is how it ends up inconsistent
7. **Order the work** - by `10_roadmap.json` and gap severity, so the components that unblock the most
   screens are built first. A missing primitive from step 5 outranks anything composed from it
8. **Bind tokens by name, then resolve them** - reference tokens from `05_design_system.json` by name
   and check each one resolves. A token that does not exist is a finding for `actions_log`, not
   something to paper over with a raw hex value; unresolved tokens are how a "built" component ends up
   off-system
9. **Spec every screen in the plan** - one `screens` entry per `screen_plans[].name` in
   `03_screen_plans.json`, keeping the name identical so the screen stays traceable to the
   requirements it satisfies. Carry `layout` and `states` across from the plan, and list `elements`
   **in layout order**. Do not silently drop a screen: if one genuinely cannot be specced, say so in
   `actions_log` with the reason
10. **Bind each planned element to a real component** - `06_component_analysis.json`'s
    `coverage_analysis.required_by_screens` already says which library component covers which planned
    element; use it, and fall back to a component from this spec's own `components` array when the
    element is one of the gaps you just designed — mark those `from_this_build: true`. The point of
    this step is that a planned element becomes an **instance of a named component**, never a fresh
    frame: a screen drawn from rectangles is off-system no matter how right it looks. An element you
    cannot bind to any component — existing or newly specced — is a finding for `actions_log`, because
    it means the gap analysis missed something
11. **Lay out with tokens, not numbers** - spacing, padding and type come from `05_design_system.json`
    by name (`spacing.md`, not `16`), same rule and same reason as step 8. A screen assembled from
    on-system components with hand-typed gaps is still off-system. Spec a frame per screen-level state,
    not only the default — an error state that was never assembled is one that gets improvised later
12. **Write the build spec** - `11_build_phase.json`, with enough detail to build without asking
    questions. This stage stops here: it plans, it does not build
13. **Hand it to `/figma-component-pass`** - which executes it without a gate in between. Write it as
    something that will be built exactly as written, because it will be; the human review comes
    afterwards, at `/gate-2-components`, and it looks at the nodes rather than at this file

**Why screens are specced here but assembled there, one page at a time.** A screen is made of component
*instances*, so the components have to be real Figma nodes before a screen can be assembled — and they
are not, until `/figma-component-pass` has run and gate 2 has approved what it built. Assembly then
takes **one page at a time**, each page presented to `/gate-3-pages` and decided before the next is
touched, so this checklist is read page by page rather than executed in one sweep.

That is also this design's one known limitation: the screen spec names components on the assumption they
will build, and it cannot consult `12_figma_build.json` to find out otherwise, because that artifact is
downstream of this stage (depending on it would be the cycle
`figma-modifier → figma-use → figma-modifier`, which `pipeline.mjs check` rejects). The build pass
resolves each instance by name and reports a screen whose component is missing as **blocked**; that
check lives there, not here.

## When assembly sends a gap back, gate 2 is re-taken

There is no post-build audit that can send work back here. `/prd-auditor` and `13_prd_audit.json` were
removed, along with the covered/gaps_found/blocked verdict and the iteration loop through gate 2. **The
one remaining route back into this stage is `discovered_gaps` in `12_figma_build.json`** — a gap
assembly walked into and stopped on, with `action: "stopped-and-flagged"`.

That narrows what this checklist can rely on being corrected later, and it is worth stating plainly: a
gap assembly does *not* walk into is a gap nothing catches. Gate 3 is the only remaining comparison
between the PRD and what was built, it is per-page and by eye, and a requirement this checklist never
specced will not make any page look wrong — the missing thing was never planned into one. There is no
stage after gate 3 that re-reads the module. Completeness here is not the first draft of a spec that
gets audited afterwards; it is the last point at which the omission is cheap.

When a gap does come back, the components are **rebuilt** and then **re-reviewed at gate 2 before the
affected page is re-assembled**:

```
/figma-modifier (here) → /figma-component-pass → GATE 2 again → /figma:figma-use → GATE 3 for that page
```

Note where the protection sits: nothing stops a re-spec from *writing* new components, because the
component pass is ungated. What gate 2 stops is those components being **assembled into pages** before a
person has looked at them. An unapproved component added on the second pass looks exactly like an
approved one from the first, so the review after each rebuild is the only thing that tells them apart.

Rewriting `11_build_phase.json` after an approval has consequences you should expect. Gate 2 pins
`12a_figma_components.json` by **content hash**, not this checklist — it signs off the nodes, not the
plan — so a re-spec on its own does not invalidate the signoff. Rebuilding the components from it does,
and that is the sequence to follow: re-spec, re-run `/figma-component-pass`, then re-take gate 2 on the
rebuilt components. Re-spec only what was flagged; re-speccing everything rebuilds components that
already passed review and puts them back in front of a reviewer for no reason.

## Notes
- Requires a Figma API token to **read** — this stage creates nothing
- Specs a dedicated folder structure (`location`) for each component, for the build to create
- Binds design system tokens by name, and reports any that do not resolve
- Specs the documentation each component should carry in its notes
- Logs every call in `actions_log` for the audit trail

## Artifact contract

**Reads** (produced by upstream skills):

- `reports/<feature>/09_gap_analysis.json` — from `/coverage-scorer` — **the component work list**: what
  this feature is missing, ranked by how many screens each gap blocks
- `reports/<feature>/03_screen_plans.json` — from `/screen-planner` — **the screen work list**: layout,
  ordered elements, per-screen states and flows. The information the gap analysis discards, and without
  it no screen can be assembled
- `reports/<feature>/06_component_analysis.json` — from `/component-analyzer` — the
  element → component binding (`coverage_analysis.required_by_screens`), so a planned element becomes a
  named instance rather than a fresh frame
- `reports/_shared/05_design_system.json` — from `/design-system-loader` (**shared**, not per-feature) —
  **the idiom to build in**: existing components to extend, variant axes to match, tokens to bind by name
- `reports/<feature>/02_figma_state.json` — from `/figma-extractor` — what is already in the file, so an
  `extend` targets the real component instead of creating a parallel one
- `reports/<feature>/07_coverage_scores.json` — from `/coverage-scorer`
- `reports/<feature>/10_roadmap.json` — from `/coverage-reporter` — priority order
- `reports/<feature>/coverage_report_*` — from `/coverage-reporter` (PDF, or HTML when PDF generation is unavailable)

**Deliberately not read:** `reports/_shared/08_ux_evaluation.json`. `/evaluate-design-system` is a
standalone library review, not a step in this pipeline — see the note in
[`.claude/pipeline.json`](../../pipeline.json). Do not add it as a dependency; `pipeline.mjs check`
rejects that edge.

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/<feature>/11_build_phase.json`

Write these files as the **last step** of the skill, into this run's own output folder — resolve and
create it in one step with:

```bash
node utils/pipeline.mjs path --stage figma-modifier --ensure
```

The shape above is **enforced, not just documented**. The machine-checkable version lives in
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json), keyed by the filenames listed above —
read it before writing and satisfy it exactly. Where the JSON block above and the schema differ, the
schema decides.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done figma-modifier
```

That validates the artifacts and records the inputs they were built from. Both halves matter:

- A stage counts as done only when its files exist **and** validate. Writing a partial file no longer
  marks the stage complete — the resolver reports it as invalid and re-runs it. So if you cannot
  produce a complete artifact, say so plainly instead of writing a stub.
- Recording the inputs is what lets a later edit to the PRD (or to `DESIGN_SYSTEM_URL`) invalidate this
  stage and everything downstream. Skip `done` and the stage is treated as stale and redone.

If `done` reports problems, fix the artifact and run it again. Never hand-edit `.pipeline-state.json`
to make a stage look finished.

## Handoff — the component pass, then gate 2, then `/figma:figma-use`

This skill decides **what** to build; it does not do the building, and it must not start it. Once
`reports/<feature>/11_build_phase.json` is written, the next step is **`/figma-component-pass`**, which
requires no gate and builds this checklist straight into Figma. So do not load `/figma:figma-use` from
here to get a head start on pages: page assembly sits behind `/gate-2-components`, and that gate is the
only human stop in phase 2.

Say plainly what that arrangement does and does not buy. Component *creation* is no longer gated — the
first Figma write happens before any person sees it, and a wrong component in this checklist becomes a
wrong node in the library. What is gated is component *use*: no page is assembled out of components
nobody inspected, and a change request at gate 2 sends `/figma-component-pass` back to correct writes
that already happened rather than preventing them.

Steps 1–2 below are the component pass; step 3 onward happens **after** an approved
`G2_component_signoff.json`. Neither is this stage's work — they are documented here because this
checklist is what they execute:

1. Invoke `/figma:figma-use` with the Skill tool. It is **mandatory** before any `use_figma` call and
   carries the Plugin API contract; never call `use_figma` without loading it first.
2. **Pass 1 — components (`/figma-component-pass`, ungated).** Build every component in
   `figma_modifications.components` into the file at `FIGMA_URL`, applying the tokens from
   `reports/_shared/05_design_system.json` (shared, not per-feature) — one `use_figma` call per
   component so a single failure does not lose the rest. Build what the spec says, and build **only**
   what the checklist says: a component that is not on it is one that appeared from nowhere, and in the
   file it looks exactly like one that was specced. If a component cannot be built as specified, record
   it under `failed` with a reason; do not substitute a simplified version and report it as `built`.
   Then write `12a_figma_components.json` and take those live nodes to `/gate-2-components`.
3. **Pass 2 — screens, ONE PAGE AT A TIME.** Only after pass 1 **and an approved gate 2**. Ask
   `node utils/pipeline.mjs next-page` which page may be worked on, assemble **that** page — each
   element an **instance** of its named component, with the screen's layout tokens — then stop and
   present it to `/gate-3-pages`. The next page is not touched until that one has a recorded decision.
   The component-before-screen order is forced for a structural reason (a screen is made of instances,
   so the components must exist as nodes first); the page-by-page order is forced by the gate.
   Before assembling a page, check its elements against the gate-2-approved component pass. A screen with an element
   whose component landed in `failed` is **blocked** — record it under `failed` with
   `kind: "screen"` and a reason naming the missing component. Never assemble around the hole and
   report it as built; the spec named that component on the assumption it would build, and this is
   the only place that assumption gets checked. A screen built with some elements missing is
   `status: "partial"` with a `note`, not `"built"`. A gap this checklist missed, discovered
   mid-assembly, goes in `discovered_gaps` with `action: "stopped-and-flagged"` and comes **back here**
   for a re-spec, a re-run of the component pass and a fresh gate-2 approval of the rebuilt components —
   it is never closed by inventing a component mid-build.
4. Write the result to `reports/<feature>/12_figma_build.json` **incrementally** — once after the
   component pass, then again after each page, carrying `pages_remaining` — (see `figma-use` in
   [`.claude/pipeline.json`](../../pipeline.json)) — `/figma:figma-use` lives outside this repo and
   will not write our artifact, so this stage is only recorded if you write it:

```json
{
  "figma_url": "https://www.figma.com/file/...",
  "built": [
    { "name": "DatePicker", "node_id": "12:345", "variants": 3, "tokens_applied": true, "status": "built", "gate_2_approved": true }
  ],
  "screens_built": [
    {
      "name": "Notification Preferences",
      "node_id": "12:900",
      "page": "Notification Center",
      "states_built": ["default", "loading", "error", "empty"],
      "elements_placed": 4,
      "elements_specced": 4,
      "status": "built",
      "tokens_applied": true,
      "presented_at": "2026-09-09T11:04:00Z"
    }
  ],
  "skipped": [{ "name": "FileUpload", "kind": "component", "reason": "escalated in 06_component_analysis.json, product decision still open" }],
  "failed": [],
  "current_page": "Notification Preferences",
  "pages_remaining": ["Notification Inbox", "Quiet Hours"],
  "discovered_gaps": [],
  "actions_log": [
    "✓ Built DatePicker (3 variants)",
    "✓ Assembled Notification Preferences (4 instances, 4 states) — presented to gate 3, stopped"
  ]
}
```

5. Then record the external stage yourself, exactly as an in-repo skill would:

```bash
node utils/pipeline.mjs done figma-use
```

   This validates `12_figma_build.json` against
   [`.claude/schemas/artifacts.json`](../../schemas/artifacts.json) and records the stage. Without it
   the pipeline has no evidence the build ran and will rebuild on the next pass.

`AUTO_CREATE_COMPONENTS` matters more than it used to, because the component pass has no gate in front
of it: when it is false, report the build plan — components *and* screens — and ask before writing. For
screens an approved gate 2 is required as well; for components it is the only brake there is. Report
failures as `failed` entries — never record a component or screen as `built`
unless `use_figma` confirmed it. The schema enforces this: `status` on a `built` entry may only be
`"built"`, a screen may only be `"built"` or `"partial"`, and anything failed or skipped needs a
`reason`.

**A run with zero component gaps still has screens to build.** When the design system already covers
everything, `figma_modifications.components` is legitimately empty — but `screens` never is, because
`03_screen_plans.json` always has at least one plan. Do not treat an empty component list as "nothing
to build" and skip the checklist; that reading is what made screens invisible in the first place, and it
would now also leave gate 3's roster empty, so no page would ever be presented to anyone.
