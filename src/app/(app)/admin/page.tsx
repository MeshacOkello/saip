import Link from "next/link";

import { ActionForm } from "@/components/action-form";
import { EditorLink } from "@/components/editor-link";
import {
  Avatar,
  Badge,
  Cell,
  EmptyState,
  Editor,
  Field,
  Input,
  Item,
  Notice,
  PageHeader,
  Rows,
  Section,
  Select,
  Surface,
  Table,
} from "@/components/ui";
import { countAdmins } from "@/lib/access";
import {
  listInvitations,
  listMembers,
  listPositions,
  outgoingTransfers,
} from "@/lib/admin/queries";
import { listBundles } from "@/lib/admin/service";
import { currentBoardYear } from "@/lib/board";
import {
  CAPABILITY_LABELS,
  MIN_ADMINS,
  isCapability,
} from "@/lib/capabilities";
import { avatarSrc } from "@/lib/profile/service";
import { requireMember } from "@/lib/session";

import {
  inviteMemberAction,
  proposeAdminTransferAction,
  resolveAdminTransferAction,
  revokeInvitationAction,
  stepDownAction,
} from "./actions";

export const metadata = { title: "Members · SAIP Board" };

export default async function AdminMembersPage() {
  const viewer = await requireMember();
  const [members, invitations, positions, bundles, year, admins, outgoing] =
    await Promise.all([
      listMembers(),
      listInvitations(),
      listPositions(),
      listBundles(),
      currentBoardYear(),
      countAdmins(),
      outgoingTransfers(viewer.userId),
    ]);

  const openPositions = positions.filter((p) => p.isActive);
  const isAdmin = viewer.capabilities.has("board.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Members"
        actions={<EditorLink id="invite-member">Invite a member</EditorLink>}
        description="Invite board members and manage their roles and access."
        meta={
          <>
            <span>
              {members.length} member{members.length === 1 ? "" : "s"}
            </span>
            <span>
              {admins} administrator{admins === 1 ? "" : "s"}
            </span>
            {invitations.length > 0 ? (
              <span>{invitations.length} invitation outstanding</span>
            ) : null}
          </>
        }
      />

      {admins < MIN_ADMINS ? (
        <Notice
          tone="warn"
          title={`The board has only ${admins} administrator`}
        >
          Keep at least {MIN_ADMINS}. A Princeton account stops working after
          graduation, and a board that loses administration cannot repair it
          from inside the application.
        </Notice>
      ) : null}

      <div className="workspace-grid">
        <div className="min-w-0 space-y-8">
          <Section title="Board members">
            {members.length > 0 ? (
              <Table head={["Member", "Position", "Status", "Access"]}>
                {members.map((m) => (
                  <tr
                    key={m.membershipId}
                    className="transition-colors hover:bg-surface-2"
                  >
                    <Cell>
                      <span className="flex items-center gap-3">
                        <Avatar
                          name={m.name}
                          size={32}
                          src={avatarSrc({ userId: m.userId, image: m.image })}
                        />
                        <span className="min-w-0">
                          <Link
                            href={`/admin/members/${m.membershipId}`}
                            className="block font-medium hover:text-primary"
                          >
                            {m.name}
                          </Link>
                          <span className="block truncate text-[13px] text-muted">
                            {m.email}
                          </span>
                        </span>
                      </span>
                    </Cell>
                    <Cell>
                      {m.positions.length > 0 ? (
                        <span className="flex flex-wrap gap-1.5">
                          {m.positions.map((p) => (
                            <Badge key={p.positionId}>{p.positionName}</Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Cell>
                    <Cell>
                      <Badge
                        tone={m.status === "active" ? "secondary" : "primary"}
                      >
                        {m.status}
                      </Badge>
                    </Cell>
                    <Cell className="text-muted">
                      {m.capabilities.filter(isCapability).length === 0
                        ? "No access in effect"
                        : m.capabilities
                              .filter(isCapability)
                              .includes("board.manage")
                          ? "Administrator"
                          : `${m.capabilities.filter(isCapability).length} capabilities`}
                    </Cell>
                  </tr>
                ))}
              </Table>
            ) : (
              <Surface padded={false}>
                <EmptyState title="Nobody has joined yet">
                  Invite a member using the exact email address they will sign
                  in with.
                </EmptyState>
              </Surface>
            )}
          </Section>

          {invitations.length > 0 ? (
            <Section title="Outstanding invitations">
              <Surface padded={false}>
                <Rows>
                  {invitations.map((i) => (
                    <Item key={i.id}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px]">{i.email}</p>
                        <p className="text-[13px] text-muted">
                          {i.positionName ?? "No position"} ·{" "}
                          {i.bundleName ?? "no access"} · expires{" "}
                          {i.expiresAt.toISOString().slice(0, 10)}
                        </p>
                      </div>
                      <ActionForm
                        action={revokeInvitationAction}
                        submitLabel="Revoke"
                        variant="ghost"
                        size="sm"
                        inline
                        hidden={{ invitationId: i.id }}
                        confirm={`Revoke the invitation for ${i.email}?`}
                      />
                    </Item>
                  ))}
                </Rows>
              </Surface>
            </Section>
          ) : null}

          {isAdmin ? (
            <Section
              title="Leadership transition"
              description="Administration moves only when the recipient accepts. Both halves are recorded in the audit log."
              actions={<EditorLink id="transfer-admin">Offer administration</EditorLink>}
            >
              <Surface>
                {outgoing.length > 0 ? (
                  <ul className="mb-4 space-y-2">
                    {outgoing.map((t) => (
                      <li
                        key={t.id}
                        className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-2 px-3.5 py-2.5 text-[14px]"
                      >
                        <span className="flex-1">
                          Waiting for {t.toName} to accept.
                        </span>
                        <ActionForm
                          action={resolveAdminTransferAction}
                          submitLabel="Cancel"
                          variant="ghost"
                          size="sm"
                          inline
                          hidden={{ transferId: t.id, status: "cancelled" }}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}

                {outgoing.length === 0 ? (
                  <p className="text-[14px] leading-relaxed text-muted">
                    No offer is outstanding. Offering administration lets someone else
                    invite members, appoint officers and change what anyone can do.
                  </p>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-line pt-4">
                  <p className="flex-1 text-[13px] leading-relaxed text-muted">
                    Once someone else has accepted, you can give up your own
                    administration. Refused while it would leave fewer than{" "}
                    {MIN_ADMINS}.
                  </p>
                  <ActionForm
                    action={stepDownAction}
                    submitLabel="Step down"
                    variant="danger"
                    size="sm"
                    inline
                    confirm="Give up your own administration? You will no longer be able to manage members."
                  />
                </div>
              </Surface>
            </Section>
          ) : null}

          <Section
            title="Your access"
            description="What you personally can do, and where it came from."
          >
            <Surface>
              <ul className="flex flex-wrap gap-1.5">
                {[...viewer.capabilities].sort().map((c) => (
                  <li key={c}>
                    <Badge title={c}>{CAPABILITY_LABELS[c]}</Badge>
                  </li>
                ))}
                {viewer.capabilities.size === 0 ? (
                  <li className="text-[14px] text-muted">Nothing granted.</li>
                ) : null}
              </ul>
            </Surface>
          </Section>
        </div>
        <aside aria-label="Invite members" className="min-w-0">
          {isAdmin ? (
            <Editor
              id="transfer-admin"
              title="Offer administration"
              description="They must accept it themselves before anything changes."
            >
              <ActionForm
                action={proposeAdminTransferAction}
                submitLabel="Send offer"
              >
                <Field label="To">
                  <Select name="toMembershipId" required defaultValue="">
                    <option value="" disabled>
                      Choose a member
                    </option>
                    {members
                      .filter(
                        (m) =>
                          m.membershipId !== viewer.membershipId &&
                          m.status !== "revoked",
                      )
                      .map((m) => (
                        <option key={m.membershipId} value={m.membershipId}>
                          {m.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Note" hint="Optional, shown with the offer.">
                  <Input name="note" placeholder="Handing over before graduation" />
                </Field>
              </ActionForm>
            </Editor>
          ) : null}

          <Editor id="invite-member" title="Invite a board member">
            <ActionForm
              action={inviteMemberAction}
              submitLabel="Send invitation"
            >
              <input type="hidden" name="boardYearId" value={year?.id ?? ""} />
              <Field label="Princeton email">
                <Input
                  name="email"
                  type="email"
                  required
                  placeholder="name@princeton.edu"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2 min-[76rem]:grid-cols-1">
                <Field
                  label="Position"
                  hint="Optional — appoint them later if you prefer."
                >
                  <Select name="positionId" defaultValue="">
                    <option value="">No position</option>
                    {openPositions.map((p) => (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={Boolean(p.holder)}
                      >
                        {p.name}
                        {p.holder ? ` — ${p.holder}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Starting access"
                  hint="Adjustable per person afterwards."
                >
                  <Select
                    name="bundleId"
                    defaultValue={
                      bundles.find((b) => b.slug === "officer")?.id ?? ""
                    }
                  >
                    <option value="">No access yet</option>
                    {bundles.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field
                label="Joining as"
                hint="Incoming officers receive the position's handover access, dated to switch on when their term starts."
              >
                <Select name="intendedStatus" defaultValue="active">
                  <option value="active">Current board</option>
                  <option value="incoming">Incoming board</option>
                </Select>
              </Field>
            </ActionForm>
          </Editor>
        </aside>
      </div>
    </div>
  );
}
