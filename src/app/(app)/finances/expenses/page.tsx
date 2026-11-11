import Link from "next/link";

import { ActionForm } from "@/components/action-form";
import { EditorLink } from "@/components/editor-link";
import { IconMoney } from "@/components/icons";
import {
  Badge,
  Cell,
  Editor,
  EmptyState,
  Field,
  Input,
  Section,
  Select,
  Surface,
  Table,
} from "@/components/ui";
import { assignableMembers } from "@/lib/board";
import { createExpenseAction } from "@/lib/finance/actions";
import { formatAmount, listExpenses } from "@/lib/finance/service";
import { loadFinanceWorkspace } from "@/lib/finance/workspace";
import { listEvents } from "@/lib/work/service";

export const metadata = { title: "Expenses · SAIP Board" };

const ROUTE_LABEL: Record<string, string> = {
  undecided: "Not decided",
  odus_card: "ODUS card",
  department_charge: "Department charge",
  prime_vendor: "Prime vendor",
  out_of_pocket: "Out of pocket",
};

export default async function ExpensesPage() {
  const { year, canEdit } = await loadFinanceWorkspace();
  const [expenses, events, members] = await Promise.all([
    listExpenses(year.id),
    listEvents(year.id),
    assignableMembers(),
  ]);

  const planned = expenses.reduce((sum, e) => sum + (e.plannedAmount ?? 0), 0);
  const actual = expenses.reduce((sum, e) => sum + (e.actualAmount ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <Section
        title={`Expenses · ${expenses.length}`}
        description="Planned against actual. The gap is the part a budget normally hides."
        actions={canEdit ? <EditorLink id="new-expense">Record expense</EditorLink> : null}
      >
        {expenses.length > 0 ? (
          <Table
            head={["Expense", "Event", "Category", "How it is paid", "Planned", "Actual"]}
          >
            {expenses.map((e) => (
              <tr key={e.id} className="transition-colors hover:bg-surface-2">
                <Cell>
                  <span className="font-medium">{e.description}</span>
                  {e.vendor ? (
                    <span className="block text-[13px] text-muted">{e.vendor}</span>
                  ) : null}
                </Cell>
                <Cell className="text-muted">
                  {e.eventTitle ? (
                    <Link href={`/events/${e.eventId}/budget`} className="hover:text-primary">
                      {e.eventTitle}
                    </Link>
                  ) : (
                    "—"
                  )}
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
              <Cell colSpan={4}>Total</Cell>
              <Cell className="text-muted">{formatAmount(planned)}</Cell>
              <Cell>{formatAmount(actual)}</Cell>
            </tr>
          </Table>
        ) : (
          <Surface padded={false}>
            <EmptyState icon={<IconMoney />} title="Nothing recorded yet">
              Record what an event will cost before it happens, and the actual
              afterwards.
            </EmptyState>
          </Surface>
        )}
      </Section>

      {canEdit ? (
        <Editor
          id="new-expense"
          title="Record an expense"
          description="Out of pocket opens a reimbursement claim straight away. Services, alcohol and gift cards are refused, with the policy reason."
        >
          <ActionForm action={createExpenseAction} submitLabel="Record expense">
            <input type="hidden" name="boardYearId" value={year.id} />
            <Field label="What it is">
              <Input
                name="description"
                required
                placeholder="Jollof, two pans — Five Loaves"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Event">
                <Select name="eventId" defaultValue="">
                  <option value="">Not tied to an event</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Category">
                <Select name="category" defaultValue="food">
                  <option value="food">Food</option>
                  <option value="venue">Venue</option>
                  <option value="supplies">Supplies</option>
                  <option value="printing">Printing</option>
                  <option value="transport">Transport</option>
                  <option value="services">Services (DJ, photographer)</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Planned">
                <Input name="plannedAmount" placeholder="$150" />
              </Field>
              <Field label="Actual">
                <Input name="actualAmount" placeholder="$163.40" />
              </Field>
              <Field
                label="How it is paid"
                hint="The ODUS card exists so members need not front money."
              >
                <Select name="route" defaultValue="undecided">
                  <option value="undecided">Not decided</option>
                  <option value="odus_card">ODUS credit card</option>
                  <option value="department_charge">Department charge</option>
                  <option value="prime_vendor">Vendor paid through Prime</option>
                  <option value="out_of_pocket">Member out of pocket</option>
                </Select>
              </Field>
              <Field label="Paid by" hint="Needed for an out-of-pocket claim.">
                <Select name="paidByUserId" defaultValue="">
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Vendor">
                <Input name="vendor" placeholder="Five Loaves" />
              </Field>
              <Field label="Date">
                <Input type="date" name="incurredOn" defaultValue={today} />
              </Field>
            </div>
          </ActionForm>
        </Editor>
      ) : null}
    </div>
  );
}
