import Link from "next/link";

import { IconArrowLeft } from "@/components/icons";
import { RouteTabs } from "@/components/route-tabs";
import { Badge, WorkspaceHeader } from "@/components/ui";
import { loadEventWorkspace } from "@/lib/work/event-workspace";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_TONE = {
  idea: "neutral",
  planning: "primary",
  confirmed: "secondary",
  happened: "neutral",
  cancelled: "warn",
} as const;

const REGISTRATION_LABEL = {
  not_started: "Not registered",
  submitted: "Registration submitted",
  approved: "Registered",
  not_required: "Registration not required",
} as const;

export default async function EventWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { event, member } = await loadEventWorkspace(eventId);
  const base = `/events/${event.id}`;

  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/tasks`, label: "Tasks" },
    ...(member.capabilities.has("finance.view")
      ? [{ href: `${base}/budget`, label: "Budget" }]
      : []),
    { href: `${base}/discussion`, label: "Discussion" },
    { href: `${base}/wrap-up`, label: "Wrap-up" },
  ];

  return (
    <div className="space-y-7">
      <WorkspaceHeader
        back={
          <Link href="/events" className="workspace-back">
            <IconArrowLeft className="size-4" />
            All events
          </Link>
        }
        title={event.title}
        status={
          <>
            <Badge tone={STATUS_TONE[event.status]}>{event.status}</Badge>
            <Badge tone={event.registration === "approved" ? "secondary" : "warn"}>
              {REGISTRATION_LABEL[event.registration]}
            </Badge>
          </>
        }
        meta={
          <>
            <span>
              {event.startsAt ? WHEN.format(event.startsAt) : "No date set"}
            </span>
            {event.location ? <span>{event.location}</span> : null}
            {event.clonedFromId ? (
              <Link
                href={`/events/${event.clonedFromId}`}
                className="text-primary hover:underline"
              >
                Copied from an earlier event
              </Link>
            ) : null}
          </>
        }
        tabs={<RouteTabs label="Event sections" items={tabs} />}
      />
      {children}
    </div>
  );
}
