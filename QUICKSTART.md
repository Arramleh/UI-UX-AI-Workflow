# Quick Start Guide

Get up and running with the PRD-to-UI Workflow in 5 minutes.

> ⚠️ **The workflow is not unattended.** It is four AI phases with three human validation gates, and
> it **halts and waits for you** at each one — at gate 1, at gate 2, and after every single assembled
> page. Parking at a gate is a correct outcome, not a stall. Budget review time, not just runtime.
>
> ⚠️ **Gate 2 does not stop the component writes.** The component pass creates the components in your
> Figma file before anyone approves anything about them; gate 2 is where you inspect them as live
> nodes, and it blocks **page assembly** until you do. `--changes-requested` sends the component pass
> back to fix writes that have already landed.

## Step 1: Setup (1 min)

```bash
cd /home/elsheikh/Desktop/prd-to-ui-workflow

# Copy environment file
cp .env.example .env

# Edit .env and add:
# 1. FIGMA_API_TOKEN - Get from https://www.figma.com/developers
# 2. DESIGN_SYSTEM_URL - Your design system Figma file or docs URL
```

## Step 2: Gather Inputs (1 min)

You'll need:

1. **Figma File URL**
   - Example: `https://www.figma.com/file/xxxxx/product-name`

2. **PRD Document**
   - File: `/path/to/prd.pdf` (or `.docx`, `.md`, `.txt`)
   - Or: Paste the PRD text directly

3. **Design System Reference**
   - Figma design system file URL
   - Or: Link to design system documentation
   - Or: Local path to design system spec

## Step 3: Run the Workflow (1 min)

Ask Claude to execute the workflow:

```
Read .claude/skills/run-prd-workflow/SKILL.md and help me execute this workflow with:
- Figma URL: https://www.figma.com/file/...
- PRD source: path/to/prd.pdf
- Design system URL: https://design-system-url
```

Claude will guide you through the workflow execution and provide the results — and stop to ask you at
each gate.

## Step 4: Workflow Runs — and Stops at Three Gates

The workflow executes four phases, with a human gate closing each of the first three:

**Phase 0 — Inspect.** Loads the design system (shared, cached) and reads the live Figma file.

**Phase 1 — Extract.** Atomizes the PRD one need per line, quarantines the PRD's own component/page
claims for verification, and **raises** every ambiguity as a decision packet. Writes
`design_requirements.md` (personas, flows, frames, components).

> **══ GATE 1 (you) ══** Is the requirement list complete, correctly atomized, and free of unresolved
> ambiguity? Nothing in phase 2 runs until this passes.

**Phase 2 — Map, then build the components.** Plans and validates screens, maps every requirement onto
the design system with one of four statuses and its evidence, scores coverage (e.g., 78.5%), generates
the coverage PDF, and specs the missing components **and the screens they assemble into** — the
**build checklist**. Then the component pass executes the component half of that checklist and writes
it into Figma. No gate stands before that write.

> **══ GATE 2 (you) ══** Inspect the components as they now exist in live Figma — names, variants,
> token bindings, library location. Nothing may be assembled out of them until you approve. Sending
> them back means correcting writes that are already in the file.

**Phase 3 — Assemble.** Builds the screens **one page at a time**.

> **══ GATE 3 (you) ══** One approve / request-changes / reject **per page**. Phase 3 never advances
> past an unapproved page.

Phase 3 **ends** there. When the last page is approved the run goes straight to phase 4. There used to
be a `/prd-auditor` stage that re-read the built Figma file at full depth against the PRD and looped
back through gate 2 while gaps remained; it is gone. So gate 3 is the **only** comparison between the
PRD and what was actually built — one page at a time, by you, not a machine read of the whole module.
Nothing re-reads the file afterwards, and a requirement dropped back in phase 2 has no stage left that
can catch it.

**Phase 4 — Hand off.** `/developer-handoff` writes the per-page specs and assembly change-log;
`/closure-reporter` writes the closure PDF.

