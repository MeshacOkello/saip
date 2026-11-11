import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  adminTransfer,
  appointment,
  boardYear,
  capabilityBundle,
  capabilityGrant,
  invitation,
  membership,
  position,
  user,
} from "@/db/schema";
import { AccessError, grantCapabilities, loadMemberContext } from "@/lib/access";
import * as admin from "@/lib/admin/service";
import { ValidationError } from "@/lib/admin/service";

/**
 * Integration tests against the local development database. They drive the service
 * layer — the same path a form takes — so an unauthorised attempt in a test is the
 * same unauthorised attempt a browser would make.
 */

const SUFFIX = `t${Date.now().toString(36)}`;
const email = (who: string) => `${who}-${SUFFIX}@princeton.edu`;
const created: string[] = [];

async function makeMember(
  name: string,
  status: "active" | "incoming" | "outgoing" | "alum" = "active",
  capabilities: string[] = [],
) {
  const address = email(name.toLowerCase().replace(/\s+/g, "-"));
  const [person] = await db
    .insert(user)
    .values({ id: crypto.randomUUID(), name, email: address })
    .returning();
  created.push(person.id);

  const [access] = await db
    .insert(membership)
    .values({ userId: person.id, status, joinedAt: new Date() })
    .returning();

  if (capabilities.length > 0) {
    await grantCapabilities(
      access.id,
      capabilities.map((capability) => ({ capability: capability as never })),
      null,
    );
  }

  return { person, membershipId: access.id, email: address };
}

async function actor(membershipId: string) {
  const [row] = await db
    .select({ userId: membership.userId })
    .from(membership)
    .where(eq(membership.id, membershipId))
    .limit(1);
  const ctx = await loadMemberContext(row.userId);
  if (!ctx) throw new Error("no context");
  return ctx;
}

let president: Awaited<ReturnType<typeof makeMember>>;
let officer: Awaited<ReturnType<typeof makeMember>>;
let year: typeof boardYear.$inferSelect;
let treasurerPosition: typeof position.$inferSelect;
let financeBundle: typeof capabilityBundle.$inferSelect;

beforeAll(async () => {
  const [currentYear] = await db
    .select()
    .from(boardYear)
    .where(eq(boardYear.isCurrent, true))
    .limit(1);
  if (!currentYear) throw new Error("Run `npm run db:seed` before the tests.");
  year = currentYear;

  const [treasurer] = await db
    .select()
    .from(position)
    .where(eq(position.slug, "treasurer"))
    .limit(1);
  treasurerPosition = treasurer;

  const [finance] = await db
    .select()
    .from(capabilityBundle)
    .where(eq(capabilityBundle.slug, "finance"))
    .limit(1);
  financeBundle = finance;

  president = await makeMember("Test President", "active", [
    "board.manage",
    "members.manage",
    "positions.manage",
    "audit.view",
  ]);
  officer = await makeMember("Test Officer", "active", ["events.create"]);
});

afterAll(async () => {
  if (created.length > 0) await db.delete(user).where(inArray(user.id, created));
  await db.delete(invitation).where(eq(invitation.email, email("newcomer")));
});

