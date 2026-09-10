export const meta = {
  name: 'prd-to-figma-workflow',
  description: 'PRD to developer handoff: four AI phases, each of the first three ending at a human validation gate. Halts at every gate.',
  phases: [
    { title: 'Extract', detail: 'Phase 1 — atomize the PRD into requirements, personas, flows, frames and screen plans. The PRD only; no Figma reads.' },
    { title: 'Gate 1', detail: 'HUMAN — validate the requirements AND the screen plans built from them. The run HALTS here until a person decides.' },
    { title: 'Inspect', detail: 'Phase 2 — load the design system and read the live Figma file. Every live read sits behind gate 1.' },
    { title: 'Map', detail: 'Phase 2 — map every requirement to the design system; produce the build checklist' },
    { title: 'Components', detail: 'Phase 2 — build ONLY the specified components and variants, then stop' },
    { title: 'Gate 2', detail: 'HUMAN — inspect the components as they now exist in live Figma. The run HALTS here.' },
    { title: 'Assemble', detail: 'Phase 3B — build ONE page, then stop for its own sign-off' },
    { title: 'Gate 3', detail: 'HUMAN — validate that one page. The run HALTS here, per page. This is the LAST check against what was built.' },
    { title: 'Handoff', detail: 'Phase 4 — developer handoff package, then the closure report' },
  ],
}

/**
 * THIS WORKFLOW CANNOT RUN TO COMPLETION IN ONE INVOCATION, AND THAT IS THE DESIGN.
 *
 * Three of its nine phases are human validation gates. A script has nobody to ask, so at each gate it
 * prepares the packet, records nothing, and RETURNS with `status: "awaiting_gate"`. The person decides
 * in their own time with `pipeline.mjs gate ...`; re-invoking the workflow picks up from there, because
 * every completed stage is recorded and its agent is skipped.
 *
 * The alternative — letting the script decide the open questions and carry on — is what this pipeline
 * used to do, and it is worse in a specific way rather than merely less rigorous: a run that decided
 * silently produces output indistinguishable from a run that was reviewed. Halting is legible.
 */

// The reports tree is output, not workflow state: each feature gets its own folder so runs
// do not clobber each other. Mirrors the slug logic in utils/pipeline.mjs.
const slug = String(args.project || args.prd_source || "default")
  .replace(/^.*[/\\]/, "")
  .replace(/\.[A-Za-z0-9]+$/, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 60) || "default"
const OUT = `reports/${slug}`

// The design system is shared, not per-feature — see "scope": "shared" in .claude/pipeline.json.
// It is extracted once here and reused by every other feature.
const SHARED = 'reports/_shared'

/**
 * Artifacts are passed BY PATH, never by value.
 *
 * Every stage already writes a JSON artifact that the next stage is specified to read, so
 * inlining `JSON.stringify(designSystem)` into the next prompt sent the same data a second time
 * — through the context window. On a real design system or a long PRD that alone exhausts the
 * window before the agent has done any work, and it grows with every stage that "just needs the
 * previous result". Handing over the path costs a constant ~60 characters and the sub-agent reads
 * exactly the fields it needs.
 *
 * So each agent below returns a small SUMMARY (counts, status, the artifact path) rather than the
 * artifact's contents. The summaries are what this script needs for control flow; the data itself
 * stays on disk where the next agent can read it.
 */
const reads = (...paths) => paths.map(p => `  - ${p}`).join('\n')

/** Every AI stage ends the same way: validate the artifact, then record what it was built from. */
const record = stage =>
  `Finally run: node utils/pipeline.mjs done ${stage}\n` +
  `   That validates the artifact against .claude/schemas/artifacts.json and records its inputs.\n` +
  `   If it reports problems, FIX THE ARTIFACT and re-run it — do not proceed with a rejected artifact,\n` +
  `   and do not hand-edit the recorded state. If it cannot pass, stop and say why.`

/**
 * The counterpart for a gate, and deliberately the opposite instruction. `done` REFUSES a gate stage,
 * so an agent told to "record itself" the usual way would loop on a command designed to reject it.
 */
const NEVER_RECORD = `
   You are preparing a HUMAN decision, not making one. So:
   - Do NOT run \`node utils/pipeline.mjs done <gate>\` — it refuses gate stages, by design.
   - Do NOT run \`pipeline.mjs gate ... --approve\`. --by is required and "claude", "ai", "auto",
     "self" and similar are rejected: a gate signed by the thing being gated is not a gate.
   - Do NOT hand-write the signoff artifact, and do NOT pass --checked for a check nobody confirmed.
     Both of those refusals are BOUNDARIES, not controls: you can write files, so you could write the
     record directly, and nothing signs it or logs it append-only. What they buy is that closing a gate
     takes a deliberate, conspicuous act that no instruction in this run leads to. Stay on the far side
     of it.
   - Write the packet as your returned text and stop. Somebody else decides.`

const SUMMARY = (extra = {}) => ({
  type: 'object',
  required: ['artifact'],
  properties: { artifact: { type: 'string' }, ...extra },
})

/** What a gate agent reports back: state read from the CLI, plus the packet a person needs. */
const GATE_STATE = {
  type: 'object',
  required: ['state', 'reason', 'packet'],
  properties: {
    state: {
      $comment: 'Copied verbatim from the `STATE:` line of `pipeline.mjs gate <n>`. Never inferred, and never optimistic. The CLI prints exactly one of these words, so there is nothing to interpret — note that it reports "approved but a check is unconfirmed" as `awaiting`, because an approval on file is not an open gate. `stale-upstream` means an artifact the gate signed off has to be rebuilt, so the gate must be re-taken.',
      type: 'string',
      enum: ['approved', 'awaiting', 'changes_requested', 'rejected', 'malformed', 'stale-checklist', 'stale-upstream'],
    },
    reason: { type: 'string' },
    packet: { $comment: 'The gate packet in full, for the person to read. This is the deliverable of a gate agent.', type: 'string' },
    open_decisions: { type: 'array', items: { type: 'string' } },
    checks_failing: { type: 'array', items: { type: 'string' } },
    next_page: { type: 'string' },
    pages_approved: { type: 'integer' },
    pages_total: { type: 'integer' },
  },
}

/** Ask a gate where it stands, and have the packet ready in the same call. */
const readGate = (gate, phaseTitle, packetInstructions) => agent(
  `Report the state of the human gate /${gate} for feature "${slug}", and prepare its packet.

   FIRST run, and read verbatim:
     node utils/pipeline.mjs gate ${gate} --project ${slug}
   Report its state in your \`state\` field exactly as printed. Do not infer it, do not round it up to
   "approved" because the artifacts look fine, and do not treat "recorded as approved but a decision has
   no answer" — or "recorded as approved, but N of M check(s) are not confirmed" — as approved. The CLI
   already resolved both of those and said awaiting: an approval on file is not an open gate, because a
   gate opens only when every declared check is true and every raised decision has an answer. Put the
   unconfirmed check names in \`checks_failing\` verbatim.

   THEN load the /${gate} skill with the Skill tool and build the gate packet it specifies:
${packetInstructions}
${NEVER_RECORD}`,
  { label: `${gate}:packet`, phase: phaseTitle, schema: GATE_STATE }
)

/**
 * The checks each gate declares, mirrored from .claude/pipeline.json (which is authoritative) so the
 * commands this script hands back are copy-pasteable.
 *
 * They are named because `--approve --by "<person>"` alone records the approval and leaves the gate
 * SHUT: it opens only once every declared check is true. A next_action that omitted --checked read as
 * "run this and continue", and what actually followed was a re-run that halted at the same gate with
 * an approval already on file — which looks like the tool being broken rather than like a check
 * nobody confirmed. Gate 3 declares none: its per-page decision is the check.
 */
