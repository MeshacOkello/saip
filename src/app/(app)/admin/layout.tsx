import { RouteTabs } from "@/components/route-tabs";

import { EmptyState, Surface } from "@/components/ui";
import { can } from "@/lib/access";
import { requireMember } from "@/lib/session";

const TABS = [
  { href: "/admin", label: "Members", includes: "/admin/members/" },
  { href: "/admin/positions", label: "Positions" },
  { href: "/admin/transition", label: "Transition" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireMember();

  if (!can(viewer, "members.manage")) {
    return (
      <Surface padded={false}>
        <EmptyState title="Administration">
          You do not have permission to manage members. Your position does not
          decide this on its own — an administrator grants it.
        </EmptyState>
      </Surface>
    );
  }

  return (
    <div className="space-y-8">
      <RouteTabs items={TABS} label="Administration sections" />
      {children}
    </div>
  );
}
