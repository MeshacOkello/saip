import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  adminTransfer,
  appointment,
  boardYear,
  capabilityBundle,
  capabilityGrant,
  invitation,
  membership,
  position,
  positionHandoverGrant,
  user,
} from "@/db/schema";
import {
  AccessError,
  applyHandoverPreset,
  assertAdminInvariantAfterRemoving,
  expireGrants,
  grantCapabilities,
  seedGrantsFromBundle,
  type MemberContext,
} from "@/lib/access";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications/service";
import { ADMIN_CAPABILITY, isCapability, type Capability } from "@/lib/capabilities";

/**
 * Every administrative operation lives here as a plain function taking the acting
 * member. Server actions are thin wrappers around these, and the tests drive them
 * directly — including the unauthorised cases, which is the point: the check belongs
 * to the operation, not to the page that happens to call it.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function assertCapability(actor: MemberContext, capability: Capability) {
  if (!actor.capabilities.has(capability)) {
    throw new AccessError(`Missing capability: ${capability}`);
  }
}

/** The capabilities that make someone an administrator of the board. */
const ADMIN_CAPABILITIES: Capability[] = [
  "board.manage",
  "members.manage",
  "positions.manage",
  "audit.view",
];

const INVITE_TTL_DAYS = 30;

/* -------------------------------------------------------------------------- */
/* Invitations                                                                */
/* -------------------------------------------------------------------------- */

export async function inviteMember(
  actor: MemberContext,
  input: {
    email: string;
    positionId?: string | null;
    bundleId?: string | null;
    boardYearId?: string | null;
    intendedStatus?: "active" | "incoming";
  },
) {
  assertCapability(actor, "members.manage");

  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ValidationError("That is not a valid email address.");
  }

  const allowedDomain = (
    process.env.ALLOWED_EMAIL_DOMAIN ?? "princeton.edu"
  ).toLowerCase();
  if (!email.endsWith(`@${allowedDomain}`)) {
    throw new ValidationError(`Invitations must go to an ${allowedDomain} address.`);
  }

  const [alreadyMember] = await db
    .select({ id: membership.id })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(user.email, email))
    .limit(1);
  if (alreadyMember) {
    throw new ValidationError("That address already has access.");
  }

  const [alreadyInvited] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.email, email),
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
      ),
    )
    .limit(1);
  if (alreadyInvited) {
    throw new ValidationError("That address already has an invitation outstanding.");
  }

  // A position that is already filled this year cannot take a second holder.
  if (input.positionId && input.boardYearId) {
    const [occupied] = await db
      .select({ id: appointment.id })
      .from(appointment)
      .where(
        and(
          eq(appointment.positionId, input.positionId),
          eq(appointment.boardYearId, input.boardYearId),
          isNull(appointment.endedOn),
        ),
      )
      .limit(1);
    if (occupied) {
      throw new ValidationError(
        "That position is already filled for this board year. End the current appointment first.",
      );
    }
  }

  const [row] = await db
    .insert(invitation)
    .values({
      email,
      positionId: input.positionId ?? null,
      bundleId: input.bundleId ?? null,
      boardYearId: input.boardYearId ?? null,
      intendedStatus: input.intendedStatus ?? "active",
      token: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      invitedBy: actor.userId,
    })
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "invitation.created",
    subjectType: "invitation",
    subjectId: row.id,
    metadata: { email, intendedStatus: row.intendedStatus },
  });

  return row;
}

export async function revokeInvitation(actor: MemberContext, invitationId: string) {
  assertCapability(actor, "members.manage");

  const [row] = await db
    .update(invitation)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitation.id, invitationId), isNull(invitation.acceptedAt)))
    .returning();

  if (!row) throw new ValidationError("That invitation is no longer outstanding.");

  await recordAudit({
    actorUserId: actor.userId,
    action: "invitation.revoked",
    subjectType: "invitation",
    subjectId: row.id,
    metadata: { email: row.email },
  });

  return row;
}

/* -------------------------------------------------------------------------- */
/* Appointments                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Appoints a member to a position. Seeds their capabilities from the position's
 * default bundle — the bundle is a starting point, not a rule that keeps applying.
 */
