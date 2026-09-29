# FreeGaz

**A data-obsessed indoor cycling trainer for macOS.** It controls your smart trainer in ERG, level, slope or heart-rate mode, plays structured workouts and builds new ones the way zwofactory.com does. It runs a proper FTP test that saves your FTP, rides GPX routes FulGaz-style, and records every second locally as a FIT file. The optional coaches will roast you mid-interval if you ask them to.

> FreeGaz is a personal hobby project. It is **not affiliated with, endorsed by, or connected to** FulGaz, Zwift, TrainerRoad, Wahoo, Garmin or Strava, or any other company whose products it can talk to. All product names are trademarks of their owners. The "Bibi" coaching persona is a clearly labeled parody and is not affiliated with or endorsed by Benjamin Netanyahu.

| Milestone | What you get | State |
|---|---|---|
| M0 Foundations | App shell, secure Electron setup, CI, DMG packaging | ✅ |
| M1 Devices + Just Ride | KICKR (FTMS, Wahoo fallback) and HR over Bluetooth; free ride in ERG, level, slope or HR | ✅ |
| M2 Recording + FIT | Crash-safe recording (renderer crash or kill: ≤ 2 s lost), local history, FIT export | ✅ |
| M3 Workouts + builder | ZWO/MRC/ERG/intervals.icu import and export, a library of 28 workouts, the player, the builder | ✅ |
| M4 FTP | 20-minute, guided, 8-minute and ramp tests, auto-saved FTP with undo, FTP history | ✅ |
| M5 HUD | 40+ metrics in custom tile layouts, mini-HUD, phone remote, PR toasts, fueling | ✅ |
| M6 Routes | GPX/TCX in SIM mode: Reactive / Steady / Challenge (ghost) | ✅ |
| M7 Analysis | Ride detail, power curve, PMC, FIT import, backups, achievements and streaks | ✅ |
| M8 Integrations + personas | Strava, intervals.icu, music controls, 9 coaching personas with voice | ✅ |
| M9 AI | Claude / OpenAI / Ollama: debriefs, coach chat, workout generator, fresh coach lines | ✅ |
| M10 Long tail | Power pedals with PowerMatch, CORE, Moxy, KICKR Headwind, live DFA-α1, app icon | ✅ |

