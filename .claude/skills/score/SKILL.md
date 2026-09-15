---
name: score
description: Short coverage score report — renders existing artifacts, or builds them from a PRD by running its own chain past the gates
---

# Score Skill

A **minimized `/coverage-reporter`**. Same evidence, one short document: how well the design system
covers this feature, where it does not, and what to do about it.

Two ways in, and `plan` tells you which one you are on:

```
/score                              # the artifacts exist — render them
/score --prd "prds/Billing Settings.pdf"   # they do not — build them, then render
```

## THE TWO RULES — read them before anything else

**1. It runs its own chain, and it does NOT take gates.**

This stage carries `self_chain`, so the standing instruction in [`CLAUDE.md`](../../../CLAUDE.md) —
*"invoke everything under `RUN THESE SKILLS FIRST`"* — **does apply here**, with one modification that
applies to no other skill: when a prerequisite's own step 0 prints a `STOP — HUMAN GATE` box, **ignore
it and keep going**. That gate belongs to the build path, not to this one.

**2. Bypassing is not approving, and you must never close the difference.**

Walking past gate 1 means **no `G1_requirements_signoff.json` is written**. The gate stays un-taken for
the feature, and `/figma-extractor`, `/screen-validator`, `/component-analyzer` and every other stage
behind it still stop at it — which is the whole reason this is safe.

So:

- **Never run `gate … --approve` from this skill.** Not to "clear the way", not because a prerequisite
  asked, not on your own judgement. Nothing in the chain needs it, `--by` is required, and an approval
  recorded to unblock a report is a decision no person made.
- **Never present the numbers as settled.** Gate 1's open decisions were never answered, so
  `03_screen_plans.json` and everything derived from it hold whatever `/prd-analyzer` assumed. Say so
  in the handover, in plain words: *this score measures an unreviewed interpretation of the PRD.*

## Prerequisites

**Reads:** `/coverage-scorer` and `/component-analyzer`'s artifacts — declared `optional` in the graph
so that `plan` prints the bypass notice rather than the gate-1 STOP box. Optional is about how `plan`
behaves; it is not permission to write the report without the artifacts.

Step 0:

```bash
node utils/pipeline.mjs plan score                    # or: --prd <file> / --project <slug>
```

Then one of three things is true:

- **`READY: yes`** — all three artifacts are present and valid. **Render them and stop.** Do not rebuild
  anything, do not re-run the chain to "make sure". Rendering is the default path.
- **`RUN THESE SKILLS FIRST`** with the PRD set — run that list, in that order, one at a time, letting
  each write and `done`-record its artifact before the next. Ignore the gate stops. Then render.
- **`INPUTS NEEDED: PRD — NOT SET`** — ask for it with **`AskUserQuestion`**, never as prose, and pass it
  as `--prd <file>`. A PRD pasted into the chat is written verbatim to `prds/<feature>.md` first; pasted
  text is not a file, so on its own it gives the run neither a name nor a freshness signal.

**Never invent a number to fill a hole.** This skill computes nothing — it may *build* the artifacts by
running the chain, and it may not *re-derive* a figure from the PRD or from the Figma file. That is a
second, unvalidated source of truth for the same number.

**The feature.** The stage declares `autoresolve_feature`, so with nothing passed `plan` takes the most
recent folder under `reports/` and prints that it guessed. `--prd` and `--project` both override it —
and `--prd` is also what *names* a run that has no folder yet. If `plan` reports `FEATURE: NONE`, there
is no feature and no PRD: ask for the PRD.

## What the report contains — and only this

