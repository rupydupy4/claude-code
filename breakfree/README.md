# BREAKFREE

**Understand your habits. Change your future.** · *Progress over perfection.*

BREAKFREE is a privacy-first, offline-capable habit tracker. You choose habits to quit, reduce,
limit, replace with something healthier, or simply observe. Each habit is tracked on its own
terms. Everything is stored in your browser; no account, server, API key or paid service is involved.

Live: `https://<user>.github.io/<repo>/breakfree/` (deployed by `.github/workflows/deploy-routine-app.yml`).

## Features

| Area | What's there |
| --- | --- |
| Onboarding | Optional 5-step setup (welcome, interests, tracking styles, privacy, finish). Skippable. Progress survives a refresh. |
| Habit library | 123 data-driven templates across all 12 categories. Search, category and tracking-method filters, A–Z and recently-added sorting, detail view with guidance and health cautions. |
| Custom habits | Create any habit; edit, archive, restore, delete (with confirmation). |
| Tracking engine | Six modes: **quit** (abstinence), **reduce frequency**, **limit time**, **quantity** (any unit), **build an alternative**, **observe**. Per-habit goals, triggers, alternative, linked habit, milestones, reminder and notes. |
| Check-ins | Goal met / partly met / not met, with the meaning spelled out per mode. One per habit per day (saving again corrects it). Past days can be corrected from the calendar. |
| Habit detail | Target, status, streaks, totals, milestones, month calendar, 14-day chart, entries (edit/delete), trigger history, links, notes. |
| Dashboard | Live summary (active habits, check-ins, goals, streaks, focus time, mission completion), mode-specific habit cards, today's missions and check-ins, weekly summary with like-for-like comparison, optional XP level. |
| Urge toolkit | Reset session (1/2/5/10 min; start, pause, resume, restart, end, optional reflection), breathing guide, 16 offline activities with filters and random pick, distraction list and log. Works offline. |
| Missions & routines | Create, edit, complete, undo, archive, restore, delete; one-time / daily / selected-day recurrence; suggestion templates; ordered morning/afternoon/evening routines that can be paused or archived. |
| Focus timer | 15/25/45/60/custom minutes, configurable break, start/pause/resume/reset/skip break/end, history with delete, daily and weekly totals. |
| Goals | Numeric or step-based goals with units, dates, milestones, linked habit; pause, resume, complete, archive, delete. |
| Journal | Prompts, categories, related habit, search, date and category filters, pin, edit, delete, text export, pattern insights. |
| Statistics | 7/30/90/all/custom ranges, per-habit filter, overview cards, daily, weekly, focus and mission charts, calendar heatmap, streak list, neutral period comparisons, trigger and time-of-day patterns, achievements and XP. |
| Settings | Dark / light / match device theme, reduced motion, week start, gamification toggle, reminders (off by default, quiet hours), JSON export/import with validation, recovery copy download, reset preferences, delete all data, install instructions. |

## Run it

```sh
cd breakfree
npm install
npm run dev        # http://localhost:5173
```

Requires Node 20.19 or newer.

## Test

```sh
npm run typecheck  # strict TypeScript
npm test           # Vitest: unit + integration tests (jsdom + Testing Library)
npm run build && npm run test:e2e   # Playwright browser checks against the production build
```

- **Unit tests** (`src/tests/logic.test.ts`, `src/tests/data.test.ts`) cover:
  - streaks, best streak, missing days, partial and setback days, and per-mode day status
  - DST and time-zone handling, and local dates
  - frequency and duration aggregation, goal progress clamping, mission recurrence
  - timestamp timers (pause, suspension, duplicate starts) and focus totals
  - pattern insights, milestone eligibility, XP caps and achievement deduplication
  - export/import round-trip and validation, migrations, corrupt and repaired storage, read-only newer data
  - duplicate check-in and mission completion prevention, cascade deletes, reminders
- **Integration tests** (`src/tests/app.test.tsx`) render the real app and cover:
  - onboarding (including a refresh mid-way, and skipping)
  - adding a habit from the library and a custom habit with validation, changing the mode
  - logging, editing and deleting events; check-ins and corrections; archive, restore and delete
  - completing missions, finishing a focus session on a fake clock, journal, goals
  - theme persistence, data persistence across reloads, import (valid and invalid), delete all, every route
