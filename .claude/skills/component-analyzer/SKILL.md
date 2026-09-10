---
name: component-analyzer
description: Phase 2 — map every atomized requirement onto the design system with one of four statuses and recorded evidence, and produce the mapping the build checklist is specced from. Creates nothing in Figma.
---

# Component Analyzer Skill

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/design-system-loader`, `/screen-planner`  ·  **Optional:** `/figma-extractor`

`/screen-planner` itself requires `/gate-1-requirements`, so this stage cannot run on requirements no
human has approved — the gate reaches it transitively rather than being restated here.

This skill can be invoked on its own. When it is, the upstream skills it depends on may not have run yet,
so **step 0 is always**:

```bash
node utils/pipeline.mjs plan component-analyzer
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

Analyzes component library completeness and capabilities, and — the actual phase-2 deliverable — maps
every atomized requirement onto that library.

## This is phase 2, and it builds nothing

This stage is **phase 2 — design system mapping**, and the boundary is absolute: **build or create
nothing in Figma here.** No components, no frames, no variants, no "while I was in there" fixes.
Construction belongs to `/figma-component-pass`, which runs later in phase 2 from a checklist, and to
`/figma:figma-use`, which assembles pages in phase 3.

**Nothing signs off this mapping, and that raises the stakes rather than lowering them.** There is no
longer a gate reviewing the mapping table: gate 2 reviews the *components that get built*, which means
an error here is caught — if at all — as a wrong component someone notices in Figma, not as a wrong row
someone reads. Every rule below used to be enforced by a gate check; each is now a rule you follow
because nothing downstream will.

What phase 2 produces instead is a **build checklist**: for every requirement, whether the design system
already satisfies it, how it would be made to, or that nothing covers it — each answer carrying the
evidence that makes it auditable rather than an assertion.

### The four-status framework

Every atomized requirement in `01_prd_requirements.json` gets **exactly one** of four statuses:

| Status | What it claims |
|---|---|
| `direct-match` | An existing component satisfies the requirement **as-is** — verified at variant, state, icon and content level. |
| `match-with-modification` | An existing component satisfies it once a named, specific change is made. |
| `combinable-match` | Two or more existing components, composed, satisfy it. `combines` lists them; naming a single component and calling it combinable is a contradiction. |
| `no-match` | Nothing in the system covers it, and absence was **established by inspection**, not by a search returning nothing. |

**100% of requirements must appear in the table.** A requirement missing from it is a **gate-2 failure
criterion** — the first one the gate checks (`all_requirements_mapped`) — because an unmapped requirement
is not a low score anywhere, it is simply absent, and absence reads as "nothing to do".

For anything other than a direct match, name the `resolution_path` in order of preference:
**`extend-existing` → `combine-existing` → `net-new`**, with `resolution_rationale` saying why that one.
A component built for this feature alone is one the next feature rebuilds, so module-specific is a last
resort you justify, not a default you reach for. A gap whose path is missing or vague — "add a variant"
is not a resolution path — becomes a component the build pass has to invent, and an invented component
is exactly what gate 2 is left to catch after it exists.

### A "direct match" is a claim about variants, not family resemblance

`direct-match` asserts that the variants, states, icon support and content behaviour **this requirement
needs** exist. "It's a button" has never been sufficient: it says nothing about whether the destructive
variant, the loading state, the leading-icon slot or the two-line-label behaviour the requirement depends
on is actually there.

Record what you actually checked in `evidence.variants_checked`, and set `evidence.method` to
`variant-level-inspection` (or `plugin-api-traversal` where that is what you used). A verified direct
match and a guessed one are indistinguishable without that field — which is why `evidence` is required
on every row whatever the status.

A direct match asserted without variant-level verification is a defect that **surfaces only during
assembly**, in phase 3 — by which point components have been built and inspected on the strength of a
mapping that does not hold, and the fix is a re-map, a rebuild, and gate 2 taken again.

### A "no match" reached from an empty keyword search is invalid

Before declaring a gap real, **walk the nested component-set children directly.** Absence from a keyword
search is not absence from the file: the bell icon was reported missing from `Icons/General` while
sitting nested inside the `Notification Bill` component set. `search_design_system` searches **published**
libraries only, while most in-house systems keep components on a file's own pages, so a library-only
search returns nothing for components that plainly exist.

`evidence.method: "keyword-search-only"` is **not acceptable** for a `no-match`. Use
`nested-children-walked`, `full-page-walk` or `plugin-api-traversal`, and say in `evidence.notes` where
you looked. And stamp `evidence.verified_at`: a conclusion from an earlier session is not evidence today
— the Reconnecting banner was recorded as having no adequate Alert state, and a later live look found an
`Alerts → State=Info` variant that had since been added.

### Never invent a component name

