import { ActionForm } from "@/components/action-form";
import { Avatar, Input, Section, Select, Surface, Textarea } from "@/components/ui";
import {
  decisionFromMessageAction,
  postMessageAction,
  taskFromMessageAction,
} from "@/lib/work/actions";
import { MAX_UPLOAD_BYTES } from "@/lib/messages/limits";
import { ensureThread, messagesIn } from "@/lib/work/service";

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * A conversation attached to an event, task or meeting.
 *
 * This is what a group chat cannot do: the discussion sits on the thing it is about,
 * and a message can become a task or a recorded decision without leaving it.
 */
export async function Thread({
  subjectType,
  subjectId,
  title,
  boardYearId,
  viewerId,
  members,
}: {
  subjectType: "event" | "task" | "meeting";
  subjectId: string;
  title: string;
  boardYearId: string;
  viewerId: string;
  members: { userId: string; name: string }[];
}) {
  const conversation = await ensureThread({
    subjectType,
    subjectId,
    title,
    boardYearId,
    createdBy: viewerId,
  });
  const messages = await messagesIn(conversation.id);

  return (
    <Section
      title="Discussion"
      description="Anything settled here can become a task or a recorded decision — that is what keeps it out of the group chat."
    >
      <Surface>
        <ol className="space-y-6">
          {messages.map((m) => (
            <li key={m.id} className="flex gap-3.5">
              <Avatar name={m.authorName ?? "?"} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-muted">
                  <span className="font-medium text-ink">
                    {m.authorName ?? "Former member"}
                  </span>{" "}
                  · {WHEN.format(m.createdAt)}
                </p>
                {m.body ? (
                  <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">
                    {m.body}
                  </p>
                ) : null}

                {m.files.length > 0 ? (
                  <ul className="chat-files">
                    {m.files.map((f) => (
                      <li key={f.id}>
                        <a
                          href={`/api/files/${f.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {f.filename}
                          <span>{fileSize(f.byteSize)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <details className="group mt-1.5">
                  <summary className="inline-flex cursor-pointer list-none text-[13px] text-muted transition-colors hover:text-primary">
                    <span className="group-open:hidden">Turn into…</span>
                    <span className="hidden group-open:inline">Close</span>
                  </summary>
                  <div className="mt-3 grid gap-5 rounded-lg bg-surface-2 p-4 lg:grid-cols-2">
                    <ActionForm
                      action={taskFromMessageAction}
                      submitLabel="Create task"
                      variant="secondary"
                      size="sm"
                      hidden={{ messageId: m.id, boardYearId }}
                    >
                      <Input
                        name="title"
                        placeholder="Task title"
                        defaultValue={m.body.slice(0, 80)}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Select name="assigneeUserId" defaultValue="">
                          <option value="">Assign to me</option>
                          {members.map((member) => (
                            <option key={member.userId} value={member.userId}>
                              {member.name}
                            </option>
                          ))}
                        </Select>
                        <Input type="date" name="dueOn" />
                      </div>
                    </ActionForm>

                    <ActionForm
                      action={decisionFromMessageAction}
                      submitLabel="Record as decision"
                      variant="secondary"
                      size="sm"
                      hidden={{ messageId: m.id, boardYearId }}
                    >
                      <Input
                        name="title"
                        placeholder="What was decided"
                        defaultValue={m.body.slice(0, 80)}
                      />
                      <p className="text-[13px] leading-relaxed text-muted">
                        Decisions carry into the archive. Ordinary messages are just
                        conversation.
                      </p>
                    </ActionForm>
                  </div>
                </details>
              </div>
            </li>
          ))}

          {messages.length === 0 ? (
            <li className="text-[14px] text-muted">
              Nothing here yet. Start the conversation where the work is.
            </li>
          ) : null}
        </ol>

        <div className="mt-6 border-t border-line pt-5">
          <ActionForm
            action={postMessageAction}
            submitLabel="Post"
            hidden={{ conversationId: conversation.id }}
          >
            <Textarea name="body" rows={3} placeholder="Write a message…" />
            <label className="composer-attach">
              <input type="file" name="files" multiple aria-label="Attach files" />
              <span className="composer-hint">
                Images, PDFs and documents up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB
              </span>
            </label>
          </ActionForm>
        </div>
      </Surface>
    </Section>
  );
}
