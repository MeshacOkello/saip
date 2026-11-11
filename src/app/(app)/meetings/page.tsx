import { IconCalendar } from "@/components/icons";
import { ActionForm } from "@/components/action-form";
import { EditorLink } from "@/components/editor-link";
import {
  Badge,
  Editor,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Section,
  Surface,
  WorkEntry,
  WorkList,
  Textarea,
} from "@/components/ui";
import { currentBoardYear } from "@/lib/board";
import { requireMember } from "@/lib/session";
import { createMeetingAction } from "@/lib/work/actions";
import { listMeetings } from "@/lib/work/service";

export const metadata = { title: "Meetings · SAIP Board" };

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function MeetingsPage() {
  const member = await requireMember();
  const year = await currentBoardYear();
  if (!year) {
    return (
      <EmptyState title="No board year yet">
        An administrator needs to create the current board year first.
      </EmptyState>
    );
  }

  const meetings = await listMeetings(year.id);
  const canManage = member.capabilities.has("meetings.manage");

  const now = new Date();
  const upcoming = meetings
    .filter(
      (meeting) => meeting.startsAt >= now && meeting.status === "scheduled",
    )
    .reverse();
  const upcomingIds = new Set(upcoming.map((meeting) => meeting.id));
  const records = meetings.filter((meeting) => !upcomingIds.has(meeting.id));

  const renderMeetings = (items: typeof meetings) => (
    <Surface padded={false}>
      <WorkList>
        {items.map((meeting) => (
          <WorkEntry
            key={meeting.id}
            href={`/meetings/${meeting.id}`}
            date={meeting.startsAt}
            title={meeting.title}
            subtitle={[DATE_TIME.format(meeting.startsAt), meeting.location]
              .filter(Boolean)
              .join(" · ")}
            details={
              meeting.actionItems > 0
                ? `${meeting.actionItems} action ${meeting.actionItems === 1 ? "item" : "items"}`
                : undefined
            }
            status={
              <Badge tone={meeting.hasMinutes ? "secondary" : "neutral"}>
                {meeting.hasMinutes
                  ? "Minutes ready"
                  : upcomingIds.has(meeting.id)
                    ? "Scheduled"
                    : "No minutes"}
              </Badge>
            }
          />
        ))}
      </WorkList>
    </Surface>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Board work"
        title="Meetings"
        description="See what’s coming up and find agendas, minutes and decisions from earlier meetings."
        meta={<span>{year.label}</span>}
        actions={
          canManage ? (
            <EditorLink id="schedule-meeting">Schedule a meeting</EditorLink>
          ) : undefined
        }
      />

      <div className="workspace-grid">
        <div className="min-w-0 space-y-7">
          <Section title="Coming up">
            {upcoming.length ? (
              renderMeetings(upcoming)
            ) : (
              <Surface padded={false}>
                <EmptyState
                  icon={<IconCalendar />}
                  title="No upcoming meetings"
                >
                  {canManage
                    ? "Schedule a meeting to share the time, location and agenda with the board."
                    : "The next meeting will appear here once it’s scheduled."}
                </EmptyState>
              </Surface>
            )}
          </Section>
          {records.length ? (
            <Section title="Meeting records">{renderMeetings(records)}</Section>
          ) : null}
        </div>

        {canManage ? (
          <aside aria-label="Schedule a meeting" className="min-w-0">
            <Editor id="schedule-meeting" title="Schedule a meeting">
              <ActionForm
                action={createMeetingAction}
                submitLabel="Schedule meeting"
              >
                <input type="hidden" name="boardYearId" value={year.id} />
                <div className="grid gap-4 sm:grid-cols-3 min-[76rem]:grid-cols-1">
                  <Field label="Title">
                    <Input name="title" required placeholder="Board meeting" />
                  </Field>
                  <Field label="Date and time">
                    <Input type="datetime-local" name="startsAt" required />
                  </Field>
                  <Field label="Location">
                    <Input name="location" placeholder="Frist 302" />
                  </Field>
                </div>
                <Field label="Agenda" hint="One item per line. Editable later.">
                  <Textarea name="agenda" rows={4} />
                </Field>
              </ActionForm>
            </Editor>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
