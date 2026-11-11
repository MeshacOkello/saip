import { Thread } from "@/components/thread";
import { loadEventWorkspace } from "@/lib/work/event-workspace";

export default async function EventDiscussionPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { event, member, members } = await loadEventWorkspace(eventId);

  return (
    <Thread
      subjectType="event"
      subjectId={event.id}
      title={event.title}
      boardYearId={event.boardYearId}
      viewerId={member.userId}
      members={members}
    />
  );
}
