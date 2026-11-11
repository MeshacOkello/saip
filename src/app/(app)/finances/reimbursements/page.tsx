import { ActionForm } from "@/components/action-form";
import { IconMoney } from "@/components/icons";
import { Badge, EmptyState, Notice, Section, Surface } from "@/components/ui";
import { advanceReimbursementAction } from "@/lib/finance/actions";
import {
  REIMBURSEMENT_LABEL,
  REIMBURSEMENT_POLICY_NOTE,
  formatAmount,
  outstandingReimbursements,
} from "@/lib/finance/service";
import { loadFinanceWorkspace } from "@/lib/finance/workspace";

export const metadata = { title: "Reimbursements · SAIP Board" };

const CHAIN = [
  "not_filed",
  "filed",
  "treasurer_approved",
  "odus_approved",
  "finance_approved",
  "paid",
] as const;

const NEXT_STEP: Record<string, { to: string; label: string }> = {
  not_filed: { to: "filed", label: "Mark filed in Concur" },
  filed: { to: "treasurer_approved", label: "Treasurer approved" },
  treasurer_approved: { to: "odus_approved", label: "ODUS approved" },
  odus_approved: { to: "finance_approved", label: "Finance approved" },
  finance_approved: { to: "paid", label: "Mark paid" },
};

export default async function ReimbursementsPage() {
  const { year, member, canApprove, canChase } = await loadFinanceWorkspace();

  if (!canChase) {
    return (
      <Surface padded={false}>
        <EmptyState icon={<IconMoney />} title="Reimbursements">
          You can read the board&rsquo;s finances, but following up on who still owes
          a receipt is the treasurer&rsquo;s queue.
        </EmptyState>
      </Surface>
    );
  }

  const claims = await outstandingReimbursements(year.id);

  const owed = claims.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="space-y-6">
      <Notice title="How a claim travels">
        The member files in Concur, the treasurer approves, then ODUS, then Finance
        and Treasury, and only then is it paid. Nothing appears in Prime until the end
        of that chain — this page tracks where each claim has got to.
        <p className="mt-2 text-[13px]">{REIMBURSEMENT_POLICY_NOTE}</p>
      </Notice>

      <Section
        title={`Open claims · ${claims.length}`}
        description={
          claims.length > 0
            ? `${formatAmount(owed)} is sitting with members, waiting to come back.`
            : undefined
        }
      >
        <Surface padded={false}>
          {claims.length > 0 ? (
            <ul className="claim-list">
              {claims.map((c) => {
                const step = NEXT_STEP[c.status];
                const mine = c.claimantId === member.userId;
                const reached = CHAIN.indexOf(c.status as (typeof CHAIN)[number]);
                return (
                  <li key={c.id}>
                    <div className="claim-head">
                      <div className="min-w-0">
                        <p className="claim-title">{c.description}</p>
                        <p className="claim-sub">
                          {c.claimantName} · bought {c.purchasedOn}
                          {c.concurRef ? ` · Concur ${c.concurRef}` : ""}
                        </p>
                      </div>
                      <span className="claim-amount">{formatAmount(c.amount)}</span>
                      <Badge tone={c.late ? "danger" : "primary"}>
                        {REIMBURSEMENT_LABEL[c.status]}
                      </Badge>
                    </div>

                    <ol className="claim-chain" aria-label="Progress">
                      {CHAIN.map((stage, index) => (
                        <li
                          key={stage}
                          className={index <= reached ? "is-reached" : ""}
                          title={REIMBURSEMENT_LABEL[stage]}
                        >
                          <span />
                        </li>
                      ))}
                    </ol>

                    {step && (mine || canApprove) ? (
                      <div className="claim-action">
                        <ActionForm
                          action={advanceReimbursementAction}
                          submitLabel={step.label}
                          variant="secondary"
                          size="sm"
                          inline
                          hidden={{ reimbursementId: c.id, to: step.to }}
                        />
                      </div>
                    ) : (
                      <p className="claim-waiting">
                        Waiting on{" "}
                        {c.status === "not_filed"
                          ? c.claimantName
                          : c.status === "filed"
                            ? "the treasurer"
                            : c.status === "treasurer_approved"
                              ? "ODUS"
                              : "Finance and Treasury"}
                        .
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={<IconMoney />} title="Nobody is waiting on money">
              A claim opens by itself whenever a member pays out of pocket, and is
              chased here until it is paid.
            </EmptyState>
          )}
        </Surface>
      </Section>
    </div>
  );
}
