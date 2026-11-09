# Family Chores (device version)

The Family Chores app for one shared device: a family phone or tablet. No accounts or server are
needed, and everything is saved on the device. It's live at
https://rupydupy4.github.io/claude-code/family-chores/ and can be added to the home screen. The same
code is wrapped with **Capacitor** as an iPhone/iPad and Android app, ready to submit to the App
Store and Google Play (see **STORE_LISTING.md**).

It has the same workflow and features as the full version in `../family-chores` (Next.js +
Supabase), which supports separate devices and real accounts.

## Try it

Double-click **start.bat**. It installs what it needs if that hasn't been done yet (a minute or so),
builds the app if there's no `dist` folder yet, then starts a local copy of the finished app and
opens your browser at http://localhost:4173/claude-code/family-chores/ (the same address path as the
live site). Press **Try the demo** to look around: The Smith Family, parent Sarah, PIN `1234`.
Close the black window to stop it.

To see it phone-sized, press **F12** in the browser, then **Ctrl+Shift+M** (the device toolbar) and
pick a phone such as iPhone 12 Pro. After changing the code, run `npm run build` (or delete the
`dist` folder) so start.bat shows the new version; `npm run dev` shows changes instantly while you work.

## How it works

- The parent sets up the household with a **parent PIN** (4–6 digits). Only the parent, after
  entering the PIN, can create, edit, approve or delete chores, manage children, mark rewards as paid
  out, back up, restore or delete data.
- Children tap their name on the **Who's using?** screen to see their chores and hand them in,
  with an optional photo (camera or library) and note.
- Statuses: To do → Waiting for approval → Approved, or Needs changes → resubmit.
- **Repeating chores:** once, daily, or weekly on chosen days. Approving one creates the next one
  (never in the past, and only one per approval).
- **Due dates:** chores are grouped into Today (including overdue), This week and Later; overdue ones
  get a red edge and label.
- **Points and streaks:** each chore is worth points (default 10). Children see their level (every 50
  points), points this week and their day streak. A chore counts for the day it was handed in, so a
  late approval doesn't break a streak.
- **Parent dashboard:** waiting for approval first, then each child's completion this week, then the
  rewards still to hand over, with **Mark as paid out** (a record only: no money moves).
- **Backup:** Settings → Save a backup makes one JSON file with everything, photos included (in the
  app it opens the share sheet; in a browser it downloads). Restore it from Settings or from the
  first screen on a new phone. **Delete all data** removes everything.
- Light and dark themes follow the device setting. Buttons are at least 44 px tall, screens respect
  notches and the home bar, and the Android back button goes back (or closes an "are you sure?" step).
- **Privacy:** no data is collected, nothing is uploaded, no tracking. See PRIVACY.md and the in-app
  Privacy policy and Terms pages.

All the rules live in one place, `src/lib/store.ts`. Data is in `localStorage`; photos are resized
to at most 1600 px and stored in IndexedDB. Households saved by the first version are upgraded
automatically on start-up, and the original saved text is kept under
`family-chores:data-before-upgrade`. Data from a newer version is never overwritten.

The parent PIN is a household lock, not real security: someone with full access to the device and
its developer tools could change the stored data. For separate devices and server-enforced rules,
use the full version.

## Commands

```bash
npm install
npm run dev                    # try it in the browser
npm run typecheck && npm test  # store rules (Vitest, 29 tests)
npm run build && npm run test:e2e   # full workflow in a phone-sized browser (Edge/Chrome)
npm run icons                  # redraw the icon and splash images (scripts/make-icons.mjs)
npm run assets                 # ...and regenerate the native icon sets and splash screens
npm run cap:sync               # build and copy the web app into android/ and ios/
npm run android:debug          # debug APK (needs Android Studio's SDK and Java)
```

The web build uses relative paths, so it works both on GitHub Pages under
`/claude-code/family-chores/` and inside the native apps. The service worker (offline web app) is
only used in the browser; the store apps carry their files inside the app.

## Folders

- `src/` the app (React + TypeScript + Tailwind). `src/lib/store.ts` rules, `src/lib/native.ts`
  the small native layer (back button, splash screen, haptics, sharing the backup file).
- `src/tests/` unit tests; `e2e/run.mjs` the browser test.
- `android/`, `ios/` the Capacitor projects (app id `com.rupydupy4.familychores`).
- `assets/` the original icon design and the source images for icons and splash screens.
- `PRIVACY.md`, `STORE_LISTING.md` store paperwork and the remaining manual steps.

## What couldn't be done on this PC

- **iOS build:** needs a Mac with Xcode and an Apple Developer account.
- **Android APK/AAB:** the Android SDK and Java aren't installed here, so `npm run android:debug`
  stops with a clear message. Install Android Studio, then build there (steps in STORE_LISTING.md).
