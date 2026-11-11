/**
 * Seeds the board SAIP actually has: nine positions drawn from the 2025 position
 * descriptions and the constitution, four capability bundles, the current board year,
 * and handover presets.
 *
 * Positions and bundles are seeded as DATA, not constants — they are meant to be
 * edited in the admin console as the board changes. Nothing here is hardcoded in the
 * application.
 *
 *   npm run db:seed
 */
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  bundleCapability,
  capabilityBundle,
  boardYear,
  fundingSource,
  invitation,
  membership,
  position,
  positionHandoverGrant,
  user,
} from "@/db/schema";
import { CAPABILITIES, type Capability } from "@/lib/capabilities";

const PRESIDENT_EMAIL = (
  process.env.SEED_PRESIDENT_EMAIL ?? "president@princeton.edu"
).toLowerCase();

const BUNDLES: {
  slug: string;
  name: string;
  description: string;
  capabilities: Capability[];
}[] = [
  {
    slug: "admin",
    name: "Administrator",
    description: "Full access, including members, positions and the audit log.",
    capabilities: [...CAPABILITIES],
  },
  {
    slug: "finance",
    name: "Finance",
    description: "Budgets, expenses, reimbursements and approvals.",
    capabilities: [
      "finance.view",
      "finance.view_history",
      "finance.edit",
      "finance.approve",
      "reimbursements.view",
      "events.create",
      "tasks.assign_any",
      "archive.view",
    ],
  },
  {
    slug: "officer",
    name: "Officer",
    description:
      "The default for a board member: plan events, run tasks, keep contacts, and " +
      "read the board's finances without being able to change them.",
    capabilities: [
      "events.create",
      "tasks.assign_any",
      "contacts.manage",
      "documents.manage",
      "finance.view",
      "finance.view_history",
      "reimbursements.view",
      "archive.view",
    ],
  },
  {
    slug: "secretary",
    name: "Secretary",
    description:
      "An officer who also keeps the board's record: agendas, minutes and decisions.",
    capabilities: [
      "events.create",
      "tasks.assign_any",
      "contacts.manage",
      "documents.manage",
      "meetings.manage",
      "finance.view",
      "finance.view_history",
      "reimbursements.view",
      "archive.view",
    ],
  },
  {
    slug: "events-lead",
    name: "Events lead",
    description: "An officer who can also edit any event, not only the ones they lead.",
    capabilities: [
      "events.create",
      "events.manage",
      "tasks.assign_any",
      "contacts.manage",
      "documents.manage",
      "finance.view",
      "finance.view_history",
      "reimbursements.view",
      "archive.view",
    ],
  },
  {
    slug: "alum",
    name: "Alum",
    description: "Read-only access to past board years.",
    capabilities: ["archive.view"],
  },
];

/**
 * What an incoming holder of each position receives during the handover overlap.
 * `immediately` applies when they are recorded as incoming; `term_start` switches on
 * by itself on the first day of their term.
 */
const HANDOVER: Record<
  string,
  { capability: Capability; timing: "immediately" | "term_start" }[]
> = {
  president: [
    { capability: "archive.view", timing: "immediately" },
    { capability: "finance.view_history", timing: "immediately" },
    { capability: "members.manage", timing: "term_start" },
    { capability: "board.manage", timing: "term_start" },
    { capability: "positions.manage", timing: "term_start" },
    { capability: "audit.view", timing: "term_start" },
  ],
  treasurer: [
    // The incoming treasurer studies history and the outstanding queue first,
    // and only gains live finance access when the term begins.
    { capability: "archive.view", timing: "immediately" },
    { capability: "finance.view_history", timing: "immediately" },
    { capability: "reimbursements.view", timing: "immediately" },
    { capability: "finance.view", timing: "term_start" },
    { capability: "finance.edit", timing: "term_start" },
    { capability: "finance.approve", timing: "term_start" },
  ],
  "events-chair": [
    { capability: "archive.view", timing: "immediately" },
    { capability: "events.create", timing: "immediately" },
    { capability: "events.manage", timing: "term_start" },
    { capability: "tasks.assign_any", timing: "term_start" },
  ],
  secretary: [
    { capability: "archive.view", timing: "immediately" },
    { capability: "meetings.manage", timing: "term_start" },
    { capability: "documents.manage", timing: "term_start" },
  ],
};

