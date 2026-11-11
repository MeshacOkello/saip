import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  agendaItem,
  appointment,
  boardYear,
  contact,
  conversation,
  event,
  expense,
  meeting,
  membership,
  position,
  reimbursement,
  task,
  user,
} from "@/db/schema";
import { AccessError, grantCapabilities, loadMemberContext } from "@/lib/access";
import * as contacts from "@/lib/contacts/service";
import * as finance from "@/lib/finance/service";
import * as transition from "@/lib/transition/service";
import * as work from "@/lib/work/service";

const SUFFIX = `c${Date.now().toString(36)}`;
const created: string[] = [];
const events: string[] = [];
const meetings: string[] = [];
const tasks: string[] = [];
const madeContacts: string[] = [];
const years: string[] = [];
const expenses: string[] = [];

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
let president: Awaited<ReturnType<typeof makeMember>>;
let officer: Awaited<ReturnType<typeof makeMember>>;

beforeAll(async () => {
  const [current] = await db
    .select()
    .from(boardYear)
    .where(eq(boardYear.isCurrent, true))
    .limit(1);
  if (!current) throw new Error("Run `npm run db:seed` before the tests.");
  year = current;

  president = await makeMember("Cont President", [
    "board.manage",
    "members.manage",
    "positions.manage",
    "contacts.manage",
    "meetings.manage",
    "events.create",
    "events.manage",
    "tasks.assign_any",
    "finance.view",
    "finance.edit",
  ]);
  officer = await makeMember("Cont Officer", ["events.create"]);
});

afterAll(async () => {
  if (tasks.length > 0) await db.delete(task).where(inArray(task.id, tasks));
  if (meetings.length > 0) {
    await db.delete(task).where(inArray(task.meetingId, meetings));
    await db.delete(conversation).where(inArray(conversation.subjectId, meetings));
    await db.delete(meeting).where(inArray(meeting.id, meetings));
  }
  if (expenses.length > 0) {
    await db.delete(reimbursement).where(inArray(reimbursement.expenseId, expenses));
    await db.delete(expense).where(inArray(expense.id, expenses));
  }
  if (events.length > 0) {
    await db.delete(conversation).where(inArray(conversation.subjectId, events));
    await db.delete(event).where(inArray(event.id, events));
  }
  if (madeContacts.length > 0)
    await db.delete(contact).where(inArray(contact.id, madeContacts));
  if (years.length > 0) await db.delete(boardYear).where(inArray(boardYear.id, years));
  if (created.length > 0) await db.delete(user).where(inArray(user.id, created));
});

/* -------------------------------------------------------------------------- */