export async function appointMember(
  actor: MemberContext,
  input: {
    membershipId: string;
    positionId: string;
    boardYearId: string;
    seedCapabilities?: boolean;
  },
) {
  assertCapability(actor, "members.manage");

  const [member] = await db
    .select()
    .from(membership)
    .where(eq(membership.id, input.membershipId))
    .limit(1);
  if (!member) throw new ValidationError("No such member.");

  const [seat] = await db
    .select()
    .from(position)
    .where(eq(position.id, input.positionId))
    .limit(1);
  if (!seat) throw new ValidationError("No such position.");
  if (!seat.isActive) throw new ValidationError("That position has been retired.");

  const [year] = await db
    .select()
    .from(boardYear)
    .where(eq(boardYear.id, input.boardYearId))
    .limit(1);
  if (!year) throw new ValidationError("No such board year.");

  const [occupied] = await db
    .select({ id: appointment.id })
    .from(appointment)
    .where(
      and(
        eq(appointment.positionId, input.positionId),
        eq(appointment.boardYearId, input.boardYearId),
        isNull(appointment.endedOn),
      ),
    )
    .limit(1);
  if (occupied) {
    throw new ValidationError(
      "That position is already filled. End the current appointment first.",
    );
  }

  const [row] = await db
    .insert(appointment)
    .values({
      userId: member.userId,
      positionId: input.positionId,
      boardYearId: input.boardYearId,
      startedOn: todayOrLater(year.startsOn),
    })
    .returning();

  if (input.seedCapabilities !== false && seat.defaultBundleId) {
    await seedGrantsFromBundle(member.id, seat.defaultBundleId, actor.userId);
  }

  if (member.status === "incoming") {
    await applyHandoverPreset(
      member.id,
      seat.id,
      new Date(`${year.startsOn}T00:00:00Z`),
      actor.userId,
    );
  }

  await recordAudit({
    actorUserId: actor.userId,
    action: "appointment.created",
    subjectType: "appointment",
    subjectId: row.id,
    metadata: { position: seat.name, boardYear: year.label, userId: member.userId },
  });

  return row;
}

function todayOrLater(startsOn: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return today > startsOn ? today : startsOn;
}

/**
 * Ends an appointment. A resignation, a removal and a replacement differ only in the
 * reason recorded — the record itself is never deleted, so SAIP's history keeps its
 * meaning.
 */
