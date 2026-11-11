import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  balanceSnapshot,
  event,
  expense,
  fundingRequest,
  fundingSource,
  reimbursement,
  user,
} from "@/db/schema";
import { AccessError, type MemberContext } from "@/lib/access";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications/service";
import type { Capability } from "@/lib/capabilities";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function need(actor: MemberContext, capability: Capability) {
  if (!actor.capabilities.has(capability)) {
    throw new AccessError(`Missing capability: ${capability}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Money formatting and parsing                                               */
/* -------------------------------------------------------------------------- */

/** Amounts live in cents. Accepts "1,234.56", "$75", "75". */
export function parseAmount(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) throw new ValidationError("That is not an amount.");
  if (value < 0) throw new ValidationError("An amount cannot be negative.");
  return Math.round(value * 100);
}

export function formatAmount(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/* -------------------------------------------------------------------------- */
/* Policy                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Princeton's own pages disagree about the reimbursement deadline: the central
 * student-organisation policy says 30 business days, while ODUS says one week in one
 * place and five days in another. We do not resolve that silently — the window is
 * configurable, defaults to the strictest reading, and the citation is shown next to
 * anything that depends on it.
 */
export const REIMBURSEMENT_WINDOW_DAYS = Number(
  process.env.REIMBURSEMENT_WINDOW_DAYS ?? 7,
);

export const REIMBURSEMENT_POLICY_NOTE =
  "Princeton's pages disagree: 30 business days (studentorg Financial Policies), " +
  "one week and five days (ODUS Financial Transactions). We nudge at the strictest " +
  "reading. Confirm with ODUS.";

export const PROHIBITED_CATEGORIES = {
  alcohol:
    "Alcohol is a prohibited expense for student organisations. It cannot be paid " +
    "from group funds or reimbursed.",
  gift_cards:
    "Gift cards and cash equivalents cannot be bought with student organisation " +
    "funds, because of IRS rules.",
} as const;

export const SERVICES_WARNING =
  "Students may not pay an individual for services and claim it back — a DJ, a " +
  "photographer or a performer must be set up as a payee in Prime before the event, " +
  "and paid through an invoice or a Limited Engagement Agreement. A Concur claim for " +
  "this will be denied.";

/** Checks that cannot be expressed in the schema, applied before anything is saved. */
function assertSpendIsAllowed(input: {
  category: string;
  route: string;
}) {
  if (input.category in PROHIBITED_CATEGORIES) {
    throw new ValidationError(
      PROHIBITED_CATEGORIES[input.category as keyof typeof PROHIBITED_CATEGORIES],
    );
  }
  if (input.category === "services" && input.route === "out_of_pocket") {
    throw new ValidationError(SERVICES_WARNING);
  }
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                   */
/* -------------------------------------------------------------------------- */

type ExpenseInput = {
  boardYearId: string;
  eventId?: string | null;
  description: string;
  category: string;
  vendor?: string | null;
  plannedAmount?: number | null;
  actualAmount?: number | null;
  route?: string;
  incurredOn?: string | null;
  paidByUserId?: string | null;
  chartstring?: string | null;
  receiptUrl?: string | null;
  notes?: string | null;
};

export async function createExpense(actor: MemberContext, input: ExpenseInput) {
  need(actor, "finance.edit");

  const description = input.description.trim();
  if (description.length < 2) throw new ValidationError("Describe the expense.");
  if (input.plannedAmount == null && input.actualAmount == null) {
    throw new ValidationError("Give a planned or an actual amount.");
  }

  const route = input.route ?? "undecided";
  assertSpendIsAllowed({ category: input.category, route });

  const [row] = await db
    .insert(expense)
    .values({
      boardYearId: input.boardYearId,
      eventId: input.eventId ?? null,
      description,
      category: input.category as "other",
      vendor: input.vendor ?? null,
      plannedAmount: input.plannedAmount ?? null,
      actualAmount: input.actualAmount ?? null,
      route: route as "undecided",
      incurredOn: input.incurredOn || null,
      paidByUserId: input.paidByUserId ?? null,
      chartstring: input.chartstring ?? null,
      receiptUrl: input.receiptUrl ?? null,
      notes: input.notes ?? null,
      createdBy: actor.userId,
    })
    .returning();

  // An out-of-pocket purchase is money somebody is owed. Open the claim immediately
  // rather than waiting for them to remember.
  if (
    row.route === "out_of_pocket" &&
    row.actualAmount != null &&
    row.paidByUserId
  ) {
    await db.insert(reimbursement).values({
      expenseId: row.id,
      claimantUserId: row.paidByUserId,
      amount: row.actualAmount,
      purchasedOn: row.incurredOn ?? new Date().toISOString().slice(0, 10),
    });
  }

  await recordAudit({
    actorUserId: actor.userId,
    action: "expense.created",
    subjectType: "expense",
    subjectId: row.id,
    metadata: { description, category: row.category, route: row.route },
  });

  return row;
}

export async function updateExpense(
  actor: MemberContext,
  input: Partial<ExpenseInput> & { expenseId: string },
) {
  need(actor, "finance.edit");

  const [existing] = await db
    .select()
    .from(expense)
    .where(eq(expense.id, input.expenseId))
    .limit(1);
  if (!existing) throw new ValidationError("No such expense.");

  assertSpendIsAllowed({
    category: input.category ?? existing.category,
    route: input.route ?? existing.route,
  });

  const [row] = await db
    .update(expense)
    .set({
      ...(input.description !== undefined
        ? { description: input.description.trim() }
        : {}),
      ...(input.category !== undefined ? { category: input.category as "other" } : {}),
      ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
      ...(input.plannedAmount !== undefined
        ? { plannedAmount: input.plannedAmount }
        : {}),
      ...(input.actualAmount !== undefined ? { actualAmount: input.actualAmount } : {}),
      ...(input.route !== undefined ? { route: input.route as "undecided" } : {}),
      ...(input.incurredOn !== undefined ? { incurredOn: input.incurredOn || null } : {}),
      ...(input.paidByUserId !== undefined ? { paidByUserId: input.paidByUserId } : {}),
      ...(input.chartstring !== undefined ? { chartstring: input.chartstring } : {}),
      ...(input.receiptUrl !== undefined ? { receiptUrl: input.receiptUrl } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    })
    .where(eq(expense.id, input.expenseId))
    .returning();

  return row;
}

export async function deleteExpense(actor: MemberContext, expenseId: string) {
  need(actor, "finance.edit");
  const [row] = await db
    .update(expense)
    .set({ deletedAt: new Date() })
    .where(eq(expense.id, expenseId))
    .returning();
  await recordAudit({
    actorUserId: actor.userId,
    action: "expense.deleted",
    subjectType: "expense",
    subjectId: expenseId,
  });
  return row;
}

/* -------------------------------------------------------------------------- */
/* Reimbursements                                                             */
/* -------------------------------------------------------------------------- */

const CHAIN: Record<string, string[]> = {
  not_filed: ["filed", "rejected"],
  filed: ["treasurer_approved", "rejected"],
  treasurer_approved: ["odus_approved", "rejected"],
  odus_approved: ["finance_approved", "rejected"],
  finance_approved: ["paid", "rejected"],
  paid: [],
  rejected: ["filed"],
};

export const REIMBURSEMENT_LABEL: Record<string, string> = {
  not_filed: "Not filed in Concur",
  filed: "Filed, waiting on the treasurer",
  treasurer_approved: "Treasurer approved, with ODUS",
  odus_approved: "ODUS approved, with Finance and Treasury",
  finance_approved: "Approved, waiting to be paid",
  paid: "Paid",
  rejected: "Rejected",
};

/**
 * Moves a claim along the chain. The application never asserts that money moved: a
 * person marks each step, because Concur and Prime are where it actually happens.
 */
export async function advanceReimbursement(
  actor: MemberContext,
  input: { reimbursementId: string; to: string; concurRef?: string | null },
) {
  const [row] = await db
    .select()
    .from(reimbursement)
    .where(eq(reimbursement.id, input.reimbursementId))
    .limit(1);
  if (!row) throw new ValidationError("No such claim.");

  // The claimant files their own claim; moving it past that is the treasurer's job.
  const ownClaim = row.claimantUserId === actor.userId;
  if (input.to === "filed") {
    if (!ownClaim) need(actor, "finance.approve");
  } else {
    need(actor, "finance.approve");
  }

  if (!CHAIN[row.status]?.includes(input.to)) {
    throw new ValidationError(
      `A claim cannot go from "${REIMBURSEMENT_LABEL[row.status]}" to "${
        REIMBURSEMENT_LABEL[input.to] ?? input.to
      }".`,
    );
  }

  // Policy: the treasurer approves everyone else's claims, and the president
  // approves the treasurer's own. Approving your own is refused either way.
  if (ownClaim && input.to === "treasurer_approved") {
    throw new ValidationError(
      "You cannot approve your own claim. Expenses incurred by the treasurer are " +
        "approved by the president.",
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const [updated] = await db
    .update(reimbursement)
    .set({
      status: input.to as "filed",
      ...(input.concurRef !== undefined ? { concurRef: input.concurRef } : {}),
      ...(input.to === "filed" ? { filedOn: row.filedOn ?? today } : {}),
      ...(input.to === "paid" ? { paidOn: today } : {}),
      updatedAt: new Date(),
    })
    .where(eq(reimbursement.id, input.reimbursementId))
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "reimbursement.advanced",
    subjectType: "reimbursement",
    subjectId: updated.id,
    metadata: { from: row.status, to: updated.status },
  });

  if (!ownClaim) {
    await notify([
      {
        userId: row.claimantUserId,
        kind: "reimbursement",
        title:
          updated.status === "paid"
            ? "Your reimbursement has been paid"
            : "Your reimbursement moved along",
        body: REIMBURSEMENT_LABEL[updated.status],
        href: "/finances/reimbursements",
        actorUserId: actor.userId,
        subjectType: "reimbursement",
        subjectId: updated.id,
      },
    ]);
  }

  return updated;
}