describe("unauthorised attempts", () => {
  it("refuses a member without members.manage", async () => {
    const them = await actor(officer.membershipId);
    await expect(
      admin.inviteMember(them, { email: email("blocked") }),
    ).rejects.toBeInstanceOf(AccessError);
    await expect(
      admin.revokeAccess(them, { membershipId: president.membershipId }),
    ).rejects.toBeInstanceOf(AccessError);
    await expect(
      admin.setMembershipStatus(them, {
        membershipId: president.membershipId,
        status: "alum",
      }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("refuses position management without positions.manage", async () => {
    const them = await actor(officer.membershipId);
    await expect(
      admin.createPosition(them, { name: `Blocked ${SUFFIX}` }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("refuses an administration offer from a non-administrator", async () => {
    const them = await actor(officer.membershipId);
    await expect(
      admin.proposeAdminTransfer(them, { toMembershipId: president.membershipId }),
    ).rejects.toBeInstanceOf(AccessError);
  });
});

describe("invitations", () => {
  it("invites a Princeton address and refuses a second invitation", async () => {
    const them = await actor(president.membershipId);
    const invite = await admin.inviteMember(them, {
      email: email("newcomer"),
      bundleId: financeBundle.id,
      boardYearId: year.id,
    });
    expect(invite.email).toBe(email("newcomer"));

    await expect(
      admin.inviteMember(them, { email: email("newcomer") }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses an address outside the allowed domain", async () => {
    const them = await actor(president.membershipId);
    await expect(
      admin.inviteMember(them, { email: `outsider-${SUFFIX}@gmail.com` }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to invite somebody who already has access", async () => {
    const them = await actor(president.membershipId);
    await expect(
      admin.inviteMember(them, { email: officer.email }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("appointments", () => {
  it("seeds capabilities from the position's default set", async () => {
    const them = await actor(president.membershipId);
    const member = await makeMember("Test Treasurer");

    await admin.appointMember(them, {
      membershipId: member.membershipId,
      positionId: treasurerPosition.id,
      boardYearId: year.id,
    });

    const ctx = await actor(member.membershipId);
    expect(ctx.capabilities.has("finance.edit")).toBe(true);
    expect(ctx.capabilities.has("finance.approve")).toBe(true);
    expect(ctx.capabilities.has("board.manage")).toBe(false);
  });

  it("refuses to fill a position that is already held", async () => {
    const them = await actor(president.membershipId);
    const other = await makeMember("Test Rival");

    await expect(
      admin.appointMember(them, {
        membershipId: other.membershipId,
        positionId: treasurerPosition.id,
        boardYearId: year.id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("ends an appointment and leaves an alum with the archive only", async () => {
    const them = await actor(president.membershipId);
    const [seat] = await db
      .select()
      .from(appointment)
      .where(
        and(
          eq(appointment.positionId, treasurerPosition.id),
          eq(appointment.boardYearId, year.id),
        ),
      )
      .limit(1);

    await admin.endAppointment(them, {
      appointmentId: seat.id,
      reason: "resigned",
      alsoRevokeAccess: true,
    });

    const ctx = await loadMemberContext(seat.userId);
    expect(ctx?.status).toBe("alum");
    expect([...(ctx?.capabilities ?? [])]).toEqual(["archive.view"]);
  });
});

describe("dated grants", () => {
  it("does not take effect before its start date, and does afterwards", async () => {
    const them = await actor(president.membershipId);
    const member = await makeMember("Test Incoming", "incoming");
    const starts = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await admin.grantCapability(them, {
      membershipId: member.membershipId,
      capability: "finance.edit",
      effectiveFrom: starts,
    });

    const now = await loadMemberContext(member.person.id);
    expect(now?.capabilities.has("finance.edit")).toBe(false);

    const later = await loadMemberContext(
      member.person.id,
      new Date(starts.getTime() + 1000),
    );
    expect(later?.capabilities.has("finance.edit")).toBe(true);
  });

  it("stops applying once it has expired", async () => {
    const them = await actor(president.membershipId);
    const member = await makeMember("Test Delegate");

    await admin.grantCapability(them, {
      membershipId: member.membershipId,
      capability: "meetings.manage",
      expiresAt: new Date(Date.now() + 2000),
    });

    const during = await loadMemberContext(member.person.id);
    expect(during?.capabilities.has("meetings.manage")).toBe(true);

    const after = await loadMemberContext(
      member.person.id,
      new Date(Date.now() + 60_000),
    );
    expect(after?.capabilities.has("meetings.manage")).toBe(false);
  });

  it("refuses a grant that expires before it starts", async () => {
    const them = await actor(president.membershipId);
    await expect(
      admin.grantCapability(them, {
        membershipId: officer.membershipId,
        capability: "finance.view",
        effectiveFrom: new Date(Date.now() + 10_000),
        expiresAt: new Date(Date.now() + 5_000),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses an unknown capability", async () => {
    const them = await actor(president.membershipId);
    await expect(
      admin.grantCapability(them, {
        membershipId: officer.membershipId,
        capability: "finance.everything",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("the board cannot lock itself out", () => {
  it("refuses to remove the administration that would leave too few", async () => {
    const them = await actor(president.membershipId);
    await expect(
      admin.revokeCapability(them, {
        membershipId: president.membershipId,
        capability: "board.manage",
      }),
    ).rejects.toBeInstanceOf(AccessError);
  });

  it("refuses to revoke your own access", async () => {
    const them = await actor(president.membershipId);
    await expect(
      admin.revokeAccess(them, { membershipId: president.membershipId }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("transferring administration", () => {
  it("needs the recipient to accept, and nobody else can", async () => {
    const them = await actor(president.membershipId);
    const successor = await makeMember("Test Successor");
    const bystander = await makeMember("Test Bystander");

    const offer = await admin.proposeAdminTransfer(them, {
      toMembershipId: successor.membershipId,
      note: "Handing over before graduation",
    });

    await expect(
      admin.acceptAdminTransfer(await actor(bystander.membershipId), {
        transferId: offer.id,
      }),
    ).rejects.toBeInstanceOf(AccessError);

    const before = await actor(successor.membershipId);
    expect(before.capabilities.has("board.manage")).toBe(false);

    await admin.acceptAdminTransfer(await actor(successor.membershipId), {
      transferId: offer.id,
    });

    const after = await actor(successor.membershipId);
    expect(after.capabilities.has("board.manage")).toBe(true);
    expect(after.capabilities.has("members.manage")).toBe(true);

    const [row] = await db
      .select()
      .from(adminTransfer)
      .where(eq(adminTransfer.id, offer.id))
      .limit(1);
    expect(row.status).toBe("accepted");

    // Only now that a second administrator exists may the first step down.
    const stillPresident = await actor(president.membershipId);
    await admin.stepDownAsAdmin(stillPresident);
    const stepped = await actor(president.membershipId);
    expect(stepped.capabilities.has("board.manage")).toBe(false);
  });

  it("refuses a second pending offer to the same person", async () => {
    const giver = await makeMember("Test Second", "active", ["board.manage"]);
    const target = await makeMember("Test Target");
    const them = await actor(giver.membershipId);

    await admin.proposeAdminTransfer(them, { toMembershipId: target.membershipId });
    await expect(
      admin.proposeAdminTransfer(them, { toMembershipId: target.membershipId }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("positions are data", () => {
  it("creates, renames and retires a position", async () => {
    const them = await actor(president.membershipId);
    const made = await admin.createPosition(them, {
      name: `Social Media Chair ${SUFFIX}`,
      description: "Runs the Instagram",
    });
    expect(made.isActive).toBe(true);

    const renamed = await admin.updatePosition(them, {
      positionId: made.id,
      name: `Publicity Chair ${SUFFIX}`,
    });
    expect(renamed.name).toContain("Publicity Chair");

    const retired = await admin.retirePosition(them, {
      positionId: made.id,
      retire: true,
    });
    expect(retired.isActive).toBe(false);

    await db.delete(position).where(eq(position.id, made.id));
  });

  it("refuses to retire a position somebody holds", async () => {
    const them = await actor(president.membershipId);
    const seat = await admin.createPosition(them, { name: `Interim ${SUFFIX}` });
    const member = await makeMember("Test Holder");
    await admin.appointMember(them, {
      membershipId: member.membershipId,
      positionId: seat.id,
      boardYearId: year.id,
    });

    await expect(
      admin.retirePosition(them, { positionId: seat.id, retire: true }),
    ).rejects.toBeInstanceOf(ValidationError);

    await db.delete(appointment).where(eq(appointment.positionId, seat.id));
    await db.delete(position).where(eq(position.id, seat.id));
  });
});

describe("grants are expired, never erased", () => {
  it("keeps the revoked row so the audit trail survives", async () => {
    const them = await actor(president.membershipId);
    const member = await makeMember("Test History", "active", ["contacts.manage"]);

    await admin.revokeCapability(them, {
      membershipId: member.membershipId,
      capability: "contacts.manage",
    });

    const rows = await db
      .select()
      .from(capabilityGrant)
      .where(eq(capabilityGrant.membershipId, member.membershipId));
    expect(rows).toHaveLength(1);
    expect(rows[0].revokedAt).not.toBeNull();
  });
});
