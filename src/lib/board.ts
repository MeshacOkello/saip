import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { appointment, boardYear, membership, position, user } from "@/db/schema";

export async function currentBoardYear() {
  const [row] = await db
    .select()
    .from(boardYear)
    .where(eq(boardYear.isCurrent, true))
    .limit(1);
  if (row) return row;

  const [latest] = await db
    .select()
    .from(boardYear)
    .orderBy(desc(boardYear.startsOn))
    .limit(1);
  return latest ?? null;
}

export async function boardYears() {
  return db.select().from(boardYear).orderBy(desc(boardYear.startsOn));
}

/**
 * The roster for a board year: every active position with its current holder, or no
 * holder at all. A vacancy is simply a position with no open appointment — it needs no
 * special record.
 */
export async function roster(boardYearId: string) {
  return db
    .select({
      positionId: position.id,
      positionName: position.name,
      positionSlug: position.slug,
      description: position.description,
      holderId: user.id,
      holderName: user.name,
      holderEmail: user.email,
      holderImage: user.image,
      membershipStatus: membership.status,
      startedOn: appointment.startedOn,
    })
    .from(position)
    .leftJoin(
      appointment,
      and(
        eq(appointment.positionId, position.id),
        eq(appointment.boardYearId, boardYearId),
        isNull(appointment.endedOn),
      ),
    )
    .leftJoin(user, eq(user.id, appointment.userId))
    .leftJoin(membership, eq(membership.userId, user.id))
    .where(eq(position.isActive, true))
    .orderBy(asc(position.sortOrder), asc(position.name));
}

/** Positions this person currently holds, across every board year. */
export async function appointmentsFor(userId: string) {
  return db
    .select({
      positionName: position.name,
      yearLabel: boardYear.label,
      startedOn: appointment.startedOn,
      endedOn: appointment.endedOn,
      endReason: appointment.endReason,
    })
    .from(appointment)
    .innerJoin(position, eq(position.id, appointment.positionId))
    .innerJoin(boardYear, eq(boardYear.id, appointment.boardYearId))
    .where(eq(appointment.userId, userId))
    .orderBy(desc(appointment.startedOn));
}

/** Everyone who can currently be assigned work. */
export async function assignableMembers() {
  return db
    .select({ userId: user.id, name: user.name })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(sql`${membership.status} in ('active','incoming','outgoing')`)
    .orderBy(asc(user.name));
}
