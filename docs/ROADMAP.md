# Roadmap

The build runs in milestones. Each one must pass `npm run check` and `npm run e2e` before it is committed.

## Milestones

- **M0 Foundations.** Scaffold, `app://` origin, secure window, typed IPC contract, import boundaries, CI (Linux + macOS), DMG packaging, packaged self-test.
- **M1 Devices + Just Ride.**
  - A Bluetooth transport with a serialized GATT queue, and a custom device chooser.
  - Drivers: FTMS trainer, Wahoo proprietary fallback, HR (including Garmin watch broadcast), plus the sensor hub.
  - A simulator, a free-ride screen, and BLE packet capture.
  - **Decision gate:** keep Web Bluetooth or add a noble transport.
- **M2 Recording + FIT.** The ride clock and state machine, the 1 Hz recorder, core metrics, the crash-safe journal and recovery, FIT export, and a ride list.
- **M3 Workouts + builder + ERG.**
  - Workouts: the model, ZWO/ERG/MRC/intervals.icu text I/O, and the player (skip, back, extend).
  - ERG protections, interval rescue and HR-ERG.
  - A built-in library, and the builder.
- **M4 FTP + profile.** Zones, the 20-minute and ramp tests, FTP auto-save with undo, FTP history, and eFTP.
- **M5 HUD, mini-HUD, remote.** The widget grid and layouts, keyboard shortcuts, an always-on-top mini-HUD, the phone remote, and fueling prompts.
- **M6 SIM + routes.** GPX import and smoothing, slope scaling, Reactive/Steady/Challenge modes, physics, the map and elevation profile, and a ghost rider.
- **M7 History + analysis.** Ride detail, the PMC, the power curve, PRs, FIT import, backup and restore, and achievements.
- **M8 Integrations, audio, personas.** Strava upload, intervals.icu, music controls, TTS, eight canned coaching personas plus the "Bibi" parody, and a custom persona builder.
- **M9 AI.** Claude, OpenAI and Ollama providers; quip packs, post-ride debriefs, plain-English workout generation, and coach chat.
- **M10 Long tail + packaging.** Power pedals with PowerMatch, CSC, CORE, KICKR Headwind, DFA-α1, the app icon, and releases.

## Backlog (researched, not scheduled)

- Your own route video synced to speed (GoPro GPS telemetry → playback rate = speed ÷ filmed speed)
- Virtual gearing on FTMS trainers (a gradient offset per virtual gear)
- Zwift Click / Bluetooth remotes (OpenBikeControl)
- Chase-bot intervals (a pacer bot instead of ERG)
- A morning HRV readiness check (2-minute RR recording against a baseline)
- A DFA-α1 aerobic threshold finder
- Heat-training mode with a CORE sensor
- Philips Hue zone lights, smart-plug fans
- Historical wind replay on routes
- Training plans and a calendar, pushed to a Garmin watch via intervals.icu
- ANT+ USB sticks (FE-C)
- FE-C over BLE for older Tacx trainers
