#!/usr/bin/env node
/**
 * Pipeline dependency resolver for the PRD-to-UI workflow.
 *
 *   node utils/pipeline.mjs plan <skill> [--force] [--include-optional] [--no-stale] [--json]
 *   node utils/pipeline.mjs status [--json]
 *   node utils/pipeline.mjs validate <skill>            # do the artifacts exist and match their schema?
 *   node utils/pipeline.mjs done <skill> [--version v]  # validate, then record the inputs it was built from
 *   node utils/pipeline.mjs path [--stage <skill>] [--ensure]
 *   node utils/pipeline.mjs projects
 *   node utils/pipeline.mjs graph
 *
 * A stage is SATISFIED only when every file it `produces` exists *and* validates against its
 * schema in .claude/schemas/artifacts.json — existence alone proved nothing, since a skill that
 * wrote `{}` or a truncated file used to mark itself done and feed the mess to everything
 * downstream.
 *
 * A satisfied stage is STALE when a dependency is newer than it, when a dependency is itself
 * being re-run, or when the *inputs* it was built from have changed since it was recorded (see
 * "input fingerprints" below). Stale stages are re-run.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = path.join(ROOT, '.claude', 'pipeline.json')
const SCHEMAS = path.join(ROOT, '.claude', 'schemas', 'artifacts.json')

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
const STAGES = manifest.stages
const SCHEMA_BY_ARTIFACT = fs.existsSync(SCHEMAS) ? JSON.parse(fs.readFileSync(SCHEMAS, 'utf8')) : {}

/** Per-stage sidecar recording what each artifact was built from. Lives beside the artifacts. */
const STATE_FILE = '.pipeline-state.json'

const isSecret = name => /TOKEN|KEY|SECRET|PASSWORD/.test(name)
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16)

// ---------- env ----------

/**
 * Environment, .env, then the manifest's `defaults` — in that order of precedence, lowest last.
 * The defaults are what let a run start with no configuration at all: PRD_SOURCE is the only
 * input any stage declares, and it is embedded in pipeline.json, so `plan` never reports it
 * NOT SET and never has to ask. An explicit --prd, an exported var or a .env line still wins,
 * because a value someone typed for THIS run must not lose to a file-level default.
 */
function loadEnv() {
  const env = { ...process.env }
  const envFile = path.join(ROOT, '.env')
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      const value = m[2].trim().replace(/^["']|["']$/g, '')
      if (env[m[1]] === undefined || env[m[1]] === '') env[m[1]] = value
    }
  }
  for (const [k, v] of Object.entries(manifest.defaults || {})) {
    if (env[k] === undefined || env[k] === '') env[k] = v
  }
  return env
}

const ENV = loadEnv()

// ---------- cli parsing ----------
// Done before anything reads OUT_DIR, because --project decides where artifacts live.

const ARGV = process.argv.slice(2)

/** Flags that take a value. `repeated` ones collect into an array instead of overwriting. */
const VALUED = {
  '--project': 'project', '--prd': 'prd', '--stage': 'stage',
  '--by': 'by', '--note': 'note', '--checked': 'checked', '--page': 'page',
  '--node': 'node', '--figma-url': 'figmaUrl', '--kind': 'kind', '--iteration': 'iteration',
  '--checklist-ref': 'checklistRef',
}
const REPEATED = { '--decision': 'decisions', '--deviation': 'deviations' }

const OPTS = { _: [], flags: new Set(), decisions: [], deviations: [] }
for (const k of Object.values(VALUED)) OPTS[k] = null
for (let i = 0; i < ARGV.length; i++) {
  const a = ARGV[i]
  const eq = a.match(/^(--[a-z-]+)=(.*)$/)
  const [flag, inline] = eq ? [eq[1], eq[2]] : [a, null]
  if (VALUED[flag]) { OPTS[VALUED[flag]] = (inline !== null ? inline : ARGV[++i]) || null; continue }
  if (REPEATED[flag]) {
    const v = inline !== null ? inline : ARGV[++i]
    if (v) OPTS[REPEATED[flag]].push(v)
    continue
  }
  if (a.startsWith('--')) { OPTS.flags.add(a); continue }
  OPTS._.push(a)
}

// ---------- output location ----------

/** "Notification Center.pdf" -> "notification-center" */
const slugify = s => String(s)
  .replace(/^.*[/\\]/, '')
  .replace(/\.[A-Za-z0-9]+$/, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60)

/**
 * The reports tree is output, not workflow state, so the run has to say which feature it
 * belongs to. An explicit --project wins; otherwise the PRD names the run, which is the point
 * of --prd: handing over "prds/Billing Settings.pdf" is enough to get reports/billing-settings/
 * without first editing .env. Then $PROJECT, then PRD_SOURCE from the environment.
 */
const PROJECT = (OPTS.project && slugify(OPTS.project))
  || (OPTS.prd && slugify(OPTS.prd))
  || (ENV.PROJECT && slugify(ENV.PROJECT))
  || (ENV.PRD_SOURCE && slugify(ENV.PRD_SOURCE))
  || null

// --prd both names the run and *is* the PRD source, so it satisfies the PRD_SOURCE input too —
// otherwise a run started from --prd would still be told to go ask the user for the PRD. It WINS
// over $PRD_SOURCE: an explicit flag naming this run's PRD must not be fingerprinted against
// whatever PRD happens to be in .env, or the run reports itself built from a different document.
if (OPTS.prd) ENV.PRD_SOURCE = OPTS.prd

const OUT_ROOT = path.resolve(ROOT, (ENV.OUTPUT_FOLDER || manifest.output_root || 'reports').replace(/^\.\//, ''))
const OUT_DIR = PROJECT ? path.join(OUT_ROOT, PROJECT) : OUT_ROOT

/**
 * Shared-scope artifacts live outside any one feature. The design system is the case that
 * matters: it is global, it is the most expensive thing in the pipeline to extract (a whole
 * Figma library), and it does not vary per PRD — so caching it here is what stops twenty
 * features from re-extracting the same file twenty times. The leading underscore keeps it out
 * of `projects`, which lists features.
 */
const SHARED_DIR = path.join(OUT_ROOT, manifest.shared_dir || '_shared')

const scopeOf = name => (STAGES[name] || {}).scope || 'feature'
const dirOf = name => (scopeOf(name) === 'shared' ? SHARED_DIR : OUT_DIR)

/** A feature-scoped stage has nowhere to write until the run is named; a shared one always does. */
const isLocatable = name => scopeOf(name) === 'shared' || Boolean(PROJECT)

// ---------- schema validation ----------

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)

function matchesType(value, type) {
  switch (type) {
    case 'object': return isPlainObject(value)
    case 'array': return Array.isArray(value)
    case 'string': return typeof value === 'string'
    case 'integer': return Number.isInteger(value)
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'boolean': return typeof value === 'boolean'
    case 'null': return value === null
    default: return true
  }
}

const describe = v => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v

/**
 * Deliberately a small subset of JSON Schema — type, required, properties, items, minItems,
 * enum, minimum, maximum. That is everything the artifact contracts actually use, and it keeps
 * this repo dependency-free. Unlisted properties pass: a skill may add detail, it just may not
 * drop the fields a downstream stage reads by name.
 */
function validateValue(value, schema, at, errs) {
  if (!isPlainObject(schema)) return
  const types = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : null
  const label = at || '(root)'

  if (types && !types.some(t => matchesType(value, t))) {
    errs.push(`${label}: expected ${types.join(' or ')}, got ${describe(value)}`)
    return // a wrong type makes every nested complaint noise
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errs.push(`${label}: expected one of ${schema.enum.join(' | ')}, got ${JSON.stringify(value)}`)
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${label}: ${value} is below minimum ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${label}: ${value} is above maximum ${schema.maximum}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errs.push(`${label}: expected at least ${schema.minItems} item(s), got ${value.length}`)
    }
    if (schema.items) value.forEach((v, i) => validateValue(v, schema.items, `${label}[${i}]`, errs))
  }
  if (isPlainObject(value)) {
    // minProperties is for the maps whose KEYS are data — the component categories, the token
    // groups. `required` cannot express them, since the key names are the design system's to choose,
    // and `{}` otherwise validates: a stage marked done having extracted nothing.
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
      errs.push(`${label}: expected at least ${schema.minProperties} entr${schema.minProperties === 1 ? 'y' : 'ies'}, got ${Object.keys(value).length === 0 ? 'an empty object' : Object.keys(value).length}`)
    }
    for (const key of schema.required || []) {
      if (value[key] === undefined) errs.push(`${at ? at + '.' : ''}${key}: required but missing`)
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) validateValue(value[key], sub, `${at ? at + '.' : ''}${key}`, errs)
    }
  }
}

/** Validate one artifact file. Files with no schema (the report PDF/HTML) only have to exist. */
function validateArtifact(file, pattern) {
  const schema = SCHEMA_BY_ARTIFACT[pattern]
  if (!schema) return []
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return [`not valid JSON — ${err.message}`]
  }
  const errs = []
  validateValue(parsed, schema, '', errs)
  return errs
}

// ---------- artifacts ----------

function resolvePattern(pattern, dir) {
  if (!pattern.includes('*')) {
    const p = path.join(dir, pattern)
    return fs.existsSync(p) ? [p] : []
  }
  if (!fs.existsSync(dir)) return []
  const rx = new RegExp('^' + pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
  return fs.readdirSync(dir).filter(f => rx.test(f)).map(f => path.join(dir, f))
}

/**
 * A stage is SATISFIED only when every pattern in `produces` resolves to a real file *and*
 * every one of those files matches its schema. Existence was never enough: a downstream skill
 * reads these files by name and by shape, so a present-but-empty artifact is worse than a
 * missing one — it silently marks a stage done that never really ran.
 *
 * `accepts` files count toward the mtime (they are part of the stage's output) but never toward
 * satisfaction, and a stage declaring no `produces` is never satisfied, so orchestrators and
 * side-effect-only stages always run.
 */
function artifactInfo(name) {
  const stage = STAGES[name]
  if (!stage) return { found: [], missing: [], invalid: [], mtime: null, satisfied: false }
  const dir = dirOf(name)
  const produces = stage.produces || []
  const found = []
  const invalid = []

  for (const pattern of [...produces, ...(stage.accepts || [])]) {
    for (const f of resolvePattern(pattern, dir)) found.push(f)
  }
  const missing = produces.filter(p => resolvePattern(p, dir).length === 0)

  for (const pattern of produces) {
    for (const f of resolvePattern(pattern, dir)) {
      const errs = validateArtifact(f, pattern)
      if (errs.length) invalid.push({ file: f, pattern, errors: errs })
    }
  }

  const mtime = found.length ? Math.max(...found.map(f => fs.statSync(f).mtimeMs)) : null
  const satisfied = produces.length > 0 && missing.length === 0 && invalid.length === 0
  return { found, missing, invalid, mtime, satisfied }
}

const rel = p => path.relative(ROOT, p)
const stamp = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

/** Feature folders that already have output. Underscore-prefixed dirs are shared, not features. */
function listProjects() {
  return fs.existsSync(OUT_ROOT)
    ? fs.readdirSync(OUT_ROOT, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('_'))
        .map(d => d.name)
    : []
}

/** How a stage is actually invoked. External skills (e.g. plugin-namespaced) override the stage key. */
const cmdOf = name => (STAGES[name] || {}).command || name

// ---------- input fingerprints ----------

/**
 * Artifact mtimes tell us the order stages ran in, but nothing about whether the *inputs* still
 * match. Without this, editing the PRD and re-running left every stage reporting "ok" and handed
 * back a report for the previous PRD — the resolver had no way to know the source had moved.
 *
 * Files are fingerprinted by size+mtime (cheap, and the PRD is the case that matters). URLs and
 * pasted text are fingerprinted by hash of the value, which catches "pointed at a different
 * design system" but *not* "same URL, contents edited in Figma" — verifying that would need a
 * network call on every `plan`, which this resolver deliberately never makes. Stages reading a
 * remote source declare `max_age_days` instead, so a cached copy expires on its own; `--force`
 * is the manual escape hatch.
 *
 * Secrets are excluded on purpose: rotating a Figma token does not change any requirement, and
 * invalidating the whole pipeline over it would be pure waste.
 */
function valuePrint(value) {
  const p = path.resolve(ROOT, value)
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const st = fs.statSync(p)
    return `file:${st.size}:${Math.floor(st.mtimeMs)}`
  }
  return `value:${sha(value)}`
}

function inputPrints(name) {
  const prints = {}
  for (const inp of STAGES[name]?.inputs || []) {
    if (isSecret(inp.env)) continue
    prints[inp.env] = ENV[inp.env] ? valuePrint(ENV[inp.env]) : null
  }
  return prints
}

/** Days since an artifact was written, for stages whose source lives somewhere we cannot poll. */
const ageDays = mtime => (Date.now() - mtime) / 86_400_000

const hasTrackedInputs = name => Object.keys(inputPrints(name)).length > 0

function readState(dir) {
  const f = path.join(dir, STATE_FILE)
  if (!fs.existsSync(f)) return {}
  try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return {} }
}

function writeState(dir, state) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, STATE_FILE), JSON.stringify(state, null, 2) + '\n')
}

