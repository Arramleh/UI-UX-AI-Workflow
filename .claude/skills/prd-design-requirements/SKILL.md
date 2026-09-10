---
name: prd-design-requirements
description: Extract design-ready requirements from a PRD (and any companion annex/reference doc) for use in Figma or other design tools. Use this whenever the user uploads or references a PRD and asks to pull out requirements, personas, user flows, pages/frames, or components for design work — even if they don't say "skill" or use these exact words. Trigger on phrases like "extract requirements from this PRD," "turn this PRD into design requirements," "what pages/components do I need for this," or "read this PRD and tell me what to build in Figma." Produces a structured reference document (Overview, Objectives, Personas, Common/Special User Flows, Pages/Frames, Components, Assembly, Open Decisions) in a fixed, terse house style — not a restatement of the PRD's own tone — delivered as a readable, fully categorized Word document (`.docx`) with the pages and flows illustrated as embedded graphs, alongside the markdown source of record. Open items are raised as decision packets for the human gate, never resolved here.
---

# PRD → Design Requirements Extraction

## Prerequisites — resolve these BEFORE anything else

**Depends on:** `/prd-analyzer`  ·  **Optional:** —

This skill can be invoked on its own. When it is, the upstream skills it depends on may not have run yet,
so **step 0 is always**:

