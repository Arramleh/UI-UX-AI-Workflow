---
name: run-prd-workflow
description: Run the complete PRD-to-developer-handoff workflow — four AI phases, three human gates
---

# Run PRD Workflow Skill

**This workflow is not unattended.** It is four AI phases held apart by three human validation gates.
You will stop at least three times — at the requirements, at the components as they exist in live
Figma, and then once per assembled page. Parking at a gate is a correct outcome, not a stall.

**Phase 2's gate reviews built components, not the checklist that specified them.** A component that
read correctly in a checklist can still be misnamed, missing a variant, unbound from its tokens, or in
the wrong library location once it actually exists — none of which a plan review can see. So the
component pass runs at the end of phase 2 and gate 2 inspects the real nodes.

**Know what that costs before you run it.** There is no gate in front of the component pass, so it
writes to Figma unreviewed. Nothing prevents a wrong or unlisted component from being created; gate 2
is where it is caught, after the fact, by `no_unapproved_component_changes`. And no gate now refuses to
open around an unanswered product decision — a `/component-analyzer` escalation must be raised in the
gate 2 packet by you, or it will surface only in the closure report.

```bash
node utils/pipeline.mjs plan run-prd-workflow            # resume: skip stages already done
node utils/pipeline.mjs status                           # where this feature stands, by phase
node utils/pipeline.mjs graph                            # the dependency graph
node utils/pipeline.mjs check                            # validate the manifest itself
```

Run `plan` first, collect **all** `INPUTS NEEDED` in one go, then work down `RUN THESE SKILLS FIRST` one
at a time. Skills under `ALREADY SATISFIED` are skipped — that is what makes a re-run resume.

## Read `workflow_log.md` before you start, and write to it as you go

**`reports/<feature>/workflow_log.md`** is this PRD's record of every step, every skill and every action —
one log per PRD. On a resume it is the first thing to read: it says what earlier sessions did, what they
decided, and why they stopped, none of which the artifacts themselves record.

`plan`, `done`, `gate`, `next-page` and `path --ensure` write to it themselves — you do not append those.
What you **must** log is everything the CLI cannot see, at the moment it happens:

```bash
node utils/pipeline.mjs log "pass 1: created 6 component sets in Figma" --stage figma-component-pass --kind build
node utils/pipeline.mjs log "assembled 'Notification Inbox' — 14 instances, 2 tokens unbound" --stage figma-use --kind build
node utils/pipeline.mjs log "taxonomy conflict escalated to product, not designed around" --kind decision
node utils/pipeline.mjs log "'Quiet Hours' bounced at gate 3 — designer hand-edited the frame, re-assembling" --kind note
```

Each Figma write pass, each escalation, each gap assembly stopped on. Those are the actions with no
artifact of their own until much later, so without a line here they are the gaps in the run's history.

## The shape of the run

```
                    PRD
                     │
   PHASE 0 ─ live inspection ─ /design-system-loader · /figma-extractor
                     │
   PHASE 1 ─ requirement extraction ─ /prd-analyzer · /prd-design-requirements
                     │
   ══════ GATE 1 (HUMAN) ══════ /gate-1-requirements ──(changes)──► back to phase 1
                     │ approved
   PHASE 2 ─ design system mapping ─ /screen-planner · /screen-validator ·
             /component-analyzer · /coverage-scorer · /coverage-reporter · /figma-modifier
                     │
                     │ the build checklist
   PHASE 2 ─ component pass ─ /figma-component-pass — components/variants only
                     │           [UNGATED: these Figma writes have no signoff in front of them]
   ══════ GATE 2 (HUMAN) ══════ /gate-2-components ──(changes)──► component pass
                     │ approved live components
   PHASE 3 ─ screen assembly ─ /figma:figma-use — ONE PAGE AT A TIME
                     │
   ══════ GATE 3 (HUMAN) ══════ /gate-3-pages ──(edit)──► same page, phase 3
                     │ approve  ──► more pages? ──yes──► next page, phase 3
                     │ no — every page approved
                     │           [phase 3 ENDS here: nothing re-reads the module afterwards]
   PHASE 4 ─ /developer-handoff · /closure-reporter
                     │
              handed to the dev team
```

