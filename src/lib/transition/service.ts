import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  appointment,
  boardYear,
  decision,
  event,
  expense,
  meeting,
  membership,
  position,
  reimbursement,
  task,
  user,
} from "@/db/schema";
import { AccessError, type MemberContext } from "@/lib/access";
import { recordAudit } from "@/lib/audit";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function needsBoardManage(actor: MemberContext) {
  if (!actor.capabilities.has("board.manage")) {
    throw new AccessError("Missing capability: board.manage");
  }
}

/* -------------------------------------------------------------------------- */
/* Board years                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Creating next year's board is the first step of a handover. Only one year is ever
 * current, so promoting a new one steps the old one down in the same transaction.
 */
export async function createBoardYear(
  actor: MemberContext,
  input: {
    label: string;
    startsOn: string;
    endsOn: string;
    makeCurrent?: boolean;
  },
) {
  needsBoardManage(actor);

  const label = input.label.trim();
  if (label.length < 4) throw new ValidationError("Name the board year, e.g. 2027/28.");
  if (!input.startsOn || !input.endsOn) {
    throw new ValidationError("Give the term a start and an end date.");
  }
  if (input.endsOn <= input.startsOn) {
    throw new ValidationError("The term has to end after it starts.");
  }

  const [clash] = await db
    .select({ id: boardYear.id })
    .from(boardYear)
    .where(eq(boardYear.label, label))
    .limit(1);
  if (clash) throw new ValidationError("That board year already exists.");

  return db.transaction(async (tx) => {
    if (input.makeCurrent) {
      await tx.update(boardYear).set({ isCurrent: false });
    }
    const [row] = await tx
      .insert(boardYear)
      .values({
        label,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        isCurrent: Boolean(input.makeCurrent),
      })
      .returning();

    await recordAudit({
      actorUserId: actor.userId,
      action: "board_year.created",
      subjectType: "board_year",
      subjectId: row.id,
      metadata: { label, current: Boolean(input.makeCurrent) },
    });

    return row;
  });
}

export async function makeBoardYearCurrent(
  actor: MemberContext,
  boardYearId: string,
) {
  needsBoardManage(actor);

  return db.transaction(async (tx) => {
    await tx.update(boardYear).set({ isCurrent: false });
    const [row] = await tx
      .update(boardYear)
      .set({ isCurrent: true })
      .where(eq(boardYear.id, boardYearId))
      .returning();
    if (!row) throw new ValidationError("No such board year.");

    await recordAudit({
      actorUserId: actor.userId,
      action: "board_year.made_current",
      subjectType: "board_year",
      subjectId: row.id,
      metadata: { label: row.label },
    });

    return row;
  });
}

/* -------------------------------------------------------------------------- */
/* Archive                                                                    */
/* -------------------------------------------------------------------------- */

/** One line per board year: enough to decide which year to open. */
export async function archiveIndex() {
  const years = await db.select().from(boardYear).orderBy(desc(boardYear.startsOn));

  const counts = await Promise.all(
    years.map(async (year) => {
      const [events] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(event)
        .where(and(eq(event.boardYearId, year.id), isNull(event.deletedAt)));
      const [meetings] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(meeting)
        .where(and(eq(meeting.boardYearId, year.id), isNull(meeting.deletedAt)));
      const [officers] = await db
        .select({ n: sql<number>`count(distinct ${appointment.userId})::int` })
        .from(appointment)
        .where(eq(appointment.boardYearId, year.id));
      const [spend] = await db
        .select({ total: sql<number>`coalesce(sum(${expense.actualAmount}), 0)::int` })
        .from(expense)
        .where(and(eq(expense.boardYearId, year.id), isNull(expense.deletedAt)));

      return {
        ...year,
        events: events?.n ?? 0,
        meetings: meetings?.n ?? 0,
        officers: officers?.n ?? 0,
        spend: spend?.total ?? 0,
      };
    }),
  );

  return counts;
}

