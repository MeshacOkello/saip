import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  boardYear,
  checklistItem,
  conversation,
  conversationParticipant,
  event,
  meeting,
  membership,
  message,
  task,
  user,
} from "@/db/schema";
import { AccessError, grantCapabilities, loadMemberContext } from "@/lib/access";
import * as work from "@/lib/work/service";
import { ValidationError } from "@/lib/work/service";

const SUFFIX = `w${Date.now().toString(36)}`;
const created: string[] = [];
const events: string[] = [];
const meetings: string[] = [];
const tasks: string[] = [];

/** Tracks every task the tests create so teardown removes only those. */
async function addTask(
  actor: Awaited<ReturnType<typeof makeMember>>,
  input: Parameters<typeof work.createTask>[1],
) {
  const row = await work.createTask(actor, input);
  tasks.push(row.id);
  return row;
}

async function makeMember(name: string, capabilities: string[]) {
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
let lead: Awaited<ReturnType<typeof makeMember>>;
let officer: Awaited<ReturnType<typeof makeMember>>;
let outsider: Awaited<ReturnType<typeof makeMember>>;

beforeAll(async () => {
  const [current] = await db
    .select()
    .from(boardYear)
    .where(eq(boardYear.isCurrent, true))
    .limit(1);
  if (!current) throw new Error("Run `npm run db:seed` before the tests.");
  year = current;

  lead = await makeMember("Work Lead", [
    "events.create",
    "events.manage",
    "tasks.assign_any",
    "meetings.manage",
  ]);
  officer = await makeMember("Work Officer", ["events.create"]);
  outsider = await makeMember("Work Outsider", []);
});

afterAll(async () => {
  // Threads hang off their subject by id rather than a foreign key, so removing a
  // test's events means removing their threads too.
  const subjects = [...events, ...meetings];
  if (subjects.length > 0) {
    await db.delete(conversation).where(inArray(conversation.subjectId, subjects));
  }
  if (tasks.length > 0) await db.delete(task).where(inArray(task.id, tasks));
  if (meetings.length > 0) {
    await db.delete(task).where(inArray(task.meetingId, meetings));
    await db.delete(meeting).where(inArray(meeting.id, meetings));
  }
  if (events.length > 0) await db.delete(event).where(inArray(event.id, events));
  if (created.length > 0) await db.delete(user).where(inArray(user.id, created));
});

async function makeEvent(actor: typeof lead, title: string) {
  const row = await work.createEvent(actor, { boardYearId: year.id, title });
  events.push(row.id);
  return row;
}

describe("events", () => {
  it("refuses to create one without events.create", async () => {
    await expect(
      work.createEvent(outsider, { boardYearId: year.id, title: "Blocked" }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("makes the creator the lead and puts them on the team", async () => {
    const row = await makeEvent(lead, `Field Day ${SUFFIX}`);
    const full = await work.getEvent(row.id);
    expect(full?.leadUserId).toBe(lead.userId);
    expect(full?.team.map((t) => t.role)).toContain("lead");
  });

  it("lets only the lead or events.manage edit it", async () => {
    const row = await makeEvent(lead, `Guarded ${SUFFIX}`);
    await expect(
      work.updateEvent(officer, { eventId: row.id, title: "Hijacked" }),
    ).rejects.toBeInstanceOf(AccessError);

    const updated = await work.updateEvent(lead, {
      eventId: row.id,
      status: "confirmed",
    });
    expect(updated.status).toBe("confirmed");
  });

  it("copies a previous event's checklist, unticked", async () => {
    const source = await makeEvent(lead, `Potluck ${SUFFIX}`);
    await work.addChecklistItem(lead, { eventId: source.id, label: "Book the room" });
    const item = await work.addChecklistItem(lead, {
      eventId: source.id,
      label: "Order the food",
    });
    await work.setChecklistItem(lead, { itemId: item.id, done: true });

    const copy = await work.cloneEvent(lead, {
      sourceId: source.id,
      boardYearId: year.id,
      title: `Potluck ${SUFFIX} (next year)`,
    });
    events.push(copy.id);

    const items = await db
      .select()
      .from(checklistItem)
      .where(eq(checklistItem.eventId, copy.id));

    expect(items).toHaveLength(2);
    expect(items.every((i) => !i.done)).toBe(true);
    expect(copy.clonedFromId).toBe(source.id);
    expect(copy.status).toBe("planning");
  });
});

describe("tasks", () => {
  it("lets anyone give themselves a task", async () => {
    const row = await addTask(outsider, {
      boardYearId: year.id,
      title: "Mine to do",
    });
    expect(row.assigneeUserId).toBe(outsider.userId);
  });

  it("refuses to assign work to someone else without tasks.assign_any", async () => {
    await expect(
      work.createTask(officer, {
        boardYearId: year.id,
        title: "Yours to do",
        assigneeUserId: lead.userId,
      }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("refuses to let a stranger change someone else's task", async () => {
    const row = await addTask(lead, {
      boardYearId: year.id,
      title: "Lead's task",
    });
    await expect(
      work.updateTask(outsider, { taskId: row.id, status: "done" }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("records completion when a task is marked done", async () => {
    const row = await addTask(officer, {
      boardYearId: year.id,
      title: "Finish me",
    });
    const done = await work.updateTask(officer, { taskId: row.id, status: "done" });
    expect(done.completedAt).not.toBeNull();
  });
});

describe("threads", () => {
  it("creates one thread per subject and reuses it", async () => {
    const row = await makeEvent(lead, `Threaded ${SUFFIX}`);
    const first = await work.ensureThread({
      subjectType: "event",
      subjectId: row.id,
      title: row.title,
      boardYearId: year.id,
      createdBy: lead.userId,
    });
    const again = await work.ensureThread({
      subjectType: "event",
      subjectId: row.id,
      title: row.title,
      boardYearId: year.id,
      createdBy: officer.userId,
    });
    expect(again.id).toBe(first.id);
  });

  it("turns a message into a task that points back at the event", async () => {
    const row = await makeEvent(lead, `Discussed ${SUFFIX}`);
    const thread = await work.ensureThread({
      subjectType: "event",
      subjectId: row.id,
      title: row.title,
      boardYearId: year.id,
      createdBy: lead.userId,
    });
    const posted = await work.postMessage(lead, {
      conversationId: thread.id,
      body: "Someone needs to confirm the price with Five Loaves.",
    });

    const source = await work.messageById(posted.id);
    expect(source?.subjectId).toBe(row.id);

    const made = await addTask(lead, {
      boardYearId: year.id,
      title: "Confirm the price",
      eventId: source!.subjectId,
      fromMessageId: source!.id,
    });

    expect(made.eventId).toBe(row.id);
    expect(made.fromMessageId).toBe(posted.id);

    const [stored] = await db.select().from(task).where(eq(task.id, made.id));
    expect(stored.fromMessageId).toBe(posted.id);
  });

  it("keeps private conversations away from everyone else, administrators included", async () => {
    const [priv] = await db
      .insert(conversation)
      .values({
        type: "direct",
        isPrivate: true,
        title: "Private",
        createdBy: lead.userId,
      })
      .returning();
    await db
      .insert(conversationParticipant)
      .values({ conversationId: priv.id, userId: lead.userId });

    // `lead` holds events.manage and tasks.assign_any; none of that opens a DM.
    await expect(
      work.assertCanReadConversation(officer, priv.id),
    ).rejects.toBeInstanceOf(AccessError);
    await expect(
      work.postMessage(officer, { conversationId: priv.id, body: "let me in" }),
    ).rejects.toBeInstanceOf(AccessError);

    await expect(
      work.assertCanReadConversation(lead, priv.id),
    ).resolves.toBeUndefined();

    await db.delete(message).where(eq(message.conversationId, priv.id));
    await db.delete(conversation).where(eq(conversation.id, priv.id));
  });
});

describe("meetings", () => {
  it("refuses to schedule one without meetings.manage", async () => {
    await expect(
      work.createMeeting(officer, {
        boardYearId: year.id,
        title: "Blocked",
        startsAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("turns an action item into a real task on the meeting", async () => {
    const m = await work.createMeeting(lead, {
      boardYearId: year.id,
      title: `Board meeting ${SUFFIX}`,
      startsAt: new Date(),
      agenda: "Potluck\nBudget",
    });
    meetings.push(m.id);

    await addTask(lead, {
      boardYearId: year.id,
      title: "Send the RSVP form",
      meetingId: m.id,
      assigneeUserId: officer.userId,
    });

    const full = await work.getMeeting(m.id);
    expect(full?.actionItems).toHaveLength(1);
    expect(full?.actionItems[0].assigneeName).toBe("Work Officer");

    await db.delete(task).where(eq(task.meetingId, m.id));
    await db.delete(conversation).where(eq(conversation.subjectId, m.id));
  });

  it("refuses an empty title", async () => {
    await expect(
      work.createMeeting(lead, {
        boardYearId: year.id,
        title: " ",
        startsAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
