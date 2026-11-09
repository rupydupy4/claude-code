# Family Chores: App Store and Google Play listing

Everything you need to fill in the store forms, plus the steps that have to be done by hand.

## Basics

| Field | Value |
|---|---|
| App name | Family Chores |
| Bundle ID / application ID | `com.rupydupy4.familychores` |
| Version | 1.0.0 (build / versionCode 1) |
| Subtitle (Apple, max 30) | Chores, rewards and streaks |
| Short description (Google, max 80) | Chores, photo proof and rewards for the whole family, on one shared device. |
| Primary category | Apple: Lifestyle (secondary: Productivity). Google: Parenting |
| Price | Free, no in-app purchases, no adverts |
| Privacy policy URL | https://rupydupy4.github.io/claude-code/family-chores/#/privacy |
| Support / marketing URL | https://github.com/rupydupy4/claude-code (consider adding a support email) |
| Copyright | 2026 rupydupy4 |

**Keywords (Apple, max 100 characters):**
`chores,chore chart,kids,family,rewards,pocket money,allowance,routine,tasks,parents,streak,jobs`

## Full description

> Family Chores turns the family chore chart into something children actually enjoy, on one shared
> phone or tablet. No accounts, no sign-ups and no tracking: everything stays on your device.
>
> **For parents**
> - Create chores in seconds and assign them to each child.
> - Make them repeat every day, or on chosen days of the week. When you approve one, the next is
>   scheduled automatically.
> - Set a reward: pocket money, screen time or something of your own, like "Pick Friday's film".
> - Check a child's photo and note, then approve it or send it back with a comment.
> - See what's waiting for approval first, each child's progress this week, and the rewards you
>   still owe, with a simple "mark as paid out".
> - Your parent area is protected by a PIN.
>
> **For children**
> - Tap your name, see what's due today, this week and later.
> - Hand a chore in with a photo and a note.
> - Earn points, level up and keep your daily streak going.
>
> **Private by design**
> - Works completely offline. No account, no servers, no adverts, no analytics.
> - Photos never leave the device.
> - Save a backup file whenever you like, restore it on a new phone, or delete everything in one tap.
> - Light and dark themes follow your phone's setting.
>
> Rewards are records only: the app never moves money or controls screen time.

## Age rating notes

- **Apple age rating questionnaire:** answer "None" to every content question (violence, profanity,
  mature themes, gambling, horror, medical, alcohol/drugs, sexual content). Unrestricted web access:
  **No**. User-generated content shared with others: **No** (photos stay on the device). Result: **4+**.
- **Made for Kids (Apple):** don't opt in. The app is used *by* families but set up and controlled by
  a parent, and opting in adds Kids Category rules. If you choose to opt in later, the app already
  meets them (no ads, no analytics, no third-party SDKs, the only external link is behind the parent's
  privacy page).
- **Google Play content rating (IARC):** category "Reference, News, or Educational" → not applicable
  for everything; no user interaction/sharing, no location, no purchases. Expected: **PEGI 3 / Everyone**.
- **Google Play target audience:** choosing adult age groups only (the parent installs and runs it)
  is the simplest path. If you include children under 13 in the target audience the
  app must follow the Families policy; it already does (no ads, no data collection).
- **Data safety (Google) / App Privacy (Apple):** "No data collected", "No data shared", no tracking.
  Data is encrypted in transit: not applicable (nothing is transmitted). Users can request deletion:
  yes, in-app (Settings → Delete all data).

## Screenshot checklist

Take them from the app with the demo household (The Smith Family, parent PIN 1234), in light mode,
plus one in dark mode. `npm run build && npm run test:e2e` saves phone-sized screenshots in
`e2e/screenshots/` as a starting point.

- [ ] Child home: progress card (level, points, streak) and Today / This week / Later
- [ ] Hand-in screen with a photo
- [ ] Parent dashboard: waiting for approval, this week, rewards to hand over
- [ ] Review screen with photo proof and Approve / Needs changes
- [ ] Chore editor showing Repeat → Weekly with days and Points
- [ ] Rewards with "Mark as paid out"
- [ ] Dark mode screen
- Apple sizes: 6.9" iPhone (1320 × 2868) is required; 13" iPad (2064 × 2752) if you keep iPad support.
- Google: at least 2 phone screenshots (1080 × 1920 or larger), a 512 × 512 icon
  (`assets/icon-only.png` scaled down) and a 1024 × 500 feature graphic.

## What still has to be done by hand

### iPhone / iPad (App Store)
1. Join the **Apple Developer Program** (99 USD a year) at https://developer.apple.com/programs/.
2. Get a **Mac with Xcode** (current version). Copy or clone this folder onto it and run
   `npm install`, then `npm run cap:sync`.
3. Open `ios/App/App.xcodeproj` in Xcode. Under *Signing & Capabilities* choose your team; the
   bundle ID is already `com.rupydupy4.familychores`.
4. Run it on a real iPhone once and check: camera, photo library, backup sharing, notch and home bar.
5. In **App Store Connect** create the app with the same bundle ID, fill in this listing, the age
   rating, App Privacy ("Data not collected") and the privacy policy URL.
6. In Xcode: *Product → Archive → Distribute App → App Store Connect*. Then add the build to the
   version, optionally test with TestFlight, and *Submit for Review*.

### Android (Google Play)
1. Create a **Google Play Console** developer account (one-off 25 USD) at https://play.google.com/console.
   New personal accounts must run a closed test with at least 12 testers for 14 days before production.
2. Install **Android Studio** (it includes the Android SDK and Java). Then here run `npm run cap:sync`
   and open the `android` folder in Android Studio.
3. Test on a phone or emulator (Run ▶), including the back button, camera and backup sharing.
   `npm run android:debug` builds a debug APK once the SDK is installed.
4. *Build → Generate Signed App Bundle or APK → Android App Bundle*, create a new upload keystore
   and **keep the keystore file and passwords safe and private** (don't put them in Git). This gives
   `android/app/release/app-release.aab`.
5. In Play Console create the app, complete *App content* (privacy policy URL, ads: none, data
   safety, content rating, target audience), upload the AAB to a testing track, then production.
6. Use Play App Signing (the default).

### Every update
Increase `versionCode` and `versionName` in `android/app/build.gradle` and the version/build in Xcode,
then `npm run cap:sync` before building.