export async function endAppointment(
  actor: MemberContext,
  input: {
    appointmentId: string;
    reason: "term_ended" | "resigned" | "removed" | "replaced";
    endedOn?: string;
    alsoRevokeAccess?: boolean;
  },
) {
  assertCapability(actor, "members.manage");

  const [row] = await db
    .select()
    .from(appointment)
    .where(eq(appointment.id, input.appointmentId))
    .limit(1);
  if (!row) throw new ValidationError("No such appointment.");
  if (row.endedOn) throw new ValidationError("That appointment has already ended.");

  const [member] = await db
    .select()
    .from(membership)
    .where(eq(membership.userId, row.userId))
    .limit(1);

  // Ending an appointment may take away the last administrator, so check first.
  if (input.alsoRevokeAccess && member) {
    const isAdmin = await holdsCapability(member.id, ADMIN_CAPABILITY);
    if (isAdmin) await assertAdminInvariantAfterRemoving(member.id);
  }

  const [ended] = await db
    .update(appointment)
    .set({
      endedOn: input.endedOn ?? new Date().toISOString().slice(0, 10),
      endReason: input.reason,
    })
    .where(eq(appointment.id, input.appointmentId))
    .returning();

  if (input.alsoRevokeAccess && member) {
    await expireGrants(member.id);
    await db
      .update(membership)
      .set({
        status: input.reason === "removed" ? "revoked" : "alum",
        leftAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(membership.id, member.id));

    // An alum keeps the archive, and nothing else.
    if (input.reason !== "removed") {
      await grantCapabilities(
        member.id,
        [{ capability: "archive.view", note: "Alum access" }],
        actor.userId,
      );
    }
  }

  await recordAudit({
    actorUserId: actor.userId,
    action: "appointment.ended",
    subjectType: "appointment",
    subjectId: ended.id,
    metadata: { reason: input.reason, revokedAccess: Boolean(input.alsoRevokeAccess) },
  });

  return ended;
}

/* -------------------------------------------------------------------------- */
/* Grants                                                                     */
/* -------------------------------------------------------------------------- */

async function holdsCapability(membershipId: string, capability: Capability) {
  const rows = await db
    .select({ id: capabilityGrant.id })
    .from(capabilityGrant)
    .where(
      and(
        eq(capabilityGrant.membershipId, membershipId),
        eq(capabilityGrant.capability, capability),
        isNull(capabilityGrant.revokedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function grantCapability(
  actor: MemberContext,
  input: {
    membershipId: string;
    capability: string;
    effectiveFrom?: Date | null;
    expiresAt?: Date | null;
    note?: string | null;
  },
) {
  assertCapability(actor, "members.manage");
  if (!isCapability(input.capability)) {
    throw new ValidationError("Unknown capability.");
  }
  if (
    input.effectiveFrom &&
    input.expiresAt &&
    input.expiresAt <= input.effectiveFrom
  ) {
    throw new ValidationError("A grant cannot expire before it takes effect.");
  }

  const [row] = await grantCapabilities(
    input.membershipId,
    [
      {
        capability: input.capability,
        effectiveFrom: input.effectiveFrom ?? null,
        expiresAt: input.expiresAt ?? null,
        note: input.note ?? null,
      },
    ],
    actor.userId,
  );

  await recordAudit({
    actorUserId: actor.userId,
    action: "grant.created",
    subjectType: "membership",
    subjectId: input.membershipId,
    metadata: {
      capability: input.capability,
      effectiveFrom: input.effectiveFrom?.toISOString() ?? null,
      expiresAt: input.expiresAt?.toISOString() ?? null,
    },
  });

  return row;
}

/**
 * Revokes a capability from a member. Guards the two-administrator invariant: the
 * board must never be able to lock itself out of its own records.
 */
export async function revokeCapability(
  actor: MemberContext,
  input: { membershipId: string; capability: string },
) {
  assertCapability(actor, "members.manage");

  if (input.capability === ADMIN_CAPABILITY) {
    await assertAdminInvariantAfterRemoving(input.membershipId);
  }

  const rows = await db
    .update(capabilityGrant)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(capabilityGrant.membershipId, input.membershipId),
        eq(capabilityGrant.capability, input.capability),
        isNull(capabilityGrant.revokedAt),
      ),
    )
    .returning();

  if (rows.length === 0) {
    throw new ValidationError("That member does not hold that capability.");
  }

  await recordAudit({
    actorUserId: actor.userId,
    action: "grant.revoked",
    subjectType: "membership",
    subjectId: input.membershipId,
    metadata: { capability: input.capability, grants: rows.length },
  });

  return rows;
}

export async function applyHandoverForMember(
  actor: MemberContext,
  input: { membershipId: string; positionId: string; boardYearId: string },
) {
  assertCapability(actor, "members.manage");

  const [year] = await db
    .select()
    .from(boardYear)
    .where(eq(boardYear.id, input.boardYearId))
    .limit(1);
  if (!year) throw new ValidationError("No such board year.");

  const presets = await db
    .select({ capability: positionHandoverGrant.capability })
    .from(positionHandoverGrant)
    .where(eq(positionHandoverGrant.positionId, input.positionId));
  if (presets.length === 0) {
    throw new ValidationError("That position has no handover preset yet.");
  }

  const granted = await applyHandoverPreset(
    input.membershipId,
    input.positionId,
    new Date(`${year.startsOn}T00:00:00Z`),
    actor.userId,
  );

  await recordAudit({
    actorUserId: actor.userId,
    action: "handover.applied",
    subjectType: "membership",
    subjectId: input.membershipId,
    metadata: { positionId: input.positionId, grants: granted.length },
  });

  return granted;
}

export async function setMembershipStatus(
  actor: MemberContext,
  input: { membershipId: string; status: "incoming" | "active" | "outgoing" | "alum" },
) {
  assertCapability(actor, "members.manage");

  const [row] = await db
    .update(membership)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(membership.id, input.membershipId))
    .returning();
  if (!row) throw new ValidationError("No such member.");

  await recordAudit({
    actorUserId: actor.userId,
    action: "membership.status_changed",
    subjectType: "membership",
    subjectId: row.id,
    metadata: { status: input.status },
  });

  return row;
}

/**
 * Removes a member's access entirely: every live grant expires now, and the
 * membership is marked revoked. The record of what they did remains.
 */
export async function revokeAccess(
  actor: MemberContext,
  input: { membershipId: string },
) {
  assertCapability(actor, "members.manage");

  if (input.membershipId === actor.membershipId) {
    throw new ValidationError("You cannot revoke your own access.");
  }

  if (await holdsCapability(input.membershipId, ADMIN_CAPABILITY)) {
    await assertAdminInvariantAfterRemoving(input.membershipId);
  }

  await expireGrants(input.membershipId);
  const [row] = await db
    .update(membership)
    .set({ status: "revoked", leftAt: new Date(), updatedAt: new Date() })
    .where(eq(membership.id, input.membershipId))
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "membership.revoked",
    subjectType: "membership",
    subjectId: input.membershipId,
  });

  return row;
}

