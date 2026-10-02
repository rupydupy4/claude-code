# Family Chores

A small, calm chores-and-rewards app for families.

**Parent creates a chore → assigns it to a child → the child marks it done (optionally with a
photo) → the parent approves or asks for changes → the reward is recorded.**

Rewards are records only: there are no payments, banking or screen-time controls.

## Stack

Next.js 16 (App Router, server actions) · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres,
private Storage).

## How it works

| | Parent | Child |
|---|---|---|
| Signs in with | Email and password | Household code + first name + 6-digit PIN |
| Can | Create the household, add children, create/assign/edit/delete chores, approve or send back submissions, see rewards | See their own chores, mark them done with an optional photo and note, resubmit, see their rewards |

Chore statuses: **To do → Waiting for approval → Approved**. If sent back: **Waiting for approval →
Needs changes → (resubmit) → Waiting for approval**.

Rewards: money (€), screen time (minutes) or a custom reward. A reward counts once the chore is
approved; totals are summed from approved chores.

## Security

Everything is enforced in the database, so it holds even if someone bypasses the UI:

- **Row level security** on every table. Members read only their own household. Children read
  only chores assigned to them.
- **No direct writes.** Clients can't insert, update or delete rows. Every change goes through a
  Postgres function (`supabase/migrations/…_family_chores.sql`) that looks up the caller's role
  in the `members` table. Roles sent by a client are never trusted.
  - `review_chore` only works for a parent of that household, so a child can never approve a
    chore.
  - `submit_chore` only works for the assigned child, and only from *To do* or *Needs changes*.
- **Private photos.** The `proofs` bucket is not public. Its limits are 5 MB per file and
  JPEG/PNG/WebP/HEIC only. Files are stored at `<household>/<chore>/…`.
  - Only the assigned child can upload, and only while the chore can be handed in.
  - Only that household can view them, through 30-minute signed links. Children can only view
    photos on their own chores.
- **Secrets stay on the server.** The browser only gets the public Supabase URL and anon key. The
  service-role key is used only in server code (`src/lib/supabase/admin.ts`, marked
  `server-only`), for two things: creating or removing children's sign-in accounts after
  checking the caller is their parent, and the demo.
- **Minimal data.** Children have a first name, an optional avatar colour and a PIN, nothing
  else. Their auth accounts use an internal `.invalid` address that never receives mail.

`tests/security.test.ts` checks all of this against a real Supabase. It covers cross-household
reads, a child approving their own chore, a child editing tables directly, uploads into the wrong
folder, oversized or non-image files, public photo URLs and signed links for other households.

## Run it locally

Needs Node 20.9+ and Docker.

```bash
npm install
npx supabase start          # local Supabase; prints the URL and keys
npx supabase db reset       # applies supabase/migrations
cp .env.example .env.local  # fill in the URL, anon key and service-role key from `supabase start`
npm run demo:seed           # optional: The Smith Family demo
npm run dev                 # http://localhost:3000
```

### Demo

With `DEMO_MODE=true` the sign-in page has a **Try the demo** panel for *The Smith Family*:

- Sign in as Sarah (parent), Alex or Jamie with one tap.
- Child sign-in uses code `SMITHS`, with PIN `111111` for Alex and `222222` for Jamie.
- Example chores: Clean bedroom (€5), Take out bins (30 min screen time), Feed the dog (€2), plus two
  already-approved chores so the rewards pages have history.
- **Reset demo data** restores it.

Turn demo mode off for a real family: the demo accounts are shared and anyone can reset them.

## Tests

```bash
npm run typecheck && npm run lint
npm test               # database security tests (needs `supabase start`)
npm run build && npm run test:e2e   # browser test of the whole workflow (needs `supabase start`)
```

The browser test runs the full workflow end to end in two separate browsers (phone size):

1. Parent signs up and creates a household.
2. Parent adds a child.
3. Parent creates a chore and assigns it.
4. Child signs in (a wrong PIN is rejected) and can't open parent pages.
5. Child hands the chore in with a photo and a note.
6. Parent sees the private photo and asks for changes.
7. Child sees the feedback and resubmits.
8. Parent approves.
9. The reward appears for both of them.

It also tries the demo household.

## Deploy

1. Create a Supabase project. Run `npx supabase link` and then `npx supabase db push` to apply
   the migration.
2. In Supabase → Authentication → URL Configuration, set the Site URL to your app's address.
   Email confirmation can stay on: new parents finish setup after confirming.
3. Deploy to Vercel (or any Node host) with these environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only)
   - `DEMO_MODE` (`false` for a real family)

A static host such as GitHub Pages can't run this app, because it needs server code.

### Known limits

- Children sign in through the server, so Supabase's sign-in rate limit is shared by everyone
  using that server. That's fine for a family, but raise the limit if you host many households.
- There are no recurring chores or notifications, on purpose, to keep the MVP small.