const POSITIONS: {
  slug: string;
  name: string;
  description: string;
  responsibilities: string;
  bundle: string;
  sortOrder: string;
}[] = [
  {
    slug: "president",
    name: "President",
    description: "Presides over the board and is the official voice of SAIP.",
    responsibilities: [
      "Preside over board and membership meetings",
      "Represent SAIP to the University and other student groups",
      "Support every officer in their own responsibilities",
      "Approve expenses incurred by the Treasurer",
      "Administer access to this application",
    ].join("\n"),
    bundle: "admin",
    sortOrder: "10",
  },
  {
    slug: "vice-president",
    name: "Vice President",
    description: "Stands in for the President and oversees parliamentary procedure.",
    responsibilities: [
      "Assume the President's role in their absence",
      "Oversee voting and elections",
      "Maintain the constitution and propose amendments",
    ].join("\n"),
    bundle: "officer",
    sortOrder: "20",
  },
  {
    slug: "treasurer",
    name: "Treasurer",
    description: "Owns SAIP's finances and the University's financial procedures.",
    responsibilities: [
      "Prepare funding requests for events",
      "Keep itemised records of expenses and revenue",
      "Approve board members' Concur reimbursement reports",
      "Reconcile the Spendable Balance Report in Prime monthly",
      "Confirm spendable funds are available before purchases are made",
    ].join("\n"),
    bundle: "finance",
    sortOrder: "30",
  },
  {
    slug: "secretary",
    name: "Secretary",
    description: "Keeps the board's record: agendas, minutes and attendance.",
    responsibilities: [
      "Record minutes and attendance for board meetings",
      "Tell the President when a member misses three meetings",
      "Keep the membership informed of events and decisions",
    ].join("\n"),
    bundle: "secretary",
    sortOrder: "40",
  },
  {
    slug: "events-chair",
    name: "Events Chair",
    description: "Leads the planning and execution of SAIP events.",
    responsibilities: [
      "Lead event planning and execution",
      "Collect event ideas from the general body",
      "Work with the Communications Chair to promote events",
      "Register events in MyPrincetonU",
    ].join("\n"),
    bundle: "events-lead",
    sortOrder: "50",
  },
  {
    slug: "communications-chair",
    name: "Communications Chair",
    description: "Runs SAIP's communications and external partnerships.",
    responsibilities: [
      "Manage social media and communication platforms",
      "Coordinate with partner organisations and offices",
      "Advertise events, contact guests and book spaces",
    ].join("\n"),
    bundle: "officer",
    sortOrder: "60",
  },
  {
    slug: "outreach-chair",
    name: "Outreach Chair",
    description: "Builds SAIP's presence among African international students.",
    responsibilities: [
      "Build relationships with African international students across campus",
      "Develop initiatives that make SAIP more welcoming",
      "Foster partnerships with student groups and University departments",
    ].join("\n"),
    bundle: "officer",
    sortOrder: "70",
  },
  {
    slug: "career-chair",
    name: "Career Chair",
    description: "Connects members to career, internship and fellowship opportunities.",
    responsibilities: [
      "Share career, internship and fellowship opportunities",
      "Organise events with employers and professionals",
      "Strengthen relationships with recruiters and partners",
    ].join("\n"),
    bundle: "officer",
    sortOrder: "80",
  },
  {
    slug: "graduate-representative",
    name: "Graduate Representative",
    description: "Represents graduate student members on the board.",
    responsibilities: [
      "Represent graduate student interests on the board",
      "Maintain active communication with graduate members",
      "Promote graduate participation in SAIP events",
    ].join("\n"),
    bundle: "officer",
    sortOrder: "90",
  },
];

