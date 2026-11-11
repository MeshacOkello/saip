import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { contact, contactEvent, event } from "@/db/schema";
import { AccessError, type MemberContext } from "@/lib/access";
import { recordAudit } from "@/lib/audit";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * The contact book. Every board member can read it — knowing who the caterer is
 * should never need a permission — and `contacts.manage` is what lets you change it.
 */
function needsManage(actor: MemberContext) {
  if (!actor.capabilities.has("contacts.manage")) {
    throw new AccessError("Missing capability: contacts.manage");
  }
}

export const CONTACT_KINDS = [
  "vendor",
  "speaker",
  "campus_office",
  "partner_group",
  "alum",
  "other",
] as const;

export const KIND_LABEL: Record<string, string> = {
  vendor: "Vendor",
  speaker: "Speaker",
  campus_office: "Campus office",
  partner_group: "Partner group",
  alum: "Alum",
  other: "Other",
};

export async function createContact(
  actor: MemberContext,
  input: {
    name: string;
    organisation?: string | null;
    kind: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  },
) {
  needsManage(actor);
  const name = input.name.trim();
  if (name.length < 2) throw new ValidationError("Give the contact a name.");
  if (!(CONTACT_KINDS as readonly string[]).includes(input.kind)) {
    throw new ValidationError("Unknown kind of contact.");
  }

  const [row] = await db
    .insert(contact)
    .values({
      name,
      organisation: input.organisation ?? null,
      kind: input.kind as "other",
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      createdBy: actor.userId,
    })
    .returning();

  await recordAudit({
    actorUserId: actor.userId,
    action: "contact.created",
    subjectType: "contact",
    subjectId: row.id,
    metadata: { name, kind: row.kind },
  });

  return row;
}

export async function updateContact(
  actor: MemberContext,
  input: {
    contactId: string;
    name?: string;
    organisation?: string | null;
    kind?: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    lastUsedOn?: string | null;
  },
) {
  needsManage(actor);

  const [row] = await db
    .update(contact)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.organisation !== undefined
        ? { organisation: input.organisation }
        : {}),
      ...(input.kind !== undefined ? { kind: input.kind as "other" } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.lastUsedOn !== undefined
        ? { lastUsedOn: input.lastUsedOn || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(contact.id, input.contactId))
    .returning();
  if (!row) throw new ValidationError("No such contact.");
  return row;
}

export async function removeContact(actor: MemberContext, contactId: string) {
  needsManage(actor);
  const [row] = await db
    .update(contact)
    .set({ deletedAt: new Date() })
    .where(eq(contact.id, contactId))
    .returning();
  await recordAudit({
    actorUserId: actor.userId,
    action: "contact.removed",
    subjectType: "contact",
    subjectId: contactId,
  });
  return row;
}

/** Records that an event used this contact, which is how "who did we use?" works. */
export async function linkToEvent(
  actor: MemberContext,
  input: { contactId: string; eventId: string; note?: string | null },
) {
  needsManage(actor);

  const [row] = await db
    .insert(contactEvent)
    .values({
      contactId: input.contactId,
      eventId: input.eventId,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: [contactEvent.contactId, contactEvent.eventId],
      set: { note: input.note ?? null },
    })
    .returning();

  const [used] = await db
    .select({ startsAt: event.startsAt })
    .from(event)
    .where(eq(event.id, input.eventId))
    .limit(1);
  if (used?.startsAt) {
    await db
      .update(contact)
      .set({ lastUsedOn: used.startsAt.toISOString().slice(0, 10) })
      .where(eq(contact.id, input.contactId));
  }

  return row;
}

export async function unlinkFromEvent(
  actor: MemberContext,
  input: { contactId: string; eventId: string },
) {
  needsManage(actor);
  await db
    .delete(contactEvent)
    .where(
      and(
        eq(contactEvent.contactId, input.contactId),
        eq(contactEvent.eventId, input.eventId),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export async function listContacts(filters?: { kind?: string; q?: string }) {
  const where = [isNull(contact.deletedAt)];
  if (filters?.kind && filters.kind !== "any") {
    where.push(eq(contact.kind, filters.kind as "other"));
  }
  if (filters?.q) {
    const term = `%${filters.q}%`;
    where.push(
      sql`(${contact.name} ilike ${term} or coalesce(${contact.organisation},'') ilike ${term} or coalesce(${contact.notes},'') ilike ${term})`,
    );
  }

  return db
    .select({
      id: contact.id,
      name: contact.name,
      organisation: contact.organisation,
      kind: contact.kind,
      email: contact.email,
      phone: contact.phone,
      notes: contact.notes,
      lastUsedOn: contact.lastUsedOn,
      timesUsed: sql<number>`(
        select count(*)::int from ${contactEvent}
        where ${contactEvent.contactId} = ${contact.id}
      )`,
    })
    .from(contact)
    .where(and(...where))
    .orderBy(asc(contact.name));
}

export async function contactById(contactId: string) {
  const [row] = await db
    .select()
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);
  if (!row) return null;

  const events = await db
    .select({
      eventId: event.id,
      title: event.title,
      startsAt: event.startsAt,
      note: contactEvent.note,
    })
    .from(contactEvent)
    .innerJoin(event, eq(event.id, contactEvent.eventId))
    .where(eq(contactEvent.contactId, contactId))
    .orderBy(desc(event.startsAt));

  return { ...row, events };
}

/** Contacts attached to one event, for the event workspace. */
export async function contactsForEvent(eventId: string) {
  return db
    .select({
      id: contact.id,
      name: contact.name,
      organisation: contact.organisation,
      kind: contact.kind,
      email: contact.email,
      phone: contact.phone,
      note: contactEvent.note,
    })
    .from(contactEvent)
    .innerJoin(contact, eq(contact.id, contactEvent.contactId))
    .where(and(eq(contactEvent.eventId, eventId), isNull(contact.deletedAt)))
    .orderBy(asc(contact.name));
}
