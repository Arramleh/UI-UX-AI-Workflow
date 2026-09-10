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

Run `/figma:figma-use` in **component-pass mode only**. Build or modify every component and variant in
`11_build_phase.json`; do not create a screen. Then write
`reports/<feature>/12a_figma_components.json` and validate it:

```bash
node utils/pipeline.mjs done figma-component-pass
```

The artifact must name every live component node, its action (`create`, `modify`, or `extend`), variant
count, location, live URL/node ID, token binding status, and whether it was on the build checklist. A
failed or skipped component is evidence to present, not a reason to move on to pages.

## Review packet

Show the designated reviewer the actual Figma component-set links and the component-pass artifact.
They confirm all five checks:

| Check | Reviewer verifies in live Figma |
|---|---|
| `all_approved_components_present` | Every checklist component or variant exists, or an explicit failed/skipped item is sent back. |
| `live_nodes_and_variants_verified` | The real node, variant axes, states, anatomy, and instance behavior match what was specified. |
| `tokens_and_variables_bound` | Existing tokens/variables are bound; no avoidable hardcoded values remain. |
| `naming_location_and_retirement_verified` | Naming, library location, and prior rename/retirement decisions are respected. |
| `no_unapproved_component_changes` | Nothing was added, modified, or reintroduced outside the build checklist. |

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
| **The five checks** | `multiSelect: true` — `all_approved_components_present`, `live_nodes_and_variants_verified`, `tokens_and_variables_bound`, `naming_location_and_retirement_verified`, `no_unapproved_component_changes`. The selection *is* `--checked`; nothing is pre-selected. |
| **Who is approving** | Asked at this gate, every time it is taken — including on a re-take after a bounce. |

The checks question is where the popup earns its place here. Read out as prose, five checks get
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

**`--approve` alone leaves this gate closed.** The five checks are the auditable half of the approval,
so it opens only once every one is `true` — pass `--checked all` when the reviewer confirmed all five,
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
