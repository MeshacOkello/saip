# Putting SAIP Board online

Written November 2026. Every allowance below is a vendor's published free tier, and
those change; the figures are what to check rather than what to trust. Where a number
decides something, the guide says what to do if it has moved.

## What is actually deployed

This section records the deployment as built, in November 2026. The reasoning that
led here is below it.

| | |
|---|---|
| Host | Vercel, Hobby plan, project `saip-board` |
| Production URL | `https://saip-board-saip3.vercel.app` |
| Database | Neon Postgres 18, free plan, via the Vercel marketplace |
| Uploaded files | Vercel Blob, store `saip-board-files`, **private** access |
| Region | `iad1` for both |
| Cost | nothing |

Everything is in one account with one bill of zero, which is the point.

### Files: the decision that shaped the rest

The application writes uploaded files through `src/lib/messages/storage.ts`. On a
server or a laptop that is a directory on disk. On Vercel the function filesystem is
discarded after every request and every deploy, so attachment rows in Postgres would
have outlived the bytes they point at — downloads quietly failing on last term's
catering quote, with nothing in the logs to say why.

That module now picks its backend from the environment: `UPLOAD_DIR` where there is a
disk, a private Vercel Blob store where `BLOB_READ_WRITE_TOKEN` is set. Vercel Blob
rather than the Cloudflare R2 this guide first recommended, because it needs no second
vendor, no card, and `access: "private"` means a blob cannot be fetched without the
store credentials the server holds. `/api/files/[attachmentId]` still refuses anyone
who may not read the conversation before a byte moves.

Local development and the test suite are untouched by this and need no cloud account.

### Two things that only break in production

Both of these worked perfectly on a laptop and failed, or would have failed, once
deployed. They are recorded because they are the shape of problem that costs an
afternoon.

**The bundler traced the whole project through the upload path.** `UPLOAD_DIR` is read
from the environment, so Turbopack cannot statically scope `path.resolve(UPLOAD_DIR,
key)`, gives up, and pulls every file in the project into the serverless bundle.
Locally that is a warning. On Vercel it failed the build outright while collecting
page data for the download route. The path checks carry `turbopackIgnore` now; the
traversal guard is unchanged in force and runs at request time regardless.

**pdfkit reads its font metrics from disk.** It builds the path to its `.afm` files at
runtime, and Next's output tracing follows imports rather than runtime paths, so those
files never entered the function bundle. The handover PDF route would have returned
500 in production while working on a laptop. `outputFileTracingIncludes` in
`next.config.ts` names them explicitly.

### A setting that would have locked the board out

New Vercel projects arrive with `ssoProtection` set to `all_except_custom_domains`:
every `.vercel.app` URL demands a *Vercel* login with team access. SAIP's board have
Princeton Google accounts, not Vercel accounts — they would have hit a wall before
ever seeing the sign-in page. It is narrowed to `preview` only, so unfinished builds
stay gated and production is reachable. The application's own authentication is what
protects the data, and it is untouched.

### Secrets

Production holds a `BETTER_AUTH_SECRET` and a VAPID keypair generated for it, all
distinct from the development values. `DEV_LOGIN` and `DEV_PRESIDENT_PASSWORD` are
absent, and password sign-in is additionally hard-gated on `NODE_ENV`, so production
refuses it even if someone sets the variable later.

`scripts/push-env.sh` is how they got there: values stream from a local file straight
into the Vercel CLI on stdin, so nothing echoes into a terminal scrollback, a shell
history or a chat transcript. It refuses to send `DEV_*` keys to production, and
refuses `DATABASE_URL` and the Postgres and Blob variables as well — those belong to
the platform, and a local value is a Docker container on somebody's laptop.

### Where the President account comes from

The seed creates an *invitation*, not an account. The account itself is created the
first time that address signs in with Google, which is what the access gate is for: a
princeton.edu address grants nothing on its own, and only an invited one can get in.
There is no password account in production at all.

## The reasoning, and the alternative

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
