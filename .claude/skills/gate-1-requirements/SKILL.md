---
name: gate-1-requirements
description: GATE 1 (human) — present the extracted requirements for validation and record the person's decision. Closes phase 1.
---

# Gate 1 — Requirements Validation (HUMAN)

**You are not the decider here. You are the person who prepares the packet, asks, and writes down the
answer.** Everything below exists to keep those three jobs separate from a fourth one you must never do.

```bash
node utils/pipeline.mjs plan gate-1-requirements
```

## What this gate is for

Phase 1 turned an unstructured PRD into a flat list of atomic UI/flow requirements **and the screen plans
derived from them**. Gate 1 asks one question: **is that list complete, correctly atomized, free of
unresolved ambiguity, and fully carried into the screens?**

- **Pass** — a signed-off requirement list, and screen plans that account for every requirement in it,
  with zero open questions blocking design work.
- **Fail** — requirements incomplete or still bundled, an open question unanswered, or a requirement with
  no element in any screen plan. It goes back to phase 1 (`/prd-analyzer`, `/prd-design-requirements`,
  `/screen-planner`) with clarifications.

Nothing in phase 2 may run until this passes. That is enforced by the graph — `/figma-extractor`,
`/screen-validator` and `/component-analyzer` each require this stage, and every other phase-2 stage
reaches one of those three transitively — not by your discipline.

**`/screen-planner` is upstream of this gate, not downstream.** It was phase 2's entry point and was
moved into phase 1 deliberately, so that `03_screen_plans.json` is reviewed *here*, beside the
requirements it claims to cover. The reason is an omission nothing downstream can see: the screen plans
are an interpretation of the PRD that nearly all of phase 2 derives from, so a requirement that never
became an element is invisible to every plan-derived check afterwards — and to gate 3, because a
requirement that produced no checklist entry produces no page to ask about. This gate is the only place
that comparison is ever made.

## Step 1 — Read the artifacts, do not summarise from memory

Read `reports/<feature>/01_prd_requirements.json`, `reports/<feature>/design_requirements.md` **and
`reports/<feature>/03_screen_plans.json`** in full. You are about to ask someone to sign off on their
contents; presenting a recollection of them is how a gate approves something nobody read.

The screen plans are read for one specific purpose beyond presenting them: build the requirement →
element cross-check that `screens_cover_requirements` asks about. Every element in a plan carries a
`requirement_link` back to a `REQ-*` id, so the set of linked ids is directly comparable to the set of
requirement ids, and a requirement in the second set but not the first is the finding.

Point the reviewer at `reports/<feature>/design_requirements.docx` too — the same content as a
categorized Word document, with the flows and the page/component tree drawn as graphs, and open to
comments and redlines. It is the copy most people will actually read *and* mark up, so check it is there
and current with the markdown before asking. It is a rendition, not a source: where the two differ, the
markdown is what is being signed off, and a difference is a defect to send back rather than a
discrepancy to explain away.

If the reviewer comes back with comments or tracked changes in the `.docx`, those are `changes_requested`
notes, not an edit to the deliverable. `/prd-design-requirements` rewrites the markdown against them and
re-renders — never hand-edit the Word file into the source of record, or the two silently swap roles.

## Step 2 — Build the gate packet

Present, in the chat, in this order:

**A. The five checks, each with your own honest verdict and the evidence for it.**

| Check | What makes it true |
|---|---|
| `atomized` | Every UI-relevant need is a single line. Quote any line you suspect is still bundled — "a filterable table with export and inline editing" is three requirements, and one that reaches phase 2 unsplit compounds into an ambiguous mapping there. |
| `flows_broken_to_frames` | Flows are decomposed to named pages/frames, not left at screen level. |
| `ambiguity_flagged` | Every ambiguous or acceptance-criteria-light item is an open decision, not an assumption you made. |
| `prd_claims_quarantined` | Every component name, page reference and "existing vs. new" label **the PRD itself supplied** was isolated into `unverified_prd_claims[]` rather than inherited into `requirements[]`. |
| `screens_cover_requirements` | Every requirement id in `01_prd_requirements.json` appears as some element's `requirement_link` in `03_screen_plans.json`. **Name the unmapped ids** — do not report a count. |

**`screens_cover_requirements` is the check that only exists here.** It is why `/screen-planner` was
moved into phase 1. Phase 2 scores coverage of the *plans* against the design system, so a requirement
the plans never captured is not scored as uncovered — it is not scored at all, and every downstream
report reads as complete. Gate 3 cannot catch it either: a requirement that produced no checklist entry
produces no page to ask about. If a requirement is genuinely intentionally out of scope for the screens,
that is a decision, so it belongs in the open decisions below — not in a silently short plan.