Check where you are at any point:

```bash
node utils/pipeline.mjs status      # done / stale / blocked, by phase, and what it's waiting on
```

## Step 5: Answer the Gates

Claude prepares the packet, asks, and records **your** answer — it never decides for you. The packet
goes in the chat; the decision arrives as a **popup question** (`AskUserQuestion`), not as prose you
reply to. A gate answered in free text is a gate answered by whoever paraphrases your reply into a
command, and that is Claude.

Each popup carries the verdict; that gate's declared checks as a multi-select with nothing
pre-selected (gates 1 and 2 — gate 3 declares none); one question per open decision at gate 1; and
**who is approving**. That last one is asked at every gate and re-asked for **every page** at gate 3 —
never carried over, never inferred from the git author or the session, never filled in by Claude. What
you type there is what lands in `--by`. Missing inputs (`NOT SET`) are asked the same way.

```bash
node utils/pipeline.mjs gate 1                    # where does gate 1 stand?
node utils/pipeline.mjs gate 1 --approve --by "Dana R." --checked all --note "looks right"
node utils/pipeline.mjs gate 2 --approve --by "Dana R." --checked all
node utils/pipeline.mjs gate 2 --changes-requested --by "Dana R." --note "Notification Row is missing the read variant"

# gate 3 is per page
node utils/pipeline.mjs gate 3 --init                    # seed the roster from the checklist
node utils/pipeline.mjs next-page                        # the ONE page to work on
node utils/pipeline.mjs gate 3 --page "Inbox" --approve --by "Dana R."
node utils/pipeline.mjs pages                            # the per-page ledger
```

Three things to know:

- `--by` is required, and `claude`, `ai`, `auto`, `self` and friends are refused. A gate signed by the
  thing being gated is not a gate.
- `node utils/pipeline.mjs done <gate>` **refuses** — only `gate` records a decision.
- **Open decisions are raised, not taken.** Every ambiguity comes to you as a packet: the options, a
  recommendation, and the consequence of each. Gate 1 will not open while any of them is unanswered,
  even after `--approve`. (This reverses how the workflow used to behave — auto-deciding was right for
  an unattended run and wrong once a gate exists, because a default taken in phase 1 is a decision
  made before the person accountable for it ever saw the question.) A product-level ambiguity raised
  later, by `/component-analyzer`, has no gate holding it: it is carried forward and reported by
  `/closure-reporter` as a decision nobody answered.

## Step 6: Review Results (instant)

You get:

```
📝 Design Requirements: design_requirements.md
   ├─ Personas and role differences
   ├─ Common / Special user flows
   ├─ Pages / Frames and their components (existing vs. new)
   └─ §8 Open Decisions, each RAISED with options + a recommendation, for gate 1

📊 Coverage Report: coverage_report_2024-08-31.pdf
   ├─ Overall Score: 78.5%
   ├─ Missing Components: 5
   ├─ Needed Extensions: 3
   └─ Implementation Roadmap: [phases]

✍️ Gate Signoffs: G1_requirements_signoff.json · G2_component_signoff.json · G3_page_signoffs.json
   ├─ Verdict, who decided, and when
   ├─ Every decision with the answer a person gave (beside the recommendation)
   └─ history: a gate that bounced twice before passing says so

✅ Components Created in Figma (from the build checklist, then approved at gate 2):
   ├─ DatePicker (new)
   ├─ FileUpload (new)
   └─ Button (extended with 2 new variants)

🖼 Screens Built in Figma:
   └─ Assembled from instances of those components — one page at a time,
      each approved at gate 3 before the next was touched

📦 Developer Handoff: handoff_2024-08-31.md + 15_developer_handoff.json
   ├─ Per approved page: layout, tokens, props/variants, states, breakpoints, edge cases
   ├─ Change-log of every component created or modified during assembly
   └─ Cross-linked to the LIVE Figma frames, every name re-verified

📄 Closure Report: closure_report_2024-08-31.pdf
   ├─ What was created
   ├─ What is still uncovered, and why
   └─ Decisions, the answer given at each gate, and what reversing each would cost

📋 Screen Plans: 03_screen_plans.json
📌 Roadmap: 10_roadmap.json
```

