"use server";

import { revalidatePath } from "next/cache";

import { AccessError } from "@/lib/access";
import * as finance from "@/lib/finance/service";
import { ValidationError, parseAmount } from "@/lib/finance/service";
import { requireMemberOrThrow } from "@/lib/session";

export type ActionState = { ok: boolean; error?: string; message?: string };

async function run(
  fn: (actor: Awaited<ReturnType<typeof requireMemberOrThrow>>) => Promise<unknown>,
  message?: string,
): Promise<ActionState> {
  try {
    const actor = await requireMemberOrThrow();
    await fn(actor);
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AccessError) {
      return { ok: false, error: error.message };
    }
    console.error(error);
    return { ok: false, error: "Something went wrong. Nothing was changed." };
  }
}

const str = (f: FormData, k: string) =>
  typeof f.get(k) === "string" ? (f.get(k) as string).trim() : "";
const opt = (f: FormData, k: string) => str(f, k) || null;

export async function createExpenseAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      finance.createExpense(actor, {
        boardYearId: str(f, "boardYearId"),
        eventId: opt(f, "eventId"),
        description: str(f, "description"),
        category: str(f, "category") || "other",
        vendor: opt(f, "vendor"),
        plannedAmount: parseAmount(opt(f, "plannedAmount")),
        actualAmount: parseAmount(opt(f, "actualAmount")),
        route: str(f, "route") || "undecided",
        incurredOn: opt(f, "incurredOn"),
        paidByUserId: opt(f, "paidByUserId"),
        chartstring: opt(f, "chartstring"),
        notes: opt(f, "notes"),
      }),
    "Expense recorded.",
  );
}

export async function updateExpenseAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      finance.updateExpense(actor, {
        expenseId: str(f, "expenseId"),
        ...(f.has("actualAmount")
          ? { actualAmount: parseAmount(opt(f, "actualAmount")) }
          : {}),
        ...(f.has("route") ? { route: str(f, "route") } : {}),
        ...(f.has("category") ? { category: str(f, "category") } : {}),
        ...(f.has("chartstring") ? { chartstring: opt(f, "chartstring") } : {}),
      }),
    "Saved.",
  );
}

export async function deleteExpenseAction(_p: ActionState, f: FormData) {
  return run((actor) => finance.deleteExpense(actor, str(f, "expenseId")), "Removed.");
}

export async function advanceReimbursementAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      finance.advanceReimbursement(actor, {
        reimbursementId: str(f, "reimbursementId"),
        to: str(f, "to"),
        ...(f.has("concurRef") ? { concurRef: opt(f, "concurRef") } : {}),
      }),
    "Claim updated.",
  );
}

export async function createFundingSourceAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      finance.createFundingSource(actor, {
        name: str(f, "name"),
        kind: str(f, "kind") || "other",
        notes: opt(f, "notes"),
        deadlines: opt(f, "deadlines"),
      }),
    "Funding source added.",
  );
}

export async function createFundingRequestAction(_p: ActionState, f: FormData) {
  return run((actor) => {
    const amount = parseAmount(opt(f, "amountRequested"));
    if (amount == null) throw new ValidationError("How much are you asking for?");
    return finance.createFundingRequest(actor, {
      boardYearId: str(f, "boardYearId"),
      sourceId: str(f, "sourceId"),
      eventId: opt(f, "eventId"),
      title: str(f, "title"),
      amountRequested: amount,
      notes: opt(f, "notes"),
    });
  }, "Funding request recorded.");
}

export async function updateFundingRequestAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      finance.updateFundingRequest(actor, {
        requestId: str(f, "requestId"),
        ...(f.has("status") ? { status: str(f, "status") } : {}),
        ...(f.has("amountAwarded")
          ? { amountAwarded: parseAmount(opt(f, "amountAwarded")) }
          : {}),
        ...(f.has("externalRef") ? { externalRef: opt(f, "externalRef") } : {}),
      }),
    "Saved.",
  );
}

export async function recordBalanceAction(_p: ActionState, f: FormData) {
  return run((actor) => {
    const amount = parseAmount(opt(f, "amount"));
    if (amount == null) throw new ValidationError("Give the balance.");
    const provenance = str(f, "provenance") === "prime" ? "prime" : "internal_estimate";
    return finance.recordBalance(actor, {
      boardYearId: str(f, "boardYearId"),
      amount,
      provenance,
      asOf: str(f, "asOf") || new Date().toISOString().slice(0, 10),
      note: opt(f, "note"),
    });
  }, "Balance recorded.");
}
