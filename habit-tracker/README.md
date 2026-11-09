# Habit Tracker

A simple, dark-themed habit tracker that runs in your web browser and works offline.
You can install it on your phone or computer like a normal app.

## What it does

- Add habits, each with its own emoji and colour.
- Tap the big round button to tick a habit off for today (tap again to undo).
- See your current streak (days in a row) and your best streak.
- A 7-day grid on each habit shows the last week. Tap any day to fix a missed tick.
- Tap the pencil to rename a habit, change its emoji or colour, or delete it.
- Everything is saved on your own device (in the browser's storage). Nothing is sent anywhere.

A streak keeps going until the end of the day, so if you haven't ticked today yet,
yesterday's streak still shows.

## How to start it

Double-click **start.bat**.

- If you have Node.js installed, a small window opens and runs a local web server, and your
  browser opens at http://localhost:8642. Keep that small window open while you use the app;
  close it when you're done.
- If you don't have Node.js, the app opens straight from the file. Everything works, but
  installing and offline mode need the web server (browsers only allow them over http).

## Installing it as an app

With the app open at http://localhost:8642 in Chrome or Edge, click the install icon in the
address bar (or the menu, then "Install Habit Tracker"). On a phone, put the folder on any web
host (for example GitHub Pages) and use "Add to Home Screen".

Once it has loaded once, it works offline.

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `styles.css` | The look (dark theme, mobile first) |
| `app.js` | All the app logic |
| `manifest.webmanifest` | Lets the browser install it as an app |
| `sw.js` | Service worker that stores the app for offline use |
| `icon.svg`, `icon-192.png`, `icon-512.png` | App icons |
| `serve.js` | Tiny local web server used by start.bat |
| `tests/` | Checks you can run without a browser |
| `tools/make-icons.js` | Redraws the PNG icons |

## Running the checks

In a terminal in this folder:

```
node tests/test-app.js
node tests/test-ui.js
```

or `npm test`. The first checks the habit logic (streaks, dates, saving and loading), the
second runs the real interface code against a pretend page.

## Your data

Habits are kept in your browser's local storage for this site. Clearing your browser data
removes them, and each browser keeps its own copy. Opening the file directly and opening
http://localhost:8642 also count as two different sites, so stick to one (start.bat picks
the localhost one when Node.js is installed).