| # | Skill | Phase | Requires | Writes |
|---|-------|-------|----------|--------|
| 1 | `/design-system-loader` | 0 | — | `05_design_system.json` → **`reports/_shared/`** |
| 2 | `/prd-analyzer` | 1 | — | `01_prd_requirements.json` |
| 3 | `/figma-extractor` | 0 | — | `02_figma_state.json` |
| 4 | `/prd-design-requirements` | 1 | 2, 1 (3 optional) | `design_requirements.md`, `design_requirements_visual.pdf` |
| **5** | **`/gate-1-requirements`** | **GATE** | 2, 4 | `G1_requirements_signoff.json` |
| 6 | `/screen-planner` | 2 | 2, **5** (3, 4 optional) | `03_screen_plans.json` |
| 7 | `/screen-validator` | 2 | 2, 6 | `04_screen_validation.json` |
| 8 | `/component-analyzer` | 2 | 1, 6 | `06_component_analysis.json` |
| 9 | `/coverage-scorer` | 2 | 2, 6, 8 | `07_coverage_scores.json`, `09_gap_analysis.json` |
| 10 | `/coverage-reporter` | 2 | 2, 6, 8, 9 | `coverage_report_<date>.pdf`, `10_roadmap.json` |
| 11 | `/figma-modifier` | 2 | 3, 1, 6, 8, 9, 10 | `11_build_phase.json` — **the build checklist** |
| 12 | `/figma-component-pass` (loads `/figma:figma-use`) | 2 | 11 — **no gate**, its output is what gate 2 reviews | `12a_figma_components.json` |
| **13** | **`/gate-2-components`** | **GATE** | 12 | `G2_component_signoff.json` |
| 14 | `/figma:figma-use` page assembly | 3 | 11, 12, **13** | `12_figma_build.json` (written incrementally) |
| **15** | **`/gate-3-pages`** | **GATE** | 14 | `G3_page_signoffs.json` — one decision per page |
| 16 | `/developer-handoff` | 4 | **15**, 11, 12, 14, 2 | `15_developer_handoff.json`, `handoff_<date>.md` |
| 17 | `/closure-reporter` | 4 | **2 only** — everything else optional, incl. all three gates | `closure_report_<date>.pdf`, `14_closure_notes.json` |

Everything except stage 1 is per-feature, in `reports/<feature>/`.

## The three gates

**A gate is not work you can do.** Its artifact records a decision a person made, so
`node utils/pipeline.mjs done <gate>` **refuses**, and only `pipeline.mjs gate` writes it — with `--by
<person>` required and `claude`, `ai`, `auto`, `self` and friends rejected. A gate signed by the thing
being gated is not a gate.

When `plan` prints a `STOP — HUMAN GATE` box, load that gate's skill, build the packet it describes,
present it, **ask, and wait**. Do not start the next phase "while they review": `plan` marks every
downstream stage `blocked`, the resolver will refuse, and offering to is how the boundary erodes.

**Ask every gate with `AskUserQuestion` popups, never as prose the person replies to in chat.** A gate
answered in free text is a gate answered by whoever paraphrases the reply into a `pipeline.mjs gate`
command — and that is you. A popup returns the person's own selections, and it makes an unanswered
item visibly unanswered rather than simply unmentioned. The packet — links, node IDs, failures,
deviations — still goes in the chat message above the popup: four short options with no evidence in
front of them is a question being approved, not a gate. Every gate popup carries:

| Part | Where it applies |
|---|---|
| **The verdict** — approve / request changes / reject | every gate; at gate 3, for **that page only**, never a blanket one |
| **A `multiSelect: true` list of the gate's declared checks** | gates 1 and 2. The selection *is* `--checked`; pre-select nothing, and a subset is an honest record of a gate that stays shut |
| **One question per open decision**, options and consequences, recommended one marked | gate 1 — the only gate that seeds decisions. It refuses to open while any answer is empty |
| **Who is approving** | **every gate, every time**, including once per page at gate 3 and on a re-take after a bounce. Never carried over from an earlier gate, never inferred from the git author or the session, and never supplied by you. That name is what goes in `--by` |

Ask anything reported `NOT SET` the same way, up front, in the same popup form — not as a paragraph
ending in a question mark.

```bash
node utils/pipeline.mjs gate 1 --approve --by "<person>" --checked all --note "..."
node utils/pipeline.mjs gate 2 --changes-requested --by "<person>" --note "<what to rebuild>"
node utils/pipeline.mjs gate 3 --page "<name>" --approve --by "<person>"
node utils/pipeline.mjs gate 2            # where does this gate stand?
```