- **Browser checks** (`e2e/run.mjs`) serve `dist/` under a sub-path like GitHub Pages and drive Chromium:
  - at iPhone size: onboarding, habits, check-ins, sessions, the dashboard, all navigation (no horizontal overflow), missions, and the reset timer across a reload
  - at 1366px desktop size: the sidebar, charts, the focus timer, journal, light theme after reload, offline mode, real export contents and delete all
  - on both: zero console errors and zero external requests. Screenshots are saved to `e2e/screenshots/`.

## Build and deploy

```sh
npm run build      # outputs dist/ — static files only
```

`vite.config.ts` uses a relative `base` and the app uses hash routing, so `dist/` works from any
sub-path without server rewrites. Deploy it to any static host (GitHub Pages, Netlify, Cloudflare Pages).
In this repo the GitHub Pages workflow type-checks, tests and builds BREAKFREE, then publishes it at `/breakfree/`.

## Architecture

```
src/
  app/          App shell (sidebar, bottom tabs, More sheet), routes, onboarding
  pages/        One file per screen (lazy-loaded except the dashboard)
  components/   ui (modal, confirm, toasts, fields…), habits (form, dialogs, card, calendar), charts, icons
  data/         Habit templates, categories/modes/triggers, activities, prompts, messages
  models/       TypeScript types for every entity
  services/     store (state + actions), storage, schema (migrations + validation), export/import, reminders, notifications
  utils/        dates, habit stats & streaks, missions/goals/timers, insights/achievements/XP
  hooks/        useData, useNow, useToday, useHabitViews, usePersistentTimer
  sw-template.js  Service worker; the build injects the exact precache list
```

- One store (`services/store.ts`) holds the data. Every change goes through an action, is saved immediately,
  and updates all screens via `useSyncExternalStore`. Calculations live in `utils/` and are shared, never duplicated per screen.
- Storage: `localStorage` key `breakfree:data`, versioned (`schemaVersion`). Migrations upgrade old data step by step.
  On load, unreadable data or invalid records are never silently destroyed. A raw recovery copy is kept and offered for download.
  Data from a newer app version is opened read-only rather than overwritten.
- Achievements are derived from records and stored once each. XP is computed from records with daily caps,
  so repeated clicks can't inflate it, and the unwanted behaviour itself never earns points.

### Day status and streak rules

- An explicit check-in is the user's own judgement and always wins.
- Otherwise, days with logged events are judged by mode:
  - quit: any occurrence means "not met"
  - reduce, limit time, quantity with a daily limit: within the limit is "met"
  - build an alternative: reaching the daily target is "met", some progress is "partly met"
- Days with no record are "no entry", never counted as failures.
- Observation habits have no success or failure at all.
- A streak counts consecutive "met" days. Partial, not-met and unrecorded days end it. Today not being recorded yet does not.
- Milestones, once reached, stay earned after a setback.
- Focus: only sessions where the timer reached zero count towards focus totals. "End session" keeps an *ended early* record (shown in history, not totalled). "Reset" discards it.

## Privacy

- All data stays in this browser on this device. There are no accounts, analytics, ads, trackers, or external requests.
- Fonts and icons are local and bundled.
- The service worker caches only app files, never your records.
- Browser storage is **not encrypted**. Anyone using the same device and browser profile may be able to read it.
- Clearing site data erases everything, so export backups regularly. Exported JSON files are readable plain text.

## Known limitations (by design or by platform)

- **Reminders** fire only while the app is open or running; there's no push server. Native notifications need explicit permission. On iPhone they require the app to be added to the Home Screen.
- **Website blocking** isn't possible for a web app. The Toolkit offers a commitment list, a distraction log, and pointers to Screen Time, Digital Wellbeing and Family Safety.
- **Phone usage** is never read automatically. Time is logged manually.
- **No sync** between devices. Use export and import instead.
- BREAKFREE is a self-tracking tool. It does not diagnose or treat anything, and shows cautions where stopping something abruptly can be unsafe.