export async function openReimbursement(
  actor: MemberContext,
  input: {
    expenseId: string;
    claimantUserId: string;
    amount: number;
    purchasedOn: string;
  },
) {
  need(actor, "finance.edit");
  const [row] = await db
    .insert(reimbursement)
    .values({
      expenseId: input.expenseId,
      claimantUserId: input.claimantUserId,
      amount: input.amount,
      purchasedOn: input.purchasedOn,
    })
    .returning();
  return row;
}

/* -------------------------------------------------------------------------- */
/* Funding                                                                    */
/* -------------------------------------------------------------------------- */

export async function createFundingSource(
  actor: MemberContext,
  input: { name: string; kind: string; notes?: string | null; deadlines?: string | null },
) {
  need(actor, "finance.edit");
  const name = input.name.trim();
  if (name.length < 2) throw new ValidationError("Name the funding source.");

  const [row] = await db
    .insert(fundingSource)
    .values({
      name,
      kind: input.kind as "other",
      notes: input.notes ?? null,
      deadlines: input.deadlines ?? null,
    })
    .returning();
  return row;
}

export async function createFundingRequest(
  actor: MemberContext,
  input: {
    boardYearId: string;
    sourceId: string;
    eventId?: string | null;
    title: string;
    amountRequested: number;
    notes?: string | null;
  },
) {
  need(actor, "finance.edit");
  if (input.amountRequested <= 0) {
    throw new ValidationError("A funding request needs an amount.");
  }

  const [row] = await db
    .insert(fundingRequest)
    .values({
      boardYearId: input.boardYearId,
      sourceId: input.sourceId,
      eventId: input.eventId ?? null,
      title: input.title.trim(),
      amountRequested: input.amountRequested,
      notes: input.notes ?? null,
      filedBy: actor.userId,
    })
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "funding_request.created",
    subjectType: "funding_request",
    subjectId: row.id,
    metadata: { title: row.title, amount: row.amountRequested },
  });

  return row;
}

