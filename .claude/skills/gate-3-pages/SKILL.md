---
name: gate-3-pages
description: GATE 3 (human) — present ONE assembled page at a time for validation and record a decision per page. Phase 3 never advances past an unapproved page.
---

# Gate 3 — Per-Page Validation (HUMAN)

```bash
node utils/pipeline.mjs plan gate-3-pages
node utils/pipeline.mjs pages          # the per-page ledger
node utils/pipeline.mjs next-page      # the ONE page you may work on
```

> **The single hard rule of this whole pipeline: phase 3 never advances past an unapproved page.**
> Everything in this file exists to enforce that one line.

## How the loop actually runs

```
seed roster ──> next-page ──> assemble THAT page ──> present it ──> record decision
                    ▲                                                     │
                    └──────── approved: next page │ changes: same page ◄───┘
```

### Step 0 — Seed the roster, once

```bash
node utils/pipeline.mjs gate 3 --init
```

This reads the page list from `11_build_phase.json` — **the build checklist**, not from whatever
assembly happened to build. That direction matters: seeded from the build, a page that was silently
dropped would never appear as pending, and the module would read as fully approved with a page missing.

`--init` refuses rather than seeding a roster it cannot make work, and every refusal is fixed
**upstream in [`/figma-modifier`](../figma-modifier/SKILL.md)**, never here:

- **Gate 2 is not approved** (or has gone stale, or the component pass still has work to re-run). The
  components built by `/figma-component-pass` must be approved as live nodes at
  [`/gate-2-components`](../gate-2-components/SKILL.md) before page assembly can start. Note what this
  does and does not mean: nothing gated the *creation* of those components, so they are already in the
  file — gate 2 governs only whether pages may be assembled out of them.
- **`11_build_phase.json` does not satisfy its schema.** The checklist is validated before it is read,
  because a screen with no `name` produced a roster entry with no `page` key — and then `pages` crashed,
  `next-page` announced "undefined", and the decision could not be recorded at all, so gate 3 was
  unrecoverable except by hand-editing the artifact.
- **A screen with no name.** A page that cannot be named cannot be signed off, so it would sit pending
  forever and this gate could never be satisfied.
- **Two screens whose names differ only in case** ("Inbox" and "inbox"). `--page` resolves
  case-insensitively, so one of the two would be permanently unreachable. They are refused rather than
  de-duplicated: de-duplicating loses a page silently.

Re-running `--init` after the checklist changes **preserves decisions already taken**, including through
a case-only rename — an approval given for "Inbox" is evidence about the frame, not about the string. If
a page has left the checklist, the decision recorded against it is dropped, and the command says so
**loudly**, by name and verdict. Read that warning: a page that quietly leaves the roster leaves the
module reading as fully approved without it, which is the exact failure seeding-from-the-checklist
exists to prevent. If the removal was not deliberate, restore the page in `/figma-modifier` rather than
carrying on — and if that re-spec also changes any component, re-run `/figma-component-pass` and re-take
gate 2 on the rebuilt nodes, since gate 2 pins the component-pass record and not the checklist.

### Step 1 — Ask which page, every single time

```bash
node utils/pipeline.mjs next-page
```

It names **one** page and lists the rest under `NOT YET`. Do not batch. Do not "get ahead" on page N+1
while page N is with the designer — not even reading ahead to plan it, because the designer's feedback on
page N routinely changes page N+1, and work done early is work you are then reluctant to throw away.

**Both `next-page` and `pages` check gate 2 first.** With gate 2 anything other than approved they print

```
STOP — /gate-2-components is AWAITING, so nothing here may be built yet.
```

and `next-page` **exits 1 and names no page at all**. It used to say `ASSEMBLE THIS PAGE` regardless —
telling assembly to make exactly the Figma writes gate 2 had just withheld. `plan` blocked it, but
`plan` is not the command being followed at this point in the run. `pages` prints the STOP banner above
the ledger and still shows it, because reading the ledger is not building anything.

### Step 2 — Assemble that page, then stop

Full mechanics are in [`/figma-modifier`](../figma-modifier/SKILL.md) and `/figma:figma-use`. Three
boundaries bind you while you build:

- **Use only components gate 2 approved.** If assembly reveals a gap the checklist and the component
  review both missed, **stop and flag it** — put it in `12_figma_build.json` `discovered_gaps` with
  `action: "stopped-and-flagged"` and bring it to the designer. Do not improvise a fix. Closing it means
  a loop back to phase 2: a re-spec in `/figma-modifier`, another `/figma-component-pass`, and a fresh
  gate-2 approval of the rebuilt components. An improvised component looks identical to a reviewed one
  in the file, which is exactly why this has to be a stop — and it is why gate 2 reviews live nodes,
  since a component invented mid-assembly is one no node review ever saw.
- **Bind tokens and variables; never hardcode a value where a token exists** for that purpose.
- **Honour naming and retirement decisions** from earlier sessions. A component that was renamed or
  retired stays that way. Reaching for the old name out of habit reintroduces it.

