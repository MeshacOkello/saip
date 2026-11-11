import { notFound } from "next/navigation";

import { assignableMembers } from "@/lib/board";
import { requireMember } from "@/lib/session";
import { getEvent } from "@/lib/work/service";

/**
 * Everything an event workspace page needs, loaded the same way on every tab so the
 * header and permissions stay consistent across them.
 */
export async function loadEventWorkspace(eventId: string) {
  const member = await requireMember();
  const [event, members] = await Promise.all([
    getEvent(eventId),
    assignableMembers(),
  ]);
  if (!event || event.deletedAt) notFound();

  const canEdit =
    member.capabilities.has("events.manage") ||
    event.leadUserId === member.userId ||
    event.createdBy === member.userId;

  return { member, event, members, canEdit };
}
