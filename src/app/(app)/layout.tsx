import { redirect } from "next/navigation";

import { AppShell, type NavItem } from "@/components/app-shell";
import { logoSrc } from "@/lib/branding";
import { appointmentsFor } from "@/lib/board";
import { unreadTotal } from "@/lib/messages/service";
import { pendingTransfersFor } from "@/lib/admin/queries";
import { inbox as notificationInbox, unreadCount } from "@/lib/notifications/service";
import { currentBoardYear } from "@/lib/board";
import { listTasks } from "@/lib/work/service";
import type { Capability } from "@/lib/capabilities";
import { currentMember } from "@/lib/session";

const NAV: (NavItem & { capability?: Capability })[] = [
  {
    href: "/dashboard",
    label: "My workspace",
    short: "Home",
    icon: "home",
    group: "Workspace",
  },
  { href: "/messages", label: "Messages", icon: "chat", group: "Workspace" },
  {
    href: "/notifications",
    label: "Notifications",
    icon: "bell",
    group: "Workspace",
  },
  { href: "/events", label: "Events", icon: "calendar", group: "Board work" },
  { href: "/tasks", label: "Tasks", icon: "check", group: "Board work" },
  { href: "/meetings", label: "Meetings", icon: "notes", group: "Board work" },
  {
    href: "/finances",
    label: "Finances",
    icon: "money",
    group: "Board work",
    capability: "finance.view",
  },
  {
    href: "/board",
    label: "Board directory",
    icon: "users",
    group: "Organisation",
  },
  { href: "/contacts", label: "Contacts", icon: "book", group: "Organisation" },
  { href: "/archive", label: "Archive", icon: "archive", group: "Organisation" },
  {
    href: "/admin",
    label: "Administration",
    icon: "shield",
    group: "Organisation",
    capability: "members.manage",
  },
];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const member = await currentMember();
  if (!member) redirect("/sign-in");

  const [appointments, unread, offers, year, alerts, unseen] = await Promise.all([
    appointmentsFor(member.userId),
    unreadTotal(member),
    pendingTransfersFor(member.membershipId),
    currentBoardYear(),
    notificationInbox(member, { limit: 6 }),
    unreadCount(member),
  ]);

  // Everything in the header's "needs you" list is a real record, fetched here so
  // the badge and the list can never disagree.
  const today = new Date().toISOString().slice(0, 10);
  const myTasks = year
    ? await listTasks({ boardYearId: year.id, assigneeUserId: member.userId })
    : [];
  const attention = {
    unread,
    unseen,
    notifications: alerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      href: alert.href,
      read: Boolean(alert.readAt),
    })),
    overdue: myTasks
      .filter((task) => task.dueOn && task.dueOn < today)
      .slice(0, 5)
      .map((task) => ({ id: task.id, title: task.title })),
    offers: offers.map((offer) => ({ id: offer.id, from: offer.fromName })),
  };
  const held = appointments
    .filter((a) => !a.endedOn)
    .map((a) => a.positionName);

  const items = NAV.filter(
    (item) => !item.capability || member.capabilities.has(item.capability),
  ).map(({ href, label, short, icon, group }) => ({
    href,
    label,
    short,
    icon,
    group,
    ...(href === "/messages" && unread > 0 ? { badge: unread } : {}),
  }));

  return (
    <AppShell
      items={items}
      name={member.name}
      subtitle={held.length > 0 ? held.join(" · ") : "Board member"}
      logo={logoSrc()}
      attention={attention}
    >
      {children}
    </AppShell>
  );
}
