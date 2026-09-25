# Routine Reminders

A phone app (installable web app) for building a daily routine. Each step gets
reminders before it's due — e.g. **Workout at 10:30** notifies you at 10:00,
10:10, 10:20 and 10:30. Both "how long before" and "how often" are adjustable
per step, and you can pick which days each step repeats.

No server, no account: everything is stored on your phone.

## Getting it on your phone

1. On GitHub, go to this repo's **Settings → Pages** and set **Source** to
   **GitHub Actions** (one-time).
2. Merge this folder into `main` (or run the *Deploy Routine Reminders app*
   workflow from the **Actions** tab). The app is then live at
   `https://<your-github-username>.github.io/<repo-name>/`.
3. Open that link on your phone:
   - **iPhone (iOS 16.4+):** Safari → Share → **Add to Home Screen**, then open
     it from the home screen. Notifications only work from the home-screen app.
   - **Android (Chrome):** menu → **Add to Home screen / Install app**.
4. Open the app, tap **Enable notifications**, and add your steps.
   Settings → **Send a test notification** checks it's working.

## About background notifications

A web app can only run its reminder timer while it's open or was recently in
the background — phones pause web apps after a while. So:

- Reminders are reliable while the app is open (or just switched away from).
- For reminders when the app is fully closed, use **Settings → Add to phone
  calendar**. It downloads a `.ics` file with each step as a repeating event
  carrying the same reminders, so your phone's calendar does the alerting.

## Running it on a computer

Serve the folder over HTTP (service workers don't run from `file://`):

```sh
cd routine-reminder-app
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page layout |
| `styles.css` | Styling (light & dark mode) |
| `app.js` | Routine storage, reminder scheduling, notifications, calendar export |
| `sw.js` | Service worker: offline cache and notification taps |
| `manifest.webmanifest`, `icon*` | Makes it installable to the home screen |