**Be specific about `prd_claims_quarantined`, and about what it does *not* say.** A PRD on this project
arrived with a pre-filled components section and Figma page references that were entirely fabricated —
none of the referenced pages existed. List each claim the PRD made. If phase 1 did not strip those
claims into `unverified_prd_claims[]`, this check is **false** and you say so.

**It does not mean the claims were verified.** Phase 1 reads the PRD and nothing else, so every
`status` here is legitimately `unverified` and there is no live-file column to show you —
`/component-analyzer` resolves them in phase 2, before anything is built. This check was called
`prd_claims_verified` while phase 1 still did a live library walk; do not present it as verification,
and do not let a reviewer approve it believing a fabricated page reference has already been caught. The
protection at this gate is containment: a fabricated claim cannot reach `requirements[]`. Exposing it
as fabricated happens after the gate.

**B. The requirement list itself**, grouped by flow, one line each, with ids.

**B2. The screen plans**, one block per screen: its name, purpose, the elements in order with the
`REQ-*` id each is linked to, and its states. Then, separately and explicitly, **the requirement ids
that appear in no plan** — that list is the evidence for `screens_cover_requirements`, and it is the
one thing in this packet nobody can reconstruct later.

**C. Every open decision**, as a decision packet — never as a decision:

```
OPEN DECISION 1 — <the question>
  raised by:   prd-design-requirements §8
  options:     (a) ...  (b) ...
  recommended: (b), because ...
  consequence: (a) means ...; (b) means ...
```

Your recommendation is welcome. Your resolution is not. This is a reversal of how this pipeline used
to behave, and the reason is worth stating: auto-deciding was the right answer for an unattended run
and the wrong answer here, because a default taken at this point is a decision made before the person
accountable for it ever saw the question.

**D. What you would send back**, if anything — say it plainly rather than letting an approval happen by
default.

## Step 3 — Ask as popup questions, and wait

**Ask with `AskUserQuestion`, not with prose the person replies to in chat.** The reason is narrow and
it is the same one behind `--by`: a gate answered in free text is a gate answered by whoever
paraphrases the reply into a command, and that is you. A popup returns the person's own selections,
and it makes an unanswered decision impossible to skip past — an unanswered question is visibly
unanswered, where a decision buried in paragraph four of a packet is simply not mentioned again.

Build **one** popup call carrying the whole decision. Every part below is required:

| Question | Shape |
|---|---|
| **The verdict** | approve / request changes / reject |
| **The five checks** | `multiSelect: true` — `atomized`, `flows_broken_to_frames`, `ambiguity_flagged`, `prd_claims_quarantined`, `screens_cover_requirements`. What they select is exactly what goes in `--checked`. Do not pre-select for them. |
| **One question per open decision** | The question from §8, its options as the options, the recommended one first and labelled `(Recommended)`, each option's `description` carrying the consequence. |
| **Who is approving** | Asked here, at this gate, every time. Never inferred from the git author, the session, or an earlier gate. |

`AskUserQuestion` takes at most four questions per call, so with more than one or two open decisions
this becomes several calls. Ask the **open decisions first**, then the verdict and checks — a person
cannot sensibly approve a requirement list while the questions inside it are still open, and asking in
that order makes the dependency obvious instead of leaving them to notice it.

Then **stop and wait**. A run parked at a gate is a correct state. Do not begin phase 2 "to save time
while they review" — `/screen-validator`, `/component-analyzer` and `/figma-extractor` will all refuse
anyway, and offering to is how the boundary erodes.

**Popups do not change who decides.** The recommendation still goes in the option list; the resolution
still comes back from the person. A popup where every option but one is described as broken is a
decision you took with extra steps.

## Step 4 — Record only what they actually said

```bash
node utils/pipeline.mjs gate 1 --approve --by "<their name>" --checked all --note "<anything they said>"
node utils/pipeline.mjs gate 1 --changes-requested --by "<their name>" --note "<what to fix>"
node utils/pipeline.mjs gate 1 --reject --by "<their name>" --note "<why>"
```

`--by` is required and `claude`, `ai`, `assistant`, `auto`, `self` and friends are refused. **A gate
signed by the thing being gated is not a gate.** The name comes from the "who is approving" popup
answer and from nowhere else — not the git author, not the session user, not the name on the last
gate. If nobody has decided, the gate stays open — leave it open and say so.

