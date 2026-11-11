import Link from "next/link";

import { ActionForm } from "@/components/action-form";
import { IconUsers } from "@/components/icons";
import { PrintButton } from "@/components/print-button";
import {
  Badge,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Section,
  Surface,
} from "@/components/ui";
import { boardYears, currentBoardYear } from "@/lib/board";
import { formatAmount } from "@/lib/finance/service";
import { requireMember } from "@/lib/session";
import {
  createBoardYearAction,
  makeBoardYearCurrentAction,
} from "@/lib/transition/actions";
import { handoverPackets, incomingMembers } from "@/lib/transition/service";

export const metadata = { title: "Transition · SAIP Board" };

export default async function TransitionPage() {
  const viewer = await requireMember();
  const canManage = viewer.capabilities.has("board.manage");

  const [year, years, incoming] = await Promise.all([
    currentBoardYear(),
    boardYears(),
    incomingMembers(),
  ]);
  const packets = year ? await handoverPackets(year.id) : [];

  const outstanding = packets.reduce(
    (total, packet) => total + packet.tasks.length,
    0,
  );
  const money = packets.reduce(
    (total, packet) => total + packet.money.reduce((sum, m) => sum + m.amount, 0),
    0,
  );

  return (
    <div className="space-y-7">
      <PageHeader
        title="Leadership transition"
        description="Everything a departing board owes the next one, assembled from live records rather than written by hand."
        actions={
          <PrintButton label="Print all packets" />
        }
        meta={
          <>
            <span>{year?.label ?? "No current board year"}</span>
            <span>{outstanding} open tasks across the board</span>
            {money > 0 ? <span>{formatAmount(money)} still in flight</span> : null}
          </>
        }
      />

      {!canManage ? (
        <Notice tone="warn" title="Read-only">
          You can see the packets, but creating a board year or changing which one is
          current needs permission to manage the board.
        </Notice>
      ) : null}

      <div className="workspace-grid">
        <div className="min-w-0 space-y-7">
          <Section
            title="Handover packets"
            description="One per position: what is still open, what they led, and what money has not come back."
          >
            {packets.length > 0 ? (
              <div className="space-y-4">
                {packets.map((packet) => {
                  const owed = packet.money.reduce((sum, m) => sum + m.amount, 0);
                  return (
                    <Surface key={packet.position.id}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h3 className="text-[16px] font-semibold">
                          {packet.position.name}
                        </h3>
                        <p className="flex items-center gap-3 text-[14px] text-muted">
                          {packet.holder ? packet.holder.name : "Vacant"}
                          <a
                            className="no-print text-[13px] font-medium text-primary hover:underline"
                            href={`/api/handover/${packet.position.id}${year ? `?year=${year.id}` : ""}`}
                          >
                            Download PDF
                          </a>
                        </p>
                      </div>

                      {packet.holder ? (
                        <dl className="packet-stats">
                          <div>
                            <dt>Open tasks</dt>
                            <dd>{packet.tasks.length}</dd>
                          </div>
                          <div>
                            <dt>Events led</dt>
                            <dd>{packet.events.length}</dd>
                          </div>
                          <div>
                            <dt>Money in flight</dt>
                            <dd>{owed > 0 ? formatAmount(owed) : "None"}</dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="mt-2 text-[14px] text-muted">
                          Nobody held this position this year, so there is nothing to
                          hand over.
                        </p>
                      )}

                      {packet.tasks.length > 0 ? (
                        <>
                          <p className="packet-heading">Still to do</p>
                          <ul className="packet-list">
                            {packet.tasks.map((t) => (
                              <li key={t.id}>
                                <Link href={`/tasks/${t.id}`}>{t.title}</Link>
                                <span>
                                  {t.eventTitle ? `${t.eventTitle} · ` : ""}
                                  {t.dueOn ?? "no date"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}

                      {packet.events.length > 0 ? (
                        <>
                          <p className="packet-heading">Events they led</p>
                          <ul className="packet-list">
                            {packet.events.map((e) => (
                              <li key={e.id}>
                                <Link href={`/events/${e.id}`}>{e.title}</Link>
                                <span>{e.status}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}

                      {packet.money.length > 0 ? (
                        <>
                          <p className="packet-heading">Money not yet back</p>
                          <ul className="packet-list">
                            {packet.money.map((m) => (
                              <li key={m.id}>
                                <span>{m.description}</span>
                                <span>
                                  {formatAmount(m.amount)} ·{" "}
                                  {m.status.replace(/_/g, " ")}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </Surface>
                  );
                })}
              </div>
            ) : (
              <Surface padded={false}>
                <EmptyState icon={<IconUsers />} title="No packets yet">
                  Packets appear once there is a current board year with positions.
                </EmptyState>
              </Surface>
            )}
          </Section>
        </div>

        <aside className="min-w-0 space-y-7" aria-label="Board years">
          <Section
            title="Incoming board"
            description="Members marked as incoming see what their position needs before their term starts."
          >
            <Surface padded={false}>
              {incoming.length > 0 ? (
                <ul className="ledger">
                  {incoming.map((m) => (
                    <li key={m.membershipId}>
                      <span className="ledger-main">
                        <Link
                          href={`/admin/members/${m.membershipId}`}
                          className="ledger-title hover:text-primary"
                        >
                          {m.name}
                        </Link>
                        <span className="ledger-sub">{m.email}</span>
                      </span>
                      <Badge tone="primary">incoming</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nobody is marked incoming">
                  Invite next year&rsquo;s officers as &ldquo;Incoming board&rdquo;, or
                  change a member&rsquo;s status on their page.
                </EmptyState>
              )}
            </Surface>
          </Section>

          <Section title="Board years">
            <Surface padded={false}>
              <ul className="ledger">
                {years.map((y) => (
                  <li key={y.id}>
                    <span className="ledger-main">
                      <Link
                        href={`/archive/${y.id}`}
                        className="ledger-title hover:text-primary"
                      >
                        {y.label}
                      </Link>
                      <span className="ledger-sub">
                        {y.startsOn} to {y.endsOn}
                      </span>
                    </span>
                    {y.isCurrent ? (
                      <Badge tone="secondary">Current</Badge>
                    ) : canManage ? (
                      <ActionForm
                        action={makeBoardYearCurrentAction}
                        submitLabel="Make current"
                        variant="ghost"
                        size="sm"
                        inline
                        hidden={{ boardYearId: y.id }}
                        confirm={`Make ${y.label} the current board year?`}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </Surface>
          </Section>

          {canManage ? (
            <Section
              title="Create next year"
              description="The first step of a handover. Making it current does not touch anything the old board recorded."
            >
              <Surface>
                <ActionForm
                  action={createBoardYearAction}
                  submitLabel="Create board year"
                >
                  <Field label="Label">
                    <Input name="label" required placeholder="2027/28" />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Term starts">
                      <Input type="date" name="startsOn" required />
                    </Field>
                    <Field label="Term ends">
                      <Input type="date" name="endsOn" required />
                    </Field>
                  </div>
                  <Checkbox
                    name="makeCurrent"
                    label="Make this the current board year straight away"
                  />
                </ActionForm>
              </Surface>
            </Section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
