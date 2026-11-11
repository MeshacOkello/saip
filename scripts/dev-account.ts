/**
 * Provisions the development password account.
 *
 * Production sign-in is Google only — this exists so the board workspace can be
 * opened on a laptop without going through Google every time, and so the very first
 * President record can be pointed at a real Princeton address without losing the work
 * already recorded against it.
 *
 *   npx tsx --env-file=.env scripts/dev-account.ts [--from=old@princeton.edu]
 *
 * It refuses to run unless DEV_LOGIN=1 and NODE_ENV is not production, because its
 * whole job is to write a password nobody chose carefully.
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { account, membership, user } from "@/db/schema";
import { auth } from "@/lib/auth";

const email = (process.env.SEED_PRESIDENT_EMAIL ?? "").toLowerCase().trim();
const password = process.env.DEV_PRESIDENT_PASSWORD ?? "";
const from = (
  process.argv.find((a) => a.startsWith("--from="))?.slice(7) ??
  "president@princeton.edu"
)
  .toLowerCase()
  .trim();

function stop(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    stop("Refusing to run with NODE_ENV=production.");
  }
  if (process.env.DEV_LOGIN !== "1") {
    stop("Set DEV_LOGIN=1 in .env first. This is a development-only account.");
  }
  if (!email) stop("Set SEED_PRESIDENT_EMAIL in .env to your princeton.edu address.");
  if (password.length < 8) {
    stop("Set DEV_PRESIDENT_PASSWORD in .env to at least 8 characters.");
  }

  const [mine] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  const [old] = mine
    ? []
    : await db.select().from(user).where(eq(user.email, from)).limit(1);

  let row = mine ?? old;

  if (old) {
    await db
      .update(user)
      .set({ email, updatedAt: new Date() })
      .where(eq(user.id, old.id));
    console.log(`  renamed  ${from} -> ${email} (records kept)`);
  }

  if (!row) {
    // No record yet: go through Better Auth so the invitation gate and the
    // membership hook run exactly as they would for a real first sign-in.
    const result = await auth.api.signUpEmail({
      body: { email, password, name: "President" },
      asResponse: true,
    });
    if (!result.ok) {
      stop(
        `Sign-up was refused (${result.status}). Run \`npm run db:seed\` first so ` +
          `an invitation exists for ${email}.`,
      );
    }
    [row] = await db.select().from(user).where(eq(user.email, email)).limit(1);
    if (!row) stop("Sign-up reported success but no record appeared.");
    console.log(`  created  ${email}`);
  }

  /*
   * Google will not join itself to an unverified local record, and this address
   * came from the operator rather than from an email anybody clicked.
   */
  if (!row.emailVerified) {
    await db
      .update(user)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(user.id, row.id));
    console.log("  verified email, so Google can link to this record");
  }

  const hash = await (await auth.$context).password.hash(password);
  await db
    .delete(account)
    .where(
      and(eq(account.userId, row.id), eq(account.providerId, "credential")),
    );
  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: row.id,
    providerId: "credential",
    userId: row.id,
    password: hash,
  });
  console.log("  password set from DEV_PRESIDENT_PASSWORD");

  const [access] = await db
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.userId, row.id))
    .limit(1);
  console.log(`  membership ${access?.status ?? "MISSING — run npm run db:seed"}`);
  console.log(`\nDone. Sign in at /sign-in as ${email}.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