The code is tested thoroughly, against simulated devices (see [What has been verified](#what-has-been-verified)). A few things need your actual hardware before they can be called done; they're listed in that section.

## What it does

**Riding**
- **Just ride.** ERG (the trainer holds the watts), Level (fixed resistance), Slope (a virtual gradient) or HR (the trainer adjusts watts to hold your heart rate). Switch any time with `M`.
- **ERG manners.**
  - A 10-second soft start.
  - A "spiral of death" guard: resistance is released when your cadence collapses.
  - One command per second with deadbands, and targets sent a second early to hide trainer lag.
  - Everything is re-applied after a reconnect.
- **Workouts.**
  - Skip, go back or repeat an interval, and extend one by 30 s.
  - Change the intensity in 1 % steps.
  - Ride any workout in Level or Slope mode instead of ERG.
  - Text cues appear as the workout reaches them, and every interval becomes a lap.
- **Interval rescue.** When a hard interval is failing, it offers 5 % easier or a 30-second breather instead of letting you bail.
- **FTP tests.**
  - **20-minute** (Allen & Coggan). During the effort ERG turns off: the trainer switches to a flat road and a pacing band and projected FTP guide you.
  - **Guided 20-minute**, with the blowout in ERG.
  - **8-minute.**
  - **Ramp.** It ends itself when you can't turn the pedals any more.
  - **Saving the result:** a valid, plausible result is saved automatically, with one-click undo. A drop of more than 3 %, a jump of more than 15 %, or a test with problems asks first. Simulated rides never change your FTP.
- **Routes.** Import GPX or TCX, and the trainer follows the elevation in three modes:
  - **Reactive:** your power drives the speed, through real physics.
  - **Steady:** the recorded pace.
  - **Challenge:** race a ghost of a previous ride.
- **Uphill/downhill scaling** (default 100 % / 50 %, with a 20 % limit) changes only how a climb feels. Speed always uses the true grade.

**Seeing everything**
- **HUD tiles.** Over 40 metrics in tiles you arrange and save per view, with presets:
  - **Power:** 3/10/30 s and interval averages, NP, IF, TSS, W/kg, % FTP, zone.
  - **W′ balance** and **L/R balance.**
  - **Heart rate:** HR zones, % max and % LTHR, decoupling, RMSSD and DFA-α1.
  - **Cadence** against its target band.
  - **Also:** kJ and carbs, time, speed, grade and what was sent to the trainer.
- **Mini-HUD.** An always-on-top panel you can float over Netflix.
- **Phone remote.** Off by default. When on, you scan a QR code; access needs a token and origin checks.
- **Alerts.** Personal-best toasts, and drink and eat reminders.
- **Music.** Spotify or Apple Music controls: `N` next, `Shift+N` previous, `P` play/pause.
- **Light or dark.** Pick in **Settings → Appearance**, or follow macOS. Charts and zone colours have their own validated steps for each theme; the mini-HUD stays dark so it reads over video.

**Building workouts**
- **A builder like zwofactory.com**, with blocks you can grab:
  - drag a block's edge to change its duration, or its top to change its power;
  - drag a block to reorder it;
  - an inspector for every field;
  - undo and redo;
  - live TSS, IF and zone totals at your FTP.
- **Text mode** uses intervals.icu syntax (`- 10m ramp 40-75%`, `4x`, `- 8m 95-100% 95rpm`), synced both ways with the blocks.
- **Import and export:**
  - `.zwo`, `.mrc`, `.erg` and intervals.icu text;
  - **Export to Zwift** drops the file straight into Zwift's Custom Workouts.
- **Optional AI.** "45 minutes of over-unders, finish with sprints" becomes a workout you can edit.

**Coaching**
- **Nine personas:** Drill Sergeant, Roast Comic, Disappointed Dad, The Overlord, Hype Coach, Data Nerd, Zen, Professional, and **Bibi**, a labeled parody of Netanyahu's podium style ("I have drawn a red line at 280 watts").
- **Spice** from 1 (professional) to 5 (unhinged). Profanity is a separate switch.
- **Voice.** Lines are spoken with a macOS voice, and the music is lowered while the coach talks.
- **Guardrails.** Your body, weight and health are never joke material. If your heart rate looks wrong, or you stop suddenly in a hard effort, every persona turns supportive.

**Your history**
- **Ride detail:** power, cadence, HR, speed and W′ balance charts, laps, time in zones, RPE and notes, and an AI debrief.
- **Fitness:** the PMC (fitness, fatigue, form), weekly load, the power curve against your 90-day best, and FTP history.
- **Achievements and streaks.** The home dashboard shows your FTP with a retest nudge, form, this week and your latest ride.
- **FIT files:**
  - every ride is saved as a FIT file in `~/Documents/FreeGaz/Rides`;
  - import old Garmin or Wahoo FIT files so your fitness charts are complete;
  - rebuild your history from the FIT folder.
- **Backups:** back up and restore everything as a zip.

## Install

Requirements: a Mac with Apple Silicon and Bluetooth.

**From a release:** download `FreeGaz-<version>-arm64.dmg` from [Releases](https://github.com/raytfitzgerald/FreeGaz/releases) and drag FreeGaz to Applications. The builds are ad-hoc signed, not notarized, so macOS will refuse the first launch. Either right-click **FreeGaz.app → Open**, or run:

```bash
xattr -dr com.apple.quarantine /Applications/FreeGaz.app
```

**From source** (Node 24+):

```bash
npm install
npm run dev
```

## First ride

1. **Free your trainer.** A KICKR accepts several Bluetooth connections but only one controller. Quit Zwift and the Wahoo app, and unpair any head unit that controls it. If something else grabs control, FreeGaz says so.
2. **Heart rate from a Garmin watch.** Turn on heart-rate broadcast: on most models it's **Settings → Health & Wellness (or Wrist Heart Rate) → Broadcast Heart Rate**. A chest strap needs no setup.
3. **Connect.** Open **Devices**, then **Connect trainer** and **Connect heart rate**, and pick each from the list. macOS asks for Bluetooth permission the first time. FreeGaz remembers your devices and reconnects them at launch.
4. **Tell it about you.** In **Settings → Athlete & FTP**, enter your weight and your FTP if you know it. If you don't, open **Workouts → FTP tests** and take the ramp test (about 20 minutes).
5. **Ride.** Use **Just ride**, or pick a workout and press **Ride it**. Press **Finish** when you're done; the ride is saved, and so is its FIT file.

### Keyboard

| Key | During a ride |
|---|---|
| `Space` | Pause / resume |
| `L` | Lap |
| `↑` / `↓` | Intensity ±1 % (`Shift`: ±5 %); in Level or Slope, harder or easier |
| `Tab` | Skip to the next interval |
| `B` | Back: restart this interval (twice for the previous one) |
| `E` | Extend this interval by 30 s |
| `M` | Cycle trainer mode |
| `C` | Mute the coach |
| `N` / `Shift+N` / `P` | Next / previous track, play / pause music |

## Connecting services (all optional)

**Strava.** Strava only lets each user connect their own API app, and since June 2026 creating one needs a **Strava subscription**.
1. Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an app. Set **Authorization Callback Domain** to `127.0.0.1`.
2. In FreeGaz, open **Settings → Strava & sync**. Paste the app's Client ID and Client Secret, press **Connect**, and approve in your browser.
3. Turn on auto-upload if you like. Rides go up as Virtual Rides and are marked as trainer rides.

FreeGaz only uploads. It never reads your Strava data. Without a subscription, use **Strava upload** on any ride: it opens Strava's upload page and shows you the FIT file to drag in.

**intervals.icu.** Paste your API key and athlete ID (from intervals.icu → Settings → Developer) in **Settings → Strava & sync**.

**Garmin Connect.** Drag a ride's FIT file into Garmin Connect's import page. There is no automatic upload.

**AI.** Open **Settings → AI** and pick one provider:
- **Claude:** an API key from [console.anthropic.com](https://console.anthropic.com). The default model is Claude Opus 5.5.
- **OpenAI:** an API key.
- **Ollama:** runs on your Mac with no key. Install it from [ollama.com](https://ollama.com) and pull a model.

Keys are encrypted with your macOS Keychain and never reach the app's UI process. The AI only ever sees rides recorded on this Mac, never anything from Strava.

## Your data

Everything stays on this Mac. Rides live in the app's database, plus a FIT file per ride in `~/Documents/FreeGaz/Rides`; you can change that folder, for example to one in iCloud Drive for free sync. **Settings → Data & backup** saves or restores a full backup zip, or scans the FIT folder to rebuild your history on a new Mac. Nothing leaves the machine unless you connect Strava or intervals.icu, or turn on an AI provider.

## What has been verified

**Automated**, on every push, on Linux and macOS:
- **Tests:** over 1,500 unit and simulator tests, plus 20 Playwright end-to-end tests (devices, workouts, FTP test, builder, routes, crash recovery, appearance), run against simulated devices that speak real Bluetooth bytes.
- **Devices:**
  - codecs are checked against the specs;
  - ERG settles within ±5 W in under 5 s;
  - a forced disconnect re-acquires control within 3 s;
  - another app stealing control is detected.
- **Rides:**
  - a 3-hour ride records every second exactly;
  - FIT files pass Garmin's own decoder;
  - a renderer crash or a killed app loses at most 2 s of ride.
- **Workouts and tests:**
  - a 60-minute workout gets one lap per interval and NP within 1 W of the plan;
  - the 20-minute test and a ramp test to failure give the right FTP;
  - PowerMatch converges within 2 % in 30 s.

**Needs your hardware** (please try these and report back):
- **Devices:**
  - Pairing your KICKR and heart-rate strap, and the Garmin watch broadcast.
  - Reconnecting automatically at launch. This decides whether FreeGaz keeps Web Bluetooth or moves to a native Bluetooth stack.
- **Riding:**
  - How ERG steps and 30/30s feel, and how SIM climbs feel.
  - Power-cycling the KICKR mid-ride, and walking away from the strap.
  - A 2-hour ride with Netflix fullscreen and the mini-HUD.
- **Accounts and macOS:**
  - Strava OAuth with your own app. The app never enters credentials for you.
  - The macOS permission prompts (Bluetooth, Automation for music) on the installed DMG.
- **Gear you don't own yet:** power pedals, CORE, Moxy and the Headwind are tested only against simulators and captured byte formats.

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Launch the app with hot reload |
| `npm run dev:web` | Run the UI alone in a browser with simulated devices (no Electron) |
| `npm run check` | Typecheck + lint (with architecture boundaries) + unit and simulator tests |
| `npm run e2e` | Build, then run the Playwright Electron end-to-end suite |
| `npm run dist` | Build `release/<version>/FreeGaz-<version>-arm64.dmg` |
| `npm run selftest:packaged` | Boot the packaged app and round-trip one IPC call |
| `npm run licenses` | Verify every shipped dependency is MIT-compatible |
| `npm run icon` | Re-render the app icon |

To try everything without hardware, `FREEGAZ_SIM=1 npm run dev` runs the app against a simulated KICKR and HR strap that speak real Bluetooth bytes. Add `FREEGAZ_WARP=10` to speed up time ten-fold; simulated and time-warped rides are always flagged, and never count towards Strava, fitness or FTP.

Ad-hoc signatures change on every build, so macOS forgets permission grants such as Bluetooth and Automation. To keep them, create a self-signed "Code Signing" certificate named `FreeGaz Local` in Keychain Access and build with `CSC_NAME="FreeGaz Local" npm run dist`.

### Architecture in one breath

- `src/core`: pure TypeScript domain logic, with no DOM, Node or Electron; ESLint and a dedicated tsconfig enforce that. It holds:
  - BLE codecs and drivers, the simulator, trainer control and PowerMatch;
  - workouts, routes, ride recording, metrics, physics and FIT;
  - the coaching engine.
- `src/main`: the Electron main process. It owns:
  - windows and the Bluetooth device chooser;
  - the crash-safe ride journal and files;
  - secrets (macOS Keychain via `safeStorage`);
  - Strava and intervals.icu, AI, music, and the phone remote.
- `src/preload`: a small bridge that exposes `window.freegaz` (typed `invoke` / `on`) for allowlisted channels only.
- `src/renderer`: the React UI and the ride engine. Web Bluetooth lives here.
- `src/shared`: the zod-validated IPC contract that everything above agrees on.

Security defaults:
- `contextIsolation`, `sandbox`, and no `nodeIntegration`;
- a strict CSP and the `app://freegaz` origin;
- a sender check on every IPC call;
- hardened Electron fuses.

## License

[MIT](LICENSE). CI checks every shipped dependency for MIT compatibility. Garmin's FIT SDK is used only in the test suite, as a reference decoder, because its license forbids redistribution. The built-in workouts and every coaching line are original.
