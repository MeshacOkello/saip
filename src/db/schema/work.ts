import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { boardYear } from "./board";

/**
 * Events, tasks, meetings and the conversations attached to them.
 *
 * Two rules run through all of it:
 *  - every record is stamped with a board year, so the archive is a filter over live
 *    data rather than a second copy that drifts;
 *  - nothing is hard-deleted.
 */

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export const eventStatus = pgEnum("event_status", [
  "idea",
  "planning",
  "confirmed",
  "happened",
  "cancelled",
]);

/** Where the MyPrincetonU registration stands. Required before money is committed. */
export const registrationStatus = pgEnum("registration_status", [
  "not_started",
  "submitted",
  "approved",
  "not_required",
]);

export const event = pgTable(
  "event",
  {
    id: uuid().primaryKey().defaultRandom(),
    boardYearId: uuid()
      .notNull()
      .references(() => boardYear.id, { onDelete: "restrict" }),
    title: text().notNull(),
    summary: text(),
    status: eventStatus().notNull().default("idea"),
    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),
    location: text(),
    leadUserId: text().references(() => user.id, { onDelete: "set null" }),
    registration: registrationStatus().notNull().default("not_started"),

    /** Filled in after the event — the numbers next year's board actually needs. */
    turnout: integer(),
    whatWorked: text(),
    whatToAvoid: text(),

    /** Lineage, so "create from last year's" is visible rather than implied. */
    clonedFromId: uuid().references((): AnyPgColumn => event.id, {
      onDelete: "set null",
    }),

    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("event_year_idx").on(t.boardYearId, t.startsAt),
    index("event_status_idx").on(t.status),
  ],
);

/**
 * Who is doing what on this event. These are responsibilities, not permissions:
 * being publicity lead does not change what you can do in the application.
 */