/** Which tracked inputs differ from what was recorded when this stage was last marked done. */
function inputDrift(name) {
  if (!hasTrackedInputs(name)) return { tracked: false, recorded: null, changed: [] }
  const recorded = readState(dirOf(name))[name]?.inputs || null
  if (!recorded) return { tracked: true, recorded: null, changed: [] }
  const current = inputPrints(name)
  const keys = new Set([...Object.keys(recorded), ...Object.keys(current)])
  const changed = [...keys].filter(k => recorded[k] !== current[k])
  return { tracked: true, recorded, changed }
}

// ---------- gates ----------

/**
 * A gate is not an AI stage. Its artifact records a decision a HUMAN made, so two rules that hold
 * nowhere else in this resolver hold here:
 *
 *   1. `done` refuses it. `done` is the reflex every other skill ends with, so a gate that accepted
 *      it would be closed by habit rather than by a decision.
 *   2. Validating is not passing. Everywhere else "the file exists and matches its schema" is the
 *      whole test; a gate artifact validates whatever the verdict is — a rejection is a well-formed
 *      decision record — so the gate opens only when the recorded verdict is `approved`.
 *
 * Beyond that, three refusals exist because each failure was silent: an approval recorded while a
 * "needs product decision" item was still unanswered, an approval whose declared checks were never
 * confirmed, and an approval pinned to a checklist that was rewritten underneath it.
 */
const isGate = name => Boolean((STAGES[name] || {}).gate)
const isUngated = name => Boolean((STAGES[name] || {}).ungated)
const phaseOf = name => (STAGES[name] || {}).phase ?? 0

/** A gate approved by the thing being gated is not a gate. */
const SELF_APPROVAL = new Set([
  'claude', 'code', 'ai', 'assistant', 'agent', 'auto', 'automatic', 'automated', 'self', 'bot',
  'robot', 'system', 'model', 'llm', 'gpt', 'chatgpt', 'copilot', 'cursor', 'anthropic', 'openai',
  'pipeline', 'workflow', 'script', 'tool', 'me', 'n/a', 'na', 'none', 'unknown', 'tbd', 'x', 'test',
])
/** Filler that must not rescue a banned name: "the AI" is the AI. */
const NAME_FILLER = new Set(['the', 'a', 'an', 'my', 'your', 'our', 'this', 'it', 'is', 'by'])

/**
 * Matched token-wise rather than on the whole string, because "the AI", "AI assistant", "claude
 * code" and "automated agent" are all the thing being gated wearing a longer name. A name is
 * accepted as soon as ONE token is not a banned word or filler — so a real person called Claude
 * Okafor still signs off, which matters more than catching every possible dodge.
 */
function isSelfApproval(who) {
  const tokens = String(who || '').toLowerCase().split(/[^a-z0-9/]+/).filter(Boolean)
  if (!tokens.length) return true
  return tokens.every(t => SELF_APPROVAL.has(t) || NAME_FILLER.has(t))
}

/**
 * Content hash, not size+mtime. An edit of the same length with the mtime restored was invisible,
 * and `cp -p`, `rsync -t` and archive extraction all restore mtimes incidentally.
 */
const fileHash = f => 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 32)

const gateFileOf = name => path.join(dirOf(name), (STAGES[name].produces || [])[0] || '')

/**
 * Addressed by the DECLARED `gate_id` — `1`, `2`, `2B`, `3` — never by phase. The shorthand used to
 * resolve a number against `phase`, which was correct only while gates and phases were 1:1; the
 * moment one phase held two gates, `gate 3` began resolving to the component gate and every
 * documented `gate 3 --page ... --approve` addressed the wrong gate with nothing to say so.
 */
function resolveGate(handle) {
  const h = String(handle || '').trim().toLowerCase()
  const gates = Object.keys(STAGES).filter(isGate)
  return gates.find(n => n.toLowerCase() === h)
    || gates.find(n => cmdOf(n).toLowerCase() === h)
    || gates.find(n => String(STAGES[n].gate_id || '').toLowerCase() === h)
    || null
}

function requireGate(handle) {
  const name = resolveGate(handle)
  if (!name) {
    const known = Object.keys(STAGES).filter(isGate).map(n => `${STAGES[n].gate_id} (/${cmdOf(n)})`)
    throw new Error(`Unknown gate "${handle}". Known gates: ${known.join(', ')}`)
  }
  if (!isLocatable(name)) {
    throw new Error(`/${cmdOf(name)} is per-feature, but no feature is set — pass --project <slug> or --prd <file>.`)
  }
  return name
}

const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'))

/**
 * Everything the resolver knows about one gate. `satisfied` is the only thing that opens it, and it
 * is deliberately narrower than "the artifact validates".
 */
function gateState(name) {
  const stage = STAGES[name]
  const artifact = (stage.produces || [])[0]
  const file = gateFileOf(name)
  const out = {
    skill: name, command: cmdOf(name), gate_id: stage.gate_id, phase: phaseOf(name),
    perItem: stage.per_item || null, file, exists: false, record: null,
    verdict: null, satisfied: false, state: 'awaiting', reason: '',
    schemaErrors: [], openDecisions: [], unchecked: [], staleChecklist: null,
    pages: [], pending: [], nextItem: null,
  }

  if (!isLocatable(name)) {
    out.reason = 'feature not named yet — no gate record to read'
    return out
  }
  if (!fs.existsSync(file)) {
    out.reason = `AWAITING — no ${path.basename(file)}; nobody has decided yet`
    return out
  }
  out.exists = true

  let rec
  try { rec = readJson(file) } catch (err) {
    out.state = 'invalid'
    out.schemaErrors = [`not valid JSON — ${err.message}`]
    out.reason = `INVALID signoff — ${out.schemaErrors[0]}`
    return out
  }
  out.record = rec

  // A signoff that does not match its contract does not open the gate. `plan` used to read the
  // verdict alone, so it reported READY while `validate` reported INVALID — three commands, three
  // answers, and the permissive one deciding.
  out.schemaErrors = validateArtifact(file, artifact)
  if (out.schemaErrors.length) {
    out.state = 'invalid'
    out.reason = `INVALID signoff — ${out.schemaErrors[0]}${out.schemaErrors.length > 1 ? ` (+${out.schemaErrors.length - 1} more)` : ''}`
    return out
  }

  // --- per-item gates: one decision per page, satisfied only when EVERY page is approved ---
  if (out.perItem) {
    out.pages = Array.isArray(rec.pages) ? rec.pages : []
    out.pending = out.pages.filter(p => p.status !== 'approved')
    out.nextItem = out.pending[0] || null
    out.verdict = out.pending.length ? 'awaiting' : 'approved'
  } else {
    out.verdict = rec.verdict || null
  }

  // A gate cannot pass with an open decision unanswered: `--approve` records, and the gate STILL
  // refuses to open. This is the named failure signal for gates 1 and 2 — a checklist approved while
  // a "needs product decision" item is still open — and it fires even after an explicit approval.
  out.openDecisions = (Array.isArray(rec.decisions) ? rec.decisions : [])
    .filter(d => !d || typeof d.answer !== 'string' || !d.answer.trim())
    .map(d => (d && d.decision) || '(unnamed decision)')

  // Declared checks, confirmed by a person. A check the manifest declares but the record omits is
  // unconfirmed, not absent.
  for (const c of stage.checks || []) {
    if ((rec.checked || {})[c] !== true) out.unchecked.push(c)
  }

  // The approval pins what it approved. A signoff describing a checklist that was rewritten
  // underneath it is worse than no signoff, because it still reads as passed.
  if (rec.checklist_ref && rec.checklist_fingerprint) {
    const pinned = path.join(OUT_DIR, path.basename(rec.checklist_ref))
    if (!fs.existsSync(pinned)) {
      out.staleChecklist = `${rec.checklist_ref} no longer exists`
    } else if (fileHash(pinned) !== rec.checklist_fingerprint) {
      out.staleChecklist = `${rec.checklist_ref} has changed since it was approved`
    }
  }

  if (out.verdict === 'changes_requested' || out.verdict === 'rejected') {
    out.state = out.verdict
    out.reason = `${out.verdict.toUpperCase().replace('_', ' ')} by ${rec.decided_by || 'unknown'}${rec.notes ? ` — ${rec.notes}` : ''}`
    return out
  }
  if (out.verdict !== 'approved') {
    out.state = 'awaiting'
    out.reason = out.perItem
      ? `AWAITING — ${out.pending.length} of ${out.pages.length} page(s) undecided, next: "${(out.nextItem || {}).page}"`
      : `AWAITING — verdict "${out.verdict || 'none'}" is not an approval`
    return out
  }

  // Approved on its face. Now the three things an approval alone does not settle.
  if (out.staleChecklist) {
    out.state = 'stale-checklist'
    out.reason = `STALE — approved by ${rec.decided_by}, but ${out.staleChecklist}; the gate must be re-taken`
    return out
  }
  if (out.openDecisions.length) {
    out.state = 'incomplete'
    out.reason = `APPROVED but NOT OPEN — ${out.openDecisions.length} decision(s) still unanswered: ${out.openDecisions.join('; ')}`
    return out
  }
  if (out.unchecked.length) {
    out.state = 'incomplete'
    out.reason = `APPROVED but NOT OPEN — check(s) not confirmed: ${out.unchecked.join(', ')}`
    return out
  }

  // An approval goes stale when what it approved no longer exists in the state it was approved in.
  // Checked HERE rather than only in `plan`, so `next-page` and `plan` can never disagree — one
  // handing assembly a page while the other says the run is parked. Only the unconditional half
  // lives here (an upstream artifact missing or rejected means it MUST be rebuilt); the "an upstream
  // is merely newer" half honours --no-stale and stays in `plan`.
  const rebuilt = reachableDeps(name, false).filter(d => !isGate(d) && !artifactInfo(d).satisfied)
  if (rebuilt.length) {
    out.state = 'stale-upstream'
    out.reason = `STALE APPROVAL — ${rebuilt.join(', ')} must be re-run, so this gate must be re-taken`
    return out
  }

  out.state = 'ok'
  out.satisfied = true
  out.reason = out.perItem
    ? `approved — all ${out.pages.length} page(s) signed off`
    : `approved by ${rec.decided_by} (${String(rec.decided_at || '').slice(0, 16).replace('T', ' ')})`
  return out
}

// ---------- workflow log ----------

/**
 * reports/<feature>/workflow_log.md — one log per PRD, holding every step, skill and action taken on
 * it. Every other file in reports/ answers "what is the state of X"; none of them answers "what
 * actually happened, in what order, and who decided it" — that history lived only in the terminal
 * scrollback of whoever ran it, so a run resumed a day later, or by somebody else, began by guessing.
 *
 * The resolver writes it, not the skills: "every skill must remember to append" is the same shape as
 * every other convention here that had to be mechanized before it held, and a ledger with silent
 * holes is worse than none, because a hole is indistinguishable from nothing having happened.
 */
const LOG_FILE = 'workflow_log.md'
const LEDGER_MARK = '<!-- LEDGER -->'
const nowStamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ')

let inLogRender = false // header regeneration calls plan(), which logs — break the cycle

function logPath() {
  return PROJECT ? path.join(OUT_DIR, LOG_FILE) : null
}

function readLedger(file) {
  if (!fs.existsSync(file)) return []
  const raw = fs.readFileSync(file, 'utf8')
  const i = raw.indexOf(LEDGER_MARK)
  // A file with no marker at all is preserved wholesale: a format upgrade that eats an audit trail
  // is worse than no upgrade.
  const body = i === -1 ? raw : raw.slice(i + LEDGER_MARK.length)
  return body.split('\n').filter(l => l.trim() !== '')
}

function logHeader() {
  const lines = [`# Workflow log — ${PROJECT}`, '']
  lines.push(`PRD: ${ENV.PRD_SOURCE || 'NOT SET — untracked'}`)
  lines.push(`Output: ${rel(OUT_DIR)}/`)

  let p = null
  if (!inLogRender) {
    inLogRender = true
    try { p = plan('run-prd-workflow', { force: false, includeOptional: true, stale: true }) } catch { /* header is best-effort */ }
    inLogRender = false
  }

  if (p) {
    const live = (p.awaitingGates || []).find(g => g.reachable)
    if (live) {
      lines.push(`State: PARKED at /${live.command} — ${live.reason}`)
      lines.push(`Next: present the gate packet (/${live.command}), then \`node utils/pipeline.mjs gate ${STAGES[live.skill].gate_id} --approve --by "<person>"${(STAGES[live.skill].checks || []).length ? ' --checked all' : ''}\``)
    } else if (p.toRun.length) {
      lines.push('State: running')
      lines.push(`Next: /${p.toRun[0].command}`)
    } else {
      lines.push('State: complete — every stage satisfied for this feature')
      lines.push('Next: nothing')
    }
    lines.push('')
    lines.push('## Stages')
    const byName = Object.fromEntries(p.rows.map(r => [r.skill, r]))
    const phases = [...new Set(Object.keys(STAGES).filter(n => !STAGES[n].orchestrator).map(phaseOf))].sort()
    for (const ph of phases) {
      const names = Object.keys(STAGES)
        .filter(n => !STAGES[n].orchestrator && phaseOf(n) === ph)
        .sort(byOrder)
      lines.push('')
      lines.push(`**Phase ${ph}**`)
      for (const n of names) {
        const row = byName[n]
        const mark = STAGES[n].standalone ? '[-]'
          : !row ? '[ ]'
          : row.state === 'ok' ? '[x]'
          : row.state === 'gate' ? '[G]'
          : row.state === 'blocked' ? '[!]'
          : '[ ]'
        lines.push(`- ${mark} \`/${cmdOf(n)}\` — ${row ? row.reason : 'standalone — invoke directly'}`)
      }
    }
    lines.push('')
    lines.push('`[x]` done · `[G]` human gate, awaiting a decision · `[!]` blocked by a gate · `[ ]` to run · `[-]` standalone')
  } else {
    lines.push('State: unknown — the plan could not be computed')
  }

  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('The header above is regenerated on every write. Everything below the marker is')
  lines.push('append-only and is never rewritten.')
  lines.push('')
  return lines.join('\n')
}

