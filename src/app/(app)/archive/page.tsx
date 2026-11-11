import Link from "next/link";

import { IconNotes } from "@/components/icons";
import {
  Badge,
  Cell,
  EmptyState,
  PageHeader,
  Surface,
  Table,
} from "@/components/ui";
import { formatAmount } from "@/lib/finance/service";
import { requireMember } from "@/lib/session";
import { archiveIndex } from "@/lib/transition/service";

export const metadata = { title: "Archive · SAIP Board" };

export default async function ArchivePage() {
  await requireMember();
  const years = await archiveIndex();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organisation"
        title="Archive"
        description="Past board years. Everything stays here when a term ends."
        meta={
          <span>
            {years.length} board year{years.length === 1 ? "" : "s"}
          </span>
        }
      />

      {years.length > 0 ? (
        <Table head={["Board year", "Term", "Officers", "Events", "Meetings", "Spent"]}>
          {years.map((y) => (
            <tr key={y.id} className="transition-colors hover:bg-surface-2">
              <Cell>
                <Link
                  href={`/archive/${y.id}`}
                  className="font-medium hover:text-primary"
                >
                  {y.label}
                </Link>
                {y.isCurrent ? (
                  <span className="ml-2">
                    <Badge tone="secondary">Current</Badge>
                  </span>
                ) : null}
              </Cell>
              <Cell className="whitespace-nowrap text-muted">
                {y.startsOn} to {y.endsOn}
              </Cell>
              <Cell className="text-muted">{y.officers}</Cell>
              <Cell className="text-muted">{y.events}</Cell>
              <Cell className="text-muted">{y.meetings}</Cell>
              <Cell className="text-muted">{formatAmount(y.spend)}</Cell>
            </tr>
          ))}
        </Table>
      ) : (
        <Surface padded={false}>
          <EmptyState icon={<IconNotes />} title="No board years yet">
            An administrator creates the first board year in Administration.
          </EmptyState>
        </Surface>
      )}
    </div>
  );
}
