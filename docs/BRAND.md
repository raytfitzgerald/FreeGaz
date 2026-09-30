# FreeGaz brand guidelines

FreeGaz looks like a velodrome.
- **The boards:** pale boards in daylight, midnight blue under the lights.
- **The lines:** four painted lines round the track.
- **The numbers:** big, square numbers, like a timing board.

Everything here is in the code: the theme tokens in [`src/renderer/src/styles.css`](../src/renderer/src/styles.css), the brand constants and the wordmark in [`src/shared/brand.ts`](../src/shared/brand.ts), and the logo files in [`docs/brand/`](brand/). Change a value in both places at once.

## Principles

1. **Numbers first.** The ride screen is the product, and the numbers are the hero. Nothing decorative competes with a power figure.
2. **The track is the brand.** Blue, the four lanes, and a banked oval. Leave out gradients, glows, glass and neon.
3. **Straight talk; the jokes are the coaches'.** The app says plainly what's happening. The personas are allowed to be rude. The interface isn't.

## Logo

**The wordmark** is "FreeGaz" in Saira ExtraBold Italic at 72 % width, outlined, over the **track lines**. These are the velodrome's four markings, top to bottom:

| Line | Colour | On the track |
|---|---|---|
| Stayers' line | Stayer Blue `#1e59cd` | the blue line high on the banking |
| Sprinters' line | Sprinter Red `#e0383b` | the red line |
| Measurement line | the wordmark's ink | the black line, 20 cm up, where the lap is measured |
| Côte d'Azur | Côte d'Azur `#77c3ff` | the pale blue band at the bottom of the track |

The stripes lean 12° to match the italics.

**Files** in `docs/brand/`:
- `freegaz-wordmark.svg`: navy, for light grounds.
- `freegaz-wordmark-night.svg`: chalk, for dark grounds.
- `freegaz-wordmark-white.svg`: all white, on Stayer Blue or a photo.
- `freegaz-icon.svg`: the app icon.
- `freegaz-mark.svg`: the track alone.

In the app, use the `Wordmark` and `TrackLines` components (`src/renderer/src/brand/Wordmark.tsx`). Their letters and measurement line follow the text colour.

**The icon** is the velodrome from above, on a Stayer Blue tile:
- white boards, with the lanes in order from the inside out: côte d'azur, measurement, sprinters', stayers';
- a darker blue infield;
- one rider on the far bend.

`npm run icon` (`scripts/make-icon.mjs`) draws it.

**Use:**
- Keep clear space equal to the height of the wordmark's "e" on every side.
- The smallest wordmark is 88 px wide (the sidebar uses 36 px of height); the smallest icon is 16 px.
- Don't recolour, stretch, outline, shadow or animate the wordmark.
- Don't set "FreeGaz" in another typeface as a logo, and don't put the track lines under other words.

## Colour

### Brand constants

These are the same in both themes. The logo, the track lines, the icon and the brand's own moments use them. **UI states never do.**

| Name | Hex | Role |
|---|---|---|
| Stayer Blue | `#1e59cd` | The brand colour. The icon tile, the stayers' line, and the accent by day. |
| Côte d'Azur | `#77c3ff` | Its light partner. The track band, and the accent at night. |
| Sprinter Red | `#e0383b` | The sprinters' line only. Never an error, never a button. |
| Night | `#111d36` | The night theme's ground. The ink on Côte d'Azur. |
| Board | `#ebf1f7` | The light theme's ground. |

### Theme tokens

There are two themes: **Night** (the default) and **Track day** (light). Every text token holds at least 4.5:1 against `bg`, `panel`, `panel-2` and `panel-3` in its theme.