/** Strip a trailing "×N" so a repeat of the same event increments instead of stacking. */
const repeatOf = line => {
  const m = line.match(/^(.*?)\s+×(\d+)$/)
  return m ? { body: m[1], count: Number(m[2]) } : { body: line, count: 1 }
}

function writeLog(entry) {
  const file = logPath()
  // No feature, or no folder yet, means nowhere to write. `path --ensure` is what creates it.
  if (!file || !fs.existsSync(OUT_DIR)) return
  const ledger = readLedger(file)
  const line = `- ${nowStamp()} · ${entry}`

  const last = ledger[ledger.length - 1]
  if (last) {
    const a = repeatOf(last)
    const b = repeatOf(line)
    // Compare on everything but the timestamp: the hook runs `plan` on every prompt, so an
    // un-deduped ledger would be mostly the same line.
    if (a.body.slice(19) === b.body.slice(19)) {
      ledger[ledger.length - 1] = `${a.body} ×${a.count + 1}`
      fs.writeFileSync(file, `${logHeader()}${LEDGER_MARK}\n\n${ledger.join('\n')}\n`)
      return
    }
  }
  ledger.push(line)
  fs.writeFileSync(file, `${logHeader()}${LEDGER_MARK}\n\n${ledger.join('\n')}\n`)
}

const logEvent = (kind, text, stage) => writeLog(`**${kind}**${stage ? ` \`/${cmdOf(stage)}\`` : ''} — ${text}`)

// ---------- planning ----------

function depsOf(name, includeOptional) {
  const s = STAGES[name] || {}
  return [...(s.requires || []), ...(includeOptional ? s.optional || [] : [])]
}

/** Display order only. Execution order comes from the graph; this just breaks ties readably. */
const byOrder = (a, b) => ((STAGES[a].order ?? 0) - (STAGES[b].order ?? 0)) || a.localeCompare(b)

/**
 * Kahn's algorithm, with `order` as a tie-break among stages that do not depend on each other.
 *
 * The plan used to be produced by sorting on the hand-written `order` field, which meant a wrong
 * number printed a sequence that violated the dependencies it had just computed correctly — it
 * would tell you to run a stage before the stage it requires. Dependencies decide the order now;
 * `order` only decides which of two *independent* stages is listed first.
 *
 * A cycle is an error rather than a silently plausible answer: previously the recursion's `seen`
 * set absorbed it and emitted a confident, wrong plan.
 */
function topoSort(names, includeOptional) {
  const set = new Set(names)
  const indegree = new Map([...set].map(n => [n, 0]))
  const dependents = new Map([...set].map(n => [n, []]))

  for (const n of set) {
    for (const d of depsOf(n, includeOptional)) {
      if (!STAGES[d]) throw new Error(`Unknown dependency "${d}" of stage "${n}" in .claude/pipeline.json`)
      if (!set.has(d)) continue
      dependents.get(d).push(n)
      indegree.set(n, indegree.get(n) + 1)
    }
  }

  const ready = [...set].filter(n => indegree.get(n) === 0).sort(byOrder)
  const ordered = []
  while (ready.length) {
    const n = ready.shift()
    ordered.push(n)
    for (const m of dependents.get(n)) {
      indegree.set(m, indegree.get(m) - 1)
      if (indegree.get(m) === 0) {
        ready.push(m)
        ready.sort(byOrder)
      }
    }
  }

  if (ordered.length !== set.size) {
    const stuck = [...set].filter(n => !ordered.includes(n)).sort()
    throw new Error(
      `dependency cycle in .claude/pipeline.json — these stages depend on each other, ` +
      `so there is no order that satisfies them: ${stuck.join(', ')}`
    )
  }
  return ordered
}

/** Every stage reachable through `requires` (plus `optional` when asked), target excluded. */
function reachableDeps(target, includeOptional) {
  const seen = new Set()
  const stack = [target]
  while (stack.length) {
    for (const d of depsOf(stack.pop(), includeOptional)) {
      if (!STAGES[d]) throw new Error(`Unknown dependency "${d}" of stage "${target}" in .claude/pipeline.json`)
      if (!seen.has(d)) { seen.add(d); stack.push(d) }
    }
  }
  return [...seen]
}

function closure(target, includeOptional) {
  // topoSort sees the target too when a cycle runs through it, which is how that cycle gets caught.
  return topoSort(reachableDeps(target, includeOptional), includeOptional).filter(n => n !== target)
}

/**
 * What an orchestrator runs. Derived from the stage list by default, because a hand-maintained
 * copy silently omits whatever was added last: a new stage would be in the graph, resolve its own
 * prerequisites, and still never be run by /run-prd-workflow. An explicit `runs_all` still wins
 * (for a deliberate subset), and `check` reports any stage it leaves out.
 *
 * `standalone: true` opts a stage out of the derived list without reintroducing that hand-written
 * copy: the exclusion lives on the stage it describes, so a stage added tomorrow is still included
 * automatically unless it opts out itself. A standalone stage is invoked directly and, since
 * nothing may depend on one (`check` enforces that), it is never pulled in as a prerequisite.
 */
function runsAll(name) {
  const explicit = (STAGES[name] || {}).runs_all
  return explicit && explicit.length
    ? explicit
    : Object.keys(STAGES).filter(n => !STAGES[n].orchestrator && !STAGES[n].standalone)
}

/** Accept either a stage key or the command it is invoked with ("figma:figma-use"). */
function resolveStage(name) {
  if (STAGES[name]) return name
  return Object.keys(STAGES).find(n => cmdOf(n) === name) || null
}

function requireStage(requested) {
  const target = resolveStage(requested)
  if (!target) {
    throw new Error(`Unknown skill "${requested}". Known: ${Object.keys(STAGES).map(cmdOf).join(', ')}`)
  }
  return target
}

function plan(requested, opts) {
  const target = requireStage(requested)
  const stage = STAGES[target]

  const chain = stage.orchestrator
    ? topoSort(runsAll(target), opts.includeOptional)
    : closure(target, opts.includeOptional)

  // --- gates, before anything else in the chain is judged ---
  // A gate is a stage in the graph, not a paragraph in the orchestrator: the graph is the only thing
  // every entry point respects, and most of how these skills actually get used is direct invocation.
  const gateStates = new Map()
  for (const n of chain) if (isGate(n)) gateStates.set(n, gateState(n))

  // An approval goes stale. Regenerate an artifact the gate signed off — anywhere upstream, not just
  // one hop back — and the gate has to be re-taken, because the thing the person approved is no
  // longer the thing that exists. Computed here rather than in the row loop so that a stale gate
  // blocks everything behind it exactly like an undecided one.
  const staleGate = new Map()
  for (const [n, gs] of gateStates) {
    if (!gs.satisfied) continue
    // gateState has already ruled on the unconditional half (an upstream that must be rebuilt).
    // This is the half that honours --no-stale: an upstream artifact that is merely newer.
    if (!opts.stale) continue
    const info = artifactInfo(n)
    const newer = reachableDeps(n, opts.includeOptional)
      .filter(d => !isGate(d))
      .filter(d => {
        const m = artifactInfo(d).mtime
        return m !== null && info.mtime !== null && m > info.mtime
      })
    if (newer.length) {
      staleGate.set(n, `STALE APPROVAL — ${newer.join(', ')} changed since the signoff; the gate must be re-taken`)
    }
  }

  const unsatisfiedGates = new Set(
    [...gateStates].filter(([n, g]) => !g.satisfied || staleGate.has(n)).map(([n]) => n)
  )

  // `changes_requested` sends the phase back — the backwards arrow in the governance flowchart. It
  // re-runs the gate's OWN dependencies, not its whole transitive closure: the closure reaches
  // shared, phase-0 work like the design-system extraction, and "the requirements are still bundled"
  // is not a reason to re-walk the component library.
  const bounced = new Map()
  for (const [g, gs] of gateStates) {
    if (gs.state !== 'changes_requested' && gs.state !== 'rejected') continue
    for (const d of depsOf(g, opts.includeOptional)) if (!isGate(d) && scopeOf(d) !== 'shared') bounced.set(d, g)
  }

  // Everything behind an undecided gate is `blocked`, not `run` — and not `ok` either, because
  // there IS real work there and it is not allowed to start. `ungated` stages are exempt: the
  // closure report has to be producible on every outcome, including a run abandoned at gate 1.
  const blocked = new Map()
  for (const n of chain) {
    if (isGate(n) || isUngated(n)) continue
    const g = reachableDeps(n, opts.includeOptional).find(d => unsatisfiedGates.has(d))
    if (g) blocked.set(n, g)
  }
  const targetBlockedBy = (!isGate(target) && !isUngated(target))
    ? reachableDeps(target, opts.includeOptional).find(d => unsatisfiedGates.has(d)) || null
    : null

  const rerun = new Set()
  const rows = []

  // chain is already in dependency order — do not re-sort it on `order`.
  for (const name of chain) {
    const info = artifactInfo(name)
    const deps = depsOf(name, opts.includeOptional)
    let state, reason

    if (isGate(name)) {
      // Neither --force nor --no-stale re-opens a gate. A gate closed by a person stays closed
      // until it goes stale or is re-taken; a flag about caching must not revoke a judgement.
      const gs = gateStates.get(name)
      state = unsatisfiedGates.has(name) ? 'gate' : 'ok'
      reason = staleGate.get(name) || gs.reason
    } else if (blocked.has(name)) {
      state = 'blocked'
      reason = `blocked by /${cmdOf(blocked.get(name))} — a person has to decide before this may run`
    } else if (bounced.has(name)) {
      state = 'run'
      reason = `bounced back by /${cmdOf(bounced.get(name))} — changes were requested at that gate`
    } else if (opts.force) {
      state = 'run'; reason = '--force'
    } else if (!isLocatable(name)) {
      state = 'run'; reason = 'feature not named yet — nowhere to look for its artifacts'
    } else if (info.invalid.length) {
      // Present but wrong is a re-run, not a skip: this is the whole point of validating.
      const first = info.invalid[0]
      state = 'run'
      reason = `invalid ${path.basename(first.file)} — ${first.errors[0]}${first.errors.length > 1 ? ` (+${first.errors.length - 1} more)` : ''}`
    } else if (!info.satisfied) {
      state = 'run'
      reason = info.missing.length
        ? `missing ${info.missing.join(', ')}`
        : `${(STAGES[name].produces || []).length ? 'missing artifact' : 'no artifact to skip on — always runs'}`
    } else if (deps.some(d => rerun.has(d))) {
      state = opts.stale ? 'run' : 'ok'
      reason = `stale — depends on ${deps.filter(d => rerun.has(d)).join(', ')} which will be re-run`
    } else {
      const drift = inputDrift(name)
      const maxAge = STAGES[name].max_age_days
      const newer = deps
        .map(d => ({ d, m: artifactInfo(d).mtime }))
        .filter(x => x.m !== null && x.m > info.mtime)

      if (maxAge && ageDays(info.mtime) > maxAge && opts.stale) {
        state = 'run'
        reason = `stale — cached ${Math.floor(ageDays(info.mtime))}d ago, past its ${maxAge}d max age (its source is remote, so age is the only signal we have; --no-stale keeps it)`
      } else if (drift.tracked && !drift.recorded && opts.stale) {
        state = 'run'
        reason = `stale — no recorded inputs for ${rel(info.found[0])}, so it cannot be shown to match the current ${Object.keys(inputPrints(name)).join(', ')}; run \`pipeline.mjs done ${name}\` after the skill writes it`
      } else if (drift.changed.length && opts.stale) {
        state = 'run'; reason = `stale — ${drift.changed.join(', ')} changed since this was built`
      } else if (newer.length && opts.stale) {
        state = 'run'; reason = `stale — ${newer.map(x => x.d).join(', ')} newer than ${rel(info.found[0])}`
      } else {
        state = 'ok'
        reason = `${rel(info.found[0])} (${stamp(info.mtime)})`
      }
    }

    if (state === 'run') rerun.add(name)
    rows.push({
      skill: name, command: cmdOf(name), external: Boolean(STAGES[name].external),
      scope: scopeOf(name), outDir: rel(dirOf(name)), state, reason,
    })
  }

  // Inputs needed by the target plus every stage that will run. The feature slug comes first:
  // without it there is nowhere to put the output — unless everything in this plan is
  // shared-scope, in which case the run genuinely does not need a feature name yet.
  const inputs = []
  const involved = [...rows.filter(r => r.state === 'run').map(r => r.skill), target]
  const featureRequired = involved.some(n => scopeOf(n) !== 'shared')
  if (!PROJECT && featureRequired) {
    inputs.push({
      env: 'PROJECT',
      how: 'Feature this run is for, e.g. notification-center -> reports/notification-center/. Pass --project <slug>, set PROJECT in .env, or name the PRD after the feature.',
      set: false, value: null, neededBy: target,
    })
  }
  for (const name of involved) {
    for (const inp of STAGES[name].inputs || []) {
      if (inputs.some(i => i.env === inp.env)) continue
      const raw = ENV[inp.env] || null
      inputs.push({ ...inp, set: Boolean(raw), value: raw && isSecret(inp.env) ? '***' : raw, neededBy: name })
    }
  }

  const toRun = rows.filter(r => r.state === 'run')
  const blockedRows = rows.filter(r => r.state === 'blocked')

  // Every undecided gate in the chain. `reachable` marks the ONE that can actually be taken now —
  // a gate sitting behind another undecided gate is named so that reaching it is not a surprise,
  // but it is not presented as a decision anybody can make yet.
  const awaitingGates = rows
    .filter(r => r.state === 'gate')
    .map(r => {
      const gs = gateStates.get(r.skill)
      return {
        skill: r.skill, command: r.command, gate_id: STAGES[r.skill].gate_id, phase: phaseOf(r.skill),
        reason: r.reason, perItem: gs.perItem, nextItem: gs.nextItem,
        reachable: !reachableDeps(r.skill, opts.includeOptional).some(d => unsatisfiedGates.has(d)),
      }
    })

  // outDir is null, not the reports root, until a feature is named — a consumer that writes to
  // the fallback would scatter one feature's artifacts across the root shared by all of them.
  const p = {
    target, command: cmdOf(target), project: PROJECT,
    outDir: PROJECT ? rel(OUT_DIR) : null,
    sharedDir: rel(SHARED_DIR), featureRequired,
    targetScope: scopeOf(target), targetDir: isLocatable(target) ? rel(dirOf(target)) : null,
    rows, toRun, blockedRows, awaitingGates,
    targetBlockedBy: targetBlockedBy ? { skill: targetBlockedBy, command: cmdOf(targetBlockedBy) } : null,
    satisfied: rows.filter(r => r.state === 'ok'), inputs,
    // A gate in the way means NOT ready, whatever the runnable list says. Reporting `ready: yes`
    // with a gate open is how a run walks straight through one.
    ready: toRun.length === 0 && awaitingGates.length === 0,
  }
  return p
}

