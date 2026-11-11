import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  attachment,
  conversation,
  conversationParticipant,
  membership,
  mention,
  message,
  user,
} from "@/db/schema";
import { AccessError, type MemberContext } from "@/lib/access";
import { notify, recipients } from "@/lib/notifications/service";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Direct messages, private groups and channels — the same conversation primitive the
 * object threads already use, with a different container type and participant list.
 *
 * The privacy rule is enforced here and nowhere else: a private conversation is
 * readable only by its participants, and no capability overrides that. Holding
 * `members.manage` does not open somebody's messages.
 */

export type ConversationKind = "direct" | "group" | "channel";

/* -------------------------------------------------------------------------- */
/* Access                                                                     */
/* -------------------------------------------------------------------------- */

export async function canRead(actor: MemberContext, conversationId: string) {
  const [row] = await db
    .select({ isPrivate: conversation.isPrivate, type: conversation.type })
    .from(conversation)
    .where(eq(conversation.id, conversationId))
    .limit(1);
  if (!row) return false;
  if (!row.isPrivate) return true;

  const [participant] = await db
    .select({ userId: conversationParticipant.userId })
    .from(conversationParticipant)
    .where(
      and(
        eq(conversationParticipant.conversationId, conversationId),
        eq(conversationParticipant.userId, actor.userId),
      ),
    )
    .limit(1);
  return Boolean(participant);
}

export async function assertCanRead(actor: MemberContext, conversationId: string) {
  if (!(await canRead(actor, conversationId))) {
    throw new AccessError("That conversation is private.");
  }
}

/* -------------------------------------------------------------------------- */
/* Creating conversations                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One direct conversation per pair, whoever opens it first. Looked up by the pair
 * rather than created blindly, so two people cannot end up with two DM threads.
 */
export async function openDirect(actor: MemberContext, otherUserId: string) {
  if (otherUserId === actor.userId) {
    throw new ValidationError("You cannot message yourself.");
  }

  const [other] = await db
    .select({ id: user.id })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.userId, otherUserId), ne(membership.status, "revoked")))
    .limit(1);
  if (!other) throw new ValidationError("That person is not on the board.");

  const existing = await db
    .select({ id: conversation.id })
    .from(conversation)
    .innerJoin(
      conversationParticipant,
      eq(conversationParticipant.conversationId, conversation.id),
    )
    .where(
      and(
        eq(conversation.type, "direct"),
        inArray(conversationParticipant.userId, [actor.userId, otherUserId]),
      ),
    )
    .groupBy(conversation.id)
    .having(sql`count(distinct ${conversationParticipant.userId}) = 2`);

  if (existing[0]) return existing[0].id;

  const [row] = await db
    .insert(conversation)
    .values({ type: "direct", isPrivate: true, createdBy: actor.userId })
    .returning();

  await db.insert(conversationParticipant).values([
    { conversationId: row.id, userId: actor.userId },
    { conversationId: row.id, userId: otherUserId },
  ]);

  return row.id;
}

export async function createGroup(
  actor: MemberContext,
  input: { title: string; userIds: string[] },
) {
  const title = input.title.trim();
  if (title.length < 2) throw new ValidationError("Give the group a name.");

  const people = Array.from(new Set([...input.userIds, actor.userId]));
  if (people.length < 2) {
    throw new ValidationError("Choose at least one other person.");
  }

  const [row] = await db
    .insert(conversation)
    .values({ type: "group", title, isPrivate: true, createdBy: actor.userId })
    .returning();

  await db
    .insert(conversationParticipant)
    .values(people.map((userId) => ({ conversationId: row.id, userId })));

  return row.id;
}

/**
 * A channel is part of the record: board-wide, permanent and searchable across years.
 * Creating one needs `channels.manage`, because it is not a private conversation.
 */
