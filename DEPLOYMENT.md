# Putting SAIP Board online

Written November 2026. Every allowance below is a vendor's published free tier, and
those change; the figures are what to check rather than what to trust. Where a number
decides something, the guide says what to do if it has moved.

## The one architectural decision

The application writes uploaded files to a directory on disk (`UPLOAD_DIR`, see
`src/lib/messages/storage.ts`). That single module is the whole of it — about forty
lines, with no object-storage assumptions anywhere else in the codebase. But it means
the host has to be chosen with it in mind, because a platform with an ephemeral
filesystem would lose every attachment on each deploy, silently, while the database
rows that reference them survive. Broken download links on last year's catering quote
is a bad way to find this out.

So there are two shapes of deployment, and the choice is between paying nothing and
changing one file, or paying a few dollars and changing nothing.

| | **A. Serverless** | **B. One small server** |
|---|---|---|
| Host | Vercel Hobby | Fly.io or Render |
| Files | Cloudflare R2 (needs the storage swap) | a mounted disk, no code change |
| Database | Neon | the host's Postgres, or Neon |
| Cost | $0 | roughly $5–15 a month |
| Sleeps? | no | no (not on a paid plan) |

**Recommendation: A.** Not only because it is free, but because a recurring card
payment is the single worst expense shape for a Princeton student group. The
application itself refuses to record an out-of-pocket payment for a service — that is
University policy, not a quirk — and a $7 monthly charge on a student's own card is
exactly the thing that is awkward to get back through Concur, every month, forever,
including the months after that student graduates. Free hosting is a governance
decision here as much as a financial one.

## Who should own the accounts

Read this part before creating anything.

This application exists because institutional memory walks out of the door every May.
The hosting accounts are subject to the same problem, and nothing in the software can
fix it: a Vercel Hobby team has no collaborators, so whoever's login holds the project
*is* the deployment. If that is a personal account, the next President inherits an
application they cannot redeploy, repoint or rescue.

**Create every account below under an address SAIP keeps, not a personal one.** A
dedicated mailbox the board passes on — a `saip.board@gmail.com`, or better, whatever
shared address ODUS or OIT will give the organisation — and put its credentials
wherever the board already keeps shared secrets. The application keeps two
administrators for exactly this reason; the infrastructure deserves the same care.

## Accounts to create

| Service | What for | Card needed? | Notes |
|---|---|---|---|
| **GitHub** | the code, and the free scheduled backup job | no | a private repository is fine |
| **Vercel** | hosting | no | sign in with the GitHub account; Hobby plan |
| **Neon** | PostgreSQL | no | free plan, no card |
| **Cloudflare** | R2, for uploaded files | **probably** | sources conflict; see below |
| Google Cloud | OAuth — **already done** | no | one change needed, see below |

Cloudflare is the one to expect friction from. Cloudflare's own R2 page advertises
"no credit card required", while several recent third-party write-ups and user reports
say the R2 dashboard asks for a card anyway, possibly only to verify identity. Find out
early. If it does ask and the board would rather not, **Backblaze B2** is the usual
substitute — S3-compatible, 10 GB free — and the storage module would be written the
same way, since both speak the S3 API.

You do not need a domain. Vercel issues `something.vercel.app` with HTTPS, which is
enough for everything including iOS installation and web push. A real address is nicer
on a handover document, and `saip.princeton.edu` would have to come from OIT.

## Free-tier figures worth knowing before you rely on them

- **Vercel Hobby** — 100 GB data transfer, 1,000,000 CDN requests, 1,000,000 function
  invocations, 4 CPU-hours, 100 deployments a day. A fifteen-person board will not come
  close to any of these. Exceed one and the feature stops until 30 days have passed —
  there is no overage bill, which for a student group is the right failure mode.
- **Vercel's non-commercial restriction** — Hobby is "restricted to non-commercial
  personal use only". Vercel defines commercial as any deployment used "for the purpose
  of financial gain of anyone involved in any part of the production", and every example
  it gives is about taking payments, selling, advertising or affiliate links. It states
  that asking for donations is *not* commercial usage. An internal board workspace with
  no revenue, no ads and nobody paid to build it matches none of the examples. The word
  "personal" is the only loose thread, and Vercel's own guidance is to ask Support if
  unsure — worth one email before launch, so the answer is on record for the next board.
- **Neon free plan** — 100 CU-hours of compute a month, autoscaling to 2 CU, compute
  suspending after 5 minutes idle, and a 6-hour restore window. Published storage is
  either 0.5 GB or 1 GB per project depending on the source; check the dashboard. Board
  records are text and will not approach it. Running out of CU-hours suspends the
  database until the next month, so watch it in the first term.
- **Cloudflare R2** — 10 GB of storage, 1,000,000 Class A and 10,000,000 Class B
  operations a month, and no egress charge at all. Attachments are the only thing that
  grows; 10 GB is years of meeting documents.

## Backups, which none of the above gives you

Neon's 6-hour restore window is not a backup. It covers a bad migration you notice the
same morning; it does not cover a mistake found in April, a provider closing an account,
or the board deciding to leave. Something must take its own copies, somewhere else.

`.github/workflows/backup.yml` in this repository does that: a weekly `pg_dump`,
compressed and uploaded to the same S3-compatible bucket as the attachments, under
`backups/`, keeping the last twelve. It runs on GitHub's free Actions minutes and needs
five repository secrets (`DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`). A manual run button is included; use it once after setting the
secrets, rather than finding out in a year that the schedule never worked.

Restoring is `pg_restore` against a fresh Neon branch. Do it once, on purpose, while
nothing is wrong — an untested backup is a hope, not a plan.

## Steps

1. Create the accounts above, under the shared SAIP address.
2. Push this repository to GitHub.
3. Neon: create a project, copy the pooled connection string.
4. Cloudflare: create an R2 bucket and an API token scoped to it.
5. Swap the storage module to S3 (option A only — not yet done; see below).
6. Vercel: import the repository and set the environment variables from
   `.env.example` — `DATABASE_URL`, `BETTER_AUTH_SECRET` (a fresh
   `openssl rand -base64 32`, not the development one), `BETTER_AUTH_URL` (the
   deployed URL), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_HOSTED_DOMAIN`,
   `ALLOWED_EMAIL_DOMAIN`, the three VAPID values, and the S3 settings.
   **Do not set `DEV_LOGIN`.** Password sign-in is additionally hard-gated on
   `NODE_ENV`, so production refuses it regardless, but leave it out anyway.
7. Google Cloud Console: add `https://<your-domain>/api/auth/callback/google` to the
   OAuth client's authorised redirect URIs. The existing localhost entry can stay.
8. Run the migrations against Neon (`npm run db:migrate`) and then `npm run db:seed`
   with `SEED_PRESIDENT_EMAIL` set to the President's address.
9. Sign in with Google. Invite the board. Grant a second administrator immediately —
   the application warns until there are two, and that warning is the whole point.
10. Add the backup secrets and run the workflow once by hand.

### The storage swap, if you take option A

`src/lib/messages/storage.ts` exposes four functions — write, read, a path resolver and
a size limit — and `src/app/api/files/[id]/route.ts` is the only reader. Replacing the
body of that module with S3 `PutObject`/`GetObject` calls leaves every permission check,
every attachment row and every test untouched, because the module is already the seam.
It is a contained piece of work, not a refactor.