const GATE_CHECKS = {
  'gate-1-requirements': ['atomized', 'flows_broken_to_frames', 'ambiguity_flagged', 'prd_claims_quarantined', 'screens_cover_requirements'],
  'gate-2-components': ['all_approved_components_present', 'live_nodes_and_variants_verified', 'tokens_and_variables_bound', 'naming_location_and_retirement_verified', 'no_unapproved_component_changes'],
}

/** The only honest return value when a person is needed and there is no person here. */
const halted = (gate, g, done) => ({
  status: 'awaiting_gate',
  feature: slug,
  output_dir: OUT,
  shared_dir: SHARED,
  gate: { stage: gate, state: g.state, reason: g.reason },
  packet: g.packet,
  open_decisions: g.open_decisions ?? [],
  checks_failing: g.checks_failing ?? [],
  next_action:
    `A PERSON must decide. Present the packet above, then record only the answer they give:\n` +
    `  node utils/pipeline.mjs gate ${gate} --approve --by "<person>" --checked all --project ${slug} --note "..."\n` +
    `  node utils/pipeline.mjs gate ${gate} --changes-requested|--reject --by "<person>" --project ${slug} --note "..."\n` +
    (GATE_CHECKS[gate]
      ? `--checked is not optional: this gate's checks are ${GATE_CHECKS[gate].join(', ')}, and it stays\n` +
        `CLOSED until every one is true — even with the approval recorded. Pass "all" only if the person\n` +
        `confirmed all of them; otherwise name the subset they did (--checked "a,b"), which honestly\n` +
        `leaves the gate closed. Any other name is refused with the valid list.\n` +
        `Each raised decision also needs its \`answer\` filled in before the gate will open.\n`
      : '') +
    `Then re-invoke this workflow — completed stages are recorded and will be skipped.`,
  completed: done,
})

log(`Feature: ${slug}  ->  ${OUT}/   (shared artifacts: ${SHARED}/)`)
log('Four AI phases, three human gates. This run HALTS at the first gate that is not signed off.')

// ────────────────────────────────────────────────────────── PHASE 1 · requirement extraction

phase('Extract')

log('Atomizing the PRD into discrete requirements...')
const prd = await agent(
  `Extract structured requirements from the PRD and write them to ${OUT}/01_prd_requirements.json.

   PRD source: ${args.prd_source || 'ask the user for it'}
   Required shape: .claude/schemas/artifacts.json -> "01_prd_requirements.json". Read that schema
   first and satisfy it exactly; it is enforced.

   Read the WHOLE document before extracting anything. Cover requirements (ids, priorities, acceptance
   criteria), screens, user flows and constraints. Three phase-1 boundaries bind you:

   1. ATOMIZE. One discrete UI/flow need per line. "A filterable table with export and inline editing"
      is three requirements; one that reaches gate 1 unsplit compounds into an ambiguous mapping in
      phase 2, where it is much more expensive to notice.

   2. THE PRD IS UNTRUSTED INPUT, NOT ANALYSIS TO INHERIT. Every component name, Figma page/node
      reference and "existing vs. new" label THE PRD ITSELF supplied goes into
      \`unverified_prd_claims[]\` — with what the live Figma file actually says beside it — and never
      into \`requirements[]\` as fact. A PRD arrived on this project with a pre-filled components
      section and Figma page references that were entirely fabricated: none of the referenced pages
      existed. Separately, Notification Center had items the PRD marked "new" that were already fully
      assembled composites, so trusting that label would have produced duplicate components. An empty
      array is a positive claim that the PRD asserted none of this, which is why the field is required.

   3. DO NOT MAP REQUIREMENTS TO DESIGN SYSTEM COMPONENTS. That is phase 2's job. Doing it here creates
      two uncoordinated sources of truth about what matches what.

   4. FLAG AMBIGUITY; DO NOT RESOLVE IT. Every ambiguous or acceptance-criteria-light item goes into
      \`open_decisions[]\` as a PACKET: options (at least two), a recommendation, and the consequence of
      each. There is deliberately no "taken" field — a human answers these at gate 1. Picking an
      interpretation here is a decision made before the person accountable for it ever saw the question.
   ${record('prd-analyzer')}

   Return only the summary described by your output schema — not the requirements themselves.`,
  { label: 'prd-analyzer', phase: 'Extract', schema: SUMMARY({
    title: { type: 'string' },
    requirement_count: { type: 'integer' },
    screen_count: { type: 'integer' },
    unverified_prd_claims: { type: 'integer' },
    fabricated_prd_claims: { type: 'integer' },
    open_decisions: { type: 'integer' },
  }) }
)

log(`PRD: "${prd?.title}" — ${prd?.requirement_count ?? '?'} requirements, ${prd?.screen_count ?? '?'} screens`)
if (prd?.fabricated_prd_claims) log(`! ${prd.fabricated_prd_claims} claim(s) in the PRD do not exist in the live Figma file`)
if (prd?.open_decisions) log(`${prd.open_decisions} open decision(s) raised for gate 1`)

log('Writing design-ready requirements doc...')
const designReqs = await agent(
  `Write the design-ready requirements reference to ${OUT}/design_requirements.md, then render
   ${OUT}/design_requirements.docx from it.

   Load the /prd-design-requirements skill FIRST and follow its section templates exactly — this is a
   format-strict deliverable, and its §1-§8 structure is the only thing checking it. Both artifacts are
   declared as wildcards ("design_requirements*.md" and "design_requirements*.docx"), so they are
   existence-checked, NOT schema-checked: nothing downstream will catch a section you skipped, a graph
   you left out, or a .docx that is really renamed markdown.

   The .md is the SOURCE OF RECORD — the file screen-planner, closure-reporter and
   requirements-to-prototype read. The .docx is THE DELIVERABLE the human reviews at gate 1: same facts,
   same order, same wording, as a categorized Word document — table of contents, styled §1-§8 headings,
   Word tables for §3's personas and §6's per-frame components, and §4's flows plus §5-§6's
   pages/components drawn as the mermaid graphs the skill specifies, embedded as images on their own
   landscape page each. Write the markdown in full first, then render; authoring them in parallel is how
   the two drift.

   Build the .docx with the /docx skill (docx-js), render the mermaid graphs to PNG at -s 3, and VERIFY
   by converting to PDF and looking at the pages. Do not hand-roll OOXML, and never write markdown to a
   .docx filename. Render locally — phase 1 writes NOTHING to Figma, so do not reach for
   generate_diagram.

   Read your inputs from disk:
${reads(`${OUT}/01_prd_requirements.json`)}

   That is the WHOLE list. Do NOT read 05_design_system.json or 02_figma_state.json, and do not make
   any Figma call — both are phase-2 artifacts that do not exist yet at this point in the run.

   §8 RAISES the open decisions; it does NOT take them. This reverses what this stage used to do, and
   the reason matters: taking a defensible default was correct when nothing could stop to ask, and is
   wrong now that gate 1 exists — a default recorded here is a decision made before the person
   accountable for it saw the question. So each §8 item lists its options, a RECOMMENDED option, and
   the consequence of each. Gate 1 will not open while any of them is unanswered.

   Do NOT write 14_closure_notes.json. /closure-reporter owns that ledger; §8 plus the gate 1 record
   is what it reads.

   §6 names the components each frame NEEDS and makes NO claim about whether the design system already
   has them. Do not mark anything existing or new, do not name a design-system page, and do not shade
   the page-component graph by existing/new — this phase has not looked at the library, so any such
   claim would be a guess formatted as a finding. /component-analyzer answers existence in phase 2
   against its mapping_table, recording the variants it actually checked per requirement. Never carry
   over an "existing vs. new" label the PRD supplied either: those sit in 01_prd_requirements.json's
   unverified_prd_claims[] precisely because they have proven unreliable — name the component as a need
   and leave existence open.
   ${record('prd-design-requirements')}

   Return only the summary described by your output schema.`,
  { label: 'prd-design-requirements', phase: 'Extract', schema: SUMMARY({
    frame_count: { type: 'integer' },
    persona_count: { type: 'integer' },
    component_count: { type: 'integer' },
    decisions_raised: { type: 'integer' },
  }) }
)