export async function updateFundingRequest(
  actor: MemberContext,
  input: {
    requestId: string;
    status?: string;
    amountAwarded?: number | null;
    externalRef?: string | null;
    submittedOn?: string | null;
    decidedOn?: string | null;
  },
) {
  need(actor, "finance.edit");

  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .update(fundingRequest)
    .set({
      ...(input.status !== undefined ? { status: input.status as "submitted" } : {}),
      ...(input.amountAwarded !== undefined
        ? { amountAwarded: input.amountAwarded }
        : {}),
      ...(input.externalRef !== undefined ? { externalRef: input.externalRef } : {}),
      ...(input.status === "submitted" ? { submittedOn: today } : {}),
      ...(input.status === "awarded" || input.status === "declined"
        ? { decidedOn: today }
        : {}),
    })
    .where(eq(fundingRequest.id, input.requestId))
    .returning();
  if (!row) throw new ValidationError("No such funding request.");
  return row;
}

/* -------------------------------------------------------------------------- */
/* Balances                                                                   */
/* -------------------------------------------------------------------------- */

export async function recordBalance(
  actor: MemberContext,
  input: {
    boardYearId: string;
    amount: number;
    provenance: "prime" | "internal_estimate";
    asOf: string;
    note?: string | null;
  },
) {
  need(actor, "finance.edit");
  const [row] = await db
    .insert(balanceSnapshot)
    .values({
      boardYearId: input.boardYearId,
      amount: input.amount,
      provenance: input.provenance,
      asOf: input.asOf,
      note: input.note ?? null,
      recordedBy: actor.userId,
    })
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "balance.recorded",
    subjectType: "balance_snapshot",
    subjectId: row.id,
    metadata: { amount: row.amount, provenance: row.provenance, asOf: row.asOf },
  });

  return row;
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export async function listExpenses(boardYearId: string) {
  return db
    .select({
      id: expense.id,
      description: expense.description,
      category: expense.category,
      vendor: expense.vendor,
      plannedAmount: expense.plannedAmount,
      actualAmount: expense.actualAmount,
      route: expense.route,
      incurredOn: expense.incurredOn,
      eventId: expense.eventId,
      eventTitle: event.title,
      eventRegistration: event.registration,
      paidByName: user.name,
    })
    .from(expense)
    .leftJoin(event, eq(event.id, expense.eventId))
    .leftJoin(user, eq(user.id, expense.paidByUserId))
    .where(and(eq(expense.boardYearId, boardYearId), isNull(expense.deletedAt)))
    .orderBy(desc(expense.incurredOn), desc(expense.createdAt));
}

