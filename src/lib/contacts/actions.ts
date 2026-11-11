"use server";

import { revalidatePath } from "next/cache";

import { AccessError } from "@/lib/access";
import * as contacts from "@/lib/contacts/service";
import { ValidationError } from "@/lib/contacts/service";
import { requireMemberOrThrow } from "@/lib/session";

export type ActionState = { ok: boolean; error?: string; message?: string };

async function run(
  fn: (actor: Awaited<ReturnType<typeof requireMemberOrThrow>>) => Promise<unknown>,
  message?: string,
): Promise<ActionState> {
  try {
    const actor = await requireMemberOrThrow();
    await fn(actor);
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AccessError) {
      return { ok: false, error: error.message };
    }
    console.error(error);
    return { ok: false, error: "Something went wrong. Nothing was changed." };
  }
}

const str = (f: FormData, k: string) =>
  typeof f.get(k) === "string" ? (f.get(k) as string).trim() : "";
const opt = (f: FormData, k: string) => str(f, k) || null;

export async function createContactAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      contacts.createContact(actor, {
        name: str(f, "name"),
        organisation: opt(f, "organisation"),
        kind: str(f, "kind") || "other",
        email: opt(f, "email"),
        phone: opt(f, "phone"),
        notes: opt(f, "notes"),
      }),
    "Contact added.",
  );
}

export async function updateContactAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      contacts.updateContact(actor, {
        contactId: str(f, "contactId"),
        ...(f.has("name") ? { name: str(f, "name") } : {}),
        ...(f.has("organisation") ? { organisation: opt(f, "organisation") } : {}),
        ...(f.has("kind") ? { kind: str(f, "kind") } : {}),
        ...(f.has("email") ? { email: opt(f, "email") } : {}),
        ...(f.has("phone") ? { phone: opt(f, "phone") } : {}),
        ...(f.has("notes") ? { notes: opt(f, "notes") } : {}),
      }),
    "Saved.",
  );
}

export async function removeContactAction(_p: ActionState, f: FormData) {
  return run(
    (actor) => contacts.removeContact(actor, str(f, "contactId")),
    "Contact removed.",
  );
}

export async function linkContactAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      contacts.linkToEvent(actor, {
        contactId: str(f, "contactId"),
        eventId: str(f, "eventId"),
        note: opt(f, "note"),
      }),
    "Linked to the event.",
  );
}

export async function unlinkContactAction(_p: ActionState, f: FormData) {
  return run((actor) =>
    contacts.unlinkFromEvent(actor, {
      contactId: str(f, "contactId"),
      eventId: str(f, "eventId"),
    }),
  );
}