log(`Design requirements: ${designReqs?.frame_count ?? '?'} frames, ${designReqs?.persona_count ?? '?'} personas, ${designReqs?.component_count ?? '?'} component(s) needed, ${designReqs?.decisions_raised ?? 0} decision(s) raised for gate 1`)

// The LAST stage of phase 1, and it sits in FRONT of gate 1 deliberately. 03_screen_plans.json is an
// interpretation of the PRD that nearly all of phase 2 derives from, so a requirement the plans never
// captured is permanently invisible to every plan-derived check afterwards — and to gate 3, since a
// requirement that produced no checklist entry produces no page to ask about. Reviewed at gate 1,
// beside the requirements it claims to cover, that omission is visible while it is still cheap.
// It reads NO Figma artifact: 02_figma_state.json is behind gate 1, and the signoff does not exist yet.
log('Creating screen plans from the extracted requirements (still phase 1 — PRD only)...')
const plans = await agent(
  `Create detailed screen plans and write them to ${OUT}/03_screen_plans.json.

   Read your inputs from disk:
${reads(
  `${OUT}/01_prd_requirements.json`,
  `${OUT}/design_requirements.md  (optional — context only, NOT authoritative)`,
)}
   Required shape: .claude/schemas/artifacts.json -> "03_screen_plans.json".

   This is PHASE 1, so read nothing else. Do NOT read 02_figma_state.json — it is a phase-2 artifact
   behind gate 1 and does not exist yet — and do NOT read G1_requirements_signoff.json, because this
   stage runs BEFORE that gate and is one of the things it signs off. Make no Figma call.

   Every required element must carry a requirement_link back to a REQ id, and every screen must
   list its states (default, loading, error, empty at minimum). Those links are what gate 1's
   screens_cover_requirements check is computed from: a requirement id that appears as no element's
   requirement_link is an omission the gate must be shown. If a requirement genuinely belongs on no
   screen, that is a decision for the gate, not a plan you quietly leave short.

   design_requirements.md carries personas, single-line flows and designer-facing frame names — prefer
   its frame names so the plan, the doc and the build all name a screen the same way. But derive the
   plans from 01_prd_requirements.json: where the two disagree the requirements win, because the doc is
   unschema'd prose. Never drop a requirement just because the doc omitted it.

   01_prd_requirements.json's open_decisions[] are UNANSWERED at this point — the human answers them at
   gate 1. Plan around each one's \`recommended\` option, and do not treat any of them as settled.
   ${record('screen-planner')}

   Return only the summary described by your output schema.`,
  { label: 'screen-planner', phase: 'Extract', schema: SUMMARY({
    screen_count: { type: 'integer' },
    requirements_unmapped: { type: 'integer' },
  }) }
)

log(`Planned ${plans?.screen_count ?? '?'} screens — ${plans?.requirements_unmapped ?? 0} requirement(s) mapped to no element`)

// ─────────────────────────────────────────────────────────────────── GATE 1 · human

phase('Gate 1')

const g1 = await readGate('gate-1-requirements', 'Gate 1', `
     - the five checks (atomized, flows_broken_to_frames, ambiguity_flagged, prd_claims_quarantined,
       screens_cover_requirements), each with your honest verdict AND the evidence for it
     - the requirement list, grouped by flow, one line each, with ids
     - the screen plans: per screen, its elements in order with the REQ id each is linked to, and its
       states — then, SEPARATELY, the requirement ids that appear in no plan. That list is the evidence
       for screens_cover_requirements and is the one thing here nobody can reconstruct later
     - every claim the PRD made about components/pages, flagged as UNVERIFIED — phase 1 read no Figma,
       so there is no live-file column and this gate is containment, not verification
     - every open decision as a packet: options, your recommendation, the consequence of each
     - what you would send back, if anything

     If the person corrects a requirement BY HAND, that is changes_requested, not an approval: the
     screen plans already exist and were built from the superseded text.`)

log(`Gate 1: ${g1?.state} — ${g1?.reason}`)
if (g1?.state !== 'approved') {
  log('HALTING at gate 1. Requirements and screen plans need a human sign-off before phase 2 may start.')
  return halted('gate-1-requirements', g1, ['design-system-loader', 'figma-extractor', 'prd-analyzer', 'prd-design-requirements', 'screen-planner'])
}

// ────────────────────────────────────────────────────────────── PHASE 2 · live inspection — behind gate 1

phase('Inspect')

// Every claim the later phases make about what exists has to resolve against the live file rather
// than a memory of it, and this is where that file is read. It sits AFTER gate 1 deliberately: phase 1
// is the PRD and nothing else, so nothing before the gate needs either of these artifacts.
// `/figma-extractor` is per-feature and takes a real dependency on gate 1. `/design-system-loader` is
// shared, so it cannot depend on a per-feature gate and carries no gate edge — it is sequenced here
// because this is where its output is first needed, not because anything blocks it.
log('Loading design system reference (shared across features)...')
const ds = await agent(
  `Load the design system and write it to ${SHARED}/05_design_system.json.

   Source: ${args.design_system_url || 'ask the user for it'}
   Required shape: .claude/schemas/artifacts.json -> "05_design_system.json".

   This artifact is SHARED across features, not per-feature — create its folder with
   \`node utils/pipeline.mjs path --stage design-system-loader --ensure\` and write it there.
   Capture the component hierarchy (categories -> components -> variants/properties) and the
   design tokens (colors, typography, spacing at minimum).

   DESCEND INTO COMPONENT SETS. Do not stop at their top level, and do not rely on
   search_design_system alone: it searches PUBLISHED libraries only, while most in-house systems keep
   components directly on a file's own pages, and nested children never surface in it at all. The bell
   icon was once reported missing from Icons/General while sitting inside the "Notification Bill"
   component set — a loader that records only promoted top-level components hands phase 2 a library in
   which those components do not exist, and phase 2 then declares a gap that is not real.
   ${record('design-system-loader')}

   Return only the summary described by your output schema.`,
  { label: 'design-system-loader', phase: 'Inspect', schema: SUMMARY({
    name: { type: 'string' },
    component_count: { type: 'integer' },
    nested_components_found: { type: 'integer' },
  }) }
)

log(`Design system: ${ds?.name} — ${ds?.component_count ?? '?'} components${ds?.nested_components_found ? ` (${ds.nested_components_found} nested inside component sets)` : ''}`)

log('Extracting Figma design state...')
const figma = await agent(
  `Extract the current design state from the Figma file and write it to ${OUT}/02_figma_state.json.

   Figma file: ${args.figma_url}
   Required shape: .claude/schemas/artifacts.json -> "02_figma_state.json".

   List every page and frame, the components each frame uses, and the file's component inventory.
   Keep the artifact to the fields the schema names — do not dump raw Figma node trees into it,
   they are enormous and nothing downstream reads them.
   ${record('figma-extractor')}

   Return only the summary described by your output schema.`,
  { label: 'figma-extractor', phase: 'Inspect', schema: SUMMARY({
    file_name: { type: 'string' },
    page_count: { type: 'integer' },
    component_count: { type: 'integer' },
  }) }
)

log(`Figma: ${figma?.file_name} — ${figma?.page_count ?? '?'} pages, ${figma?.component_count ?? '?'} components`)

// ──────────────────────────────────────────────────────── PHASE 2 · design system mapping

phase('Map')

