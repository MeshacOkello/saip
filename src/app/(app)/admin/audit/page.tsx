import {
  Badge,
  Cell,
  EmptyState,
  PageHeader,
  Surface,
  Table,
} from "@/components/ui";
import { can } from "@/lib/access";
import { recentAudit } from "@/lib/admin/queries";
import { requireMember } from "@/lib/session";

export const metadata = { title: "Audit log · SAIP Board" };

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AuditPage() {
  const viewer = await requireMember();
  if (!can(viewer, "audit.view")) {
    return (
      <Surface padded={false}>
        <EmptyState title="Audit log">
          You do not have permission to read the audit log.
        </EmptyState>
      </Surface>
    );
  }

  const entries = await recentAudit(200);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Review recorded changes to membership, access and board administration."
        meta={<span>{entries.length} most recent</span>}
      />

      {entries.length > 0 ? (
        <Table head={["When", "Action", "By", "Details"]}>
          {entries.map((e) => (
            <tr key={e.id} className="transition-colors hover:bg-surface-2">
              <Cell className="whitespace-nowrap text-muted">
                {WHEN.format(e.createdAt)}
              </Cell>
              <Cell>
                <Badge>{e.action}</Badge>
              </Cell>
              <Cell>{e.actorName ?? "system"}</Cell>
              <Cell className="max-w-md truncate font-mono text-[12px] text-muted">
                {e.metadata ? JSON.stringify(e.metadata) : "—"}
              </Cell>
            </tr>
          ))}
        </Table>
      ) : (
        <Surface padded={false}>
          <EmptyState title="Nothing recorded yet" />
        </Surface>
      )}
    </div>
  );
}