Every name in `component` and in `combines` must **resolve in the live file**. Nothing checks this
before the build any more, so it rests here: a plausible-sounding name that exists nowhere reads exactly
like the others, gets built as though it were real, and fails when an instance of it cannot be resolved.
Gate 2's `no_unapproved_component_changes` is the only backstop, and it fires after the write.

### Never trust the PRD's own "existing vs. new" labels

A PRD's claim that something is "existing" or "new" is an input to verify, not an answer to inherit.
Keep whatever it claimed in **`prd_label_was`**, beside the verified status, precisely because those
labels have proven unreliable: Notification Center had items marked "new" that were already fully
assembled composites in the file, and building to the label would have produced duplicates of components
that already existed. The reverse happens as often — "existing" for something nobody ever built.

Keeping the claim rather than discarding it is deliberate: a systematic divergence between
`prd_label_was` and `match_status` is itself worth raising with a human.

### Escalate product decisions rather than designing around them

A mismatch that is really a **product decision** — a taxonomy conflict, a data-model conflict — is not a
component problem, and no component choice resolves it. Put it in `escalation` with `question`,
`why_not_a_component_fix`, `options` and `recommended` — and then **raise it out loud**. This used to be
enforced: gate 2 could not be approved while an escalated decision had no `answer`. No gate holds it
open now, so an escalation left only in this artifact will be seen by nobody until the closure report,
after the module is built. Put it in front of a person yourself, and say that no gate is holding the
work while it is open.

- The `kind`/`category` conflict against the `Notification Types` component was **correctly escalated**.
  Forcing a `combinable-match` that did not hold would have shipped the conflict into the build, where it
  becomes a rename across every instance rather than one question.
- Customizable Dashboards surfaced the **complete absence of any data-bound chart-rendering component**
  across multiple frames — a systemic blocking gap, not a per-frame gap. Set `escalation.systemic: true`
  and list the frames in `blocks_frames`. Escalation was right there; manufacturing a combinable match
  out of unrelated primitives was not, and would have reported the feature as covered.

The test is simple: if answering the question changes **what the product is**, it escalates. If it only
changes which component gets used, decide it and record the rationale.

## Usage

```
/component-analyzer
# Analyzes design system from /design-system-loader
```

## Input (from pipeline)
- **Design System** (from design-system-loader)
- **Screen Plans** (from screen-planner)
- **PRD Requirements** (`01_prd_requirements.json`) — the atomized requirement list the `mapping_table`
  needs one row per; the screen plans are a lossy projection of it and cannot supply the row set

## Output
```json
{
  "mapping_table": [
    {
      "requirement_id": "REQ-1",
      "requirement": "User can dismiss a single notification from the list",
      "match_status": "match-with-modification",
      "component": "Notification Row",
      "combines": [],
      "modification": "Add a `trailing=dismiss` variant: the icon-button slot exists but has no close glyph bound",
      "evidence": {
        "method": "variant-level-inspection",
        "variants_checked": ["State=Read", "State=Unread", "Trailing=None", "Trailing=Chevron"],
        "verified_at": "2026-09-09T10:12:00Z",
        "notes": "Walked Notification Bill component set children; no dismiss trailing variant present"
      },
      "resolution_path": "extend-existing",
      "resolution_rationale": "The row already owns the slot and the token bindings; a net-new row would duplicate both",
      "prd_label_was": "new"
    },
    {
      "requirement_id": "REQ-7",
      "requirement": "Notifications are grouped by kind",
      "match_status": "no-match",
      "evidence": {
        "method": "nested-children-walked",
        "verified_at": "2026-09-09T10:20:00Z",
        "notes": "Walked every page and every component-set child; no grouping header exists"
      },
      "resolution_path": "net-new",
      "escalation": {
        "question": "Is the grouping axis `kind` (PRD) or `category` (Notification Types component)?",
        "why_not_a_component_fix": "The two taxonomies have different members; no component choice reconciles them",
        "options": ["Adopt `category` and update the PRD", "Add `kind` to Notification Types"],
        "recommended": "Adopt `category` — the component is already in use elsewhere",
        "systemic": false,
        "blocks_frames": ["Notification Center / List"]
      }
    }
  ],
  "component_analysis": {
    "total_components": 45,
    "by_category": {
      "Buttons": 3,
      "Inputs": 8,
      "Cards": 5,
      "Navigation": 4,
      "Modals": 2,
      "Other": 23
    },
    "component_details": [
      {
        "name": "Button",
        "category": "Atoms",
        "variants": 4,
        "properties": ["size", "state", "icon"],
        "usage_count": 12,
        "states_supported": ["default", "hover", "active", "disabled"]
      }
    ]
  },
  "coverage_analysis": {
    "required_by_screens": {
      "Button": { "instances": 8, "variants_needed": 3 },
      "Input": { "instances": 5, "variants_needed": 2 }
    },
    "adequately_covered": ["Button", "Input", "Card"],
    "partially_covered": ["Navigation", "Modal"],
    "not_covered": ["CustomChart"]
  }
}
```

