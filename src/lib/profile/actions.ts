"use server";

import { revalidatePath } from "next/cache";

import { AccessError } from "@/lib/access";
import {
  ProfileError,
  clearOwnAvatar,
  setOwnAvatar,
} from "@/lib/profile/service";
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
    if (error instanceof ProfileError || error instanceof AccessError) {
      return { ok: false, error: error.message };
    }
    console.error(error);
    return { ok: false, error: "That did not save. Try again." };
  }
}

export async function setAvatarAction(_p: ActionState, f: FormData) {
  return run(async (actor) => {
    const file = f.get("photo");
    if (!(file instanceof File)) throw new ProfileError("Choose an image first.");
    await setOwnAvatar(actor, file);
  }, "Photo updated.");
}

export async function clearAvatarAction(_p: ActionState) {
  return run(async (actor) => {
    await clearOwnAvatar(actor);
  }, "Photo removed.");
}
