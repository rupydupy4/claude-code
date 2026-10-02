# Family Chores (device version)

The Family Chores app for one shared device: a family phone or tablet. No accounts or server are
needed, and everything is saved on the device. It's live at
https://rupydupy4.github.io/claude-code/family-chores/ and can be added to the home screen.

It has the same workflow and design as the full version in `../family-chores` (Next.js +
Supabase), which supports separate devices and real accounts.

## How it works

- The parent sets up the household with a **parent PIN** (4–6 digits). Only the parent, after
  entering the PIN, can create, edit, approve or delete chores and manage children.
- Children tap their name on the **Who's using?** screen to see their chores and hand them in,
  with an optional photo and note.
- Statuses: To do → Waiting for approval → Approved, or Needs changes → resubmit.
- Rewards (money, screen time or custom) are recorded when a chore is approved. They're records
  only.
- The demo (The Smith Family; parent Sarah, PIN `1234`) can be loaded from the welcome screen.

All the rules live in one place, `src/lib/store.ts`. Data is in `localStorage`, and photos are
resized to at most 1600 px and stored in IndexedDB.

The parent PIN is a household lock, not real security: someone with full access to the device and
its developer tools could change the stored data. For separate devices and server-enforced rules,
use the full version.

## Commands

```bash
npm install
npm run dev
npm run typecheck && npm test   # store rules (Vitest)
npm run build && npm run test:e2e   # full workflow in a phone-sized browser
```
