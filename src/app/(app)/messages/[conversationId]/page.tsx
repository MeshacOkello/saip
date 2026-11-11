import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { IconArrowLeft, IconChat } from "@/components/icons";
import { Avatar, Badge, EmptyState, Field, Select } from "@/components/ui";
import { assignableMembers } from "@/lib/board";
import {
  addToConversationAction,
  deleteMessageAction,
  leaveConversationAction,
  sendMessageAction,
} from "@/lib/messages/actions";
import { MAX_UPLOAD_BYTES } from "@/lib/messages/limits";
import { conversationWithMessages, markRead } from "@/lib/messages/service";
import { requireMember } from "@/lib/session";

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});
const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const member = await requireMember();

  let item;
  try {
    item = await conversationWithMessages(member, conversationId);
  } catch {
    notFound();
  }
  if (!item) notFound();

  await markRead(member, conversationId);
  const everyone = await assignableMembers();
  const canAdd = item.type !== "direct";
  const today = dayKey(new Date());

  // Group by day, then collapse runs from the same author within ten minutes.
  const days: { key: string; date: Date; messages: typeof item.messages }[] = [];
  for (const message of item.messages) {
    const key = dayKey(message.createdAt);
    const last = days.at(-1);
    if (last?.key === key) last.messages.push(message);
    else days.push({ key, date: message.createdAt, messages: [message] });
  }

  return (
    <div className="chat">
      <header className="chat-header">
        <Link
          href="/messages"
          className="chat-back"
          aria-label="Back to conversations"
        >
          <IconArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="chat-title">
            {item.type === "channel" ? "# " : null}
            {item.title}
          </h1>
          <p className="chat-sub">
            {item.type === "channel"
              ? "Channel · part of the board's record"
              : item.type === "group"
                ? `Private group · ${item.people.length} people`
                : "Direct message"}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="badge-hide-sm">
            <Badge tone={item.isPrivate ? "neutral" : "secondary"}>
              {item.isPrivate ? "Private" : "Kept with the board year"}
            </Badge>
          </span>
          <details className="menu">
            <summary>Details</summary>
            <div className="menu-panel">
              <p className="menu-heading">In this conversation</p>
              <ul className="menu-people">
                {item.people.map((p) => (
                  <li key={p.userId}>
                    <Avatar name={p.name} size={24} />
                    {p.name}
                  </li>
                ))}
              </ul>
              {canAdd ? (
                <>
                  <div className="menu-divider" />
                  <ActionForm
                    action={addToConversationAction}
                    submitLabel="Add"
                    variant="secondary"
                    size="sm"
                    hidden={{ conversationId: item.id }}
                  >
                    <Field label="Add someone">
                      <Select name="userId" required defaultValue="">
                        <option value="" disabled>
                          Choose a person
                        </option>
                        {everyone
                          .filter(
                            (p) => !item.people.some((x) => x.userId === p.userId),
                          )
                          .map((p) => (
                            <option key={p.userId} value={p.userId}>
                              {p.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                  </ActionForm>
                  <div className="menu-divider" />
                  <p className="menu-note">
                    {item.type === "channel"
                      ? "Leaving only hides it from your list; the messages stay part of the record."
                      : "Leaving removes you from the group. The others keep the conversation."}
                  </p>
                  <ActionForm
                    action={leaveConversationAction}
                    submitLabel="Leave conversation"
                    variant="danger"
                    size="sm"
                    hidden={{ conversationId: item.id }}
                    confirm="Leave this conversation?"
                  />
                </>
              ) : null}
            </div>
          </details>
        </div>
      </header>

      <div className="chat-scroll">
        {item.messages.length === 0 ? (
          <EmptyState icon={<IconChat />} title="No messages yet">
            {item.type === "channel"
              ? "Anything posted here is kept for future boards."
              : "Say something — only the people listed above can read this."}
          </EmptyState>
        ) : (
          days.map((day) => (
            <section key={day.key} aria-label={DAY.format(day.date)}>
              <p className="chat-day">
                <span>{day.key === today ? "Today" : DAY.format(day.date)}</span>
              </p>
              <ol className="chat-messages">
                {day.messages.map((m, index) => {
                  const previous = day.messages[index - 1];
                  const runOn =
                    previous?.authorId === m.authorId &&
                    m.createdAt.getTime() - previous.createdAt.getTime() <
                      10 * 60 * 1000;
                  return (
                    <li key={m.id} className={runOn ? "is-runon" : ""}>
                      <div className="chat-gutter">
                        {runOn ? (
                          <time dateTime={m.createdAt.toISOString()}>
                            {TIME.format(m.createdAt)}
                          </time>
                        ) : (
                          <Avatar name={m.authorName ?? "?"} size={32} />
                        )}
                      </div>
                      <div className="min-w-0">
                        {runOn ? null : (
                          <p className="chat-byline">
                            <span>{m.authorName ?? "Former member"}</span>
                            <time dateTime={m.createdAt.toISOString()}>
                              {TIME.format(m.createdAt)}
                            </time>
                          </p>
                        )}
                        {m.body ? <p className="chat-body">{m.body}</p> : null}
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
                                  <span>{size(f.byteSize)}</span>
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {m.authorId === member.userId ? (
                          <div className="chat-actions">
                            <ActionForm
                              action={deleteMessageAction}
                              submitLabel="Delete"
                              variant="ghost"
                              size="sm"
                              inline
                              hidden={{ messageId: m.id }}
                              confirm="Delete this message?"
                            />
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
      </div>

      <div className="chat-composer">
        <ActionForm
          action={sendMessageAction}
          submitLabel="Send"
          size="sm"
          hidden={{ conversationId: item.id }}
        >
          <textarea
            name="body"
            rows={2}
            placeholder={`Message ${item.title}…`}
            className="composer-input"
            aria-label="Message"
          />
          <label className="composer-attach">
            <input type="file" name="files" multiple aria-label="Attach files" />
            <span className="composer-hint">
              Images, PDFs and documents up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB
            </span>
          </label>
        </ActionForm>
      </div>
    </div>
  );
}
