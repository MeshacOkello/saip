import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  agendaItem,
  attachment,
  attendance,
  checklistItem,
  conversation,
  conversationParticipant,
  decision,
  event,
  eventRole,
  meeting,
  message,
  task,
  user,
} from "@/db/schema";
import { AccessError, type MemberContext } from "@/lib/access";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications/service";
import type { Capability } from "@/lib/capabilities";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function need(actor: MemberContext, capability: Capability) {
  if (!actor.capabilities.has(capability)) {
    throw new AccessError(`Missing capability: ${capability}`);
  }
}

function text(value: string | null | undefined, field: string, min = 2) {
  const trimmed = (value ?? "").trim();
  if (trimmed.length < min) throw new ValidationError(`${field} is required.`);
  return trimmed;
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

/** Editing an event: the lead and the creator can, as can anyone with events.manage. */
async function assertCanEditEvent(actor: MemberContext, eventId: string) {
  if (actor.capabilities.has("events.manage")) return;
  const [row] = await db
    .select({ leadUserId: event.leadUserId, createdBy: event.createdBy })
    .from(event)
    .where(eq(event.id, eventId))
    .limit(1);
  if (!row) throw new ValidationError("No such event.");
  if (row.leadUserId !== actor.userId && row.createdBy !== actor.userId) {
    throw new AccessError("Only the event lead can change this event.");
  }
}

export async function createEvent(
  actor: MemberContext,
  input: {
    boardYearId: string;
    title: string;
    summary?: string | null;
    startsAt?: Date | null;
    location?: string | null;
    leadUserId?: string | null;
  },
) {
  need(actor, "events.create");

  const [row] = await db
    .insert(event)
    .values({
      boardYearId: input.boardYearId,
      title: text(input.title, "A title"),
      summary: input.summary ?? null,
      startsAt: input.startsAt ?? null,
      location: input.location ?? null,
      leadUserId: input.leadUserId ?? actor.userId,
      createdBy: actor.userId,
    })
    .returning();

  await db
    .insert(eventRole)
    .values({ eventId: row.id, userId: row.leadUserId ?? actor.userId, role: "lead" })
    .onConflictDoNothing();

  await recordAudit({
    actorUserId: actor.userId,
    action: "event.created",
    subjectType: "event",
    subjectId: row.id,
    metadata: { title: row.title },
  });

  return row;
}

/**
 * Create from a previous event. This is the feature that stops next year's board
 * re-deriving work this year's board already did — the 2024/25 notes contain the same
 * Field Day budget three times over.
 */
export async function cloneEvent(
  actor: MemberContext,
  input: {
    sourceId: string;
    boardYearId: string;
    title?: string;
    startsAt?: Date | null;
  },
) {
  need(actor, "events.create");

  const [source] = await db
    .select()
    .from(event)
    .where(eq(event.id, input.sourceId))
    .limit(1);
  if (!source) throw new ValidationError("No such event to copy.");

  const [row] = await db
    .insert(event)
    .values({
      boardYearId: input.boardYearId,
      title: input.title?.trim() || source.title,
      summary: source.summary,
      location: source.location,
      startsAt: input.startsAt ?? null,
      leadUserId: actor.userId,
      clonedFromId: source.id,
      createdBy: actor.userId,
      status: "planning",
    })
    .returning();

  // The checklist comes across unticked: it is the recipe, not the record.
  const items = await db
    .select()
    .from(checklistItem)
    .where(eq(checklistItem.eventId, source.id))
    .orderBy(asc(checklistItem.sortOrder));

  if (items.length > 0) {
    await db.insert(checklistItem).values(
      items.map((item) => ({
        eventId: row.id,
        label: item.label,
        sortOrder: item.sortOrder,
      })),
    );
  }

  await db
    .insert(eventRole)
    .values({ eventId: row.id, userId: actor.userId, role: "lead" })
    .onConflictDoNothing();

  await recordAudit({
    actorUserId: actor.userId,
    action: "event.cloned",
    subjectType: "event",
    subjectId: row.id,
    metadata: { from: source.id, title: row.title, checklistItems: items.length },
  });

  return row;
}

export async function updateEvent(
  actor: MemberContext,
  input: {
    eventId: string;
    title?: string;
    summary?: string | null;
    status?: "idea" | "planning" | "confirmed" | "happened" | "cancelled";
    startsAt?: Date | null;
    location?: string | null;
    leadUserId?: string | null;
    registration?: "not_started" | "submitted" | "approved" | "not_required";
    turnout?: number | null;
    whatWorked?: string | null;
    whatToAvoid?: string | null;
  },
) {
  await assertCanEditEvent(actor, input.eventId);

  const [row] = await db
    .update(event)
    .set({
      ...(input.title !== undefined ? { title: text(input.title, "A title") } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.leadUserId !== undefined ? { leadUserId: input.leadUserId } : {}),
      ...(input.registration !== undefined ? { registration: input.registration } : {}),
      ...(input.turnout !== undefined ? { turnout: input.turnout } : {}),
      ...(input.whatWorked !== undefined ? { whatWorked: input.whatWorked } : {}),
      ...(input.whatToAvoid !== undefined ? { whatToAvoid: input.whatToAvoid } : {}),
      updatedAt: new Date(),
    })
    .where(eq(event.id, input.eventId))
    .returning();

  if (input.leadUserId) {
    await db
      .insert(eventRole)
      .values({ eventId: row.id, userId: input.leadUserId, role: "lead" })
      .onConflictDoNothing();
  }

  return row;
}

export async function addChecklistItem(
  actor: MemberContext,
  input: { eventId: string; label: string },
) {
  await assertCanEditEvent(actor, input.eventId);

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${checklistItem.sortOrder}), 0) + 10` })
    .from(checklistItem)
    .where(eq(checklistItem.eventId, input.eventId));

  const [row] = await db
    .insert(checklistItem)
    .values({
      eventId: input.eventId,
      label: text(input.label, "A label"),
      sortOrder: next,
    })
    .returning();
  return row;
}

/** Ticking a checklist item is open to any board member — it is shared work. */
export async function setChecklistItem(
  actor: MemberContext,
  input: { itemId: string; done: boolean },
) {
  const [row] = await db
    .update(checklistItem)
    .set({
      done: input.done,
      doneBy: input.done ? actor.userId : null,
      doneAt: input.done ? new Date() : null,
    })
    .where(eq(checklistItem.id, input.itemId))
    .returning();
  if (!row) throw new ValidationError("No such checklist item.");
  return row;
}

export async function removeChecklistItem(
  actor: MemberContext,
  input: { itemId: string },
) {
  const [item] = await db
    .select({ eventId: checklistItem.eventId })
    .from(checklistItem)
    .where(eq(checklistItem.id, input.itemId))
    .limit(1);
  if (!item) throw new ValidationError("No such checklist item.");
  await assertCanEditEvent(actor, item.eventId);
  await db.delete(checklistItem).where(eq(checklistItem.id, input.itemId));
}

export async function setEventTeam(
  actor: MemberContext,
  input: { eventId: string; userId: string; role: string },
) {
  await assertCanEditEvent(actor, input.eventId);
  const [row] = await db
    .insert(eventRole)
    .values({
      eventId: input.eventId,
      userId: input.userId,
      role: input.role.trim() || "team",
    })
    .onConflictDoUpdate({
      target: [eventRole.eventId, eventRole.userId],
      set: { role: input.role.trim() || "team" },
    })
    .returning();
  return row;
}

export async function removeFromTeam(
  actor: MemberContext,
  input: { eventId: string; userId: string },
) {
  await assertCanEditEvent(actor, input.eventId);
  await db
    .delete(eventRole)
    .where(
      and(eq(eventRole.eventId, input.eventId), eq(eventRole.userId, input.userId)),
    );
}

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

export async function createTask(
  actor: MemberContext,
  input: {
    boardYearId: string;
    title: string;
    details?: string | null;
    assigneeUserId?: string | null;
    dueOn?: string | null;
    eventId?: string | null;
    meetingId?: string | null;
    agendaItemId?: string | null;
    fromMessageId?: string | null;
  },
) {
  const assignee = input.assigneeUserId ?? actor.userId;
  if (assignee !== actor.userId) need(actor, "tasks.assign_any");

  const [row] = await db
    .insert(task)
    .values({
      boardYearId: input.boardYearId,
      title: text(input.title, "A title"),
      details: input.details ?? null,
      assigneeUserId: assignee,
      dueOn: input.dueOn || null,
      eventId: input.eventId ?? null,
      meetingId: input.meetingId ?? null,
      agendaItemId: input.agendaItemId ?? null,
      fromMessageId: input.fromMessageId ?? null,
      createdBy: actor.userId,
    })
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "task.created",
    subjectType: "task",
    subjectId: row.id,
    metadata: { title: row.title, assignee },
  });

  if (assignee !== actor.userId) {
    await notify([
      {
        userId: assignee,
        kind: "task_assigned",
        title: `${actor.name} gave you a task`,
        body: row.dueOn ? `${row.title} — due ${row.dueOn}` : row.title,
        href: `/tasks/${row.id}`,
        actorUserId: actor.userId,
        subjectType: "task",
        subjectId: row.id,
      },
    ]);
  }

  return row;
}

/** The assignee owns their own task; anyone with tasks.assign_any can also act. */
async function assertCanEditTask(actor: MemberContext, taskId: string) {
  if (actor.capabilities.has("tasks.assign_any")) return;
  const [row] = await db
    .select({ assigneeUserId: task.assigneeUserId, createdBy: task.createdBy })
    .from(task)
    .where(eq(task.id, taskId))
    .limit(1);
  if (!row) throw new ValidationError("No such task.");
  if (row.assigneeUserId !== actor.userId && row.createdBy !== actor.userId) {
    throw new AccessError("That task belongs to someone else.");
  }
}

export async function updateTask(
  actor: MemberContext,
  input: {
    taskId: string;
    title?: string;
    details?: string | null;
    status?: "todo" | "doing" | "done" | "cancelled";
    assigneeUserId?: string | null;
    dueOn?: string | null;
  },
) {
  await assertCanEditTask(actor, input.taskId);
  if (input.assigneeUserId && input.assigneeUserId !== actor.userId) {
    need(actor, "tasks.assign_any");
  }

  const [row] = await db
    .update(task)
    .set({
      ...(input.title !== undefined ? { title: text(input.title, "A title") } : {}),
      ...(input.details !== undefined ? { details: input.details } : {}),
      ...(input.status !== undefined
        ? {
            status: input.status,
            completedAt: input.status === "done" ? new Date() : null,
          }
        : {}),
      ...(input.assigneeUserId !== undefined
        ? { assigneeUserId: input.assigneeUserId }
        : {}),
      ...(input.dueOn !== undefined ? { dueOn: input.dueOn || null } : {}),
    })
    .where(eq(task.id, input.taskId))
    .returning();

  return row;
}

export async function deleteTask(actor: MemberContext, input: { taskId: string }) {
  await assertCanEditTask(actor, input.taskId);
  const [row] = await db
    .update(task)
    .set({ deletedAt: new Date() })
    .where(eq(task.id, input.taskId))
    .returning();
  return row;
}

/* -------------------------------------------------------------------------- */
/* Meetings                                                                   */
/* -------------------------------------------------------------------------- */

export async function createMeeting(
  actor: MemberContext,
  input: {
    boardYearId: string;
    title: string;
    startsAt: Date;
    location?: string | null;
    agenda?: string | null;
  },
) {
  need(actor, "meetings.manage");

  const [row] = await db
    .insert(meeting)
    .values({
      boardYearId: input.boardYearId,
      title: text(input.title, "A title"),
      startsAt: input.startsAt,
      location: input.location ?? null,
      agenda: input.agenda ?? null,
      createdBy: actor.userId,
    })
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "meeting.created",
    subjectType: "meeting",
    subjectId: row.id,
    metadata: { title: row.title },
  });

  return row;
}

export async function updateMeeting(
  actor: MemberContext,
  input: {
    meetingId: string;
    title?: string;
    startsAt?: Date;
    location?: string | null;
    agenda?: string | null;
    minutes?: string | null;
    status?: "scheduled" | "held" | "cancelled";
  },
) {
  need(actor, "meetings.manage");

  const [row] = await db
    .update(meeting)
    .set({
      ...(input.title !== undefined ? { title: text(input.title, "A title") } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.agenda !== undefined ? { agenda: input.agenda } : {}),
      ...(input.minutes !== undefined ? { minutes: input.minutes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    })
    .where(eq(meeting.id, input.meetingId))
    .returning();
  if (!row) throw new ValidationError("No such meeting.");
  return row;
}

export async function setAttendance(
  actor: MemberContext,
  input: { meetingId: string; userId: string; present: boolean },
) {
  need(actor, "meetings.manage");
  const [row] = await db
    .insert(attendance)
    .values({
      meetingId: input.meetingId,
      userId: input.userId,
      present: input.present,
    })
    .onConflictDoUpdate({
      target: [attendance.meetingId, attendance.userId],
      set: { present: input.present },
    })
    .returning();
  return row;
}

export async function recordDecision(
  actor: MemberContext,
  input: {
    boardYearId: string;
    title: string;
    detail?: string | null;
    meetingId?: string | null;
    eventId?: string | null;
    decidedOn?: string;
    fromMessageId?: string | null;
  },
) {
  const [row] = await db
    .insert(decision)
    .values({
      boardYearId: input.boardYearId,
      title: text(input.title, "A decision"),
      detail: input.detail ?? null,
      meetingId: input.meetingId ?? null,
      eventId: input.eventId ?? null,
      decidedOn: input.decidedOn ?? new Date().toISOString().slice(0, 10),
      recordedBy: actor.userId,
      fromMessageId: input.fromMessageId ?? null,
    })
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "decision.recorded",
    subjectType: "decision",
    subjectId: row.id,
    metadata: { title: row.title },
  });

  return row;
}

/* -------------------------------------------------------------------------- */
/* Conversations                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Threads are created on demand: the first person to say something about an event
 * opens its thread. Everything else about them is the same as a channel or a direct
 * message, which is why they share one set of tables.
 */
export async function ensureThread(input: {
  subjectType: "event" | "task" | "meeting";
  subjectId: string;
  title: string;
  boardYearId: string | null;
  createdBy: string | null;
}) {
  const [existing] = await db
    .select()
    .from(conversation)
    .where(
      and(
        eq(conversation.subjectType, input.subjectType),
        eq(conversation.subjectId, input.subjectId),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [row] = await db
    .insert(conversation)
    .values({
      type: "thread",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      title: input.title,
      boardYearId: input.boardYearId,
      isPrivate: false,
      createdBy: input.createdBy,
    })
    .onConflictDoNothing()
    .returning();

  if (row) return row;

  const [raced] = await db
    .select()
    .from(conversation)
    .where(
      and(
        eq(conversation.subjectType, input.subjectType),
        eq(conversation.subjectId, input.subjectId),
      ),
    )
    .limit(1);
  return raced;
}

/**
 * Private conversations are readable only by their participants. There is no
 * administrative override: holding members.manage does not open someone's messages.
 */
export async function assertCanReadConversation(
  actor: MemberContext,
  conversationId: string,
) {
  const [row] = await db
    .select({ isPrivate: conversation.isPrivate })
    .from(conversation)
    .where(eq(conversation.id, conversationId))
    .limit(1);
  if (!row) throw new ValidationError("No such conversation.");
  if (!row.isPrivate) return;

  const [participant] = await db
    .select({ userId: conversationParticipant.userId })
    .from(conversationParticipant)
    .where(
      and(
        eq(conversationParticipant.conversationId, conversationId),
        eq(conversationParticipant.userId, actor.userId),
      ),
    )
    .limit(1);
  if (!participant) throw new AccessError("That conversation is private.");
}

export async function postMessage(
  actor: MemberContext,
  input: {
    conversationId: string;
    body: string;
    replyToId?: string | null;
    attachments?: {
      filename: string;
      contentType: string;
      byteSize: number;
      storageKey: string;
    }[];
  },
) {
  await assertCanReadConversation(actor, input.conversationId);

  const hasFiles = (input.attachments?.length ?? 0) > 0;
  const body = hasFiles ? input.body.trim() : text(input.body, "A message", 1);

  const [row] = await db
    .insert(message)
    .values({
      conversationId: input.conversationId,
      authorUserId: actor.userId,
      body,
      replyToId: input.replyToId ?? null,
    })
    .returning();

  if (input.attachments?.length) {
    await db.insert(attachment).values(
      input.attachments.map((file) => ({
        messageId: row.id,
        filename: file.filename,
        contentType: file.contentType,
        byteSize: file.byteSize,
        storageKey: file.storageKey,
        uploadedBy: actor.userId,
      })),
    );
  }

  await db
    .update(conversation)
    .set({ lastMessageAt: row.createdAt })
    .where(eq(conversation.id, input.conversationId));

  await db
    .insert(conversationParticipant)
    .values({
      conversationId: input.conversationId,
      userId: actor.userId,
      lastReadAt: row.createdAt,
    })
    .onConflictDoUpdate({
      target: [conversationParticipant.conversationId, conversationParticipant.userId],
      set: { lastReadAt: row.createdAt },
    });

  return row;
}

export async function messagesIn(conversationId: string) {
  const rows = await db
    .select({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      authorName: user.name,
      authorId: user.id,
    })
    .from(message)
    .leftJoin(user, eq(user.id, message.authorUserId))
    .where(and(eq(message.conversationId, conversationId), isNull(message.deletedAt)))
    .orderBy(asc(message.createdAt));

  if (rows.length === 0) return rows.map((row) => ({ ...row, files: [] }));

  const files = await db
    .select()
    .from(attachment)
    .where(
      inArray(
        attachment.messageId,
        rows.map((row) => row.id),
      ),
    );

  return rows.map((row) => ({
    ...row,
    files: files.filter((file) => file.messageId === row.id),
  }));
}

export async function messageById(messageId: string) {
  const [row] = await db
    .select({
      id: message.id,
      body: message.body,
      conversationId: message.conversationId,
      subjectType: conversation.subjectType,
      subjectId: conversation.subjectId,
      boardYearId: conversation.boardYearId,
    })
    .from(message)
    .innerJoin(conversation, eq(conversation.id, message.conversationId))
    .where(eq(message.id, messageId))
    .limit(1);
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export async function listEvents(boardYearId: string) {
  return db
    .select({
      id: event.id,
      title: event.title,
      status: event.status,
      startsAt: event.startsAt,
      location: event.location,
      turnout: event.turnout,
      leadName: user.name,
      openTasks: sql<number>`(
        select count(*)::int from ${task}
        where ${task.eventId} = ${event.id}
          and ${task.status} in ('todo','doing')
          and ${task.deletedAt} is null
      )`,
      checklistDone: sql<number>`(
        select count(*)::int from ${checklistItem}
        where ${checklistItem.eventId} = ${event.id} and ${checklistItem.done}
      )`,
      checklistTotal: sql<number>`(
        select count(*)::int from ${checklistItem}
        where ${checklistItem.eventId} = ${event.id}
      )`,
    })
    .from(event)
    .leftJoin(user, eq(user.id, event.leadUserId))
    .where(and(eq(event.boardYearId, boardYearId), isNull(event.deletedAt)))
    .orderBy(desc(event.startsAt), desc(event.createdAt));
}

/** Past events, for copying. Deliberately not limited to the current board year. */
export async function pastEvents() {
  return db
    .select({ id: event.id, title: event.title, startsAt: event.startsAt })
    .from(event)
    .where(isNull(event.deletedAt))
    .orderBy(desc(event.startsAt), desc(event.createdAt))
    .limit(50);
}

export async function getEvent(eventId: string) {
  const [row] = await db
    .select()
    .from(event)
    .where(eq(event.id, eventId))
    .limit(1);
  if (!row) return null;

  const [team, checklist, tasks] = await Promise.all([
    db
      .select({ userId: eventRole.userId, role: eventRole.role, name: user.name })
      .from(eventRole)
      .innerJoin(user, eq(user.id, eventRole.userId))
      .where(eq(eventRole.eventId, eventId)),
    db
      .select()
      .from(checklistItem)
      .where(eq(checklistItem.eventId, eventId))
      .orderBy(asc(checklistItem.sortOrder)),
    db
      .select({
        id: task.id,
        title: task.title,
        status: task.status,
        dueOn: task.dueOn,
        assigneeName: user.name,
      })
      .from(task)
      .leftJoin(user, eq(user.id, task.assigneeUserId))
      .where(and(eq(task.eventId, eventId), isNull(task.deletedAt)))
      .orderBy(asc(task.dueOn)),
  ]);

  return { ...row, team, checklist, tasks };
}

export async function listTasks(filters: {
  boardYearId: string;
  assigneeUserId?: string;
  includeDone?: boolean;
}) {
  const conditions = [
    eq(task.boardYearId, filters.boardYearId),
    isNull(task.deletedAt),
  ];
  if (filters.assigneeUserId) {
    conditions.push(eq(task.assigneeUserId, filters.assigneeUserId));
  }
  if (!filters.includeDone) {
    conditions.push(sql`${task.status} in ('todo','doing')`);
  }

  return db
    .select({
      id: task.id,
      title: task.title,
      details: task.details,
      status: task.status,
      dueOn: task.dueOn,
      assigneeUserId: task.assigneeUserId,
      assigneeName: user.name,
      eventId: task.eventId,
      eventTitle: event.title,
    })
    .from(task)
    .leftJoin(user, eq(user.id, task.assigneeUserId))
    .leftJoin(event, eq(event.id, task.eventId))
    .where(and(...conditions))
    .orderBy(sql`${task.dueOn} nulls last`, desc(task.createdAt));
}

export async function listMeetings(boardYearId: string) {
  return db
    .select({
      id: meeting.id,
      title: meeting.title,
      startsAt: meeting.startsAt,
      location: meeting.location,
      status: meeting.status,
      hasMinutes: sql<boolean>`${meeting.minutes} is not null and ${meeting.minutes} <> ''`,
      actionItems: sql<number>`(
        select count(*)::int from ${task}
        where ${task.meetingId} = ${meeting.id} and ${task.deletedAt} is null
      )`,
    })
    .from(meeting)
    .where(and(eq(meeting.boardYearId, boardYearId), isNull(meeting.deletedAt)))
    .orderBy(desc(meeting.startsAt));
}

export async function getMeeting(meetingId: string) {
  const [row] = await db
    .select()
    .from(meeting)
    .where(eq(meeting.id, meetingId))
    .limit(1);
  if (!row) return null;

  const [present, actionItems, decisions] = await Promise.all([
    db
      .select({ userId: attendance.userId, present: attendance.present })
      .from(attendance)
      .where(eq(attendance.meetingId, meetingId)),
    db
      .select({
        id: task.id,
        title: task.title,
        status: task.status,
        dueOn: task.dueOn,
        assigneeName: user.name,
      })
      .from(task)
      .leftJoin(user, eq(user.id, task.assigneeUserId))
      .where(and(eq(task.meetingId, meetingId), isNull(task.deletedAt)))
      .orderBy(asc(task.createdAt)),
    db
      .select()
      .from(decision)
      .where(eq(decision.meetingId, meetingId))
      .orderBy(desc(decision.decidedOn)),
  ]);

  return { ...row, attendance: present, actionItems, decisions };
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What a board member needs on the way in: what they owe, what is coming, and when
 * the board next meets. Deliberately not a summary of their permissions.
 */
export async function dashboardFor(userId: string, boardYearId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const [myTasks, upcoming, nextMeeting, recentEvents] = await Promise.all([
    db
      .select({
        id: task.id,
        title: task.title,
        status: task.status,
        dueOn: task.dueOn,
        eventId: task.eventId,
        eventTitle: event.title,
      })
      .from(task)
      .leftJoin(event, eq(event.id, task.eventId))
      .where(
        and(
          eq(task.boardYearId, boardYearId),
          eq(task.assigneeUserId, userId),
          isNull(task.deletedAt),
          sql`${task.status} in ('todo','doing')`,
        ),
      )
      .orderBy(sql`${task.dueOn} nulls last`)
      .limit(8),

    db
      .select({
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        location: event.location,
        status: event.status,
        leadName: user.name,
        openTasks: sql<number>`(
          select count(*)::int from ${task}
          where ${task.eventId} = ${event.id}
            and ${task.status} in ('todo','doing') and ${task.deletedAt} is null
        )`,
      })
      .from(event)
      .leftJoin(user, eq(user.id, event.leadUserId))
      .where(
        and(
          eq(event.boardYearId, boardYearId),
          isNull(event.deletedAt),
          sql`${event.status} in ('idea','planning','confirmed')`,
        ),
      )
      .orderBy(sql`${event.startsAt} nulls last`)
      .limit(6),

    db
      .select({
        id: meeting.id,
        title: meeting.title,
        startsAt: meeting.startsAt,
        location: meeting.location,
        agenda: meeting.agenda,
      })
      .from(meeting)
      .where(
        and(
          eq(meeting.boardYearId, boardYearId),
          isNull(meeting.deletedAt),
          eq(meeting.status, "scheduled"),
          gte(meeting.startsAt, now),
        ),
      )
      .orderBy(asc(meeting.startsAt))
      .limit(1),

    db
      .select({ id: event.id, title: event.title, turnout: event.turnout })
      .from(event)
      .where(
        and(
          eq(event.boardYearId, boardYearId),
          isNull(event.deletedAt),
          eq(event.status, "happened"),
        ),
      )
      .orderBy(desc(event.startsAt))
      .limit(3),
  ]);

  return {
    myTasks,
    overdue: myTasks.filter((t) => t.dueOn && t.dueOn < today).length,
    upcoming,
    nextMeeting: nextMeeting[0] ?? null,
    recentEvents,
  };
}

/** One task with the context it came from, for its detail view. */
export async function taskById(taskId: string) {
  const [row] = await db
    .select({
      id: task.id,
      boardYearId: task.boardYearId,
      title: task.title,
      details: task.details,
      status: task.status,
      dueOn: task.dueOn,
      assigneeUserId: task.assigneeUserId,
      assigneeName: user.name,
      eventId: task.eventId,
      meetingId: task.meetingId,
      fromMessageId: task.fromMessageId,
      createdBy: task.createdBy,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      deletedAt: task.deletedAt,
    })
    .from(task)
    .leftJoin(user, eq(user.id, task.assigneeUserId))
    .where(eq(task.id, taskId))
    .limit(1);
  if (!row) return null;

  const [eventRow] = row.eventId
    ? await db
        .select({ id: event.id, title: event.title })
        .from(event)
        .where(eq(event.id, row.eventId))
        .limit(1)
    : [];

  const [meetingRow] = row.meetingId
    ? await db
        .select({ id: meeting.id, title: meeting.title })
        .from(meeting)
        .where(eq(meeting.id, row.meetingId))
        .limit(1)
    : [];

  return { ...row, event: eventRow ?? null, meeting: meetingRow ?? null };
}

/** The events that currently have tasks, for filtering the task list. */
export async function eventsWithTasks(boardYearId: string) {
  return db
    .selectDistinct({ id: event.id, title: event.title })
    .from(task)
    .innerJoin(event, eq(event.id, task.eventId))
    .where(and(eq(task.boardYearId, boardYearId), isNull(task.deletedAt)))
    .orderBy(asc(event.title));
}

/* -------------------------------------------------------------------------- */
/* Agenda items                                                               */
/* -------------------------------------------------------------------------- */

export async function addAgendaItem(
  actor: MemberContext,
  input: { meetingId: string; title: string },
) {
  need(actor, "meetings.manage");

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${agendaItem.position}), 0) + 10` })
    .from(agendaItem)
    .where(eq(agendaItem.meetingId, input.meetingId));

  const [row] = await db
    .insert(agendaItem)
    .values({
      meetingId: input.meetingId,
      title: text(input.title, "An agenda item"),
      position: next,
      createdBy: actor.userId,
    })
    .returning();
  return row;
}

