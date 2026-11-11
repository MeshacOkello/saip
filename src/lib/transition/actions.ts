"use server";

import { revalidatePath } from "next/cache";

import { AccessError } from "@/lib/access";
import { requireMemberOrThrow } from "@/lib/session";
import * as transition from "@/lib/transition/service";
import { ValidationError } from "@/lib/transition/service";

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

export async function createBoardYearAction(_p: ActionState, f: FormData) {
  return run(
    (actor) =>
      transition.createBoardYear(actor, {
        label: str(f, "label"),
        startsOn: str(f, "startsOn"),
        endsOn: str(f, "endsOn"),
        makeCurrent: f.get("makeCurrent") === "on",
      }),
    "Board year created.",
  );
}

export async function makeBoardYearCurrentAction(_p: ActionState, f: FormData) {
  return run(
    (actor) => transition.makeBoardYearCurrent(actor, str(f, "boardYearId")),
    "That is now the current board year.",
  );
}
