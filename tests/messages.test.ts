import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  boardYear,
  conversation,
  conversationParticipant,
  membership,
  mention,
  message,
  user,
} from "@/db/schema";
import { AccessError, grantCapabilities, loadMemberContext } from "@/lib/access";
import * as messages from "@/lib/messages/service";
import { ValidationError } from "@/lib/messages/service";

const SUFFIX = `m${Date.now().toString(36)}`;
const created: string[] = [];
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
/** Holds every administrative capability, to prove none of them open a DM. */
let president: Awaited<ReturnType<typeof makeMember>>;

beforeAll(async () => {
  const [current] = await db
    .select()
    .from(boardYear)
    .where(eq(boardYear.isCurrent, true))
    .limit(1);
  if (!current) throw new Error("Run `npm run db:seed` before the tests.");
  year = current;

  amina = await makeMember("Msg Amina");
  kwame = await makeMember("Msg Kwame");
  president = await makeMember("Msg President", [
    "board.manage",
    "members.manage",
    "audit.view",
    "archive.view",
    "channels.manage",
  ]);
});

afterAll(async () => {
  if (conversations.length > 0) {
    await db.delete(conversation).where(inArray(conversation.id, conversations));
  }
  if (created.length > 0) await db.delete(user).where(inArray(user.id, created));
});

async function direct() {
  const id = await messages.openDirect(amina, kwame.userId);
  if (!conversations.includes(id)) conversations.push(id);
  return id;
}

describe("direct messages", () => {
  it("opens one conversation per pair, whoever starts it", async () => {
    const first = await direct();
    const second = await messages.openDirect(kwame, amina.userId);
    expect(second).toBe(first);
  });

  it("refuses to message yourself or somebody off the board", async () => {
    await expect(messages.openDirect(amina, amina.userId)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      messages.openDirect(amina, "nobody-at-all"),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("privacy", () => {
  it("keeps a direct message shut to everyone else, administrators included", async () => {
    const id = await direct();
    await messages.send(amina, { conversationId: id, body: "between us" });

    expect(await messages.canRead(amina, id)).toBe(true);
    expect(await messages.canRead(kwame, id)).toBe(true);
    expect(await messages.canRead(president, id)).toBe(false);

    await expect(
      messages.conversationWithMessages(president, id),
    ).rejects.toBeInstanceOf(AccessError);
    await expect(
      messages.send(president, { conversationId: id, body: "let me in" }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("keeps a private group shut to people who are not in it", async () => {
    const id = await messages.createGroup(amina, {
      title: `Potluck planning ${SUFFIX}`,
      userIds: [kwame.userId],
    });
    conversations.push(id);

    expect(await messages.canRead(kwame, id)).toBe(true);
    expect(await messages.canRead(president, id)).toBe(false);
  });

  it("leaves a private message out of search for everyone but its participants", async () => {
    const id = await direct();
    await messages.send(amina, {
      conversationId: id,
      body: `secret word ${SUFFIX}`,
    });

    const mine = await messages.search(amina, `secret word ${SUFFIX}`);
    expect(mine).toHaveLength(1);

    const theirs = await messages.search(president, `secret word ${SUFFIX}`);
    expect(theirs).toHaveLength(0);
  });
});

describe("channels", () => {
  it("needs channels.manage to create", async () => {
    await expect(
      messages.createChannel(amina, { title: "nope", boardYearId: year.id }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("is open to the whole board and searchable by anyone", async () => {
    const id = await messages.createChannel(president, {
      title: `announcements ${SUFFIX}`,
      boardYearId: year.id,
    });
    conversations.push(id);

    expect(await messages.canRead(amina, id)).toBe(true);

    await messages.send(president, {
      conversationId: id,
      body: `board wide notice ${SUFFIX}`,
    });

    const found = await messages.search(amina, `board wide notice ${SUFFIX}`);
    expect(found).toHaveLength(1);
    expect(found[0].conversationId).toBe(id);
  });
});

describe("unread state", () => {
  it("counts what you have not seen, ignores your own messages, and clears on read", async () => {
    const id = await messages.createChannel(president, {
      title: `unread ${SUFFIX}`,
      boardYearId: year.id,
    });
    conversations.push(id);

    await messages.send(president, { conversationId: id, body: "one" });
    await messages.send(president, { conversationId: id, body: "two" });

    const before = await messages.inbox(amina);
    expect(before.find((c) => c.id === id)?.unread).toBe(2);

    // Your own messages never count as unread for you.
    const senderView = await messages.inbox(president);
    expect(senderView.find((c) => c.id === id)?.unread).toBe(0);

    await messages.markRead(amina, id);
    const after = await messages.inbox(amina);
    expect(after.find((c) => c.id === id)?.unread).toBe(0);

    // The total is the sum across everything she is part of, not just this channel.
    const inboxNow = await messages.inbox(amina);
    const sum = inboxNow.reduce((total, row) => total + row.unread, 0);
    expect(await messages.unreadTotal(amina)).toBe(sum);
  });
});

describe("messages", () => {
  it("refuses an empty message with no attachment", async () => {
    const id = await direct();
    await expect(
      messages.send(amina, { conversationId: id, body: "   " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("records an @mention of a participant", async () => {
    const id = await direct();
    const sent = await messages.send(amina, {
      conversationId: id,
      body: "@Msg can you confirm the room?",
    });

    const hits = await db
      .select()
      .from(mention)
      .where(eq(mention.messageId, sent.id));
    expect(hits.length).toBeGreaterThan(0);
  });

  it("lets you delete only your own message", async () => {
    const id = await direct();
    const sent = await messages.send(amina, { conversationId: id, body: "mine" });

    await expect(messages.deleteMessage(kwame, sent.id)).rejects.toBeInstanceOf(
      AccessError,
    );

    await messages.deleteMessage(amina, sent.id);
    const [row] = await db.select().from(message).where(eq(message.id, sent.id));
    expect(row.deletedAt).not.toBeNull();

    const view = await messages.conversationWithMessages(amina, id);
    expect(view?.messages.some((m) => m.id === sent.id)).toBe(false);
  });

  it("drops you out of a group when you leave", async () => {
    const id = await messages.createGroup(amina, {
      title: `Leavers ${SUFFIX}`,
      userIds: [kwame.userId, president.userId],
    });
    conversations.push(id);

    await messages.leaveConversation(kwame, id);
    expect(await messages.canRead(kwame, id)).toBe(false);

    const rows = await db
      .select()
      .from(conversationParticipant)
      .where(eq(conversationParticipant.conversationId, id));
    expect(rows.map((r) => r.userId)).not.toContain(kwame.userId);
  });

  it("refuses a group with nobody else in it", async () => {
    const id = await messages.createGroup(amina, {
      title: `Two of us ${SUFFIX}`,
      userIds: [kwame.userId],
    });
    conversations.push(id);
    expect(id).toBeTypeOf("string");

    await expect(
      messages.createGroup(amina, { title: "Just me", userIds: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
