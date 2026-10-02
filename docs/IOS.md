# The iPhone app

FreeGaz on the App Store is the phone web app inside a native iOS shell
([Capacitor](https://capacitorjs.com), MIT). It's the same code as the Mac
app's renderer, with one big difference from the web app: **it has native
Bluetooth** (CoreBluetooth, through `@capacitor-community/bluetooth-le`), so
an iPhone can drive a KICKR and read a heart-rate strap. No iPhone browser can.

| | Mac app | iPhone app | Web app (Pages) |
|---|---|---|---|
| Trainer and sensors | Web Bluetooth | **CoreBluetooth** | Android Chrome only |
| Rides, workouts, journeys, history | yes | yes | yes |
| FIT files | `~/Documents/FreeGaz/Rides` | Files → On My iPhone → FreeGaz → Rides | downloads |
| Strava, intervals.icu, AI | yes | not yet (keys need a safe store) | no |
| Ride moments (pictures) | yes | no (no window capture) | no |
| The Donald and Bibi | yes | hidden for now | yes |
| Demo mode (simulated trainer) | `FREEGAZ_SIM=1` | Devices → Try demo mode | Devices → Try demo mode |
| Devices | Mac | iPhone only (no iPad build yet) | any |

## How it fits together

- `capacitor.config.ts`: the app id (`io.github.raytfitzgerald.freegaz`), name, and the web build it wraps (`out/ios-web`).
- `src/renderer/src/platform/native.ts`: `isNative()` and the native helpers: saving files to the app's Documents folder (with the share sheet), opening links, and keeping the screen awake.
- `src/renderer/src/ble/native-bluetooth.ts`: the `BleTransport` on CoreBluetooth. `composition.ts` picks it when `isNative()`.
- `src/renderer/src/platform/web-shim.ts`: the browser bridge. In the iPhone app it saves files and opens links natively.
- `ios/`: the Xcode project, using Swift Package Manager (no CocoaPods). `ios/App/App/public` is the copied web build and is git-ignored.
- `scripts/make-icon.mjs` also writes the iOS icon (full bleed, no alpha). `scripts/ios-version.mjs` keeps the version in step with `package.json`.

## One-time setup (Ray)

1. **Install Xcode** from the Mac App Store, open it once, accept the licence, and install the iOS platform when it offers.
2. Run `sudo xcode-select -s /Applications/Xcode.app` so the command-line tools use it.
3. In **Xcode → Settings → Accounts**, sign in with the Apple ID on the developer account (team QD65LLT76Z). Xcode makes the iOS signing certificate and profiles itself, because the project uses automatic signing.

## Run it on your iPhone

```bash
npm run ios:sync
```

```bash
npm run ios:open
```

In Xcode, plug in the iPhone (or pick it over Wi-Fi), choose it as the run destination, and press ▶. The first time:
- iOS asks you to enable **Developer Mode**: Settings → Privacy & Security → Developer Mode.
- iOS asks you to trust the developer.
- FreeGaz asks for Bluetooth on the first Pair.

The iOS Simulator runs the app but has no Bluetooth. Use the trainer on a real phone.

No trainer nearby? Go to **Devices → Try demo mode**, or tap **Try demo mode** on the ride screen. A simulated trainer and heart-rate strap stand in, and those rides are marked simulated, so they never upload or count. Leave it from the same card.

## Ship a build to the App Store

1. In [App Store Connect](https://appstoreconnect.apple.com), go to **Apps → +** and create the app:
   - **Name:** FreeGaz
   - **Bundle ID:** `io.github.raytfitzgerald.freegaz`
   - **SKU:** `freegaz-ios`
   - **Primary language:** English (U.S.)
2. Build and upload:

```bash
npm run ios:release
```

   That rebuilds, syncs and bumps the build number. Then, in Xcode:
   - choose **Product → Archive**;
   - in the Organizer, click **Distribute App → App Store Connect → Upload**.
3. **TestFlight:** the build appears after processing (about 15 minutes). Install it on your phone with TestFlight and do a real ride before submitting.
4. Fill in the listing (below), choose the build, then **Submit for Review**.

### Screenshots

`docs/app-store/` holds five 1320 × 2868 PNGs, the 6.9" iPhone size Apple asks for: Home, the ride picker, Workouts, a workout on the Stelvio journey, and the big tiles. They were captured from the production web build in demo mode, at 440 × 956 points × 3. Drag them in under **iPhone 6.9" Display**. The app is iPhone-only, so no iPad screenshots are needed.

### Notes for the reviewer

Paste this into **App Review Information → Notes**:

> FreeGaz controls Bluetooth smart bike trainers (FTMS, e.g. Wahoo KICKR) and reads heart-rate straps. To try it without a trainer, open the Devices tab (More → Devices) and tap **Try demo mode**: a simulated trainer and heart-rate strap connect. Then tap **Ride → Workout**, pick any workout and tap **Ride it**. The workout plays, the coach rides alongside, and the journey map moves (turn on journeys in Settings → Journeys first). No account or sign-in is needed. Nothing leaves the device.

### Listing

- **Subtitle:** The trainer app with no subscription
- **Category:** Health & Fitness (secondary: Sports)
- **Promotional text:** ERG workouts, FTP tests, real routes and journeys around the world, with coaches who will absolutely roast you. Free. No account, no subscription.
- **Description:**
  > FreeGaz is a free indoor-cycling app for smart trainers. Pair your trainer and heart-rate strap over Bluetooth and ride:
  >
  > • ERG workouts that hold your watts, with a library of structured sessions and FTP tests that save your FTP
  > • Free rides in ERG, level or slope mode
  > • Journeys: ride from the Eiffel Tower, up the Stelvio, or across America, a few kilometres at a time, with a live map
  > • Real routes from your own GPX files
  > • Ten coaches, from calm to merciless, who ride beside you and say exactly what they think
  > • Every second recorded as a FIT file you own
  >
  > No account, no subscription, no ads. Your rides stay on your phone.
- **Keywords:** cycling,trainer,ERG,FTP,indoor,KICKR,workout,bike,smart trainer,zwift alternative
- **Support URL:** https://freegaz.app
- **Privacy policy URL:** required. A short page at https://freegaz.app/privacy (see the draft below).
- **Age rating:** 17+, for frequent or intense profanity and crude humour (the Unhinged coach setting and the rude workouts).
- **App Privacy:** "Data Not Collected". Everything stays on the device. Bug reports open a GitHub issue that the rider fills in and sends themselves.
- **Export compliance:** the app uses only standard HTTPS, already declared in Info.plist (`ITSAppUsesNonExemptEncryption = NO`).

### Privacy policy draft

> FreeGaz does not collect, store or share any personal data. Your rides, workouts, settings and profile are stored only on your device. FreeGaz has no accounts, no analytics and no ads. Bluetooth is used only to connect to your trainer and sensors. If you choose to report a bug, the app opens a GitHub issue in your browser, and nothing is sent unless you submit it yourself.

### Review risks to decide before submitting

- **The parody personas:** hidden in the iPhone build for now (`src/renderer/src/coach/available.ts`). The Donald and Bibi are caricatures of real politicians, built from real photos, and guidelines 1.1.1 and 5.2 make that a review risk. A rider whose saved coach is one of them, from an old setting or a restored Mac backup, gets the Drill Sergeant. The Mac and web apps keep both.
- **Profanity** is fine at 17+.
- **Minimum functionality (4.2):** native Bluetooth trainer control and local FIT files make this more than a wrapped website, which is the usual reason web-shell apps get rejected.
- **Bluetooth usage text** is set in Info.plist (`NSBluetoothAlwaysUsageDescription`). Review checks that it explains why.