```bash
node utils/pipeline.mjs plan prd-design-requirements
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

## What this stage is for

Turns a PRD (plus an optional companion/annex doc) into a design-ready requirements reference: what the
thing is, who uses it, how they move through it, and what to build in the design tool (pages/frames +
components), ending with an explicit list of the decisions that are still open, each stated as a question
with options and a recommendation for a human to answer at gate 1.

**Two deliverables, one set of facts.** `design_requirements.md` is the **source of record** — the file
the rest of the pipeline reads. Beside it goes `design_requirements.docx`, **the deliverable the human
gets**: the same content as a properly categorized Word document, with styled headings per §1–§8, real
Word tables for the personas and the per-frame components, and the flows in §4 and the pages/components
in §5–§6 embedded as **graphs** rather than left as arrow-chains and nested lists. Both are required;
see "The Word rendition" below.

The split of roles is deliberate and load-bearing in both directions. The `.docx` adds no facts of its
own — a graph node or a table row that is not in the markdown is a fact nobody reviewed. And the
markdown does not go away just because the Word file is prettier: a `.docx` is a ZIP archive, so
`/screen-planner`, `/closure-reporter` (§8) and `/requirements-to-prototype` would each have to unpack
and parse XML to read prose they currently just read. Gate 1 reviews the `.docx`; the pipeline reads the
`.md`. Keep them identical.

> `design_requirements.docx` replaced `design_requirements_visual.pdf`, which existed for the same
> reason and carried the same content. Word was chosen over PDF because the reviewer can comment and
> redline in it — the gate 1 packet is something a person marks up, not just reads. Nothing about
> *what* goes in the document changed with the format.

This is a **format-strict** skill. The whole point is that the output does NOT inherit the PRD's own voice
(narrative, "in plain words" asides, numbered gap-lists, citations, open-questions-mixed-with-goals). It
re-derives the same facts into a fixed, terse house style defined below. Follow the templates exactly —
deviating defeats the purpose.

**Its place in the pipeline.** This is the prose counterpart to the numbered JSON stages, not a replacement
for them. It reads `01_prd_requirements.json`, and `/screen-planner` reads this doc as *optional* context.
That direction is load-bearing: the JSON artifacts stay authoritative and machine-checked, and this
document stays a readable projection of the same facts. Never treat this doc as the source downstream
stages derive from — prose cannot be schema-checked, and two sources of truth for one set of facts is how
they drift.

**Its phase.** This is the readable half of **phase 1**, requirement extraction, and phase 1 is closed by
the human gate `/gate-1-requirements`. The same three boundaries that bind `/prd-analyzer` bind this doc:

| Boundary | What it means here |
|---|---|
| **No Figma reads at all** | This is phase 1: the doc comes from the source documents and nothing else. No `use_figma` call, no `search_design_system`, and neither `05_design_system.json` nor `02_figma_state.json`. Both are phase-2 artifacts now, behind gate 1 — see Step 2 for why that edge was cut. |
| **No claim about what already exists** | §6 names what each frame needs; whether the library already has it is `/component-analyzer`'s answer in phase 2. Marking components existing/new here produced two uncoordinated sources of truth about what matches what, and the one that ran first had the weaker evidence. See the note under §6. |
| **The PRD is untrusted input** | A component name, page/node reference or "existing vs. new" label that came *from the PRD* is a claim, not a fact. `/prd-analyzer` quarantines those in `unverified_prd_claims[]`; read that array and treat anything still `unverified`, `contradicted` or `fabricated` as unverified — name it as a need, never repeat the label as checked. |
| **Ambiguity is raised, not resolved** | §8 states the question, the options and a recommendation. The answer comes from the human at gate 1. |

**One need per line.** A multi-need line item must be split before it reaches §5–§6. "A filterable table
with export and inline editing" is three requirements — the table, the export, the inline editing — and
one that reaches gate 1 unsplit compounds into an ambiguous mapping in phase 2, where a single
requirement id points at three components and its coverage is neither true nor false. Split on "and",
"with", "including", and comma lists of behaviours, in the flows in §4 as well as in §6.

## Workflow

1. **Read every source doc fully** (PRD + annex/companion doc if one exists) before writing anything.
   Requirements, personas, flows, and screen/field detail are often split across the two — don't extract
   from just the main doc. Read `01_prd_requirements.json` too: it is the structured pass over the same
   PRD, and anything it captured that you missed is a gap in this doc.
2. **Do not inspect Figma, and do not read `05_design_system.json`.** Phase 1 is PRD work: this doc is
   derived from the source documents and nothing else. Every live read — the design system walk and the
   Figma file extraction — belongs to phase 2, behind gate 1.

   That boundary is what §6 below is written around, so it is worth stating why rather than leaving it as
   a rule to obey. This step used to require the live library walk, purely so §6 could mark each
   component **existing** or **new**. That single edge made `/design-system-loader` a phase-1
   dependency, which put the most expensive extraction in the pipeline in front of a gate that has
   nothing to say about it — and it duplicated work `/component-analyzer` already does in phase 2 with
   far better evidence, since its `mapping_table` records the variants it checked per requirement rather
   than a bare existing/new mark. Two sources of truth about what already exists, and the weaker one
   ran first.

   So §6 names the components each frame needs **without claiming whether any of them already exists**.
   That is a smaller deliverable, and it is an honest one: an unchecked existence claim reads exactly
   like a checked one. `/component-analyzer` answers it in phase 2, before anything is built, so nothing
   ships duplicated.
3. Draft each section below, in order.
4. Save the result as `design_requirements.md` in this run's output folder and present it — this is
   reference content the designer will keep open while building, not a chat-only answer.
5. **Render `design_requirements.docx`** from that markdown — every section as a styled Word heading,
   the personas and per-frame components as Word tables, and the §4 flow graph and §6 page–component
   graph embedded as images. See "The Word rendition" below for the build and its rules.
6. **Raise every open decision in §8 as a packet — question, options, recommendation, consequences.**
   Do not take any of them, and do not stop mid-run to ask: the asking happens at gate 1, off the back
   of what you wrote in §8.

## Raising decisions rather than taking them

**§8 raises the open decisions; it no longer takes them.** This reverses what this skill used to do — it
previously instructed you to take the defensible default and record the call — and the reversal is worth
explaining, because both behaviours were correct answers to different questions.

Unattended, taking the default was right. A stage that blocks on a question hangs the run, and a workflow
that halts on every open question never finishes, so the least-bad option was to choose the cheapest-to-
reverse interpretation and make the choice visible. Gated, taking the default is wrong: a default taken
in phase 1 is a decision made **before the person accountable for it ever saw the question**, and it
reaches them disguised as a settled fact rather than a question. The run no longer has to guess to keep
moving — it parks at `/gate-1-requirements` instead, which is a correct state.

So for each genuinely ambiguous item, write the packet and build the doc around the **recommended**
option while labelling it as recommended, not as decided. A recommendation is welcome; a resolution is
not. Gates 1 and 2 refuse to open while any decision's `answer` is empty, so an item you quietly settled
here is an item nobody will ever be asked about.

**Do not write `14_closure_notes.json`.** That ledger belongs to `/closure-reporter`, which owns it end to
end. Two stages writing one artifact is how a ledger loses entries. Your §8 is what `/closure-reporter`
reads — and the split of labour is now explicit: **§8 supplies the question, the options and the
recommendation; the gate 1 record supplies the answer and who gave it.** §8 does not claim a decision was
"taken", because at the time you write it none was.

## Output structure (follow exactly)

### 1. Overview
One short paragraph, 2–4 sentences, plain language. No numbered pain-point lists, no PRD jargon, no
citations, no "in plain words" framing. Just: what the thing does, and why it matters. Model:

> The Notification Center provides users with a centralized place to receive, manage, and act on system events, alerts, operational updates, and user activities. It ensures important information reaches the right users at the right time while allowing each user to personalize how notifications are delivered.

### 2. Objectives
A flat bullet list, 5–8 bullets. Each bullet is a short outcome statement starting with a verb (Centralize,
Ensure, Enable, Support, Maintain, Allow…). No sub-bullets. No metrics, baselines, or open questions mixed
in — those go in Open Decisions (§8). Model:

> * Centralize all system notifications.
> * Ensure users receive only relevant notifications.
> * Support multiple notification delivery channels.
> * Allow users to personalize notification preferences.
> * Enable quick navigation from a notification to its related resource.
> * Maintain notification history for auditing and troubleshooting.

### 3. Target Users / Personas
List every persona/role the PRD defines. A short table works well: persona, what they can see/access, and
anything that meaningfully differs from other roles (this feeds §4's Special Flows — don't duplicate the
detail here, just enough to distinguish them).

### 4. User Flows
Two groups. Keep every flow to a **single line, arrow-chain only** (Trigger → Screen → Action → Result). No
elaboration, no branching detail, no error/edge-case handling — those belong in Pages/Components (§5–6),
not here.

**Common Flows** — numbered ("First Flow", "Second Flow", "Third Flow"…), persona-agnostic, the paths every
role takes the same way. Model:

> * First Flow
> Click on Bell → open panel → See list of notifications sorted automatically by unread first → click on one → navigate straight to the type/content it's about → row marked read if opened

**Special Flows** — grouped by persona heading, listing *only* what differs for that role (extra
permissions, unique content, unique actions). Never repeat what's already covered in Common Flows. If a
persona has nothing distinct, say so briefly rather than omitting them silently.

**Flow graph — required, at the end of §4.** After the two groups, draw every flow above as one graph, in
a ```mermaid fenced block, so the same chains are also readable as a picture. This is where branching
*shape* becomes visible: two flows that share a screen are one node with two edges here and two unrelated
lines in the prose above, which is exactly the thing a designer needs to see before naming frames.

