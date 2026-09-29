# FreeGaz

**A data-obsessed indoor cycling trainer for macOS.** Control your smart trainer in ERG or SIM mode, build ZWO workouts like on zwofactory.com, run a proper 20-minute FTP test that saves your FTP, and record every second locally as a FIT file. Optional AI coaches will roast you mid-interval if you ask them to.

> FreeGaz is a personal hobby project. It is **not affiliated with, endorsed by, or connected to** FulGaz, Zwift, TrainerRoad, Wahoo, Garmin, Strava or any other company whose products it can talk to. All product names are trademarks of their owners.

> **Status: under active construction.** The table below shows what already works. See [docs/ROADMAP.md](docs/ROADMAP.md).

| Milestone | What you get | State |
|---|---|---|
| M0 Foundations | App shell, secure Electron setup, CI, DMG packaging | ✅ |
| M1 Devices + Just Ride | KICKR (FTMS) + HR over Bluetooth, free ride in ERG/level/slope | ⏳ |
| M2 Recording + FIT | Crash-safe recording, local history, FIT export | ⏳ |
| M3 Workouts + builder | ZWO/ERG/MRC import/export, block + text builder, ERG workouts | ⏳ |
| M4 FTP | 20-min and ramp tests, auto-saved FTP, FTP history | ⏳ |
| M5 HUD | Full metric HUD, mini-HUD over Netflix, phone remote | ⏳ |
| M6 Routes | GPX routes in SIM mode: Reactive / Steady / Challenge | ⏳ |
| M7 Analysis | Ride detail, power curve, PMC (CTL/ATL/TSB) | ⏳ |
| M8 Integrations + personas | Strava upload, intervals.icu, coaching personas | ⏳ |
| M9 AI | Claude / OpenAI / Ollama: debriefs, workout generator, coach chat | ⏳ |
| M10 Long tail | Power pedals, PowerMatch, CORE, Headwind, packaging polish | ⏳ |

## Running it

Requirements: macOS on Apple Silicon, Node 24+ (Electron 44 bundles Node 24), Bluetooth.

```bash
npm install
npm run dev
```

`npm install` also downloads the Electron binary (`install-electron`).

| Command | What it does |
|---|---|
| `npm run dev` | Launch the app with hot reload |
| `npm run dev:web` | Run the UI alone in a browser with simulated devices (no Electron) |
| `npm run check` | Typecheck + lint (with architecture boundaries) + unit tests |
| `npm run e2e` | Build, then run the Playwright Electron end-to-end suite |
| `npm run dist` | Build `release/<version>/FreeGaz-<version>-arm64.dmg` |
| `npm run selftest:packaged` | Boot the packaged app and round-trip one IPC call |
| `npm run licenses` | Verify every shipped dependency is MIT-compatible |

### Installing the DMG

Release builds are ad-hoc signed and not notarized, so Gatekeeper will complain the first time. Either right-click **FreeGaz.app → Open**, or run:

```bash
xattr -dr com.apple.quarantine /Applications/FreeGaz.app
```

Tip: ad-hoc signatures change on every build, which makes macOS forget permission grants (Bluetooth, Automation). To keep them, create a self-signed "Code Signing" certificate named `FreeGaz Local` in Keychain Access and build with `CSC_NAME="FreeGaz Local" npm run dist`.

## Architecture in one breath

- `src/core`: pure TypeScript domain logic. BLE codecs and drivers, simulator, trainer control, workouts, ride recording, metrics, physics, FIT. There is no DOM, Node or Electron in here, and ESLint plus a dedicated tsconfig enforce that.
- `src/main`: the Electron main process. It owns windows, the Bluetooth device chooser, the crash-safe ride journal, files, secrets (macOS Keychain via `safeStorage`), Strava, AI and the phone remote.
- `src/preload`: a ~50-line bridge that exposes `window.freegaz` (typed `invoke` / `on`) for allowlisted channels only.
- `src/renderer`: the React UI and the ride engine. Web Bluetooth lives here.
- `src/shared`: the zod-validated IPC contract that everything above agrees on.

Security defaults: `contextIsolation`, `sandbox`, no `nodeIntegration`, a strict CSP, the `app://freegaz` origin, a sender check on every IPC call, and hardened Electron fuses.

## Privacy

Everything is local-first. Rides live on your Mac: IndexedDB for the app, plus FIT files in `~/Documents/FreeGaz`. Nothing leaves the machine unless you connect Strava or intervals.icu, or enable an AI provider. Ollama keeps AI fully local too. API keys and tokens are encrypted with the macOS Keychain and never reach the UI process.

## License

[MIT](LICENSE). Every shipped dependency is checked for MIT compatibility in CI. Garmin's FIT SDK is used only in the test suite as a reference decoder, because its license forbids redistribution.