export async function expensesForEvent(eventId: string) {
  return db
    .select()
    .from(expense)
    .where(and(eq(expense.eventId, eventId), isNull(expense.deletedAt)))
    .orderBy(asc(expense.createdAt));
}

/** The treasurer's queue: who is owed money, and who has to act next. */
export async function outstandingReimbursements(boardYearId: string) {
  const cutoff = new Date(Date.now() - REIMBURSEMENT_WINDOW_DAYS * 864e5)
    .toISOString()
    .slice(0, 10);

  const rows = await db
    .select({
      id: reimbursement.id,
      amount: reimbursement.amount,
      status: reimbursement.status,
      purchasedOn: reimbursement.purchasedOn,
      concurRef: reimbursement.concurRef,
      claimantId: reimbursement.claimantUserId,
      claimantName: user.name,
      description: expense.description,
      eventId: expense.eventId,
    })
    .from(reimbursement)
    .innerJoin(expense, eq(expense.id, reimbursement.expenseId))
    .innerJoin(user, eq(user.id, reimbursement.claimantUserId))
    .where(
      and(
        eq(expense.boardYearId, boardYearId),
        sql`${reimbursement.status} <> 'paid'`,
        sql`${reimbursement.status} <> 'rejected'`,
      ),
    )
    .orderBy(asc(reimbursement.purchasedOn));

  // Whether a claim has sat past the window is a policy question, so it is answered
  // here rather than in a page.
  return rows.map((row) => ({
    ...row,
    late: row.status === "not_filed" && row.purchasedOn < cutoff,
  }));
}