describe("contacts", () => {
  it("needs contacts.manage to add one", async () => {
    await expect(
      contacts.createContact(officer, { name: "Blocked", kind: "vendor" }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("records a vendor and finds it by name, organisation or notes", async () => {
    const row = await contacts.createContact(president, {
      name: `Five Loaves ${SUFFIX}`,
      organisation: "Catering",
      kind: "vendor",
      notes: "Jollof is $75 a pan. Ask about delivery.",
    });
    madeContacts.push(row.id);

    const byName = await contacts.listContacts({ q: `Five Loaves ${SUFFIX}` });
    expect(byName).toHaveLength(1);

    const byNotes = await contacts.listContacts({ q: "jollof" });
    expect(byNotes.some((c) => c.id === row.id)).toBe(true);

    const byKind = await contacts.listContacts({ kind: "speaker" });
    expect(byKind.some((c) => c.id === row.id)).toBe(false);
  });

  it("refuses a nameless contact and an unknown kind", async () => {
    await expect(
      contacts.createContact(president, { name: " ", kind: "vendor" }),
    ).rejects.toBeInstanceOf(contacts.ValidationError);
    await expect(
      contacts.createContact(president, { name: "Someone", kind: "wizard" }),
    ).rejects.toBeInstanceOf(contacts.ValidationError);
  });

  it("links a contact to an event and remembers when they were last used", async () => {
    const row = await contacts.createContact(president, {
      name: `DJ ${SUFFIX}`,
      kind: "vendor",
    });
    madeContacts.push(row.id);

    const party = await work.createEvent(president, {
      boardYearId: year.id,
      title: `Afrobeats ${SUFFIX}`,
      startsAt: new Date("2026-09-20T22:00:00Z"),
    });
    events.push(party.id);

    await contacts.linkToEvent(president, {
      contactId: row.id,
      eventId: party.id,
      note: "Played until 2am",
    });

    const detail = await contacts.contactById(row.id);
    expect(detail?.events).toHaveLength(1);
    expect(detail?.lastUsedOn).toBe("2026-09-20");

    const onEvent = await contacts.contactsForEvent(party.id);
    expect(onEvent[0].note).toBe("Played until 2am");

    await contacts.unlinkFromEvent(president, {
      contactId: row.id,
      eventId: party.id,
    });
    expect(await contacts.contactsForEvent(party.id)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("agenda items", () => {
  async function makeMeeting() {
    const row = await work.createMeeting(president, {
      boardYearId: year.id,
      title: `Agenda meeting ${SUFFIX}`,
      startsAt: new Date(),
      agenda: "Potluck budget\nSenior send-off\n\nBoard applications",
    });
    meetings.push(row.id);
    return row;
  }

  it("needs meetings.manage", async () => {
    const m = await makeMeeting();
    await expect(
      work.addAgendaItem(officer, { meetingId: m.id, title: "Blocked" }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("turns a drafted agenda into items, in order, ignoring blank lines", async () => {
    const m = await makeMeeting();
    await work.importAgendaLines(president, {
      meetingId: m.id,
      lines: (m.agenda ?? "").split("\n"),
    });

    const items = await work.agendaFor(m.id);
    expect(items.map((i) => i.title)).toEqual([
      "Potluck budget",
      "Senior send-off",
      "Board applications",
    ]);
  });

  it("refuses an import with nothing in it", async () => {
    const m = await makeMeeting();
    await expect(
      work.importAgendaLines(president, { meetingId: m.id, lines: ["  ", ""] }),
    ).rejects.toBeInstanceOf(work.ValidationError);
  });

  it("keeps notes and action items with the item they belong to", async () => {
    const m = await makeMeeting();
    const item = await work.addAgendaItem(president, {
      meetingId: m.id,
      title: "Potluck budget",
    });
    const other = await work.addAgendaItem(president, {
      meetingId: m.id,
      title: "Senior send-off",
    });

    await work.updateAgendaItem(president, {
      agendaItemId: item.id,
      notes: "Five Loaves quoted $75 a pan.",
    });

    const action = await work.createTask(president, {
      boardYearId: year.id,
      title: "Confirm the jollof price",
      meetingId: m.id,
      agendaItemId: item.id,
      assigneeUserId: officer.userId,
    });
    tasks.push(action.id);

    const items = await work.agendaFor(m.id);
    const budget = items.find((i) => i.id === item.id);
    const sendOff = items.find((i) => i.id === other.id);

    expect(budget?.notes).toContain("$75 a pan");
    expect(budget?.actions.map((a) => a.title)).toEqual([
      "Confirm the jollof price",
    ]);
    expect(sendOff?.actions).toHaveLength(0);

    // It is still an ordinary task on the meeting, not a parallel kind of record.
    const full = await work.getMeeting(m.id);
    expect(full?.actionItems.some((a) => a.id === action.id)).toBe(true);
  });

  it("removes an item without taking the task with it", async () => {
    const m = await makeMeeting();
    const item = await work.addAgendaItem(president, {
      meetingId: m.id,
      title: "Temporary",
    });
    const action = await work.createTask(president, {
      boardYearId: year.id,
      title: "Survives its agenda item",
      meetingId: m.id,
      agendaItemId: item.id,
    });
    tasks.push(action.id);

    await work.removeAgendaItem(president, { agendaItemId: item.id });

    const [stillThere] = await db.select().from(task).where(eq(task.id, action.id));
    expect(stillThere).toBeDefined();
    expect(stillThere.agendaItemId).toBeNull();

    const gone = await db
      .select()
      .from(agendaItem)
      .where(eq(agendaItem.id, item.id));
    expect(gone).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("board years", () => {
  it("needs board.manage", async () => {
    await expect(
      transition.createBoardYear(officer, {
        label: `Blocked ${SUFFIX}`,
        startsOn: "2030-06-01",
        endsOn: "2031-05-31",
      }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("refuses a duplicate label and a term that ends before it starts", async () => {
    await expect(
      transition.createBoardYear(president, {
        label: year.label,
        startsOn: "2030-06-01",
        endsOn: "2031-05-31",
      }),
    ).rejects.toBeInstanceOf(transition.ValidationError);

    await expect(
      transition.createBoardYear(president, {
        label: `Backwards ${SUFFIX}`,
        startsOn: "2031-05-31",
        endsOn: "2030-06-01",
      }),
    ).rejects.toBeInstanceOf(transition.ValidationError);
  });

  it("creates the next year without disturbing the current one", async () => {
    const next = await transition.createBoardYear(president, {
      label: `2099/00 ${SUFFIX}`,
      startsOn: "2099-06-01",
      endsOn: "2100-05-31",
    });
    years.push(next.id);

    expect(next.isCurrent).toBe(false);
    const [stillCurrent] = await db
      .select()
      .from(boardYear)
      .where(eq(boardYear.id, year.id));
    expect(stillCurrent.isCurrent).toBe(true);
  });

  it("promotes one year and steps the other down", async () => {
    const next = await transition.createBoardYear(president, {
      label: `2098/99 ${SUFFIX}`,
      startsOn: "2098-06-01",
      endsOn: "2099-05-31",
    });
    years.push(next.id);

    await transition.makeBoardYearCurrent(president, next.id);

    const rows = await db.select().from(boardYear);
    expect(rows.filter((y) => y.isCurrent).map((y) => y.id)).toEqual([next.id]);

    // Put the real year back so the rest of the suite and the app are unaffected.
    await transition.makeBoardYearCurrent(president, year.id);
    const after = await db.select().from(boardYear);
    expect(after.filter((y) => y.isCurrent).map((y) => y.id)).toEqual([year.id]);
  });
});

/* -------------------------------------------------------------------------- */

describe("handover packets", () => {
  it("gathers a holder's open work and money still in flight", async () => {
    // Put the president in a seeded position for this year.
    const [treasurer] = await db
      .select()
      .from(position)
      .where(eq(position.slug, "treasurer"))
      .limit(1);
    expect(treasurer).toBeDefined();

    const [seatRow] = await db
      .insert(appointment)
      .values({
        userId: president.userId,
        positionId: treasurer.id,
        boardYearId: year.id,
        startedOn: year.startsOn,
      })
      .returning();

    const open = await work.createTask(president, {
      boardYearId: year.id,
      title: `Reconcile the ledger ${SUFFIX}`,
    });
    tasks.push(open.id);

    const spend = await finance.createExpense(president, {
      boardYearId: year.id,
      description: `Decorations ${SUFFIX}`,
      category: "supplies",
      route: "out_of_pocket",
      actualAmount: 4200,
      paidByUserId: president.userId,
      incurredOn: new Date().toISOString().slice(0, 10),
    });
    expenses.push(spend.id);

    const packet = await transition.handoverPacket(treasurer.id, year.id);
    expect(packet?.holder?.name).toBe("Cont President");
    expect(packet?.tasks.some((t) => t.id === open.id)).toBe(true);
    expect(packet?.money.some((m) => m.amount === 4200)).toBe(true);

    await db.delete(appointment).where(eq(appointment.id, seatRow.id));
  });

  it("says plainly when a position was never filled", async () => {
    const [vacant] = await db
      .select()
      .from(position)
      .where(eq(position.slug, "graduate-representative"))
      .limit(1);

    const packet = await transition.handoverPacket(vacant.id, year.id);
    expect(packet?.holder).toBeNull();
    expect(packet?.tasks).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("what each position starts with", () => {
  /**
   * The board asked for this explicitly: only the Secretary edits minutes, only the
   * Treasurer and President touch money. Positions do not grant anything at request
   * time — they seed these capabilities when somebody is appointed — so this guards
   * the seed against quietly handing the minutes to everyone.
   */
  async function startingGrants(slug: string) {
    const { bundleCapability, capabilityBundle } = await import("@/db/schema");
    const [seat] = await db
      .select()
      .from(position)
      .where(eq(position.slug, slug))
      .limit(1);
    if (!seat?.defaultBundleId) return new Set<string>();

    const rows = await db
      .select({ capability: bundleCapability.capability })
      .from(bundleCapability)
      .innerJoin(
        capabilityBundle,
        eq(capabilityBundle.id, bundleCapability.bundleId),
      )
      .where(eq(bundleCapability.bundleId, seat.defaultBundleId));
    return new Set(rows.map((r) => r.capability));
  }

  it("gives minutes to the Secretary and the President, nobody else", async () => {
    expect([...(await startingGrants("secretary"))]).toContain("meetings.manage");
    expect([...(await startingGrants("president"))]).toContain("meetings.manage");

    for (const slug of [
      "treasurer",
      "vice-president",
      "events-chair",
      "communications-chair",
      "outreach-chair",
      "career-chair",
      "graduate-representative",
    ]) {
      expect([...(await startingGrants(slug))]).not.toContain("meetings.manage");
    }
  });

  it("lets every officer read the finances", async () => {
    for (const slug of [
      "president",
      "treasurer",
      "secretary",
      "vice-president",
      "events-chair",
      "communications-chair",
      "outreach-chair",
      "career-chair",
      "graduate-representative",
    ]) {
      const grants = await startingGrants(slug);
      expect([...grants]).toContain("finance.view");
      expect([...grants]).toContain("finance.view_history");
    }
  });

  it("lets only the Treasurer and the President change money", async () => {
    for (const slug of ["treasurer", "president"]) {
      const grants = await startingGrants(slug);
      expect([...grants]).toContain("finance.edit");
      expect([...grants]).toContain("finance.approve");
    }

    for (const slug of [
      "secretary",
      "vice-president",
      "events-chair",
      "communications-chair",
      "outreach-chair",
      "career-chair",
      "graduate-representative",
    ]) {
      const grants = await startingGrants(slug);
      expect([...grants]).not.toContain("finance.edit");
      expect([...grants]).not.toContain("finance.approve");
    }
  });

  it("keeps administration to the President", async () => {
    expect([...(await startingGrants("president"))]).toContain("members.manage");
    for (const slug of ["treasurer", "secretary", "vice-president", "events-chair"]) {
      const grants = await startingGrants(slug);
      expect([...grants]).not.toContain("members.manage");
      expect([...grants]).not.toContain("board.manage");
    }
  });

  it("lets the Events Chair edit any event, while other chairs edit only their own", async () => {
    expect([...(await startingGrants("events-chair"))]).toContain("events.manage");
    expect([...(await startingGrants("communications-chair"))]).not.toContain(
      "events.manage",
    );
    // Everyone can still create an event and run their own tasks.
    for (const slug of ["communications-chair", "career-chair"]) {
      const grants = await startingGrants(slug);
      expect([...grants]).toContain("events.create");
      expect([...grants]).toContain("tasks.assign_any");
    }
  });
});