log('Validating screen plans against PRD...')
const validation = await agent(
  `Validate the screen plans against the PRD and write the result to ${OUT}/04_screen_validation.json.

   Read your inputs from disk:
${reads(`${OUT}/01_prd_requirements.json`, `${OUT}/03_screen_plans.json`)}
   Required shape: .claude/schemas/artifacts.json -> "04_screen_validation.json".

   Report every requirement with no corresponding UI element as an issue. Set status to
   "needs_revision" if any critical requirement is uncovered, otherwise "approved".
   ${record('screen-validator')}

   Return only the summary described by your output schema.`,
  { label: 'screen-validator', phase: 'Map', schema: SUMMARY({
    status: { type: 'string' },
    issue_count: { type: 'integer' },
    coverage_percentage: { type: 'number' },
  }) }
)

log(validation?.status === 'needs_revision'
  ? `! Screen plans need revision — ${validation.issue_count ?? '?'} issue(s), ${validation.coverage_percentage ?? '?'}% of requirements covered`
  : `Screen plans approved — ${validation?.coverage_percentage ?? '?'}% of requirements covered`)

log('Mapping every requirement to the design system...')
const components = await agent(
  `Map every atomized requirement to the design system and write the result to
   ${OUT}/06_component_analysis.json.

   Read your inputs from disk:
${reads(`${SHARED}/05_design_system.json  (shared)`, `${OUT}/03_screen_plans.json`, `${OUT}/01_prd_requirements.json`)}
   Required shape: .claude/schemas/artifacts.json -> "06_component_analysis.json". Note that
   \`mapping_table\` is REQUIRED: ONE ROW PER ATOMIZED REQUIREMENT, not one per component. The coverage
   bucket arrays cannot replace it — they lose the requirement, so a requirement never mapped at all is
   invisible in them, and "every requirement appears in the table" is gate 2's first success criterion.

   Give every requirement exactly one of four statuses: direct-match, match-with-modification,
   combinable-match, no-match. Then, per row, the evidence — and the two statuses below have been wrong
   on this project, so each needs its own:

   - A DIRECT MATCH is a claim about variants, states, icon support and content behaviour. "It's a
     button" has never been sufficient. Record what you actually checked in evidence.variants_checked.
     A direct match asserted from family resemblance only surfaces as wrong during assembly, after the
     checklist was signed off.

   - A NO-MATCH reached from an empty keyword search is INVALID. Walk nested component-set children
     directly before declaring a gap real; gate 2 rejects evidence.method "keyword-search-only". The
     bell icon was declared missing from Icons/General while sitting inside the "Notification Bill"
     component set.

   Never invent a component name: every name here must resolve in the live file. Keep whatever the PRD
   claimed in \`prd_label_was\`, beside your verified answer, rather than treating it as input.

   ESCALATE, DO NOT DESIGN AROUND. When the mismatch is really a product decision — a taxonomy or
   data-model conflict — fill in \`escalation\` and let gate 2 answer it. The kind/category conflict
   against the "Notification Types" component was correctly escalated. Customizable Dashboards had no
   data-bound chart-rendering component at all, blocking multiple frames: mark that kind of thing
   \`systemic\`. Forcing a combinable match that does not really hold ships the conflict into the build.

   Design system state has a shelf life: if 05_design_system.json was cached a while ago, re-verify the
   claims you are relying on. A Reconnecting banner was recorded as having no adequate Alert state, and
   a later look found an Alerts -> State=Info variant had since been added.
   ${record('component-analyzer')}

   Return only the summary described by your output schema.`,
  { label: 'component-analyzer', phase: 'Map', schema: SUMMARY({
    requirements_mapped: { type: 'integer' },
    direct_matches: { type: 'integer' },
    no_matches: { type: 'integer' },
    escalations: { type: 'integer' },
    not_covered_count: { type: 'integer' },
  }) }
)

log(`Mapping: ${components?.requirements_mapped ?? '?'} requirement(s) mapped — ${components?.direct_matches ?? 0} direct, ${components?.no_matches ?? 0} no-match${components?.escalations ? `, ${components.escalations} escalated to gate 2` : ''}`)

log('Calculating coverage metrics...')
const scores = await agent(
  `Score design system coverage and write TWO artifacts:
     ${OUT}/07_coverage_scores.json  and  ${OUT}/09_gap_analysis.json

   Read your inputs from disk:
${reads(`${OUT}/01_prd_requirements.json`, `${OUT}/03_screen_plans.json`, `${OUT}/06_component_analysis.json`)}
   Required shapes: .claude/schemas/artifacts.json -> "07_coverage_scores.json" and
   "09_gap_analysis.json". Both are required; the stage is not done until both validate.

   Compute the overall percentage as a weighted score over components, states, interactions and
   tokens, and show the per-screen breakdown. Sort gaps into critical/medium/low by how many
   screens they block. A row in mapping_table carrying an \`escalation\` is NOT a component gap —
   it is a product decision for gate 2, and scoring it as a gap would hide it behind a number.
   ${record('coverage-scorer')}

   Return only the summary described by your output schema.`,
  { label: 'coverage-scorer', phase: 'Map', schema: SUMMARY({
    overall_percentage: { type: 'number' },
    critical_gap_count: { type: 'integer' },
  }) }
)

log(`Coverage score: ${scores?.overall_percentage ?? '?'}% — ${scores?.critical_gap_count ?? 0} critical gap(s)`)

// No design-system critique here on purpose. /evaluate-design-system grades the LIBRARY — its own
// audience, its own cadence — and is marked "standalone" in .claude/pipeline.json, so no orchestrator
// runs it. It used to be a hard dependency of figma-modifier, which meant every PRD run dragged a full
// library critique along with it. Invoke it directly when you want to know if the library is good.

log('Generating coverage report...')
const report = await agent(
  `Generate the coverage report and write the roadmap to ${OUT}/10_roadmap.json.

   Read your inputs from disk:
${reads(
  `${OUT}/01_prd_requirements.json`,
  `${OUT}/03_screen_plans.json`,
  `${OUT}/04_screen_validation.json`,
  `${OUT}/06_component_analysis.json`,
  `${OUT}/07_coverage_scores.json`,
  `${OUT}/09_gap_analysis.json`,
)}
   Sections: executive summary, requirement checklist, screen plans, the requirement -> component
   mapping table with its four statuses, gap analysis with priorities, escalated product decisions,
   phased roadmap.

   Save the report as ${OUT}/coverage_report_<YYYY-MM-DD>.pdf. If PDF generation is unavailable,
   write ${OUT}/coverage_report_<YYYY-MM-DD>.html instead — either is a real report, and the
   pipeline accepts both. The roadmap must match .claude/schemas/artifacts.json -> "10_roadmap.json".
   ${record('coverage-reporter')}

   Return only the summary described by your output schema.`,
  { label: 'coverage-reporter', phase: 'Map', schema: SUMMARY({
    report_path: { type: 'string' },
    phase_count: { type: 'integer' },
  }) }
)

log(`Report: ${report?.report_path}`)

// Phase 2's last stage. It produces the BUILD CHECKLIST that gate 2 signs off — and writes nothing
// into Figma, because phase 2 is analysis only. Not gated on the gap count: it used to be, and that
// was a real bug once screens entered the spec, since a feature the library already covers has zero
// component gaps and still has every screen to assemble. 03_screen_plans.json always holds at least
// one plan, so there is always work here.
const criticalGaps = scores?.critical_gap_count ?? 0
log(criticalGaps > 0
  ? `Speccing ${criticalGaps} missing component(s) in the design system's idiom, plus the screens...`
  : 'No component gaps — the library covers this feature; speccing its screens...')