```mermaid
flowchart LR
  bell([Bell icon]) --> panel[Notification Panel]
  panel -->|click a row| target[Related resource]
  panel -->|mark read| panel
  panel -->|See all| history[Notification History Page]
  history -->|Settings| settings[Notification Center Settings]
  admin([Admin only]) -.->|broadcast| settings
```

Rules, each of which keeps the graph honest rather than decorative:

- **Shapes carry meaning, and only these three.** `[Rectangle]` = a page/frame from §5 — and the node
  label must be the §5 name **verbatim**, since this graph is how a reader checks §4 and §5 agree.
  `([Stadium])` = a trigger or entry point. `{Diamond}` = a branch the flows genuinely fork on.
- **Every edge is labelled with the action** (`-->|click a row|`). An unlabelled edge is a claim that
  something leads somewhere without saying how, which is precisely the detail the arrow-chains carry.
- **Persona-specific edges are dashed** (`-.->`) and labelled with the persona, so Special Flows are
  visible as deviations from the common path instead of a second graph nobody cross-reads.
- **The graph adds no node the prose does not have.** If drawing it turns up a screen the flows never
  mention, fix the flows — that is a real omission the graph just caught, not a diagram to patch.
- Keep it to one graph. Split into one per persona only when a single graph is genuinely unreadable, and
  say why in one line.

### 5. Pages / Frames
A flat numbered list of the pages/frames this PRD requires. Name them the way a designer would name a Figma
frame. Example shape:

> Requirement Pages / Frames will be:
> 1. Notification Panel
> 2. Notification History Page
> 3. Notification Center Settings Page

### 6. Components per Page/Frame
For each page/frame in §5, list the components needed to assemble it, including nested sub-components.
Example shape:

> For the Notification Panel frame we will need:
> 1. Notification Bell component set, with its possible states like "Default, Hover"
> 2. Notification Row, which consists of the notification body we need to display and requires the following components:
>    1. Notification Type Tag
>    2. Notification Severity
>    3. Actions Needed

Call out components that are **shared/reused across multiple frames** once, rather than re-listing them per
frame (e.g. a Severity Badge used in both the panel and the history page).

