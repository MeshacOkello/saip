import { IconMoney } from "@/components/icons";
import {
  Badge,
  Cell,
  EmptyState,
  Notice,
  Section,
  Surface,
  Table,
  TextLink,
} from "@/components/ui";
import { expensesForEvent, formatAmount } from "@/lib/finance/service";
import { loadEventWorkspace } from "@/lib/work/event-workspace";

const ROUTE_LABEL: Record<string, string> = {
  undecided: "Not decided",
  odus_card: "ODUS card",
  department_charge: "Department charge",
  prime_vendor: "Prime vendor",
  out_of_pocket: "Out of pocket",
};

export default async function EventBudgetPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { event, member } = await loadEventWorkspace(eventId);

  if (!member.capabilities.has("finance.view")) {
    return (
      <Surface padded={false}>
        <EmptyState icon={<IconMoney />} title="Budget">
          You do not have permission to see the board&rsquo;s finances.
        </EmptyState>
      </Surface>
    );
  }

  const spend = await expensesForEvent(event.id);
  const planned = spend.reduce((sum, e) => sum + (e.plannedAmount ?? 0), 0);
  const actual = spend.reduce((sum, e) => sum + (e.actualAmount ?? 0), 0);
  const unregistered =
    spend.length > 0 &&
    (event.registration === "not_started" || event.registration === "submitted");

  return (
    <div className="space-y-6">
      {unregistered ? (
        <Notice tone="warn" title="This event is not registered yet">
          A Concur expense report must have a matching event in MyPrincetonU, with
          dates that agree. Update the registration on the Overview tab before the
          money is committed.
        </Notice>
      ) : null}

      <Section
        title="Budget"
        description="Planned against actual. Recorded in Finances; shown here because it belongs to this event."
        actions={<TextLink href="/finances">Open finances</TextLink>}
      >
        {spend.length > 0 ? (
          <Table head={["Expense", "Category", "How it is paid", "Planned", "Actual"]}>
            {spend.map((e) => (
              <tr key={e.id} className="transition-colors hover:bg-surface-2">
                <Cell>
                  <span className="font-medium">{e.description}</span>
                  {e.vendor ? (
                    <span className="block text-[13px] text-muted">{e.vendor}</span>
                  ) : null}
                </Cell>
                <Cell>
                  <Badge
                    tone={
                      e.category === "services"
                        ? "warn"
                        : e.category === "alcohol" || e.category === "gift_cards"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {e.category.replace("_", " ")}
                  </Badge>
                </Cell>
                <Cell className="text-muted">{ROUTE_LABEL[e.route]}</Cell>
                <Cell className="text-muted">{formatAmount(e.plannedAmount)}</Cell>
                <Cell className="font-medium">{formatAmount(e.actualAmount)}</Cell>
              </tr>
            ))}
            <tr className="bg-surface-2 font-medium">
              <Cell colSpan={3}>Total</Cell>
              <Cell className="text-muted">{formatAmount(planned)}</Cell>
              <Cell>{formatAmount(actual)}</Cell>
            </tr>
          </Table>
        ) : (
          <Surface padded={false}>
            <EmptyState icon={<IconMoney />} title="Nothing budgeted yet">
              Record what this event will cost before it happens, and the actual
              afterwards. Expenses are added in Finances.
            </EmptyState>
          </Surface>
        )}
      </Section>
    </div>
  );
}
