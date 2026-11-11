import { relations } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Notifications are stored, not derived, so they can be read, dismissed and looked
 * back over. A row is a thing that happened to one person; the page it points at is
 * the real record.
 */
export const notificationKind = pgEnum("notification_kind", [
  "message",
  "mention",
  "task_assigned",
  "task_due",
  "admin_transfer",
  "reimbursement",
  "event",
  "meeting",
]);

export const notification = pgTable(
  "notification",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: notificationKind().notNull(),
    title: text().notNull(),
    body: text(),
    /** Where to go when it is clicked. */
    href: text().notNull(),
    /** Who caused it, when somebody did. */
    actorUserId: text().references(() => user.id, { onDelete: "set null" }),
    subjectType: text(),
    subjectId: text(),
    readAt: timestamp({ withTimezone: true }),
    dismissedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notification_inbox_idx").on(t.userId, t.dismissedAt, t.createdAt),
    index("notification_unread_idx").on(t.userId, t.readAt),
  ],
);

/**
 * A browser's push endpoint. One per browser per person, so somebody signed in on a
 * laptop and a phone gets both.
 */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }),
    failedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("push_subscription_user_idx").on(t.userId)],
);

export const notificationRelations = relations(notification, ({ one }) => ({
  recipient: one(user, {
    fields: [notification.userId],
    references: [user.id],
  }),
}));