| Token | Night | Track day | Use |
|---|---|---|---|
| `bg` | `#111d36` | `#ebf1f7` | The page. |
| `panel` | `#182740` | `#fcfeff` | Cards, the sidebar, tiles. |
| `panel-2` | `#1f2f49` | `#f2f6fb` | Inputs, secondary buttons, hovers. |
| `panel-3` | `#293a54` | `#e3eaf2` | The selected item, a pressed hover. |
| `line` | `#32425a` | `#d8e1e9` | Borders between surfaces. |
| `line-strong` | `#4c5d75` | `#aeb9c5` | Input borders, axes. |
| `ink` | `#eff4fa` | `#13213c` | Text and numbers. |
| `ink-dim` | `#bdccde` | `#44536c` | Secondary text, units. |
| `ink-faint` | `#9aadc4` | `#5a6a80` | Labels, hints, captions (lowest pair 5.0:1 at night, 4.55:1 by day). |
| `accent` | `#77c3ff` | `#1e59cd` | Anything you can press or that is selected; links; the focus ring. |
| `accent-dim` | `#4790d8` | `#1543a8` | The pressed primary button. |
| `on-accent` | `#111d36` | `#fcfeff` | Text on an `accent` fill (8.8:1 and 6.2:1). |
| `good` | `#6add88` | `#067132` | Success, a completed interval. |
| `warn` | `#fdc357` | `#9e5200` | Caution: a stale sensor, an unfinished ride. |
| `bad` | `#ff8a88` | `#be222a` | Errors and destructive actions. |
| `scrim` | 64 % night | 50 % navy | Behind a dialog. |
| `parody` / `on-parody` | `#fbbf24` / `#111d36` | same | The PARODY label only (10:1). |

**Rules:**
- **The accent means "you can act here".** Never use it for decoration or emphasis in running text.
- **Status colours always come with an icon and a word.** Green and red are never the only difference.
- **Text wears text tokens.** A value, label or legend is `ink`, `ink-dim` or `ink-faint`, never a series or zone colour. The colour goes on a mark beside it, like the short tick before a HUD label.
- **The mini-HUD always uses Night,** whatever the app's theme, because it floats over video.

### Data colours

Each theme has its own steps, checked with the dataviz validator: colour-blind separation, normal-vision separation, and contrast against both chart panels.

- **Power zones (Coggan Z1–Z7):** grey, blue, green, yellow, orange, red, purple.
  - Night: `#7f8a99 #2997fe #37b858 #ead33f #e88826 #f23c4f #a26ad5`.
  - Track day: `#848d98 #1f6fca #399d57 #cbae31 #bb7234 #c01323 #8652b9`.
  - Z1 is neutral by design. Z4 is a bright true yellow, so colour-blind riders can tell it from Z5.
  - Zones are always labelled and drawn at their height.
- **Series (power, HR, cadence, speed, W′bal):**
  - Night: `#cf8020 #dc374f #348dd7 #2f9e71 #8c69c5`.
  - Track day: `#c3760a #c23246 #1274bd #0c8a5e #7347af`.
  - One metric per chart.
- **Route grade:** a single-hue ramp in six classes, always with a legend and the grade as a number. Steeper is brighter at night and darker by day.

## Typography

| Face | Use | Setting |
|---|---|---|
| **Saira** (variable) | Headings, labels, and every number on the HUD | Width 80 % (`font-display`), tabular figures on. Weights 600–700; 800 italic is reserved for the wordmark. |
| **Atkinson Hyperlegible Next** (variable) | Everything you read: settings, hints, notes, coach lines | 400 body, 600 buttons, 700 emphasis. |
| System mono | Workout text mode, file paths | `font-mono`. |

Why these two:
- **Saira's square counters read like race numbers.** They stay legible from a label up to 6 rem on the ride screen.
- **Atkinson Hyperlegible was drawn for low vision.** Its letters stay distinct (Il1, O0, rn/m) when you're reading at 180 bpm.

Both are under the SIL Open Font License 1.1. They're bundled, so the app looks the same offline, and they're credited in Settings → About.

**Scale:**

