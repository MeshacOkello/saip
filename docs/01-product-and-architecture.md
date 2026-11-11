# SAIP Board Platform — Product Definition & Architecture

**Status:** M1 (Foundation), M2 (Coordination), M3 (Money) and M4 (Full communication) implemented; M5 (Continuity) not started. Web push is the one piece of M4 still outstanding — unread state and in-app badges are in, browser push notifications are not. Last updated 2026-11-10.
Setup and the shape of the code are in [`../README.md`](../README.md).
**Owner:** Meshack Okello (SAIP President, 2026/27)

This document records what we are building and why. Nothing here is final; it is the
current best version of the design, and it should be edited rather than appended to.

---

## 1. What the product is

> A shared workspace for the SAIP executive board: the place where events are planned,
> work is assigned, money is tracked against the University's official systems, and the
> board talks to itself — built so that none of it is lost when the entire board is
> replaced every twelve months.

Two properties follow, and every decision below is downstream of them.

1. **Turnover is the central problem.** The board replaces itself annually. The
   platform's job is to make year N+1 faster than year N. A feature that only helps this
   week is secondary to one that helps the next board.
2. **Communication is the spine, not a module.** Work starts as a conversation. What this
   platform offers over WhatsApp is that a conversation can become a task, a budget line,
   or a decision of record without leaving the thread.

### 1.1 Scope decision: SAIP only

**Decided 2026-11-10: this is a single-organization application.** No multi-tenancy, no
organization switching, no `organization_id`, no tenant-isolation infrastructure. The
database holds one board's data and the application assumes it.

Recorded so the trade-off is not re-litigated later: if SAIP ever wants to hand this to
other clubs, the migration cost is adding an organization key to the tenant tables and a
scoping layer above the queries — real work, but mechanical. The expensive part would be
anything in the *interface* that assumes a single board. Keeping positions, permission
bundles, event templates, and funding sources as editable **data rather than constants**
is therefore worth doing anyway — not for portability, but because SAIP's own positions
change every year, which is a stated requirement.

### 1.2 Non-goals

- Not a general membership portal, student directory, or social network.
- Not a replacement for Prime, Concur, or MyPrincetonU. See §7.
- Not a document management system. Google Drive remains the filesystem.
- No payment processing, card storage, or bank connections. Ever.
- No public signup. Access is by invitation only.

---

## 2. Identity and access

### 2.1 Identity

- Sign in with Google, restricted to `princeton.edu` for board members.
- **A princeton.edu address grants nothing.** Access requires an invitation issued to
  that address by the President (or another holder of `members.manage`).
- A `person` record may have more than one linked sign-in identity. This matters because
  Princeton accounts are deactivated after graduation, and the long-term maintainer's
  account must not depend on a princeton.edu login.

### 2.2 Access is a set of dated grants

This is the mechanism that makes progressive handover work, and it replaces having
several parallel notions of access.

- A **membership** links a person to the board with a descriptive status:
  `invited`, `incoming`, `active`, `outgoing`, `alum`, `revoked`.
- Actual access is a set of **capability grants** on that membership. Each grant names a
  capability and may carry `effective_from` and `expires_at`.

Everything else falls out of that one idea:

- **Incoming officers get access progressively.** The President grants the incoming
  Treasurer `finance.view_history` and `reimbursements.view` effective immediately, and
  `finance.edit` effective on the term start date. Each incoming officer gets grants
  relevant to their position, nothing more.
- **Outgoing officers lose access automatically** when their grants expire on the term
  end date, leaving only `archive.view`. A scheduled job flips the membership status to
  `alum`; nobody has to remember.
- **Temporary delegation is the same mechanism** — covering for someone during exams is a
  grant with an end date.

**Handover presets:** each position carries a "handover grant set" describing what an
incoming holder of that position should receive during the overlap, so the President
applies it in one action and then adjusts. Presets are editable data.

Read-only finance access is a distinct capability (`finance.view_history`) from live
finance access (`finance.view`, `finance.edit`, `finance.approve`), specifically so the
incoming Treasurer can study history and outstanding reimbursements without touching the
current year.

---

## 3. The board model

Four separate things, as required:

