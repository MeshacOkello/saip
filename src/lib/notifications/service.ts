import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { sendNotification, setVapidDetails } from "web-push";

import { db } from "@/db";
import { notification, pushSubscription, user } from "@/db/schema";
import type { MemberContext } from "@/lib/access";

/**
 * Notifications are written when something happens and live until they are
 * dismissed, so "what did I miss" has an answer after the fact. Delivery to a
 * browser is best-effort on top: a failed push never loses the record.
 */

export type NotificationKind =
  (typeof notification.kind.enumValues)[number];

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:board@princeton.edu";

export const pushConfigured = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);

if (pushConfigured) {
  setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC!, VAPID_PRIVATE!);
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

type NewNotification = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href: string;
  actorUserId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
};

/**
 * Records notifications and tries to push them. Never throws: a notification is a
 * side effect of real work, and failing to tell somebody must not undo the work.
 */
export async function notify(entries: NewNotification[]) {
  const wanted = entries.filter((entry) => entry.userId);
  if (wanted.length === 0) return [];

  let rows: (typeof notification.$inferSelect)[] = [];
  try {
    rows = await db
      .insert(notification)
      .values(
        wanted.map((entry) => ({
          userId: entry.userId,
          kind: entry.kind,
          title: entry.title,
          body: entry.body ?? null,
          href: entry.href,
          actorUserId: entry.actorUserId ?? null,
          subjectType: entry.subjectType ?? null,
          subjectId: entry.subjectId ?? null,
        })),
      )
      .returning();
  } catch (error) {
    console.error("Could not record notifications", error);
    return [];
  }

  void deliver(rows);
  return rows;
}

/** Sends each notification to every browser its recipient has registered. */
async function deliver(rows: (typeof notification.$inferSelect)[]) {
  if (!pushConfigured || rows.length === 0) return;

  const userIds = [...new Set(rows.map((row) => row.userId))];
  const subscriptions = await db
    .select()
    .from(pushSubscription)
    .where(
      and(
        inArray(pushSubscription.userId, userIds),
        isNull(pushSubscription.failedAt),
      ),
    );

  await Promise.all(
    rows.flatMap((row) =>
      subscriptions
        .filter((sub) => sub.userId === row.userId)
        .map(async (sub) => {
          try {
            await sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify({
                title: row.title,
                body: row.body ?? "",
                href: row.href,
                id: row.id,
              }),
            );
            await db
              .update(pushSubscription)
              .set({ lastUsedAt: new Date() })
              .where(eq(pushSubscription.id, sub.id));
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            // 404 and 410 mean the browser threw the subscription away.
            if (status === 404 || status === 410) {
              await db
                .delete(pushSubscription)
                .where(eq(pushSubscription.id, sub.id));
            } else {
              await db
                .update(pushSubscription)
                .set({ failedAt: new Date() })
                .where(eq(pushSubscription.id, sub.id));
            }
          }
        }),
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Reading and state                                                          */
/* -------------------------------------------------------------------------- */

export async function inbox(
  actor: MemberContext,
  options?: { includeDismissed?: boolean; limit?: number },
) {
  const where = [eq(notification.userId, actor.userId)];
  if (!options?.includeDismissed) where.push(isNull(notification.dismissedAt));

  return db
    .select({
      id: notification.id,
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      href: notification.href,
      readAt: notification.readAt,
      dismissedAt: notification.dismissedAt,
      createdAt: notification.createdAt,
      actorName: user.name,
    })
    .from(notification)
    .leftJoin(user, eq(user.id, notification.actorUserId))
    .where(and(...where))
    .orderBy(desc(notification.createdAt))
    .limit(options?.limit ?? 50);
}

export async function unreadCount(actor: MemberContext) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notification)
    .where(
      and(
        eq(notification.userId, actor.userId),
        isNull(notification.readAt),
        isNull(notification.dismissedAt),
      ),
    );
  return row?.n ?? 0;
}

export async function markRead(actor: MemberContext, notificationId: string) {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notification.id, notificationId),
        eq(notification.userId, actor.userId),
      ),
    );
}

export async function markAllRead(actor: MemberContext) {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(
      and(eq(notification.userId, actor.userId), isNull(notification.readAt)),
    );
}

export async function dismiss(actor: MemberContext, notificationId: string) {
  await db
    .update(notification)
    .set({ dismissedAt: new Date(), readAt: new Date() })
    .where(
      and(
        eq(notification.id, notificationId),
        eq(notification.userId, actor.userId),
      ),
    );
}

export async function dismissAll(actor: MemberContext) {
  const now = new Date();
  await db
    .update(notification)
    .set({ dismissedAt: now, readAt: now })
    .where(
      and(
        eq(notification.userId, actor.userId),
        isNull(notification.dismissedAt),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* Push subscriptions                                                         */
/* -------------------------------------------------------------------------- */

export async function saveSubscription(
  actor: MemberContext,
  input: {
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
  },
) {
  const [row] = await db
    .insert(pushSubscription)
    .values({
      userId: actor.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        userId: actor.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        failedAt: null,
      },
    })
    .returning();
  return row;
}

export async function removeSubscription(
  actor: MemberContext,
  endpoint: string,
) {
  await db
    .delete(pushSubscription)
    .where(
      and(
        eq(pushSubscription.endpoint, endpoint),
        eq(pushSubscription.userId, actor.userId),
      ),
    );
}

export async function subscriptionsFor(actor: MemberContext) {
  return db
    .select({
      id: pushSubscription.id,
      userAgent: pushSubscription.userAgent,
      createdAt: pushSubscription.createdAt,
      lastUsedAt: pushSubscription.lastUsedAt,
      failedAt: pushSubscription.failedAt,
      endpoint: pushSubscription.endpoint,
    })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, actor.userId))
    .orderBy(desc(pushSubscription.createdAt));
}

/** Sends one notification to the signed-in person, to prove the plumbing works. */
export async function sendTestNotification(actor: MemberContext) {
  const subs = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(
      and(
        eq(pushSubscription.userId, actor.userId),
        isNull(pushSubscription.failedAt),
      ),
    );

  await notify([
    {
      userId: actor.userId,
      kind: "message",
      title: "Notifications are working",
      body:
        subs.length > 0
          ? `Sent to ${subs.length} registered browser${subs.length === 1 ? "" : "s"}.`
          : "Recorded here. No browser is registered for push yet.",
      href: "/notifications",
    },
  ]);

  return subs.length;
}

/** Everyone in a conversation except the person who caused the notification. */
export function recipients(userIds: string[], except: string) {
  return [...new Set(userIds)].filter((id) => id !== except);
}