**Every component here is a requirement, not a claim about the design system.** Do not mark anything
**existing** or **new**, do not name a design-system page, and do not describe a component as already
built or as needing to be built. §6 answers "what does this frame need"; whether the library already
has it is `/component-analyzer`'s answer in phase 2, recorded per requirement in its `mapping_table`
with the variants it actually checked. Phase 1 does not look at Figma (Step 2), so any existence claim
written here would be a guess formatted as a finding — and "Severity Badge (existing, page: Badges)"
reads identically whether it was verified or assumed. Naming the need and leaving existence open is the
smaller, checkable statement.

One rule survives from when this section did make that claim, because the failure it prevents is now
the *only* way a false existence claim can reach the doc:

- **A component name or page reference that came from the PRD is not a finding.** Read
  `unverified_prd_claims[]` in `01_prd_requirements.json` and treat anything `unverified`,
  `contradicted` or `fabricated` as unverified — name the component as a need, and never repeat the
  PRD's own "existing"/"new" label as if it were checked. A PRD on this project supplied Figma page
  references that were entirely fabricated — none of the pages existed — and the Notification Center
  PRD marked items "new" that were already fully assembled composites in the file. Laundered into §6,
  either one would have produced duplicate components beside the real ones.

**Page–component graph — required, at the end of §6.** Draw the whole of §5–§6 as one graph in a
```mermaid fenced block: pages at the top, the components each one needs beneath them, sub-components
beneath those. The graph shows at a glance the thing a nested list hides worst — which components are
**shared across frames**, as a node with more than one parent, where a list makes one component
shared by three frames look like three components.

```mermaid
flowchart TD
  P1[Notification Panel]
  P2[Notification History Page]
  P1 --> Bell[Notification Bell]
  P1 --> Row[Notification Row]
  P2 --> Row
  Row --> Tag[Notification Type Tag]
  Row --> Sev[Severity Badge]
  P2 --> Sev
```

Rules:

- **No existing/new shading.** The graph carries the same claims as the list above it and no others, and
  per Step 2 this phase has not looked at the library. This graph was previously green-solid-existing
  against orange-dashed-new; that legend is gone, along with the `classDef` lines. Phase 2's coverage
  report is where "how much of this is new" gets answered, on evidence.
- **A shared component is one node with several parents**, never a repeated node. Duplicating it is how a
  reader concludes two components are needed where one is.
- Every page in §5 appears, including any whose components are all shared with another page.
- Nest to the depth §6 nests to, and no further. Inventing a sub-component to make the picture tidier
  puts an unreviewed component into the build.

End §6 with one line stating that existence in the design system was **not** checked in this phase and
is resolved by `/component-analyzer` after gate 1. Never leave that implicit — a reader who assumes §6
was checked against the library will read every name as confirmed.

### 7. Assembly
Briefly describe, per page, how the components in §6 nest together into the frame. A few sentences per page
— this is the "put it together" step, not new information.

### 8. Open Decisions
Split into three groups:

- **Resolved upstream** — decisions the PRD or the user already made; restate them precisely so they're
  locked in and traceable. These are the only settled entries in §8.
- **Raised here** — every item the source docs left genuinely ambiguous, written as a packet rather than
  a call. One entry each, in this shape:

  ```
  OPEN DECISION 1 — <the question, phrased so a non-author can answer it>
    affects:     <requirement ids / frames>
    options:     (a) ...  (b) ...          # at least two, stated concretely
    recommended: (b), because ...
    consequence: (a) means ...; (b) means ...
    blocks design: yes | no
  ```

  There is no "taken" line, and adding one is the failure this group was rewritten to prevent. Build the
  doc around the recommended option and label it as recommended. The answer arrives from the human at
  `/gate-1-requirements`, which will not open while any of these is unanswered.
- **Needs a human in the editor** — anything that cannot be answered by choosing between options, because
  it requires someone in the Figma file (a brand call, a legal wording sign-off, an asset nobody has).
  These are not decisions anyone took, so they are not decision packets either: list them plainly so
  `/closure-reporter` can carry them into `still_missing[]` with a `closeable_by`, rather than into
  `open_decisions[]` with a fabricated answer.

## The Word rendition

`design_requirements.docx` is the same document, laid out to be read and marked up away from a terminal —
in a review, on a second screen beside Figma, attached to the gate 1 packet. It exists because the two
sections a designer actually works from are the two the markdown serves worst: §4 is a wall of arrow
chains, and §5–§6 is a nested list where a shared component looks like two components. Rendered as
graphs, both are answerable at a glance. It is Word rather than PDF because a reviewer at gate 1 needs to
be able to comment and redline on it.

**Build it from the markdown, never in parallel with it.** Write `design_requirements.md` first, in full,
then render. Authoring the Word content separately produces two documents that agree until they don't,
and the markdown is the source of record.

### How to build it

Load the **`docx` skill** and follow it — it carries the docx-js footguns (A4 default, dual table widths,
`ShadingType.CLEAR`, `ImageRun` needing `type:`, no literal `\n`, no literal `•`) and the render-and-look
verification loop. Do not hand-roll OOXML, and do not write a `.md` and rename it `.docx`: Word will not
open it, and the stage would still mark itself done.

1. **Render the two ```mermaid blocks to PNG** into the scratchpad (not `reports/`, which holds
   deliverables only):

   ```bash
   npx -y @mermaid-js/mermaid-cli -i flows.mmd -o flows.png -s 3 -b white
   ```

   `-s 3` matters: a 1× mermaid PNG is unreadable once Word scales it to the text column. If
   mermaid-cli is unavailable or offline, render to SVG and convert (`rsvg-convert`, `inkscape`), or
   hand-author an equivalent image with the same nodes, edges and labels. `ImageRun` takes raster
   only, so PNG is the target either way.
