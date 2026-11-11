"use server";

import { revalidatePath } from "next/cache";

import { AccessError } from "@/lib/access";
import { MAX_UPLOAD_BYTES, isAllowedType } from "@/lib/messages/limits";
import { store } from "@/lib/messages/storage";
import { requireMemberOrThrow } from "@/lib/session";
import * as work from "@/lib/work/service";
import { ValidationError } from "@/lib/work/service";

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
const when = (f: FormData, k: string) => {
  const value = opt(f, k);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/* Events ------------------------------------------------------------------ */

export async function createEventAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      work.createEvent(actor, {
        boardYearId: str(f, "boardYearId"),
        title: str(f, "title"),
        summary: opt(f, "summary"),
        startsAt: when(f, "startsAt"),
        location: opt(f, "location"),
      }),
    "Event created.",
  );
}

export async function cloneEventAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      work.cloneEvent(actor, {
        sourceId: str(f, "sourceId"),
        boardYearId: str(f, "boardYearId"),
        title: str(f, "title") || undefined,
        startsAt: when(f, "startsAt"),
      }),
    "Copied, checklist and all.",
  );
}

export async function updateEventAction(_p: ActionState, f: FormData) {
  const status = str(f, "status");
  const registration = str(f, "registration");
  const turnout = str(f, "turnout");
  return run(
    (actor) =>
      work.updateEvent(actor, {
        eventId: str(f, "eventId"),
        ...(f.has("title") ? { title: str(f, "title") } : {}),
        ...(f.has("summary") ? { summary: opt(f, "summary") } : {}),
        ...(f.has("location") ? { location: opt(f, "location") } : {}),
        ...(f.has("startsAt") ? { startsAt: when(f, "startsAt") } : {}),
        ...(status ? { status: status as "planning" } : {}),
        ...(registration ? { registration: registration as "submitted" } : {}),
        ...(f.has("turnout") ? { turnout: turnout ? Number(turnout) : null } : {}),
        ...(f.has("whatWorked") ? { whatWorked: opt(f, "whatWorked") } : {}),
        ...(f.has("whatToAvoid") ? { whatToAvoid: opt(f, "whatToAvoid") } : {}),
        ...(f.has("leadUserId") ? { leadUserId: opt(f, "leadUserId") } : {}),
      }),
    "Saved.",
  );
}

export async function addChecklistItemAction(_p: ActionState, f: FormData) {
  return run((actor) =>
    work.addChecklistItem(actor, {
      eventId: str(f, "eventId"),
      label: str(f, "label"),
    }),
  );
}

export async function toggleChecklistItemAction(_p: ActionState, f: FormData) {
  return run((actor) =>
    work.setChecklistItem(actor, {
      itemId: str(f, "itemId"),
      done: str(f, "done") === "true",
    }),
  );
}

export async function removeChecklistItemAction(_p: ActionState, f: FormData) {
  return run((actor) => work.removeChecklistItem(actor, { itemId: str(f, "itemId") }));
}

export async function setTeamAction(_p: ActionState, f: FormData) {
  return run((actor) =>
    work.setEventTeam(actor, {
      eventId: str(f, "eventId"),
      userId: str(f, "userId"),
      role: str(f, "role"),
    }),
  );
}

export async function removeTeamAction(_p: ActionState, f: FormData) {
  return run((actor) =>
    work.removeFromTeam(actor, {
      eventId: str(f, "eventId"),
      userId: str(f, "userId"),
    }),
  );
}

/* Tasks ------------------------------------------------------------------- */

export async function createTaskAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      work.createTask(actor, {
        boardYearId: str(f, "boardYearId"),
        title: str(f, "title"),
        details: opt(f, "details"),
        assigneeUserId: opt(f, "assigneeUserId"),
        dueOn: opt(f, "dueOn"),
        eventId: opt(f, "eventId"),
        meetingId: opt(f, "meetingId"),
        agendaItemId: opt(f, "agendaItemId"),
      }),
    "Task added.",
  );
}

export async function updateTaskAction(_p: ActionState, f: FormData) {
  const status = str(f, "status");
  return run((actor) =>
    work.updateTask(actor, {
      taskId: str(f, "taskId"),
      ...(status ? { status: status as "done" } : {}),
      ...(f.has("title") ? { title: str(f, "title") } : {}),
      ...(f.has("details") ? { details: opt(f, "details") } : {}),
      ...(f.has("dueOn") ? { dueOn: opt(f, "dueOn") } : {}),
      ...(f.has("assigneeUserId") ? { assigneeUserId: opt(f, "assigneeUserId") } : {}),
    }),
  );
}

export async function deleteTaskAction(_p: ActionState, f: FormData) {
  return run((actor) => work.deleteTask(actor, { taskId: str(f, "taskId") }));
}

/* Meetings ---------------------------------------------------------------- */

