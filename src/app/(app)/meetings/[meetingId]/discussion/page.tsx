import { Thread } from "@/components/thread";
import { loadMeetingWorkspace } from "@/lib/work/meeting-workspace";

export default async function MeetingDiscussionPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const { meeting, member, members } = await loadMeetingWorkspace(meetingId);

  return (
    <Thread
      subjectType="meeting"
      subjectId={meeting.id}
      title={meeting.title}
      boardYearId={meeting.boardYearId}
      viewerId={member.userId}
      members={members}
    />
  );
}