- **person** — a human; persists forever, independent of any role.
- **position** — e.g. "Events Chair": name, description, responsibilities, designations,
  default permission bundle, handover preset, active/retired. Editable and retirable,
  never deleted.
- **appointment** — person × position × board year, with start and end dates and a reason
  for ending (term ended, resigned, removed, replaced). A vacancy is a position with no
  current appointment — a queryable state, not a special record.
- **membership** — the person's access to the application (§2.2).

Access derives from membership, not from appointment. Someone can have access with no
position (an advisor) and a position with no access (the 2019 president, in the record).
Keeping these apart is what lets history survive.

### 3.1 Board years

A `board_year` (e.g. "2026/27") has start and end dates. Every event, task, meeting,
budget, decision, and object-thread is stamped with it. **The archive is therefore a
filter, not a second store** — the only way to guarantee it never drifts from live data.
Nothing is hard-deleted; deletion is a flag with an author and a timestamp.

### 3.2 Transition as a designed workflow

1. Create the next board year.
2. Record incoming appointments; apply each position's handover preset.
3. Generate a **handover packet per position**: open tasks, unfinished events,
   outstanding money, key contacts, the position's notes, last year's calendar. For the
   Treasurer this mirrors what ODUS already expects — outstanding financial items flagged
   for the successor (§7.1).
4. Bulk-reassign open tasks from outgoing to incoming holders.
5. Transfer administration (§4.3).
6. On the term end date, grants expire and outgoing members become `alum`.

---

## 4. Permissions and administration

### 4.1 Capabilities, bundles, positions

- A **capability** is a named permission, coarse and few — target ~20 total. Working set:
  `board.manage`, `members.manage`, `positions.manage`, `events.manage`,
  `events.create`, `tasks.assign_any`, `meetings.manage`, `finance.view`,
  `finance.view_history`, `finance.edit`, `finance.approve`, `reimbursements.view`,
  `contacts.manage`, `channels.manage`, `documents.manage`, `archive.view`, `audit.view`.
  Resisting a longer list is a design goal; sixty toggles are unusable and unauditable.
- A **bundle** is a named set of capabilities (Admin, Finance, Officer, Alum), stored as
  editable data.
- A **position** names a **default bundle**. Appointing someone *seeds* their grants from
  it; the President can then add or remove individual capabilities.

The position never grants permission at request time — it supplies a sensible default at
appointment time. That preserves the required separation between organizational title and
application permission while making onboarding one action instead of twenty.

### 4.2 Enforcement

Authorization resolves on the server for every request: authenticated person → membership
→ effective grants (dates applied) → the handler's declared requirement. **The frontend
hides features only for tidiness; hiding is never the control**, since any client can
call the API directly.

A single authorization module owns this decision — not scattered `if` statements. Access
to conversations is checked at the data-access layer, so no code path can return a
message body to a non-participant.

Every permission change, membership change, removal, approval, and administrative action
is written to an append-only **audit log**. Cheap now, impossible to backfill.

### 4.3 Administration, and never losing it

The President (by default) holds `board.manage` and `members.manage`, and the admin
console can: invite by email, appoint and remove officers, create/rename/retire
positions, edit bundles, adjust an individual's grants and their dates, apply handover
presets, and review full board and permission history.

Safeguards, all requirements:

1. **At least two active memberships hold `board.manage` at all times.** The system
   refuses the removal or demotion that would break the invariant, and explains why.
2. **Administration transfer is a two-sided action**: the outgoing admin nominates, the
   incoming admin accepts; both sides logged. Not a silent field edit.
3. **The system warns when an admin's term end approaches and administration has not been
   transferred** — because a princeton.edu account stops working after graduation.
4. **Operator break-glass recovery** exists for the case where the board loses every
   admin anyway. It is logged and disclosed in the audit log.

### 4.4 Maintainer and board administration are separate roles

- **Board administration** (President): people, positions, permissions, content.
- **Platform maintenance** (initially the author, with support for a second trusted
  operator): deployments, migrations, backups, error monitoring, break-glass recovery.

The operator role has **no interface for reading board content** — no DM viewer, no
finance screens, no impersonation. Operator actions are audited.