/**
 * Turns a drafted agenda — one item per line — into real items, so a meeting that
 * started as a scribbled list can still carry notes and action items per item.
 */
export async function importAgendaLines(
  actor: MemberContext,
  input: { meetingId: string; lines: string[] },
) {
  need(actor, "meetings.manage");
  const titles = input.lines.map((line) => line.trim()).filter(Boolean);
  if (titles.length === 0) throw new ValidationError("There is nothing to import.");

  return db
    .insert(agendaItem)
    .values(
      titles.map((title, index) => ({
        meetingId: input.meetingId,
        title,
        position: (index + 1) * 10,
        createdBy: actor.userId,
      })),
    )
    .returning();
}

export async function updateAgendaItem(
  actor: MemberContext,
  input: { agendaItemId: string; title?: string; notes?: string | null },
) {
  need(actor, "meetings.manage");
  const [row] = await db
    .update(agendaItem)
    .set({
      ...(input.title !== undefined
        ? { title: text(input.title, "An agenda item") }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    })
    .where(eq(agendaItem.id, input.agendaItemId))
    .returning();
  if (!row) throw new ValidationError("No such agenda item.");
  return row;
}

export async function removeAgendaItem(
  actor: MemberContext,
  input: { agendaItemId: string },
) {
  need(actor, "meetings.manage");
  await db.delete(agendaItem).where(eq(agendaItem.id, input.agendaItemId));
}

/** Agenda items with the action items that came out of each one. */
export async function agendaFor(meetingId: string) {
  const items = await db
    .select()
    .from(agendaItem)
    .where(eq(agendaItem.meetingId, meetingId))
    .orderBy(asc(agendaItem.position));

  if (items.length === 0) return [];

  const actions = await db
    .select({
      id: task.id,
      title: task.title,
      status: task.status,
      dueOn: task.dueOn,
      agendaItemId: task.agendaItemId,
      assigneeName: user.name,
    })
    .from(task)
    .leftJoin(user, eq(user.id, task.assigneeUserId))
    .where(
      and(
        inArray(
          task.agendaItemId,
          items.map((i) => i.id),
        ),
        isNull(task.deletedAt),
      ),
    )
    .orderBy(asc(task.createdAt));

  return items.map((item) => ({
    ...item,
    actions: actions.filter((a) => a.agendaItemId === item.id),
  }));
}