export const eventRole = pgTable(
  "event_role",
  {
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text().notNull().default("team"),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

export const checklistItem = pgTable(
  "checklist_item",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    label: text().notNull(),
    done: boolean().notNull().default(false),
    doneBy: text().references(() => user.id, { onDelete: "set null" }),
    doneAt: timestamp({ withTimezone: true }),
    dueOn: date({ mode: "string" }),
    sortOrder: integer().notNull().default(100),
  },
  (t) => [index("checklist_event_idx").on(t.eventId, t.sortOrder)],
);

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

export const taskStatus = pgEnum("task_status", [
  "todo",
  "doing",
  "done",
  "cancelled",
]);

export const task = pgTable(
  "task",
  {
    id: uuid().primaryKey().defaultRandom(),
    boardYearId: uuid()
      .notNull()
      .references(() => boardYear.id, { onDelete: "restrict" }),
    title: text().notNull(),
    details: text(),
    status: taskStatus().notNull().default("todo"),
    assigneeUserId: text().references(() => user.id, { onDelete: "set null" }),
    dueOn: date({ mode: "string" }),

    /** A task may stand alone, belong to an event, or come out of a meeting. */
    eventId: uuid().references(() => event.id, { onDelete: "set null" }),
    meetingId: uuid().references((): AnyPgColumn => meeting.id, {
      onDelete: "set null",
    }),
    /** Set when the task was created from a message, so the thread stays reachable. */
    fromMessageId: uuid().references((): AnyPgColumn => message.id, {
      onDelete: "set null",
    }),
    /** The agenda item this came out of, when it came out of one. */
    agendaItemId: uuid().references((): AnyPgColumn => agendaItem.id, {
      onDelete: "set null",
    }),

    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("task_assignee_idx").on(t.assigneeUserId, t.status),
    index("task_due_idx").on(t.dueOn),
    index("task_event_idx").on(t.eventId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Meetings                                                                   */
/* -------------------------------------------------------------------------- */

export const meetingStatus = pgEnum("meeting_status", [
  "scheduled",
  "held",
  "cancelled",
]);

export const meeting = pgTable(
  "meeting",
  {
    id: uuid().primaryKey().defaultRandom(),
    boardYearId: uuid()
      .notNull()
      .references(() => boardYear.id, { onDelete: "restrict" }),
    title: text().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    location: text(),
    agenda: text(),
    minutes: text(),
    status: meetingStatus().notNull().default("scheduled"),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("meeting_year_idx").on(t.boardYearId, t.startsAt)],
);

export const attendance = pgTable(
  "attendance",
  {
    meetingId: uuid()
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    present: boolean().notNull().default(false),
    note: text(),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.userId] })],
);

/**
 * A decision the board actually took. This is what a message is promoted into when
 * it stops being conversation and becomes record.
 */
export const decision = pgTable(
  "decision",
  {
    id: uuid().primaryKey().defaultRandom(),
    boardYearId: uuid()
      .notNull()
      .references(() => boardYear.id, { onDelete: "restrict" }),
    meetingId: uuid().references(() => meeting.id, { onDelete: "set null" }),
    eventId: uuid().references(() => event.id, { onDelete: "set null" }),
    title: text().notNull(),
    detail: text(),
    decidedOn: date({ mode: "string" }).notNull(),
    recordedBy: text().references(() => user.id, { onDelete: "set null" }),
    fromMessageId: uuid().references((): AnyPgColumn => message.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("decision_year_idx").on(t.boardYearId, t.decidedOn)],
);

/* -------------------------------------------------------------------------- */
/* Conversations                                                              */
/* -------------------------------------------------------------------------- */

/**
 * One primitive, four containers. Threads on objects ship first; direct messages,
 * private groups and channels are the same rows with a different type and a
 * different participant list.
 */
export const conversationType = pgEnum("conversation_type", [
  "thread", // attached to an event, task or meeting
  "channel", // board-wide or topic, part of the record
  "group", // ad-hoc and private to its participants
  "direct", // two people, private
]);

export const conversation = pgTable(
  "conversation",
  {
    id: uuid().primaryKey().defaultRandom(),
    type: conversationType().notNull(),
    /** For threads: what this conversation is about. */
    subjectType: text(),
    subjectId: uuid(),
    title: text(),
    boardYearId: uuid().references(() => boardYear.id, { onDelete: "set null" }),
    /**
     * Private conversations are never part of the organisational archive and have no
     * administrative read path. Threads and channels are the record.
     */
    isPrivate: boolean().notNull().default(false),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("conversation_subject_unique").on(t.subjectType, t.subjectId),
    index("conversation_type_idx").on(t.type, t.lastMessageAt),
  ],
);

export const conversationParticipant = pgTable(
  "conversation_participant",
  {
    conversationId: uuid()
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastReadAt: timestamp({ withTimezone: true }),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const message = pgTable(
  "message",
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: uuid()
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    authorUserId: text().references(() => user.id, { onDelete: "set null" }),
    body: text().notNull(),
    replyToId: uuid().references((): AnyPgColumn => message.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("message_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const mention = pgTable(
  "mention",
  {
    messageId: uuid()
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] })],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const eventRelations = relations(event, ({ one, many }) => ({
  lead: one(user, { fields: [event.leadUserId], references: [user.id] }),
  year: one(boardYear, { fields: [event.boardYearId], references: [boardYear.id] }),
  team: many(eventRole),
  checklist: many(checklistItem),
  tasks: many(task),
}));

export const taskRelations = relations(task, ({ one }) => ({
  assignee: one(user, { fields: [task.assigneeUserId], references: [user.id] }),
  event: one(event, { fields: [task.eventId], references: [event.id] }),
  meeting: one(meeting, { fields: [task.meetingId], references: [meeting.id] }),
}));

export const meetingRelations = relations(meeting, ({ many }) => ({
  attendance: many(attendance),
  tasks: many(task),
  decisions: many(decision),
}));

export const conversationRelations = relations(conversation, ({ many }) => ({
  participants: many(conversationParticipant),
  messages: many(message),
}));

export const messageRelations = relations(message, ({ one, many }) => ({
  conversation: one(conversation, {
    fields: [message.conversationId],
    references: [conversation.id],
  }),
  author: one(user, { fields: [message.authorUserId], references: [user.id] }),
  mentions: many(mention),
}));

/* -------------------------------------------------------------------------- */
/* Attachments                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Files shared in a conversation. The bytes live outside the database; this row
 * records what the file is and which conversation it belongs to, which is what the
 * download route checks before serving it.
 */
export const attachment = pgTable(
  "attachment",
  {
    id: uuid().primaryKey().defaultRandom(),
    messageId: uuid()
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    filename: text().notNull(),
    contentType: text().notNull(),
    byteSize: integer().notNull(),
    /** Path relative to the upload directory — never a path the client supplied. */
    storageKey: text().notNull(),
    uploadedBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attachment_message_idx").on(t.messageId)],
);

export const attachmentRelations = relations(attachment, ({ one }) => ({
  message: one(message, {
    fields: [attachment.messageId],
    references: [message.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/* Agenda items                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A meeting's agenda, one row per item, so an item can carry its own notes and own
 * the action items that came out of it. The plain `meeting.agenda` text stays as a
 * quick way to draft a whole agenda at once.
 */
export const agendaItem = pgTable(
  "agenda_item",
  {
    id: uuid().primaryKey().defaultRandom(),
    meetingId: uuid()
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    title: text().notNull(),
    notes: text(),
    position: integer().notNull().default(100),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agenda_item_meeting_idx").on(t.meetingId, t.position)],
);

export const agendaItemRelations = relations(agendaItem, ({ one, many }) => ({
  meeting: one(meeting, {
    fields: [agendaItem.meetingId],
    references: [meeting.id],
  }),
  tasks: many(task),
}));
