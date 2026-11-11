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
  Textarea,
} from "@/components/ui";
import {
  createFundingRequestAction,
  createFundingSourceAction,
  updateFundingRequestAction,
} from "@/lib/finance/actions";
import { formatAmount, listFunding, listSources } from "@/lib/finance/service";
import { loadFinanceWorkspace } from "@/lib/finance/workspace";
import { listEvents } from "@/lib/work/service";

export const metadata = { title: "Funding · SAIP Board" };

export default async function FundingPage() {
  const { year, canEdit } = await loadFinanceWorkspace();
  const [requests, sources, events] = await Promise.all([
    listFunding(year.id),
    listSources(),
    listEvents(year.id),
  ]);

  const requested = requests.reduce((sum, r) => sum + r.amountRequested, 0);
  const awarded = requests.reduce((sum, r) => sum + (r.amountAwarded ?? 0), 0);

  return (
    <div className="space-y-7">
      <Section
        title={`Requests · ${requests.length}`}
        description={
          requests.length > 0
            ? `${formatAmount(awarded)} awarded of ${formatAmount(requested)} asked for.`
            : "Projects Board, the Alcohol Initiative, the ODUS Conference Fund, departments and co-sponsors all go here."
        }
        actions={
          canEdit && sources.length > 0 ? (
            <EditorLink id="new-request">New request</EditorLink>
          ) : null
        }
      >
        {requests.length > 0 ? (
          <Table head={["What for", "Source", "Event", "Asked", "Awarded", "Status"]}>
            {requests.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-surface-2">
                <Cell className="font-medium">{r.title}</Cell>
                <Cell className="text-muted">{r.sourceName}</Cell>
                <Cell className="text-muted">{r.eventTitle ?? "—"}</Cell>
                <Cell className="text-muted">{formatAmount(r.amountRequested)}</Cell>
                <Cell className="font-medium">{formatAmount(r.amountAwarded)}</Cell>
                <Cell>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        r.status === "awarded"
                          ? "secondary"
                          : r.status === "declined"
                            ? "danger"
                            : "primary"
                      }
                    >
                      {r.status}
                    </Badge>
                    {canEdit && r.status === "draft" ? (
                      <ActionForm
                        action={updateFundingRequestAction}
                        submitLabel="Submitted"
                        variant="ghost"
                        size="sm"
                        inline
                        hidden={{ requestId: r.id, status: "submitted" }}
                      />
                    ) : null}
                    {canEdit && r.status === "submitted" ? (
                      <ActionForm
                        action={updateFundingRequestAction}
                        submitLabel="Awarded"
                        variant="ghost"
                        size="sm"
                        inline
                        hidden={{ requestId: r.id, status: "awarded" }}
                      />
                    ) : null}
                  </span>
                </Cell>
              </tr>
            ))}
          </Table>
        ) : (
          <Surface padded={false}>
            <EmptyState icon={<IconMoney />} title="No funding requests yet">
              Record what you asked for, from whom, and what came back — so next
              year&rsquo;s board knows which doors actually open.
            </EmptyState>
          </Surface>
        )}
      </Section>

      <Section
        title={`Funding sources · ${sources.length}`}
        description="Where SAIP's money can come from, with the deadlines nobody should have to rediscover."
        actions={canEdit ? <EditorLink id="new-source">Add source</EditorLink> : null}
      >
        <Surface padded={false}>
          {sources.length > 0 ? (
            <ul className="ledger">
              {sources.map((s) => (
                <li key={s.id}>
                  <span className="ledger-main">
                    <span className="ledger-title">{s.name}</span>
                    {s.deadlines ? (
                      <span className="ledger-sub">{s.deadlines}</span>
                    ) : null}
                  </span>
                  <Badge tone="neutral">{s.kind.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<IconMoney />} title="No sources yet">
              Seeded sources appear here after running the database seed.
            </EmptyState>
          )}
        </Surface>
      </Section>

      {canEdit ? (
        <>
          <Editor id="new-request" title="New funding request">
            <ActionForm
              action={createFundingRequestAction}
              submitLabel="Record request"
            >
              <input type="hidden" name="boardYearId" value={year.id} />
              <Field label="What for">
                <Input name="title" required placeholder="Afrobeats night" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Source">
                  <Select name="sourceId" required defaultValue="">
                    <option value="" disabled>
                      Choose a source
                    </option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Amount">
                  <Input name="amountRequested" required placeholder="$1,200" />
                </Field>
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
              </div>
            </ActionForm>
          </Editor>

          <Editor id="new-source" title="Add a funding source">
            <ActionForm action={createFundingSourceAction} submitLabel="Add source">
              <Field label="Name">
                <Input name="name" required placeholder="Projects Board" />
              </Field>
              <Field label="Kind">
                <Select name="kind" defaultValue="projects_board">
                  <option value="projects_board">Projects Board</option>
                  <option value="alcohol_initiative">Alcohol Initiative</option>
                  <option value="conference_fund">ODUS Conference Fund</option>
                  <option value="department">Department</option>
                  <option value="safe">SAFE award</option>
                  <option value="co_sponsor">Co-sponsor</option>
                  <option value="donation">Donation</option>
                  <option value="own_funds">Our own funds</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field
                label="Deadlines and lead times"
                hint="So nobody has to rediscover them next year."
              >
                <Textarea name="deadlines" rows={3} />
              </Field>
            </ActionForm>
          </Editor>
        </>
      ) : null}
    </div>
  );
}