**Gates 1 and 2 need `--checked`, or they stay closed.** Each declares its checks in
[`.claude/pipeline.json`](../../pipeline.json), and an approval opens the gate only when every one of
them is `true`. `--approve --by "<person>"` on its own records the approval and the gate remains
`AWAITING`, naming the checks that are not confirmed:

```bash
# gate 1: atomized, flows_broken_to_frames, ambiguity_flagged, prd_claims_verified
node utils/pipeline.mjs gate 1 --approve --by "<person>" --checked all

# gate 2: all_approved_components_present, live_nodes_and_variants_verified,
#         tokens_and_variables_bound, naming_location_and_retirement_verified,
#         no_unapproved_component_changes
node utils/pipeline.mjs gate 2 --approve --by "<person>" \
     --checked "all_approved_components_present,tokens_and_variables_bound"
```

Pass only what the person confirmed. An unrecognised name is refused with the valid list, and a subset
is a legitimate record of a gate that is not ready — not something to paper over with `--checked all`.
Gate 3 declares no checks, so `--checked` has no meaning there; its per-page decision *is* the check.

A gate whose verdict is `changes_requested` or `rejected` **sends its own phase back** — `plan` marks
those stages `run` again, and that is the backwards arrow in the chart. Re-run them against the
person's notes, then re-take the gate. Every verdict stays in `history`.

An approval also **goes stale**: regenerate an artifact the gate signed off and `plan` reports the gate
as needing to be re-taken. A signoff describing work that has since been rebuilt still reads as passed,
which is why this is checked rather than trusted. Gate 2 additionally pins `checklist_fingerprint`, a
**content hash** of `11_build_phase.json` rather than its size and mtime. Neither `--force` nor
`--no-stale` re-opens a stale gate, and a signoff that fails its schema does not open one at all —
`plan`, `validate` and `status` agree on that, where `plan` used to read the verdict alone and report
READY while `validate` reported INVALID.

**What the refusal does not achieve.** `done` refusing a gate is a boundary, not a control: anything
able to write files can write a signoff directly, and nothing signs the record or logs it append-only.
What it buys is that closing a gate takes a deliberate, conspicuous act no ordinary instruction leads
to — every reflex in this workflow pushes the other way. Do not describe it as making self-approval
impossible.

**Open decisions are raised, not taken.** This reverses how this pipeline used to behave, and the
reason is worth understanding: auto-deciding was the right answer for an unattended run and the wrong
answer here. `/prd-design-requirements` §8 and `/component-analyzer`'s escalations now present each
open item with its options, a recommendation, and the consequence of each — a decision *packet*. **Gate
1** will not open while any of them has an empty `answer`, and the command enforces that even after
`--approve`. **Gate 2 does not**: it is a component review and seeds no decisions, so a decision raised
after gate 1 — a `/component-analyzer` escalation, typically — has no gate holding it open. Raise it in
the gate 2 packet anyway; nothing else will.

## Phase 3 is the one with a hard rule

> **Phase 3 never advances past an unapproved page.**

The component pass runs at the end of phase 2, then the run parks at gate 2. Only after the live
components are approved may assembly place instances of them, **one page at a time**:

```bash
node utils/pipeline.mjs done figma-component-pass  # after writing 12a_figma_components.json
node utils/pipeline.mjs gate 2 --approve --by "<person>" --checked all
node utils/pipeline.mjs gate 3 --init        # seed the roster from the build checklist
node utils/pipeline.mjs next-page            # the ONE page you may work on
#   ... assemble it, write it into 12_figma_build.json, present it, ask ...
node utils/pipeline.mjs gate 3 --page "<name>" --approve --by "<person>"
node utils/pipeline.mjs next-page            # only now
```

**None of those three work before gate 2 is signed off.** `--init` refuses to seed a roster while the
components it will assemble are uninspected; `next-page` and `pages` print
`STOP — /gate-2-components is AWAITING` and `next-page` **exits 1 naming no page**, where it used to say
`ASSEMBLE THIS PAGE` and send assembly to place instances of components no person had looked at.

`--init` also validates `11_build_phase.json` against its schema before reading it, and refuses on a
screen with no name or on two screens whose names differ only in case — a nameless page can never be
signed off, and a case-only duplicate makes one of the two unreachable, so either would leave this gate
permanently unsatisfiable. **Every one of those refusals is fixed in `/figma-modifier`**, not in the
gate. Re-seeding preserves decisions already taken (including through a case-only rename) and warns
loudly, by name and verdict, when a page has left the checklist and taken its recorded decision with it.