Then write the page into `12_figma_build.json` (`screens_built` + `current_page`, and shrink
`pages_remaining` by one) and **stop building**.

### Step 3 — Present that one page

Show the designer:

- A screenshot or link to the **live frame** — and its `node_id`.
- The requirement it implements, quoted from `01_prd_requirements.json`.
- Every component instance placed, by name, each marked as gate-2-approved or an in-the-moment
  deviation.
- The tokens bound, and **any value you had to hardcode** — say so rather than letting it be found later.
- Anything from the plan you could not build, and why.

The question is narrow: **does this page, exactly as built, match the build checklist, the components
gate 2 approved, and the requirement underneath it?**

This is now the **last** comparison anyone makes between what the PRD asked for and what is actually in
Figma. There used to be a `/prd-auditor` stage after this one that read the live file at full depth
against the PRD and looped back through gate 2 while gaps remained; it was removed. Nothing downstream
re-reads the module. So the question above is not a formality on top of a machine check — it *is* the
check, and a requirement quietly dropped back in phase 2 has no stage left that can still catch it.

### Step 4 — Ask as popup questions, once per page

**Ask with `AskUserQuestion`**, not as prose in chat. One popup call **per page**:

| Question | Shape |
|---|---|
| **The verdict for THIS page** | approve / request changes / reject. Name the page in the question text. |
| **Was the frame hand-edited?** | yes / no — a `yes` becomes `--manually-edited`, which obliges you *and* phase 4 to re-inspect the frame live. Ask it rather than inferring it: you cannot see an edit made in the Figma editor. |
| **Who is approving** | Asked **again, for this page**. Not carried over from the previous page, however tedious that feels across a nine-page module. |

Re-asking the name every page is the deliberate cost of a per-page gate. The point of this gate is that
each page got its own decision from a person; a name captured once at page 1 and stamped onto pages 2
through 9 records nine decisions where one was made, which is exactly the failure — *more than one page
advanced without individual sign-off* — listed under "what failure looks like" below.

The popup carries the decision, not the evidence. The frame link, the node ID, the instances placed and
the hardcoded values still go in the chat message above it: a popup is four short options, and a person
approving one without the packet in front of them is approving a question, not a page.

### Step 5 — Record the decision for that page

```bash
node utils/pipeline.mjs gate 3 --page "<name>" --approve            --by "<their name>" --node "<id>"
node utils/pipeline.mjs gate 3 --page "<name>" --changes-requested  --by "<their name>" --note "<what to fix>"
node utils/pipeline.mjs gate 3 --page "<name>" --reject             --by "<their name>" --note "<why>"
```

`--page` is required. A blanket verdict across pages is precisely the thing this gate exists to prevent,
so the command refuses to record one.

**If the designer said yes to the hand-edit question**, add `--manually-edited`. That flag obliges you —
and phase 4 — to **re-inspect the frame live** before continuing, instead of trusting your last-known
state. The phase-4 failure mode is a spec built from a frame that has since changed, and it starts here.

**If they approved a deviation in the moment**, record it in that page's `deviations_approved[]`. An
unrecorded deviation is indistinguishable from an invented component, and phase 4's change-log reads
this field to know the component had a gate behind it.

### Step 6 — Loop

- **approved** → back to `next-page` for the next one.
- **changes_requested** → the **same** page. `next-page` will keep naming it and its `iterations`
  counter increments. Revise, re-present, re-ask.
- **rejected** → it needs a decision above assembly. Stop and raise it; it may loop back to phase 2.

The gate is satisfied only when **every** page is approved. One page pending blocks all of phase 4 —
a handoff spec for a partially-approved module describes unapproved work as shippable. When the last
page is approved, phase 3 is over: go straight to `/developer-handoff`. There is no audit stage after
this gate any more.

## What "failure" looks like here

Straight from the governance doc, and each of these has happened:

- a page presented with an invented or unapproved component
- **more than one page advanced without individual sign-off**
- hardcoded values where a token exists
- a dropped requirement that was never flagged
- reintroducing a retired component out of habit
- a gap that reached assembly — missed by the checklist and by the gate-2 component review — quietly
  worked around instead of pausing

## Artifact

`reports/<feature>/G3_page_signoffs.json` — one entry per page, with `status`, `decided_by`,
`decided_at`, `iterations`, `manually_edited`, `deviations_approved` and full `history`.

**`done` will refuse this stage.** Only `pipeline.mjs gate 3` writes it, and `--by` must be a real
person — the one named in that page's own popup answer. Unlike gates 1 and 2, this gate declares no
`checks`, so there is no `--checked` here — the decision *is* the check, once per page.

Stated plainly: that refusal is a boundary, not a control. Anything that can write files can write these
page decisions directly, and nothing signs the record or logs it append-only. What the design buys is
that approving a page takes a deliberate, conspicuous act that no ordinary instruction leads to. It does
not make approving your own page impossible, and it should not be described as if it did.