/** Everything a future board would want from one year. */
export async function archiveYear(boardYearId: string) {
  const [year] = await db
    .select()
    .from(boardYear)
    .where(eq(boardYear.id, boardYearId))
    .limit(1);
  if (!year) return null;

  const [events, meetings, decisions, officers, spend] = await Promise.all([
    db
      .select({
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        status: event.status,
        turnout: event.turnout,
        whatWorked: event.whatWorked,
        whatToAvoid: event.whatToAvoid,
      })
      .from(event)
      .where(and(eq(event.boardYearId, boardYearId), isNull(event.deletedAt)))
      .orderBy(desc(event.startsAt)),
    db
      .select({
        id: meeting.id,
        title: meeting.title,
        startsAt: meeting.startsAt,
        status: meeting.status,
      })
      .from(meeting)
      .where(and(eq(meeting.boardYearId, boardYearId), isNull(meeting.deletedAt)))
      .orderBy(desc(meeting.startsAt)),
    db
      .select({
        id: decision.id,
        title: decision.title,
        detail: decision.detail,
        decidedOn: decision.decidedOn,
      })
      .from(decision)
      .where(eq(decision.boardYearId, boardYearId))
      .orderBy(desc(decision.decidedOn)),
    db
      .select({
        positionName: position.name,
        holderName: user.name,
        startedOn: appointment.startedOn,
        endedOn: appointment.endedOn,
        endReason: appointment.endReason,
      })
      .from(appointment)
      .innerJoin(position, eq(position.id, appointment.positionId))
      .innerJoin(user, eq(user.id, appointment.userId))
      .where(eq(appointment.boardYearId, boardYearId))
      .orderBy(asc(position.sortOrder)),
    db
      .select({
        planned: sql<number>`coalesce(sum(${expense.plannedAmount}), 0)::int`,
        actual: sql<number>`coalesce(sum(${expense.actualAmount}), 0)::int`,
      })
      .from(expense)
      .where(and(eq(expense.boardYearId, boardYearId), isNull(expense.deletedAt))),
  ]);

  return { year, events, meetings, decisions, officers, spend: spend[0] };
}

/* -------------------------------------------------------------------------- */
/* Handover packets                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What the outgoing holder of a position owes their successor: the work still open,
 * the events they led, and any money still in flight. Assembled from live records,
 * so it is never out of date and never has to be written by hand.
 */
export async function handoverPacket(positionId: string, boardYearId: string) {
  const [seat] = await db
    .select()
    .from(position)
    .where(eq(position.id, positionId))
    .limit(1);
  if (!seat) return null;

  const [holder] = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      startedOn: appointment.startedOn,
      endedOn: appointment.endedOn,
    })
    .from(appointment)
    .innerJoin(user, eq(user.id, appointment.userId))
    .where(
      and(
        eq(appointment.positionId, positionId),
        eq(appointment.boardYearId, boardYearId),
      ),
    )
    .orderBy(desc(appointment.startedOn))
    .limit(1);

  if (!holder) {
    return { position: seat, holder: null, tasks: [], events: [], money: [] };
  }

  const [tasks, events, money] = await Promise.all([
    db
      .select({
        id: task.id,
        title: task.title,
        dueOn: task.dueOn,
        status: task.status,
        eventTitle: event.title,
      })
      .from(task)
      .leftJoin(event, eq(event.id, task.eventId))
      .where(
        and(
          eq(task.boardYearId, boardYearId),
          eq(task.assigneeUserId, holder.userId),
          isNull(task.deletedAt),
          sql`${task.status} in ('todo','doing')`,
        ),
      )
      .orderBy(sql`${task.dueOn} nulls last`),
    db
      .select({
        id: event.id,
        title: event.title,
        status: event.status,
        startsAt: event.startsAt,
      })
      .from(event)
      .where(
        and(
          eq(event.boardYearId, boardYearId),
          eq(event.leadUserId, holder.userId),
          isNull(event.deletedAt),
        ),
      )
      .orderBy(desc(event.startsAt)),
    db
      .select({
        id: reimbursement.id,
        amount: reimbursement.amount,
        status: reimbursement.status,
        purchasedOn: reimbursement.purchasedOn,
        description: expense.description,
      })
      .from(reimbursement)
      .innerJoin(expense, eq(expense.id, reimbursement.expenseId))
      .where(
        and(
          eq(expense.boardYearId, boardYearId),
          eq(reimbursement.claimantUserId, holder.userId),
          ne(reimbursement.status, "paid"),
          ne(reimbursement.status, "rejected"),
        ),
      ),
  ]);

  return { position: seat, holder, tasks, events, money };
}

/** Every position's packet for a year, for the transition screen. */
export async function handoverPackets(boardYearId: string) {
  const seats = await db
    .select({ id: position.id })
    .from(position)
    .where(eq(position.isActive, true))
    .orderBy(asc(position.sortOrder));

  const packets = await Promise.all(
    seats.map((seat) => handoverPacket(seat.id, boardYearId)),
  );
  return packets.filter((packet) => packet !== null);
}

/** Members marked as joining the next board, for the transition checklist. */
export async function incomingMembers() {
  return db
    .select({
      membershipId: membership.id,
      userId: user.id,
      name: user.name,
      email: user.email,
    })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.status, "incoming"))
    .orderBy(asc(user.name));
}