export async function createChannel(
  actor: MemberContext,
  input: { title: string; boardYearId: string | null },
) {
  if (!actor.capabilities.has("channels.manage")) {
    throw new AccessError("Missing capability: channels.manage");
  }
  const title = input.title.trim();
  if (title.length < 2) throw new ValidationError("Give the channel a name.");

  const [row] = await db
    .insert(conversation)
    .values({
      type: "channel",
      title,
      isPrivate: false,
      boardYearId: input.boardYearId,
      createdBy: actor.userId,
    })
    .returning();

  // Everyone with access is a participant of a channel, so unread state works.
  const members = await db
    .select({ userId: membership.userId })
    .from(membership)
    .where(ne(membership.status, "revoked"));

  await db
    .insert(conversationParticipant)
    .values(members.map((m) => ({ conversationId: row.id, userId: m.userId })))
    .onConflictDoNothing();

  return row.id;
}

export async function addToConversation(
  actor: MemberContext,
  input: { conversationId: string; userId: string },
) {
  await assertCanRead(actor, input.conversationId);
  const [row] = await db
    .select({ type: conversation.type })
    .from(conversation)
    .where(eq(conversation.id, input.conversationId))
    .limit(1);
  if (row?.type === "direct") {
    throw new ValidationError("A direct message is between two people.");
  }

  await db
    .insert(conversationParticipant)
    .values({ conversationId: input.conversationId, userId: input.userId })
    .onConflictDoNothing();
}