**An honest limit, stated so nobody is misled:** whoever controls the deployment and the
database can, in principle, read anything stored in it. That is true of every
self-hosted web application. The separation here is organizational and audited, not
cryptographic, and we are not going to pretend otherwise by promising end-to-end
encryption we cannot deliver while also supporting search and notifications. The
protections that are real: no UI path to private content, audited access, backups
encrypted at rest, and a written norm that the maintainer does not read board content.

---

## 5. Communication system

A complete communication system is a firm product requirement: direct messages, group
conversations, channels, event- and task-specific discussion, attachments,
notifications, history, search, and read/unread state, working well on mobile and
desktop. It is delivered incrementally (§9) but none of it is optional.

### 5.1 One primitive, four containers

- **conversation** — a type plus an optional subject object:
  - `direct` (two people)
  - `group` (ad-hoc set of people)
  - `channel` (board-wide or topic; persistent; managed by `channels.manage`)
  - `thread` (attached to an event, task, meeting, funding request, or expense)
- **participant** — per-conversation membership with `last_read_at` for unread state.
- **message** — author, body, attachments, mentions, reply-to, edit and deletion markers.

Building this as one primitive is the key decision: once threads work, DMs and channels
are a container type plus a permission check, not a second system. Separate chat and
comment features would duplicate notification, search, attachment, and read-state logic.

### 5.2 Integration is the differentiator

The required loop is *discuss → assign → follow*:

- Any message can become a **task**, keeping a link back to the message that produced it.
- Any message can be **promoted to a record**: pinned to an event's notes, recorded as a
  meeting decision, or attached to a funding request. Promotion is the explicit,
  low-effort act that separates temporary conversation from organizational record — and
  only promoted content is surfaced to future boards by default.
- Mentions notify. Attachments on an event thread appear among the event's files.
- Every object shows its conversation inline. You never leave the thing you are looking
  at in order to discuss it.

### 5.3 Privacy and retention

- **Direct messages and private group conversations are genuinely private to their
  participants.** Administrative privileges do not grant access: there is no
  administrative path to read them, they are excluded from administrative search and
  from exports, and they are **not part of the organizational archive**. Incoming boards
  do not inherit them. Subject to the honest limit in §4.4.
- Channels and object threads are organizational records: permanent, searchable across
  board years, and visible to anyone with access to the underlying object.
- The distinction is shown in the interface, not buried in a policy document. A member
  must be able to tell at a glance whether they are writing a record or a message.
- Deletion is soft and never silently rewrites history.

### 5.4 Scope discipline inside messaging

In: text, attachments, mentions, replies, read/unread, per-conversation notification
preferences, search across what the viewer may see, mobile and desktop parity, push.

Out for now: typing indicators, presence, voice notes, message scheduling, per-person
read receipts, threads inside threads. Chat-app polish, each with a real cost.

### 5.5 WhatsApp

Not integrated, not fought. Events and tasks expose share links that paste cleanly into
WhatsApp, so the group chat remains the on-the-go layer while this platform holds the
record.

---

## 6. Events, tasks, meetings, and the rest

- **Events** — the central object: details, venue, type, team and event roles, checklist
  from a template, budget, documents, thread, status, MyPrincetonU registration state,
  turnout, and a structured retrospective. **Create-from-previous** is a headline
  feature, not a convenience: the 2024/25 records show the same Field Day budget
  re-derived three times.
- **Tasks** — owner, due date, status, optional parent event, thread. No priorities, no
  blocking relationships, no subtask trees; volunteers will not maintain them.
- **Meetings** — agenda, minutes, attendance, decisions, and action items that become
  real tasks. This replaces the single append-only Google Doc the board keeps today, so
  it is where adoption is won or lost, and it ships early (§9).
- **Contacts** — partner organizations, campus offices, vendors, speakers; outreach
  status and notes; attachable to events. Minimal, not a CRM. This is the knowledge that
  evaporates hardest at handover.
- **Documents** — labelled links, mostly to Drive, attachable to events and meetings.
- **Dashboard** — assembled from the above; owns no data of its own.
- **Archive** — a board-year filter over immutable records, plus generated handover
  packets.

---

## 7. Finance, alongside Princeton's systems

### 7.1 Verified policy facts

Read from the official pages on 2026-11-10; quotes are short and attributed.

