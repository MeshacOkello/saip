import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  balanceSnapshot,
  boardYear,
  conversation,
  event,
  expense,
  fundingSource,
  membership,
  reimbursement,
  user,
} from "@/db/schema";
import { AccessError, grantCapabilities, loadMemberContext } from "@/lib/access";
import * as finance from "@/lib/finance/service";
import { ValidationError, formatAmount, parseAmount } from "@/lib/finance/service";
import * as work from "@/lib/work/service";

const SUFFIX = `f${Date.now().toString(36)}`;
const created: string[] = [];
const events: string[] = [];
const sources: string[] = [];
const expenses: string[] = [];
const balanceIds: string[] = [];

/** Wraps createExpense so the test only ever deletes rows it made itself. */
async function record(
  actor: Awaited<ReturnType<typeof makeMember>>,
  input: Parameters<typeof finance.createExpense>[1],
) {
  const row = await finance.createExpense(actor, input);
  expenses.push(row.id);
  return row;
}

async function makeMember(name: string, capabilities: string[]) {
  const [person] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      name,
      email: `${name.toLowerCase().replace(/\s+/g, "-")}-${SUFFIX}@princeton.edu`,
    })
    .returning();
  created.push(person.id);

  const [access] = await db
    .insert(membership)
    .values({ userId: person.id, status: "active", joinedAt: new Date() })
    .returning();

  if (capabilities.length > 0) {
    await grantCapabilities(
      access.id,
      capabilities.map((c) => ({ capability: c as never })),
      null,
    );
  }

  const ctx = await loadMemberContext(person.id);
  if (!ctx) throw new Error("no context");
  return ctx;
}

let year: typeof boardYear.$inferSelect;
let treasurer: Awaited<ReturnType<typeof makeMember>>;
let president: Awaited<ReturnType<typeof makeMember>>;
let officer: Awaited<ReturnType<typeof makeMember>>;

beforeAll(async () => {
  const [current] = await db
    .select()
    .from(boardYear)
    .where(eq(boardYear.isCurrent, true))
    .limit(1);
  if (!current) throw new Error("Run `npm run db:seed` before the tests.");
  year = current;

  treasurer = await makeMember("Fin Treasurer", [
    "finance.view",
    "finance.edit",
    "finance.approve",
    "reimbursements.view",
    "events.create",
  ]);
  president = await makeMember("Fin President", [
    "finance.view",
    "finance.edit",
    "finance.approve",
  ]);
  officer = await makeMember("Fin Officer", ["events.create"]);
});

afterAll(async () => {
  if (events.length > 0) {
    await db.delete(conversation).where(inArray(conversation.subjectId, events));
  }
  if (balanceIds.length > 0)
    await db.delete(balanceSnapshot).where(inArray(balanceSnapshot.id, balanceIds));
  if (expenses.length > 0) {
    await db.delete(reimbursement).where(inArray(reimbursement.expenseId, expenses));
    await db.delete(expense).where(inArray(expense.id, expenses));
  }
  if (events.length > 0) await db.delete(event).where(inArray(event.id, events));
  if (sources.length > 0)
    await db.delete(fundingSource).where(inArray(fundingSource.id, sources));
  if (created.length > 0) await db.delete(user).where(inArray(user.id, created));
});

describe("amounts", () => {
  it("stores money as cents and accepts the ways people type it", () => {
    expect(parseAmount("75")).toBe(7500);
    expect(parseAmount("$1,234.56")).toBe(123456);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(formatAmount(123456)).toBe("$1,234.56");
    expect(formatAmount(null)).toBe("—");
  });

  it("refuses nonsense and negatives", () => {
    expect(() => parseAmount("abc")).toThrow(ValidationError);
    expect(() => parseAmount("-20")).toThrow(ValidationError);
  });
});

