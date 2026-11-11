import { RouteTabs } from "@/components/route-tabs";
import { IconMoney } from "@/components/icons";
import { EmptyState, Surface, WorkspaceHeader } from "@/components/ui";
import { loadFinanceWorkspace } from "@/lib/finance/workspace";

export default async function FinancesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { year, canView, canChase, canEdit } = await loadFinanceWorkspace();

  if (!canView) {
    return (
      <Surface padded={false}>
        <EmptyState icon={<IconMoney />} title="Finances">
          You do not have permission to see the board&rsquo;s finances.
        </EmptyState>
      </Surface>
    );
  }

  return (
    <div className="space-y-7">
      <WorkspaceHeader
        title="Finances"
        meta={
          <>
            <span>{year.label}</span>
            <span>
              Prime and Concur remain the official systems — nothing here asserts
              that money moved
            </span>
            {canEdit ? null : <span>Read-only for you</span>}
          </>
        }
        tabs={
          <RouteTabs
            label="Finance sections"
            items={[
              { href: "/finances", label: "Overview" },
              { href: "/finances/expenses", label: "Expenses" },
              ...(canChase
                ? [{ href: "/finances/reimbursements", label: "Reimbursements" }]
                : []),
              { href: "/finances/funding", label: "Funding" },
            ]}
          />
        }
      />
      {children}
    </div>
  );
}
