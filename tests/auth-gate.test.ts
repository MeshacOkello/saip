import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { invitation, membership, user } from "@/db/schema";
import { screenSignIn } from "@/lib/auth";

const SUFFIX = `g${Date.now().toString(36)}`;
const users: string[] = [];
const invites: string[] = [];

function address(label: string, domain = "princeton.edu") {
  return `${label}-${SUFFIX}@${domain}`;
}

async function member(label: string, status: typeof membership.$inferSelect.status) {
  const email = address(label);
  const [row] = await db
    .insert(user)
    .values({ id: crypto.randomUUID(), name: label, email })
    .returning();
  users.push(row.id);
  await db.insert(membership).values({ userId: row.id, status, joinedAt: new Date() });
  return email;
}

async function invite(label: string, overrides: Record<string, unknown> = {}) {
  const email = address(label);
  const [row] = await db
    .insert(invitation)
    .values({
      email,
      token: crypto.randomUUID(),
      intendedStatus: "active",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ...overrides,
    })
    .returning();
  invites.push(row.id);
  return email;
}

afterAll(async () => {
  if (invites.length > 0) {
    await db.delete(invitation).where(inArray(invitation.id, invites));
  }
  if (users.length > 0) await db.delete(user).where(inArray(user.id, users));
});

/* -------------------------------------------------------------------------- */

describe("who is allowed in at all", () => {
  it("refuses an address outside the University", async () => {
    const outside = address("someone", "gmail.com");
    for (const action of ["create-user", "sign-in", "link-account"]) {
      expect((await screenSignIn(outside, action))?.error).toBe("domain_not_allowed");
    }
  });

  it("refuses a Google account that hands over no address", async () => {
    expect((await screenSignIn("", "create-user"))?.error).toBe("no_email");
  });

  it("refuses a princeton.edu address nobody invited", async () => {
    const stranger = address("stranger");
    expect((await screenSignIn(stranger, "create-user"))?.error).toBe("not_invited");
    // And it is not a member either, so the returning path refuses it too.
    expect((await screenSignIn(stranger, "sign-in"))?.error).toBe("not_a_member");
  });

  it("lets an invited address through on a first sign-in", async () => {
    const invited = await invite("fresh");
    expect(await screenSignIn(invited, "create-user")).toBeNull();
  });

  it("ignores an invitation that was revoked, accepted or has run out", async () => {
    const revoked = await invite("revoked", { revokedAt: new Date() });
    const used = await invite("used", { acceptedAt: new Date() });
    const stale = await invite("stale", { expiresAt: new Date(Date.now() - 1000) });

    for (const email of [revoked, used, stale]) {
      expect((await screenSignIn(email, "create-user"))?.error).toBe("not_invited");
    }
  });

  it("matches the invitation regardless of the case Google sends", async () => {
    const invited = await invite("casing");
    expect(await screenSignIn(invited.toUpperCase(), "create-user")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("coming back, and adding Google to an existing record", () => {
  it("lets a serving member sign in and attach Google to their record", async () => {
    const email = await member("serving", "active");
    expect(await screenSignIn(email, "sign-in")).toBeNull();
    // This is the case a returning President hits: the record exists, the
    // invitation was accepted long ago, and Google has to join itself to it.
    expect(await screenSignIn(email, "link-account")).toBeNull();
  });

  it("lets an incoming, outgoing or alum member in, each on their own terms", async () => {
    for (const status of ["incoming", "outgoing", "alum"] as const) {
      const email = await member(status, status);
      expect(await screenSignIn(email, "sign-in")).toBeNull();
    }
  });

  it("refuses a revoked member, on sign-in and on linking alike", async () => {
    const email = await member("revoked-member", "revoked");
    expect((await screenSignIn(email, "sign-in"))?.error).toBe("not_a_member");
    expect((await screenSignIn(email, "link-account"))?.error).toBe("not_a_member");
  });

  it("refuses somebody who was invited but has not accepted", async () => {
    const email = await member("pending", "invited");
    expect((await screenSignIn(email, "sign-in"))?.error).toBe("not_a_member");
  });

  it("stops following an invitation once access is withdrawn", async () => {
    // Belt and braces: an address with a live invitation AND a revoked membership
    // must not get in through the invitation path.
    const email = await member("withdrawn", "revoked");
    const [row] = await db
      .insert(invitation)
      .values({
        email,
        token: crypto.randomUUID(),
        intendedStatus: "active",
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    invites.push(row.id);

    expect((await screenSignIn(email, "sign-in"))?.error).toBe("not_a_member");
    expect((await screenSignIn(email, "link-account"))?.error).toBe("not_a_member");
  });
});

/* -------------------------------------------------------------------------- */

describe("the President's own record", () => {
  it("is a member who may sign in and link Google", async () => {
    const email = (process.env.SEED_PRESIDENT_EMAIL ?? "").toLowerCase();
    if (!email) return;

    const [row] = await db
      .select({ status: membership.status })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(eq(user.email, email))
      .limit(1);
    if (!row) return;

    expect(await screenSignIn(email, "sign-in")).toBeNull();
    expect(await screenSignIn(email, "link-account")).toBeNull();
  });
});