describe("University policy is enforced, not just documented", () => {
  it("refuses an out-of-pocket payment for services", async () => {
    await expect(
      record(treasurer, {
        boardYearId: year.id,
        description: "DJ for Afrobeats night",
        category: "services",
        route: "out_of_pocket",
        actualAmount: 30000,
      }),
    ).rejects.toThrow(/Prime before the event/);
  });

  it("allows the same service through Prime", async () => {
    const row = await record(treasurer, {
      boardYearId: year.id,
      description: `DJ via Prime ${SUFFIX}`,
      category: "services",
      route: "prime_vendor",
      plannedAmount: 30000,
    });
    expect(row.route).toBe("prime_vendor");
  });

  it("refuses alcohol and gift cards outright", async () => {
    await expect(
      record(treasurer, {
        boardYearId: year.id,
        description: "Wine",
        category: "alcohol",
        actualAmount: 5000,
      }),
    ).rejects.toThrow(/prohibited expense/);

    await expect(
      record(treasurer, {
        boardYearId: year.id,
        description: "Amazon gift cards for the raffle",
        category: "gift_cards",
        actualAmount: 10000,
      }),
    ).rejects.toThrow(/IRS/);
  });

  it("refuses an expense with no amount at all", async () => {
    await expect(
      record(treasurer, {
        boardYearId: year.id,
        description: "Something",
        category: "food",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses finance work without finance.edit", async () => {
    await expect(
      finance.createExpense(officer, {
        boardYearId: year.id,
        description: "Food",
        category: "food",
        actualAmount: 1000,
      }),
    ).rejects.toBeInstanceOf(AccessError);

    await expect(
      finance.recordBalance(officer, {
        boardYearId: year.id,
        amount: 100,
        provenance: "prime",
        asOf: "2026-11-10",
      }),
    ).rejects.toBeInstanceOf(AccessError);
  });
});

describe("reimbursements follow the real Concur chain", () => {
  async function outOfPocketExpense() {
    return record(treasurer, {
      boardYearId: year.id,
      description: `Jollof ${SUFFIX}`,
      category: "food",
      route: "out_of_pocket",
      actualAmount: 7500,
      paidByUserId: officer.userId,
      incurredOn: new Date().toISOString().slice(0, 10),
    });
  }

  it("opens a claim automatically when a member pays out of pocket", async () => {
    const row = await outOfPocketExpense();
    const [claim] = await db
      .select()
      .from(reimbursement)
      .where(eq(reimbursement.expenseId, row.id));

    expect(claim).toBeDefined();
    expect(claim.claimantUserId).toBe(officer.userId);
    expect(claim.amount).toBe(7500);
    expect(claim.status).toBe("not_filed");
  });

  it("walks the full chain and refuses to skip a step", async () => {
    const row = await outOfPocketExpense();
    const [claim] = await db
      .select()
      .from(reimbursement)
      .where(eq(reimbursement.expenseId, row.id));

    await expect(
      finance.advanceReimbursement(treasurer, {
        reimbursementId: claim.id,
        to: "paid",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const filed = await finance.advanceReimbursement(officer, {
      reimbursementId: claim.id,
      to: "filed",
      concurRef: "RPT-1234",
    });
    expect(filed.status).toBe("filed");
    expect(filed.filedOn).not.toBeNull();

    for (const step of [
      "treasurer_approved",
      "odus_approved",
      "finance_approved",
      "paid",
    ]) {
      const moved = await finance.advanceReimbursement(treasurer, {
        reimbursementId: claim.id,
        to: step,
      });
      expect(moved.status).toBe(step);
    }

    const [final] = await db
      .select()
      .from(reimbursement)
      .where(eq(reimbursement.id, claim.id));
    expect(final.paidOn).not.toBeNull();
  });

  it("refuses to let somebody approve their own claim", async () => {
    const row = await record(treasurer, {
      boardYearId: year.id,
      description: `Treasurer's own purchase ${SUFFIX}`,
      category: "supplies",
      route: "out_of_pocket",
      actualAmount: 2000,
      paidByUserId: treasurer.userId,
    });
    const [claim] = await db
      .select()
      .from(reimbursement)
      .where(eq(reimbursement.expenseId, row.id));

    await finance.advanceReimbursement(treasurer, {
      reimbursementId: claim.id,
      to: "filed",
    });

    await expect(
      finance.advanceReimbursement(treasurer, {
        reimbursementId: claim.id,
        to: "treasurer_approved",
      }),
    ).rejects.toThrow(/approved by the president/);

    // The president approves the treasurer's own expense, as ODUS requires.
    const approved = await finance.advanceReimbursement(president, {
      reimbursementId: claim.id,
      to: "treasurer_approved",
    });
    expect(approved.status).toBe("treasurer_approved");
  });

  it("refuses to let a member file somebody else's claim", async () => {
    const row = await outOfPocketExpense();
    const [claim] = await db
      .select()
      .from(reimbursement)
      .where(eq(reimbursement.expenseId, row.id));

    const stranger = await makeMember("Fin Stranger", ["finance.view"]);
    await expect(
      finance.advanceReimbursement(stranger, {
        reimbursementId: claim.id,
        to: "filed",
      }),
    ).rejects.toBeInstanceOf(AccessError);
  });
});

describe("balances keep their provenance", () => {
  it("never merges a Prime figure with our own estimate", async () => {
    const a = await finance.recordBalance(treasurer, {
      boardYearId: year.id,
      amount: 262900,
      provenance: "prime",
      asOf: "2026-11-01",
    });
    const b = await finance.recordBalance(treasurer, {
      boardYearId: year.id,
      amount: 254000,
      provenance: "internal_estimate",
      asOf: "2026-11-09",
    });
    balanceIds.push(a.id, b.id);

    const balances = await finance.latestBalances(year.id);
    expect(balances.prime?.amount).toBe(262900);
    expect(balances.estimate?.amount).toBe(254000);
    expect(balances.prime?.amount).not.toBe(balances.estimate?.amount);
  });
});

describe("policy warnings", () => {
  it("flags spending against an event that is not registered in MyPrincetonU", async () => {
    const e = await work.createEvent(treasurer, {
      boardYearId: year.id,
      title: `Unregistered ${SUFFIX}`,
    });
    events.push(e.id);

    await record(treasurer, {
      boardYearId: year.id,
      eventId: e.id,
      description: `Food for unregistered ${SUFFIX}`,
      category: "food",
      plannedAmount: 15000,
    });

    const warnings = await finance.policyWarnings(year.id);
    expect(warnings.unregistered.some((w) => w.eventId === e.id)).toBe(true);

    await work.updateEvent(treasurer, { eventId: e.id, registration: "approved" });
    const after = await finance.policyWarnings(year.id);
    expect(after.unregistered.some((w) => w.eventId === e.id)).toBe(false);
  });

  it("flags a purchase that has sat unfiled past the window", async () => {
    const old = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
    await record(treasurer, {
      boardYearId: year.id,
      description: `Old receipt ${SUFFIX}`,
      category: "supplies",
      route: "out_of_pocket",
      actualAmount: 4000,
      paidByUserId: officer.userId,
      incurredOn: old,
    });

    const warnings = await finance.policyWarnings(year.id);
    expect(warnings.stale.some((s) => s.purchasedOn === old)).toBe(true);
  });
});

describe("summary", () => {
  it("reports planned, actual and what members are owed", async () => {
    const summary = await finance.financeSummary(year.id);
    expect(summary.totals.actual).toBeGreaterThan(0);
    expect(summary.owed.count).toBeGreaterThan(0);
    expect(summary.owed.total).toBeGreaterThan(0);
  });
});

describe("reading versus changing money", () => {
  it("lets a member with finance.view read, and refuses every change", async () => {
    const reader = await makeMember("Fin Reader", [
      "finance.view",
      "finance.view_history",
      "reimbursements.view",
    ]);

    // Reading is fine.
    await expect(finance.financeSummary(year.id)).resolves.toBeDefined();
    await expect(finance.listExpenses(year.id)).resolves.toBeDefined();
    await expect(finance.latestBalances(year.id)).resolves.toBeDefined();
    await expect(finance.listFunding(year.id)).resolves.toBeDefined();

    // Changing anything is not.
    await expect(
      finance.createExpense(reader, {
        boardYearId: year.id,
        description: "Nope",
        category: "food",
        actualAmount: 500,
      }),
    ).rejects.toBeInstanceOf(AccessError);

    await expect(
      finance.recordBalance(reader, {
        boardYearId: year.id,
        amount: 100,
        provenance: "prime",
        asOf: "2026-11-10",
      }),
    ).rejects.toBeInstanceOf(AccessError);

    await expect(
      finance.createFundingSource(reader, { name: "Nope", kind: "other" }),
    ).rejects.toBeInstanceOf(AccessError);

    await expect(
      finance.createFundingRequest(reader, {
        boardYearId: year.id,
        sourceId: crypto.randomUUID(),
        title: "Nope",
        amountRequested: 100,
      }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("refuses a reader the approval steps on somebody else's claim", async () => {
    const reader = await makeMember("Fin Reader Two", ["finance.view"]);
    const row = await record(treasurer, {
      boardYearId: year.id,
      description: `Someone else's purchase ${SUFFIX}`,
      category: "supplies",
      route: "out_of_pocket",
      actualAmount: 1500,
      paidByUserId: officer.userId,
    });
    const [claim] = await db
      .select()
      .from(reimbursement)
      .where(eq(reimbursement.expenseId, row.id));

    await expect(
      finance.advanceReimbursement(reader, {
        reimbursementId: claim.id,
        to: "filed",
      }),
    ).rejects.toBeInstanceOf(AccessError);
  });
});