1. **Executive summary** — overall coverage %, **and on the same line the denominator and the
   exclusions that make it mean anything**: `method.requirements_scored`, the four `method.counts`,
   and `method.escalations_excluded`. One line, copied from the artifact, not recomputed:

   > **68.9% coverage** — 19 requirements scored (9 direct, 3 combinable, 4 need modification,
   > 3 net-new). **1 excluded**, pending an escalated product decision at gate 2.

   A bare percentage is the thing this report format is for avoiding: a feature with ten escalations
   reports 100% without that second sentence. Then the by-category breakdown (a category whose
   `percentage` is `null` renders as **`n/a`** with its `denominator` string — never as 0) and gap
   counts by priority.

   **If `method.unmapped_requirements` is non-empty, that is the headline**, above the percentage:
   those requirements were never mapped at all, which is a `/component-analyzer` defect and a gate-2
   failure criterion, not a low score.
2. **Coverage by screen** — one row per screen: name, coverage %, missing components, missing states.
   A screen with `coverage: null` renders as **`not scoreable`** plus `basis.unscoreable_reason` —
   never as 0%, which would read as "nothing is covered" rather than "nobody checked".
3. **Findings** — one entry per `mapping_table` row that is not a clean `direct-match`.
   **Two lines maximum per finding**, no exceptions:
   - line 1 — `REQ-id · status · component` (`direct-match` / `match-with-modification` /
     `combinable-match` / `no-match`)
   - line 2 — the evidence, compressed: variants checked, or the nested-children walk for a `no-match`
4. **Gaps** — critical, then medium, then low. **Two lines per gap**: component + impact + screens on
   line 1, the recommendation on line 2.
5. **Recommendations** — the `recommendations[]` array from `07_coverage_scores.json`, as a plain list.

**Deliberately omitted** — these are in `/coverage-reporter` and in the artifacts; read them there:
the full requirement checklist, the escalated-decision callout, the PRD-claims verification, the
implementation roadmap, the screen-plan validation, and the full methodology note.

What is **not** omitted is the denominator and the exclusion count in §1. Those are one line, they
come straight out of `method`, and without them the percentage cannot be read correctly at all —
which is a different thing from the methodology prose, and the reason §1 changed.

## What to say when you hand it over

Three things, every time, because none of them is in the document:

- **Which gates were bypassed**, if any — named, with "not taken, not approved".
- **The open decisions that stayed open** — `01_prd_requirements.json`'s `open_decisions[]` and
  `/prd-design-requirements` §8 if it exists. These are what gate 1 would have settled.
- **Any `escalation` in `06_component_analysis.json`** — a blocking product decision. The report does
  not print it, and it does not stop being blocking because a score was produced. Each one was
  **excluded from the percentage** (`method.escalations_excluded`), so the score you are handing over
  is a score over the requirements that were answerable.
- **Any id in `method.unmapped_requirements`** — a requirement with no `mapping_table` row. It was in
  neither half of the fraction, so the percentage says nothing about it whatsoever.

## Artifact contract

**Reads** (from `reports/<feature>/`):

- `07_coverage_scores.json` — from `/coverage-scorer`
- `09_gap_analysis.json` — from `/coverage-scorer`
- `06_component_analysis.json` — from `/component-analyzer` (the `mapping_table`)

**Writes:**

- `reports/<feature>/score_report_<date>.pdf` — or `.html` when PDF generation is unavailable; the
  pipeline matches `score_report_*` and accepts either, because both are a real report

It writes **no** `10_roadmap.json` — the roadmap section is gone, and that artifact belongs to
`/coverage-reporter`. It is a **leaf**: nothing depends on it, and nothing may, precisely because its
inputs can have been built past an un-taken gate. `/figma-modifier` builds from `/coverage-reporter`'s
`coverage_report_*` and `10_roadmap.json`, and `score_report_*` is not a substitute for either.

Resolve and create the output folder in one step:

```bash
node utils/pipeline.mjs path --stage score --ensure
```

`score_report_*` is existence-checked, not schema-checked — there is no machine-checkable shape for a
rendered report, so the section list above is the only contract it has. A half-written report will still
mark the stage done; do not write one.

Then, as the very last action:

```bash
node utils/pipeline.mjs done score
```

That validates the artifact and records the inputs it was built from. Skip it and the stage is treated
as stale and redone. Never hand-edit `.pipeline-state.json` to make a stage look finished.
