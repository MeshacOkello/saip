/**
 * Checks the one mechanism the whole access model rests on: dated capability grants.
 *
 * An incoming Treasurer should be able to study last year's finances and the
 * outstanding reimbursement queue during the handover, and should gain live finance
 * access only when their term starts — without anyone editing permissions again.
 *
 *   npx tsx --env-file=.env scripts/verify-access.ts
 */
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { membership, user } from "@/db/schema";
import { applyHandoverPreset, expireGrants, loadMemberContext, positionBySlug } from "@/lib/access";

const TEST_EMAIL = "verify-incoming-treasurer@princeton.edu";

let failures = 0;

function check(label: string, actual: boolean, expected: boolean) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
}

async function main() {
  const treasurer = await positionBySlug("treasurer");
  if (!treasurer) throw new Error("Run `npm run db:seed` first.");

  await db.delete(user).where(eq(user.email, TEST_EMAIL));

  const [person] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      name: "Incoming Treasurer",
      email: TEST_EMAIL,
    })
    .returning();

  const [access] = await db
    .insert(membership)
    .values({ userId: person.id, status: "incoming", joinedAt: new Date() })
    .returning();

  const termStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await applyHandoverPreset(access.id, treasurer.id, termStart, null);

  console.log("\nDuring handover (term starts in 30 days):");
  const during = await loadMemberContext(person.id);
  check("reads past finances", during!.capabilities.has("finance.view_history"), true);
  check("sees outstanding reimbursements", during!.capabilities.has("reimbursements.view"), true);
  check("cannot edit live finances", during!.capabilities.has("finance.edit"), false);
  check("cannot approve expenses", during!.capabilities.has("finance.approve"), false);
  check("is not an administrator", during!.capabilities.has("board.manage"), false);

  console.log("\nOnce the term has started (same grants, no edits):");
  const after = await loadMemberContext(
    person.id,
    new Date(termStart.getTime() + 60_000),
  );
  check("edits live finances", after!.capabilities.has("finance.edit"), true);
  check("approves expenses", after!.capabilities.has("finance.approve"), true);

  console.log("\nAfter the term ends (grants expired):");
  await expireGrants(access.id);
  const alum = await loadMemberContext(person.id);
  check("retains nothing", alum!.capabilities.size === 0, true);

  await db.delete(user).where(eq(user.id, person.id));

  console.log(
    failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
