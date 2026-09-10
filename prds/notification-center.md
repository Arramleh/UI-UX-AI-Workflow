# Notification Center — Design Requirements Reference
Source: PRD-notification-center-v5 + Annex · Sand Platform · Compiled 2026-08-26

## 1. Overview

The Notification Center gives every person on the Sand Platform one place to see, search, and act on the things that concern them — system alarms, connectivity loss, maintenance events, and user activity — whether they open a quick panel from the top bar or the full searchable history. Each notification is written once and shown only to the people it's addressed to, filtered live by their own severity and category preferences and by what they're currently allowed to see. It matters because right now several of these promises are only half-kept: a mute setting that may not mute anything, a preference that lives in two different screens, and a subscription feature nobody can reach.

## 2. Objectives

- Centralize all system, alarm, and user-activity notifications in one bell and one history page.
- Ensure each person sees only notifications addressed to them and permitted by their current access.
- Enable people to control what reaches them through a single severity threshold and category mute list.
- Support bulk actions — mark read, mark unread, and acknowledge — with honest reporting when part of a batch fails.
- Maintain a complete, filterable, searchable notification history within the retention window.
- Allow quick navigation from any notification straight to the alarm, work order, or user it concerns.
- Consolidate notification preferences into a single settings surface, replacing today's duplicate screens.
- Support email as an additional, opt-in delivery channel alongside in-app notifications.

## 3. Target Users / Personas

| Persona | Scope of what they see | What's distinct about them |
|---|---|---|
| Owner | Portfolio-wide — every site, every device, every user | Notified of new-user verification and important user activity; can acknowledge any alarm from a notification row |
| Admin | Portfolio-wide — same as Owner | Same visibility and actions as Owner; distinguished from Owner only by role label, not by privilege in this document |
| Engineer | Only sites/devices under their authority | Sees connectivity-loss and alarm notifications scoped to their assigned sites; whether they can Acknowledge is not yet defined (open decision, see §8) |
| Technician | Only sites/devices explicitly assigned to them | Narrowest scope of the four; same undefined Acknowledge permission as Engineer |

All four roles: set their own severity threshold and muted categories; cannot see or edit another person's preferences; never see a notification about a subject they're not permitted to access, regardless of role.

## 4. User Flows

### Common Flows
*(persona-agnostic — every role takes these the same way)*

1. **First Flow** — Click Bell → Panel opens → See flat list of 50 most recent notifications, newest first → Click an unread row → Row marked read, navigate to the alarm/work order/user it's about
2. **Second Flow** — Panel open → Click "Mark all as read" → All items marked read → Unread tag and Mark-all action disappear
3. **Third Flow** — Panel open → Click "View All Notifications" → Navigate to Notification History Page
4. **Fourth Flow** — History Page → Click Filters → Filters side panel opens, list slides over → Set Status / Severity / Date range → Click Apply Filters → List narrows, Filters button shows active-filter count badge
5. **Fifth Flow** — History Page → Tick rows via checkboxes → Choose bulk action (Mark as read / Mark as unread / Acknowledge) → Confirm → Action applied, partial failures reported by exact count
6. **Sixth Flow** — Open Notification Settings → Adjust Minimum Severity or Muted Categories → Save → Preference enforced server-side, reflected in both Bell and History
7. **Seventh Flow** — Panel open, live connection drops → "Reconnecting…" shown → Connection restored → List resumes with no stale count shown

### Special Flows

**Owner / Admin**
- Receive a notification when a new user verifies their email → click it → navigate to that user's record
- Receive notifications for important user activity and portfolio-level abnormalities with no site restriction

**Engineer**
- Receive connectivity-loss and alarm notifications only for sites/devices under their authority → click → navigate to the alarm or work order, scoped to what they may see
- Opening History from an assigned site's own page pre-scopes the list to that site

