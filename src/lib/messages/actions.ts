"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AccessError } from "@/lib/access";
import * as messages from "@/lib/messages/service";
import { ValidationError } from "@/lib/messages/service";
import { MAX_UPLOAD_BYTES, isAllowedType } from "@/lib/messages/limits";
import { store } from "@/lib/messages/storage";
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

export async function sendMessageAction(_p: ActionState, f: FormData) {
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

    return messages.send(actor, {
      conversationId: str(f, "conversationId"),
      body: str(f, "body"),
      attachments: stored,
    });
  });
}

export async function openDirectAction(_p: ActionState, f: FormData) {
  const actor = await requireMemberOrThrow();
  let id: string;
  try {
    id = await messages.openDirect(actor, str(f, "userId"));
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AccessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  revalidatePath("/messages", "layout");
  redirect(`/messages/${id}`);
}

export async function createGroupAction(_p: ActionState, f: FormData) {
  const actor = await requireMemberOrThrow();
  let id: string;
  try {
    id = await messages.createGroup(actor, {
      title: str(f, "title"),
      userIds: f.getAll("userIds").filter((v): v is string => typeof v === "string"),
    });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AccessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  revalidatePath("/messages", "layout");
  redirect(`/messages/${id}`);
}

export async function createChannelAction(_p: ActionState, f: FormData) {
  const actor = await requireMemberOrThrow();
  let id: string;
  try {
    id = await messages.createChannel(actor, {
      title: str(f, "title"),
      boardYearId: str(f, "boardYearId") || null,
    });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AccessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  revalidatePath("/messages", "layout");
  redirect(`/messages/${id}`);
}

export async function leaveConversationAction(_p: ActionState, f: FormData) {
  return run(
    (actor) => messages.leaveConversation(actor, str(f, "conversationId")),
    "You left the conversation.",
  );
}

export async function deleteMessageAction(_p: ActionState, f: FormData) {
  return run((actor) => messages.deleteMessage(actor, str(f, "messageId")));
}

export async function addToConversationAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      messages.addToConversation(actor, {
        conversationId: str(f, "conversationId"),
        userId: str(f, "userId"),
      }),
    "Added.",
  );
}