---

## What Each Output Means

### Coverage Score (e.g., 78.5%)
- **90%+**: Excellent - Design system fully covers requirements
- **70-90%**: Good - Minor gaps, easily filled
- **50-70%**: Fair - Significant work needed
- **<50%**: Low - Major redesign required

### Missing Components
Components your design system doesn't have but PRD requires.

Example:
```
DatePicker
├─ Used in: [Form, Filter screens]
├─ Priority: High
└─ Variants needed: [single-date, date-range, disabled]
```

### Needed Extensions
Existing components that need new states or variants.

Example:
```
Button
├─ Needs: [ghost variant, loading state, icon variant]
├─ Used in: [7 screens]
└─ Priority: Critical
```

### Implementation Roadmap
Phased approach to closing the gap:

```
Phase 1 (2-3 weeks): Critical Components
├─ DatePicker
├─ FileUpload
└─ CustomSelect

Phase 2 (1-2 weeks): Extensions
├─ Button: Add ghost variant
├─ Input: Add error state
└─ Form: Add validation states

Phase 3 (1 week): Polish
├─ Enhanced animations
└─ Accessibility improvements
```

---

## Common Commands

### Run Complete Workflow
```
/run-prd-workflow
# (halts at each gate and waits for you)
```

### Take a Gate
```
/gate-1-requirements   # after phase 1 — validate the requirements
/gate-2-components     # after the component pass — validate the LIVE components
/gate-3-pages          # during phase 3 — one decision PER PAGE
```

### Analyze Just the PRD
```
/prd-analyzer "path/to/prd.pdf"
```

### Check Figma Design
```
/figma-extractor "https://www.figma.com/file/..."
```

### Extract Design Requirements
```
/prd-design-requirements
# (writes design_requirements.md — personas, flows, frames, components)
```

### Plan Screens from Requirements
```
/screen-planner
# (uses PRD from previous analysis)
```

### Score Coverage
```
/coverage-scorer
# (uses all previous analyses)
```

### Generate Report
```
/coverage-reporter
# (uses all analyses)
```

### Create Components and Screens in Figma
```
/figma-modifier
# (specs the missing components and the screens — the BUILD CHECKLIST; writes nothing to Figma)

/figma-component-pass
# (WRITES the components into Figma, then stops — no gate stands before this)

/gate-2-components
# (a human inspects the live nodes — no page is assembled without this)

/figma:figma-use
# (assembles the screens, ONE page at a time)
```

### Hand Off
```
/developer-handoff
# (per-page specs, tokens, props, states, edge cases + assembly change-log)

/closure-reporter
# (final PDF: what was added, what is missing, what a person decided at each gate)
```

### Standalone Skills

Not run by `/run-prd-workflow` — invoke them directly:

```
/evaluate-design-system
# (grades the design system library itself)

/requirements-to-prototype
# (turns design_requirements.md into one interactive .dc.html prototype)
```

---

## Troubleshooting

### "Invalid Figma URL"
✓ Use full URL: `https://www.figma.com/file/FILE_ID/name`
✓ Not: `figma.com/file...` or `www.figma.com/...`

### "FIGMA_API_TOKEN not found"
✓ Edit `.env` file
✓ Add token from: https://www.figma.com/developers
✓ Personal access token, not project token

### "Design system not found"
✓ Verify URL is correct
✓ Check it's publicly accessible
✓ Or use Figma file URL if it's in your workspace

### "Coverage score too low"
✓ Check PRD is complete (all requirements detailed)
✓ Review design system (might be missing components)
✓ PDF will show exact gaps to address

### "No output generated"
✓ Check all inputs are valid
✓ Verify API tokens work
✓ Review error messages in workflow output