2. **Write a Node script that builds the document with docx-js**, section by section in §1–§8 order,
   and run it. Structure it so the Word file is *navigable*, which is the whole point of the format:

   - **A real heading hierarchy.** `HeadingLevel.HEADING_1` for each of §1–§8, with the section number
     in the text (`4. User Flows`), `HEADING_2` for the sub-groups that exist inside a section (Common
     Flows / Special Flows in §4, and the three groups in §8), `HEADING_3` per persona under Special
     Flows and per page under §6 and §7. Built-in heading styles are required, not cosmetic — a custom
     style without `outlineLevel` is invisible to the table of contents.
   - **A `TableOfContents` on page 1**, after a title block naming the feature and the PRD it came
     from. Word populates it on open; that prompt is expected.
   - **Tables where the markdown has tables or a two-level list.** §3 personas as a table (persona /
     access / what differs). §6 as one table per frame — component, sub-components, notes — because a
     nested bullet list in Word is exactly as unreadable as it is in markdown. Set `columnWidths` on the
     table *and* `width` on every cell, both `WidthType.DXA`.
   - **The §5 frame list as real Word numbering**, so it renumbers when the reviewer inserts one.
   - **Each graph on its own landscape section**, sized to the full text width. A graph shrunk to fit
     beside body text is the failure mode this deliverable was added to fix. In docx-js that means a
     new `section` with portrait dimensions plus `orientation: PageOrientation.LANDSCAPE`; put a
     one-line caption under each image saying which section it draws.
   - **The §8 packets as a monospaced block each**, wording preserved verbatim (see below).
3. **Verify by looking at it** — per the `docx` skill: convert to PDF, rasterize, and Read the images.
   A document nobody opened is a document with an empty TOC and a table blown past the margin.

   ```bash
   soffice --headless --convert-to pdf design_requirements.docx && pdftoppm -jpeg -r 100 *.pdf page
   ```

If docx-js is genuinely unavailable, the fallback is to build the self-contained HTML and convert it
(`soffice --headless --convert-to docx page.html`) — the output is plainer but it is a real Word file.
What you must **not** do is drop the graphs, drop the headings, or ship the markdown under a `.docx`
name: any of those is the deliverable minus its reason for existing.

### What it must not do

- **No Figma writes.** `mcp__figma__generate_diagram` would put these graphs in FigJam, and phase 1
  writes nothing to Figma — the first write in this pipeline is the component pass in phase 2. Render
  locally.
- **No new facts, no re-ordering, no softened wording.** It is a rendition. Anything you find yourself
  wanting to add belongs in the markdown, where the rest of the pipeline will see it. Keep the §8
  packets exactly as worded in the markdown, **including the `recommended:` label** — this document is
  often what a reviewer reads before gate 1, and a packet that loses the word "recommended" reads as a
  decision already taken.
- **No tracked changes, no comments, of your own.** Those belong to the reviewer at gate 1; a document
  that arrives pre-annotated makes it ambiguous who said what.
- **Not dated in the filename.** Like the markdown, it is a living document updated in place: one run
  leaves exactly one `design_requirements.docx`. Re-render it whenever the markdown changes, including
  after a `changes_requested` at gate 1 — a stale `.docx` beside a corrected markdown is worse than
  none, because it is the copy people read.

## Notes on tone discipline