`next-page` names one page and lists the rest under `NOT YET`. It refuses to name a second while one is
undecided. `pages` shows the ledger, and flags an approval recorded while an earlier page was still
pending — the footprint of assembly having run ahead.

Three boundaries bind assembly, each from a real failure:

- **Only gate-2-approved components.** A gap the checklist missed is a **stop**: record it in
  `discovered_gaps` with `action: "stopped-and-flagged"` and raise it. Closing it means looping back to
  phase 2 — re-spec, rebuild, and re-take gate 2 on the rebuilt components. An improvised component is
  indistinguishable from an inspected one once it is in the file, and gate 2 has already been taken by
  the time assembly starts, so nothing downstream will catch it.
- **Bind tokens; never hardcode where a token exists.**
- **Honour earlier naming and retirement decisions.** A retired component stays retired.

Ordering is forced, not stylistic: the component pass makes real nodes, gate 2 validates them, and
only then does page assembly place *instances* of them. A screen whose component failed goes in `failed`
with `kind: "screen"` — never assembled around the hole. `12_figma_build.json` is written
**incrementally** after each page and carries `pages_remaining`; an end-of-run write could only exist
after every page was built, which is the state the gate exists to prevent.

`/figma:figma-use` is external (it ships with the Figma plugin, hence the prefix) and will not write our
artifacts, so **you** write `12a_figma_components.json` after the component pass and run
`node utils/pipeline.mjs done figma-component-pass`; after gate 2 opens, write
`12_figma_build.json` incrementally during page assembly and run `node utils/pipeline.mjs done figma-use`.
`/figma-modifier` only writes specs, because the Figma REST API cannot create components.

If `AUTO_CREATE_COMPONENTS` is false, still load `/figma:figma-use` and present the build plan, but ask
before writing.

## Phase 3 ends at gate 3, and what that costs

When the last page is approved, the run goes straight to phase 4. There is no post-build audit: the
`/prd-auditor` stage, `13_prd_audit.json`, the covered/gaps_found/blocked verdict, the 5-iteration cap
and the loop back through gate 2 have all been removed.

**Say what that gave up, rather than letting someone discover it.** Stages 1–11 measure *intent* — they
score the screen plans against the library, and every one of them can report a feature fully covered
while the file contains something else. Stage 14 reports what it *believes* it built. The auditor was
the one stage that read the **PRD itself** against the live file, at full depth, after the fact. With it
gone:

- **Gate 3 is now the only comparison between the PRD and what was actually built** — and it is a
  per-page human judgement on one frame at a time, not a machine read of the whole module. Present each
  page against the requirements it is supposed to satisfy, not just against its own spec.
- **Nothing re-reads the module as a whole once the last page is approved.** A requirement dropped from
  the checklist back in phase 2 has no downstream stage left that can catch it — no page will look
  wrong, because the missing thing was never planned into any page.
- **A gap now surfaces only if assembly walks into it.** `discovered_gaps` with
  `action: "stopped-and-flagged"` is the remaining route back: re-spec with `/figma-modifier`, re-run
  `/figma-component-pass`, **take gate 2 again**, then re-assemble the affected page through gate 3.
  That is still a phase-2 change and still needs re-approval — building on a re-spec without it would
  put components no human signed off into pages.

```bash
node utils/pipeline.mjs done figma-modifier --force   # then re-run the skill
```

Re-spec only what was actually flagged. Re-speccing everything rebuilds components that already passed
review and puts them back in front of a reviewer for no reason. And keep unbuildable things out of the
re-spec entirely — an open decision or an action needing a human in the Figma editor is not a gap to
build, it is an entry for `/closure-reporter`'s `still_missing[]`.

## Phase 4 — two documents, different audiences

**`/developer-handoff`** is what engineering builds from: one spec per approved page (layout, tokens,
props and variants, states, breakpoints, edge cases), plus a change-log of every component created or
modified during assembly, cross-linked to the **live** Figma sources. It requires `gate-3-pages`
**hard** — a handoff for a module whose pages were never all approved presents unapproved work as
shippable. It re-verifies every name against the current file, because gate 3 explicitly permits the
designer to hand-edit a frame, so the frame being specced is routinely not the one assembly last saw.
It is **terminal**: an issue surfaced after handoff re-enters through phase 1 or 2, not by quietly
redoing assembly.

