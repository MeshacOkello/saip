import { and, asc, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  adminTransfer,
  appointment,
  auditLog,
  boardYear,
  capabilityBundle,
  capabilityGrant,
  invitation,
  membership,
  position,
  user,
} from "@/db/schema";

/** A grant is in effect when it is not revoked and `now` falls inside its window. */
export function inEffect(now: Date) {
  return and(
    isNull(capabilityGrant.revokedAt),
    or(isNull(capabilityGrant.effectiveFrom), lte(capabilityGrant.effectiveFrom, now)),
    or(isNull(capabilityGrant.expiresAt), gt(capabilityGrant.expiresAt, now)),
  );
}

export async function listMembers(now = new Date()) {
  const rows = await db
    .select({
      membershipId: membership.id,
      userId: user.id,
      name: user.name,
      image: user.image,
      email: user.email,
      status: membership.status,
      joinedAt: membership.joinedAt,
      capabilities: sql<string[]>`coalesce(array_agg(distinct ${capabilityGrant.capability})
        filter (where ${capabilityGrant.id} is not null), '{}')`,
    })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .leftJoin(
      capabilityGrant,
      and(eq(capabilityGrant.membershipId, membership.id), inEffect(now)),
    )
    .groupBy(membership.id, user.id)
    .orderBy(asc(user.name));

  const seats = await db
    .select({
      userId: appointment.userId,
      positionName: position.name,
      positionId: position.id,
      yearLabel: boardYear.label,
    })
    .from(appointment)
    .innerJoin(position, eq(position.id, appointment.positionId))
    .innerJoin(boardYear, eq(boardYear.id, appointment.boardYearId))
    .where(isNull(appointment.endedOn));

  return rows.map((row) => ({
    ...row,
    positions: seats.filter((s) => s.userId === row.userId),
  }));
}

export async function memberDetail(membershipId: string, now = new Date()) {
  const [row] = await db
    .select({
      membershipId: membership.id,
      userId: user.id,
      name: user.name,
      image: user.image,
      email: user.email,
      status: membership.status,
      joinedAt: membership.joinedAt,
      leftAt: membership.leftAt,
      note: membership.note,
    })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.id, membershipId))
    .limit(1);

  if (!row) return null;

  const grants = await db
    .select({
      id: capabilityGrant.id,
      capability: capabilityGrant.capability,
      effectiveFrom: capabilityGrant.effectiveFrom,
      expiresAt: capabilityGrant.expiresAt,
      revokedAt: capabilityGrant.revokedAt,
      source: capabilityGrant.source,
      note: capabilityGrant.note,
      createdAt: capabilityGrant.createdAt,
    })
    .from(capabilityGrant)
    .where(eq(capabilityGrant.membershipId, membershipId))
    .orderBy(asc(capabilityGrant.capability), desc(capabilityGrant.createdAt));

  const appointments = await db
    .select({
      id: appointment.id,
      positionId: position.id,
      positionName: position.name,
      yearLabel: boardYear.label,
      boardYearId: boardYear.id,
      startedOn: appointment.startedOn,
      endedOn: appointment.endedOn,
      endReason: appointment.endReason,
    })
    .from(appointment)
    .innerJoin(position, eq(position.id, appointment.positionId))
    .innerJoin(boardYear, eq(boardYear.id, appointment.boardYearId))
    .where(eq(appointment.userId, row.userId))
    .orderBy(desc(appointment.startedOn));

  const live = new Set(
    grants
      .filter(
        (g) =>
          !g.revokedAt &&
          (!g.effectiveFrom || g.effectiveFrom <= now) &&
          (!g.expiresAt || g.expiresAt > now),
      )
      .map((g) => g.capability),
  );

  return { ...row, grants, appointments, live };
}

export async function listInvitations() {
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      intendedStatus: invitation.intendedStatus,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      positionName: position.name,
      bundleName: capabilityBundle.name,
    })
    .from(invitation)
    .leftJoin(position, eq(position.id, invitation.positionId))
    .leftJoin(capabilityBundle, eq(capabilityBundle.id, invitation.bundleId))
    .where(and(isNull(invitation.acceptedAt), isNull(invitation.revokedAt)))
    .orderBy(desc(invitation.createdAt));
}

export async function listPositions() {
  const rows = await db
    .select({
      id: position.id,
      name: position.name,
      slug: position.slug,
      description: position.description,
      responsibilities: position.responsibilities,
      isActive: position.isActive,
      sortOrder: position.sortOrder,
      bundleId: capabilityBundle.id,
      bundleName: capabilityBundle.name,
    })
    .from(position)
    .leftJoin(capabilityBundle, eq(capabilityBundle.id, position.defaultBundleId))
    .orderBy(asc(position.sortOrder), asc(position.name));

  const holders = await db
    .select({ positionId: appointment.positionId, name: user.name })
    .from(appointment)
    .innerJoin(user, eq(user.id, appointment.userId))
    .where(isNull(appointment.endedOn));

  return rows.map((row) => ({
    ...row,
    holder: holders.find((h) => h.positionId === row.id)?.name ?? null,
  }));
}

export async function pendingTransfersFor(membershipId: string) {
  return db
    .select({
      id: adminTransfer.id,
      note: adminTransfer.note,
      createdAt: adminTransfer.createdAt,
      fromName: user.name,
    })
    .from(adminTransfer)
    .innerJoin(user, eq(user.id, adminTransfer.fromUserId))
    .where(
      and(
        eq(adminTransfer.toMembershipId, membershipId),
        eq(adminTransfer.status, "pending"),
      ),
    );
}

export async function outgoingTransfers(userId: string) {
  return db
    .select({
      id: adminTransfer.id,
      createdAt: adminTransfer.createdAt,
      toName: user.name,
    })
    .from(adminTransfer)
    .innerJoin(membership, eq(membership.id, adminTransfer.toMembershipId))
    .innerJoin(user, eq(user.id, membership.userId))
    .where(
      and(eq(adminTransfer.fromUserId, userId), eq(adminTransfer.status, "pending")),
    );
}

export async function recentAudit(limit = 100) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      subjectType: auditLog.subjectType,
      subjectId: auditLog.subjectId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      actorName: user.name,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorUserId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