const spec = await agent(
  `Spec what this feature needs built in Figma — the missing COMPONENTS and the SCREENS they
   assemble into — and write it to ${OUT}/11_build_phase.json. THIS ARTIFACT IS THE BUILD CHECKLIST
   THAT GATE 2 SIGNS OFF.

   Read your inputs from disk:
${reads(
  `${OUT}/09_gap_analysis.json  (this feature's gaps — the COMPONENT work list)`,
  `${OUT}/06_component_analysis.json  (mapping_table: per-requirement status, evidence and resolution_path; and coverage_analysis.required_by_screens for the element -> component binding)`,
  `${OUT}/03_screen_plans.json  (the SCREEN work list: layout, ordered elements, per-screen states)`,
  `${SHARED}/05_design_system.json  (shared — the system to build INSIDE: existing components, variant axes, tokens)`,
  `${OUT}/02_figma_state.json  (what already exists — extend it, do not duplicate it)`,
  `${OUT}/10_roadmap.json  (priority order)`,
)}
   Target Figma file: ${args.figma_url}
   Required shape: .claude/schemas/artifacts.json -> "11_build_phase.json".

   WRITE NOTHING INTO FIGMA. Phase 2 is analysis only; construction is phase 3, behind gate 2. That
   boundary is held by the dependency graph rather than by your restraint, but do not test it.

   RESOLVE EVERY GAP IN THIS ORDER OF PREFERENCE: extend an existing component -> combine existing
   components -> net-new. Record which in \`resolution_path\` and why-not-the-cheaper-one in
   \`resolution_rationale\`. "Nothing existed" only justifies net-new once 06_component_analysis.json
   records the nested-children walk that established it — absence from a keyword search is not absence
   from the file.

   PREFER SLOT-BASED, SYSTEM-WIDE REUSABLE ARCHITECTURE. Set \`architecture\`, and justify
   \`module-specific\` in \`scope_rationale\` when you choose it. A component built for this feature
   alone is one the next feature rebuilds.

   HONOUR EARLIER NAMING AND RETIREMENT DECISIONS. A component that was renamed or retired stays that
   way; set \`respects_retirement_decisions\`. Reaching for the old name because it is convenient is
   how a retired component comes back.

   COMPOSE FROM THE FIRST LAYER. design_system.categories is keyed by layer (Atoms, Molecules,
   Organisms, or whatever this library calls its tiers). Assemble each missing component out of the
   primitives that already exist — a DatePicker is a text Input plus an IconButton inside a Popover
   surface, not a new rectangle with a hand-placed calendar. Name those existing components in
   based_on and describe the anatomy as a composition of them. If a needed primitive does not exist,
   that is a finding for actions_log, and the primitive is the thing to build first.

   Then derive variant axes and EVERY state (default, hover, focus, active, disabled, loading,
   error, empty) from how comparable components in the same layer are already built — match their
   naming and spacing rhythm. But read a systemic absence as a decision, not a precedent: if nothing
   in the library has a focus state, fix that in what you build rather than copying the omission into
   every new component, and note it in actions_log so the choice is visible.

   Bind tokens BY NAME from the design system and check each one resolves. A token that does not
   exist is a finding for actions_log, never a raw hex substitution — unresolved tokens are how a
   "built" component ends up off-system.

   THEN SPEC THE SCREENS — one "screens" entry per screen_plans[].name, with the name kept identical
   so each screen stays traceable to the requirements it satisfies AND so gate 3's page roster,
   seeded from this array, names the same pages. This half exists because 09_gap_analysis.json is a
   LOSSY projection of the screen plans: it keeps component names and discards layout, element order,
   per-screen states and flows. Fed only the gaps, this stage cannot assemble a screen — which is why
   the pipeline used to end with a freshly populated component library and not one screen built from it.

   For each screen: carry layout and states across from the plan, list elements IN LAYOUT ORDER,
   and bind every planned element to a real component BY NAME using
   06_component_analysis.json's coverage_analysis.required_by_screens — falling back to a component
   from your own components array when the element is one of the gaps you just specced, marked
   from_this_build: true. A planned element must become an INSTANCE of a named component, never a
   fresh frame; a screen drawn from rectangles is off-system however right it looks. An element you
   cannot bind to any component, existing or newly specced, is a finding for actions_log — it means
   the mapping missed something. Do not silently drop a screen.

   Lay screens out with TOKENS, not numbers (spacing.md, not 16) — same rule as the components, and
   a screen of on-system components with hand-typed gaps is still off-system. Spec a frame per
   screen-level state, not only the default.

   Screens are specced here but ASSEMBLED ONE AT A TIME in phase 3, after the component pass, because
   a screen is made of component instances that do not exist as nodes yet. So bind by name and do not
   try to read 12_figma_build.json — it is downstream of you.
   ${record('figma-modifier')}

   Return only the summary described by your output schema.`,
  { label: 'figma-modifier', phase: 'Map', schema: SUMMARY({
    component_count: { type: 'integer' },
    screen_count: { type: 'integer' },
    extends_existing: { type: 'integer' },
    module_specific: { type: 'integer' },
    unbound_elements: { type: 'integer' },
    unresolved_tokens: { type: 'integer' },
  }) }
)

log(`Build checklist: ${spec?.component_count ?? 0} component(s), ${spec?.screen_count ?? 0} screen(s)${spec?.extends_existing ? ` — ${spec.extends_existing} extending existing` : ''}${spec?.module_specific ? ` — ${spec.module_specific} module-specific` : ''}${spec?.unresolved_tokens ? ` — ${spec.unresolved_tokens} unresolved token(s)` : ''}${spec?.unbound_elements ? ` — ${spec.unbound_elements} unbound element(s)` : ''}`)

// ─────────────────────────────────────────── PHASE 2 (cont.) · the component pass only
//
// Phase 2 has ONE gate, and it reviews the components as they exist in Figma rather than the
// checklist that specified them. So the component pass runs BEFORE that gate, not behind it: these
// writes are unreviewed, and correcting a wrong component means sending this stage back rather than
// having caught it in a plan. What the gate still governs is whether any component may be USED —
// nothing is assembled out of a component nobody has inspected.

phase('Components')

// screen-planner is NOT here: it is phase 1 now, and is listed with the phase-1 stages in every
// `halted(...)` completed-set alongside prd-analyzer / prd-design-requirements.
const PHASE_2_DONE = ['screen-validator', 'component-analyzer', 'coverage-scorer', 'coverage-reporter', 'figma-modifier']

if (!spec || ((spec.component_count ?? 0) === 0 && (spec.screen_count ?? 0) === 0)) {
  log('Nothing in the approved checklist to build — skipping phase 3.')
  return {
    status: 'nothing_to_build', feature: slug, output_dir: OUT, shared_dir: SHARED,
    note: 'The gate-2-approved checklist listed neither components nor screens. That is a /figma-modifier defect, not an empty module: 03_screen_plans.json always holds at least one plan.',
  }
}

