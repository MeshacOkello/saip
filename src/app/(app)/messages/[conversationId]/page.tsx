import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { ChatComposer } from "@/components/chat-composer";
import { ChatScroll } from "@/components/chat-scroll";
import { IconArrowLeft, IconChat, IconPaperclip } from "@/components/icons";
import { Avatar, EmptyState, Field, Select } from "@/components/ui";
import { assignableMembers } from "@/lib/board";
import {
  addToConversationAction,
  deleteMessageAction,
  leaveConversationAction,
  sendMessageAction,
} from "@/lib/messages/actions";
import { MAX_UPLOAD_BYTES } from "@/lib/messages/limits";
import { conversationWithMessages, markRead } from "@/lib/messages/service";
import { avatarSrc } from "@/lib/profile/service";
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

const RUN_GAP = 10 * 60 * 1000;

/** Whether `later` is the same person carrying on, rather than a new turn. */
function continues(
  earlier: { authorId: string | null; createdAt: Date } | undefined,
  later: { authorId: string | null; createdAt: Date } | undefined,
) {
  if (!earlier || !later) return false;
  if (earlier.authorId !== later.authorId) return false;
  return later.createdAt.getTime() - earlier.createdAt.getTime() < RUN_GAP;
}

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
  // In a direct message there is only one other person; labelling every bubble
  // with their name says nothing the page has not already said.
  const named = item.type !== "direct";
  const other =
    item.type === "direct"
      ? item.people.find((p) => p.userId !== member.userId)
      : undefined;

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
        <Link href="/messages" className="chat-back" aria-label="Back to chats">
          <IconArrowLeft className="size-[18px]" />
        </Link>

        {item.type === "direct" ? (
          <Avatar
            name={other?.name ?? item.title}
            size={38}
            src={avatarSrc({ userId: other?.userId, image: other?.image })}
          />
        ) : (
          <span className="chat-room" aria-hidden>
            {item.type === "channel" ? "#" : "\u25ce"}
          </span>
        )}

        <div className="min-w-0">
          <h1 className="chat-title">{item.title}</h1>
          <p className="chat-sub">
            {item.type === "direct"
              ? "Direct message"
              : item.people.map((p) => p.name.split(" ")[0]).join(", ")}
          </p>
        </div>

        <details className="menu chat-menu">
          <summary aria-label="Conversation details">Details</summary>
          <div className="menu-panel">
            <p className="menu-heading">
              {item.isPrivate ? "Private" : "Open to the board"}
            </p>
            <ul className="menu-people">
              {item.people.map((p) => (
                <li key={p.userId}>
                  <Avatar
                    name={p.name}
                    size={24}
                    src={avatarSrc({ userId: p.userId, image: p.image })}
                  />
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
                      ? "This channel stays for everyone else."
                      : "The others keep the conversation."}
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
      </header>

      <ChatScroll count={item.messages.length}>
        {item.messages.length === 0 ? (
          <EmptyState icon={<IconChat />} title="No messages yet">
            {item.type === "channel"
              ? "Start the conversation."
              : "Only the people in this conversation can read it."}
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
                  const next = day.messages[index + 1];
                  const mine = m.authorId === member.userId;
                  // A run is the same person talking without a long pause. The
                  // first of a run carries the name, the last carries the face.
                  const runOn = continues(previous, m);
                  const endsRun = !continues(m, next);
                  return (
                    <li
                      key={m.id}
                      className={[
                        mine ? "is-mine" : "is-theirs",
                        runOn ? "is-runon" : "",
                        endsRun ? "ends-run" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span className="chat-avatar">
                        {!mine && endsRun ? (
                          <Avatar
                            name={m.authorName ?? "?"}
                            size={30}
                            src={avatarSrc({
                              userId: m.authorId,
                              image: m.authorImage,
                            })}
                          />
                        ) : null}
                      </span>

                      <div className="chat-stack">
                        {!mine && !runOn && named ? (
                          <p className="chat-author">
                            {m.authorName ?? "Former member"}
                          </p>
                        ) : null}

                        <div className="chat-bubble">
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
                                    <IconPaperclip className="size-3.5" />
                                    <span className="chat-file-name">
                                      {f.filename}
                                    </span>
                                    <span>{size(f.byteSize)}</span>
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          <time
                            className="chat-time"
                            dateTime={m.createdAt.toISOString()}
                          >
                            {TIME.format(m.createdAt)}
                          </time>
                        </div>

                        {mine ? (
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
      </ChatScroll>

      <ChatComposer
        conversationId={item.id}
        action={sendMessageAction}
        placeholder="Type a message"
        maxBytes={MAX_UPLOAD_BYTES}
      />
    </div>
  );
}
