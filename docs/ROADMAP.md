# Roadmap

The build ran in milestones. Each one had to pass `npm run check` and `npm run e2e` before it was committed.

## Done

- **M0 Foundations.**
  - Scaffold, the `app://` origin, a secure window and a typed IPC contract with import boundaries.
  - CI on Linux and macOS (including a secret scan and a license check).
  - DMG packaging, with a packaged self-test.
- **M1 Devices + Just Ride.**
  - A Bluetooth transport with a serialized GATT queue, and a custom device chooser with remembered devices.
  - Drivers: FTMS first, with a Wahoo proprietary fallback. HR works from a strap or a Garmin watch broadcast; power pedals, CSC, CORE, Moxy and KICKR Headwind are also covered.
  - A sensor hub with source failover, and a simulator that speaks real GATT bytes.
  - Recovery: "another app has control" detection with slow retries, and reconnects that re-apply the target.
- **M2 Recording + FIT.**
  - A 1 Hz recorder on moving time, auto-pause, and live metrics.
  - A crash-safe journal: a renderer crash or a killed app loses at most 2 s.
  - FIT export, validated by Garmin's decoder, and the ride list.
- **M3 Workouts + builder + ERG.**
  - The model, ZWO/ERG/MRC/intervals.icu text I/O, and 28 original built-ins.
  - The player: skip, back/repeat, extend, level or slope riding, text cues, a lap per interval, and interval rescue.
  - The library, Export to Zwift, and the builder with text mode.
- **M4 FTP.**
  - The 20-minute, guided, 8-minute and ramp tests.
  - Auto-save with validity checks and undo, FTP history, and eFTP retest nudges.
- **M5 HUD.** Over 40 metrics in custom tile layouts with presets, a mini-HUD, a phone remote, PR toasts, and fueling and drink reminders.
- **M6 Routes.** GPX/TCX import and smoothing, slope scaling, Reactive/Steady/Challenge, physics, the elevation strip and a ghost rider.
- **M7 Analysis.**
  - Ride detail, PMC, the power curve and bests.
  - FIT import, backup and restore, and rebuild from the FIT folder.
  - Achievements, streaks, and the home dashboard.
- **M8 Integrations + personas.**
  - Strava (loopback OAuth, upload outbox) and intervals.icu.
  - Spotify / Music controls.
  - Nine coaching personas with voice, spice and guardrails.
- **M9 AI.** Claude, OpenAI and Ollama; debriefs, coach chat, the workout generator, and fresh coach lines.
- **M10 Long tail.** PowerMatch, Headwind fan control, live RMSSD and DFA-α1, the app icon, and a light theme.

## Next: needs a real KICKR and HR strap

- **Decision gate.** Does Web Bluetooth reconnect remembered devices reliably at launch on your Mac? If not, add a native Bluetooth transport (`@stoprocent/noble` in a utility process) behind the same interface.
- **Feel tuning.** ERG step response and soft start on your KICKR, SIM feel, spiral-guard thresholds.
- **Soak test.** A 2-hour ride with fullscreen video and the mini-HUD. Watch for renderer throttling and reconnects.
- **First run of the DMG.** The permission prompts (Bluetooth, Automation), and Strava OAuth with your own API app.

## Planned

- Ride resume after a crash (continue the same ride instead of recovering it).
- A custom persona builder (your own lines, voice and banned topics, exported as JSON).
- Garmin FIT workout export, so builder workouts can go onto a Garmin device.
- The Kolie Moore FTP protocol.
- AI ride titles for Strava (rename after upload).

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
