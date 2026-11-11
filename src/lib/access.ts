import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  bundleCapability,
  capabilityGrant,
  membership,
  position,
  positionHandoverGrant,
  user,
} from "@/db/schema";
import {
  ADMIN_CAPABILITY,
  isCapability,
  MIN_ADMINS,
  type Capability,
} from "@/lib/capabilities";

/**
 * Access control lives here and only here. Route handlers and pages ask this module
 * a question; they never assemble permission logic themselves.
 *
 * The frontend hides features for tidiness. Hiding is never the control — every
 * request is checked on the server, because any client can call the API directly.
 */

/** Statuses that may hold a session at all. `invited` has not accepted yet. */
const SIGN_IN_STATUSES = ["incoming", "active", "outgoing", "alum"] as const;

export type MemberContext = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  membershipId: string;
  status: (typeof membership.status.enumValues)[number];
  capabilities: ReadonlySet<Capability>;
};

export class AccessError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 = 403,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

/** A grant is in effect when it is not revoked and `now` falls inside its window. */
function grantInEffect(now: Date) {
  return and(
    isNull(capabilityGrant.revokedAt),
    or(
      isNull(capabilityGrant.effectiveFrom),
      lte(capabilityGrant.effectiveFrom, now),
    ),
    or(isNull(capabilityGrant.expiresAt), gt(capabilityGrant.expiresAt, now)),
  );
}

export async function loadMemberContext(
  userId: string,
  now = new Date(),
): Promise<MemberContext | null> {
  const [row] = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      membershipId: membership.id,
      status: membership.status,
    })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.userId, userId))
    .limit(1);

  if (!row) return null;

  const grants = await db
    .select({ capability: capabilityGrant.capability })
    .from(capabilityGrant)
    .where(
      and(eq(capabilityGrant.membershipId, row.membershipId), grantInEffect(now)),
    );

  const capabilities = new Set<Capability>();
  for (const { capability } of grants) {
    if (isCapability(capability)) capabilities.add(capability);
  }

  return { ...row, capabilities };
}

export function canSignIn(status: string): boolean {
  return (SIGN_IN_STATUSES as readonly string[]).includes(status);
}

export function can(ctx: MemberContext | null, capability: Capability): boolean {
  return ctx?.capabilities.has(capability) ?? false;
}

export function assertCan(ctx: MemberContext | null, capability: Capability): void {
  if (!ctx) throw new AccessError("Not signed in", 401);
  if (!ctx.capabilities.has(capability)) {
    throw new AccessError(`Missing capability: ${capability}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Granting                                                                   */
/* -------------------------------------------------------------------------- */

type GrantInput = {
  capability: Capability;
  effectiveFrom?: Date | null;
  expiresAt?: Date | null;
  source?: (typeof capabilityGrant.source.enumValues)[number];
  note?: string | null;
};

export async function grantCapabilities(
  membershipId: string,
  grants: GrantInput[],
  grantedBy: string | null,
) {
  if (grants.length === 0) return [];
  return db
    .insert(capabilityGrant)
    .values(
      grants.map((g) => ({
        membershipId,
        capability: g.capability,
        effectiveFrom: g.effectiveFrom ?? null,
        expiresAt: g.expiresAt ?? null,
        source: g.source ?? ("manual" as const),
        grantedBy,
        note: g.note ?? null,
      })),
    )
    .returning();
}

/**
 * Seeds a membership's grants from a position's default bundle. The bundle supplies a
 * sensible default at appointment time; it is not consulted again afterwards, so an
 * administrator can freely add or remove individual capabilities.
 */
export async function seedGrantsFromBundle(
  membershipId: string,
  bundleId: string,
  grantedBy: string | null,
) {
  const rows = await db
    .select({ capability: bundleCapability.capability })
    .from(bundleCapability)
    .where(eq(bundleCapability.bundleId, bundleId));

  const capabilities = rows
    .map((r) => r.capability)
    .filter((c): c is Capability => isCapability(c));

  return grantCapabilities(
    membershipId,
    capabilities.map((capability) => ({ capability, source: "bundle" as const })),
    grantedBy,
  );
}

/**
 * Applies a position's handover preset to an incoming officer. Grants marked
 * `term_start` are dated so they switch on by themselves — nobody has to remember.
 */
export async function applyHandoverPreset(
  membershipId: string,
  positionId: string,
  termStart: Date,
  grantedBy: string | null,
) {
  const rows = await db
    .select({
      capability: positionHandoverGrant.capability,
      timing: positionHandoverGrant.timing,
    })
    .from(positionHandoverGrant)
    .where(eq(positionHandoverGrant.positionId, positionId));

  return grantCapabilities(
    membershipId,
    rows
      .filter((r) => isCapability(r.capability))
      .map((r) => ({
        capability: r.capability as Capability,
        effectiveFrom: r.timing === "term_start" ? termStart : null,
        source: "handover" as const,
      })),
    grantedBy,
  );
}

/**
 * Expires every live grant on a membership as of `at`. Used when a term ends or an
 * officer is removed. Grants are expired rather than deleted so the audit trail and
 * the historical record stay intact.
 */
export async function expireGrants(membershipId: string, at = new Date()) {
  return db
    .update(capabilityGrant)
    .set({ expiresAt: at })
    .where(
      and(
        eq(capabilityGrant.membershipId, membershipId),
        isNull(capabilityGrant.revokedAt),
        or(isNull(capabilityGrant.expiresAt), gt(capabilityGrant.expiresAt, at)),
      ),
    )
    .returning();
}

/* -------------------------------------------------------------------------- */
/* The never-lose-administration invariant                                    */
/* -------------------------------------------------------------------------- */

/**
 * Counts members who currently hold `board.manage`. The board must never drop below
 * {@link MIN_ADMINS}, so that it cannot lock itself out — which is the failure that
 * cannot be repaired from inside the application.
 */
export async function countAdmins(
  excludeMembershipId?: string,
  now = new Date(),
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${membership.id})::int` })
    .from(membership)
    .innerJoin(
      capabilityGrant,
      and(eq(capabilityGrant.membershipId, membership.id), grantInEffect(now)),
    )
    .where(
      and(
        eq(capabilityGrant.capability, ADMIN_CAPABILITY),
        eq(membership.status, "active"),
        excludeMembershipId
          ? sql`${membership.id} <> ${excludeMembershipId}`
          : undefined,
      ),
    );

  return row?.count ?? 0;
}

/**
 * Call before anything that could remove administration from a member.
 * Throws rather than silently proceeding.
 */
export async function assertAdminInvariantAfterRemoving(membershipId: string) {
  const remaining = await countAdmins(membershipId);
  if (remaining < MIN_ADMINS) {
    throw new AccessError(
      `The board must keep at least ${MIN_ADMINS} administrators. ` +
        `Grant "${ADMIN_CAPABILITY}" to someone else first.`,
    );
  }
}

/** Positions are data; this resolves one by slug for seeding and handover tooling. */
export async function positionBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(position)
    .where(eq(position.slug, slug))
    .limit(1);
  return row ?? null;
}