export async function listFunding(boardYearId: string) {
  return db
    .select({
      id: fundingRequest.id,
      title: fundingRequest.title,
      status: fundingRequest.status,
      amountRequested: fundingRequest.amountRequested,
      amountAwarded: fundingRequest.amountAwarded,
      externalRef: fundingRequest.externalRef,
      sourceName: fundingSource.name,
      eventTitle: event.title,
    })
    .from(fundingRequest)
    .innerJoin(fundingSource, eq(fundingSource.id, fundingRequest.sourceId))
    .leftJoin(event, eq(event.id, fundingRequest.eventId))
    .where(eq(fundingRequest.boardYearId, boardYearId))
    .orderBy(desc(fundingRequest.createdAt));
}

export async function listSources() {
  return db
    .select()
    .from(fundingSource)
    .where(eq(fundingSource.isActive, true))
    .orderBy(asc(fundingSource.name));
}

export async function latestBalances(boardYearId: string) {
  const rows = await db
    .select()
    .from(balanceSnapshot)
    .where(eq(balanceSnapshot.boardYearId, boardYearId))
    .orderBy(desc(balanceSnapshot.asOf), desc(balanceSnapshot.createdAt));

  return {
    prime: rows.find((r) => r.provenance === "prime") ?? null,
    estimate: rows.find((r) => r.provenance === "internal_estimate") ?? null,
    history: rows.slice(0, 12),
  };
}

/**
 * The summary a treasurer is asked for: planned against actual, what has been
 * awarded, and how much is sitting with members waiting to be paid back.
 */
export async function financeSummary(boardYearId: string) {
  const [totals] = await db
    .select({
      planned: sql<number>`coalesce(sum(${expense.plannedAmount}), 0)::int`,
      actual: sql<number>`coalesce(sum(${expense.actualAmount}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(expense)
    .where(and(eq(expense.boardYearId, boardYearId), isNull(expense.deletedAt)));

  const [funding] = await db
    .select({
      requested: sql<number>`coalesce(sum(${fundingRequest.amountRequested}), 0)::int`,
      awarded: sql<number>`coalesce(sum(${fundingRequest.amountAwarded}), 0)::int`,
    })
    .from(fundingRequest)
    .where(eq(fundingRequest.boardYearId, boardYearId));

  const [owed] = await db
    .select({
      total: sql<number>`coalesce(sum(${reimbursement.amount}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(reimbursement)
    .innerJoin(expense, eq(expense.id, reimbursement.expenseId))
    .where(
      and(
        eq(expense.boardYearId, boardYearId),
        sql`${reimbursement.status} not in ('paid','rejected')`,
      ),
    );

  return { totals, funding, owed };
}

/**
 * Warnings the policies imply but the data cannot enforce: spending against an event
 * that is not registered in MyPrincetonU, and claims that have sat too long.
 */
export async function policyWarnings(boardYearId: string) {
  const unregistered = await db
    .select({
      id: expense.id,
      description: expense.description,
      eventId: event.id,
      eventTitle: event.title,
      registration: event.registration,
    })
    .from(expense)
    .innerJoin(event, eq(event.id, expense.eventId))
    .where(
      and(
        eq(expense.boardYearId, boardYearId),
        isNull(expense.deletedAt),
        sql`${event.registration} in ('not_started','submitted')`,
      ),
    );

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - REIMBURSEMENT_WINDOW_DAYS);
  const cutoffDay = cutoff.toISOString().slice(0, 10);

  const stale = await db
    .select({
      id: reimbursement.id,
      purchasedOn: reimbursement.purchasedOn,
      amount: reimbursement.amount,
      claimantName: user.name,
      description: expense.description,
    })
    .from(reimbursement)
    .innerJoin(expense, eq(expense.id, reimbursement.expenseId))
    .innerJoin(user, eq(user.id, reimbursement.claimantUserId))
    .where(
      and(
        eq(expense.boardYearId, boardYearId),
        eq(reimbursement.status, "not_filed"),
        sql`${reimbursement.purchasedOn} < ${cutoffDay}`,
      ),
    );

  return { unregistered, stale };
}
