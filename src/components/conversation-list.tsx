"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { IconChat } from "@/components/icons";
import { Avatar, Badge, EmptyState } from "@/components/ui";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

export type InboxRow = {
  id: string;
  type: string;
  title: string;
  unread: number;
  preview: string | null;
  lastMessageAt: Date | null;
};

const KIND_LABEL: Record<string, string> = {
  direct: "Direct",
  group: "Group",
  channel: "Channel",
};

export function ConversationList({
  rows,
  activeId,
}: {
  rows: InboxRow[];
  activeId?: string;
}) {
  const pathname = usePathname();
  if (rows.length === 0) {
    return (
      <EmptyState icon={<IconChat />} title="No conversations yet">
        Start a direct message, a private group, or a channel the whole board
        can see.
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/messages/${row.id}`}
            aria-current={
              (
                activeId
                  ? row.id === activeId
                  : pathname === `/messages/${row.id}`
              )
                ? "page"
                : undefined
            }
            className={`flex items-center gap-3 px-4 py-3 transition-colors ${
              (
                activeId
                  ? row.id === activeId
                  : pathname === `/messages/${row.id}`
              )
                ? "bg-primary-wash"
                : "hover:bg-surface-2"
            }`}
          >
            {row.type === "direct" ? (
              <Avatar name={row.title} size={34} />
            ) : (
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[14px] font-semibold text-muted">
                {row.type === "channel" ? "#" : "◎"}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span
                  className={`truncate text-[14px] ${
                    row.unread > 0 ? "font-semibold" : "font-medium"
                  }`}
                >
                  {row.title}
                </span>
                <span className="ml-auto shrink-0 text-[12px] text-muted">
                  {row.lastMessageAt ? WHEN.format(row.lastMessageAt) : ""}
                </span>
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <span className="truncate text-[13px] text-muted">
                  {row.preview ?? KIND_LABEL[row.type]}
                </span>
                {row.unread > 0 ? (
                  <span className="ml-auto shrink-0">
                    <Badge tone="primary">{row.unread}</Badge>
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