**Technician**
- Receive notifications only for sites/devices explicitly assigned to them (narrower than Engineer's authority-based scope) → click → navigate to the alarm or work order
- No portfolio-wide visibility under any circumstance

## 5. Pages / Frames

1. Notification Panel (bell dropdown, top bar)
2. Notification History Page — company-wide
3. Notification History Page — Scoped (opened from a company or site page; same page, filtered context)
4. Filters Side Panel
5. Notification Settings Page (single consolidated screen)

Notification Email Template (Phase 3) excluded from this pass — hold until email delivery is scheduled.

## 6. Components per Page/Frame

### 1. Notification Panel
1. Notification Bell component set — states Default / Hover / Default with number — *existing*, Notifications Components page
2. Notification Row (panel variant) — *new*, composite; needs:
   1. Notification Type Tag — built from Notification Types component set (Operational, Business events, Alarm, Connectivity, Maintenance, User activity) — *existing but needs reconciliation*, see §8
   2. Notification Severity Level — *existing*, Notifications Components page, used as-is
   3. Unread dot indicator — *new*, small
3. Mark all as read action + unread count tag — *new*, text + button using Button component set (Borderless type) — *existing*, Buttons page
4. Reconnecting banner — *new*
5. Empty state ("nothing yet" message, non-error tone) — *new*
6. Error state (list failed to load + retry) — reuse Toast / Processing Message (Type=error) — *existing*, Notifications Components page

### 2. Notification History Page (+ Scoped variant)
1. Search Field — *existing*, Form Elements page
2. Table Header Row / Table Header — *existing*, Tables page
3. Table Row component set — *existing*, Tables page; each row assembles:
   1. Checkbox (row select) — *existing*, Form Elements / Table Cell "Header-Checkbox" variant, Tables page
   2. Notification History Row content (title, date/time, message, actor, site/kind/severity labels, unread dot) — *new*, composite reusing Notification Type Tag + Notification Severity Level from above
4. Status Badge — *existing*, Tables page (candidate for read/unread or delivery-state indicators — confirm fit)
5. Pagination — *existing*, Tables page
6. Tabs Items / Horizontal Tab Component — *existing*, Tables page (only needed if company/site scoping is tab-based rather than page navigation — confirm)
7. Bulk Action Bar (Mark as read / Mark as unread / Acknowledge, appears on selection) — *new*, composite using Button component set — *existing*, Buttons page
8. Acknowledge confirmation dialog (states count acknowledged vs. left alone, names the alarm) — *new*
9. Bulk partial-failure message ("3 of 8 could not be updated…") — reuse Toast / Processing Message (Type=warning or error) — *existing*
10. Empty states — "No notifications yet" and "No notifications match your search" (two distinct messages) — *new*
11. Scope header (breadcrumb/label showing "Company: X" or "Site: Y" context) — *new*, Scoped variant only

### 3. Filters Side Panel
1. Dropdown (Status, Severity single-select) — *existing*, Form Elements page
2. Multi-Select Dropdown or Tags Input (if multi-value filters needed) — *existing*, Form Elements page
3. Date Picker Field + Calendar / Calendar Day (date range From/To) — *existing*, Form Elements page
4. Button — Apply Filters, Reset All — *existing*, Buttons page
5. Filter count badge (on the Filters trigger button) — *new*, small numeric badge

### 4. Notification Settings Page
1. Dropdown (Minimum Severity, single control) — *existing*, Form Elements page
2. Multi-Select Dropdown (Muted Categories — picker only, no free text) — *existing*, Form Elements page — validation behavior (no free text) is new logic, not a new component
3. Switch (Email enabled, opt-in) — *existing*, Form Elements page
4. Button (Save) — *existing*, Buttons page
5. Per-site subscription control — *new*, and possibly not built at all (open decision, see §8)
6. Save error state ("change was not saved, previous value restored") — reuse Toast / Processing Message (Type=error) — *existing*

**Shared / reused across multiple frames:** Notification Severity Level, Notification Type Tag (from Notification Types), Toast / Processing Message, Button, Dropdown / Multi-Select Dropdown, Table Row / Table Cell / Table Header, Checkbox, Pagination.

**Design-system check performed:** Notifications Components, Form Elements, Buttons, and Tables pages were inspected directly via the file's own page/component tree (not the published-library search) in the Design System file (fileKey `LBwmLXZOagmXrvyvBL1cng`). KPIs & Widgetets and Colors pages were scanned at the top level only, since nothing in this PRD needs charts or a dedicated color picker beyond existing severity tokens.

## 7. Assembly

**Notification Panel:** The Notification Bell sits in the top bar; clicking it opens a dropdown/drawer containing a stack of Notification Rows (each built from a Type Tag + Severity Level + title/timestamp text + unread dot), capped at 50, with the Mark-all action and unread tag pinned above the list and "View All Notifications" pinned below. Reconnecting banner and empty/error states swap in for the row stack depending on connection and load state.

**Notification History Page:** A Search Field and Filters button sit above a Table built from Table Header Row + repeated Table Row instances (each row = Checkbox + Notification History Row content). Selecting rows reveals the Bulk Action Bar above the table. Pagination sits at the foot alongside the "50+ Records" / exact count text. The Scoped variant adds the Scope header above the Search Field; everything else is identical.

**Filters Side Panel:** Slides in from the right of the History Page (list narrows, isn't covered), stacking Dropdowns for Status and Severity, a Date Picker pair for the range, and Apply/Reset buttons at the foot. The Filters trigger button on the History Page carries the count badge when any filter is active.

**Notification Settings Page:** A single vertical stack — Minimum Severity dropdown, Muted Categories multi-select, Email toggle (once Phase 3 ships), Save button — replacing today's two separate screens. Per-site subscription, if built, would be an additional row in this same stack.

## 8. Open Decisions

### Resolved
- [x] Notification Email Template — excluded from this pass; deferred until Phase 3 (email delivery) is scheduled.
- [x] Notification Severity Level component — use as-is (existing variants, including Online/Pending/Error 1/Error 2, accepted without modification).

### Still open
- [ ] Severity control wording — "Info / Warning / Error / Critical" vs. "Show all / Warning and above / Critical only." Both exist today; needs one winner before the Settings page is finalized.
- [ ] Notification Types component reuse — its variants (Operational, Business events, Alarm, Connectivity, Maintenance, User activity) mix what the PRD calls "Kind" (Alarm, Maintenance, Connectivity, User verified) and "Category" (Operational, Connectivity — not meant to be displayed per the Annex). Needs reconciling into two distinct tag concepts before use in the Notification Row.
- [ ] Engineer/Technician Acknowledge permission — the PRD's own persona table marks this [NEEDS INPUT]. Determines whether the Bulk Action Bar's Acknowledge action appears for these two roles.
- [ ] Per-site subscription — build a control now, or park it with a written reason (PRD leaves this open; SHOULD/P1, not MUST).
- [ ] History-shrink notice — when a person's permissions change and rows disappear from their history, do they see a message explaining why, or just a shorter list?
- [ ] Read-side caps as visible facts — should "99+", the fifty-item panel cap, and "50+ Records" be shown as deliberate, or is there a design treatment needed so they don't read as bugs?
- [ ] Detail panel — designed but unbuilt, and out of scope for the current phases (Phase 4+). Flagging so it isn't accidentally included in this pass.
- [ ] Accessibility and device requirements — never specified in the PRD. Needed before responsive/a11y decisions can be made on any of the five frames.
