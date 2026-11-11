import Link from "next/link";

import { ActionForm } from "@/components/action-form";
import { IconMoney } from "@/components/icons";
import {
  Badge,
  EmptyState,
  Field,
  Input,
  Notice,
  Section,
  Select,
  Surface,
  TextLink,
} from "@/components/ui";
import { recordBalanceAction } from "@/lib/finance/actions";
import {
  REIMBURSEMENT_POLICY_NOTE,
  REIMBURSEMENT_WINDOW_DAYS,
  financeSummary,
  formatAmount,
  latestBalances,
  outstandingReimbursements,
  policyWarnings,
} from "@/lib/finance/service";
import { loadFinanceWorkspace } from "@/lib/finance/workspace";

export const metadata = { title: "Finances · SAIP Board" };

export default async function FinancesOverviewPage() {
  const { year, canEdit } = await loadFinanceWorkspace();

  const [summary, balances, claims, warnings] = await Promise.all([
    financeSummary(year.id),
    latestBalances(year.id),
    outstandingReimbursements(year.id),
    policyWarnings(year.id),
  ]);

  const drift =
    balances.prime && balances.estimate
      ? balances.estimate.amount - balances.prime.amount
      : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-7">
      <section className="balance-row" aria-label="Balances">
        <article className="balance-card is-official">
          <p className="balance-label">
            Prime balance
            <Badge tone="secondary">Official</Badge>
          </p>
          <p className="balance-figure">
            {balances.prime ? formatAmount(balances.prime.amount) : "Not recorded"}
          </p>
          <p className="balance-note">
            {balances.prime
              ? `From the Spendable Balance Report, ${balances.prime.asOf}`
              : "Read it from Prime and record it here"}
          </p>
        </article>

        <article className="balance-card is-estimate">
          <p className="balance-label">
            Our estimate
            <Badge tone="warn">Unconfirmed</Badge>
          </p>
          <p className="balance-figure">
            {balances.estimate
              ? formatAmount(balances.estimate.amount)
              : "Not recorded"}
          </p>
          <p className="balance-note">
            {drift != null
              ? drift === 0
                ? "Matches Prime"
                : `${formatAmount(Math.abs(drift))} ${drift > 0 ? "above" : "below"} Prime`
              : "Never added to the Prime figure"}
          </p>
        </article>

        <article className="balance-card">
          <p className="balance-label">Spent this year</p>
          <p className="balance-figure">{formatAmount(summary.totals.actual)}</p>
          <p className="balance-note">
            {formatAmount(summary.totals.planned)} planned across{" "}
            {summary.totals.count} expense{summary.totals.count === 1 ? "" : "s"}
          </p>
        </article>

        <article className="balance-card">
          <p className="balance-label">Owed to members</p>
          <p className="balance-figure">{formatAmount(summary.owed.total)}</p>
          <p className="balance-note">
            {summary.owed.count > 0 ? (
              <TextLink href="/finances/reimbursements">
                {summary.owed.count} claim{summary.owed.count === 1 ? "" : "s"} open
              </TextLink>
            ) : (
              "Nobody is waiting on money"
            )}
          </p>
        </article>
      </section>

      {warnings.stale.length > 0 ? (
        <Notice
          tone="warn"
          title={`${warnings.stale.length} purchase${warnings.stale.length === 1 ? "" : "s"} not yet filed in Concur`}
        >
          <ul className="mb-2 space-y-1">
            {warnings.stale.map((s) => (
              <li key={s.id}>
                {s.claimantName} · {s.description} · {formatAmount(s.amount)} · bought{" "}
                {s.purchasedOn}
              </li>
            ))}
          </ul>
          Nudging at {REIMBURSEMENT_WINDOW_DAYS} days. {REIMBURSEMENT_POLICY_NOTE}
        </Notice>
      ) : null}

      {warnings.unregistered.length > 0 ? (
        <Notice tone="warn" title="Spending against an event that is not registered">
          A Concur expense report must have a matching event in MyPrincetonU, and the
          dates must agree.
          <ul className="mt-2 space-y-1">
            {warnings.unregistered.map((w) => (
              <li key={w.id}>
                <Link href={`/events/${w.eventId}`} className="text-primary">
                  {w.eventTitle}
                </Link>{" "}
                — {w.description} ({w.registration.replace("_", " ")})
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="workspace-grid">
        <Section
          title="Needs attention"
          description="Claims waiting on somebody, oldest purchase first."
          actions={<TextLink href="/finances/reimbursements">All claims</TextLink>}
        >
          <Surface padded={false}>
            {claims.length > 0 ? (
              <ul className="ledger">
                {claims.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <span className="ledger-main">
                      <span className="ledger-title">{c.description}</span>
                      <span className="ledger-sub">
                        {c.claimantName} · bought {c.purchasedOn}
                      </span>
                    </span>
                    <span className="ledger-amount">{formatAmount(c.amount)}</span>
                    <Badge tone={c.late ? "danger" : "primary"}>
                      {c.late ? "Overdue to file" : c.status.replace(/_/g, " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<IconMoney />} title="Nobody is waiting on money">
                When a member pays out of pocket, a claim opens here automatically and
                is chased until it is paid.
              </EmptyState>
            )}
          </Surface>
        </Section>

        <aside className="min-w-0 space-y-7" aria-label="Record a balance">
          {canEdit ? (
            <Section
              title="Record a balance"
              description="A figure read from Prime and one we worked out are stored and shown separately."
            >
              <Surface>
                <ActionForm action={recordBalanceAction} submitLabel="Record">
                  <input type="hidden" name="boardYearId" value={year.id} />
                  <Field label="Amount">
                    <Input name="amount" required placeholder="$2,629" />
                  </Field>
                  <Field label="Where it came from">
                    <Select name="provenance" defaultValue="prime">
                      <option value="prime">Prime — Spendable Balance Report</option>
                      <option value="internal_estimate">Our own estimate</option>
                    </Select>
                  </Field>
                  <Field label="As of">
                    <Input type="date" name="asOf" defaultValue={today} />
                  </Field>
                </ActionForm>
              </Surface>
            </Section>
          ) : null}

          {balances.history.length > 0 ? (
            <Section title="Recent readings">
              <Surface padded={false}>
                <ul className="ledger">
                  {balances.history.slice(0, 6).map((b) => (
                    <li key={b.id}>
                      <span className="ledger-main">
                        <span className="ledger-title">{b.asOf}</span>
                        <span className="ledger-sub">
                          {b.provenance === "prime" ? "Prime" : "Estimate"}
                        </span>
                      </span>
                      <span className="ledger-amount">{formatAmount(b.amount)}</span>
                    </li>
                  ))}
                </ul>
              </Surface>
            </Section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
