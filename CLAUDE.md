# FreeGaz: notes for Claude

A macOS Electron + React/TypeScript indoor-cycling trainer (ERG/SIM control, workout builder, FTP tests, FIT export, Strava, optional AI). It is a **public repo**: never commit secrets, personal ride data, or code copied from GPL/AGPL projects.

## Commands
- `npm run check`: tsc (core/node/web projects), eslint with import boundaries, vitest. Must be green before any commit.
- `npm run e2e`: builds, then runs the Playwright `_electron` specs in `tests/e2e`.
- `npm run dev`: the app; it rebuilds and restarts the main process when its code changes (`--watch`), so a `git pull` never leaves an old main process behind a new window. `npm run dev:web`: renderer only, in a browser, with simulated devices.
- `npm run dist` then `npm run selftest:packaged`: builds the DMG and verifies it boots. Playwright can't drive the packaged app, because the fuses disable `--inspect`.

## Architecture rules (enforced)
- `src/core` is pure TS: no DOM, Node, Electron, React or Dexie. `tsconfig.core.json` only knows ES2023 plus `src/core/host.d.ts`. Put anything testable here.
- `src/shared` holds the IPC contract (`ipc/contract.ts`, zod). Add every new channel to `ipc/channels.ts` too; a test enforces this.
- Renderer ↔ main traffic goes only through `window.freegaz.invoke/on`. Main validates every payload and checks the sender.
- Secrets live only in main (`safeStorage`). The renderer never sees API keys or OAuth tokens.
- The `app://freegaz` origin and `productName` must never change, or IndexedDB data is orphaned.

## Domain rules
- **Missing is not zero.** A sensor value past its TTL is `null` (FIT invalid), never 0. Averages and NP skip nulls.
- Records are one per second of *moving* time. Pauses and laps take effect on slot boundaries.
- Each ride snapshots FTP, weight and zones. Simulated or time-warped rides are flagged, and excluded from Strava, PMC and FTP auto-save.
- FTMS first; the Wahoo proprietary protocol is only a fallback. Never drive two control protocols at once. Keep one GATT operation in flight per device.
- AI never runs inside the ride tick. It gets only locally recorded data, never data pulled from Strava.
- Personas: body, weight and health are never joke material. The parodies target public rhetoric only, and each has its own banned-topic list with a test.
  - "Bibi": no religion, ethnicity, land claims, war, hostages or trial allegations.
  - "The Donald": no religion, race, immigration or borders, war or violence, elections or parties, courts or cases, women, age, health, looks, or other real people.
  - New photo heads: Ray approves the exact files first. Credits go in `src/renderer/src/coach/toon/heads/ATTRIBUTION.md`.

## Brand
- Follow `docs/BRAND.md`. Use theme tokens only (`bg-panel`, `text-ink-dim`, `bg-accent text-on-accent`…), never literal colours; brand constants (`stayer`, `sprinter`, `azure`) are for the logo and track lines, not UI states.
- Numbers and headings use `font-display` (Saira, condensed, tabular); small uppercase labels use `eyebrow`; everything else is Atkinson (`font-sans`, the default).
- Sentence case, no exclamation marks or emoji in the interface; the coaches have the personality.

## Conventions
- Match surrounding style: small modules, named exports, zod at trust boundaries, and no default exports except React entry points.
- Tests sit next to the code (`*.test.ts`); simulator scenarios go in `tests/sim`, E2E in `tests/e2e`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The full plan and research notes are at `~/.claude/plans/i-would-like-for-foamy-moth.md` (local only).
