# `/score` — the engine

[`SKILL.md`](SKILL.md) says what the skill must *do*. This file says how the resolver makes it
possible: which flags in [`.claude/pipeline.json`](../../pipeline.json) constitute the mechanism, what
[`utils/pipeline.mjs`](../../../utils/pipeline.mjs) does with each of them, and which invariants stop
the one deliberate hole in the gate model from widening into a bypass the rest of the pipeline
inherits.

Read it when you are changing `/score`, changing the resolver, or adding another stage that wants to
run its own chain. Nothing here is needed to *use* the skill.

---

## 1. What the stage actually is

`/score` **computes nothing.** It renders three artifacts:

| Artifact | Produced by | Supplies |
|---|---|---|
| `07_coverage_scores.json` | `/coverage-scorer` | every number in the report |
| `09_gap_analysis.json` | `/coverage-scorer` | the gaps section |
| `06_component_analysis.json` | `/component-analyzer` | the `mapping_table` rows the findings are built from |

It writes one file, `score_report_<date>.pdf` (or `.html`), matched by the wildcard `score_report_*`
and therefore **existence-checked, not schema-checked** — there is no machine-checkable shape for a
rendered document, so the section list in `SKILL.md` is the only contract it has.

The engine exists entirely to answer one question: **what happens when those three artifacts are not
there yet.** The old answer was "report that and stop" (`reads_only`). The current answer is "build
them", and building them means crossing gate 1.

---

## 2. The four flags, and why each is load-bearing

`/score`'s stage declares:

```json
"standalone": true,
"ungated": true,
"autoresolve_feature": true,
"self_chain": true,
"requires": [],
"optional": ["coverage-scorer", "component-analyzer"]
```

Each one changes a specific branch in the resolver. None is decorative.

### `self_chain` — the stage runs its own prerequisites, and does not take their gates

