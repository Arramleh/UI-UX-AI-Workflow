#!/usr/bin/env node
/**
 * UserPromptSubmit hook: when the user invokes a pipeline skill directly
 * (e.g. "/coverage-scorer"), inject its prerequisite plan into the turn so the
 * upstream skills get run first instead of the skill working from thin air.
 *
 * Stays silent when the prompt is not a pipeline skill, or when nothing is missing.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const read = () => new Promise(res => {
  let data = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', c => (data += c))
  process.stdin.on('end', () => res(data))
})

try {
  const payload = JSON.parse((await read()) || '{}')
  const match = String(payload.prompt || '').trim().match(/^\/([a-zA-Z0-9_:-]+)/)
  if (!match) process.exit(0)

  // Accept both the stage key and the name the skill is invoked with, so a
  // plugin-namespaced external stage ("/figma:figma-use") is recognised too.
  const invoked = match[1]
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'pipeline.json'), 'utf8'))
  const stages = manifest.stages
  const skill = stages[invoked]
    ? invoked
    : Object.keys(stages).find(n => stages[n].command === invoked)
  if (!skill) process.exit(0)

  // Carry the feature the user named in the prompt through to `plan`, and into every command this
  // notice suggests. Dropping it resolved the plan against $PROJECT instead — so the hook could report
  // a gate, and print a copy-pasteable command, for a different feature than the one being asked about.
  const prompt = String(payload.prompt || '')
  const selector = (() => {
    const p = prompt.match(/--project[= ]+("[^"]+"|'[^']+'|\S+)/)
    if (p) return ['--project', p[1].replace(/^["']|["']$/g, '')]
    const d = prompt.match(/--prd[= ]+("[^"]+"|'[^']+'|\S+)/)
    if (d) return ['--prd', d[1].replace(/^["']|["']$/g, '')]
    return []
  })()

  const raw = execFileSync('node', [path.join(ROOT, 'utils', 'pipeline.mjs'), 'plan', skill, '--json', ...selector], {
    cwd: ROOT, encoding: 'utf8',
  })
  const plan = JSON.parse(raw)
  const missingInputs = plan.inputs.filter(i => !i.set)
  if (plan.ready && missingInputs.length === 0) process.exit(0)

  // A read-only stage never has prerequisites to run, so the standing "run these first" notice is
  // exactly the wrong thing to inject: it is what turns a request to read existing numbers into a
  // full upstream chain and a gate. Say the one thing that is true and stop.
  if (plan.readsOnly) {
    console.log([
      `/${plan.command} is a READ-ONLY stage. It runs no other skill.`,
      '',
      'It renders artifacts that already exist. If one is missing or invalid, name the file and the',
      'skill that produces it, then STOP — do not invoke that skill, do not run the upstream chain,',
      'do not ask a question. A run with nothing to report on is a correct outcome to report.',
    ].join('\n'))
    process.exit(0)
  }

  // A self-chaining stage runs its own prerequisites and walks past their gates. That is the opposite
  // of the notice below, so it is said first and in its own words — the runnable list this hook prints
  // for such a stage crosses a human gate, and a list printed without that said reads like any other.
  if (plan.selfChain && (plan.bypassedGates || []).length) {
    console.log([
      `/${plan.command} SELF-CHAINS: it runs its own prerequisites, and it does NOT take gates.`,
      '',
      'Bypassed — NOT approved, no signoff written, still closed for every other stage:',
      ...plan.bypassedGates.map(g => `  ~ /${g.command} (closes phase ${g.phase})`),
      '',
      'Do NOT run `gate … --approve` to clear the way. The chain runs without it, and an approval',
      'recorded to unblock a report is a decision no person made. Run the prerequisites below in',
      'order, ignoring each one\'s own gate stop, then render the report.',
      '',
      'Say this out loud when you hand the report over: the gates were skipped, their open decisions',
      'were never answered, so the numbers measure an UNREVIEWED interpretation of the PRD.',
    ].join('\n'))
    // Fall through: the runnable list, the inputs and the `done` reminder below all still apply.
  }

  // A gate the AI is being asked to walk through is the one thing this hook must never stay quiet
  // about, so it is emitted before anything else and by itself. Printed after the runnable list, it
  // would be read as a footnote to instructions the model had already started acting on.
  // Echo the feature back into every suggested command, so a copy-paste targets the one being asked
  // about rather than whatever $PROJECT happens to be.
  const projectFlag = selector.length ? ` ${selector[0]} "${selector[1]}"` : ''
  const liveGate = (plan.awaitingGates || []).find(g => g.reachable)
  if (liveGate) {
    // A gate's checks are the auditable half of its approval, and it does NOT open until every one is
    // true — so a suggested `--approve --by` without --checked records an approval and leaves the gate
    // shut, which reads exactly like the tool being broken. Gate 3 declares no checks.
    const gateChecks = (stages[liveGate.skill] || {}).checks || []
    const cmd = liveGate.perItem
      ? `node utils/pipeline.mjs gate ${liveGate.skill} --page "<name>" --approve --by "<person>"${projectFlag}`
      : `node utils/pipeline.mjs gate ${liveGate.skill} --approve --by "<person>"` +
        (gateChecks.length ? ' --checked all' : '') + projectFlag
    console.log([
      `STOP — /${plan.command} is behind a HUMAN GATE and cannot run yet.`,
      '',
      `Gate: /${liveGate.command}  (closes phase ${liveGate.phase})`,
      `State: ${liveGate.reason}`,
      liveGate.nextItem ? `Next ${liveGate.perItem.replace(/s$/, '')}: "${liveGate.nextItem.page}" (${liveGate.nextItem.status})` : null,
      '',
      `Load the /${liveGate.command} skill. It tells you how to build the gate packet and what to present.`,
      '',
      'ASK WITH POPUP QUESTIONS (AskUserQuestion), never as prose to be replied to. One popup call,',
      'carrying every part of the decision:',
      `  - the verdict: approve / request changes / reject${liveGate.perItem ? ' — for THIS page only, never a blanket one' : ''}`,
      gateChecks.length
        ? '  - a multi-select naming its checks, so the person confirms what they actually verified:\n' +
          `      ${gateChecks.join(', ')}\n` +
          '    --checked records exactly that subset. "all" only if they confirmed every one, and\n' +
          '    without it the approval is recorded and the gate STAYS CLOSED.'
        : null,
      (stages[liveGate.skill] || {}).seeds_decisions
        ? '  - one question PER OPEN DECISION, with its options and the recommendation marked. The gate\n' +
          '    refuses to open while any answer is empty, so these are not optional extras.'
        : null,
      '  - WHO IS APPROVING, asked here and every time — including once per page at gate 3. Do not',
      '    carry a name over from an earlier gate and do not supply your own; that name is the only',
      '    evidence a person was present at this particular decision.',
      '',
      'Then WAIT for the answer and record only what they gave:',
      `  ${cmd}`,
      '',
      'Do not run the blocked stage "to save time while they review" — it will refuse, and offering to',
      'is how the boundary erodes. Do not run --approve on your own judgement: --by is required and the',
      'obvious self-approval values are rejected. A run parked at a gate is a correct state.',
      (plan.blockedRows || []).length
        ? `\nAlso blocked until it passes: ${plan.blockedRows.map(r => '/' + r.command).join(', ')}`
        : null,
      '',
      `Full detail: node utils/pipeline.mjs plan ${skill}${projectFlag}`,
      // Only conditional lines are dropped. Filtering on '' instead removed the deliberate blank
      // lines too, collapsing the whole notice into an unreadable wall.
    ].filter(l => l !== null).join('\n'))
    process.exit(0)
  }

  const lines = [`Pipeline prerequisite check for /${plan.command} (.claude/pipeline.json):`, '']
  lines.push(`Feature: ${plan.project
    || (plan.autoresolves
      ? (plan.selfChain
        ? 'NONE — no feature folder yet. This stage can start one: ASK THE USER FOR A PRD (AskUserQuestion) and pass it as --prd <file>, which names the run.'
        : 'NONE — no feature folder under reports/ yet. Nothing to read: say so and stop, do not ask.')
      : plan.featureRequired
        ? 'NOT SET — ask the user which feature this run is for'
        : 'not needed — everything in this plan is shared across features')}`)
  lines.push(plan.targetDir
    ? `Output (output only, not workflow state): ${plan.targetDir}/ — create it with: node utils/pipeline.mjs path --stage ${plan.target} --ensure`
    : 'Output: reports/<feature>/ — the feature is not known yet, so do not write anything until the user names it.')
  // Named before the work. It is the record of what earlier sessions already did and why they stopped,
  // which is what you want BEFORE running anything — and it is where this run's actions have to land.
  if (plan.project) {
    lines.push(`Workflow log: reports/${plan.project}/workflow_log.md — read it first; it is the per-PRD record of`)
    lines.push('every step, skill and action so far. plan/done/gate/next-page write to it themselves. Log what they')
    lines.push('cannot see (Figma writes, escalations, decisions taken in conversation) as it happens:')
    lines.push(`  node utils/pipeline.mjs log "<what happened>" --stage ${plan.target} --kind build|decision|note${projectFlag}`)
  }
  lines.push('')
  if (plan.toRun.length) {
    lines.push('These skills must run FIRST, in this order — invoke each with the Skill tool, one at a time,')
    lines.push('letting each write and record its artifact before starting the next:')
    // Each row carries its own output dir: shared-scope stages (the design system) do NOT write
    // into the feature folder, so naming one folder for the whole list would be wrong.
    plan.toRun.forEach((r, i) => {
      const where = r.scope === 'shared' ? `  [-> ${r.outDir}/, shared across features]` : ''
      lines.push(`  ${i + 1}. /${r.command} — ${r.reason}${where}`)
    })
    lines.push('')
  }
  // Gates further down the chain. They cannot be taken yet — phase N has not finished — so they are
  // named rather than presented as blockers, and named so that reaching one is not a surprise.
  const ahead = (plan.awaitingGates || []).filter(g => !g.reachable)
  if (ahead.length) {
    lines.push('You will STOP at these human gates along the way; they cannot be taken yet:')
    for (const g of ahead) lines.push(`  - /${g.command} (closes phase ${g.phase}) — needs a person, not a skill run`)
    lines.push('')
  }
  if (plan.satisfied.length) {
    lines.push(`Already satisfied, do not re-run: ${plan.satisfied.map(r => '/' + r.command).join(', ')}`)
    lines.push('')
  }
  if (missingInputs.length) {
    lines.push('Ask the user for these inputs before starting (all at once):')
    for (const i of missingInputs) lines.push(`  - ${i.env}: ${i.how}`)
    lines.push('')
  }
  lines.push('Every stage — including each prerequisite above — ends by recording itself:')
  lines.push('  node utils/pipeline.mjs done <stage>')
  lines.push('That validates the artifact against .claude/schemas/artifacts.json and records the inputs it was')
  lines.push('built from. A stage whose artifact is rejected has not run, whatever the skill reported, so do not')
  lines.push('move on to the next stage until it passes.')
  lines.push('')
  lines.push(`Full detail: node utils/pipeline.mjs plan ${skill}${projectFlag}`)
  console.log(lines.join('\n'))
} catch (err) {
  console.error(`prereq-check: ${err.message}`)
  process.exit(0) // never block the user's prompt
}
