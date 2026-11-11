# SAIP Board

The executive board workspace for the Society for African Internationals at Princeton:
events, tasks, meetings, finances and conversation in one place, built so that the
record survives a complete change of board every year.

Design and architecture: [`docs/01-product-and-architecture.md`](docs/01-product-and-architecture.md).

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Database | Postgres, Drizzle ORM |
| Auth | Better Auth — Google sign-in, invitation only |

## Running it locally

You need Node 20+ and Docker.

```bash
# 1. database
docker run -d --name saip-postgres --restart unless-stopped \
  -e POSTGRES_USER=saip -e POSTGRES_PASSWORD=saip -e POSTGRES_DB=saip \
  -p 5433:5432 postgres:17

# 2. configuration
cp .env.example .env            # then fill in BETTER_AUTH_SECRET
npm install

# 3. schema and starting data
npm run db:migrate
SEED_PRESIDENT_EMAIL=you@princeton.edu npm run db:seed

# 4. go
npm run dev
```

The seed creates the nine board positions, four capability bundles, the current board
year, each position's handover preset, and an invitation for the address you passed.
Nothing about the board is hardcoded — positions and bundles are rows, meant to be
edited as SAIP changes.

### Signing in

Access is invitation-only: a `princeton.edu` address grants nothing on its own.

For local development without Google credentials, `DEV_LOGIN=1` in `.env` enables
password sign-in, which still goes through the invitation gate. It is hard-disabled
when `NODE_ENV=production`.

The seeded `president@princeton.edu` account was given a throwaway password during
setup; it is recorded in `.env` as `DEV_PRESIDENT_PASSWORD`. To reset it, or to set up
an account at your own address:

```bash
docker exec saip-postgres psql -U saip -d saip \
  -c "delete from \"user\" where email = 'you@princeton.edu';" \
  -c "update invitation set accepted_at = null where email = 'you@princeton.edu';"

SEED_PRESIDENT_EMAIL=you@princeton.edu npm run db:seed

curl -s -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"name":"Your Name","email":"you@princeton.edu","password":"pick-one"}'
```

To use real Google sign-in, create OAuth credentials with the redirect URI
`http://localhost:3000/api/auth/callback/google` and set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`.

## Scripts

| | |
|---|---|
| `npm run dev` | development server |
| `npm run db:generate` | generate a migration from schema changes |
| `npm run db:migrate` | apply migrations |
| `npm run db:studio` | browse the database |
| `npm run db:seed` | seed positions, bundles, board year, handover presets |
| `npm run verify:access` | check the dated-grant access model end to end |
| `npm test` | integration tests against the local database |
| `npm run typecheck` | `tsc --noEmit` |

## Money, alongside Princeton's systems

The application plans, documents and chases. Prime is the University's financial system
of record and Concur moves reimbursements; nothing here asserts that money moved. What
it does do is carry the policies that cost student groups money when they are missed:

- paying an individual for services out of pocket is refused outright, with the reason;
- alcohol and gift cards are refused;
- spending against an event that is not registered in MyPrincetonU is flagged;
- out-of-pocket purchases open a reimbursement claim immediately and are chased through
  the real chain — member files in Concur, treasurer approves, ODUS, Finance and
  Treasury, paid;
- a treasurer cannot approve their own claim, because the president must;
- a balance read from Prime and one this application estimated are never added together.

The reimbursement deadline is configurable through `REIMBURSEMENT_WINDOW_DAYS` because
Princeton's own pages disagree — 30 business days, one week and five days all appear.
The default is the strictest reading, and the citation is shown wherever it matters.

## Messaging

One conversation primitive carries four containers: threads attached to an event, task
or meeting; channels, which are part of the board's record and searchable across years;
private groups; and direct messages.

Direct messages and private groups are readable only by their participants. No
capability overrides that — `members.manage` and `board.manage` open nothing — and they
are excluded from search for everyone else and from the archive. Channels and object
threads are the record.

Attachments are written to `UPLOAD_DIR` (default `var/uploads`), outside `public/`, with
generated names. They are served only through `/api/files/[id]`, which checks that the
viewer may read the conversation first. A deployment with an ephemeral filesystem needs
object storage instead; only `src/lib/messages/storage.ts` changes.

Unread state is per participant. Browser push notifications are not built yet.

## Adding SAIP's logo

Drop the file into `public/` as `saip-logo.svg` (or `.png`). It is picked up
automatically in the sidebar and on the sign-in page; until then the app shows a plain
monogram.

## How access works

Three things are kept apart on purpose:

- **Position** — an organisational title (President, Treasurer). Editable, retirable,
  never deleted. It grants nothing at request time; it only supplies a default set of
  capabilities when someone is appointed.
- **Membership** — a person's access to this application, with a descriptive status.
- **Capability grant** — the thing that actually permits an action. Each grant may
  carry `effective_from` and `expires_at`.

That one dated-grant mechanism covers progressive handover (the incoming Treasurer
reads past finances now and gains live access when the term starts), automatic
revocation when a term ends, and temporary delegation. `npm run verify:access`
demonstrates all three.

Authorisation is resolved on the server for every request in `src/lib/access.ts` and
`src/lib/session.ts`. The interface hides what you cannot use, but hiding is never the
control.

## Layout

```
src/
  app/
    (app)/          everything behind sign-in: dashboard, events, tasks,
                    meetings, board, admin
    sign-in/
  components/       app shell, design-system primitives, thread
  db/
    schema/         auth.ts · board.ts (people, positions, grants)
                    work.ts (events, tasks, meetings, conversations)
    seed.ts
  lib/
    access.ts       capabilities, grants, the two-administrator invariant
    auth.ts         Better Auth config and the invitation gate
    session.ts      "who is asking" for pages and handlers
    capabilities.ts the capability list
    admin/          administration service + queries + server actions
    work/           events, tasks, meetings, conversations
    finance/        budgets, expenses, reimbursements, policy guardrails
    messages/       direct messages, groups, channels, search, attachments
