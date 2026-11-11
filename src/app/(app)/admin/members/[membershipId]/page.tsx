import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import {
  Badge,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Item,
  PageHeader,
  Rows,
  Section,
  Select,
  Surface,
} from "@/components/ui";
import { listPositions, memberDetail } from "@/lib/admin/queries";
import { boardYears, currentBoardYear } from "@/lib/board";
import { CAPABILITIES, CAPABILITY_LABELS, isCapability } from "@/lib/capabilities";
import { requireMember } from "@/lib/session";

import {
  appointMemberAction,
  applyHandoverAction,
  endAppointmentAction,
  grantCapabilityAction,
  revokeAccessAction,
  revokeCapabilityAction,
  setStatusAction,
} from "../../actions";

function day(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export default async function MemberPage({
  params,
}: {
  params: Promise<{ membershipId: string }>;
}) {
  const { membershipId } = await params;
  const viewer = await requireMember();
  const [member, positions, year, years] = await Promise.all([
    memberDetail(membershipId),
    listPositions(),
    currentBoardYear(),
    boardYears(),
  ]);

  if (!member) notFound();

  const current = member.appointments.find((a) => !a.endedOn);
  const history = member.appointments.filter((a) => a.endedOn);
  const liveGrants = member.grants.filter((g) => !g.revokedAt);
  const ungranted = CAPABILITIES.filter(
    (c) => !liveGrants.some((g) => g.capability === c),
  );
  const openPositions = positions.filter((p) => p.isActive && !p.holder);
  const isSelf = member.membershipId === viewer.membershipId;
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        back={
          <Link href="/admin" className="hover:text-primary">
            ← Members
          </Link>
        }
        title={member.name}
        description={
          <>
            {member.email} · joined {day(member.joinedAt) ?? "—"}
            {member.leftAt ? ` · left ${day(member.leftAt)}` : null}
          </>
        }
        actions={<Badge tone="primary">{member.status}</Badge>}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Position"
          description="Ending an appointment keeps the record. A resignation, a removal and a replacement differ only in the reason."
        >
          <Surface>
          {current ? (
            <div className="space-y-4">
              <p className="text-[14px]">
                <span className="font-medium">{current.positionName}</span>
                <span className="text-muted">
                  {" "}
                  · {current.yearLabel} · since {current.startedOn}
                </span>
              </p>
              <ActionForm
                action={endAppointmentAction}
                submitLabel="End appointment"
                variant="danger"
                hidden={{ appointmentId: current.id }}
                confirm={`End ${member.name}'s term as ${current.positionName}?`}
              >
                <Field label="Reason">
                  <Select name="reason" defaultValue="resigned">
                    <option value="resigned">Resigned</option>
                    <option value="removed">Removed</option>
                    <option value="replaced">Replaced</option>
                    <option value="term_ended">Term ended</option>
                  </Select>
                </Field>
                <Checkbox
                  name="alsoRevokeAccess"
                  label="Also end their access — an alum keeps the archive, a removal keeps nothing"
                />
              </ActionForm>
            </div>
          ) : (
            <ActionForm
              action={appointMemberAction}
              submitLabel="Appoint"
              hidden={{ membershipId: member.membershipId }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Position">
                  <Select name="positionId" required defaultValue="">
                    <option value="" disabled>
                      Choose a position
                    </option>
                    {openPositions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Board year">
                  <Select name="boardYearId" defaultValue={year?.id ?? ""}>
                    {years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <p className="text-[13px] leading-relaxed text-muted">
                Appointing seeds their capabilities from the position&rsquo;s default
                set. Change any of them below afterwards.
              </p>
            </ActionForm>
          )}

          {history.length > 0 ? (
            <ul className="mt-5 space-y-1 border-t border-line pt-4">
              {history.map((a) => (
                <li key={a.id} className="text-[13px] text-muted">
                  {a.positionName} · {a.yearLabel} · {a.startedOn} to {a.endedOn}
                  {a.endReason ? ` · ${a.endReason.replace("_", " ")}` : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Surface>
        </Section>

        <Section
          title="Membership"
          description="Status is descriptive. What they can actually do is the grants below."
        >
          <Surface>
          <ActionForm
            action={setStatusAction}
            submitLabel="Update status"
            variant="secondary"
            hidden={{ membershipId: member.membershipId }}
          >
            <Field label="Status">
              <Select name="status" defaultValue={member.status}>
                <option value="incoming">Incoming (handover)</option>
                <option value="active">Active</option>
                <option value="outgoing">Outgoing</option>
                <option value="alum">Alum</option>
              </Select>
            </Field>
          </ActionForm>

          {current ? (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-3 text-[13px] leading-relaxed text-muted">
                Apply the handover access defined for {current.positionName}: some
                capabilities start now, the rest switch on by themselves when the term
                begins.
              </p>
              <ActionForm
                action={applyHandoverAction}
                submitLabel="Apply handover access"
                variant="secondary"
                size="sm"
                hidden={{
                  membershipId: member.membershipId,
                  positionId: current.positionId,
                  boardYearId: current.boardYearId,
                }}
              />
            </div>
          ) : null}

          {!isSelf ? (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-3 text-[13px] leading-relaxed text-muted">
                Ending access expires every live grant now. Nothing they did is deleted.
              </p>
              <ActionForm
                action={revokeAccessAction}
                submitLabel="Revoke all access"
                variant="danger"
                size="sm"
                hidden={{ membershipId: member.membershipId }}
                confirm={`Revoke ${member.name}'s access entirely?`}
              />
            </div>
          ) : null}
        </Surface>
        </Section>
      </div>

      <Section
        title="Capabilities"
        description="Each grant may start later or expire — that is how handover and automatic revocation work."
      >
        <Surface padded={false}>
        <Rows>
          {liveGrants.map((g) => {
            const pending = g.effectiveFrom && g.effectiveFrom > now;
            return (
              <Item key={g.id}>
                <span className="min-w-0 flex-1">
                  <span className="text-[14px]">
                    {isCapability(g.capability)
                      ? CAPABILITY_LABELS[g.capability]
                      : g.capability}
                  </span>
                  <span className="ml-2 font-mono text-[12px] text-muted">
                    {g.capability}
                  </span>
                </span>
                {pending ? (
                  <Badge tone="neutral">starts {day(g.effectiveFrom)}</Badge>
                ) : (
                  <Badge tone="secondary">in effect</Badge>
                )}
                {g.expiresAt ? (
                  <Badge tone="neutral">until {day(g.expiresAt)}</Badge>
                ) : null}
                <Badge>{g.source}</Badge>
                <ActionForm
                  action={revokeCapabilityAction}
                  submitLabel="Revoke"
                  variant="ghost"
                  size="sm"
                  inline
                  hidden={{
                    membershipId: member.membershipId,
                    capability: g.capability,
                  }}
                />
              </Item>
            );
          })}
          {liveGrants.length === 0 ? (
            <EmptyState title="No capabilities granted">
              This member can sign in but cannot do anything yet.
            </EmptyState>
          ) : null}
        </Rows>

        <div className="border-t border-line px-5 py-4">
          <ActionForm
            action={grantCapabilityAction}
            submitLabel="Grant"
            hidden={{ membershipId: member.membershipId }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Capability">
                <Select name="capability" required defaultValue="">
                  <option value="" disabled>
                    Choose one
                  </option>
                  {ungranted.map((c) => (
                    <option key={c} value={c}>
                      {CAPABILITY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Starts" hint="Empty means immediately.">
                <Input type="date" name="effectiveFrom" />
              </Field>
              <Field label="Expires" hint="Empty means no end.">
                <Input type="date" name="expiresAt" />
              </Field>
            </div>
          </ActionForm>
        </div>
      </Surface>
        </Section>
    </div>
  );
}
