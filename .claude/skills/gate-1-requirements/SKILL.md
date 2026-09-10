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

Phase 1 turned an unstructured PRD into a flat list of atomic UI/flow requirements. Gate 1 asks one
question: **is that list complete, correctly atomized, and free of unresolved ambiguity?**

- **Pass** — a signed-off requirement list with zero open questions blocking design work.
- **Fail** — requirements incomplete or still bundled, or an open question unanswered. It goes back to
  phase 1 (`/prd-analyzer`, `/prd-design-requirements`) with clarifications, or the person edits it by
  hand before phase 2 starts.

Nothing in phase 2 may run until this passes. That is enforced by the graph — `/screen-planner`
requires this stage — not by your discipline.

## Step 1 — Read the artifacts, do not summarise from memory

Read `reports/<feature>/01_prd_requirements.json` and `reports/<feature>/design_requirements.md` in
full. You are about to ask someone to sign off on their contents; presenting a recollection of them is
how a gate approves something nobody read.

Point the reviewer at `reports/<feature>/design_requirements_visual.pdf` too — the same content laid out
to be read, with the flows and the page/component tree drawn as graphs. It is the copy most people will
actually read, so check it is there and current with the markdown before asking. It is a rendition, not
a source: where the two differ, the markdown is what is being signed off, and a difference is a defect
to send back rather than a discrepancy to explain away.

## Step 2 — Build the gate packet

Present, in the chat, in this order:

**A. The four checks, each with your own honest verdict and the evidence for it.**

| Check | What makes it true |
|---|---|
| `atomized` | Every UI-relevant need is a single line. Quote any line you suspect is still bundled — "a filterable table with export and inline editing" is three requirements, and one that reaches phase 2 unsplit compounds into an ambiguous mapping there. |
| `flows_broken_to_frames` | Flows are decomposed to named pages/frames, not left at screen level. |
| `ambiguity_flagged` | Every ambiguous or acceptance-criteria-light item is an open decision, not an assumption you made. |
| `prd_claims_verified` | Every component name, page reference and "existing vs. new" label **the PRD itself supplied** was checked against the live Figma file rather than inherited. |

**Be specific about `prd_claims_verified`.** A PRD on this project arrived with a pre-filled components
section and Figma page references that were entirely fabricated — none of the referenced pages existed.
List each claim the PRD made, and next to it what the live file actually says. If phase 1 did not strip
those claims into `unverified_prd_claims[]`, this check is **false** and you say so.

**B. The requirement list itself**, grouped by flow, one line each, with ids.

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
| **The four checks** | `multiSelect: true` — `atomized`, `flows_broken_to_frames`, `ambiguity_flagged`, `prd_claims_verified`. What they select is exactly what goes in `--checked`. Do not pre-select for them. |
| **One question per open decision** | The question from §8, its options as the options, the recommended one first and labelled `(Recommended)`, each option's `description` carrying the consequence. |
| **Who is approving** | Asked here, at this gate, every time. Never inferred from the git author, the session, or an earlier gate. |

`AskUserQuestion` takes at most four questions per call, so with more than one or two open decisions
this becomes several calls. Ask the **open decisions first**, then the verdict and checks — a person
cannot sensibly approve a requirement list while the questions inside it are still open, and asking in
that order makes the dependency obvious instead of leaving them to notice it.

Then **stop and wait**. A run parked at a gate is a correct state. Do not begin phase 2 "to save time
while they review" — `/screen-planner` will refuse anyway, and offering to is how the boundary erodes.

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
**stays closed**, because a gate opens only when every one of its four checks is `true`. Name the ones
the person confirmed:

```bash
# they confirmed all four
node utils/pipeline.mjs gate 1 --approve --by "<their name>" --checked all
# they confirmed only these two — the other two stay false, so the gate stays closed
node utils/pipeline.mjs gate 1 --approve --by "<their name>" --checked "atomized,ambiguity_flagged"
```

The check names are `atomized`, `flows_broken_to_frames`, `ambiguity_flagged`, `prd_claims_verified` —
the four in the table above, declared in [`.claude/pipeline.json`](../../pipeline.json). A name that is
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
node utils/pipeline.mjs plan gate-1-requirements   # prd-analyzer / prd-design-requirements come back
```

Re-run them against the person's notes, then present the packet again. The previous verdict, who gave
it and when stay in `history` — a gate that bounced twice before passing is a different fact from one
that passed first time, and `/closure-reporter` reads that.

If instead they corrected the requirements **by hand**, record the ids they touched in
`requirements_edited[]`. Phase 2 must map the corrected text, not the text phase 1 extracted.

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