/* -------------------------------------------------------------------------- */
/* Administration transfer                                                    */
/* -------------------------------------------------------------------------- */

export async function proposeAdminTransfer(
  actor: MemberContext,
  input: { toMembershipId: string; note?: string | null },
) {
  assertCapability(actor, ADMIN_CAPABILITY);

  if (input.toMembershipId === actor.membershipId) {
    throw new ValidationError("You already hold administration.");
  }

  const [target] = await db
    .select()
    .from(membership)
    .where(eq(membership.id, input.toMembershipId))
    .limit(1);
  if (!target) throw new ValidationError("No such member.");
  if (target.status === "revoked" || target.status === "invited") {
    throw new ValidationError("That member does not have access yet.");
  }

  const [existing] = await db
    .select({ id: adminTransfer.id })
    .from(adminTransfer)
    .where(
      and(
        eq(adminTransfer.toMembershipId, input.toMembershipId),
        eq(adminTransfer.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) {
    throw new ValidationError("That member already has a pending offer.");
  }

  const [row] = await db
    .insert(adminTransfer)
    .values({
      fromUserId: actor.userId,
      toMembershipId: input.toMembershipId,
      note: input.note ?? null,
    })
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "admin_transfer.proposed",
    subjectType: "admin_transfer",
    subjectId: row.id,
    metadata: { toMembershipId: input.toMembershipId },
  });

  await notify([
    {
      userId: target.userId,
      kind: "admin_transfer",
      title: `${actor.name} has offered you administration`,
      body: input.note ?? "Only you can accept it.",
      href: "/dashboard",
      actorUserId: actor.userId,
      subjectType: "admin_transfer",
      subjectId: row.id,
    },
  ]);

  return row;
}

/**
 * The receiving side. Administration is only ever gained by accepting it, never by
 * someone else editing a field, and both halves are in the audit log.
 */
export async function acceptAdminTransfer(
  actor: MemberContext,
  input: { transferId: string },
) {
  const [row] = await db
    .select()
    .from(adminTransfer)
    .where(eq(adminTransfer.id, input.transferId))
    .limit(1);
  if (!row) throw new ValidationError("No such offer.");
  if (row.status !== "pending") throw new ValidationError("That offer is closed.");
  if (row.toMembershipId !== actor.membershipId) {
    throw new AccessError("That offer was made to someone else.");
  }

  await grantCapabilities(
    actor.membershipId,
    ADMIN_CAPABILITIES.map((capability) => ({
      capability,
      note: "Administration transfer",
    })),
    row.fromUserId,
  );

  const [updated] = await db
    .update(adminTransfer)
    .set({ status: "accepted", resolvedAt: new Date() })
    .where(eq(adminTransfer.id, row.id))
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "admin_transfer.accepted",
    subjectType: "admin_transfer",
    subjectId: row.id,
    metadata: { fromUserId: row.fromUserId },
  });

  return updated;
}

export async function resolveAdminTransfer(
  actor: MemberContext,
  input: { transferId: string; status: "declined" | "cancelled" },
) {
  const [row] = await db
    .select()
    .from(adminTransfer)
    .where(eq(adminTransfer.id, input.transferId))
    .limit(1);
  if (!row) throw new ValidationError("No such offer.");
  if (row.status !== "pending") throw new ValidationError("That offer is closed.");

  const permitted =
    input.status === "declined"
      ? row.toMembershipId === actor.membershipId
      : row.fromUserId === actor.userId && actor.capabilities.has(ADMIN_CAPABILITY);
  if (!permitted) throw new AccessError("That offer is not yours to close.");

  const [updated] = await db
    .update(adminTransfer)
    .set({ status: input.status, resolvedAt: new Date() })
    .where(eq(adminTransfer.id, row.id))
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: `admin_transfer.${input.status}`,
    subjectType: "admin_transfer",
    subjectId: row.id,
  });

  return updated;
}

