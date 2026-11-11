import { db } from "@/db";
import { auditLog } from "@/db/schema";

/**
 * Append-only record of who did what. Every permission change, membership change,
 * removal and approval goes through here. It is cheap to write now and impossible to
 * reconstruct later.
 */
export async function recordAudit(entry: {
  actorUserId?: string | null;
  action: string;
  subjectType?: string | null;
  subjectId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    subjectType: entry.subjectType ?? null,
    subjectId: entry.subjectId ?? null,
    metadata: entry.metadata ?? null,
  });
}
