import { IconUsers } from "@/components/icons";
import {
  Avatar,
  Badge,
  EmptyState,
  PageHeader,
  Section,
  Surface,
} from "@/components/ui";
import { currentBoardYear, roster } from "@/lib/board";
import { requireMember } from "@/lib/session";

export const metadata = { title: "Board directory · SAIP Board" };

export default async function BoardPage() {
  await requireMember();
  const year = await currentBoardYear();
  const seats = year ? await roster(year.id) : [];
  const filled = seats.filter((seat) => seat.holderId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Organisation"
        title="Board directory"
        description="Find the person responsible for each area of the board."
        meta={
          <>
            <span>{year?.label ?? "Board year not set"}</span>
            {year ? (
              <span>
                {filled.length} of {seats.length} positions filled
              </span>
            ) : null}
          </>
        }
      />
      {seats.length ? (
        <Section title="Board positions">
          <Surface padded={false}>
            <ul className="divide-y divide-line">
              {seats.map((seat) => (
                <li
                  key={seat.positionId}
                  className="grid items-start gap-3 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_auto] xl:gap-5"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    {seat.holderName ? (
                      <Avatar name={seat.holderName} size={44} />
                    ) : (
                      <span className="inline-grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
                        <IconUsers />
                      </span>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-semibold">{seat.positionName}</h3>
                      <p className="mt-0.5 text-sm text-ink-2">
                        {seat.holderName ?? "No one appointed"}
                      </p>
                      {seat.holderEmail ? (
                        <a
                          className="text-xs font-medium text-primary hover:underline"
                          href={`mailto:${seat.holderEmail}`}
                        >
                          {seat.holderEmail}
                        </a>
                      ) : null}
                    </div>
                  </div>
                  {seat.description ? (
                    <p className="text-sm text-muted xl:pt-1">
                      {seat.description}
                    </p>
                  ) : (
                    <span className="hidden xl:block" />
                  )}
                  <div>
                    {seat.holderId ? (
                      <Badge
                        tone={
                          seat.membershipStatus === "active"
                            ? "secondary"
                            : "neutral"
                        }
                      >
                        {seat.membershipStatus ?? "Appointed"}
                      </Badge>
                    ) : (
                      <Badge tone="warn">Vacant</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Surface>
        </Section>
      ) : (
        <Surface padded={false}>
          <EmptyState
            icon={<IconUsers />}
            title={year ? "No positions to show" : "No board year yet"}
          >
            Board positions and their current holders will appear here once they
            are set up.
          </EmptyState>
        </Surface>
      )}
    </div>
  );
}
