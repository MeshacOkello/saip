"use server";

import { revalidatePath } from "next/cache";

import { AccessError } from "@/lib/access";
import * as service from "@/lib/admin/service";
import { ValidationError } from "@/lib/admin/service";
import { requireMemberOrThrow } from "@/lib/session";

export type ActionState = { ok: boolean; error?: string; message?: string };

/**
 * Thin wrappers. Every check lives in the service layer, so a form and a test take
 * exactly the same path through the rules.
 */
async function run(
  fn: (actor: Awaited<ReturnType<typeof requireMemberOrThrow>>) => Promise<unknown>,
  successMessage: string,
): Promise<ActionState> {
  try {
    const actor = await requireMemberOrThrow();
    await fn(actor);
    revalidatePath("/admin", "layout");
    revalidatePath("/board");
    return { ok: true, message: successMessage };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AccessError) {
      return { ok: false, error: error.message };
    }
    console.error(error);
    return { ok: false, error: "Something went wrong. Nothing was changed." };
  }
}

function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(form: FormData, key: string): string | null {
  const value = str(form, key);
  return value === "" ? null : value;
}

function date(form: FormData, key: string): Date | null {
  const value = optional(form, key);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function inviteMemberAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    (actor) =>
      service.inviteMember(actor, {
        email: str(form, "email"),
        positionId: optional(form, "positionId"),
        bundleId: optional(form, "bundleId"),
        boardYearId: optional(form, "boardYearId"),
        intendedStatus: str(form, "intendedStatus") === "incoming" ? "incoming" : "active",
      }),
    "Invitation sent.",
  );
}

export async function revokeInvitationAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    (actor) => service.revokeInvitation(actor, str(form, "invitationId")),
    "Invitation revoked.",
  );
}

export async function appointMemberAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    (actor) =>
      service.appointMember(actor, {
        membershipId: str(form, "membershipId"),
        positionId: str(form, "positionId"),
        boardYearId: str(form, "boardYearId"),
      }),
    "Appointed.",
  );
}

export async function endAppointmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const reason = str(form, "reason");
  return run(
    (actor) =>
      service.endAppointment(actor, {
        appointmentId: str(form, "appointmentId"),
        reason:
          reason === "resigned" || reason === "removed" || reason === "replaced"
            ? reason
            : "term_ended",
        alsoRevokeAccess: form.get("alsoRevokeAccess") === "on",
      }),
    "Appointment ended.",
  );
}

export async function grantCapabilityAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    (actor) =>
      service.grantCapability(actor, {
        membershipId: str(form, "membershipId"),
        capability: str(form, "capability"),
        effectiveFrom: date(form, "effectiveFrom"),
        expiresAt: date(form, "expiresAt"),
      }),
    "Capability granted.",
  );
}

export async function revokeCapabilityAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    (actor) =>
      service.revokeCapability(actor, {
        membershipId: str(form, "membershipId"),
        capability: str(form, "capability"),
      }),
    "Capability revoked.",
  );
}

export async function applyHandoverAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    (actor) =>
      service.applyHandoverForMember(actor, {
        membershipId: str(form, "membershipId"),
        positionId: str(form, "positionId"),
        boardYearId: str(form, "boardYearId"),
      }),
    "Handover access applied.",
  );
}

export async function setStatusAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const status = str(form, "status");
  const allowed = ["incoming", "active", "outgoing", "alum"] as const;
  return run(
    (actor) =>
      service.setMembershipStatus(actor, {
        membershipId: str(form, "membershipId"),
        status: (allowed as readonly string[]).includes(status)
          ? (status as (typeof allowed)[number])
          : "active",
      }),
    "Status updated.",
  );
}

export async function revokeAccessAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    (actor) => service.revokeAccess(actor, { membershipId: str(form, "membershipId") }),
    "Access revoked.",
  );
}

export async function proposeAdminTransferAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    (actor) =>
      service.proposeAdminTransfer(actor, {
        toMembershipId: str(form, "toMembershipId"),
        note: optional(form, "note"),
      }),
    "Offer sent. They must accept it themselves.",
  );
}

export async function acceptAdminTransferAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    (actor) => service.acceptAdminTransfer(actor, { transferId: str(form, "transferId") }),
    "You now hold administration.",
  );
}

export async function resolveAdminTransferAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const status = str(form, "status") === "cancelled" ? "cancelled" : "declined";
  return run(
    (actor) =>
      service.resolveAdminTransfer(actor, {
        transferId: str(form, "transferId"),
        status,
      }),
    status === "cancelled" ? "Offer cancelled." : "Offer declined.",
  );
}

export async function stepDownAction(
  _prev: ActionState,
  _form: FormData,
): Promise<ActionState> {
  return run((actor) => service.stepDownAsAdmin(actor), "You are no longer an administrator.");
}

export async function createPositionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    (actor) =>
      service.createPosition(actor, {
        name: str(form, "name"),
        description: optional(form, "description"),
        responsibilities: optional(form, "responsibilities"),
        defaultBundleId: optional(form, "defaultBundleId"),
        sortOrder: str(form, "sortOrder") || "50",
      }),
    "Position created.",
  );
}

export async function updatePositionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    (actor) =>
      service.updatePosition(actor, {
        positionId: str(form, "positionId"),
        name: str(form, "name") || undefined,
        description: optional(form, "description"),
        responsibilities: optional(form, "responsibilities"),
        defaultBundleId: optional(form, "defaultBundleId"),
        sortOrder: str(form, "sortOrder") || undefined,
      }),
    "Position updated.",
  );
}

export async function retirePositionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const retire = str(form, "retire") !== "false";
  return run(
    (actor) =>
      service.retirePosition(actor, {
        positionId: str(form, "positionId"),
        retire,
      }),
    retire ? "Position retired." : "Position restored.",
  );
}