log('Building the specified components only — no screens. Gate 2 inspects them before any page.')
const componentPass = await agent(
  `Build the specified components into the Figma file at: ${args.figma_url}
   This is the COMPONENT PASS ONLY. Do not assemble a single screen in this call.

   FIRST, invoke the /figma:figma-use skill with the Skill tool. It is mandatory before any use_figma
   call — never call use_figma without loading it first; it carries the Plugin API contract.

   Then read your inputs from disk:
${reads(
  `${OUT}/11_build_phase.json  (the build checklist — build only what is on it)`,
  `${OUT}/06_component_analysis.json  (read \`escalation\` on any row: an unanswered product decision is
    NOT yours to resolve — surface it in the gate 2 packet)`,
  `${SHARED}/05_design_system.json  (tokens to apply)`,
)}
   Build \`figma_modifications.components\`, one use_figma call per component so a single failure does
   not lose the rest. Build what the spec describes: its anatomy as the layer structure, a Figma
   component set with the specified variant properties, and EVERY state, not just the default. Bind
   design tokens and variables; never hardcode a value where a token exists for that purpose.

   BUILD NOTHING THAT IS NOT ON THE CHECKLIST. Set \`gate_2_approved\` on each built component to
   record whether it came from the checklist. If building reveals a gap the checklist missed, STOP and
   record it in \`discovered_gaps\` with action "stopped-and-flagged" — do not improvise a fix. An
   improvised component is indistinguishable from a specified one once it is in the file, and gate 2
   is the only place a person will see the difference, so it has to arrive there as a flagged item.

   If a component cannot be built as specified, record it under "failed" with a reason and kind
   "component". Never substitute a simplified version and report it as "built".

   Respect AUTO_CREATE_COMPONENTS: if it is false, present the plan and ask before writing anything.

   Write ${OUT}/12a_figma_components.json, matching
   .claude/schemas/artifacts.json -> "12a_figma_components.json". This is the COMPONENT pass's own
   artifact, separate from 12_figma_build.json, and the separation is what gate 2 reviews: it is the
   live-Figma evidence that each approved component actually exists, with the right variants, bound to
   the right tokens, in the right library location. Record something as built ONLY if use_figma
   confirmed it, and include each node id — gate 2 resolves them against the live file.

   /figma:figma-use is external and will not write this artifact, so the pipeline only has a record of
   the build if you write it. Then record THIS stage — not the page stage:
     node utils/pipeline.mjs done figma-component-pass --project ${slug}
   \`done figma-use\` would record the wrong stage: both load /figma:figma-use, but they are separate
   stages with separate artifacts, and the component pass is addressed by its own key.

   Do NOT seed the gate-3 page roster here, and do NOT assemble a page. Gate 2 comes first.

   Return only the summary described by your output schema.`,
  { label: 'figma-component-pass', phase: 'Components', schema: SUMMARY({
    built: { type: 'integer' },
    failed: { type: 'integer' },
    discovered_gaps: { type: 'integer' },
  }) }
)

log(`Components: ${componentPass?.built ?? 0} built${componentPass?.failed ? `, ${componentPass.failed} failed` : ''}${componentPass?.discovered_gaps ? ` — ${componentPass.discovered_gaps} gap(s) the checklist missed, flagged not improvised` : ''}`)

// ─────────────────────────────────────────────────────────────────── GATE 2 · human
//
// The one gate closing phase 2, and it reviews REAL NODES. A component that looked right in the
// checklist can still be misnamed, missing a variant, unbound from its tokens, or sitting in the wrong
// library location once it actually exists. Every one of those is invisible in a plan, cheap to fix
// now, and — once a page is assembled from the instances — behind a screen that looks finished.

phase('Gate 2')

const PHASE_2_BUILT = [...PHASE_2_DONE, 'figma-component-pass']

const g2 = await readGate('gate-2-components', 'Gate 2', `
     - the five checks (all_approved_components_present, live_nodes_and_variants_verified,
       tokens_and_variables_bound, naming_location_and_retirement_verified,
       no_unapproved_component_changes), each with your verdict AND the live evidence for it
     - every component built, by name, with its node id and a link to the live node
     - its variants as they EXIST IN FIGMA, against the variants the checklist specified
     - the tokens each one binds, and any value that ended up hardcoded
     - anything on the approved checklist that is NOT in the file, and anything in the file that was
       NOT on the checklist
     - every discovered_gaps entry, with the page assembly it will block
     - any unanswered product-level escalation from 06_component_analysis.json: no check names it and
       no gate refuses to open while it is open, so if it is not raised here it surfaces only in the
       closure report, after the module is built`)

log(`Gate 2: ${g2?.state} — ${g2?.reason}`)
if (g2?.state !== 'approved') {
  log('HALTING at gate 2. The components are inspected before any page is assembled from them.')
  return halted('gate-2-components', g2, ['design-system-loader', 'figma-extractor', 'prd-analyzer', 'prd-design-requirements', 'screen-planner', ...PHASE_2_BUILT])
}

// ────────────────────────────────────────── PHASE 3B · screen assembly, one page at a time

phase('Assemble')

log('Components signed off. Seeding the per-page roster from the approved checklist...')
const roster = await agent(
  `Seed the gate-3 page roster for feature "${slug}", and nothing else.

   Run:
     node utils/pipeline.mjs gate 3 --init --project ${slug}

   \`--init\` refuses unless phase 2 is finished AND gate 2 is approved, and it validates
   11_build_phase.json against its schema before it reads the page names — refusing a screen with no
   name, or two screens whose names differ only in case. A nameless page can never be signed off and a
   case-only duplicate makes one of the two unreachable, either of which leaves gate 3 permanently
   unsatisfiable. If it refuses, the fix is upstream in /figma-modifier's checklist, which then needs
   gate 2 again because the checklist changed: do NOT rename pages here, and do NOT hand-write the
   roster.

   If re-seeding reports that a recorded decision was DROPPED because its page left the checklist,
   report that warning VERBATIM in \`warning\` rather than continuing — a page that quietly leaves the
   roster leaves the module reading as fully approved without it.

   Do not assemble anything and do not record any gate decision.`,
  { label: 'gate-3-pages:init', phase: 'Assemble', schema: {
    type: 'object',
    required: ['pages_total'],
    properties: {
      pages_total: { type: 'integer' },
      preserved_decisions: { type: 'integer' },
      warning: { type: 'string' },
      refused: { $comment: 'The refusal text, if --init declined. A refusal is a real answer, not an error to work around.', type: 'string' },
    },
  } }
)

if (roster?.refused) {
  log(`HALTING — the page roster could not be seeded: ${roster.refused}`)
  return {
    status: 'blocked', feature: slug, output_dir: OUT, shared_dir: SHARED,
    reason: roster.refused,
    next_action: 'Fix /figma-modifier\'s checklist, take gate 2 again (the checklist changed), then re-invoke.',
    completed: ['design-system-loader', 'figma-extractor', 'prd-analyzer', 'prd-design-requirements', 'screen-planner', ...PHASE_2_BUILT],
  }
}
if (roster?.warning) log(`! ${roster.warning}`)
log(`Roster: ${roster?.pages_total ?? '?'} page(s)${roster?.preserved_decisions ? `, ${roster.preserved_decisions} existing decision(s) preserved` : ''}`)

/**
 * ONE PAGE, THEN STOP.
 *
 * This loop runs at most one page per invocation of the workflow, and that is the single hard rule of
 * the pipeline made structural: phase 3 never advances past an unapproved page. Building page N+1
 * before N is signed off is not a shortcut — the designer's feedback on N routinely changes N+1, so
 * the work would be thrown away, and worse, a batch of pages presented together gets one collective
 * nod instead of the individual decisions the gate is for.
 */
phase('Gate 3')

const nextPage = await agent(
  `Report the ONE page phase 3 may work on for feature "${slug}".

   Run and read verbatim:
     node utils/pipeline.mjs next-page --project ${slug}
     node utils/pipeline.mjs pages --project ${slug}

   Report exactly what they say. If \`pages\` warns OUT OF ORDER, pass that through in \`warning\` —
   an approval recorded while an earlier page was still pending is the footprint of assembly having
   run ahead, and it is the only evidence of that after the fact.

   If either command prints "STOP — /gate-2-components is ..." then gate 2 is not signed off and NO page
   may be built: \`next-page\` exits non-zero and names nothing. Report that STOP as your \`warning\`
   and name no page. Do not pick one from 11_build_phase.json instead.

   Do not assemble anything and do not record any gate decision in this call.`,
  { label: 'gate-3-pages:next', phase: 'Gate 3', schema: {
    type: 'object',
    required: ['done', 'pages_total', 'pages_approved'],
    properties: {
      done: { $comment: 'True only when every page is approved.', type: 'boolean' },
      page: { type: 'string' },
      status: { type: 'string', enum: ['pending', 'changes_requested', 'rejected'] },
      what_to_fix: { type: 'string' },
      manually_edited: { type: 'boolean' },
      pages_total: { type: 'integer' },
      pages_approved: { type: 'integer' },
      warning: { type: 'string' },
    },
  } }
)

if (nextPage?.warning) log(`! ${nextPage.warning}`)