- **Prime** is "the financial system of record for the entire University including
  student groups"; **Concur** is the reimbursement system. Groups are "required to
  maintain their own financial records within the Prime system."
  (ODUS Treasurer Resources; studentorg Financial Policies)
- **MyPrincetonU:** "All student organization activity must be registered." An expense
  report "must have a corresponding event in MyPrincetonU," and the event date must match
  the report. (ODUS Financial Transactions)
- **Approval chain** for an out-of-pocket reimbursement: member submits in Concur →
  **treasurer** approves → **ODUS staff approver** → **Finance and Treasury** → paid.
  Expenses incurred by the treasurer are approved by the **president**. Concur
  transactions do not appear in Prime until every approval is complete.
- **The stated deadline is contradictory across official pages** — three numbers:
  - studentorg Financial Policies: "within 30 business days"
  - ODUS Financial Transactions: "within one week of purchase"
  - ODUS Financial Transactions, Concur section: "within 5 days of the purchase date"
  To be confirmed with ODUS. The app treats it as a configurable policy setting,
  defaults to the strictest reading, and shows the citation rather than pretending the
  question is settled.
- **Receipts** must show vendor name, date, total, payment method, and an itemized list.
- **Prohibited:** alcohol; gift cards and cash equivalents (IRS); Venmo, PayPal, Zelle,
  CashApp; and **services** — "Under no circumstances should a student pay an individual
  for services rendered and expect reimbursement." Paying a DJ or photographer personally
  is named as a request that will be denied.
- **Students may not hire other Princeton students** for services (DJing, posters,
  websites) without written permission from the home department. Retroactive invoices
  "will not be paid."
- **Student organizations may not sign contracts.** Vendors and individuals are paid
  through Prime, with payee setup *before* the event; afterwards an invoice or Limited
  Engagement Agreement is required.
- **No outside bank accounts and no holding cash;** digital payment networks count as
  outside bank accounts. Cash and checks are deposited at the Financial Service Center.
- **A positive spendable balance is required,** and the treasurer must confirm spendable
  funds are available *before* purchases, including out-of-pocket ones.
- **There is an ODUS credit card** for online and phone purchases, explicitly so that
  "there should be no financial burden associated with being a member."
- **Fiscal year is July 1 – June 30**, which does not align with the board year.
- **Chartstring** = department number (15XXX) + fund code (Q0001 / BXXXX / EXXXX) +
  account code.
- **Prime holds roughly four years of history** — a reason for this platform to retain
  financial records longer than the University's reporting window.
- **Named funding sources:** Projects Board, Alcohol Initiative, ODUS Conference Fund,
  academic and administrative departments, SAFE awards, donations, dues and ticket income.
- **Treasurer transition** is already an ODUS expectation: outgoing and incoming
  treasurers meet, outstanding items are flagged, the incoming treasurer is listed in
  OSOPS and requests Prime access.
- Monthly treasurer duty: review the **Spendable Balance Report** and the
  **Ledger Detail Report**.

### 7.2 Division of responsibility

**The platform plans, documents, and chases. Princeton's systems move the money.** It
never asserts that a payment happened; it records what we believe about where each
request stands, who must act next, and links out to the authoritative system.

### 7.3 Model

- **funding_source** — Projects Board, Alcohol Initiative, Conference Fund, a department,
  SAFE, a co-sponsor, or own funds; with notes and application deadlines.
- **funding_request** — amount requested, source, filer, external reference, status,
  amount awarded.
- **annual_budget** per board year — planned income and spend by category: the
  board-wide view, distinct from any single event.
- **event_budget** — planned lines on an event, which become expenses.
- **expense** — planned vs actual, vendor, category, payment route (ODUS credit card /
  University department charge / Prime vendor payment / member out-of-pocket), itemized
  receipt file, event link, chartstring.
- **reimbursement** — claimant, expense(s), Concur reference, and status tracking the
  real chain: `not_filed → filed → treasurer_approved → odus_approved →
  finance_approved → paid`, plus `rejected`. A derived `days_since_purchase` drives
  nudges.
- **balance_snapshot** — amount, `as_of` date, and **provenance: `prime` or
  `internal_estimate`**. Never summed together. The interface shows the Prime figure with
  its date beside the running estimate, and the difference between them.

