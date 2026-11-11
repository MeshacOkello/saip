import { notFound } from "next/navigation";

import { assignableMembers } from "@/lib/board";
import { requireMember } from "@/lib/session";
import { getMeeting } from "@/lib/work/service";

/** Shared loading for every tab of a meeting, so the header never disagrees. */
export async function loadMeetingWorkspace(meetingId: string) {
  const member = await requireMember();
  const [meeting, members] = await Promise.all([
    getMeeting(meetingId),
    assignableMembers(),
  ]);
  if (!meeting || meeting.deletedAt) notFound();

  const canManage = member.capabilities.has("meetings.manage");
  const present = new Set(
    meeting.attendance.filter((a) => a.present).map((a) => a.userId),
  );

  return { member, meeting, members, canManage, present };
}

/** Agenda text is one item per line; blank lines are ignored. */
export function agendaItems(agenda: string | null) {
  return (agenda ?? "")
    .split("\n")
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);
}