**`/closure-reporter`** always runs, on every outcome, including a module parked at gate 2 and a run
abandoned at gate 1 — hence every one of its edges being optional. Its `final_state` is
`all-pages-approved`, `parked-at-gate` (with `stopped_at` and `pages_pending`) or `abandoned`, read off
the **gate records** rather than off a machine verdict about the file, because there is no longer a
machine verdict about the file. `all-pages-approved` says every page got a decision; it is not a claim
that the module covers the PRD, and it must not be written up as one. It records what was created, what
is still missing and why, and every open decision with the option that was **taken at a gate** and by whom. It
builds `open_decisions[]` from the gate signoff records, not by re-deriving them from the PRD:
re-deriving yields a list of what the workflow *should* have decided, which reads identically to the
truth and is wrong wherever the human chose against the recommendation. It adds `reversible_by` — what
changing a decision would now cost, which is only knowable once the thing is built.

## Two skills are deliberately absent

Both are `"standalone": true` in [`.claude/pipeline.json`](../../pipeline.json): nothing depends on them
and this orchestrator does not run them. `check` lists them explicitly and errors if any stage declares
a dependency on one.

- **`/evaluate-design-system`** grades the *library* — its own audience and cadence, not a step in
  shipping a feature.
- **`/requirements-to-prototype`** turns the phase-1 doc into one interactive `.dc.html` prototype. It
  is a parallel deliverable to the Figma build, does no Figma writes, and needs Design Component tooling
  that does not exist everywhere.

## Resume, staleness, and `--force`

You rarely need `--force`. An edited PRD invalidates `/prd-analyzer` and everything downstream on its
own, because the inputs each stage was recorded against are stored. `--force` is for what no local check
can see: the Figma file or design system library edited remotely under an unchanged URL. **Neither
`--force` nor `--no-stale` re-opens a gate** — a gate closed by a person stays closed until it goes
stale or is re-taken, and `--no-stale` does not un-stale one either: it means "reuse cached work rather
than rebuilding it", and a flag about caching must not revoke a person's judgement.

Every non-gate stage ends with `node utils/pipeline.mjs done <stage>`, which validates the artifact
against [`.claude/schemas/artifacts.json`](../../schemas/artifacts.json) and records its inputs. Do not
start the next stage until it passes: a stage whose artifact was rejected has not run, whatever the
skill reported.

## Usage

```
/run-prd-workflow
/run-prd-workflow --figma-url "https://www.figma.com/file/..." --prd "prds/notification-center.md"
```

| Parameter | Required | Example |
|---|---|---|
| `prd_source` | yes | `prds/notification-center.md` — a pasted PRD must be saved to a file first |
| `figma_url` | yes | `https://www.figma.com/file/xxxxx` |
| `design_system_url` | yes | a Figma file, Markdown, or URL |

## Output

```json
{
  "gates": {
    "gate_1": { "verdict": "approved", "by": "...", "rounds": 2, "decisions_answered": 3 },
    "gate_2": { "verdict": "approved", "by": "...", "rounds": 1, "decisions_answered": 1 },
    "gate_3": { "pages_total": 4, "pages_approved": 4, "revision_rounds": 6, "manually_edited": 1 }
  },
  "coverage_pdf": "reports/<feature>/coverage_report_<date>.pdf",
  "coverage_score": 78.5,
  "figma_build": { "built": 5, "screens_built": 4, "pages_remaining": 0, "discovered_gaps": 1 },
  "handoff": { "pages_specced": 4, "change_log_entries": 6, "unresolved_names": 0,
               "doc": "reports/<feature>/handoff_<date>.md" },
  "closure": { "final_state": "all-pages-approved", "still_missing": 3, "open_decisions_taken": 5,
               "pdf": "reports/<feature>/closure_report_<date>.pdf" }
}
```

## Notes

- The run finishes when every page has cleared gate 3 and phase 4 has produced both documents — not
  when the build finishes. "Every page approved" is the strongest claim available; nothing here checks
  the finished module against the PRD as a whole
- Report gate state honestly: "parked at gate 2 awaiting a taxonomy decision" is a result. "Complete"
  is not, if a gate is open
- All outputs land in `reports/<feature>/`; `reports/` is output only and is not committed
