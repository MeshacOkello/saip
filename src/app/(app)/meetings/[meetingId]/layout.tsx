import Link from "next/link";

import { IconArrowLeft } from "@/components/icons";
import { RouteTabs } from "@/components/route-tabs";
import { Badge, WorkspaceHeader } from "@/components/ui";
import { loadMeetingWorkspace } from "@/lib/work/meeting-workspace";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function MeetingWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const { meeting, members, present } = await loadMeetingWorkspace(meetingId);
  const base = `/meetings/${meeting.id}`;
  const openItems = meeting.actionItems.filter((t) => t.status !== "done").length;

  return (
    <div className="space-y-7">
      <WorkspaceHeader
        back={
          <Link href="/meetings" className="workspace-back">
            <IconArrowLeft className="size-4" />
            All meetings
          </Link>
        }
        title={meeting.title}
        status={
          <Badge tone={meeting.status === "held" ? "secondary" : "primary"}>
            {meeting.status}
          </Badge>
        }
        meta={
          <>
            <span>{WHEN.format(meeting.startsAt)}</span>
            {meeting.location ? <span>{meeting.location}</span> : null}
            <span>
              {present.size} of {members.length} present
            </span>
          </>
        }
        tabs={
          <RouteTabs
            label="Meeting sections"
            items={[
              { href: base, label: "Agenda & minutes" },
              {
                href: `${base}/action-items`,
                label: openItems > 0 ? `Action items · ${openItems}` : "Action items",
              },
              { href: `${base}/decisions`, label: "Decisions" },
              { href: `${base}/discussion`, label: "Discussion" },
            ]}
          />
        }
      />
      {children}
    </div>
  );
}
