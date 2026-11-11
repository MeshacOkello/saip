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
} from "@/components/ui";
import { createTaskAction, updateTaskAction } from "@/lib/work/actions";
import { loadEventWorkspace } from "@/lib/work/event-workspace";

export default async function EventTasksPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { event, members } = await loadEventWorkspace(eventId);

  const today = new Date().toISOString().slice(0, 10);
  const open = event.tasks.filter((t) => t.status !== "done");
  const done = event.tasks.filter((t) => t.status === "done");

  const row = (t: (typeof event.tasks)[number]) => {
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
        title={`To do · ${open.length}`}
        description="Everything still outstanding for this event. These are ordinary tasks — they also show in each owner's list."
      >
        <Surface padded={false}>
          {open.length > 0 ? (
            <Rows>{open.map(row)}</Rows>
          ) : (
            <EmptyState icon={<IconCheck />} title="Nothing outstanding">
              Add what has to happen, or create a task from the discussion.
            </EmptyState>
          )}
          <div className="border-t border-line p-4">
            <ActionForm
              action={createTaskAction}
              submitLabel="Add task"
              variant="secondary"
              size="sm"
              hidden={{ boardYearId: event.boardYearId, eventId: event.id }}
            >
              <div className="grid gap-2 md:grid-cols-[1fr_12rem_10rem]">
                <Input name="title" required placeholder="Order the food" />
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