### `mapping_table` — required, one row per requirement

`mapping_table` is a **required** top-level section, and it is **one row per atomized requirement from
`01_prd_requirements.json` — not one row per component.** That direction is the whole point of the
section, and getting it backwards reproduces the failure it was added to fix.

| Field | What goes in it |
|---|---|
| `requirement_id` | The id from `01_prd_requirements.json`, so the row is traceable back and forward. |
| `requirement` | The requirement text, gate-1-approved (corrected wording wins for ids in gate 1's `requirements_edited[]`). |
| `match_status` | Exactly one of `direct-match`, `match-with-modification`, `combinable-match`, `no-match`. |
| `component` | The satisfying component **by its real name in the live file**. |
| `combines` | For `combinable-match`: the existing components being composed. More than one, or it is not combinable. |
| `modification` | For `match-with-modification`: the specific change. Vague here is a gate-2 failure. |
| `evidence.method` | How the status was established — `variant-level-inspection`, `nested-children-walked`, `full-page-walk`, `plugin-api-traversal`. `keyword-search-only` is not a valid basis for a `no-match`. |
| `evidence.variants_checked` | For a direct match: the variants, states, icon and content behaviours actually confirmed. |
| `evidence.verified_at` | When the live file was read. Design system state has a shelf life. |
| `evidence.notes` | Where you looked, in enough detail that someone else can repeat it. |
| `resolution_path` | `extend-existing` → `combine-existing` → `net-new`, in that order of preference; `none-needed` for a direct match. |
| `resolution_rationale` | Why **that** path, and not the one above it in the preference order. |
| `escalation` | Set only when the mismatch is a product decision: `question`, `why_not_a_component_fix`, `options`, `recommended`, `systemic`, `blocks_frames`. |
| `prd_label_was` | What the PRD itself claimed ("existing", "new"), kept beside the verified answer. |

**Why this section exists.** The artifact previously described the **design system** — how many components
there are, which are adequately, partially or not covered — but never answered the question phase 2 is
for: *does requirement R map to component C, and how do we know?* The coverage bucket arrays cannot
answer it, because they lose the requirement: `not_covered: ["CustomChart"]` records a component name with
no trace of which requirement wanted it, so a requirement that was **never mapped at all** left no hole
anywhere and was simply invisible. "Every requirement appears in the table" was not checkable against the
old shape at all.

`component_analysis` and `coverage_analysis` stay: the downstream scorer and reporter read them, and a
library-shaped view is still the right input for scoring. They are summaries of the mapping table now,
not a substitute for it, and they must be consistent with it — a component in `adequately_covered` whose
requirements all carry `no-match` is a contradiction worth catching before anything is built from it.

## Notes
- Maps every atomized requirement to a status, a component and its evidence — the `mapping_table`
- Maps component usage in screen plans
- Identifies coverage gaps, and records **how** each absence was established
- Documents component capabilities
- Flags missing variants
- Escalates product-level conflicts instead of resolving them
- Creates nothing in Figma

## Artifact contract

**Reads** (produced by upstream skills):

- `reports/_shared/05_design_system.json` — from `/design-system-loader` (**shared**, not per-feature)
- `reports/<feature>/03_screen_plans.json` — from `/screen-planner`
- `reports/<feature>/01_prd_requirements.json` — the atomized requirement list; `mapping_table` needs one
  row per entry, and the screen plans cannot supply that row set
- `reports/<feature>/G1_requirements_signoff.json` — for `requirements_edited[]`, whose gate-corrected
  wording is the requirement text to map

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/<feature>/06_component_analysis.json`

> No gate signs this artifact off. `mapping_table` is required by the schema, so a run that skipped the
> mapping and wrote only the library summary is reported invalid and re-run rather than passed
> downstream — but its *content* is checked by nothing. What is built in Figma is specced from it, and
> the first human to see the consequences sees them as components at gate 2.

Write these files as the **last step** of the skill, into this run's own output folder — resolve and
create it in one step with:

```bash
node utils/pipeline.mjs path --stage component-analyzer --ensure
```

The shape above is **enforced, not just documented**. The machine-checkable version lives in
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json), keyed by the filenames listed above —
read it before writing and satisfy it exactly. Where the JSON block above and the schema differ, the
schema decides.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done component-analyzer
```

That validates the artifacts and records the inputs they were built from. Both halves matter:

- A stage counts as done only when its files exist **and** validate. Writing a partial file no longer
  marks the stage complete — the resolver reports it as invalid and re-runs it. So if you cannot
  produce a complete artifact, say so plainly instead of writing a stub.
- Recording the inputs is what lets a later edit to the PRD (or to `DESIGN_SYSTEM_URL`) invalidate this
  stage and everything downstream. Skip `done` and the stage is treated as stale and redone.

If `done` reports problems, fix the artifact and run it again. Never hand-edit `.pipeline-state.json`
to make a stage look finished.
