"use server";

import { revalidatePath } from "next/cache";

import { AccessError } from "@/lib/access";
import * as notifications from "@/lib/notifications/service";
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
    if (error instanceof AccessError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong." };
  }
}

const str = (f: FormData, k: string) =>
  typeof f.get(k) === "string" ? (f.get(k) as string).trim() : "";

export async function markReadAction(_p: ActionState, f: FormData) {
  return run((actor) => notifications.markRead(actor, str(f, "notificationId")));
}

export async function markAllReadAction(_p: ActionState) {
  return run((actor) => notifications.markAllRead(actor), "All marked read.");
}

export async function dismissAction(_p: ActionState, f: FormData) {
  return run((actor) => notifications.dismiss(actor, str(f, "notificationId")));
}

export async function dismissAllAction(_p: ActionState) {
  return run((actor) => notifications.dismissAll(actor), "Inbox cleared.");
}

export async function sendTestNotificationAction(_p: ActionState) {
  return run(async (actor) => {
    const count = await notifications.sendTestNotification(actor);
    return count;
  }, "Sent. Check this page and your browser.");
}

export async function removeSubscriptionAction(_p: ActionState, f: FormData) {
  return run(
    (actor) => notifications.removeSubscription(actor, str(f, "endpoint")),
    "That browser will no longer be pushed to.",
  );
}