### "No screens were assembled in Figma"
✓ Run `node utils/pipeline.mjs gate 2` — if it says `AWAITING`, the run is parked correctly
✓ No page can be assembled until that gate's verdict is `approved`. The components are already in the
  file — they are what the gate is asking you to look at

### "The gate won't open even though I approved it"
✓ A raised decision still has an empty `answer` — the gate names them; answer and re-record
✓ Or the approval went stale because an artifact it signed off was regenerated: re-take the gate
✓ `--force` does not re-open a gate, by design

### "`done` refused my gate"
✓ Correct: only `node utils/pipeline.mjs gate <n> --approve --by "<person>"` records a gate
✓ `--by` must be a person — `claude`, `ai`, `auto`, `self` and friends are refused

### "next-page won't give me the next page"
✓ An earlier page is still undecided — record its gate-3 decision first
✓ `node utils/pipeline.mjs pages` shows the ledger and what it's waiting on

---

## Next Steps

### 1. Review the Coverage PDF
- Understand what's covered and what's not
- Check priority of missing components
- Review implementation roadmap

### 2. Approve — or Don't — at Gate 2
- Open Figma and look at the components themselves; the question is about nodes, not about JSON
- Confirm the checks you actually confirmed: `--approve` alone leaves the gate shut
- `--changes-requested` sends the component pass back to correct writes already in the file; the
  previous verdict stays in `history`

### 3. Review Each Page at Gate 3
- One decision per page, and phase 3 never advances past an unapproved one
- This is the **last** look anyone takes at the built file against the PRD — nothing after it re-reads
  the module, so a page approved on sight is a page nobody checked against its requirement
- Hand-edited a frame yourself? Record it with `--manually-edited` so the handoff re-inspects it live

### 4. Hand Off to Engineering
- Give them `handoff_[date].md` — it links to the live frames rather than pasted copies
- Check the change-log covers every component assembly created

### 5. Iterate as Needed
- Update PRD if requirements change (this re-opens gate 1 — the old approval goes stale)
- Re-run workflow to see new coverage
- Continuously improve design system

---

## Pro Tips

💡 **First time?** Start with a simple PRD (5-10 requirements) to see how it works

💡 **Large project?** Break into phases - analyze critical features first

💡 **Iterating?** Keep running the workflow as you add components

💡 **Team alignment?** Share the PDF report with stakeholders

💡 **Only want the analysis?** Stop after `/coverage-reporter` and `/figma-modifier` and read the
coverage PDF — that is the last point at which your Figma file is untouched. Letting the run reach
`/figma-component-pass` writes the components whether or not you later approve gate 2

💡 **Gate packets need the right person.** Whoever is accountable for the decision signs it; `--by` is
recorded in the closure report

---

## Support

For detailed info, see:
- 📖 [`README.md`](README.md) - Full documentation
- ⚙️ [`CLAUDE.md`](CLAUDE.md) - Configuration guide
- 🔧 [`.env.example`](.env.example) - Configuration template

Questions? Review the skill documentation in `.claude/skills/`

---

**Gate 2 reviews components, not a plan.** A component that read correctly on the checklist can still
be misnamed, missing a variant, unbound from its tokens, or in the wrong library location once it
exists as a real node. None of that shows up in a plan, all of it is cheap to fix before anything is
built on top of it, and once a page is assembled the defect sits behind a screen that looks finished.
So `/figma-component-pass` builds the components and stops, **`/gate-2-components`** inspects the
actual nodes, and only then does page assembly begin.

```bash
node utils/pipeline.mjs gate 2 --approve --by "<person>" --checked all
```

Its five checks are `all_approved_components_present`, `live_nodes_and_variants_verified`,
`tokens_and_variables_bound`, `naming_location_and_retirement_verified` and
`no_unapproved_component_changes`, and it writes `G2_component_signoff.json`.

The price of reviewing real nodes rather than a plan is that the nodes exist before you are asked: the
component writes are not gated, only their use is.
