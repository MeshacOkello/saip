import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { appointment, boardYear, invitation, membership } from "@/db/schema";
import { applyHandoverPreset, canSignIn, seedGrantsFromBundle } from "@/lib/access";
import { recordAudit } from "@/lib/audit";

const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN ?? "princeton.edu").toLowerCase();

/**
 * Google's own hosted-domain restriction. Sent as the `hd` authorization hint, so
 * the account chooser offers Princeton accounts, and enforced by Better Auth against
 * the `hd` claim of the returned id token — a personal Gmail account cannot complete
 * the flow at all, before any of our own checks run. Clear GOOGLE_HOSTED_DOMAIN if
 * Princeton ever asserts a different Workspace domain than the email domain.
 */
const hostedDomain = (process.env.GOOGLE_HOSTED_DOMAIN ?? allowedDomain).trim() || undefined;

/**
 * Dev-only password sign-in, so the admin console can be built and demonstrated
 * before Google OAuth credentials exist. Hard-gated on NODE_ENV so it cannot be
 * switched on in production by an environment variable alone.
 */
export const devLoginEnabled =
  process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "1";

function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

/** A live, unaccepted, unrevoked invitation for this address. */
export async function pendingInvitationFor(email: string) {
  const [row] = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.email, email.toLowerCase()),
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** What the sign-in gate can refuse, and why. The sign-in form has wording for each. */
export type Refusal = {
  error: "no_email" | "domain_not_allowed" | "not_a_member" | "not_invited";
  errorDescription?: string;
};

/**
 * The access gate, as one function so it can be tested the way it is used.
 *
 * A princeton.edu address grants nothing on its own. A person gets in only if an
 * administrator invited that exact address, and comes back only while their
 * membership still permits it. Returns null to allow.
 *
 * `create-user` is a first sign-in; `sign-in` is a returning member; `link-account`
 * is Google being attached to a record that already exists. The last two are the
 * same question — may this membership hold a session? — because an invitation is
 * marked accepted the moment it is used, so requiring a live one would refuse every
 * member who has signed in before.
 */
export async function screenSignIn(
  email: string,
  action: "sign-in" | "link-account" | "create-user" | string,
): Promise<Refusal | null> {
  if (!email) return { error: "no_email" };

  if (emailDomain(email) !== allowedDomain) {
    return {
      error: "domain_not_allowed",
      errorDescription: `Sign in with your ${allowedDomain} account.`,
    };
  }

  if (action === "sign-in" || action === "link-account") {
    const [existing] = await db
      .select({ status: membership.status })
      .from(membership)
      .innerJoin(schema.user, eq(schema.user.id, membership.userId))
      .where(eq(schema.user.email, email.toLowerCase()))
      .limit(1);

    if (!existing || !canSignIn(existing.status)) {
      return {
        error: "not_a_member",
        errorDescription: "This account does not have board access.",
      };
    }
    return null;
  }

  if (!(await pendingInvitationFor(email))) {
    return {
      error: "not_invited",
      errorDescription: "Ask the President to invite this address.",
    };
  }

  return null;
}

/**
 * Where this instance believes it lives. Better Auth builds the OAuth redirect from
 * it, so a wrong value shows up as a Google error rather than a broken page.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is injected by Vercel and always names the real
 * production domain, which means a deployment is correct before anybody has set
 * anything. BETTER_AUTH_URL still wins when present, for a custom domain or a
 * laptop.
 */
export const resolvedBaseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: resolvedBaseURL,

  emailAndPassword: { enabled: devLoginEnabled },

  account: {
    accountLinking: {
      /**
       * A member may already have a record here — seeded, or created by the
       * development password login — before they first use Google. Google is
       * trusted to assert its own verified princeton.edu address, and the domain
       * gate below is checked again on our side, so the two are joined rather
       * than left as two accounts for one person. `requireLocalEmailVerified`
       * stays at its default: the local record must be verified too.
       */
      enabled: true,
      trustedProviders: ["google"],
    },
  },

  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            hd: hostedDomain,
          },
        }
      : undefined,

  user: {
    async validateUserInfo({ user: candidate, source }) {
      const email = typeof candidate.email === "string" ? candidate.email : "";
      return (await screenSignIn(email, source.action)) ?? undefined;
    },
  },

  databaseHooks: {
    user: {
      create: {
        /**
         * Turns an accepted invitation into a membership: seeds capabilities from the
         * position's default bundle, records the appointment, and applies the
         * handover preset for an incoming officer.
         */
        async after(created) {
          const invite = await pendingInvitationFor(created.email);
          if (!invite) return;

          const [created_membership] = await db
            .insert(membership)
            .values({
              userId: created.id,
              status: invite.intendedStatus,
              invitedBy: invite.invitedBy,
              invitedAt: invite.createdAt,
              joinedAt: new Date(),
            })
            .returning();

          await db
            .update(invitation)
            .set({ acceptedAt: new Date() })
            .where(eq(invitation.id, invite.id));

          if (invite.bundleId) {
            await seedGrantsFromBundle(
              created_membership.id,
              invite.bundleId,
              invite.invitedBy,
            );
          }

          if (invite.positionId && invite.boardYearId) {
            const [year] = await db
              .select()
              .from(boardYear)
              .where(eq(boardYear.id, invite.boardYearId))
              .limit(1);

            await db.insert(appointment).values({
              userId: created.id,
              positionId: invite.positionId,
              boardYearId: invite.boardYearId,
              startedOn: year?.startsOn ?? new Date().toISOString().slice(0, 10),
            });

            if (invite.intendedStatus === "incoming" && year) {
              await applyHandoverPreset(
                created_membership.id,
                invite.positionId,
                new Date(`${year.startsOn}T00:00:00Z`),
                invite.invitedBy,
              );
            }
          }

          await recordAudit({
            actorUserId: invite.invitedBy,
            action: "membership.created",
            subjectType: "membership",
            subjectId: created_membership.id,
            metadata: { email: created.email, via: "invitation", inviteId: invite.id },
          });
        },
      },
    },

    session: {
      create: {
        /**
         * Second net: a member whose access was revoked must not be able to open a
         * new session. Absence of a membership is not refused here — during sign-up
         * the session is created before the membership row exists, and
         * `validateUserInfo` above is what decides who may get in at all.
         */
        async before(newSession) {
          const [row] = await db
            .select({ status: membership.status })
            .from(membership)
            .where(eq(membership.userId, newSession.userId))
            .limit(1);

          if (row && !canSignIn(row.status)) return false;
        },
      },
    },
  },

  plugins: [nextCookies()],
});

export type Auth = typeof auth;
