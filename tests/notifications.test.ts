import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  attachment,
  boardYear,
  conversation,
  event,
  membership,
  message,
  notification,
  pushSubscription,
  task,
  user,
} from "@/db/schema";
import { grantCapabilities, loadMemberContext } from "@/lib/access";
import * as messages from "@/lib/messages/service";
import * as notifications from "@/lib/notifications/service";
import * as work from "@/lib/work/service";

const SUFFIX = `n${Date.now().toString(36)}`;
const created: string[] = [];
const events: string[] = [];
const tasks: string[] = [];
const conversations: string[] = [];

async function makeMember(name: string, capabilities: string[] = []) {
  const [person] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      name,
      email: `${name.toLowerCase().replace(/\s+/g, "-")}-${SUFFIX}@princeton.edu`,
    })
    .returning();
  created.push(person.id);

  const [access] = await db
    .insert(membership)
    .values({ userId: person.id, status: "active", joinedAt: new Date() })
    .returning();

  if (capabilities.length > 0) {
    await grantCapabilities(
      access.id,
      capabilities.map((c) => ({ capability: c as never })),
      null,
    );
  }

  const ctx = await loadMemberContext(person.id);
  if (!ctx) throw new Error("no context");
  return ctx;
}

let year: typeof boardYear.$inferSelect;
let amina: Awaited<ReturnType<typeof makeMember>>;
let kwame: Awaited<ReturnType<typeof makeMember>>;

beforeAll(async () => {
  const [current] = await db
    .select()
    .from(boardYear)
    .where(eq(boardYear.isCurrent, true))
    .limit(1);
  if (!current) throw new Error("Run `npm run db:seed` before the tests.");
  year = current;

  amina = await makeMember("Notif Amina", [
    "events.create",
    "tasks.assign_any",
    "channels.manage",
  ]);
  kwame = await makeMember("Notif Kwame", ["events.create"]);
});

afterAll(async () => {
  if (tasks.length > 0) await db.delete(task).where(inArray(task.id, tasks));
  if (events.length > 0) {
    await db.delete(conversation).where(inArray(conversation.subjectId, events));
    await db.delete(event).where(inArray(event.id, events));
  }
  if (conversations.length > 0) {
    await db.delete(conversation).where(inArray(conversation.id, conversations));
  }
  if (created.length > 0) await db.delete(user).where(inArray(user.id, created));
});

/* -------------------------------------------------------------------------- */

