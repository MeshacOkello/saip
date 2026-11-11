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
  Select,
  Surface,
  WorkEntry,
  WorkList,
  Textarea,
  type Tone,
} from "@/components/ui";
import { currentBoardYear } from "@/lib/board";
import { requireMember } from "@/lib/session";
import { cloneEventAction, createEventAction } from "@/lib/work/actions";
import { listEvents, pastEvents } from "@/lib/work/service";

export const metadata = { title: "Events · SAIP Board" };

const STATUS_TONE: Record<string, Tone> = {
  idea: "neutral",
  planning: "primary",
  confirmed: "secondary",
  happened: "neutral",
  cancelled: "neutral",
};

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function EventsPage() {
  const member = await requireMember();
  const year = await currentBoardYear();
  if (!year) {
    return (
      <EmptyState title="No board year yet">
        An administrator needs to create the current board year first.
      </EmptyState>
    );
  }

  const [events, earlier] = await Promise.all([
    listEvents(year.id),
    pastEvents(),
  ]);
  const canCreate = member.capabilities.has("events.create");

  const active = events
    .filter(
      (event) => event.status !== "happened" && event.status !== "cancelled",
    )
    .sort(
      (a, b) =>
        (a.startsAt?.getTime() ?? Infinity) -
        (b.startsAt?.getTime() ?? Infinity),
    );
  const archive = events.filter(
    (event) => event.status === "happened" || event.status === "cancelled",
  );

  const renderEvents = (items: typeof events) => (
    <Surface padded={false}>
      <WorkList>
        {items.map((event) => (
          <WorkEntry
            key={event.id}
            href={`/events/${event.id}`}
            date={event.startsAt}
            title={event.title}
            subtitle={[
              event.startsAt ? DATE.format(event.startsAt) : "Date to be set",
              event.location,
              event.leadName,
            ]
              .filter(Boolean)
              .join(" · ")}
            details={[
              event.checklistTotal > 0
                ? `${event.checklistDone} of ${event.checklistTotal} checklist items done`
                : null,
              event.openTasks > 0
                ? `${event.openTasks} open ${event.openTasks === 1 ? "task" : "tasks"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            status={
              <Badge tone={STATUS_TONE[event.status] ?? "neutral"}>
                {event.status === "happened" ? "Completed" : event.status}
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
        title="Events"
        actions={
          canCreate ? (
            <EditorLink id="plan-event">Plan an event</EditorLink>
          ) : undefined
        }
        description="Plan the board’s events, track the work and reuse plans from past events."
        meta={<span>{year.label}</span>}
      />

      <div className="workspace-grid">
        <div className="min-w-0 space-y-7">
          <Section title="In planning">
            {active.length ? (
              renderEvents(active)
            ) : (
              <Surface padded={false}>
                <EmptyState
                  icon={<IconCalendar />}
                  title="No events in planning"
                >
                  {canCreate
                    ? "Start with an idea, or copy the checklist from an earlier event."
                    : "New and confirmed events will appear here."}
                </EmptyState>
              </Surface>
            )}
          </Section>
          {archive.length ? (
            <Section title="Completed and cancelled">
              {renderEvents(archive)}
            </Section>
          ) : null}
        </div>

        {canCreate ? (
          <aside aria-label="Event planning" className="min-w-0 space-y-4">
            <Editor id="plan-event" title="Plan an event">
              <ActionForm action={createEventAction} submitLabel="Create event">
                <input type="hidden" name="boardYearId" value={year.id} />
                <Field label="Title">
                  <Input
                    name="title"
                    required
                    placeholder="Thanksgiving potluck"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2 min-[76rem]:grid-cols-1">
                  <Field label="Date and time">
                    <Input type="datetime-local" name="startsAt" />
                  </Field>
                  <Field label="Location">
                    <Input
                      name="location"
                      placeholder="CAF multipurpose room"
                    />
                  </Field>
                </div>
                <Field label="Summary">
                  <Textarea name="summary" rows={2} />
                </Field>
              </ActionForm>
            </Editor>

            <Editor
              id="copy-event"
              title="Copy a previous event"
              description="Start from the earlier event’s checklist, with every item unchecked."
            >
              {earlier.length > 0 ? (
                <ActionForm action={cloneEventAction} submitLabel="Copy event">
                  <input type="hidden" name="boardYearId" value={year.id} />
                  <Field label="Copy from">
                    <Select name="sourceId" required defaultValue="">
                      <option value="" disabled>
                        Choose an event
                      </option>
                      {earlier.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                          {e.startsAt ? ` — ${DATE.format(e.startsAt)}` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2 min-[76rem]:grid-cols-1">
                    <Field
                      label="New title"
                      hint="Leave empty to keep the name."
                    >
                      <Input name="title" />
                    </Field>
                    <Field label="New date">
                      <Input type="datetime-local" name="startsAt" />
                    </Field>
                  </div>
                </ActionForm>
              ) : (
                <p className="text-[14px] text-muted">
                  There are no earlier events to copy yet.
                </p>
              )}
            </Editor>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
