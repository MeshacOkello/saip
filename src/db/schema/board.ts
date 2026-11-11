import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/* -------------------------------------------------------------------------- */
/* Enumerations                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Describes where a person stands with the board. It is deliberately descriptive:
 * status is for display and filtering, it does NOT control access. Access is the set
 * of capability grants on the membership.
 */
export const membershipStatus = pgEnum("membership_status", [
  "invited", // invitation sent, not yet accepted
  "incoming", // next board, has partial access during handover
  "active",
  "outgoing", // term ending, grants expiring
  "alum", // archive only
  "revoked",
]);

export const appointmentEndReason = pgEnum("appointment_end_reason", [
  "term_ended",
  "resigned",
  "removed",
  "replaced",
]);

export const grantSource = pgEnum("grant_source", [
  "bundle", // seeded from the position's default bundle at appointment
  "handover", // applied from a position's handover preset
  "manual", // added by an administrator by hand
]);

/** When a handover preset's grant should take effect for an incoming officer. */
export const handoverTiming = pgEnum("handover_timing", [
  "immediately", // as soon as they are recorded as incoming
  "term_start", // on the first day of their term
]);

/* -------------------------------------------------------------------------- */
/* Board years                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every record in the application is stamped with a board year, which is what makes
 * the archive a filter over live data rather than a second copy of it.
 */
export const boardYear = pgTable("board_year", {
  id: uuid().primaryKey().defaultRandom(),
  label: text().notNull().unique(), // "2026/27"
  startsOn: date({ mode: "string" }).notNull(),
  endsOn: date({ mode: "string" }).notNull(),
  isCurrent: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* Positions, bundles, handover presets                                       */
/* -------------------------------------------------------------------------- */

/** A named set of capabilities. Editable data, not a constant. */
export const capabilityBundle = pgTable("capability_bundle", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  description: text(),
  /** System bundles may be edited but not deleted. */
  isSystem: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const bundleCapability = pgTable(
  "bundle_capability",
  {
    bundleId: uuid()
      .notNull()
      .references(() => capabilityBundle.id, { onDelete: "cascade" }),
    /** Validated against src/lib/capabilities.ts, not a database enum, so that adding
     * a capability does not require a migration. */
    capability: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.bundleId, t.capability] })],
);

/**
 * An organisational title. Never deleted — retired, so history keeps its meaning.
 */
export const position = pgTable("position", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  description: text(),
  responsibilities: text(),
  /** Seeds a new appointee's grants. Does not grant anything by itself. */
  defaultBundleId: uuid().references(() => capabilityBundle.id, {
    onDelete: "set null",
  }),
  sortOrder: text().notNull().default("50"),
  isActive: boolean().notNull().default(true),
  retiredAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * What an incoming holder of this position receives during the handover overlap.
 * Applied in one action by the President, then adjustable per person.
 */
export const positionHandoverGrant = pgTable(
  "position_handover_grant",
  {
    positionId: uuid()
      .notNull()
      .references(() => position.id, { onDelete: "cascade" }),
    capability: text().notNull(),
    timing: handoverTiming().notNull().default("immediately"),
  },
  (t) => [primaryKey({ columns: [t.positionId, t.capability] })],
);

/* -------------------------------------------------------------------------- */
/* Membership and access                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A person's access to the application. Separate from appointment: someone can have
 * access without a position (an advisor) or a position without access (a past officer
 * who exists only in the record).
 */
export const membership = pgTable(
  "membership",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: membershipStatus().notNull().default("invited"),
    invitedBy: text().references(() => user.id, { onDelete: "set null" }),
    invitedAt: timestamp({ withTimezone: true }),
    joinedAt: timestamp({ withTimezone: true }),
    leftAt: timestamp({ withTimezone: true }),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("membership_user_unique").on(t.userId)],
);

/**
 * The single mechanism behind progressive handover, automatic revocation when a term
 * ends, and temporary delegation: a capability that may be dated on either side.
 *
 * A grant is in effect when
 *   (effective_from IS NULL OR effective_from <= now)
 *   AND (expires_at IS NULL OR expires_at > now)
 *   AND revoked_at IS NULL
 */
export const capabilityGrant = pgTable(
  "capability_grant",
  {
    id: uuid().primaryKey().defaultRandom(),
    membershipId: uuid()
      .notNull()
      .references(() => membership.id, { onDelete: "cascade" }),
    capability: text().notNull(),
    effectiveFrom: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    source: grantSource().notNull().default("manual"),
    grantedBy: text().references(() => user.id, { onDelete: "set null" }),
    note: text(),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("capability_grant_membership_idx").on(t.membershipId, t.capability)],
);