describe("notifications are recorded, not derived", () => {
  it("tells the assignee when a task is handed to them, and not the person handing it", async () => {
    const row = await work.createTask(amina, {
      boardYearId: year.id,
      title: `Order the food ${SUFFIX}`,
      assigneeUserId: kwame.userId,
      dueOn: "2026-12-01",
    });
    tasks.push(row.id);

    const theirs = await notifications.inbox(kwame);
    const mine = await notifications.inbox(amina);

    const hit = theirs.find((n) => n.href === `/tasks/${row.id}`);
    expect(hit).toBeDefined();
    expect(hit?.kind).toBe("task_assigned");
    expect(hit?.title).toContain("Notif Amina");
    expect(hit?.body).toContain("2026-12-01");
    expect(mine.some((n) => n.href === `/tasks/${row.id}`)).toBe(false);
  });

  it("says nothing when you give yourself a task", async () => {
    const before = (await notifications.inbox(amina)).length;
    const row = await work.createTask(amina, {
      boardYearId: year.id,
      title: `Mine alone ${SUFFIX}`,
    });
    tasks.push(row.id);
    expect((await notifications.inbox(amina)).length).toBe(before);
  });

  it("tells a channel's members about a message, and marks a mention as one", async () => {
    const channelId = await messages.createChannel(amina, {
      title: `notices ${SUFFIX}`,
      boardYearId: year.id,
    });
    conversations.push(channelId);

    await messages.send(amina, {
      conversationId: channelId,
      body: "Room is booked for Saturday.",
    });
    const plain = (await notifications.inbox(kwame)).find(
      (n) => n.href === `/messages/${channelId}`,
    );
    expect(plain?.kind).toBe("message");
    expect(plain?.body).toContain("Room is booked");

    await messages.send(amina, {
      conversationId: channelId,
      body: "@Notif can you confirm the room?",
    });
    const mention = (await notifications.inbox(kwame)).find(
      (n) => n.kind === "mention",
    );
    expect(mention).toBeDefined();
    expect(mention?.title).toContain("mentioned you");
  });

  it("counts unread, clears on read, and keeps dismissed ones in history", async () => {
    const fresh = await makeMember("Notif Reader");
    await notifications.notify([
      {
        userId: fresh.userId,
        kind: "message",
        title: "First",
        href: "/dashboard",
      },
      {
        userId: fresh.userId,
        kind: "message",
        title: "Second",
        href: "/dashboard",
      },
    ]);

    expect(await notifications.unreadCount(fresh)).toBe(2);

    const [first] = await notifications.inbox(fresh);
    await notifications.markRead(fresh, first.id);
    expect(await notifications.unreadCount(fresh)).toBe(1);

    await notifications.dismiss(fresh, first.id);
    const inbox = await notifications.inbox(fresh);
    expect(inbox.some((n) => n.id === first.id)).toBe(false);

    const history = await notifications.inbox(fresh, { includeDismissed: true });
    const kept = history.find((n) => n.id === first.id);
    expect(kept).toBeDefined();
    expect(kept?.dismissedAt).not.toBeNull();

    await notifications.markAllRead(fresh);
    expect(await notifications.unreadCount(fresh)).toBe(0);

    await notifications.dismissAll(fresh);
    expect(await notifications.inbox(fresh)).toHaveLength(0);
    expect(
      (await notifications.inbox(fresh, { includeDismissed: true })).length,
    ).toBe(2);
  });

  it("keeps one person's notifications away from another", async () => {
    const theirs = await notifications.inbox(kwame);
    const mine = await notifications.inbox(amina);
    const overlap = theirs.filter((t) => mine.some((m) => m.id === t.id));
    expect(overlap).toHaveLength(0);

    // Marking somebody else's notification read does nothing.
    const [one] = theirs;
    if (one) {
      await notifications.markRead(amina, one.id);
      const [row] = await db
        .select()
        .from(notification)
        .where(eq(notification.id, one.id));
      expect(row.readAt).toBeNull();
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("push subscriptions", () => {
  it("stores one per browser and replaces it rather than duplicating", async () => {
    const endpoint = `https://push.example.test/${SUFFIX}`;
    await notifications.saveSubscription(amina, {
      endpoint,
      p256dh: "key-one",
      auth: "auth-one",
      userAgent: "Chrome",
    });
    await notifications.saveSubscription(amina, {
      endpoint,
      p256dh: "key-two",
      auth: "auth-two",
      userAgent: "Chrome",
    });

    const rows = await db
      .select()
      .from(pushSubscription)
      .where(eq(pushSubscription.endpoint, endpoint));
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe("key-two");

    const listed = await notifications.subscriptionsFor(amina);
    expect(listed.some((s) => s.endpoint === endpoint)).toBe(true);

    await notifications.removeSubscription(amina, endpoint);
    expect(
      await db
        .select()
        .from(pushSubscription)
        .where(eq(pushSubscription.endpoint, endpoint)),
    ).toHaveLength(0);
  });

  it("refuses to let one member delete another's subscription", async () => {
    const endpoint = `https://push.example.test/${SUFFIX}-two`;
    await notifications.saveSubscription(amina, {
      endpoint,
      p256dh: "k",
      auth: "a",
    });

    await notifications.removeSubscription(kwame, endpoint);
    expect(
      await db
        .select()
        .from(pushSubscription)
        .where(eq(pushSubscription.endpoint, endpoint)),
    ).toHaveLength(1);

    await notifications.removeSubscription(amina, endpoint);
  });

  it("records a notification even when nothing is subscribed", async () => {
    const quiet = await makeMember("Notif Quiet");
    const sent = await notifications.sendTestNotification(quiet);
    expect(sent).toBe(0);

    const inbox = await notifications.inbox(quiet);
    expect(inbox[0].title).toBe("Notifications are working");
    expect(inbox[0].body).toContain("No browser is registered");
  });
});

/* -------------------------------------------------------------------------- */

describe("attachments in object discussions", () => {
  it("keeps a file with the message it was posted on", async () => {
    const party = await work.createEvent(amina, {
      boardYearId: year.id,
      title: `Attachment event ${SUFFIX}`,
    });
    events.push(party.id);

    const thread = await work.ensureThread({
      subjectType: "event",
      subjectId: party.id,
      title: party.title,
      boardYearId: year.id,
      createdBy: amina.userId,
    });

    const posted = await work.postMessage(amina, {
      conversationId: thread.id,
      body: "Quote from the caterer.",
      attachments: [
        {
          filename: "quote.pdf",
          contentType: "application/pdf",
          byteSize: 2048,
          storageKey: `2026-11/${SUFFIX}-quote`,
        },
      ],
    });

    const rows = await work.messagesIn(thread.id);
    const mine = rows.find((r) => r.id === posted.id);
    expect(mine?.files).toHaveLength(1);
    expect(mine?.files[0].filename).toBe("quote.pdf");

    const stored = await db
      .select()
      .from(attachment)
      .where(eq(attachment.messageId, posted.id));
    expect(stored[0].uploadedBy).toBe(amina.userId);
  });

  it("accepts a message that is only a file, and still refuses an empty one", async () => {
    const party = await work.createEvent(amina, {
      boardYearId: year.id,
      title: `Empty body event ${SUFFIX}`,
    });
    events.push(party.id);

    const thread = await work.ensureThread({
      subjectType: "event",
      subjectId: party.id,
      title: party.title,
      boardYearId: year.id,
      createdBy: amina.userId,
    });

    const fileOnly = await work.postMessage(amina, {
      conversationId: thread.id,
      body: "   ",
      attachments: [
        {
          filename: "poster.png",
          contentType: "image/png",
          byteSize: 1024,
          storageKey: `2026-11/${SUFFIX}-poster`,
        },
      ],
    });
    expect(fileOnly.body).toBe("");

    await expect(
      work.postMessage(amina, { conversationId: thread.id, body: "  " }),
    ).rejects.toBeInstanceOf(work.ValidationError);
  });

  it("serves a thread file only through the conversation check", async () => {
    const party = await work.createEvent(amina, {
      boardYearId: year.id,
      title: `Served event ${SUFFIX}`,
    });
    events.push(party.id);

    const thread = await work.ensureThread({
      subjectType: "event",
      subjectId: party.id,
      title: party.title,
      boardYearId: year.id,
      createdBy: amina.userId,
    });
    const posted = await work.postMessage(amina, {
      conversationId: thread.id,
      body: "Receipt",
      attachments: [
        {
          filename: "receipt.pdf",
          contentType: "application/pdf",
          byteSize: 512,
          storageKey: `2026-11/${SUFFIX}-receipt`,
        },
      ],
    });

    const [file] = await db
      .select()
      .from(attachment)
      .where(eq(attachment.messageId, posted.id));

    // An event thread is part of the record, so any board member may read it.
    const allowed = await messages.attachmentFor(kwame, file.id);
    expect(allowed?.filename).toBe("receipt.pdf");

    await db.delete(message).where(eq(message.id, posted.id));
  });
});