### 7.4 Policy guardrails as features

The most valuable finance work this platform can do is prevent the mistakes the policies
describe:

- Flag any planned expense categorised as a **service** (DJ, photographer, performer) as
  "cannot be out-of-pocket — requires vendor setup in Prime before the event," with the
  payee-setup checklist attached. The 2024/25 notes show the board repeatedly planning to
  book and pay DJs, so this guardrail prevents a real loss.
- Warn on **alcohol** and **gift card** lines outright.
- Warn loudly when an event budget is marked committed while its **MyPrincetonU
  registration** is unconfirmed. A warning, not a block — we are not authoritative.
- Surface the **sales-tax exemption form** on planned purchases, and flag paid sales tax.
- Suggest the **ODUS credit card** as the default route instead of out-of-pocket.
- Check planned spend against the last known **Prime spendable balance** before purchase.
- Nudge out-of-pocket claimants on the policy schedule, and give the treasurer one queue
  of everyone who has not filed.
- Remind the treasurer monthly to reconcile the Spendable Balance Report.
- Carry outstanding reimbursements and unreconciled items into the treasurer's handover
  packet automatically.

---

## 8. Security and data protection

Single-organization scope removes tenant isolation as a concern and leaves four real ones:

1. **Who gets in** — invitation only, Google sign-in restricted to `princeton.edu`, no
   public registration, invitations rate-limited and expiring, revocation immediate.
2. **What they can do** — one server-side authorization module, declared capability per
   handler, dated grants, no reliance on frontend hiding.
3. **Private conversations** — enforced at the data-access layer; no administrative read
   path; excluded from exports; see §4.4 for the honest limit.
4. **Continuity of the data itself** — automated backups with a *tested* restore, soft
   deletes everywhere, append-only audit log, uploads served through signed time-limited
   URLs from a non-public bucket.

Not collected: anything about general members beyond what an event needs. No sensitive
personal data, no financial account numbers, no card details.

---

## 9. Delivery milestones

Everything listed is in scope for v1.0. The milestones are a build order, not a
filter — the communication system in particular is a firm requirement delivered across
M2 and M4.

**M1 — Foundation.** Google sign-in and invitations; people, positions, appointments,
board years; capabilities, bundles, dated grants; admin console; audit log. Nothing here
is visible to a user and everything depends on it.

**M2 — Coordination.** Events with templates and create-from-previous; tasks;
**meetings with agendas, minutes, attendance, and action items that become tasks**;
the conversation primitive with threads on events, tasks, and meetings; mentions;
message→task and promote-to-record; attachments; email notification digest; activity
feed. This is the milestone at which the board can stop using the Google Doc.

**M3 — Money.** Annual and event budgets; expenses; the reimbursement chain; receipts;
balance snapshots with provenance; the policy guardrails; the treasurer's outstanding
queue; funding requests and sources.

**M4 — Full communication.** Direct messages, private groups, channels; unread state
across every container; message search; push notifications; mobile polish.

**M5 — Continuity.** Contacts; handover packet generation; archive browsing; the
transition workflow end to end; progressive-grant tooling for the President.

M5 lands before the spring handover, which is the deadline that actually matters.

---

## 10. Open decisions

1. **Stack.** Proposal: Next.js as a mobile-first PWA + Postgres + a managed platform
   providing auth, file storage, and realtime in one. A solo maintainer should own as
   little infrastructure as possible. Native apps are out; a PWA covers push.
2. **Realtime transport** for messaging, and whether M2 ships with polling first.
3. **Board year vs fiscal year** (July–June) as the default finance view; both exist.
4. **Second operator** — designed for now, appointed later; what the recovery path is.
5. **Confirm the reimbursement deadline with ODUS** before nudge logic ships.
6. **Attachment limits and storage cost** — receipts are small, event media is not.
7. **Drive integration depth** — labelled links only, or browse-and-attach via API.
8. **Notification defaults** — over-notifying is the fastest way to get the app muted.
9. **Search scope** — Postgres full-text to start; whether records and messages share an
   index, given private conversations must stay out of administrative search.
10. **Hosting and who pays**, and whether the account is in SAIP's name rather than an
    individual's.
