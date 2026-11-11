import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { boardYear } from "./board";
import { event } from "./work";

/**
 * Money, alongside Princeton's systems rather than instead of them.
 *
 * Prime is the University's financial system of record and Concur is its
 * reimbursement system. This application plans, documents and chases: it never claims
 * a payment happened, only what we believe about where a request stands and who has
 * to act next.
 *
 * Amounts are stored in cents as integers. Floating point has no business here.
 */

export const fundingSourceKind = pgEnum("funding_source_kind", [
  "own_funds", // the group's own Prime balance
  "projects_board",
  "alcohol_initiative",
  "conference_fund",
  "department", // an academic or administrative department
  "safe", // a SAFE award
  "co_sponsor", // another student group sharing the cost
  "donation",
  "other",
]);

export const fundingSource = pgTable("funding_source", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  kind: fundingSourceKind().notNull().default("other"),
  notes: text(),
  /** Deadlines and lead times, so they are not rediscovered every year. */
  deadlines: text(),
  isActive: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const fundingRequestStatus = pgEnum("funding_request_status", [
  "draft",
  "submitted",
  "awarded",
  "declined",
  "withdrawn",
]);

export const fundingRequest = pgTable(
  "funding_request",
  {
    id: uuid().primaryKey().defaultRandom(),
    boardYearId: uuid()
      .notNull()
      .references(() => boardYear.id, { onDelete: "restrict" }),
    eventId: uuid().references(() => event.id, { onDelete: "set null" }),
    sourceId: uuid()
      .notNull()
      .references(() => fundingSource.id, { onDelete: "restrict" }),
    title: text().notNull(),
    amountRequested: integer().notNull(),
    amountAwarded: integer(),
    status: fundingRequestStatus().notNull().default("draft"),
    /** The reference the funding body gave us, if any. */
    externalRef: text(),
    submittedOn: date({ mode: "string" }),
    decidedOn: date({ mode: "string" }),
    notes: text(),
    filedBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("funding_request_year_idx").on(t.boardYearId, t.status)],
);

/**
 * Expense categories exist to carry policy, not for accounting elegance.
 * `services`, `alcohol` and `gift_cards` are the ones the University forbids paying
 * for out of pocket, or at all.
 */
export const expenseCategory = pgEnum("expense_category", [
  "food",
  "venue",
  "supplies",
  "printing",
  "transport",
  "services", // DJ, photographer, performer — never out of pocket
  "alcohol", // prohibited outright
  "gift_cards", // prohibited outright (IRS)
  "other",
]);

/** How the money leaves, which decides what paperwork is required. */
export const paymentRoute = pgEnum("payment_route", [
  "undecided",
  "odus_card", // ODUS credit card — the route that costs a member nothing
  "department_charge", // a University department journals the charge
  "prime_vendor", // paid to a vendor through Prime, set up before the event
  "out_of_pocket", // a member pays and claims through Concur
]);

export const expense = pgTable(
  "expense",
  {
    id: uuid().primaryKey().defaultRandom(),
    boardYearId: uuid()
      .notNull()
      .references(() => boardYear.id, { onDelete: "restrict" }),
    eventId: uuid().references(() => event.id, { onDelete: "set null" }),
    description: text().notNull(),
    category: expenseCategory().notNull().default("other"),
    vendor: text(),
    /** Both are kept: planning without the actual is a guess, and the gap is the point. */
    plannedAmount: integer(),
    actualAmount: integer(),
    route: paymentRoute().notNull().default("undecided"),
    incurredOn: date({ mode: "string" }),
    paidByUserId: text().references(() => user.id, { onDelete: "set null" }),
    /** Prime chartstring: department (15XXX) + fund code + account code. */
    chartstring: text(),
    receiptUrl: text(),
    notes: text(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("expense_year_idx").on(t.boardYearId),
    index("expense_event_idx").on(t.eventId),
  ],
);

/**
 * The real Concur chain, as ODUS documents it:
 * member submits → treasurer approves → ODUS staff approve → Finance and Treasury
 * approve → the member is paid. Nothing appears in Prime until the end of it.
 */
export const reimbursementStatus = pgEnum("reimbursement_status", [
  "not_filed",
  "filed",
  "treasurer_approved",
  "odus_approved",
  "finance_approved",
  "paid",
  "rejected",
]);

export const reimbursement = pgTable(
  "reimbursement",
  {
    id: uuid().primaryKey().defaultRandom(),
    expenseId: uuid()
      .notNull()
      .references(() => expense.id, { onDelete: "cascade" }),
    claimantUserId: text()
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    amount: integer().notNull(),
    status: reimbursementStatus().notNull().default("not_filed"),
    /** The Concur report number, so the two systems can be reconciled by hand. */
    concurRef: text(),
    purchasedOn: date({ mode: "string" }).notNull(),
    filedOn: date({ mode: "string" }),
    paidOn: date({ mode: "string" }),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reimbursement_status_idx").on(t.status, t.purchasedOn)],
);

/**
 * What the money actually is, and where that figure came from.
 *
 * A number read out of Prime and a number this application worked out are never
 * added together or shown as one: the provenance travels with the amount.
 */
export const balanceProvenance = pgEnum("balance_provenance", [
  "prime",
  "internal_estimate",
]);

export const balanceSnapshot = pgTable(
  "balance_snapshot",
  {
    id: uuid().primaryKey().defaultRandom(),
    boardYearId: uuid()
      .notNull()
      .references(() => boardYear.id, { onDelete: "restrict" }),
    amount: integer().notNull(),
    provenance: balanceProvenance().notNull(),
    asOf: date({ mode: "string" }).notNull(),
    note: text(),
    recordedBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("balance_year_idx").on(t.boardYearId, t.asOf)],
);

export const expenseRelations = relations(expense, ({ one, many }) => ({
  event: one(event, { fields: [expense.eventId], references: [event.id] }),
  paidBy: one(user, { fields: [expense.paidByUserId], references: [user.id] }),
  reimbursements: many(reimbursement),
}));

export const reimbursementRelations = relations(reimbursement, ({ one }) => ({
  expense: one(expense, {
    fields: [reimbursement.expenseId],
    references: [expense.id],
  }),
  claimant: one(user, {
    fields: [reimbursement.claimantUserId],
    references: [user.id],
  }),
}));

export const fundingRequestRelations = relations(fundingRequest, ({ one }) => ({
  source: one(fundingSource, {
    fields: [fundingRequest.sourceId],
    references: [fundingSource.id],
  }),
  event: one(event, { fields: [fundingRequest.eventId], references: [event.id] }),
}));
