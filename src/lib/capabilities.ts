/**
 * Capabilities are the only things that grant access in this application.
 *
 * Rules that must not be broken:
 *  - A board position never grants a capability at request time. It only supplies a
 *    default set when someone is appointed (see `capability_bundle`).
 *  - The list stays short and coarse on purpose. Sixty toggles would be unusable and
 *    unauditable; if a new need appears, prefer reusing a capability over adding one.
 */

export const CAPABILITIES = [
  // Board administration
  "board.manage", // board years, settings, administration transfer
  "members.manage", // invite, appoint, remove, edit grants
  "positions.manage", // create, rename, retire positions and bundles
  "audit.view",

  // Coordination
  "events.create",
  "events.manage", // edit or delete any event, not just your own
  "tasks.assign_any",
  "meetings.manage",
  "contacts.manage",
  "documents.manage",
  "channels.manage",

  // Finance
  "finance.view", // current board year's live finances
  "finance.view_history", // previous years, read-only — what an incoming treasurer gets
  "finance.edit",
  "finance.approve",
  "reimbursements.view", // the outstanding-reimbursement queue

  // History
  "archive.view",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITIES);

export function isCapability(value: string): value is Capability {
  return CAPABILITY_SET.has(value);
}

/** Human-readable labels for the admin console. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  "board.manage": "Manage the board",
  "members.manage": "Manage members and access",
  "positions.manage": "Manage positions and roles",
  "audit.view": "View the audit log",
  "events.create": "Create events",
  "events.manage": "Manage any event",
  "tasks.assign_any": "Assign tasks to anyone",
  "meetings.manage": "Manage meetings and minutes",
  "contacts.manage": "Manage contacts",
  "documents.manage": "Manage documents",
  "channels.manage": "Manage channels",
  "finance.view": "View current finances",
  "finance.view_history": "View past finances (read-only)",
  "finance.edit": "Edit budgets and expenses",
  "finance.approve": "Approve expenses",
  "reimbursements.view": "View outstanding reimbursements",
  "archive.view": "Browse the archive",
};

/**
 * The capability that protects administration itself. The system maintains an
 * invariant that at least two active members hold it, so the board can never lock
 * itself out.
 */
export const ADMIN_CAPABILITY: Capability = "board.manage";
export const MIN_ADMINS = 2;