// ---------- rendering ----------

function renderPlan(p) {
  const out = []
  out.push(`STAGE: /${p.command}${p.targetScope === 'shared' ? '  (shared across features)' : ''}`)
  out.push(`FEATURE: ${p.project
    || (p.featureRequired
      ? 'NOT SET — ask the user which feature this run is for'
      : 'not needed — everything in this plan is shared across features')}`)
  out.push(p.targetDir
    ? `OUTPUT DIR: ${p.targetDir}/   (output only — create with: node utils/pipeline.mjs path --stage ${p.target} --ensure)`
    : 'OUTPUT DIR: reports/<feature>/ — unknown until the feature is named. Do not write anything yet.')
  out.push('')

  // Printed ABOVE the runnable list on purpose: an orchestrator reads top-down and acts on the first
  // thing it finds, so a gate announced underneath "run these skills" is a gate a run walks straight
  // through. When a gate is live, this box is the whole instruction.
  const live = p.awaitingGates.find(g => g.reachable)
  if (live) {
    const stage = STAGES[live.skill]
    const bar = '═'.repeat(78)
    out.push(bar)
    out.push(`STOP — HUMAN GATE:  /${live.command}   (closes phase ${live.phase})`)
    out.push(bar)
    out.push(`  State: ${live.reason}`)
    if (live.nextItem) out.push(`  Next ${String(live.perItem).replace(/s$/, '')}: "${live.nextItem.page}" (${live.nextItem.status})`)
    out.push('')
    out.push(`  Load the /${live.command} skill. Build its packet, present it, ASK, and WAIT.`)
    out.push('')
    out.push('  ASK WITH POPUP QUESTIONS (AskUserQuestion), not with prose the person has to reply to.')
    out.push('  A gate answered in free text is a gate answered by whoever paraphrases the reply. One')
    out.push('  popup call carries the whole decision, and every part of it is REQUIRED:')
    out.push(`    - the verdict: approve / request changes / reject${live.perItem ? ' — for THIS item only' : ''}`)
    if ((stage.checks || []).length) {
      out.push('    - one multi-select question naming its checks, so the person confirms the ones they')
      out.push('      actually verified rather than having "all" assumed for them')
    }
    if (stage.seeds_decisions) {
      out.push('    - one question PER OPEN DECISION, with its options and the recommendation marked.')
      out.push('      The gate will not open while any answer is empty, so these are not optional.')
    }
    out.push('    - WHO IS APPROVING — asked every time, in every popup, including once per page at')
    out.push('      gate 3. Never carry a name over from an earlier gate and never supply your own:')
    out.push('      the name is the evidence a person was present at THIS decision.')
    out.push('')
    out.push('  Record only the answer the person gave:')
    out.push(live.perItem
      ? `    node utils/pipeline.mjs gate ${stage.gate_id} --page "<name>" --approve --by "<person>"`
      : `    node utils/pipeline.mjs gate ${stage.gate_id} --approve --by "<person>"${(stage.checks || []).length ? ' --checked all' : ''}`)
    if ((stage.checks || []).length) {
      out.push(`    Its checks: ${stage.checks.join(', ')}`)
      out.push('    Without them the approval is recorded and the gate STAYS CLOSED.')
    }
    out.push('')
    out.push('  Do not run the blocked stages below "to save time while they review", and do not')
    out.push('  approve on your own judgement: --by is required and self-approval values are rejected.')
    out.push('  A run parked at a gate is a correct outcome, not a stall.')
    out.push(bar)
    out.push('')
  }

  if (p.awaitingGates.some(g => !g.reachable)) {
    out.push('HUMAN GATES FURTHER ALONG (cannot be taken yet — the phase before them is unfinished):')
    for (const g of p.awaitingGates.filter(x => !x.reachable)) {
      out.push(`  - /${g.command.padEnd(22)} closes phase ${g.phase} — needs a person, not a skill run`)
    }
    out.push('')
  }

  if (p.toRun.length === 0) {
    out.push(live
      ? 'RUNNABLE NOW: nothing — the gate above is the only thing that moves this forward.'
      : 'PREREQUISITES: all satisfied — run this skill directly.')
  } else {
    out.push('RUN THESE SKILLS FIRST, IN THIS ORDER (one at a time, wait for each):')
    p.toRun.forEach((r, i) => out.push(`  ${i + 1}. /${r.command.padEnd(22)} ${r.reason}`))
  }

  if (p.blockedRows.length) {
    out.push('')
    out.push('BLOCKED BY A GATE (real work, but not allowed to start — do NOT run these):')
    for (const r of p.blockedRows) out.push(`  x /${r.command.padEnd(22)} ${r.reason}`)
  }

  if (p.satisfied.length) {
    out.push('')
    out.push('ALREADY SATISFIED (skip these):')
    for (const r of p.satisfied) {
      out.push(`  - ${r.command.padEnd(22)} ${r.reason}${r.scope === 'shared' ? '  [shared]' : ''}`)
    }
  }

  if (p.inputs.length) {
    out.push('')
    out.push('INPUTS NEEDED:')
    for (const i of p.inputs) {
      const shown = !i.set ? 'NOT SET — ask the user'
        : isSecret(i.env) ? '(hidden)'
        : i.value.length > 60 ? i.value.slice(0, 57) + '...' : i.value
      out.push(`  - ${i.env.padEnd(22)} ${i.set ? 'set: ' : ''}${shown}`)
      if (!i.set) out.push(`${' '.repeat(28)}${i.how}`)
    }
    if (p.inputs.some(i => !i.set)) {
      out.push('')
      out.push('  A NOT SET input blocks this stage, so ASK FOR IT WITH A POPUP QUESTION')
      out.push('  (AskUserQuestion) — one question per unset input — rather than guessing a value or')
      out.push('  burying the ask in prose. Everything that blocks the next phase gets asked the same')
      out.push('  way, for the same reason: an answer given in a popup is the person\'s answer, and an')
      out.push('  answer inferred from context is yours.')
    }
  }

  out.push('')
  if (isGate(p.target)) {
    // A gate is the one stage whose last step is NOT `done` — which refuses it.
    out.push('THIS STAGE IS A HUMAN GATE. Do NOT run `done` on it — it will refuse, which is the point.')
    out.push('Present the packet, ASK WITH POPUP QUESTIONS (AskUserQuestion), wait, and record the answer:')
    out.push(`  node utils/pipeline.mjs gate ${STAGES[p.target].gate_id} --approve|--changes-requested|--reject --by "<person>"`)
    out.push('  --by is required, the obvious self-approval values are rejected, and the name comes from')
    out.push('  a popup question asked at THIS gate — not from an earlier gate, and not from you.')
  } else {
    out.push('AFTER THE SKILL WRITES ITS ARTIFACT, record it:')
    out.push(`  node utils/pipeline.mjs done ${p.target}`)
    out.push('  This validates the artifact against .claude/schemas/artifacts.json and records the')
    out.push('  inputs it was built from. Without it the stage stays stale and will be re-run.')
  }
  out.push('')
  const gateBlock = p.awaitingGates.find(g => g.reachable)
  out.push(`READY: ${p.ready
    ? 'yes'
    : gateBlock
      ? `no — PARKED at the human gate /${gateBlock.command}${p.toRun.length ? `, and ${p.toRun.length} skill(s) to run` : ''}`
      : `no — ${p.toRun.length} prerequisite skill(s) to run first`}`)
  return out.join('\n')
}

function renderStatus() {
  // Status is per feature. With no slug, OUT_DIR falls back to the reports root, where none of
  // the artifacts live — so every stage reads as missing and a finished pipeline looks untouched.
  // Say the slug is missing instead, the way `plan` does, and point at the features that do exist.
  if (!PROJECT) {
    const found = listProjects()
    const out = [
      'PIPELINE STATUS  feature: NOT SET — ask the user which feature this run is for',
      '',
      'Status is per feature, so there is nothing to report until one is named.',
      'Pass --project <slug>, set PROJECT in .env, or name the PRD after the feature.',
    ]
    if (found.length) {
      out.push('', `FEATURES WITH OUTPUT  (${rel(OUT_ROOT)}/)`, '')
      for (const f of found) out.push(`  ${f.padEnd(24)} node utils/pipeline.mjs status --project ${f}`)
    }
    return out.join('\n')
  }

  // Status asks the planner rather than re-deriving freshness, so the two can never disagree —
  // and so a stage whose own artifact is fine but whose upstream is being re-run is shown as
  // pending, which is what will actually happen, instead of a reassuring [x].
  const p = plan('run-prd-workflow', { force: false, includeOptional: true, stale: true })
  const byName = Object.fromEntries(p.rows.map(r => [r.skill, r]))
  const names = Object.keys(STAGES)
    .filter(n => !STAGES[n].orchestrator)
    .sort((a, b) => STAGES[a].order - STAGES[b].order)

  const out = [`PIPELINE STATUS  feature: ${PROJECT}  ->  ${rel(OUT_DIR)}/`, `shared artifacts  ->  ${rel(SHARED_DIR)}/`, '']
  for (const name of names) {
    const row = byName[name]
    let mark, reason
    if (STAGES[name].standalone) {
      // No row: the orchestrator does not run it, so plan() never considered it. Ask separately
      // rather than defaulting to [x] — "done" and "never scheduled" are not the same state.
      const info = artifactInfo(name)
      mark = '[-]'
      reason = info.satisfied
        ? `${rel(info.found[0])} (${stamp(info.mtime)})`
        : `not run — invoke /${cmdOf(name)} directly`
    } else {
      reason = row ? row.reason : 'not part of the pipeline'
      mark = !row ? '[x]'
        : row.state === 'gate' ? '[G]'
        : row.state === 'blocked' ? '[!]'
        : row.state === 'ok' ? '[x]'
        : /^stale/i.test(reason) ? '[~]' : '[ ]'
    }
    const tags = []
    if (scopeOf(name) === 'shared') tags.push('shared')
    if (STAGES[name].standalone) tags.push('standalone')
    if (isUngated(name)) tags.push('ungated')
    out.push(`${mark} ${String(STAGES[name].order).padStart(2)}. ${cmdOf(name).padEnd(22)} ${reason}${tags.length ? `  [${tags.join(', ')}]` : ''}`)
  }
  out.push('')
  out.push('[x] done  [~] stale — will re-run  [ ] missing or invalid  [G] HUMAN GATE, awaiting a decision')
  out.push('[!] blocked by a gate — real work, not allowed to start  [-] standalone, not part of the run')

  const live = p.awaitingGates.find(g => g.reachable)
  if (live) {
    out.push('')
    out.push(`PARKED AT: /${live.command} (phase ${live.phase}) — ${live.reason}`)
    out.push(`NEXT: load /${live.command}, present the packet, ask, and wait. Nothing downstream may run.`)
  } else {
    out.push(`NEXT: ${p.toRun.length ? p.toRun.map(r => '/' + r.command).join(' -> ') : 'nothing — the pipeline is complete for this feature'}`)
  }
  return out.join('\n')
}