if (!nextPage?.done) {
  const p = nextPage?.page
  log(`Page ${(nextPage?.pages_approved ?? 0) + 1} of ${nextPage?.pages_total ?? '?'}: "${p}" (${nextPage?.status})`)

  const pageBuild = await agent(
    `Assemble EXACTLY ONE page — "${p}" — into the Figma file at: ${args.figma_url}, then STOP.

     Do not touch any other page. \`next-page\` named this one and listed the rest under NOT YET;
     working ahead on them is the one thing phase 3 forbids.

     FIRST invoke /figma:figma-use with the Skill tool, and load /gate-3-pages too — it specifies what
     to present.

     Read your inputs from disk:
${reads(
  `${OUT}/11_build_phase.json  (find the \`screens\` entry named "${p}")`,
  `${OUT}/12a_figma_components.json  (what the component pass actually built, with node ids — check before you place)`,
  `${OUT}/G2_component_signoff.json  (the component signoff; any deviation the reviewer approved at gate 2 is recorded there)`,
  `${OUT}/12_figma_build.json  (only exists once a page has been assembled — absent on the first page)`,
  `${OUT}/G3_page_signoffs.json  (this page's history: previous rounds, notes, manually_edited)`,
  `${SHARED}/05_design_system.json  (tokens)`,
  `${OUT}/01_prd_requirements.json  (the requirement this page implements — quote it when presenting)`,
)}
     ${nextPage?.status === 'pending' ? 'This is a first build.' : `This page came back as ${nextPage.status}. REVISE it — do not rebuild from scratch — addressing: ${nextPage?.what_to_fix || '(see its notes in the signoff record)'}`}
     ${nextPage?.manually_edited ? 'The designer EDITED THIS FRAME BY HAND. Re-inspect it live before changing anything; your last-known state is out of date, and a spec built from a remembered frame is the phase-4 failure mode.' : ''}

     Place each element as an INSTANCE of its named component — resolve the name against the library
     and against what the component pass built — and apply the layout TOKENS. Build a frame per
     screen-level state, not only the default.

     Check this page's elements against the component pass FIRST. If an element's component landed in
     "failed", this page is BLOCKED: record it under "failed" with kind "screen" and a reason naming
     the missing component. Do NOT assemble around the hole and report it as built — the checklist
     named that component on the assumption it would build, and this is the only place that assumption
     gets checked. A page assembled with some elements missing is status "partial" with a note.

     THREE BOUNDARIES: use only checklist-approved components (a gap the checklist missed goes in
     \`discovered_gaps\` with action "stopped-and-flagged" — stop, do not improvise); bind tokens and
     never hardcode where one exists; honour earlier naming and retirement decisions.

     Then write ${OUT}/12_figma_build.json, matching
     .claude/schemas/artifacts.json -> "12_figma_build.json". This file belongs to the PAGE passes: on
     the first page you create it, and on every later page you APPEND to it without discarding the
     pages already recorded. Carry \`built\` across from 12a_figma_components.json so the artifact says
     which components these instances came from, put this page in \`screens_built\` with
     \`tokens_applied\` and \`presented_at\`, set \`current_page\` to "${p}", and remove "${p}" from
     \`pages_remaining\` — which starts as every screen name in the checklist.

     It is written INCREMENTALLY, once per page, and that is deliberate: a single end-of-run write
     could only exist after every page was built, which is the state gate 3 exists to prevent, so it
     would have made the per-page gate unenforceable and left a crashed run with no record of the
     pages that did build.

     Then record the page stage — \`node utils/pipeline.mjs done figma-use --project ${slug}\`. That
     is a DIFFERENT stage from the component pass: both load /figma:figma-use, but they have separate
     artifacts and separate keys, so \`done figma-component-pass\` here would record the wrong one.

     Finally, PRESENT THE PAGE as /gate-3-pages specifies — the live frame link and node_id, the
     requirement it implements quoted, every component instance placed and whether each was on the
     checklist, the tokens bound, ANY value you had to hardcode, and anything you could not build.
     Put all of that in your \`presentation\` field.
${NEVER_RECORD}`,
    { label: `assemble:${p}`, phase: 'Assemble', schema: {
      type: 'object',
      required: ['page', 'status', 'presentation'],
      properties: {
        page: { type: 'string' },
        status: { type: 'string', enum: ['built', 'partial', 'blocked'] },
        node_id: { type: 'string' },
        figma_url: { type: 'string' },
        presentation: { $comment: 'The gate-3 packet for this one page. This is the deliverable.', type: 'string' },
        tokens_applied: { type: 'boolean' },
        hardcoded_values: { type: 'array', items: { type: 'string' } },
        off_checklist_components: { type: 'array', items: { type: 'string' } },
        discovered_gaps: { type: 'array', items: { type: 'string' } },
      },
    } }
  )

  log(`Page "${p}": ${pageBuild?.status}${pageBuild?.hardcoded_values?.length ? ` — ${pageBuild.hardcoded_values.length} hardcoded value(s)` : ''}${pageBuild?.off_checklist_components?.length ? ` — ${pageBuild.off_checklist_components.length} off-checklist component(s)` : ''}`)
  log(`HALTING at gate 3. "${p}" needs its own sign-off before any other page is touched.`)

  return {
    status: 'awaiting_gate',
    feature: slug, output_dir: OUT, shared_dir: SHARED,
    gate: { stage: 'gate-3-pages', state: 'awaiting', reason: `page "${p}" is built and awaiting its own decision` },
    page: {
      name: p, build_status: pageBuild?.status ?? null,
      node_id: pageBuild?.node_id ?? null, figma_url: pageBuild?.figma_url ?? null,
      hardcoded_values: pageBuild?.hardcoded_values ?? [],
      off_checklist_components: pageBuild?.off_checklist_components ?? [],
      discovered_gaps: pageBuild?.discovered_gaps ?? [],
    },
    packet: pageBuild?.presentation,
    progress: `${nextPage?.pages_approved ?? 0}/${nextPage?.pages_total ?? '?'} pages approved`,
    next_action:
      `A PERSON must decide on THIS page before the next one is built:\n` +
      `  node utils/pipeline.mjs gate 3 --page "${p}" --approve|--changes-requested|--reject --by "<person>" --project ${slug} --note "..."\n` +
      `Add --manually-edited if they edited the frame themselves. This gate declares no checks, so\n` +
      `there is no --checked here — the per-page decision is the check.\n` +
      `Then re-invoke this workflow: it will assemble the next page, one page at a time, until every ` +
      `page is approved.`,
  }
}

log(`All ${nextPage?.pages_total} page(s) approved — phase 3 is complete.`)

// Phase 3 ends here, at gate 3, and nothing re-reads the built module as a whole after it. There used
// to be a /prd-auditor stage that read the live Figma file at full depth against the PRD and looped
// back through gate 2 while gaps remained; it was removed deliberately. State the consequence rather
// than letting it be discovered: every remaining check in this pipeline measures INTENT — plans scored
// against the library — and the only comparison against what was actually BUILT is the human decision
// taken at gate 3, one page at a time. A requirement dropped in phase 2 now has no downstream stage
// that can still catch it.

// ──────────────────────────────────────────────────────────── PHASE 4 · handoff and closure

phase('Handoff')

