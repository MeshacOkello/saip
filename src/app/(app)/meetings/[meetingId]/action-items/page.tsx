import { ActionForm } from "@/components/action-form";
import { IconCheck } from "@/components/icons";
import {
  Badge,
  EmptyState,
  Input,
  Item,
  Rows,
  Section,
  Select,
  StatusDot,
  Surface,
  TextLink,
} from "@/components/ui";
import { createTaskAction, updateTaskAction } from "@/lib/work/actions";
import { loadMeetingWorkspace } from "@/lib/work/meeting-workspace";

export default async function MeetingActionItemsPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const { meeting, members } = await loadMeetingWorkspace(meetingId);

  const today = new Date().toISOString().slice(0, 10);
  const open = meeting.actionItems.filter((t) => t.status !== "done");
  const done = meeting.actionItems.filter((t) => t.status === "done");

  const row = (t: (typeof meeting.actionItems)[number]) => {
    const late = t.dueOn && t.dueOn < today && t.status !== "done";
    return (
      <Item key={t.id}>
        <StatusDot tone={t.status === "done" ? "secondary" : late ? "warn" : "primary"} />
        <span
          className={`min-w-0 flex-1 text-[15px] ${
            t.status === "done" ? "text-muted line-through" : ""
          }`}
        >
          {t.title}
        </span>
        {t.assigneeName ? <Badge>{t.assigneeName}</Badge> : null}
        {t.dueOn ? <Badge tone={late ? "warn" : "neutral"}>{t.dueOn}</Badge> : null}
        <ActionForm
          action={updateTaskAction}
          submitLabel={t.status === "done" ? "Reopen" : "Complete"}
          variant="ghost"
          size="sm"
          inline
          hidden={{ taskId: t.id, status: t.status === "done" ? "todo" : "done" }}
        />
      </Item>
    );
  };

  return (
    <div className="space-y-7">
      <Section
        title={`Outstanding · ${open.length}`}
        description="Action items are ordinary tasks: they appear in the owner's own list, not only in these minutes."
        actions={<TextLink href="/tasks?all=1">All board tasks</TextLink>}
      >
        <Surface padded={false}>
          {open.length > 0 ? (
            <Rows>{open.map(row)}</Rows>
          ) : (
            <EmptyState icon={<IconCheck />} title="Nothing outstanding">
              Anything the board agreed to do belongs here, with an owner and a date.
            </EmptyState>
          )}
          <div className="border-t border-line p-4">
            <ActionForm
              action={createTaskAction}
              submitLabel="Add action item"
              variant="secondary"
              size="sm"
              hidden={{ boardYearId: meeting.boardYearId, meetingId: meeting.id }}
            >
              <div className="grid gap-2 md:grid-cols-[1fr_12rem_10rem]">
                <Input name="title" required placeholder="Book the room" />
                <Select name="assigneeUserId" defaultValue="">
                  <option value="">Assign to me</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </Select>
                <Input type="date" name="dueOn" aria-label="Due date" />
              </div>
            </ActionForm>
          </div>
        </Surface>
      </Section>

      {done.length > 0 ? (
        <Section title={`Done · ${done.length}`}>
          <Surface padded={false}>
            <Rows>{done.map(row)}</Rows>
          </Surface>
        </Section>
      ) : null}
    </div>
  );
}
