import {
  IconArrowRight,
  IconCalendar,
  IconChat,
  IconUsers,
} from "@/components/icons";
import { inbox } from "@/lib/messages/service";
import Link from "next/link";

import {
  acceptAdminTransferAction,
  resolveAdminTransferAction,
} from "@/app/(app)/admin/actions";
import { ActionForm } from "@/components/action-form";
import { Notice } from "@/components/ui";
import { pendingTransfersFor } from "@/lib/admin/queries";
import { currentBoardYear } from "@/lib/board";
import { requireMember } from "@/lib/session";
import { updateTaskAction } from "@/lib/work/actions";
import { dashboardFor } from "@/lib/work/service";

export const metadata = { title: "My workspace · SAIP Board" };

const boardTime = { timeZone: "America/New_York" };
const TODAY = new Intl.DateTimeFormat("en-US", {
  ...boardTime,
  weekday: "long",
  month: "long",
  day: "numeric",
});
const CALENDAR_DATE = new Intl.DateTimeFormat("en-US", {
  ...boardTime,
  month: "short",
  day: "numeric",
});
const DUE_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const TIME = new Intl.DateTimeFormat("en-US", {
  ...boardTime,
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export default async function DashboardPage() {
  const member = await requireMember();
  const [year, offers, conversations] = await Promise.all([
    currentBoardYear(),
    pendingTransfersFor(member.membershipId),
    inbox(member),
  ]);
  const work = year ? await dashboardFor(member.userId, year.id) : null;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const meeting = work?.nextMeeting;
  const schedule = (work?.upcoming ?? []).map((event) => ({
    href: `/events/${event.id}`,
    title: event.title,
    date: event.startsAt,
    detail: [
      event.status.charAt(0).toUpperCase() + event.status.slice(1),
      event.location,
      event.openTasks
        ? `${event.openTasks} open ${event.openTasks === 1 ? "task" : "tasks"}`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
    agenda: null as string | null,
  }));

  if (meeting) {
    schedule.push({
      href: `/meetings/${meeting.id}`,
      title: meeting.title,
      date: meeting.startsAt,
      detail: ["Board meeting", TIME.format(meeting.startsAt), meeting.location]
        .filter(Boolean)
        .join(" · "),
      agenda: meeting.agenda,
    });
  }
  schedule.sort(
    (a, b) =>
      (a.date?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (b.date?.getTime() ?? Number.MAX_SAFE_INTEGER),
  );

  return (
    <div className="board-workspace">
      <header className="home-intro">
        <div>
          <p className="home-kicker">
            SAIP · {year?.label ?? "Board workspace"}
          </p>
          <h1>{member.name.split(" ")[0]}, here’s your board.</h1>
          <time dateTime={now.toISOString()}>{TODAY.format(now)}</time>
        </div>
        <IconUsers className="home-mark" />
      </header>
      <nav className="home-actions" aria-label="Quick actions">
        {member.capabilities.has("members.manage") ? (
          <Link href="/admin#invite-member">
            <IconUsers />
            Invite officers
            <IconArrowRight />
          </Link>
        ) : (
          <Link href="/board">
            <IconUsers />
            Find an officer
            <IconArrowRight />
          </Link>
        )}
        <Link href="/messages#new-message">
          <IconChat />
          Start a conversation
          <IconArrowRight />
        </Link>
        {member.capabilities.has("events.create") ? (
          <Link href="/events#plan-event">
            <IconCalendar />
            Plan an event
            <IconArrowRight />
          </Link>
        ) : (
          <Link href="/events">
            <IconCalendar />
            Explore events
            <IconArrowRight />
          </Link>
        )}
      </nav>
      {conversations.length ? (
        <section
          className="home-conversations"
          aria-label="Recent conversations"
        >
          <div className="workspace-section-heading">
            <h2>From the board</h2>
            <Link href="/messages">Messages</Link>
          </div>
          {conversations.slice(0, 3).map((conversation) => (
            <Link
              key={conversation.id}
              href={`/messages/${conversation.id}`}
              className="home-conversation"
            >
              <IconChat />
              <span>
                <strong>{conversation.title}</strong>
                <small>{conversation.preview ?? "Open conversation"}</small>
              </span>
              {conversation.unread > 0 ? (
                <b>{conversation.unread} unread</b>
              ) : (
                <IconArrowRight />
              )}
            </Link>
          ))}
        </section>
      ) : (
        <div className="home-welcome">
          <IconChat />
          <p>
            <strong>A shared place for the work ahead.</strong> Start a
            conversation, bring your officers in, and keep this term’s plans
            together.
          </p>
        </div>
      )}

      {offers.map((offer) => (
        <Notice
          key={offer.id}
          title={`${offer.fromName} has offered you administration`}
          actions={
            <>
              <ActionForm
                action={acceptAdminTransferAction}
                submitLabel="Accept"
                size="sm"
                inline
                hidden={{ transferId: offer.id }}
              />
              <ActionForm
                action={resolveAdminTransferAction}
                submitLabel="Decline"
                variant="secondary"
                size="sm"
                inline
                hidden={{ transferId: offer.id, status: "declined" }}
              />
            </>
          }
        >
          {offer.note ? <p className="mb-1 italic">“{offer.note}”</p> : null}
          Accepting lets you invite members, appoint officers and change their
          access.
        </Notice>
      ))}

      {work ? (
        <div className="board-workspace-columns">
          <section aria-labelledby="workspace-tasks">
            <div className="workspace-section-heading">
              <h2 id="workspace-tasks">Assigned to me</h2>
              <Link href="/tasks">All tasks</Link>
            </div>
            {work.myTasks.length ? (
              <ul className="workspace-list">
                {work.myTasks.map((task) => {
                  const late = task.dueOn && task.dueOn < today;
                  return (
                    <li key={task.id} className="workspace-task">
                      <div className="min-w-0">
                        <p className="font-medium">{task.title}</p>
                        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                          {task.eventTitle ? (
                            <Link href={`/events/${task.eventId}`}>
                              {task.eventTitle}
                            </Link>
                          ) : null}
                          {task.dueOn ? (
                            <time
                              dateTime={task.dueOn}
                              className={
                                late ? "font-medium text-warn" : undefined
                              }
                            >
                              {late ? "Overdue" : "Due"}{" "}
                              {DUE_DATE.format(new Date(task.dueOn))}
                            </time>
                          ) : null}
                        </p>
                      </div>
                      <ActionForm
                        action={updateTaskAction}
                        submitLabel="Complete"
                        size="sm"
                        variant="ghost"
                        inline
                        hidden={{ taskId: task.id, status: "done" }}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="workspace-empty">
                No open assignments.{" "}
                <Link href="/tasks#add-task">Add a task</Link>
              </p>
            )}
          </section>

          <section
            className="workspace-schedule"
            aria-labelledby="workspace-schedule"
          >
            <div className="workspace-section-heading">
              <h2 id="workspace-schedule">Board schedule</h2>
              <div className="flex flex-wrap gap-x-4">
                <Link href="/events">Events</Link>
                <Link href="/meetings">Meetings</Link>
              </div>
            </div>
            {schedule.length ? (
              <ul className="workspace-list">
                {schedule.map((item) => (
                  <li key={item.href} className="workspace-schedule-row">
                    <div className="workspace-date">
                      {item.date ? (
                        <time dateTime={item.date.toISOString()}>
                          {CALENDAR_DATE.format(item.date)}
                        </time>
                      ) : (
                        "No date"
                      )}
                    </div>
                    <div className="min-w-0">
                      <Link href={item.href} className="font-medium">
                        {item.title}
                      </Link>
                      <p className="mt-1 text-xs text-muted">{item.detail}</p>
                      {item.agenda ? (
                        <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted">
                          {item.agenda}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="workspace-empty">
                No meetings or events in planning.
              </p>
            )}

            {work.recentEvents.length ? (
              <section aria-labelledby="workspace-recent" className="mt-7">
                <div className="workspace-section-heading">
                  <h2 id="workspace-recent">Recently held</h2>
                </div>
                <ul className="workspace-list">
                  {work.recentEvents.map((event) => (
                    <li key={event.id} className="workspace-recent">
                      <Link
                        href={`/events/${event.id}`}
                        className="font-medium"
                      >
                        {event.title}
                      </Link>
                      <span className="text-xs text-muted">
                        {event.turnout == null
                          ? "Turnout not recorded"
                          : `${event.turnout} attended`}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        </div>
      ) : (
        <Notice title="No board year yet">
          An administrator needs to set up the board year before you can plan
          work.
        </Notice>
      )}
    </div>
  );
}
