import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AccessError, loadMemberContext, type MemberContext } from "@/lib/access";
import { auth } from "@/lib/auth";
import type { Capability } from "@/lib/capabilities";

/**
 * Server-side entry point for "who is asking". Every page and route handler that
 * touches board data starts here.
 */
export async function currentMember(): Promise<MemberContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return loadMemberContext(session.user.id);
}

/**
 * For pages: sends an unauthenticated visitor to sign in rather than throwing, so a
 * page rendering alongside a redirecting layout does not raise a second error.
 */
export async function requireMember(): Promise<MemberContext> {
  const member = await currentMember();
  if (!member) redirect("/sign-in");
  return member;
}

/** For route handlers and mutations, where a thrown error is the right answer. */
export async function requireMemberOrThrow(): Promise<MemberContext> {
  const member = await currentMember();
  if (!member) throw new AccessError("Not signed in", 401);
  return member;
}

/**
 * The only way a handler should express a permission requirement.
 * Returns the member so the caller can use it without a second lookup.
 */
export async function requireCapability(
  capability: Capability,
): Promise<MemberContext> {
  const member = await requireMemberOrThrow();
  if (!member.capabilities.has(capability)) {
    throw new AccessError(`Missing capability: ${capability}`);
  }
  return member;
}