function renderGraph() {
  const names = Object.keys(STAGES).sort((a, b) => STAGES[a].order - STAGES[b].order)
  const out = ['DEPENDENCY GRAPH', '']
  for (const name of names) {
    const s = STAGES[name]
    const req = (s.requires || []).map(cmdOf).join(', ') || (s.orchestrator ? '(runs the whole pipeline)' : '(none — entry point)')
    const tags = [
      s.external ? 'external skill' : null,
      scopeOf(name) === 'shared' ? 'shared across features' : null,
      s.standalone ? 'standalone — not run by /run-prd-workflow' : null,
    ].filter(Boolean)
    out.push(`${cmdOf(name)}${tags.length ? `  (${tags.join(', ')})` : ''}`)
    out.push(`  requires: ${req}`)
    if ((s.optional || []).length) out.push(`  optional: ${s.optional.map(cmdOf).join(', ')}`)
    if ((s.produces || []).length) {
      out.push(`  produces: ${s.produces.join(', ')}  ->  ${scopeOf(name) === 'shared' ? rel(SHARED_DIR) : 'reports/<feature>'}/`)
    }
    out.push('')
  }
  return out.join('\n')
}

// ---------- validate / done ----------

function checkArtifacts(requested) {
  const name = requireStage(requested)
  if (!isLocatable(name)) {
    throw new Error(`/${cmdOf(name)} writes per-feature artifacts, but no feature is set — pass --project <slug> or --prd <file>.`)
  }
  const info = artifactInfo(name)
  const problems = []
  for (const m of info.missing) problems.push(`missing ${m}`)
  for (const bad of info.invalid) {
    for (const e of bad.errors.slice(0, 12)) problems.push(`${path.basename(bad.file)}: ${e}`)
    if (bad.errors.length > 12) problems.push(`${path.basename(bad.file)}: ...and ${bad.errors.length - 12} more`)
  }
  return { name, info, problems }
}

/**
 * Validates the MANIFEST rather than any artifact: the questions you want answered right after
 * editing the graph. Every check here exists because the failure it catches was silent — a stage
 * absent from the orchestrator, an artifact with no schema quietly falling back to existence-only,
 * a cycle producing a confident wrong plan. Run it after touching pipeline.json or the schemas.
 */
function cmdCheck() {
  const errors = []
  const warnings = []
  const names = Object.keys(STAGES)
  const real = names.filter(n => !STAGES[n].orchestrator)

  // --- graph integrity ---
  for (const n of names) {
    for (const d of [...(STAGES[n].requires || []), ...(STAGES[n].optional || [])]) {
      if (!STAGES[d]) errors.push(`${n}: depends on unknown stage "${d}"`)
    }
  }
  try {
    topoSort(real, true)
  } catch (err) {
    errors.push(err.message.replace(/^dependency cycle[^—]*— /, 'dependency cycle: '))
  }

  // --- gates are the one thing the graph must get right ---
  const gates = real.filter(isGate)
  const seenGateId = new Map()
  for (const n of gates) {
    const s = STAGES[n]
    if (!s.gate_id) {
      errors.push(`${n}: a gate with no "gate_id" cannot be addressed — \`gate <id>\` would have to guess, and guessing from "phase" is exactly how \`gate 3\` silently started addressing gate 2B.`)
    } else if (seenGateId.has(String(s.gate_id).toLowerCase())) {
      errors.push(`${n}: gate_id "${s.gate_id}" is already used by ${seenGateId.get(String(s.gate_id).toLowerCase())} — one handle cannot address two gates.`)
    } else {
      seenGateId.set(String(s.gate_id).toLowerCase(), n)
    }
    if ((s.produces || []).length !== 1) {
      errors.push(`${n}: a gate must produce exactly one artifact (the resolver reads produces[0] as the decision record), got ${(s.produces || []).length}.`)
    }
    if (s.standalone) errors.push(`${n}: a gate cannot be "standalone" — an unscheduled gate is not a gate.`)
    if (s.external) errors.push(`${n}: a gate cannot be "external" — pipeline.mjs writes its artifact, not a skill.`)
    if (s.per_item && !(s.roster_source && s.roster_field && s.roster_item_key)) {
      errors.push(`${n}: a per-item gate must declare roster_source, roster_field and roster_item_key, so the roster comes from the APPROVED checklist rather than from whatever assembly built.`)
    }
    // A gate nothing depends on is a gate you walk around: it appears in `status`, gets approved out
    // of habit, and gates nothing.
    const dependants = names.filter(m => [...(STAGES[m].requires || []), ...(STAGES[m].optional || [])].includes(n))
    if (!dependants.length) {
      errors.push(`${n}: no stage requires this gate, so nothing is behind it. A gate that gates nothing still shows up in status and still gets approved — it just has no effect.`)
    }
  }

  // A phase-N+1 stage must reach the gate closing phase N through its DEPENDENCY CHAIN. This is the
  // check that matters most and the one impossible to eyeball, because a stage can sit visibly after
  // a gate in `order` and `status` while its dependencies reach back around it.
  for (const n of real) {
    const s = STAGES[n]
    if (s.standalone || s.ungated || scopeOf(n) === 'shared') continue
    const p = phaseOf(n)
    if (!p) continue
    let reach
    try { reach = new Set(reachableDeps(n, true)) } catch { continue }
    for (const g of gates) {
      if (g === n || phaseOf(g) >= p) continue
      if (!reach.has(g)) {
        errors.push(`${n} (phase ${p}) does not depend — even transitively — on ${g} (the gate closing phase ${phaseOf(g)}). It sits after that gate in the listing but its dependency chain reaches around it, so invoking /${cmdOf(n)} directly would walk straight through the gate.`)
      }
    }
  }

  // An undocumented exemption is indistinguishable from a mistake.
  for (const n of real) {
    if (!isUngated(n)) continue
    if (!STAGES[n].$ungated) warnings.push(`${n}: marked "ungated" with no "$ungated" explanation — say why this stage must be producible on every outcome, including a run abandoned at a gate.`)
  }

  // The resolver finds a stage by first match, so a duplicate command makes one of them unaddressable.
  const seenCmd = new Map()
  for (const n of names) {
    const c = cmdOf(n)
    if (seenCmd.has(c)) errors.push(`${n}: command "${c}" is already used by ${seenCmd.get(c)} — the resolver finds a stage by first match, so one of the two cannot be addressed at all (\`done\` would record the wrong stage).`)
    else seenCmd.set(c, n)
  }

  // --- the skill actually exists ---
  for (const n of real) {
    if (STAGES[n].external) {
      // A stage that declares `invokes` is addressed by its own key and loads someone else's skill;
      // that is not a missing command.
      if (!STAGES[n].command && !STAGES[n].invokes) warnings.push(`${n}: external but has no "command" or "invokes", so it will be invoked as "${n}"`)
      continue
    }
    if (isGate(n)) {
      // A gate's artifact is written by pipeline.mjs, but its SKILL.md is what tells the AI how to
      // build the packet and what to ask.
      if (!fs.existsSync(path.join(ROOT, '.claude', 'skills', n, 'SKILL.md'))) {
        errors.push(`${n}: no skill at .claude/skills/${n}/SKILL.md — there is nothing to tell the AI how to present this gate`)
      }
      continue
    }
    const skill = path.join(ROOT, '.claude', 'skills', n, 'SKILL.md')
    if (!fs.existsSync(skill)) errors.push(`${n}: no skill at .claude/skills/${n}/SKILL.md — the stage exists in the graph but there is nothing to invoke`)
  }

  // --- every artifact is actually checked ---
  const produced = new Set()
  for (const n of real) {
    const produces = STAGES[n].produces || []
    if (!produces.length) {
      warnings.push(`${n}: produces nothing, so it can never be satisfied and will run on every pass`)
      continue
    }
    for (const p of produces) {
      produced.add(p)
      if (p.includes('*')) continue // wildcard artifacts (the report) are existence-only by design
      if (!SCHEMA_BY_ARTIFACT[p]) {
        errors.push(`${n}: "${p}" has no schema in .claude/schemas/artifacts.json — validation silently degrades to "the file exists", which is how an empty {} passes`)
      }
    }
  }
  for (const key of Object.keys(SCHEMA_BY_ARTIFACT)) {
    if (key.startsWith('$')) continue
    if (!produced.has(key)) warnings.push(`schemas: "${key}" has a schema but no stage produces it`)
  }

  // --- standalone means standalone: nothing may depend on it ---
  // Without this, the flag lies. A stage that requires a standalone one pulls it into every plan
  // that reaches the dependant, so it runs anyway — while the manifest claims it was opted out.
  for (const n of names) {
    for (const d of [...(STAGES[n].requires || []), ...(STAGES[n].optional || [])]) {
      if (STAGES[d] && STAGES[d].standalone) {
        const how = (STAGES[n].requires || []).includes(d) ? 'requires' : 'lists as optional'
        errors.push(`${n} ${how} "${d}", which is marked standalone — so it would be pulled in as a prerequisite despite being opted out of the run. Either drop the dependency or drop "standalone" from ${d}.`)
      }
    }
  }

  // --- orchestrators reach everything they are meant to ---
  for (const n of names.filter(k => STAGES[k].orchestrator)) {
    const expected = real.filter(s => !STAGES[s].standalone)
    const explicit = STAGES[n].runs_all
    if (!explicit || !explicit.length) continue
    const missing = expected.filter(s => !explicit.includes(s))
    if (missing.length) {
      errors.push(`${n}: runs_all omits ${missing.join(', ')} — /${cmdOf(n)} would silently skip ${missing.length > 1 ? 'them' : 'it'}. Delete runs_all to derive it from the stage list, or mark the stage "standalone" so the exclusion is declared where it belongs.`)
    }
  }

  // --- display order is merely confusing, not load-bearing ---
  const seenOrder = new Map()
  for (const n of names) {
    const o = STAGES[n].order
    if (o === undefined) { warnings.push(`${n}: no "order", so it sorts first among independent stages`); continue }
    if (seenOrder.has(o)) warnings.push(`${n}: shares order ${o} with ${seenOrder.get(o)} — listing between them is arbitrary`)
    else seenOrder.set(o, n)
    for (const d of STAGES[n].requires || []) {
      if (STAGES[d] && STAGES[d].order > o) {
        warnings.push(`${n} (order ${o}) requires ${d} (order ${STAGES[d].order}) — execution is correct, but the numbering reads backwards`)
      }
    }
  }

  const out = []
  out.push(`MANIFEST CHECK  ${rel(MANIFEST)}  —  ${real.length} stages, ${Object.keys(SCHEMA_BY_ARTIFACT).filter(k => !k.startsWith('$')).length} schemas`)
  out.push('')
  if (errors.length) {
    out.push(`ERRORS (${errors.length}) — these break the pipeline:`)
    for (const e of errors) out.push(`  ✗ ${e}`)
    out.push('')
  }
  if (warnings.length) {
    out.push(`WARNINGS (${warnings.length}) — worth a look, not fatal:`)
    for (const w of warnings) out.push(`  ! ${w}`)
    out.push('')
  }
  if (!errors.length && !warnings.length) out.push('All checks passed.')
  else if (!errors.length) out.push('No errors.')

  out.push('')
  out.push('EXECUTION ORDER (from the graph, not the order field):')
  try {
    topoSort(real, true).forEach((n, i) => {
      const tags = []
      if (scopeOf(n) === 'shared') tags.push('shared')
      if (STAGES[n].standalone) tags.push('standalone — NOT run by /run-prd-workflow')
      out.push(`  ${String(i + 1).padStart(2)}. /${cmdOf(n)}${tags.length ? `  [${tags.join(', ')}]` : ''}`)
    })
  } catch {
    out.push('  (cannot be computed — fix the cycle above)')
  }

  // Say out loud what the orchestrator will not do. An opted-out stage is otherwise invisible
  // until someone wonders why its artifact never appears.
  if (gates.length) {
    out.push('')
    out.push(`HUMAN GATES (${gates.length}) — \`done\` refuses these; only \`pipeline.mjs gate\` writes their signoff:`)
    for (const n of gates.sort(byOrder)) {
      const behind = real.filter(m => { try { return reachableDeps(m, true).includes(n) } catch { return false } })
      out.push(`  gate ${String(STAGES[n].gate_id).padEnd(3)} /${cmdOf(n).padEnd(22)} closes phase ${phaseOf(n)} — ${behind.length} stage(s) behind it`)
    }
  }
  const exempt = real.filter(isUngated)
  if (exempt.length) {
    out.push('')
    out.push(`UNGATED (${exempt.length}) — exempt from the phase-gate rule and from gate blocking, transitively:`)
    for (const n of exempt) out.push(`  /${cmdOf(n)}${STAGES[n].$ungated ? ` — ${STAGES[n].$ungated}` : ''}`)
  }

  const standalone = real.filter(n => STAGES[n].standalone)
  if (standalone.length) {
    out.push('')
    out.push(`STANDALONE (${standalone.length}) — in the graph, but no orchestrator runs them; invoke directly:`)
    for (const n of standalone) out.push(`  /${cmdOf(n)}${scopeOf(n) === 'shared' ? '  [shared]' : ''}`)
  }

  console.log(out.join('\n'))
  return errors.length ? 1 : 0
}