export async function createMeetingAction(_p: ActionState, f: FormData) {
  return run((actor) => {
    const startsAt = when(f, "startsAt");
    if (!startsAt) throw new ValidationError("Give the meeting a date and time.");
    return work.createMeeting(actor, {
      boardYearId: str(f, "boardYearId"),
      title: str(f, "title"),
      startsAt,
      location: opt(f, "location"),
      agenda: opt(f, "agenda"),
    });
  }, "Meeting scheduled.");
}

export async function updateMeetingAction(_p: ActionState, f: FormData) {
  const status = str(f, "status");
  const startsAt = when(f, "startsAt");
  return run(
    (actor) =>
      work.updateMeeting(actor, {
        meetingId: str(f, "meetingId"),
        ...(f.has("title") ? { title: str(f, "title") } : {}),
        ...(f.has("agenda") ? { agenda: opt(f, "agenda") } : {}),
        ...(f.has("minutes") ? { minutes: opt(f, "minutes") } : {}),
        ...(f.has("location") ? { location: opt(f, "location") } : {}),
        ...(startsAt ? { startsAt } : {}),
        ...(status ? { status: status as "held" } : {}),
      }),
    "Saved.",
  );
}

export async function setAttendanceAction(_p: ActionState, f: FormData) {
  return run((actor) =>
    work.setAttendance(actor, {
      meetingId: str(f, "meetingId"),
      userId: str(f, "userId"),
      present: str(f, "present") === "true",
    }),
  );
}

export async function recordDecisionAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      work.recordDecision(actor, {
        boardYearId: str(f, "boardYearId"),
        title: str(f, "title"),
        detail: opt(f, "detail"),
        meetingId: opt(f, "meetingId"),
        eventId: opt(f, "eventId"),
      }),
    "Decision recorded.",
  );
}

/* Conversations ----------------------------------------------------------- */

export async function postMessageAction(_p: ActionState, f: FormData) {
  return run(async (actor) => {
    const files = f
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new ValidationError(
          `${file.name} is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
        );
      }
      if (!isAllowedType(file.type)) {
        throw new ValidationError(`${file.name} is not a file type we accept.`);
      }
    }

    const stored = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        contentType: file.type,
        byteSize: file.size,
        storageKey: await store(file),
      })),
    );

    return work.postMessage(actor, {
      conversationId: str(f, "conversationId"),
      body: str(f, "body"),
      attachments: stored,
    });
  });
}

/**
 * The move that makes a thread worth having: turn what someone said into a task
 * that shows up in their list, with a link back to where it was decided.
 */
export async function taskFromMessageAction(_p: ActionState, f: FormData) {
  return run(async (actor) => {
    const source = await work.messageById(str(f, "messageId"));
    if (!source) throw new ValidationError("That message is gone.");
    return work.createTask(actor, {
      boardYearId: str(f, "boardYearId"),
      title: str(f, "title") || source.body.slice(0, 120),
      assigneeUserId: opt(f, "assigneeUserId"),
      dueOn: opt(f, "dueOn"),
      eventId: source.subjectType === "event" ? source.subjectId : null,
      meetingId: source.subjectType === "meeting" ? source.subjectId : null,
      fromMessageId: source.id,
    });
  }, "Task created from the message.");
}

/** Promotion: this message is no longer conversation, it is the record. */
export async function decisionFromMessageAction(_p: ActionState, f: FormData) {
  return run(async (actor) => {
    const source = await work.messageById(str(f, "messageId"));
    if (!source) throw new ValidationError("That message is gone.");
    return work.recordDecision(actor, {
      boardYearId: str(f, "boardYearId"),
      title: str(f, "title") || source.body.slice(0, 120),
      detail: source.body,
      meetingId: source.subjectType === "meeting" ? source.subjectId : null,
      eventId: source.subjectType === "event" ? source.subjectId : null,
      fromMessageId: source.id,
    });
  }, "Recorded as a decision.");
}

/* Agenda items ------------------------------------------------------------ */

export async function addAgendaItemAction(_p: ActionState, f: FormData) {
  return run((actor) =>
    work.addAgendaItem(actor, {
      meetingId: str(f, "meetingId"),
      title: str(f, "title"),
    }),
  );
}

export async function importAgendaAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      work.importAgendaLines(actor, {
        meetingId: str(f, "meetingId"),
        lines: str(f, "agenda").split("\n"),
      }),
    "Agenda imported.",
  );
}

export async function updateAgendaItemAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      work.updateAgendaItem(actor, {
        agendaItemId: str(f, "agendaItemId"),
        ...(f.has("title") ? { title: str(f, "title") } : {}),
        ...(f.has("notes") ? { notes: opt(f, "notes") } : {}),
      }),
    "Saved.",
  );
}

export async function removeAgendaItemAction(_p: ActionState, f: FormData) {
  return run((actor) =>
    work.removeAgendaItem(actor, { agendaItemId: str(f, "agendaItemId") }),
  );
}