const handoff = await agent(
  `Produce the developer handoff package for feature "${slug}": ${OUT}/15_developer_handoff.json and
   ${OUT}/handoff_<YYYY-MM-DD>.md.

   Load the /developer-handoff skill first. Figma file: ${args.figma_url}

   Read your inputs from disk:
${reads(
  `${OUT}/G3_page_signoffs.json  (every APPROVED page — each one needs a spec, no exceptions)`,
  `${OUT}/12a_figma_components.json  (every component created in the gate-2B-reviewed pass)`,
  `${OUT}/12_figma_build.json  (what was built, per page)`,
  `${OUT}/G2_component_signoff.json  (the component signoff, for change_log approved_at_gate)`,
  `${OUT}/11_build_phase.json  (the approved checklist)`,
  `${OUT}/01_prd_requirements.json  (requirement ids, for traceability)`,
  `${SHARED}/05_design_system.json  (token and component names)`,
)}
   RE-INSPECT THE LIVE FILE AND RE-VERIFY EVERY NAME. Gate 3 explicitly permits the designer to edit a
   frame by hand, so any page with \`manually_edited: true\` is a frame that changed after assembly
   last saw it — the frame you are specifying is routinely NOT the one 12_figma_build.json describes.
   Record how you read the file in verification.extraction_method, and put anything you could not
   resolve in verification.unresolved: a non-empty list means the package says it is incomplete rather
   than shipping a name engineering cannot find.

   One \`pages[]\` entry per approved page: layout, tokens bound by name, components_used (name,
   variant, props, a link to the LIVE component, Code Connect mapping where one exists), states,
   breakpoints, edge_cases, requirements_traced. \`states\` and \`edge_cases\` are required and an empty
   array is a CLAIM — behaviour approved visually but never specified (empty, error, overflow) must be
   called out explicitly, not omitted. If the empty state was never discussed, say so.

   \`change_log[]\`: every component or variant created or modified during phase 3, however small.
   Sources are 12a_figma_components.json \`built\` (the gate-2B-reviewed component pass), the
   checklist's components, and each page's \`deviations_approved\`. Each entry links to its live design-system entry and records
   \`approved_at_gate\`. A variant added mid-assembly and left out becomes invisible technical debt:
   the design system drifts out of sync with what shipped and nobody knows to look.

   FOUR THINGS NOT TO DO: introduce or reinterpret a design decision (this documents what was built and
   approved, it is not a second design pass); invent implementation guidance not backed by the design
   system's conventions or Code Connect (invented guidance reads exactly like documented guidance and
   gets built); omit a small addition from the change-log; reopen the pipeline — this phase is terminal.
   ${record('developer-handoff')}

   Return only the summary described by your output schema.`,
  { label: 'developer-handoff', phase: 'Handoff', schema: SUMMARY({
    doc_path: { type: 'string' },
    pages_specced: { type: 'integer' },
    change_log_entries: { type: 'integer' },
    unresolved_names: { type: 'integer' },
  }) }
)

log(`Handoff: ${handoff?.pages_specced ?? 0} page spec(s), ${handoff?.change_log_entries ?? 0} change-log entr(ies)${handoff?.unresolved_names ? ` — ${handoff.unresolved_names} name(s) UNRESOLVED in the live file` : ''}`)

const closure = await agent(
  `Write the closure report for feature "${slug}": ${OUT}/closure_report_<YYYY-MM-DD>.pdf (or .html)
   and ${OUT}/14_closure_notes.json.

   Load the /closure-reporter skill first. Read your inputs from disk:
${reads(
  `${OUT}/G1_requirements_signoff.json  (gate 1: decisions ANSWERED, by whom, and \`history\`)`,
  `${OUT}/G2_component_signoff.json  (gate 2: the component review, its checks and \`history\`)`,
  `${OUT}/G3_page_signoffs.json  (per-page outcomes: revision rounds, manually_edited, deviations_approved)`,
  `${OUT}/design_requirements.md  (§8 — the questions and the options that were on the table)`,
  `${OUT}/01_prd_requirements.json  (open_decisions — to catch any that NOBODY answered)`,
  `${OUT}/15_developer_handoff.json`,
  `${OUT}/11_build_phase.json`,
)}
   Build \`open_decisions[]\` FROM THE GATE RECORDS. §8 and component-analyzer's \`escalation\` supply
   the question and the options; the gate record supplies the answer and who gave it. Do NOT re-derive
   the decisions from the PRD: that yields a list of what the workflow *should* have decided, which
   reads identically to the truth and is wrong wherever the human chose AGAINST the recommendation —
   and the gate records keep \`recommended\` beside \`answer\` precisely so that divergence survives.

   You own this ledger, and you add the field nobody upstream can: \`reversible_by\` — what changing
   each decision would now cost, which is only knowable once the thing is built. That field is what
   makes having taken a default defensible rather than presumptuous.

   A decision in 01_prd_requirements.json's open_decisions that appears in NO gate record was answered
   by nobody. That is itself a finding, not an omission to tidy away.

   §8's "needs a human in the editor" group goes to \`still_missing[]\` with \`closeable_by\` — it is
   not a decision anyone took, so it must not appear in open_decisions[] with a fabricated answer.

   Record gate history: a gate that bounced its phase back twice before passing is a different fact
   from one that passed first time.
   ${record('closure-reporter')}

   Return only the summary described by your output schema.`,
  { label: 'closure-reporter', phase: 'Handoff', schema: SUMMARY({
    pdf: { type: 'string' },
    created_from_scratch: { type: 'integer' },
    still_missing: { type: 'integer' },
    open_decisions: { type: 'integer' },
    decisions_answered_by_nobody: { type: 'integer' },
  }) }
)

log(`Closure: ${closure?.created_from_scratch ?? 0} created, ${closure?.still_missing ?? 0} still missing, ${closure?.open_decisions ?? 0} decision(s) recorded`)
if (closure?.decisions_answered_by_nobody) log(`! ${closure.decisions_answered_by_nobody} PRD decision(s) were answered by nobody`)

// Paths, not payloads, here too: the caller can read whichever artifact it actually needs.
return {
  status: 'complete',
  feature: slug,
  output_dir: OUT,
  shared_dir: SHARED,
  gates: {
    gate_1: { verdict: g1?.state, reason: g1?.reason },
    gate_2: { verdict: g2?.state, reason: g2?.reason },
    gate_3: { pages_total: nextPage?.pages_total ?? 0, pages_approved: nextPage?.pages_approved ?? 0 },
  },
  coverage_score: scores?.overall_percentage ?? null,
  critical_gaps: scores?.critical_gap_count ?? 0,
  report: report?.report_path ?? null,
  figma_build: {
    components_built: componentPass?.built ?? 0,
    components_failed: componentPass?.failed ?? 0,
    pages_built: nextPage?.pages_total ?? 0,
    discovered_gaps: componentPass?.discovered_gaps ?? 0,
  },
  handoff: {
    pages_specced: handoff?.pages_specced ?? 0,
    change_log_entries: handoff?.change_log_entries ?? 0,
    unresolved_names: handoff?.unresolved_names ?? 0,
    doc: handoff?.doc_path ?? null,
  },
  closure: {
    pdf: closure?.pdf ?? null,
    still_missing: closure?.still_missing ?? 0,
    open_decisions: closure?.open_decisions ?? 0,
  },
  artifacts: {
    prd_requirements: `${OUT}/01_prd_requirements.json`,
    figma_state: `${OUT}/02_figma_state.json`,
    screen_plans: `${OUT}/03_screen_plans.json`,
    screen_validation: `${OUT}/04_screen_validation.json`,
    design_system: `${SHARED}/05_design_system.json`,
    component_analysis: `${OUT}/06_component_analysis.json`,
    coverage_scores: `${OUT}/07_coverage_scores.json`,
    gap_analysis: `${OUT}/09_gap_analysis.json`,
    roadmap: `${OUT}/10_roadmap.json`,
    build_phase: `${OUT}/11_build_phase.json`,
    figma_components: `${OUT}/12a_figma_components.json`,
    figma_build: `${OUT}/12_figma_build.json`,
    closure_notes: `${OUT}/14_closure_notes.json`,
    developer_handoff: `${OUT}/15_developer_handoff.json`,
    gate_1_signoff: `${OUT}/G1_requirements_signoff.json`,
    gate_2_signoff: `${OUT}/G2_component_signoff.json`,
    gate_3_signoffs: `${OUT}/G3_page_signoffs.json`,
  },
}
