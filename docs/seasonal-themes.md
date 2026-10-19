# Seasonal themes

Shared infrastructure on `claude/seasonal-core` (built on `claude/theme-polish`). With no
season merged it changes nothing a person can see: the picker shows no seasonal group.

## How a season is built

A season is three new files and nothing else:

Set `releaseYear` on its data definition to the first published season's start
year. Discovery uses a stable versioned ID per palette and local season start
year. Unseen palettes show New until the picker is viewed; subsequent seasonal
occurrences show Back only in their window. The same notice guides Profile,
Display and Appearance. First setup acknowledges only its own initial choices;
restoring an existing profile does not dismiss notices. This local discovery
metadata is separate from theme Apply/Cancel and never changes a palette.

| File | Purpose |
|---|---|
| `src/seasons/<id>.js` | Plain data, default export: name, character, release window, signature surfaces, five accent shades. No imports. |
| `src/seasons/<id>.css` | Decoration only: sets `--rook-season-decor` (a 360×24 SVG band) under `:root[data-season="<id>"]` for Light and Dark. |
| `docs/seasons/<id>.md` | What it looks like, release window, merge steps. |

Optionally `src/seasons/<id>.test.js` for season-specific checks.

`src/seasonalThemes.js` discovers `src/seasons/*.js` and `*.css` at build time, validates
each season and registers it after the six year-round palettes. Because a season only
adds new files, any combination of seasons merges without conflicts, in any order.

## What core provides

- **Registry and windows** (`src/seasonalThemes.js`): validation, calendar ordering,
  inclusive windows that may wrap the year (`12-28` to `01-07`).
- **Picker**: a separate "Seasonal" group under the six curated palettes. Production
  offers a season only during its window. At expiry, the provider restores the last
  year-round palette, its Fine-tune choices and the same appearance. Active or paused
  sessions, editors, focused inputs and theme previews defer this automatic transition.
  A quiet, one-time snackbar announces the actual return, without a modal.
- **Persistence**: seasonal Fine-tune is stored apart from the year-round families, with
  the last year-round palette as `fallbackPalette`. Seasonal storage uses schema v3
  and an inclusive, year-specific `seasonalValidUntil` local date. Plain year-round
  payloads retain their v2 shape. Legacy seasonal choices without a provable year
  return conservatively to the fallback (ROOK Green if missing). Unknown seasonal
  customizations remain opaque metadata when their definition is absent, so later
  releases can restore them. No season activates automatically next year.
- **Lifecycle**: check after hydration establishes workout/editor safety, next local
  midnight, focus, pageshow, visibility and native foreground. Apply checks availability
  again and keeps a late expired draft open with an inline explanation. Automatic
  expiry renders the fallback even if its save fails; the last durable value stays
  distinct and the write retries on a later safe event. It never loops on save failure
  or replaces a newer manual Apply. Reading preferences never writes.
- **Decoration contract**: the root gets `data-season="<id>"` (staged with the preview,
  released on Cancel). A static 360×24 band from `--rook-season-decor` sits in the empty
  top padding of Today, Coach, Progress and Profile, just below the safe area and above
  the first row of controls, so it never covers text or a control. Never in an active
  workout, a sheet or a form, and hidden in forced-colors mode. There is no motion, so
  reduced motion needs no special case.
- **Semantics stay fixed**: seasons cannot set warning, error, success, disabled or
  selected roles. `src/seasonalContract.test.js` checks every merged season: scoped
  rules only, both appearances decorated, no motion or network assets, only
  `--rook-season-*` properties, and every shade at least 0.075 OKLab from error and
  warning colors. The contrast report test covers all seasonal shades and tones.

## Branches and dependencies

```
codex/claude-theme-handoff-2026-10-19
└── claude/theme-polish          year-round polish
    └── claude/seasonal-core     shared infrastructure (this file)
        ├── claude/seasonal-halloween
        ├── claude/seasonal-christmas
        ├── claude/seasonal-new-year
        ├── claude/seasonal-spring
        └── claude/seasonal-summer
claude/seasonal-preview          review only: every season, all windows open. Never merge.
```

Each season branch contains only its own season on top of core. Merging one season
brings `theme-polish` and `seasonal-core` with it if they are not merged yet, and never
another season.

## Releasing one season

1. Decide to release (dates alone never mean release).
2. Merge `claude/seasonal-<id>` into `main` (or open a PR from it). If core is already
   merged, the diff is exactly the season's three or four files.
3. The theme appears in the picker from the first day of its window. To change the
   window, edit `window` in `src/seasons/<id>.js`.

To withdraw a season, delete its files. People who used it return to their saved
year-round palette.

## Reviewing locally

`VITE_ROOK_ALL_SEASONS=true` lists every merged season regardless of date and bypasses
expiry for review. Use a separate local origin (port 4398 below), so review choices
never modify a production origin's preferences. On any season branch (or preview):

```sh
npm install
VITE_ROOK_ALL_SEASONS=true npm run build   # PowerShell: $env:VITE_ROOK_ALL_SEASONS='true'; npm.cmd run build
npm run preview -- --port 4398             # http://127.0.0.1:4398 → Profile → Display → Appearance → Choose a theme
```
