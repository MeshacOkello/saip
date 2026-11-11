import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { Thread } from "@/components/thread";
import { IconArrowLeft } from "@/components/icons";
import {
  Badge,
  Field,
  Input,
  Section,
  Select,
  Surface,
  Textarea,
  WorkspaceHeader,
} from "@/components/ui";
import { assignableMembers } from "@/lib/board";
import { requireMember } from "@/lib/session";
import { deleteTaskAction, updateTaskAction } from "@/lib/work/actions";
import { taskById } from "@/lib/work/service";

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  doing: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const member = await requireMember();
  const [item, members] = await Promise.all([taskById(taskId), assignableMembers()]);
  if (!item || item.deletedAt) notFound();

  const canEdit =
    member.capabilities.has("tasks.assign_any") ||
    item.assigneeUserId === member.userId ||
    item.createdBy === member.userId;

  const today = new Date().toISOString().slice(0, 10);
  const late = item.dueOn && item.dueOn < today && item.status !== "done";

  return (
    <div className="space-y-7">
      <WorkspaceHeader
        back={
          <Link href="/tasks" className="workspace-back">
            <IconArrowLeft className="size-4" />
            All tasks
          </Link>
        }
        title={item.title}
        status={
          <Badge tone={item.status === "done" ? "secondary" : late ? "warn" : "primary"}>
            {STATUS_LABEL[item.status] ?? item.status}
          </Badge>
        }
        meta={
          <>
            <span>{item.assigneeName ? `Owned by ${item.assigneeName}` : "Unassigned"}</span>
            {item.dueOn ? (
              <span className={late ? "text-warn" : undefined}>Due {item.dueOn}</span>
            ) : (
              <span>No due date</span>
            )}
            {item.event ? (
              <Link href={`/events/${item.event.id}`} className="text-primary hover:underline">
                {item.event.title}
              </Link>
            ) : null}
            {item.meeting ? (
              <Link
                href={`/meetings/${item.meeting.id}/action-items`}
                className="text-primary hover:underline"
              >
                {item.meeting.title}
              </Link>
            ) : null}
          </>
        }
        actions={
          canEdit ? (
            <ActionForm
              action={updateTaskAction}
              submitLabel={item.status === "done" ? "Reopen" : "Mark complete"}
              inline
              hidden={{
                taskId: item.id,
                status: item.status === "done" ? "todo" : "done",
              }}
            />
          ) : null
        }
      />

      <div className="workspace-grid">
        <div className="min-w-0 space-y-7">
          <Section title="Detail">
            <Surface>
              {canEdit ? (
                <ActionForm
                  action={updateTaskAction}
                  submitLabel="Save"
                  variant="secondary"
                  hidden={{ taskId: item.id }}
                >
                  <Field label="Title">
                    <Input name="title" defaultValue={item.title} required />
                  </Field>
                  <Field label="Notes" hint="Context the owner will need.">
                    <Textarea name="details" rows={5} defaultValue={item.details ?? ""} />
                  </Field>
                </ActionForm>
              ) : item.details ? (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">
                  {item.details}
                </p>
              ) : (
                <p className="text-[15px] text-muted">No notes on this task.</p>
              )}
            </Surface>
          </Section>

          <Thread
            subjectType="task"
            subjectId={item.id}
            title={item.title}
            boardYearId={item.boardYearId}
            viewerId={member.userId}
            members={members}
          />
        </div>

        <aside className="min-w-0 space-y-7" aria-label="Task settings">
          {canEdit ? (
            <Section title="Assignment">
              <Surface>
                <ActionForm
                  action={updateTaskAction}
                  submitLabel="Update"
                  variant="secondary"
                  hidden={{ taskId: item.id }}
                >
                  <Field label="Owner">
                    <Select
                      name="assigneeUserId"
                      defaultValue={item.assigneeUserId ?? ""}
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Due">
                    <Input type="date" name="dueOn" defaultValue={item.dueOn ?? ""} />
                  </Field>
                  <Field label="Status">
                    <Select name="status" defaultValue={item.status}>
                      <option value="todo">To do</option>
                      <option value="doing">In progress</option>
                      <option value="done">Done</option>
                      <option value="cancelled">Cancelled</option>
                    </Select>
                  </Field>
                </ActionForm>
              </Surface>
            </Section>
          ) : null}

          <Section title="Where it came from">
            <Surface padded={false}>
              <dl className="fact-list">
                <div>
                  <dt>Created</dt>
                  <dd>{item.createdAt.toISOString().slice(0, 10)}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>
                    {item.event
                      ? "Event"
                      : item.meeting
                        ? "Meeting"
                        : item.fromMessageId
                          ? "A message"
                          : "Added directly"}
                  </dd>
                </div>
                {item.completedAt ? (
                  <div>
                    <dt>Completed</dt>
                    <dd>{item.completedAt.toISOString().slice(0, 10)}</dd>
                  </div>
                ) : null}
              </dl>
            </Surface>
          </Section>

          {canEdit ? (
            <Surface>
              <p className="mb-3 text-[13px] leading-relaxed text-muted">
                Removing a task hides it from every list. Nothing is erased.
              </p>
              <ActionForm
                action={deleteTaskAction}
                submitLabel="Remove task"
                variant="danger"
                size="sm"
                hidden={{ taskId: item.id }}
                confirm="Remove this task?"
              />
            </Surface>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