/**
 * Giving up your own administration. Separate from the transfer on purpose: the
 * recipient must already have accepted, or the invariant refuses.
 */
export async function stepDownAsAdmin(actor: MemberContext) {
  assertCapability(actor, ADMIN_CAPABILITY);
  await assertAdminInvariantAfterRemoving(actor.membershipId);

  const rows = await db
    .update(capabilityGrant)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(capabilityGrant.membershipId, actor.membershipId),
        eq(capabilityGrant.capability, ADMIN_CAPABILITY),
        isNull(capabilityGrant.revokedAt),
      ),
    )
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "admin_transfer.stepped_down",
    subjectType: "membership",
    subjectId: actor.membershipId,
  });

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Positions                                                                  */
/* -------------------------------------------------------------------------- */

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createPosition(
  actor: MemberContext,
  input: {
    name: string;
    description?: string | null;
    responsibilities?: string | null;
    defaultBundleId?: string | null;
    sortOrder?: string;
  },
) {
  assertCapability(actor, "positions.manage");

  const name = input.name.trim();
  if (name.length < 2) throw new ValidationError("Give the position a name.");

  const slug = slugify(name);
  const [existing] = await db
    .select({ id: position.id })
    .from(position)
    .where(eq(position.slug, slug))
    .limit(1);
  if (existing) throw new ValidationError("A position with that name already exists.");

  const [row] = await db
    .insert(position)
    .values({
      name,
      slug,
      description: input.description ?? null,
      responsibilities: input.responsibilities ?? null,
      defaultBundleId: input.defaultBundleId ?? null,
      sortOrder: input.sortOrder ?? "50",
    })
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "position.created",
    subjectType: "position",
    subjectId: row.id,
    metadata: { name },
  });

  return row;
}

export async function updatePosition(
  actor: MemberContext,
  input: {
    positionId: string;
    name?: string;
    description?: string | null;
    responsibilities?: string | null;
    defaultBundleId?: string | null;
    sortOrder?: string;
  },
) {
  assertCapability(actor, "positions.manage");

  const [row] = await db
    .update(position)
    .set({
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.responsibilities !== undefined
        ? { responsibilities: input.responsibilities }
        : {}),
      ...(input.defaultBundleId !== undefined
        ? { defaultBundleId: input.defaultBundleId }
        : {}),
      ...(input.sortOrder ? { sortOrder: input.sortOrder } : {}),
    })
    .where(eq(position.id, input.positionId))
    .returning();
  if (!row) throw new ValidationError("No such position.");

  await recordAudit({
    actorUserId: actor.userId,
    action: "position.updated",
    subjectType: "position",
    subjectId: row.id,
  });

  return row;
}

/** Positions are retired, never deleted, so past appointments keep their meaning. */
export async function retirePosition(
  actor: MemberContext,
  input: { positionId: string; retire: boolean },
) {
  assertCapability(actor, "positions.manage");

  if (input.retire) {
    const [filled] = await db
      .select({ id: appointment.id })
      .from(appointment)
      .where(
        and(
          eq(appointment.positionId, input.positionId),
          isNull(appointment.endedOn),
        ),
      )
      .limit(1);
    if (filled) {
      throw new ValidationError(
        "Someone currently holds that position. End the appointment first.",
      );
    }
  }

  const [row] = await db
    .update(position)
    .set({
      isActive: !input.retire,
      retiredAt: input.retire ? new Date() : null,
    })
    .where(eq(position.id, input.positionId))
    .returning();
  if (!row) throw new ValidationError("No such position.");

  await recordAudit({
    actorUserId: actor.userId,
    action: input.retire ? "position.retired" : "position.restored",
    subjectType: "position",
    subjectId: row.id,
    metadata: { name: row.name },
  });

  return row;
}

export async function listBundles() {
  return db.select().from(capabilityBundle).orderBy(capabilityBundle.name);
}
