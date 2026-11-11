import { relations } from "drizzle-orm";
import {
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { event } from "./work";

/**
 * The people and organisations SAIP deals with: vendors, speakers, campus offices,
 * partner groups. This is the knowledge that evaporates hardest at handover — nobody
 * writes down who the DJ was or which caterer let them down.
 *
 * Contacts deliberately carry no board year: they outlive the board that met them.
 */

export const contactKind = pgEnum("contact_kind", [
  "vendor",
  "speaker",
  "campus_office",
  "partner_group",
  "alum",
  "other",
]);

export const contact = pgTable(
  "contact",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    organisation: text(),
    kind: contactKind().notNull().default("other"),
    email: text(),
    phone: text(),
    /** What they are good for, what went wrong, what they charge. */
    notes: text(),
    lastUsedOn: date({ mode: "string" }),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("contact_kind_idx").on(t.kind, t.name)],
);

/** Which events used this contact, so "who did we use last time" has an answer. */
export const contactEvent = pgTable(
  "contact_event",
  {
    contactId: uuid()
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.eventId] })],
);

export const contactRelations = relations(contact, ({ many }) => ({
  events: many(contactEvent),
}));

export const contactEventRelations = relations(contactEvent, ({ one }) => ({
  contact: one(contact, {
    fields: [contactEvent.contactId],
    references: [contact.id],
  }),
  event: one(event, { fields: [contactEvent.eventId], references: [event.id] }),
}));
