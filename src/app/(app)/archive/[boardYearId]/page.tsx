import Link from "next/link";
import { notFound } from "next/navigation";

import { IconArrowLeft, IconCalendar, IconNotes } from "@/components/icons";
import {
  Badge,
  EmptyState,
  Section,
  Surface,
  WorkspaceHeader,
} from "@/components/ui";
import { formatAmount } from "@/lib/finance/service";
import { requireMember } from "@/lib/session";
import { archiveYear } from "@/lib/transition/service";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function ArchiveYearPage({
  params,
}: {
  params: Promise<{ boardYearId: string }>;
}) {
  const { boardYearId } = await params;
  const member = await requireMember();
  const data = await archiveYear(boardYearId);
  if (!data) notFound();

  const { year, events, meetings, decisions, officers, spend } = data;
  const canSeeMoney = member.capabilities.has("finance.view_history");
  const ran = events.filter((e) => e.status === "happened");
  const turnout = ran.reduce((sum, e) => sum + (e.turnout ?? 0), 0);

  return (
    <div className="space-y-7">
      <WorkspaceHeader
        back={
          <Link href="/archive" className="workspace-back">
            <IconArrowLeft className="size-4" />
            All board years
          </Link>
        }
        title={year.label}
        status={year.isCurrent ? <Badge tone="secondary">Current</Badge> : null}
        meta={
          <>
            <span>
              {year.startsOn} to {year.endsOn}
            </span>
            <span>{officers.length} appointments</span>
            <span>
              {ran.length} event{ran.length === 1 ? "" : "s"} run
              {turnout > 0 ? ` · ${turnout} people` : ""}
            </span>
            {canSeeMoney ? <span>{formatAmount(spend.actual)} spent</span> : null}
          </>
        }
      />

      <div className="workspace-grid">
        <div className="min-w-0 space-y-7">
          <Section
            title={`Events · ${events.length}`}
            description="What the board ran, what came of it, and what they would change."
          >
            <Surface padded={false}>
              {events.length > 0 ? (
                <ul className="ledger">
                  {events.map((e) => (
                    <li key={e.id}>
                      <span className="ledger-main">
                        <Link
                          href={`/events/${e.id}`}
                          className="ledger-title hover:text-primary"
                        >
                          {e.title}
                        </Link>
                        <span className="ledger-sub">
                          {e.startsAt ? DATE.format(e.startsAt) : "No date"}
                          {e.turnout != null ? ` · ${e.turnout} came` : ""}
                        </span>
                        {e.whatWorked || e.whatToAvoid ? (
                          <span className="archive-retro">
                            {e.whatWorked ? <em>Worked:</em> : null} {e.whatWorked}
                            {e.whatToAvoid ? (
                              <>
                                {" "}
                                <em>Avoid:</em> {e.whatToAvoid}
                              </>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      <Badge tone={e.status === "happened" ? "secondary" : "neutral"}>
                        {e.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<IconCalendar />} title="No events this year" />
              )}
            </Surface>
          </Section>

          <Section
            title={`Decisions · ${decisions.length}`}
            description="What the board committed to. The part that outlives the people who decided it."
          >
            <Surface padded={false}>
              {decisions.length > 0 ? (
                <ol className="decision-list">
                  {decisions.map((d) => (
                    <li key={d.id}>
                      <p className="decision-date">{d.decidedOn}</p>
                      <div>
                        <p className="font-semibold">{d.title}</p>
                        {d.detail ? (
                          <p className="mt-1 text-[14px] leading-relaxed text-muted">
                            {d.detail}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState icon={<IconNotes />} title="No decisions recorded" />
              )}
            </Surface>
          </Section>
        </div>

        <aside className="min-w-0 space-y-7" aria-label="Board and meetings">
          <Section title="Who held what">
            <Surface padded={false}>
              {officers.length > 0 ? (
                <ul className="ledger">
                  {officers.map((o, index) => (
                    <li key={`${o.positionName}-${index}`}>
                      <span className="ledger-main">
                        <span className="ledger-title">{o.positionName}</span>
                        <span className="ledger-sub">
                          {o.holderName}
                          {o.endedOn
                            ? ` · ended ${o.endedOn}${o.endReason ? ` (${o.endReason.replace("_", " ")})` : ""}`
                            : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No appointments recorded" />
              )}
            </Surface>
          </Section>

          <Section title={`Meetings · ${meetings.length}`}>
            <Surface padded={false}>
              {meetings.length > 0 ? (
                <ul className="ledger">
                  {meetings.map((m) => (
                    <li key={m.id}>
                      <span className="ledger-main">
                        <Link
                          href={`/meetings/${m.id}`}
                          className="ledger-title hover:text-primary"
                        >
                          {m.title}
                        </Link>
                        <span className="ledger-sub">{DATE.format(m.startsAt)}</span>
                      </span>
                      <Badge tone="neutral">{m.status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No meetings recorded" />
              )}
            </Surface>
          </Section>
        </aside>
      </div>
    </div>
  );
}
