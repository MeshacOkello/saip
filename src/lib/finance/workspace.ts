import { notFound } from "next/navigation";

import { currentBoardYear } from "@/lib/board";
import { requireMember } from "@/lib/session";

/** Shared gate for every finance tab: a board year, and permission to look. */
export async function loadFinanceWorkspace() {
  const member = await requireMember();
  const year = await currentBoardYear();
  if (!year) notFound();

  return {
    member,
    year,
    canView: member.capabilities.has("finance.view"),
    canEdit: member.capabilities.has("finance.edit"),
    canApprove: member.capabilities.has("finance.approve"),
    /** The reimbursement chase queue: who owes a receipt, and who acts next. */
    canChase: member.capabilities.has("reimbursements.view"),
  };
}
