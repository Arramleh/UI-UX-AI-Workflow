# Reviewing a PRD-to-UI run

You are here because someone asked you to sign off a **gate**. This pipeline runs four AI phases held
apart by four human validation gates, and it will not advance past one until a person decides. Your
decision is the thing that unblocks it.

You do not need Claude Code, a Figma token, or an `.env` file. You need the repo, Node, and a browser
for the Figma link when the gate is about Figma.

---

## One-time setup

```bash
git clone <this repo>
cd prd-to-ui-workflow
node utils/pipeline.mjs projects     # which features have a run in progress
```

`reports/<feature>/` is committed precisely so you can read it. Everything you need to review is in
there — no build step, no API keys.

---

## Every review, in five steps

```bash
# 1. get the current state
git pull

# 2. read what has happened so far — this is the per-PRD record of every step and decision
cat reports/<feature>/workflow_log.md

# 3. find out where the run is parked
node utils/pipeline.mjs status --project <feature>

# 4. read the gate's own state and what is holding it
node utils/pipeline.mjs gate <n> --project <feature>

# 5. read the artifacts that gate covers (see the table below), then decide
```

Then record the decision — **your name, not the operator's, not "the team"**:

```bash
node utils/pipeline.mjs gate <n> --approve --by "Your Name" --checked all --project <feature> --note "..."
```

```bash
git add reports/ && git commit -m "gate <n>: approved" && git push
```

The push matters. A signoff sitting in your clone advances nothing.

---

## The four gates

| Gate | Question it asks | Read these | Checks you are confirming |
|---|---|---|---|
| **1** | Is the requirement list complete, correctly atomized, and free of unresolved ambiguity? | `01_prd_requirements.json`, `design_requirements.md` | `atomized`, `flows_broken_to_frames`, `ambiguity_flagged`, `prd_claims_verified` |
| **2** | Is every requirement correctly mapped onto the design system, and is the build checklist right? | `06_component_analysis.json` (the `mapping_table`), `11_build_phase.json`, `coverage_report_<date>.pdf` | `all_requirements_mapped`, `direct_matches_variant_verified`, `no_match_nested_checked`, `gaps_have_resolution_path`, `no_invented_component_names` |
| **2B** | Do the components that were just built actually exist, correctly, as live Figma nodes? | `12a_figma_components.json` — **and the live Figma file** | `all_approved_components_present`, `live_nodes_and_variants_verified`, `tokens_and_variables_bound`, `naming_location_and_retirement_verified`, `no_unapproved_component_changes` |
| **3** | Is *this page* right? One decision **per page**. | `12_figma_build.json` — **and the live Figma frame** | none — the per-page decision *is* the check |

**Gate 2 is the only thing between analysis and write access to Figma.** Nothing is created in the
Figma file until you open it.

**Gate 2B wants you in Figma, not in the JSON.** A component can read perfectly on the checklist and
still be misnamed, missing a variant, or unbound from its tokens once it exists as a node. That is the
entire reason this gate exists between the two build passes.

---

## `--checked` is not optional

`--approve` on its own records your approval and the gate **stays closed**. It opens only when every
declared check is `true`. Name the ones you actually confirmed:

```bash
# you confirmed all of them
node utils/pipeline.mjs gate 1 --approve --by "Your Name" --checked all --project <feature>

# you confirmed only two — the others stay false, so the gate stays closed, correctly
node utils/pipeline.mjs gate 1 --approve --by "Your Name" \
     --checked "atomized,ambiguity_flagged" --project <feature>
```

A partial approval is a legitimate record of a gate that is not ready. Do not reach for `--checked all`
because five names are tedious to type — that is the exact failure the flag was added to make visible.

A gate also will not open while any **open decision** still has an empty `answer`. The command tells you
which decision is holding it. Answer it, then re-record.

---

## Sending it back

```bash
node utils/pipeline.mjs gate 2 --changes-requested --by "Your Name" --project <feature> \
     --note "what specifically to re-map"
```

That marks the gate's own upstream stages to be re-run. Be concrete in `--note` — it is the whole brief
for the next iteration. `--reject` exists for "this should not proceed at all".

Every verdict stays in `history`. A gate that bounced twice before passing is a different fact from one
that passed first time, and the closure report reads that.

---

## Gate 3 works page by page

```bash
node utils/pipeline.mjs next-page --project <feature>   # the ONE page you may review now
node utils/pipeline.mjs pages     --project <feature>   # the full per-page ledger

node utils/pipeline.mjs gate 3 --page "<exact page name>" --approve --by "Your Name" --project <feature>
```

The roster comes from the gate-2-approved checklist, so a page that was silently dropped during
assembly still shows as pending. A blanket verdict is refused — `--page` is required.

If you **hand-edited the frame in Figma** rather than sending it back, say so:

```bash
node utils/pipeline.mjs gate 3 --page "<name>" --approve --by "Your Name" --manually-edited --project <feature>
```

That obliges the later stages to re-inspect the live frame instead of trusting the spec. Leaving it off
is how engineering ends up with a spec built from a frame that no longer matches.

---

## Things to know before you sign anything

**Read the artifacts, not a summary of them.** If the operator (or Claude) has summarised the
requirement list in chat, that is a recollection. The file is the thing you are signing.

**Four rules exist because they were broken here before, and they are what gates 1 and 2 are really
testing:**

- A PRD arrived once with a pre-filled components section and Figma page references that were entirely
  fabricated. Anything the PRD *claims* about existing components belongs in `unverified_prd_claims[]`
  and must have been checked against the live file. That is `prd_claims_verified`.
- "Existing vs. new" labels from a PRD are unreliable. Items marked "new" were already fully assembled.
- Absence from a keyword search is not absence from the file — a bell icon reported missing was nested
  inside another component set. `evidence.method: "keyword-search-only"` is rejected at gate 2.
- A "direct match" is a claim about *variants*, not resemblance. "It's a button" says nothing about
  whether the variant, state and icon support the requirement needs actually exist.

**Never approve a gate on the AI's judgement, and never let it approve on yours.** `--by` refuses
`claude`, `ai`, `assistant`, `auto`, `self` and similar. A gate signed by the thing being gated is not a
gate.

**Being honest about what this enforces:** `--by` is free text and this repo does not sign or verify it.
The real provenance is your git commit. What the mechanism buys is that closing a gate takes a
deliberate, conspicuous act that no ordinary instruction leads to — not that self-approval is
impossible.

**A run parked at a gate is a correct state.** If you are not ready to decide, leave it open and say so.
Nothing downstream will start without you.