| Role | Face | Size | Notes |
|---|---|---|---|
| HUD hero | Saira 600 | 4.5–6 rem (`text-7xl`, `text-8xl`) | Tabular; the unit in `ink-dim` at about a third of the size. |
| HUD value | Saira 600 | 1.875–3.75 rem | Tabular. |
| Page title | Saira 600–700 | 1.5 rem; 1.875 rem on Home | `font-display text-2xl font-semibold`. |
| Section title | Saira 600 | 1.125 rem | `font-display text-lg font-semibold`. |
| Label | Saira 600 | 0.6875 rem | The `eyebrow` utility: 88 % width, uppercase, +0.09em tracking. |
| Body | Atkinson 400 | 0.875 rem | Line height 1.5. |
| Small / caption | Atkinson 400 | 0.75–0.8125 rem | `ink-dim` or `ink-faint`. |
| Button | Atkinson 600 | 0.75–1 rem | |

**Numbers:**
- Always digits.
- Tabular wherever they update or line up.
- A space before the unit: `250 W`, `92 rpm`, `142 bpm`, `12 %`, `3.2 W/kg`.
- Durations as `m:ss` or `h:mm:ss`.
- Sets with ×: `5 × 4:00`. Ranges with an en dash: `Z2–Z3`.

## Shape, space and depth

- **Radii are tight** (an instrument panel, not a phone game):
  - 3 px `rounded-sm` for small tags, 4 px `rounded` for chips;
  - 5 px `rounded-md` for small controls;
  - 6 px `rounded-lg` for buttons, inputs and nav items;
  - 8 px `rounded-xl` for inner cards and toasts;
  - 10 px `rounded-2xl` for cards, tiles, banners and dialogs;
  - full round only for pills, dots and switches.
- **Spacing** is on a 4 px grid (Tailwind's scale). A card's padding is 16–20 px.
- **Surfaces separate by tone and a 1 px `line`,** not by shadow. Shadows (Tailwind's own `shadow`, `shadow-xl`, `shadow-2xl`) are only for things that float: tooltips, toasts, dialogs.
- **The focus ring** is 2 px of `accent` with a 2 px offset. It's at least 5:1 on every surface in both themes.

## Iconography

- **Icons are Lucide,** at 16 px in dense UI and 20 px in banners, with the default 2 px stroke, in the text colour.
- **Colour an icon** with `accent` when it's an active or pressable state, or with a status colour when it sits beside its word.
- **No emoji** in the interface. The coaches don't use them either.

## Motion

- **Short and purposeful:**
  - 120–150 ms for hover and press;
  - 200 ms for things arriving;
  - ease-out.
- **The parody caricatures are the only characters that move.** They ride in, wiggle while talking and ride off.
- **Reduce Motion stops all of it.** With macOS's Reduce Motion on, the caricatures stand still and nothing slides.

## Voice and writing

The app talks like a good mechanic: specific, calm and brief. The coaches are the ones with personalities.

- **Sentence case everywhere:** titles, buttons, menus, labels. Proper nouns keep their own case: FreeGaz, KICKR, Strava, W′bal.
- **"You" for the rider.** The app never says "I" or "we"; only the coaches do.
- **Buttons start with a verb and name the thing:** "Start ride", "Save workout", "Connect trainer", "Delete ride".
- **Errors say what happened and what to do next,** without apologising: "The trainer didn't answer. Check it's awake and not held by Zwift or the Wahoo app, then try again."
- **Empty states say what will appear and how to add the first one.**
- **No exclamation marks or emoji in the interface,** and no hype words (amazing, seamless, powerful). A little dry wit is fine in headings, like "Ready to suffer?". Keep it out of instructions and errors.
- **Parody personas are labelled** "Parody", with their exact disclaimer, wherever they can be picked or seen.

## Imagery

- **No stock photos, no illustrations of people, no generated art.** The interface is type, numbers and charts.
- **The one exception is the parody caricatures:** photo heads on a cartoon bike.
  - Only public-domain or openly licensed photos, approved file by file.
  - Cut to the head, never distorted.
  - Credited in `src/renderer/src/coach/toon/heads/ATTRIBUTION.md`.

## Accessibility checklist

- **Contrast:** text at least 4.5:1 on its ground in both themes; borders, focus rings and meaningful icons at least 3:1.
- **Colour is never the only signal:** zones have labels, statuses have words, series have names.
- **Numbers don't jitter:** tabular figures.
- **Motion respects Reduce Motion.**