function cmdValidate(requested) {
  const { name, info, problems } = checkArtifacts(requested)
  if (problems.length) {
    console.error(`INVALID  /${cmdOf(name)}  (${rel(dirOf(name))}/)`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error('')
    console.error('Fix the artifact and re-check. A stage is only done when its files exist AND match')
    console.error('.claude/schemas/artifacts.json — a partial file would mark a stage that never ran as complete.')
    return 1
  }
  console.log(`VALID  /${cmdOf(name)}  ${info.found.map(rel).join(', ')}`)
  // For a gate, "valid" is not "passed" — the artifact validates whatever the verdict is, since a
  // rejection is a well-formed decision record. Say so here, or `validate` reads as a green light
  // while `plan` reports the run parked.
  if (isGate(name)) {
    const gs = gateState(name)
    console.log('')
    console.log(gs.satisfied
      ? `GATE OPEN — ${gs.reason}`
      : `...but the GATE IS CLOSED: ${gs.reason}\nValidating is not passing: this artifact validates whatever the verdict is.`)
    return gs.satisfied ? 0 : 1
  }
  return 0
}

function cmdDone(requested) {
  // `done` is the reflex every other skill ends with. A gate that accepted it would be closed by
  // habit rather than by a decision, so it is refused here — before the artifacts are even looked at.
  const asked = resolveStage(requested)
  if (asked && isGate(asked)) {
    const stage = STAGES[asked]
    console.error(`REFUSED  /${cmdOf(asked)} is a HUMAN GATE — \`done\` cannot close it.`)
    console.error('')
    console.error('`done` records that a skill wrote an artifact. This artifact records that a PERSON made a')
    console.error('decision, and a gate signed by the thing being gated is not a gate. Present the packet, ask,')
    console.error('wait for the answer, and record the answer they actually gave:')
    console.error(`  node utils/pipeline.mjs gate ${stage.gate_id} --approve|--changes-requested|--reject --by "<person>"${(stage.checks || []).length ? ' --checked all' : ''}`)
    console.error('')
    console.error('--by is required, and "claude", "ai", "assistant", "auto", "self" and friends are rejected.')
    logEvent('refused', '`done` was run on a gate and refused — only `gate … --by <person>` can close it', asked)
    return 1
  }

  const { name, info, problems } = checkArtifacts(requested)
  if (problems.length) {
    console.error(`NOT RECORDED  /${cmdOf(name)}  — the artifacts do not satisfy their contract:`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error('')
    console.error('Nothing was recorded, so the stage stays pending. Write a complete artifact, then re-run this.')
    // A `done` that failed its contract and was then quietly abandoned is exactly the kind of hole
    // the ledger exists to close.
    logEvent('failed', `artifacts rejected — ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}`, name)
    return 1
  }

  const dir = dirOf(name)
  const state = readState(dir)
  const prints = inputPrints(name)
  state[name] = {
    inputs: prints,
    artifacts: info.found.map(f => path.basename(f)),
    recorded_at: new Date().toISOString(),
  }
  writeState(dir, state)

  console.log(`RECORDED  /${cmdOf(name)}  ${info.found.map(rel).join(', ')}`)
  logEvent('done', `wrote ${info.found.map(f => path.basename(f)).join(', ')}`, name)
  const tracked = Object.entries(prints)
  const unset = tracked.filter(([, v]) => v === null).map(([k]) => k)

  if (tracked.length) {
    console.log('Built from:')
    for (const [k, v] of tracked) console.log(`  ${k.padEnd(22)} ${v === null ? 'NOT SET — untracked' : v}`)
  } else {
    console.log('This stage declares no tracked inputs; its freshness follows its upstream artifacts.')
  }
  if (tracked.length > unset.length) {
    console.log('If those change, this stage and everything downstream go stale automatically.')
  }
  // Saying "recorded" while the thing that defines this stage's output is unset would be a lie:
  // there is nothing to compare against later, so a completely different input reads as unchanged.
  if (unset.length) {
    console.log('')
    console.log(`WARNING: ${unset.join(', ')} ${unset.length > 1 ? 'are' : 'is'} not set, so ${unset.length > 1 ? 'they cannot' : 'it cannot'} be fingerprinted.`)
    console.log('Nothing will detect a change to it, and this stage will keep reading as up to date even')
    console.log('after the real input has been replaced. If the source arrived as pasted text, save it to')
    console.log('a file first and pass --prd <that file> (see /prd-analyzer, "Pasted PRDs").')
  }
  if (tracked.some(([, v]) => v && v.startsWith('value:'))) {
    const maxAge = STAGES[name].max_age_days
    console.log('')
    console.log('Note: a URL input is fingerprinted by the URL itself, so edits made remotely (e.g. in the')
    console.log(maxAge
      ? `Figma file) cannot be detected here — this stage expires after ${maxAge}d instead, or use --force.`
      : 'Figma file) cannot be detected here. Re-run with --force when the source has changed.')
  }
  return 0
}

// ---------- gate commands ----------

/**
 * Where each gate's open decisions come from. They are RAISED by an AI stage and ANSWERED by a human
 * here — which is the reversal that matters: a default taken in phase 1 is a decision made before the
 * person accountable for it ever saw the question. `recommended` is carried through beside `answer`
 * specifically so that a human choosing AGAINST the recommendation survives into the closure report.
 */
const DECISION_SOURCES = {
  'gate-1-requirements': [{
    file: '01_prd_requirements.json', raised_by: 'prd-analyzer',
    pick: doc => (doc.open_decisions || []).map(d => ({
      decision: d.decision, options: d.options || [], recommended: d.recommended || undefined,
    })),
  }],
  // Gate 2 seeds nothing on purpose: it is a review of built components, not of the mapping that
  // specified them. The consequence is stated rather than hidden — a product-level escalation from
  // /component-analyzer no longer has a gate that refuses to open while it is unanswered. It is
  // raised in 06_component_analysis.json and reported by /closure-reporter.
}

/** The artifact a gate's approval pins, for the gates whose contract declares a fingerprint. */
function pinnedChecklist(name) {
  const schema = SCHEMA_BY_ARTIFACT[(STAGES[name].produces || [])[0]] || {}
  if (!(schema.properties || {}).checklist_fingerprint) return null
  const upstream = (STAGES[name].requires || []).find(d => !isGate(d))
  const artifact = upstream && (STAGES[upstream].produces || []).find(p => !p.includes('*'))
  return artifact || null
}

function seedDecisions(name) {
  const seeded = []
  for (const src of DECISION_SOURCES[name] || []) {
    const f = path.join(OUT_DIR, src.file)
    if (!fs.existsSync(f)) continue
    try {
      for (const d of src.pick(readJson(f))) {
        if (d.decision) seeded.push({ ...d, raised_by: src.raised_by, answer: '' })
      }
    } catch { /* an unreadable upstream artifact is the upstream stage's problem, not the gate's */ }
  }
  return seeded
}

function verdictFromFlags() {
  const picked = ['--approve', '--changes-requested', '--reject'].filter(f => flags.has(f))
  if (picked.length > 1) throw new Error(`pick one verdict, not ${picked.join(' and ')}.`)
  return picked.length
    ? { '--approve': 'approved', '--changes-requested': 'changes_requested', '--reject': 'rejected' }[picked[0]]
    : null
}

/**
 * `--by` is required, and the obvious self-approval values are rejected outright. The REFUSAL is
 * logged before it throws: an attempted self-approval that leaves no trace is, in the record,
 * identical to never having happened — and this is the one failure gates exist to prevent.
 */
function requirePerson(gate, verdict) {
  const who = OPTS.by
  if (!who || !who.trim()) {
    throw new Error(`--by "<person>" is required to record a gate decision. A gate with no name against it is not a decision, it is a default.`)
  }
  if (isSelfApproval(who)) {
    logEvent('REFUSED', `self-approval attempt rejected — \`--by "${who}"\` on verdict \`${verdict}\``, gate)
    throw new Error(
      `--by "${who}" is refused. A gate signed by the thing being gated is not a gate.\n` +
      `        Ask the person reviewing this for their name and record that. The refusal has been\n` +
      `        written to the workflow log.`
    )
  }
  return who.trim()
}

/** `--checked all` or `--checked "a,b"`, validated against the checks the manifest declares. */
function resolveChecked(name, existing) {
  const declared = STAGES[name].checks || []
  const checked = { ...existing }
  for (const c of declared) if (checked[c] === undefined) checked[c] = false
  if (!OPTS.checked) return checked
  if (!declared.length) throw new Error(`/${cmdOf(name)} declares no checks, so there is no --checked here — the decision itself is the check.`)
  if (OPTS.checked.trim().toLowerCase() === 'all') {
    for (const c of declared) checked[c] = true
    return checked
  }
  const named = OPTS.checked.split(',').map(s => s.trim()).filter(Boolean)
  const unknown = named.filter(c => !declared.includes(c))
  if (unknown.length) {
    throw new Error(`unknown check(s): ${unknown.join(', ')}\n        Valid for /${cmdOf(name)}: ${declared.join(', ')}\n        Or pass --checked all if the person confirmed every one.`)
  }
  for (const c of named) checked[c] = true
  return checked
}

/** --decision "<substring of the question>=<the answer they gave>", repeatable. */
function applyDecisionAnswers(decisions, who) {
  for (const raw of OPTS.decisions) {
    const i = raw.indexOf('=')
    if (i === -1) throw new Error(`--decision must be "<match>=<answer>", got: ${raw}`)
    const match = raw.slice(0, i).trim().toLowerCase()
    const answer = raw.slice(i + 1).trim()
    const hit = decisions.filter(d => String(d.decision).toLowerCase().includes(match))
    if (!hit.length) throw new Error(`--decision "${match}" matches none of: ${decisions.map(d => d.decision).join(' | ') || '(no open decisions)'}`)
    if (hit.length > 1) throw new Error(`--decision "${match}" is ambiguous — it matches ${hit.length} decisions. Use more of the question.`)
    hit[0].answer = answer
    hit[0].decided_by = who
    hit[0].decided_at = new Date().toISOString()
  }
}

/**
 * The state vocabulary this tool REPORTS, which is deliberately smaller than the one it computes.
 * `incomplete` — recorded as approved while a check is unconfirmed or a decision unanswered — is
 * reported as `awaiting`, because it is not an open gate and the single word an orchestrator acts on
 * must not suggest otherwise. Mirrored by GATE_STATE in .claude/workflows/prd-to-figma.js.
 */
const REPORTED_STATE = {
  ok: 'approved',
  incomplete: 'awaiting',
  invalid: 'malformed',
  awaiting: 'awaiting',
  changes_requested: 'changes_requested',
  rejected: 'rejected',
  'stale-checklist': 'stale-checklist',
  'stale-upstream': 'stale-upstream',
}

/** Report where a gate stands, and — when it is shut despite an approval — exactly why. */
function renderGate(gs) {
  const stage = STAGES[gs.skill]
  const out = [`GATE ${gs.gate_id}  /${gs.command}   (closes phase ${gs.phase})   ${rel(gs.file)}`, '']
  // A verbatim, machine-readable token, so a reader never has to INFER the state from prose — and
  // in particular never rounds "approved, but a check is unconfirmed" up to approved. That is why
  // `incomplete` reports as `awaiting`: an approval on file is not an open gate, and the one word
  // an orchestrator acts on must say so.
  out.push(`STATE: ${REPORTED_STATE[gs.state] || gs.state}`)
  out.push(gs.satisfied ? `OPEN — ${gs.reason}` : `CLOSED — ${gs.reason}`)

  if (gs.schemaErrors.length) {
    out.push('')
    out.push('The signoff does not match its contract, so it does not open the gate:')
    for (const e of gs.schemaErrors.slice(0, 10)) out.push(`  - ${e}`)
  }
  if (gs.openDecisions.length) {
    out.push('')
    out.push('DECISIONS STILL UNANSWERED — the gate cannot open while any of these is empty:')
    for (const d of gs.openDecisions) out.push(`  ? ${d}`)
    out.push(`  Record each answer:  --decision "<part of the question>=<what they decided>"`)
  }
  if (gs.unchecked.length) {
    out.push('')
    out.push('CHECKS NOT CONFIRMED:')
    for (const c of gs.unchecked) out.push(`  [ ] ${c}`)
    out.push(`  Record them:  --checked "${gs.unchecked.join(',')}"   (or --checked all)`)
  }
  if (gs.staleChecklist) {
    out.push('')
    out.push(`STALE: ${gs.staleChecklist}.`)
    out.push('The signoff no longer describes what exists, so it has to be re-taken. Neither --force nor')
    out.push('--no-stale re-opens it: those are statements about caching, and a flag about caching must')
    out.push('not revoke a person\'s judgement.')
  }
  if (gs.perItem && gs.pages.length) {
    out.push('')
    out.push(`PAGES (${gs.pages.filter(p => p.status === 'approved').length}/${gs.pages.length} approved):`)
    for (const p of gs.pages) out.push(`  ${p.status === 'approved' ? '[x]' : '[ ]'} ${String(p.page).padEnd(34)} ${p.status}${p.decided_by ? ` — ${p.decided_by}` : ''}`)
  }
  if (gs.record && Array.isArray(gs.record.history) && gs.record.history.length > 1) {
    out.push('')
    out.push('HISTORY (a gate that bounced twice before passing is a different fact from one that passed first time):')
    for (const h of gs.record.history) out.push(`  ${String(h.decided_at || '').slice(0, 16).replace('T', ' ')}  ${h.verdict.padEnd(18)} ${h.decided_by}${h.notes ? ` — ${h.notes}` : ''}`)
  }
  if (!gs.exists) {
    out.push('')
    out.push(`Load /${gs.command}, build the packet, present it, ASK, and WAIT. Then:`)
    out.push(`  node utils/pipeline.mjs gate ${gs.gate_id} --approve --by "<person>"${(stage.checks || []).length ? ' --checked all' : ''}`)
  }
  return out.join('\n')
}

function cmdGate(handle) {
  const name = requireGate(handle)
  const stage = STAGES[name]
  const verdict = verdictFromFlags()

  if (flags.has('--init')) return cmdGateInit(name)
  if (stage.per_item) {
    if (!verdict) return (console.log(renderGate(gateState(name))), 0)
    return cmdGatePage(name, verdict)
  }
  if (OPTS.page) throw new Error(`/${cmdOf(name)} is not a per-item gate — --page applies only to /${cmdOf(Object.keys(STAGES).find(n => STAGES[n].per_item))}.`)
  if (!verdict) return (console.log(renderGate(gateState(name))), 0)

  const who = requirePerson(name, verdict)
  const file = gateFileOf(name)
  const prior = fs.existsSync(file) ? (() => { try { return readJson(file) } catch { return null } })() : null
  const at = new Date().toISOString()

  // Decisions carry across rounds — including the answers already given — and are seeded from the
  // stages that raised them the first time this gate is recorded.
  const decisions = (prior && Array.isArray(prior.decisions) && prior.decisions.length)
    ? prior.decisions.map(d => ({ ...d }))
    : seedDecisions(name)
  applyDecisionAnswers(decisions, who)

  const record = {
    gate: name,
    phase: phaseOf(name),
    verdict,
    decided_by: who,
    decided_at: at,
    ...(OPTS.note ? { notes: OPTS.note } : {}),
    // Every verdict stays in history, oldest first.
    history: [...((prior && Array.isArray(prior.history)) ? prior.history : []), {
      verdict, decided_by: who, decided_at: at, ...(OPTS.note ? { notes: OPTS.note } : {}),
    }],
    checked: resolveChecked(name, (prior || {}).checked || {}),
    decisions,
  }

  if (verdict !== 'approved') {
    // The backwards arrow in the flowchart, written down.
    record.bounced_to = (stage.requires || []).filter(d => !isGate(d))
  }
  if (OPTS.iteration) record.iteration = Number(OPTS.iteration)
  else if (prior && prior.iteration) record.iteration = prior.iteration

  const pin = pinnedChecklist(name)
  if (pin) {
    const pinFile = path.join(OUT_DIR, pin)
    record.checklist_ref = OPTS.checklistRef || pin
    if (fs.existsSync(pinFile)) record.checklist_fingerprint = fileHash(pinFile)
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n')

  // Recording is not opening. Re-read through the same code path everything else uses, so the
  // command can never claim a gate opened that `plan` will report as shut.
  const gs = gateState(name)
  console.log(`RECORDED  gate ${gs.gate_id} /${gs.command}  verdict: ${verdict}  by: ${who}`)
  console.log(`          ${rel(file)}`)
  console.log('')
  console.log(gs.satisfied
    ? `GATE OPEN — everything behind /${gs.command} may now proceed.`
    : `GATE STILL CLOSED. Recording a verdict is not the same as opening the gate:`)
  if (!gs.satisfied) {
    console.log('')
    console.log(renderGate(gs).split('\n').slice(2).join('\n'))
  }
  logEvent(
    gs.satisfied ? 'GATE OPENED' : 'gate decision',
    `verdict \`${verdict}\` by **${who}**${OPTS.note ? ` — ${OPTS.note}` : ''}${gs.satisfied ? '' : ` — gate did NOT open: ${gs.reason}`}`,
    name,
  )
  return gs.satisfied || verdict !== 'approved' ? 0 : 1
}

// ---------- per-item gate: one decision PER PAGE ----------

/** All gates this gate sits behind. Assembly may not start while any of them is shut. */
const upstreamGates = name => reachableDeps(name, false).filter(isGate)

function assertUpstreamGatesOpen(name, { fatal = true } = {}) {
  // Topologically ordered, so the EARLIEST shut gate is named. Reporting gate 2B while gate 2 is
  // also shut sends you to re-take a gate whose own prerequisite has not been taken.
  const gates = upstreamGates(name)
  const shut = topoSort(gates, false).filter(g => gates.includes(g)).map(gateState).filter(g => !g.satisfied)
  if (!shut.length) return null
  const g = shut[0]
  const msg = [
    `STOP — /${g.command} is ${g.state === 'awaiting' ? 'AWAITING' : g.state.toUpperCase()}, so nothing here may be built yet.`,
    `  ${g.reason}`,
  ].join('\n')
  if (fatal) { console.error(msg); process.exit(1) }
  return msg
}

function cmdGateInit(name) {
  const stage = STAGES[name]
  if (!stage.per_item) throw new Error(`--init seeds a per-item roster; /${cmdOf(name)} has no items.`)

  // Every refusal below is fixed UPSTREAM, never here.
  assertUpstreamGatesOpen(name)

  const src = path.join(OUT_DIR, stage.roster_source)
  if (!fs.existsSync(src)) throw new Error(`cannot seed the roster: ${stage.roster_source} does not exist yet.`)
  const srcErrors = validateArtifact(src, stage.roster_source)
  if (srcErrors.length) {
    // Validated before it is read: a screen with no name produced a roster entry with no `page` key,
    // and then `pages` crashed, `next-page` announced "undefined", and the decision could not be
    // recorded at all — gate 3 was unrecoverable except by hand-editing the artifact.
    console.error(`cannot seed the roster: ${stage.roster_source} does not satisfy its contract:`)
    for (const e of srcErrors.slice(0, 10)) console.error(`  - ${e}`)
    console.error('')
    console.error('Fix it in /figma-modifier and re-take gate 2 — the checklist changed — then seed again.')
    return 1
  }

  const items = (readJson(src)[stage.roster_field] || [])
  const named = items.map(s => (s || {})[stage.roster_item_key]).map(n => (typeof n === 'string' ? n.trim() : ''))
  if (!named.length) throw new Error(`${stage.roster_source} \`${stage.roster_field}\` is empty — a module with no pages is a seeding failure, not an empty module.`)
  const unnamed = named.filter(n => !n).length
  if (unnamed) throw new Error(`${unnamed} screen(s) in ${stage.roster_source} have no \`${stage.roster_item_key}\`. A page that cannot be named cannot be signed off, so it would sit pending forever. Name them in /figma-modifier.`)

  // `--page` resolves case-insensitively, so a case-only collision would leave one of the two
  // permanently unreachable. Refused rather than de-duplicated: de-duplicating loses a page silently.
  const seen = new Map()
  for (const n of named) {
    const k = n.toLowerCase()
    if (seen.has(k)) throw new Error(`two screens differ only in case: "${seen.get(k)}" and "${n}". --page resolves case-insensitively, so one would be unreachable. Rename one in /figma-modifier.`)
    seen.set(k, n)
  }

  const file = gateFileOf(name)
  const prior = fs.existsSync(file) ? (() => { try { return readJson(file) } catch { return null } })() : null
  const priorPages = new Map(((prior || {}).pages || []).map(p => [String(p.page).toLowerCase(), p]))

  // A re-seed PRESERVES decisions already taken, including through a case-only rename: an approval
  // given for "Inbox" is evidence about the frame, not about the string.
  const pages = named.map(n => {
    const kept = priorPages.get(n.toLowerCase())
    priorPages.delete(n.toLowerCase())
    return kept ? { ...kept, page: n } : { page: n, status: 'pending', iterations: 0, history: [] }
  })

  const dropped = [...priorPages.values()].filter(p => p.status && p.status !== 'pending')
  const record = {
    gate: name, phase: phaseOf(name), module: PROJECT,
    checklist_ref: stage.roster_source,
    seeded_at: (prior || {}).seeded_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    verdict: pages.every(p => p.status === 'approved') ? 'approved' : 'awaiting',
    pages,
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n')

  console.log(`SEEDED  gate ${stage.gate_id} /${cmdOf(name)}  ${pages.length} page(s) from ${stage.roster_source} \`${stage.roster_field}\``)
  for (const p of pages) console.log(`  ${p.status === 'approved' ? '[x]' : '[ ]'} ${p.page}${p.status !== 'pending' ? `  (${p.status}, carried over)` : ''}`)
  if (dropped.length) {
    // Said LOUDLY: a page that quietly leaves the roster leaves the module reading as fully
    // approved without it, which is the exact failure seeding-from-the-checklist exists to prevent.
    console.log('')
    console.log(`WARNING: ${dropped.length} page(s) left the checklist, and the decision recorded against each was DROPPED:`)
    for (const p of dropped) console.log(`  - "${p.page}" (was ${p.status}${p.decided_by ? ` by ${p.decided_by}` : ''})`)
    console.log('If that removal was not deliberate, restore the page in /figma-modifier and re-take gate 2')
    console.log('(the checklist changed) rather than carrying on.')
  }
  logEvent('roster seeded', `${pages.length} page(s) from ${stage.roster_source}${dropped.length ? ` — DROPPED decisions for: ${dropped.map(p => `"${p.page}" (${p.status})`).join(', ')}` : ''}`, name)
  console.log('')
  console.log('Next: node utils/pipeline.mjs next-page')
  return 0
}

function cmdGatePage(name, verdict) {
  const stage = STAGES[name]
  const file = gateFileOf(name)
  if (!fs.existsSync(file)) throw new Error(`no roster yet — seed it first:  node utils/pipeline.mjs gate ${stage.gate_id} --init`)
  if (!OPTS.page) {
    throw new Error(
      `--page "<name>" is required. A blanket verdict across pages is precisely what this gate exists\n` +
      `        to prevent, so it is refused. See the roster:  node utils/pipeline.mjs pages`
    )
  }
  const who = requirePerson(name, verdict)
  const record = readJson(file)
  const pages = record.pages || []
  const hit = pages.filter(p => String(p.page).toLowerCase() === OPTS.page.trim().toLowerCase())
  if (!hit.length) throw new Error(`"${OPTS.page}" is not on the roster. Pages: ${pages.map(p => `"${p.page}"`).join(', ')}`)
  const page = hit[0]
  const at = new Date().toISOString()

  // An approval recorded while an earlier page was still pending is not refused — a designer
  // reviewing page 3 first is making a real decision — but it is never left silent.
  const earlierPending = pages.slice(0, pages.indexOf(page)).filter(p => p.status !== 'approved')

  page.status = verdict === 'approved' ? 'approved' : verdict
  page.decided_by = who
  page.decided_at = at
  // `notes` describes THIS decision. Carrying the previous round's note onto an approval would
  // leave "the bell icon is wrong" attached to a page that was just signed off; history keeps it.
  if (OPTS.note) page.notes = OPTS.note
  else delete page.notes
  if (OPTS.node) page.node_id = OPTS.node
  if (OPTS.figmaUrl) page.figma_url = OPTS.figmaUrl
  if (flags.has('--manually-edited')) page.manually_edited = true
  if (OPTS.deviations.length) {
    page.deviations_approved = [...new Set([...(page.deviations_approved || []), ...OPTS.deviations])]
  }
  if (verdict === 'changes_requested') page.iterations = (page.iterations || 0) + 1
  page.history = [...(page.history || []), { status: page.status, decided_by: who, decided_at: at, ...(OPTS.note ? { notes: OPTS.note } : {}) }]

  record.updated_at = at
  record.verdict = pages.every(p => p.status === 'approved') ? 'approved' : 'awaiting'
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n')

  const gs = gateState(name)
  console.log(`RECORDED  page "${page.page}"  ->  ${page.status}  by: ${who}`)
  if (page.manually_edited) {
    console.log('')
    console.log('--manually-edited: the frame was changed by hand, so assembly AND phase 4 must RE-INSPECT it')
    console.log('live rather than trusting a last-known state. A spec built from a stale frame starts here.')
  }
  if (earlierPending.length) {
    console.log('')
    console.log(`NOTE: recorded while ${earlierPending.length} earlier page(s) were still undecided: ${earlierPending.map(p => `"${p.page}"`).join(', ')}.`)
    console.log('Not refused — reviewing out of order is a real decision — but the ledger is the only evidence')
    console.log('afterwards that the one-page-at-a-time rule was followed, so it is recorded rather than silent.')
  }
  console.log('')
  console.log(gs.satisfied
    ? `GATE OPEN — every page in this module is approved. Phase 4 may start.`
    : `${gs.pages.filter(p => p.status === 'approved').length}/${gs.pages.length} approved. Next: node utils/pipeline.mjs next-page`)
  logEvent('page decision', `"${page.page}" -> **${page.status}** by ${who}${page.manually_edited ? ' (manually edited — re-inspect live)' : ''}${OPTS.note ? ` — ${OPTS.note}` : ''}${earlierPending.length ? ` [recorded out of order; ${earlierPending.length} earlier page(s) undecided]` : ''}`, name)
  return 0
}

/** The single hard rule of the pipeline, as a command that exits non-zero rather than a paragraph. */
function cmdNextPage() {
  const name = Object.keys(STAGES).find(n => STAGES[n].per_item)
  if (!name) throw new Error('no per-item gate in the manifest.')
  requireGate(name)
  assertUpstreamGatesOpen(name) // exits 1 — it used to say ASSEMBLE THIS PAGE regardless, telling
                                // assembly to make exactly the Figma writes gate 2 had withheld.
  const gs = gateState(name)
  if (!gs.exists) {
    console.error(`no roster yet — seed it first:  node utils/pipeline.mjs gate ${STAGES[name].gate_id} --init`)
    return 1
  }
  if (gs.satisfied) {
    console.log('EVERY PAGE IS APPROVED — there is no next page. Phase 4 may start.')
    return 0
  }
  const next = gs.nextItem
  if (next.status === 'rejected') {
    console.error(`STOP — "${next.page}" was REJECTED${next.notes ? `: ${next.notes}` : ''}.`)
    console.error('A rejection needs a decision above assembly and may loop back to phase 2. Raise it; do not')
    console.error('move on to another page.')
    return 1
  }
  const rest = gs.pending.slice(1)
  console.log(`ASSEMBLE THIS PAGE — and only this one:`)
  console.log('')
  console.log(`  ${next.page}${next.status === 'changes_requested' ? `   (REVISE — changes requested, iteration ${next.iterations || 1}${next.notes ? `: ${next.notes}` : ''})` : ''}`)
  if (next.manually_edited) console.log('  The designer edited this frame by hand — RE-INSPECT it live before touching it.')
  console.log('')
  if (rest.length) {
    console.log('NOT YET (do not read ahead, do not plan them — feedback on this page routinely changes them):')
    for (const p of rest) console.log(`  - ${p.page} (${p.status})`)
  } else {
    console.log('This is the last undecided page in the module.')
  }
  console.log('')
  console.log('Build it, present it, and STOP. Then record the person\'s decision:')
  console.log(`  node utils/pipeline.mjs gate ${STAGES[name].gate_id} --page "${next.page}" --approve --by "<person>" --node "<id>"`)
  logEvent('next page', `assembly handed "${next.page}" (${next.status})`, name)
  return 0
}

function cmdPages() {
  const name = Object.keys(STAGES).find(n => STAGES[n].per_item)
  requireGate(name)
  // Reading the ledger is not building anything, so this prints the banner and still shows it.
  const banner = assertUpstreamGatesOpen(name, { fatal: false })
  if (banner) { console.log(banner); console.log('') }

  const gs = gateState(name)
  if (!gs.exists) {
    console.log(`No roster yet. Seed it:  node utils/pipeline.mjs gate ${STAGES[name].gate_id} --init`)
    return 1
  }
  const out = [`PAGE DECISIONS  ${PROJECT}  —  ${gs.pages.filter(p => p.status === 'approved').length}/${gs.pages.length} approved`, '']
  let sawPending = false
  const outOfOrder = []
  for (const p of gs.pages) {
    const mark = { approved: '[x]', pending: '[ ]', changes_requested: '[~]', rejected: '[!]' }[p.status] || '[?]'
    const bits = [
      p.decided_by ? `by ${p.decided_by}` : null,
      p.decided_at ? String(p.decided_at).slice(0, 16).replace('T', ' ') : null,
      p.iterations ? `${p.iterations} revision(s)` : null,
      p.manually_edited ? 'MANUALLY EDITED — re-inspect live' : null,
      (p.deviations_approved || []).length ? `deviations: ${p.deviations_approved.join(', ')}` : null,
      p.node_id ? `node ${p.node_id}` : null,
    ].filter(Boolean)
    out.push(`${mark} ${String(p.page).padEnd(34)} ${p.status.padEnd(18)} ${bits.join(' · ')}`)
    if (p.notes) out.push(`${' '.repeat(4)}${p.notes}`)
    if (p.status === 'approved' && sawPending) outOfOrder.push(p)
    if (p.status !== 'approved') sawPending = true
  }
  out.push('')
  out.push('[x] approved  [ ] pending  [~] changes requested — same page goes back  [!] rejected — decide above assembly')
  if (outOfOrder.length) {
    out.push('')
    out.push(`NOTE: ${outOfOrder.length} page(s) were approved while an earlier page was still undecided:`)
    for (const p of outOfOrder) out.push(`  - "${p.page}"`)
    out.push('Not an error — reviewing out of order is a real decision — but after the fact this ledger is')
    out.push('the only evidence the one-page-at-a-time rule was followed, so it is never left silent.')
  }
  out.push('')
  out.push(gs.satisfied
    ? 'Every page is approved — this gate is OPEN and phase 4 may start.'
    : 'One page undecided blocks all of phase 4: a handoff spec for a partially-approved module presents')
  if (!gs.satisfied) out.push('unapproved work as shippable.')
  console.log(out.join('\n'))
  return 0
}

/**
 * For what the CLI cannot see: a Figma write, an escalation, a decision taken in conversation, a page
 * hand-edited by the designer. Those are the actions with no artifact of their own until much later,
 * so they are exactly the ones the ledger would otherwise be missing.
 */
function cmdLog(text) {
  if (!PROJECT) throw new Error('the log is per feature — pass --project <slug> or --prd <file>.')
  if (!fs.existsSync(OUT_DIR)) throw new Error(`${rel(OUT_DIR)}/ does not exist yet — create it with: node utils/pipeline.mjs path --ensure`)
  const kinds = ['note', 'build', 'decision', 'failed', 'start']
  const kind = (OPTS.kind || 'note').toLowerCase()
  if (!kinds.includes(kind)) throw new Error(`--kind must be one of: ${kinds.join(', ')}`)
  const stage = OPTS.stage ? requireStage(OPTS.stage) : null
  logEvent(kind, `${text}${OPTS.by ? ` — ${OPTS.by}` : ''}`, stage)
  console.log(`LOGGED  ${rel(path.join(OUT_DIR, LOG_FILE))}`)
  console.log(`  ${kind}${stage ? ` /${cmdOf(stage)}` : ''} — ${text}`)
  return 0
}

// ---------- cli ----------

const cmd = OPTS._[0]
const flags = OPTS.flags
const positional = OPTS._.slice(1)
const asJson = flags.has('--json')

const USAGE = `Usage:
  node utils/pipeline.mjs plan <skill>  [--project <slug> | --prd <file>] [--force] [--include-optional] [--no-stale] [--json]
  node utils/pipeline.mjs status        [--project <slug> | --prd <file>] [--json]
  node utils/pipeline.mjs check              # validate the manifest itself: cycles, missing schemas, unreachable stages
  node utils/pipeline.mjs validate <skill>   # do its artifacts exist and match their schema?
  node utils/pipeline.mjs done <skill>       # validate, then record the inputs it was built from
  node utils/pipeline.mjs path  [--stage <skill>] [--project <slug> | --prd <file>] [--ensure]
  node utils/pipeline.mjs projects                      # feature folders that already have output
  node utils/pipeline.mjs graph

HUMAN GATES — \`done\` refuses these; only these commands write a signoff, and --by must be a person:
  node utils/pipeline.mjs gate <id>                                  # where does this gate stand?
  node utils/pipeline.mjs gate <id> --approve --by "<person>" [--checked all|"a,b"] [--note "..."]
                                    [--decision "<part of the question>=<answer>"] [--iteration <n>]
  node utils/pipeline.mjs gate <id> --changes-requested --by "<person>" --note "<what to fix>"
  node utils/pipeline.mjs gate <id> --reject --by "<person>" --note "<why>"
  node utils/pipeline.mjs gate 3 --init                              # seed the page roster from the checklist
  node utils/pipeline.mjs gate 3 --page "<name>" --approve --by "<person>" [--node <id>]
                                    [--manually-edited] [--deviation "<component>"]
  node utils/pipeline.mjs next-page                                  # the ONE page assembly may work on
  node utils/pipeline.mjs pages                                      # the per-page decision ledger
  node utils/pipeline.mjs log "<what happened>" [--stage <skill>] [--kind note|build|decision|failed|start]

A gate is satisfied only when its recorded verdict is \`approved\`, every declared check is confirmed,
every raised decision has an answer, and the checklist it pinned has not changed since. Recording a
verdict is not the same as opening the gate. Neither --force nor --no-stale re-opens one.

The reports tree is output only. Artifacts go to <output_root>/<project>/, e.g. reports/notification-center/,
except shared-scope stages (the design system) which cache once in reports/_shared/ for every feature to reuse.
The project slug comes from --project, then --prd (the PRD filename), then $PROJECT, then $PRD_SOURCE.
Handing over a PRD is enough to name the run:
  node utils/pipeline.mjs path --prd "prds/Billing Settings.pdf" --ensure   # -> reports/billing-settings/

Every skill ends with \`done <skill>\`: that is what validates the artifact and records the inputs it came
from, and it is what makes a changed PRD invalidate the stages built on the old one.`

try {
  if (cmd === 'plan') {
    const target = positional[0]
    if (!target) throw new Error(USAGE)
    const p = plan(target, {
      force: flags.has('--force'),
      includeOptional: flags.has('--include-optional'),
      stale: !flags.has('--no-stale'),
    })
    console.log(asJson ? JSON.stringify(p, null, 2) : renderPlan(p))
    // The stage was reached — with its prerequisites, or the gate it stopped at. Deduped, because
    // the UserPromptSubmit hook runs `plan` on every prompt.
    const live = p.awaitingGates.find(g => g.reachable)
    logEvent('plan', live
      ? `reached — STOPPED at the human gate /${live.command}`
      : p.toRun.length
        ? `reached — prerequisites to run: ${p.toRun.map(r => '/' + r.command).join(', ')}`
        : 'reached — all prerequisites satisfied', p.target)
    process.exit(0)
  } else if (cmd === 'gate') {
    if (!positional[0]) throw new Error(USAGE)
    process.exit(cmdGate(positional[0]))
  } else if (cmd === 'next-page') {
    process.exit(cmdNextPage())
  } else if (cmd === 'pages') {
    process.exit(cmdPages())
  } else if (cmd === 'log') {
    if (!positional[0]) throw new Error(USAGE)
    process.exit(cmdLog(positional.join(' ')))
  } else if (cmd === 'check') {
    process.exit(cmdCheck())
  } else if (cmd === 'validate') {
    if (!positional[0]) throw new Error(USAGE)
    process.exit(cmdValidate(positional[0]))
  } else if (cmd === 'done') {
    if (!positional[0]) throw new Error(USAGE)
    process.exit(cmdDone(positional[0]))
  } else if (cmd === 'path') {
    // Fails loudly rather than echoing the reports root: this command is meant to be substituted
    // into `mkdir -p "$(...)"`, so a fallback value would silently create the wrong directory.
    const stage = OPTS.stage ? requireStage(OPTS.stage) : null
    const dir = stage ? dirOf(stage) : OUT_DIR
    if (!(stage ? isLocatable(stage) : PROJECT)) {
      throw new Error('no feature set, so there is no output dir yet — pass --prd <file> to name the run after the PRD, pass --project <slug>, or set PROJECT in .env.')
    }
    // --ensure creates it, so deriving the name and having somewhere to write are one step and
    // the mkdir cannot be forgotten. Bare `path` stays read-only for inspection.
    if (flags.has('--ensure')) {
      const fresh = !fs.existsSync(dir)
      fs.mkdirSync(dir, { recursive: true })
      if (dir === OUT_DIR) logEvent('start', fresh ? `run started — created ${rel(dir)}/` : `run resumed in ${rel(dir)}/`, stage)
    }
    console.log(rel(dir))
    process.exit(0)
  } else if (cmd === 'projects') {
    const found = listProjects()
    if (asJson) console.log(JSON.stringify({ root: rel(OUT_ROOT), shared: rel(SHARED_DIR), projects: found }, null, 2))
    else if (!found.length) console.log(`No output yet under ${rel(OUT_ROOT)}/ — nothing has been run.`)
    else console.log([`FEATURES WITH OUTPUT  (${rel(OUT_ROOT)}/)`, '', ...found.map(f => `  ${f}`)].join('\n'))
    process.exit(0)
  } else if (cmd === 'status') {
    if (asJson) {
      // stages: null, not a map of all-false — "not computed" and "nothing done" differ.
      if (!PROJECT) {
        console.log(JSON.stringify({ project: null, outDir: rel(OUT_ROOT), projects: listProjects(), stages: null }, null, 2))
        process.exit(0)
      }
      const full = plan('run-prd-workflow', { force: false, includeOptional: true, stale: true })
      const rowOf = Object.fromEntries(full.rows.map(r => [r.skill, r]))
      const stages = Object.fromEntries(Object.keys(STAGES).map(n => {
        const i = artifactInfo(n)
        const d = i.satisfied ? inputDrift(n) : { tracked: false, recorded: null, changed: [] }
        return [n, {
          satisfied: i.satisfied, scope: scopeOf(n), dir: rel(dirOf(n)),
          artifacts: i.found.map(rel), missing: i.missing,
          invalid: i.invalid.map(v => ({ file: rel(v.file), errors: v.errors })),
          mtime: i.mtime, inputsRecorded: Boolean(d.recorded), inputsChanged: d.changed,
          // willRun folds in the cascade: an intact artifact still re-runs when its upstream does.
          willRun: rowOf[n] ? rowOf[n].state === 'run' : false,
          reason: rowOf[n] ? rowOf[n].reason : null,
        }]
      }))
      console.log(JSON.stringify({
        project: PROJECT, outDir: rel(OUT_DIR), sharedDir: rel(SHARED_DIR),
        next: full.toRun.map(r => r.command), stages,
      }, null, 2))
    } else console.log(renderStatus())
    process.exit(0)
  } else if (cmd === 'graph') {
    console.log(renderGraph())
    process.exit(0)
  } else {
    console.log(USAGE)
    process.exit(cmd ? 1 : 0)
  }
} catch (err) {
  console.error(`pipeline: ${err.message}`)
  process.exit(1)
}