/** Leaving a group removes you from it; a channel you can always rejoin. */
export async function leaveConversation(
  actor: MemberContext,
  conversationId: string,
) {
  await db
    .delete(conversationParticipant)
    .where(
      and(
        eq(conversationParticipant.conversationId, conversationId),
        eq(conversationParticipant.userId, actor.userId),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

/** @name mentions, resolved against board members by name. */
function findMentions(body: string, members: { userId: string; name: string }[]) {
  const hits = new Set<string>();
  for (const member of members) {
    const first = member.name.split(/\s+/)[0];
    if (!first) continue;
    const pattern = new RegExp(`@${first}\\b`, "i");
    if (pattern.test(body)) hits.add(member.userId);
  }
  return [...hits];
}

export async function send(
  actor: MemberContext,
  input: {
    conversationId: string;
    body: string;
    attachments?: {
      filename: string;
      contentType: string;
      byteSize: number;
      storageKey: string;
    }[];
  },
) {
  await assertCanRead(actor, input.conversationId);

  const body = input.body.trim();
  if (body.length === 0 && (input.attachments?.length ?? 0) === 0) {
    throw new ValidationError("Write something, or attach a file.");
  }

  const [row] = await db
    .insert(message)
    .values({
      conversationId: input.conversationId,
      authorUserId: actor.userId,
      body,
    })
    .returning();

  if (input.attachments?.length) {
    await db.insert(attachment).values(
      input.attachments.map((file) => ({
        messageId: row.id,
        filename: file.filename,
        contentType: file.contentType,
        byteSize: file.byteSize,
        storageKey: file.storageKey,
        uploadedBy: actor.userId,
      })),
    );
  }

  const participants = await db
    .select({ userId: conversationParticipant.userId, name: user.name })
    .from(conversationParticipant)
    .innerJoin(user, eq(user.id, conversationParticipant.userId))
    .where(eq(conversationParticipant.conversationId, input.conversationId));

  const mentioned = findMentions(body, participants);
  if (mentioned.length > 0) {
    await db
      .insert(mention)
      .values(mentioned.map((userId) => ({ messageId: row.id, userId })))
      .onConflictDoNothing();
  }

  await db
    .update(conversation)
    .set({ lastMessageAt: row.createdAt })
    .where(eq(conversation.id, input.conversationId));

  const [head] = await db
    .select({ type: conversation.type, title: conversation.title })
    .from(conversation)
    .where(eq(conversation.id, input.conversationId))
    .limit(1);
  const where =
    head?.type === "channel"
      ? `#${head.title ?? "channel"}`
      : (head?.title ?? "your conversation");
  const preview = body.length > 140 ? `${body.slice(0, 140)}…` : body;
  const mentionedSet = new Set(mentioned);

  await notify(
    recipients(
      participants.map((p) => p.userId),
      actor.userId,
    ).map((userId) => ({
      userId,
      kind: mentionedSet.has(userId) ? ("mention" as const) : ("message" as const),
      title: mentionedSet.has(userId)
        ? `${actor.name} mentioned you in ${where}`
        : `${actor.name} in ${where}`,
      body: preview,
      href: `/messages/${input.conversationId}`,
      actorUserId: actor.userId,
      subjectType: "conversation",
      subjectId: input.conversationId,
    })),
  );

  // Sending counts as reading.
  await db
    .insert(conversationParticipant)
    .values({
      conversationId: input.conversationId,
      userId: actor.userId,
      lastReadAt: row.createdAt,
    })
    .onConflictDoUpdate({
      target: [conversationParticipant.conversationId, conversationParticipant.userId],
      set: { lastReadAt: row.createdAt },
    });

  return row;
}

export async function markRead(actor: MemberContext, conversationId: string) {
  await db
    .insert(conversationParticipant)
    .values({ conversationId, userId: actor.userId, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [conversationParticipant.conversationId, conversationParticipant.userId],
      set: { lastReadAt: new Date() },
    });
}

export async function deleteMessage(actor: MemberContext, messageId: string) {
  const [row] = await db
    .select({ authorUserId: message.authorUserId })
    .from(message)
    .where(eq(message.id, messageId))
    .limit(1);
  if (!row) throw new ValidationError("No such message.");
  if (row.authorUserId !== actor.userId) {
    throw new AccessError("You can only delete your own messages.");
  }
  await db
    .update(message)
    .set({ deletedAt: new Date() })
    .where(eq(message.id, messageId));
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/** Everything the viewer may see, newest activity first, with unread counts. */
export async function inbox(actor: MemberContext) {
  const rows = await db
    .select({
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      subjectType: conversation.subjectType,
      subjectId: conversation.subjectId,
      isPrivate: conversation.isPrivate,
      lastMessageAt: conversation.lastMessageAt,
      lastReadAt: conversationParticipant.lastReadAt,
      unread: sql<number>`(
        select count(*)::int from ${message} m
        where m.conversation_id = ${conversation.id}
          and m.deleted_at is null
          and m.author_user_id <> ${actor.userId}
          and (${conversationParticipant.lastReadAt} is null
               or m.created_at > ${conversationParticipant.lastReadAt})
      )`,
      preview: sql<string | null>`(
        select m.body from ${message} m
        where m.conversation_id = ${conversation.id} and m.deleted_at is null
        order by m.created_at desc limit 1
      )`,
    })
    .from(conversationParticipant)
    .innerJoin(
      conversation,
      eq(conversation.id, conversationParticipant.conversationId),
    )
    .where(
      and(
        eq(conversationParticipant.userId, actor.userId),
        ne(conversation.type, "thread"),
      ),
    )
    .orderBy(desc(conversation.lastMessageAt), desc(conversation.createdAt));

  // Direct conversations are named after the other person.
  const directIds = rows.filter((r) => r.type === "direct").map((r) => r.id);
  const others =
    directIds.length > 0
      ? await db
          .select({
            conversationId: conversationParticipant.conversationId,
            name: user.name,
            userId: user.id,
            image: user.image,
          })
          .from(conversationParticipant)
          .innerJoin(user, eq(user.id, conversationParticipant.userId))
          .where(
            and(
              inArray(conversationParticipant.conversationId, directIds),
              ne(conversationParticipant.userId, actor.userId),
            ),
          )
      : [];

  return rows.map((row) => {
    const other =
      row.type === "direct"
        ? others.find((o) => o.conversationId === row.id)
        : undefined;
    return {
      ...row,
      title:
        row.type === "direct"
          ? (other?.name ?? "Direct message")
          : (row.title ?? "Untitled"),
      // Only a direct conversation has a face: a group or channel is a place, not
      // a person, and borrowing one member's picture for it would mislead.
      otherUserId: other?.userId ?? null,
      otherImage: other?.image ?? null,
    };
  });
}

/**
 * What the Messages badge counts. Threads attached to an event, task or meeting are
 * left out on purpose: they are shown on the thing they belong to, not in the inbox,
 * so counting them here would point at a page that does not list them.
 */
export async function unreadTotal(actor: MemberContext) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum((
        select count(*) from ${message} m
        where m.conversation_id = ${conversationParticipant.conversationId}
          and m.deleted_at is null
          and m.author_user_id <> ${actor.userId}
          and (${conversationParticipant.lastReadAt} is null
               or m.created_at > ${conversationParticipant.lastReadAt})
      )), 0)::int`,
    })
    .from(conversationParticipant)
    .innerJoin(
      conversation,
      eq(conversation.id, conversationParticipant.conversationId),
    )
    .where(
      and(
        eq(conversationParticipant.userId, actor.userId),
        ne(conversation.type, "thread"),
      ),
    );
  return row?.total ?? 0;
}

export async function conversationWithMessages(
  actor: MemberContext,
  conversationId: string,
) {
  await assertCanRead(actor, conversationId);

  const [head] = await db
    .select()
    .from(conversation)
    .where(eq(conversation.id, conversationId))
    .limit(1);
  if (!head) return null;

  const [people, messages] = await Promise.all([
    db
      .select({ userId: user.id, name: user.name, image: user.image })
      .from(conversationParticipant)
      .innerJoin(user, eq(user.id, conversationParticipant.userId))
      .where(eq(conversationParticipant.conversationId, conversationId)),
    db
      .select({
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        authorId: message.authorUserId,
        authorName: user.name,
        authorImage: user.image,
      })
      .from(message)
      .leftJoin(user, eq(user.id, message.authorUserId))
      .where(and(eq(message.conversationId, conversationId), isNull(message.deletedAt)))
      .orderBy(asc(message.createdAt)),
  ]);

  const files =
    messages.length > 0
      ? await db
          .select()
          .from(attachment)
          .where(
            inArray(
              attachment.messageId,
              messages.map((m) => m.id),
            ),
          )
      : [];

  const title =
    head.type === "direct"
      ? (people.find((p) => p.userId !== actor.userId)?.name ?? "Direct message")
      : (head.title ?? "Untitled");

  return {
    ...head,
    title,
    people,
    messages: messages.map((m) => ({
      ...m,
      files: files.filter((f) => f.messageId === m.id),
    })),
  };
}

/**
 * Search across what the viewer may see. Private conversations they are not part of
 * are excluded by the join, not by a filter that could be forgotten.
 */
export async function search(actor: MemberContext, term: string) {
  const query = term.trim();
  if (query.length < 2) return [];

  return db
    .select({
      messageId: message.id,
      body: message.body,
      createdAt: message.createdAt,
      authorName: user.name,
      conversationId: conversation.id,
      conversationType: conversation.type,
      conversationTitle: conversation.title,
      subjectType: conversation.subjectType,
      subjectId: conversation.subjectId,
    })
    .from(message)
    .innerJoin(conversation, eq(conversation.id, message.conversationId))
    .leftJoin(user, eq(user.id, message.authorUserId))
    .leftJoin(
      conversationParticipant,
      and(
        eq(conversationParticipant.conversationId, conversation.id),
        eq(conversationParticipant.userId, actor.userId),
      ),
    )
    .where(
      and(
        isNull(message.deletedAt),
        sql`${message.body} ilike ${`%${query}%`}`,
        or(
          eq(conversation.isPrivate, false),
          sql`${conversationParticipant.userId} is not null`,
        ),
      ),
    )
    .orderBy(desc(message.createdAt))
    .limit(50);
}

/** Checks that a file may be served to this person before any bytes are read. */
export async function attachmentFor(actor: MemberContext, attachmentId: string) {
  const [row] = await db
    .select({
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      storageKey: attachment.storageKey,
      conversationId: message.conversationId,
    })
    .from(attachment)
    .innerJoin(message, eq(message.id, attachment.messageId))
    .where(eq(attachment.id, attachmentId))
    .limit(1);
  if (!row) return null;

  await assertCanRead(actor, row.conversationId);
  return row;
}
