---
name: gate-2-components
description: GATE 2 (human) — inspect the actual components and variants in live Figma before any page assembly starts.
---

# Gate 2 — Live Component Validation (HUMAN)

```bash
node utils/pipeline.mjs plan gate-2-components
node utils/pipeline.mjs gate 2
```

This is the single gate closing phase 2, and it reviews **the real Figma nodes** — not the mapping
table or the build checklist that specified them. It is the boundary between the component pass and
screen assembly: no page may be assembled out of components no person has inspected.

**Why the nodes and not the plan.** A component that reads correctly on a checklist can still be
misnamed, missing a variant, unbound from its tokens, or sitting in the wrong library location once it
actually exists. None of that is visible in a plan, all of it is cheap to fix before a page is built on
top of it, and once a page is assembled the defect is behind a screen that looks finished.

**What this gate does not do, stated plainly.** The component pass writes to Figma *before* anyone
approves. Nothing gates the creation of components; this gate governs whether they may be **used**. A
change request therefore sends `/figma-component-pass` back to correct writes that have already
happened, rather than preventing them. That is the deliberate cost of one gate in phase 2 instead of
two — a plan review would have caught a wrong component earlier, but only ever as a claim about a
component that did not exist yet.

## Before asking for review

Run **[`/figma-component-pass`](../figma-component-pass/SKILL.md)** — which loads `/figma:figma-use`
and carries the constraints on the write: **into the design system library and nowhere else**, built to
that library's declared conventions and bound to its tokens. Every component and variant in
`11_build_phase.json`; no screens. Then write `reports/<feature>/12a_figma_components.json` and
validate it:

```bash
node utils/pipeline.mjs done figma-component-pass
```

The artifact must name **which file it wrote into** (`design_system_file`, checked against
`05_design_system.json` `figma_library`), and for every live component node: its action (`create`,
`modify`, or `extend`), variant count, location in the library, live URL/node ID, the tokens actually
bound and anything hardcoded, and whether it was on the build checklist. A failed or skipped component
is evidence to present, not a reason to move on to pages.

## Review packet

Show the designated reviewer the actual Figma component-set links and the component-pass artifact.
They confirm all six checks:

| Check | Reviewer verifies in live Figma |
|---|---|
| `built_in_design_system_file` | **Which file the nodes are in.** They are in the design system library — the `file_key` in `05_design_system.json` `figma_library` — and not in the product file beside the screens. |
| `all_approved_components_present` | Every checklist component or variant exists, or an explicit failed/skipped item is sent back. |
| `live_nodes_and_variants_verified` | The real node, variant axes, states, anatomy, and instance behavior match what was specified. |
| `tokens_and_variables_bound` | Existing tokens/variables are bound; no avoidable hardcoded values remain. Read `hardcoded[]` against the library's own `conventions.token_binding.hardcode_policy` — under `forbidden`, a non-empty list is a change request. |
| `naming_location_and_retirement_verified` | Naming, library location, and prior rename/retirement decisions are respected — judged against the library's **declared** `conventions` (`naming.pattern`, `location_pattern`, `variant_axes`, `retired`), not against a sense of house style. |
| `no_unapproved_component_changes` | Nothing was added, modified, or reintroduced outside the build checklist. |

**`built_in_design_system_file` is first because it is the one nobody thinks to check.** A correctly
named, correctly built, fully token-bound component in the *wrong file* looks perfect in every
screenshot and every node link. It is also the defect with the longest tail: the next feature's library
walk will not find it, `/component-analyzer` will report it as a gap, and someone will build it a
second time. Open the file and look at which one you are in — `12a_figma_components.json`'s
`design_system_file.matches_design_system_artifact` is the build's own claim about this, and this check
is what tests it.

Include each component's live Figma URL/node ID, any failure or skipped item, and any proposed
deviation. **Do not treat a screenshot or the checklist as evidence** — this gate reviews the live
design-system nodes, and a screenshot is a picture of a claim.

Two things worth surfacing in the packet even though no check names them, because this gate is now the
only human stop in phase 2:

- **A component name that does not resolve in the live file.** It cannot be an instance later.
- **A product-level escalation raised by `/component-analyzer`** — a taxonomy or data-model conflict
  in `06_component_analysis.json`. No gate refuses to open while one is unanswered, so if it is not
  raised here it surfaces only in the closure report, after the module is built.

## Ask as popup questions