scripts/
tests/
docs/
```

## Testing

`npm test` runs integration tests against the local development database. They drive
the service layer directly — the same path a form takes — so an unauthorised attempt
in a test is the same unauthorised attempt a browser would make. They cover the
administration workflows (invitations, appointments, grants, the two-administrator
invariant, transferring administration), the Milestone 2 work (event copying, task
ownership, threads, private conversations) and Milestone 3 (the Concur approval chain,
the University's spending prohibitions, and balance provenance).

Run `npm run db:seed` first: the tests expect the positions and board year to exist.

## Deploying it

[DEPLOYMENT.md](DEPLOYMENT.md) covers hosting, PostgreSQL, file storage and backups:
what to create, who should own the accounts, and the one code change the free
serverless route needs. Read the account-ownership section before creating anything —
a deployment tied to one student's login is a handover problem the application itself
cannot solve.

## Installing it on a phone

The app is a progressive web app, so there is nothing to put in an app store. Open it
in a browser and install it:

- **iPhone / iPad** — Safari only, Apple allows no other engine to install. Share →
  *Add to Home Screen*. It needs HTTPS, which `localhost` counts as for Safari on the
  Mac but not for a phone pointed at a laptop.
- **Android** — Chrome offers *Install app* in its menu, or prompts by itself.
- **Desktop** — Chrome and Edge show an install button in the address bar.

Installed, it opens on the dashboard with no browser chrome, and the four places a
board member goes most — workspace, messages, events, tasks — sit in a bottom tab bar
with *More* for everything else.

### Notifications

Notifications are always recorded in the app; browser push only decides whether a
closed app can still interrupt you. Generate the server's keys once:

```
npx web-push generate-vapid-keys
```

Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the private one in
`VAPID_PRIVATE_KEY`, and an address you own in `VAPID_SUBJECT`. Each board member then
turns push on per browser from *Notifications*, which is the only place the browser
permission prompt should ever appear. iOS delivers push only to an app that has been
added to the Home Screen.

### What the service worker caches

Deliberately almost nothing: the offline page, the logo, the icons, and the build's own
hashed static files. No HTML page and no API response is ever written to a cache,
because every page in here is somebody's private board record — minutes, finances,
direct messages. The consequence is honest rather than clever: offline, you get a page
saying you are offline, not a stale copy of the treasurer's ledger.

A new deployment is noticed within the hour and on every launch. Nothing swaps under
your feet: a small prompt offers to reload, and declining leaves the running version
alone until the next launch.