Set at [`pipeline.mjs:944`](../../../utils/pipeline.mjs#L944). It flips two independent switches.

**Switch one — the chain is widened at exactly one node.** `includeOptional` is normally a boolean.
For a self-chaining stage it becomes a **predicate**, `n => n === target`
([`pipeline.mjs:946`](../../../utils/pipeline.mjs#L946)), consumed by `wantsOptional`
([`pipeline.mjs:811`](../../../utils/pipeline.mjs#L811)). So `/score`'s own two `optional` edges are
followed, and every level below them resolves through `requires` alone.

This is why the chain is five stages and not nine. Resolving with `optional = true` at every level
dragged `screen-validator`, `figma-extractor` and `prd-design-requirements` into a chain whose entire
purpose is to produce three coverage artifacts.

**Switch two — gates become leaves.** `depsOf` short-circuits on a gate when `gatesAreLeaves` is set
([`pipeline.mjs:821`](../../../utils/pipeline.mjs#L821)):

```js
function depsOf(name, includeOptional, gatesAreLeaves) {
  if (gatesAreLeaves && isGate(name)) return []
  ...
}
```

A gate that is walked past contributes nothing, so a stage reachable **only** through it exists to
feed a decision nobody is taking. `gate-1-requirements` requires `/prd-design-requirements` — its
review deliverable, and no part of producing a coverage score. Without this line the score chain
rebuilt the entire design-requirements document to satisfy a gate it was about to skip.

### `optional`, not `requires` — and this is not a style choice

A hard edge onto `component-analyzer` reaches `gate-1-requirements` transitively. `plan` would then
open with the `STOP — HUMAN GATE` box instead of the self-chain bypass notice — and because an
orchestrator reads top-down and acts on the first thing it finds, the stage would stop at the very
gate it is entitled to skip. `check` errors on a `self_chain` stage that declares anything in
`requires` ([`pipeline.mjs:1584`](../../../utils/pipeline.mjs#L1584)).

The flag governs **how `plan` behaves**. It is not permission to write the report without the
artifacts: `$dependency_is_not_optional` in the manifest says so, and `SKILL.md` requires all three.

### `ungated` — the stage sits behind no gate of its own

[`pipeline.mjs:434`](../../../utils/pipeline.mjs#L434), consumed in the `blocked` loop at
[`pipeline.mjs:1011`](../../../utils/pipeline.mjs#L1011). A stage entitled to walk past *other*
stages' gates must take none of its own, or it would be blocked by a gate it is allowed to skip —
an incoherent state the resolver has no way to resolve. It also means a run parked at a gate can
still produce a number.

### `standalone` — no orchestrator schedules it

`/run-prd-workflow` derives its stage list from the manifest rather than a hand-written `runs_all`, so
the only way to keep a gate-bypassing chain out of an ordinary run is this flag. It is also what makes
`/score` a **leaf**: nothing depends on it, and nothing may, because anything downstream would inherit
artifacts built past an un-taken gate. `status` shows it as `[-]`, never `[x]` — "never scheduled" is
not "done".

### `autoresolve_feature` — the one question the stage does not ask

`autoResolvedProject()` ([`pipeline.mjs:132`](../../../utils/pipeline.mjs#L132)) takes the
most-recently-written non-underscore folder under `reports/` and prints that it guessed. Precedence is
`--project` → `--prd` → `$PROJECT` → auto ([`pipeline.mjs:147`](../../../utils/pipeline.mjs#L147)).

Guessing the feature is normally how one run's artifacts end up in another feature's folder, so this is
opt-in per stage and safe **here only**: `/score` takes no decision, writes only its own report, and
nothing reads that report. Picking wrong costs a regenerated summary. A stage producing a pipeline
artifact keeps asking.

---

## 3. The resolution, in order

Running `node utils/pipeline.mjs plan score`:

**1. Resolve the feature.** `--project`, else `--prd`'s filename slugified, else `$PROJECT`, else the
auto-resolved folder. If all four are empty, `plan` reports `FEATURE: NONE` — and for a self-chaining
stage the hook says something different from every other stage
([`prereq-check.mjs:153`](../../hooks/prereq-check.mjs#L153)): *ask the user for a PRD, because this
stage can start a run.* Everywhere else `NONE` means "say so and stop".

**2. Build the chain.** `closure(target, n => n === target, true)` — reachable deps, gates pruned as
leaves, then Kahn's algorithm with `order` only as a tie-break among independent stages
([`pipeline.mjs:840`](../../../utils/pipeline.mjs#L840)). Dependencies decide the sequence; `order` is
cosmetic. A cycle throws rather than emitting a confident wrong plan.

For a fresh feature this yields:

```
prd-analyzer → screen-planner → design-system-loader → component-analyzer → coverage-scorer
                                     (shared, usually already satisfied)
```

with `gate-1-requirements` present in the chain but contributing no dependencies of its own.

**3. Classify the gates.** This is the core of the mechanism
([`pipeline.mjs:980`](../../../utils/pipeline.mjs#L980)):

```js
const unsatisfiedGates = new Set(
  selfChain ? [] : [...gateStates].filter(([n, g]) => !g.satisfied || staleGate.has(n)).map(([n]) => n)
)
const bypassedGates = selfChain
  ? [...gateStates].filter(([n, g]) => !g.satisfied || staleGate.has(n)).map(([n]) => n)
  : []
```

**Emptying one set is the whole implementation.** `unsatisfiedGates` is what `blocked`,
`targetBlockedBy`, `awaitingGates` and the `STOP — HUMAN GATE` box are all computed from — so
draining it makes every one of them fall away at once, rather than suppressing each individually and
leaving a fifth consumer to be discovered later.

**4. Assign row states.** In the row loop a gate becomes `'bypassed'`, which is **its own state and is
never rounded into `'ok'`** ([`pipeline.mjs:1035`](../../../utils/pipeline.mjs#L1035)). An un-taken
gate rendered as done is the single most misleading thing the tool could print — `status` would show
`[x]` against a decision nobody made, and the next reader would build on it. The reason string is
explicit: `NOT TAKEN — /score does not take gates. Still un-taken for this feature: …`.

**5. Print the notice above the runnable list.**
[`pipeline.mjs:1283`](../../../utils/pipeline.mjs#L1283), and the hook does the same at
[`prereq-check.mjs:74`](../../hooks/prereq-check.mjs#L74). Position is the point: a chain printed
without it reads like any other chain, and the fact that it crosses a human gate would be discovered
from the row states or not at all. The hook's version falls through rather than exiting — the runnable
list, the inputs and the `done` reminder all still apply.

**6. Log the bypass.** `writeLog` records it separately from the deduped `plan` line
([`pipeline.mjs:2488`](../../../utils/pipeline.mjs#L2488)), because a gate walked past leaves **no
artifact of its own** and `workflow_log.md` is the only place it exists:

```
GATE BYPASSED: /gate-1-requirements walked past — NOT taken, NOT approved,
no signoff written; still closed for every other stage.
```

---

## 4. Bypassing is not approving

The property the whole design rests on: **no `G1_requirements_signoff.json` is written.**

The bypass lives in `/score`'s plan resolution and nowhere else. The gate artifact is absent, so
`gateState` still reports gate 1 un-taken for the feature, and `/figma-extractor`,
`/screen-validator`, `/component-analyzer` and every other stage behind it **still stop at it** when
invoked on their own. Nothing inherits the bypass, because nothing was recorded.

This is why `/score` is forbidden from running `gate … --approve` for any reason, and why both `plan`
and the hook say so unprompted. An approval recorded to unblock a report is a decision no person made
— and unlike the bypass, it is durable and inherited by every downstream stage.

---

## 5. What `check` enforces

Every term below is checked at [`pipeline.mjs:1576`](../../../utils/pipeline.mjs#L1576). Each one
dropped turns a reporting shortcut into a bypass the pipeline inherits:

| Requirement | Dropped, it means |
|---|---|
| `standalone` | an orchestrator pulls the gate-bypassing chain into an ordinary run |
| `ungated` | the stage sits behind a gate it is entitled to skip — incoherent |
| leaf (nothing depends on it) | downstream stages inherit artifacts built past an un-taken gate |
| chain in `optional`, not `requires` | `plan` opens with the gate STOP box — the exact failure the flag exists for |
| not also `reads_only` | contradictory: one runs its prerequisites, the other runs no skill at all |
| `$self_chain` prose present | warning — an undocumented bypass is indistinguishable from a mistake |

`check` separately warns on an `ungated` stage with no `$ungated` explanation
([`pipeline.mjs:1567`](../../../utils/pipeline.mjs#L1567)), and exempts `ungated` and `shared` stages
from the phase-gate rule ([`pipeline.mjs:1551`](../../../utils/pipeline.mjs#L1551)).

---

## 6. The two entry paths

`plan` decides which one you are on, and the skill must not second-guess it.

**`READY: yes`** — all three artifacts present and valid. Render and stop. Do not re-run the chain to
"make sure"; rendering is the default path.

**`RUN THESE SKILLS FIRST`** — run that list in the printed order, one at a time, letting each write
and `done`-record before the next, **ignoring each one's own `STOP — HUMAN GATE` box**. This is the
only skill in the pipeline where that instruction is correct, and it is correct only because those
gates belong to the build path.

**`INPUTS NEEDED: PRD — NOT SET`** — ask with `AskUserQuestion`, never as prose. A pasted PRD is
written verbatim to `prds/<feature>.md` first: pasted text is not a file, so on its own it gives the
run neither a name nor a freshness signal, and a different PRD pasted later still reads as "already
satisfied".

Last action, always: `node utils/pipeline.mjs done score`.

---

## 7. What the engine costs, and what it does not buy

Gate 1's open decisions were never answered. `03_screen_plans.json` — and every number derived from it
— therefore holds whatever `/prd-analyzer` assumed when it had to read an ambiguous requirement one
way in order to atomize it at all. **The score measures an unreviewed interpretation of the PRD**, and
`SKILL.md` requires saying so in the handover, along with any `escalation` in
`06_component_analysis.json`, which does not stop being a blocking product decision because a number
was produced.

What the self-chain buys is the numbers. What it does not buy is permission to build on them — which
is precisely what the leaf invariant enforces: `/figma-modifier` builds from `/coverage-reporter`'s
`coverage_report_*` and `10_roadmap.json`, and `score_report_*` is not a substitute for either.