Present the packet above in chat — links, node IDs, failures, deviations — and then **ask with
`AskUserQuestion`**, not as prose to reply to. One popup call carrying the whole decision:

| Question | Shape |
|---|---|
| **The verdict** | approve / request changes / reject |
| **The six checks** | `multiSelect: true` — `built_in_design_system_file`, `all_approved_components_present`, `live_nodes_and_variants_verified`, `tokens_and_variables_bound`, `naming_location_and_retirement_verified`, `no_unapproved_component_changes`. The selection *is* `--checked`; nothing is pre-selected. |
| **Who is approving** | Asked at this gate, every time it is taken — including on a re-take after a bounce. |

The checks question is where the popup earns its place here. Read out as prose, six checks get
answered "looks good"; as a multi-select they get answered one at a time, and the two that were not
actually verified in the live file come back unselected — which is an honest record and a gate that
correctly stays shut.

If `/component-analyzer` raised an **escalation** — a taxonomy or data-model conflict — put it in the
same popup as its own question, with the options and their consequences. Nothing in the graph refuses
to open this gate while one is unanswered, so a popup is the only thing standing between an escalation
and its first appearance in the closure report, after the module is built.

## Record the reviewer's decision

```bash
node utils/pipeline.mjs gate 2 --approve --by "<reviewer>" --checked all \
  --note "Reviewed live component nodes and variants"

node utils/pipeline.mjs gate 2 --changes-requested --by "<reviewer>" \
  --note "Add the loading state to DatePicker and bind its focus border token."
```

**`--approve` alone leaves this gate closed.** The six checks are the auditable half of the approval,
so it opens only once every one is `true` — pass `--checked all` when the reviewer confirmed all six,
or name the subset they actually confirmed (`--checked "a,b"`), which is an honest record and a closed
gate. Do not reach for `--checked all` to get past the refusal.

`--by` must be a real person: `claude`, `ai`, `assistant`, `auto`, `self` and similar are refused, and
the refusal is written to `workflow_log.md`. It comes from the "who is approving" popup answer taken at
**this** gate — not carried over from gate 1, and not from you.

Approval pins `12a_figma_components.json` by **content hash**. If the component-pass record changes
afterwards the gate goes stale and must be re-taken — and neither `--force` nor `--no-stale` re-opens
it, because those are statements about caching and a flag about caching must not revoke a person's
judgement. A change request or rejection returns to `/figma-component-pass`; do not assemble pages
while it is pending.

## This gate is a loop

`changes_requested` is not an endpoint, and neither is "recorded". The gate is taken again and again
until a reviewer approves the components **as they then exist**:

```bash
node utils/pipeline.mjs gate 2 --changes-requested --by "<reviewer>" --note "<what to rebuild>"
/figma-component-pass                            # rebuild against the note
node utils/pipeline.mjs plan gate-2-components   # confirm what else came back with it
/gate-2-components                               # re-inspect the LIVE nodes and ASK AGAIN
```

The command prints that sequence, numbered, with the round it is about to enter. Ask the verdict, all
six checks, and **who is approving** every round — the reviewer is judging components that were
rebuilt after they last looked, which is a different thing from the ones they saw. Every verdict stays
in `history` and `round` is written into the signoff.

Re-inspect the live nodes each round rather than trusting the last inspection: the rebuild is exactly
the event that invalidates it, and the approval pins `12a_figma_components.json` by content hash, so a
signoff taken against a remembered state goes stale the moment the record is rewritten.

This gate seeds no decisions, so it never enters the *answer-driven* half of the loop that gate 1 does
(see [`/gate-1-requirements`](../gate-1-requirements/SKILL.md) → "An answer sends phase 1 back"). A
`/component-analyzer` escalation asked in the popup here is recorded and reported; it does not send
phase 2 back on its own. If the answer invalidates the built components, that is a
`changes_requested` — say so in the note rather than approving around it.

## After approval

```bash
node utils/pipeline.mjs gate 3 --init        # seed the page roster from the checklist
node utils/pipeline.mjs next-page            # the ONE page assembly may work on
```

## Artifact

`reports/<feature>/G2_component_signoff.json`. **`done` will refuse this stage** — only
`pipeline.mjs gate 2` writes it.

That refusal is a boundary rather than a control: anything able to write files can write this signoff
directly, and nothing signs it or logs it append-only. What it buys is that opening the gate between a
component library and everything assembled from it takes a deliberate, conspicuous act that no ordinary
instruction leads to — not that self-approval is impossible.