async function main() {
  console.log("Seeding SAIP board data…\n");

  /* Capability bundles ---------------------------------------------------- */
  const bundleIds = new Map<string, string>();
  for (const b of BUNDLES) {
    const [row] = await db
      .insert(capabilityBundle)
      .values({
        slug: b.slug,
        name: b.name,
        description: b.description,
        isSystem: true,
      })
      .onConflictDoUpdate({
        target: capabilityBundle.slug,
        set: { name: b.name, description: b.description },
      })
      .returning();

    bundleIds.set(b.slug, row.id);

    await db.delete(bundleCapability).where(eq(bundleCapability.bundleId, row.id));
    await db
      .insert(bundleCapability)
      .values(b.capabilities.map((capability) => ({ bundleId: row.id, capability })));

    console.log(`  bundle  ${b.name.padEnd(14)} ${b.capabilities.length} capabilities`);
  }

  /* Board year ------------------------------------------------------------ */
  const [year] = await db
    .insert(boardYear)
    .values({
      label: "2026/27",
      startsOn: "2026-06-01",
      endsOn: "2027-05-31",
      isCurrent: true,
    })
    .onConflictDoUpdate({ target: boardYear.label, set: { isCurrent: true } })
    .returning();
  console.log(`\n  year    ${year.label} (${year.startsOn} → ${year.endsOn})`);

  /* Positions ------------------------------------------------------------- */
  console.log();
  for (const p of POSITIONS) {
    const [row] = await db
      .insert(position)
      .values({
        slug: p.slug,
        name: p.name,
        description: p.description,
        responsibilities: p.responsibilities,
        defaultBundleId: bundleIds.get(p.bundle) ?? null,
        sortOrder: p.sortOrder,
      })
      .onConflictDoUpdate({
        target: position.slug,
        set: {
          name: p.name,
          description: p.description,
          responsibilities: p.responsibilities,
          defaultBundleId: bundleIds.get(p.bundle) ?? null,
          sortOrder: p.sortOrder,
        },
      })
      .returning();

    const presets = HANDOVER[p.slug] ?? [
      { capability: "archive.view" as Capability, timing: "immediately" as const },
    ];
    await db
      .delete(positionHandoverGrant)
      .where(eq(positionHandoverGrant.positionId, row.id));
    await db.insert(positionHandoverGrant).values(
      presets.map((h) => ({
        positionId: row.id,
        capability: h.capability,
        timing: h.timing,
      })),
    );

    console.log(
      `  position ${p.name.padEnd(24)} ${p.bundle.padEnd(8)} ${presets.length} handover grants`,
    );
  }

  /* Funding sources, as ODUS documents them ------------------------------- */
  const SOURCES: { name: string; kind: string; deadlines?: string }[] = [
    { name: "Projects Board", kind: "projects_board" },
    { name: "Alcohol Initiative", kind: "alcohol_initiative" },
    { name: "ODUS Conference Fund", kind: "conference_fund" },
    { name: "SAFE award", kind: "safe" },
    { name: "Academic or administrative department", kind: "department" },
    { name: "Co-sponsoring student group", kind: "co_sponsor" },
    {
      name: "SAIP's own funds (Prime)",
      kind: "own_funds",
      deadlines:
        "Chartstring 15XXX-Q0001. Keep a positive spendable balance; check it before any purchase.",
    },
  ];

  const existingSources = await db.select({ name: fundingSource.name }).from(fundingSource);
  const known = new Set(existingSources.map((s) => s.name));
  const toAdd = SOURCES.filter((s) => !known.has(s.name));
  if (toAdd.length > 0) {
    await db.insert(fundingSource).values(
      toAdd.map((s) => ({
        name: s.name,
        kind: s.kind as "other",
        deadlines: s.deadlines ?? null,
      })),
    );
  }
  console.log(`\n  funding  ${SOURCES.length} sources (${toAdd.length} added)`);

  /* Bootstrap invitation for the President -------------------------------- */
  /*
   * Only if that address is not already a member. Re-seeding after pointing
   * SEED_PRESIDENT_EMAIL at a real address would otherwise leave a live invitation
   * for somebody who is already serving — an invitation nobody can accept, sitting
   * in the administration console as outstanding work.
   */
  const alreadyMember = await db
    .select({ id: membership.id })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(user.email, PRESIDENT_EMAIL))
    .limit(1);

  const existing = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(eq(invitation.email, PRESIDENT_EMAIL))
    .limit(1);

  if (alreadyMember.length > 0) {
    console.log(`\n  invited  ${PRESIDENT_EMAIL} is already a member — no invitation needed`);
  } else if (existing.length === 0) {
    const presidency = await db
      .select({ id: position.id })
      .from(position)
      .where(eq(position.slug, "president"))
      .limit(1);

    await db.insert(invitation).values({
      email: PRESIDENT_EMAIL,
      positionId: presidency[0]?.id ?? null,
      bundleId: bundleIds.get("admin") ?? null,
      boardYearId: year.id,
      intendedStatus: "active",
      token: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    console.log(`\n  invited  ${PRESIDENT_EMAIL} as President (admin)`);
  } else {
    console.log(`\n  invited  ${PRESIDENT_EMAIL} already has an invitation`);
  }

  console.log(
    [
      "\nDone.",
      "",
      "Next:",
      "  1. Set SEED_PRESIDENT_EMAIL in .env to your princeton.edu address and re-run",
      "     if the placeholder above is not right.",
      "  2. Sign in. Only invited addresses can get in.",
      "  3. Grant board.manage to a second member — the board must keep two",
      "     administrators so it cannot lock itself out.",
      "",
    ].join("\n"),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