The source PRD will often be written in a heavily narrative, hedge-everything style (rejected alternatives,
traceability tables, "in plain words" recaps, quality-bar tables). Extract the *facts* from that material,
but never carry its tone or structure into §1–§2 or into the flows in §4. If in doubt, re-read the two
templates in §1/§2/§4 above and match their register, not the PRD's.

If the user gives corrections mid-conversation (e.g. resolves a wording ambiguity, adds a persona-specific
behavior), update the live document directly rather than only replying in chat — the file is the
deliverable. Re-render the `.docx` in the same breath: both files are the deliverable, and the Word file
is the copy most people actually read.

## Artifact contract

**Reads** (from `reports/<feature>/` and `reports/_shared/`, produced by upstream skills):

- `01_prd_requirements.json` — from `/prd-analyzer`, including `unverified_prd_claims[]` (which claims the
  PRD made about the design and what the live file actually says) and `open_decisions[]` (the packets
  already raised, so §8 extends that list rather than duplicating or contradicting it)

That is the whole list, and the omission is deliberate: **this stage reads no Figma-derived artifact.**
`05_design_system.json` and `02_figma_state.json` are phase-2 inputs now, and reading either here would
restore the dependency that put live inspection in front of gate 1. See Step 2.

**Writes** (required — the pipeline resolver detects this skill as "done" by these files):

- `reports/<feature>/design_requirements.md` — the **source of record**, and what every downstream stage
  reads
- `reports/<feature>/design_requirements.docx` — **the deliverable**: the same content as a categorized
  Word document, with a table of contents, styled §1–§8 headings, tables for §3 and §6, and the §4 flow
  graph and §6 page–component graph embedded as images

Write them as the **last step** of the skill, into this run's own output folder — resolve and create it in
one step with:

```bash
node utils/pipeline.mjs path --stage prd-design-requirements --ensure
```

Both are declared in the manifest as wildcards — `design_requirements*.md` and
`design_requirements*.docx` — which means they are **existence-checked, not schema-checked**, the same
treatment `coverage_report_*` and `closure_report_*` get, because there is no machine-checkable shape for
a prose deliverable. They are two patterns rather than one because a single `design_requirements*` was
satisfied by *either* file, so a run could skip the Word rendition and still record the stage as done.
Note what the extension check does **not** buy you: a `.docx` that is really renamed markdown, or one
with an empty table of contents and no graphs, passes the manifest exactly like a good one. That puts
the whole burden of correctness on the §1–§8 templates and the verification step above — nothing
downstream will catch a section you skipped or a graph you left out. Write each file once and update it
in place rather than dating it: they are living documents, and one run should leave exactly one of each.

Then, as the very last action of this skill:

```bash
node utils/pipeline.mjs done prd-design-requirements
```

That validates the artifact and records the inputs it was built from. Both halves matter:

- A stage counts as done only when its files exist **and** validate. Writing a partial file no longer
  marks the stage complete — the resolver reports it as invalid and re-runs it. So if you cannot
  produce a complete artifact, say so plainly instead of writing a stub.
- Recording the inputs is what lets a later edit to the PRD (or to `DESIGN_SYSTEM_URL`) invalidate this
  stage and everything downstream. Skip `done` and the stage is treated as stale and redone.

If `done` reports problems, fix the artifact and run it again. Never hand-edit `.pipeline-state.json`
to make a stage look finished.

## After `done`, one more phase-1 stage, then gate 1

`done` is the last step of this skill, but this is **not** the last stage of phase 1. `/screen-planner`
is — it turns the requirements into `03_screen_plans.json`, it is still PRD-only, and it runs **before**
the gate so that its plans are reviewed beside the requirements they claim to cover:

```bash
node utils/pipeline.mjs plan screen-planner          # the last phase-1 stage
node utils/pipeline.mjs plan gate-1-requirements     # then the gate
```

Your §5 frame names and §4 flows are optional context for that stage, and it prefers your frame names so
the doc, the plans and the build all call the same screen the same thing.

`/gate-1-requirements` then presents the requirement list, the screen plans and every §8 packet, asks for
approve / request changes / reject, and records the answers. Do **not** begin `/screen-validator`,
`/component-analyzer` or anything else in phase 2: each requires the gate stage, so the graph blocks it,
and offering to run one "while they review" is how the boundary erodes. If the gate comes back
`changes_requested`, `plan` marks this stage `run` again — rewrite the doc against the person's notes
rather than appending to it, and re-render the `.docx`.