/* -------------------------------------------------------------------------- */
/* Appointments                                                               */
/* -------------------------------------------------------------------------- */

export const appointment = pgTable(
  "appointment",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    positionId: uuid()
      .notNull()
      .references(() => position.id, { onDelete: "restrict" }),
    boardYearId: uuid()
      .notNull()
      .references(() => boardYear.id, { onDelete: "restrict" }),
    startedOn: date({ mode: "string" }).notNull(),
    endedOn: date({ mode: "string" }),
    endReason: appointmentEndReason(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appointment_year_idx").on(t.boardYearId),
    index("appointment_user_idx").on(t.userId),
    // A position can only be filled once at a time within a board year.
    uniqueIndex("appointment_open_seat_unique")
      .on(t.positionId, t.boardYearId)
      .where(sql`ended_on is null`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Invitations                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Access is invitation-only. Having a princeton.edu address grants nothing.
 */
export const invitation = pgTable(
  "invitation",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    positionId: uuid().references(() => position.id, { onDelete: "set null" }),
    bundleId: uuid().references(() => capabilityBundle.id, { onDelete: "set null" }),
    boardYearId: uuid().references(() => boardYear.id, { onDelete: "set null" }),
    /** Sets the membership status the invitee lands on: active or incoming. */
    intendedStatus: membershipStatus().notNull().default("active"),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    invitedBy: text().references(() => user.id, { onDelete: "set null" }),
    acceptedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invitation_email_idx").on(t.email)],
);

/* -------------------------------------------------------------------------- */
/* Audit log                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Append-only. Cheap to write now and impossible to backfill later.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorUserId: text().references(() => user.id, { onDelete: "set null" }),
    action: text().notNull(), // "member.invited", "grant.revoked", ...
    subjectType: text(),
    subjectId: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const membershipRelations = relations(membership, ({ one, many }) => ({
  user: one(user, { fields: [membership.userId], references: [user.id] }),
  grants: many(capabilityGrant),
}));

export const capabilityGrantRelations = relations(capabilityGrant, ({ one }) => ({
  membership: one(membership, {
    fields: [capabilityGrant.membershipId],
    references: [membership.id],
  }),
}));

export const positionRelations = relations(position, ({ one, many }) => ({
  defaultBundle: one(capabilityBundle, {
    fields: [position.defaultBundleId],
    references: [capabilityBundle.id],
  }),
  appointments: many(appointment),
  handoverGrants: many(positionHandoverGrant),
}));

export const appointmentRelations = relations(appointment, ({ one }) => ({
  user: one(user, { fields: [appointment.userId], references: [user.id] }),
  position: one(position, {
    fields: [appointment.positionId],
    references: [position.id],
  }),
  boardYear: one(boardYear, {
    fields: [appointment.boardYearId],
    references: [boardYear.id],
  }),
}));

export const capabilityBundleRelations = relations(capabilityBundle, ({ many }) => ({
  capabilities: many(bundleCapability),
}));

export const bundleCapabilityRelations = relations(bundleCapability, ({ one }) => ({
  bundle: one(capabilityBundle, {
    fields: [bundleCapability.bundleId],
    references: [capabilityBundle.id],
  }),
}));

export const positionHandoverGrantRelations = relations(
  positionHandoverGrant,
  ({ one }) => ({
    position: one(position, {
      fields: [positionHandoverGrant.positionId],
      references: [position.id],
    }),
  }),
);

/* -------------------------------------------------------------------------- */
/* Administration transfer                                                    */
/* -------------------------------------------------------------------------- */

export const adminTransferStatus = pgEnum("admin_transfer_status", [
  "pending",
  "accepted",
  "cancelled",
  "declined",
]);

/**
 * Handing over administration is a two-sided act: the outgoing administrator
 * nominates, the incoming one accepts, and both sides are recorded. It is never a
 * silent field edit, because losing administration is the one failure the board
 * cannot repair from inside the application.
 */
export const adminTransfer = pgTable(
  "admin_transfer",
  {
    id: uuid().primaryKey().defaultRandom(),
    fromUserId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toMembershipId: uuid()
      .notNull()
      .references(() => membership.id, { onDelete: "cascade" }),
    status: adminTransferStatus().notNull().default("pending"),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("admin_transfer_to_idx").on(t.toMembershipId, t.status)],
);