**`--checked` is not optional in practice.** `--approve` on its own records the approval and the gate
**stays closed**, because a gate opens only when every one of its five checks is `true`. Name the ones
the person confirmed:

```bash
# they confirmed all five
node utils/pipeline.mjs gate 1 --approve --by "<their name>" --checked all
# they confirmed only these two — the other three stay false, so the gate stays closed
node utils/pipeline.mjs gate 1 --approve --by "<their name>" --checked "atomized,ambiguity_flagged"
```

The check names are `atomized`, `flows_broken_to_frames`, `ambiguity_flagged`, `prd_claims_quarantined`,
`screens_cover_requirements` — the five in the table above, declared in
[`.claude/pipeline.json`](../../pipeline.json). A name that is
not one of them is refused outright, with the valid list printed; the command never invents a check and
never silently drops one. Record only what the person actually confirmed: `--checked all` because five
names are tedious to type is the whole failure this flag was added to make visible.

Then fill in each decision's `answer` in the record with what the person decided, and re-record the
approval. The gate **will not open** while any decision's `answer` is empty, or while any check is not
`true`; those two refusals are the mechanism, and it is deliberate that they fire even after
`--approve`. The command says which one is holding it and prints the exact re-record command.

```bash
node utils/pipeline.mjs gate 1        # confirm: APPROVED, or why not
```

## On `changes_requested`

The gate names what to re-run in `bounced_to`, and `plan` marks those stages `run` again:

```bash
node utils/pipeline.mjs plan gate-1-requirements   # prd-analyzer / prd-design-requirements / screen-planner come back
```

Re-run them against the person's notes, then present the packet again. The previous verdict, who gave
it and when stay in `history` — a gate that bounced twice before passing is a different fact from one
that passed first time, and `/closure-reporter` reads that.

**Note `/screen-planner` is now in that set.** Re-running phase 1 regenerates the screen plans from the
corrected requirements; do not carry the old plans forward. They were built from the text the person
just rejected.

### A hand-edited requirement is `changes_requested`, not an approval

If the person corrects a requirement **by hand** rather than sending it back, record the ids in
`requirements_edited[]` **and take the verdict as `changes_requested`** so phase 1 re-runs.

`requirements_edited[]` did not lose its purpose — it changed direction. It used to be read *forward*,
by phase 2, as a patch applied over an approval. It is now read *backward*, by the phase-1 re-run: those
ids are the corrections to apply while regenerating `01_prd_requirements.json`, because re-extracting
from an unchanged PRD would otherwise reproduce the same wording the person just fixed. After the
re-run, that file holds the corrected text and nothing downstream needs the list. A non-empty
`requirements_edited[]` on an **approved** signoff is therefore a defect, and `/component-analyzer` is
told to stop rather than reconcile it.

This rule changed when `/screen-planner` moved in front of this gate, and the reason is worth stating
rather than obeying. Previously the plans were built *after* the gate, so `/screen-planner` could read
`requirements_edited[]` and plan from the corrected wording — a hand-edit was safely absorbable inside an
approval. Now the plans already exist, and they were derived from the superseded text. An approval that
carried `requirements_edited[]` forward would leave `03_screen_plans.json` built from requirements the
person explicitly corrected, while `screens_cover_requirements` was confirmed against the *old* ids and
every downstream stage reported the phase approved. Nothing downstream re-reads the requirement text
against the plans, so that mismatch would never surface again.

A trivial wording fix that changes no screen is the tempting exception. Take it as `changes_requested`
anyway: whether an edit changes a screen is exactly the judgement the re-run makes for you, and the
re-run is cheap — phase 1 reads the PRD and writes three artifacts.

## Artifact

`reports/<feature>/G1_requirements_signoff.json`, shape enforced by
[`.claude/schemas/artifacts.json`](../../schemas/artifacts.json).

**Do not run `node utils/pipeline.mjs done gate-1-requirements`.** It will refuse — that is the point.
`done` is the reflex every other skill ends with, and a gate that accepted it would be closed by habit
rather than by a decision.

That refusal is a **boundary, not a control**, and the difference is worth being honest about: anything
that can write files can write this signoff directly, and nothing here signs it or keeps an
append-only log of it. What it buys is that closing this gate takes a deliberate, conspicuous act that
no ordinary instruction leads to. Do not read it — or describe it — as making self-approval impossible.
