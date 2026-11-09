# Family Chores

A small, calm chores-and-rewards app for families.

**Parent creates a chore → assigns it to a child → the child marks it done (optionally with a
photo) → the parent approves or asks for changes → the reward and points are recorded.**

Rewards are records only: there are no payments, banking, screen-time controls or real
notifications.

## Stack

Next.js 16 (App Router, server actions) · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres,
private Storage).

## Features

| | Parent | Child |
|---|---|---|
| Signs in with | Email and password | Household code + first name + 6-digit PIN |
| Can | Create the household, add children, create/assign/edit/delete chores, approve or send back submissions, see weekly progress, see rewards and mark them as paid out | See their own chores, mark them done with an optional photo and note, resubmit, see their points, streak and rewards |

- **Repeating chores.** A chore can happen once, every day, or every week on chosen days (for
  example Mon, Wed and Fri). When a parent approves a repeating chore, the next one is created
  automatically with the next due date. If the chore was done late, the next one is counted from
  today, so it never starts out overdue. To stop a chore repeating, edit the open one and choose
  *Once*, or delete it.
- **Due dates and overdue highlighting.** Overdue chores get a red marker and an "overdue" count.
  Both parents and children see chores grouped as **Today** (due today or overdue), **This week**
  (the rest of this Monday-to-Sunday week) and **Later** (after this week, or no due date).
- **Points and streaks.** Each chore is worth points (10 by default, 0–1000). Children see a
  friendly progress card with their total points, points this week, a level (every 50 points)
  and their **streak**: the number of days in a row with at least one approved chore. A chore
  counts for the day it was handed in, so a parent approving late doesn't break the streak. The
  streak stays alive until the end of today.
- **Parent dashboard.** Chores waiting for approval at the top, then each child's week (chores due
  this week that are done, chores approved, points, streak), then **Rewards to hand over**: what
  each child is owed in money, screen-time minutes and custom rewards. **Mark as paid out**
  records that you've handed it over (no money moves); the record is kept in a `payouts` table.
- **Polish.** Clear empty states, loading skeletons, friendly error pages with *Try again*,
  accessible labels, a skip link, phone-first layout, and a light/dark theme that follows your
  device setting.

### Chore statuses

**To do → Waiting for approval → Approved.** If sent back: **Waiting for approval → Needs changes →
(resubmit) → Waiting for approval**. An approved reward is either **not paid out yet** or **paid
out**.

Rewards: money (€), screen time (minutes) or a custom reward. A reward counts once the chore is
approved; totals are summed from approved chores.

## Security

Everything is enforced in the database, so it holds even if someone bypasses the UI:

- **Row level security** on every table. Members read only their own household. Children read
  only chores (and payout records) of their own.
- **No direct writes.** Clients can't insert, update or delete rows. Every change goes through a
  Postgres function in `supabase/migrations/` that looks up the caller's role in the `members`
  table. Roles sent by a client are never trusted.
  - `review_chore` only works for a parent of that household, so a child can never approve a
    chore. Approving a repeating chore creates the next one inside the same function, and only a
    chore that is *Waiting for approval* can be approved, so each one creates at most one
    successor.
  - `submit_chore` only works for the assigned child, and only from *To do* or *Needs changes*.
  - `create_chore` / `update_chore` (parents only) check the repeat rule and points in the
    database.
  - `mark_rewards_paid` only works for a parent of that child's household, only on approved,
    unpaid chores, and locks the rows so the same reward can't be paid twice.
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

`tests/security.test.ts` checks all of this against a real Supabase: cross-household reads, a
child approving their own chore, a child editing tables directly, uploads into the wrong folder,
oversized or non-image files, public photo URLs, signed links for other households, repeat rules,
the automatic next chore (exactly one, with the right date), children and other households
trying to mark payouts, double payouts, and payout privacy.

## Run it locally

Needs Node 20.9+ and Docker Desktop.

```bash
npm install
npx supabase start          # local Supabase; prints the URL and keys
npx supabase db reset       # applies supabase/migrations
cp .env.example .env.local  # fill in the URL, anon key and service-role key from `supabase start`
npm run demo:seed           # optional: The Smith Family demo
npm run dev                 # http://localhost:3000
```

On Windows you can double-click **`start.bat`** once `.env.local` exists. It installs the
packages the first time, opens your browser and starts the app. Close its window to stop.

### Demo

With `DEMO_MODE=true` the sign-in page has a **Try the demo** panel for *The Smith Family*:

- Sign in as Sarah (parent), Alex or Jamie with one tap.
- Child sign-in uses code `SMITHS`, with PIN `111111` for Alex and `222222` for Jamie.
- Example chores: Clean bedroom (€5, 20 points), Feed the dog (€2, repeats daily), Take out bins
  (30 min screen time, repeats weekly), an overdue Water the tomatoes, Wash the car next week, and
  some approved chores so Alex has a 3-day streak and Jamie has a reward already paid out.
- **Reset demo data** restores it.

Turn demo mode off for a real family: the demo accounts are shared and anyone can reset them.

## Tests

```bash
npm run typecheck && npm run lint
npm test                # unit tests: dates, repeats, grouping, points, streaks, balances (no database)
npm run test:security   # database security tests (needs `supabase start` and .env.local)
npm run build && npm run test:e2e   # browser test of the whole workflow (needs `supabase start`)
```

The browser test runs the full workflow end to end in two separate browsers (phone size):

1. Parent signs up and creates a household.
2. Parent adds a child.
3. Parent creates a daily repeating chore worth 15 points and assigns it.
4. Child signs in (a wrong PIN is rejected), sees it under Today with their progress card, and
   can't open parent pages.
5. Child hands the chore in with a photo and a note.
6. Parent sees the private photo and asks for changes.
7. Child sees the feedback and resubmits.
8. Parent approves; the next one is scheduled for tomorrow.
9. The dashboard shows the child's week and the €3 owed; the parent marks it as paid out.
10. The reward appears for both of them; the child sees 15 points and a 1-day streak.
11. An overdue chore is highlighted for both of them.

It also tries the demo household.

## Deploy

1. Create a Supabase project. Run `npx supabase link` and then `npx supabase db push` to apply
   the migrations.
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
- There are no notifications, on purpose. Nobody is told when a chore is handed in or approved;
  open the app to see.
- The next repeating chore is only created when the current one is approved. If a chore is never
  handed in, no new ones pile up behind it; it simply shows as overdue.
- Streaks and points are worked out from approved chores each time a page loads (not stored), from
  the most recent 1,000 chores. Deleting an approved chore removes its points.
- "Mark as paid out" covers everything owed of one type for a child (or one custom reward). It
  can't be undone in the app, and partial payouts aren't supported.
- Weeks run Monday to Sunday, in the household's time zone (taken from the parent's browser at
  sign-up).
