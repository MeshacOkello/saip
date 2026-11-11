"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { IconPlus, IconSearch } from "@/components/icons";
import { Avatar } from "@/components/ui";

const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export type InboxRow = {
  id: string;
  type: string;
  title: string;
  unread: number;
  preview: string | null;
  lastMessageAt: Date | null;
  otherUserId?: string | null;
  otherImage?: string | null;
};

const KIND_LABEL: Record<string, string> = {
  direct: "Direct message",
  group: "Private group",
  channel: "Channel",
};

/** Today shows a time; anything older shows a date. Same as every inbox. */
function when(date: Date | null) {
  if (!date) return "";
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  return sameDay ? TIME.format(date) : DAY.format(date);
}

export function ConversationList({
  rows,
  activeId,
}: {
  rows: InboxRow[];
  activeId?: string;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        (row.preview ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const isActive = (id: string) =>
    activeId ? id === activeId : pathname === `/messages/${id}`;

  return (
    <aside className="chat-list" aria-label="Conversations">
      <header className="chat-list-head">
        <h2>Chats</h2>
        <Link
          href="/messages#new-message"
          className="chat-new"
          aria-label="Start a new conversation"
        >
          <IconPlus className="size-[18px]" />
        </Link>
      </header>

      <div className="chat-search">
        <IconSearch className="size-4" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search conversations"
          aria-label="Search conversations"
        />
      </div>

      <div className="chat-list-scroll">
        {shown.length === 0 ? (
          <p className="chat-list-empty">
            {rows.length === 0
              ? "No conversations yet."
              : `Nothing matching “${query.trim()}”.`}
          </p>
        ) : (
          <ul>
            {shown.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/messages/${row.id}`}
                  aria-current={isActive(row.id) ? "page" : undefined}
                  className={`chat-row${isActive(row.id) ? " is-active" : ""}${
                    row.unread > 0 ? " is-unread" : ""
                  }`}
                >
                  {row.type === "direct" ? (
                    <Avatar
                      name={row.title}
                      size={40}
                      src={
                        row.otherImage && row.otherUserId
                          ? row.otherImage.startsWith("http")
                            ? row.otherImage
                            : `/api/avatar/${row.otherUserId}`
                          : null
                      }
                    />
                  ) : (
                    <span className="chat-room" aria-hidden>
                      {row.type === "channel" ? "#" : "◎"}
                    </span>
                  )}

                  <span className="chat-row-body">
                    <span className="chat-row-top">
                      <span className="chat-row-title">{row.title}</span>
                      <span className="chat-row-when">
                        {when(row.lastMessageAt)}
                      </span>
                    </span>
                    <span className="chat-row-bottom">
                      <span className="chat-row-preview">
                        {row.preview ?? KIND_LABEL[row.type]}
                      </span>
                      {row.unread > 0 ? (
                        <span className="chat-row-unread">
                          {row.unread > 99 ? "99+" : row.unread}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
