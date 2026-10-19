# Seasonal themes

Shared infrastructure on `claude/seasonal-core` (built on `claude/theme-polish`). With no
season merged it changes nothing a person can see: the picker shows no seasonal group.

## How a season is built

A season is three new files and nothing else:

| File | Purpose |
|---|---|
| `src/seasons/<id>.js` | Plain data, default export: name, character, release window, signature surfaces, five accent shades. No imports. |
| `src/seasons/<id>.css` | Decoration only: sets `--rook-season-decor` (and optionally `--rook-season-decor-size`) under `:root[data-season="<id>"]` for Light and Dark. |
| `docs/seasons/<id>.md` | What it looks like, release window, merge steps. |

Optionally `src/seasons/<id>.test.js` for season-specific checks.

`src/seasonalThemes.js` discovers `src/seasons/*.js` and `*.css` at build time, validates
each season and registers it after the six year-round palettes. Because a season only
adds new files, any combination of seasons merges without conflicts, in any order.

## What core provides

- **Registry and windows** (`src/seasonalThemes.js`): validation, calendar ordering,
  inclusive windows that may wrap the year (`12-28` to `01-07`).
- **Picker**: a separate "Seasonal" group under the six curated palettes. A season is
  offered during its window. A season someone already uses stays listed and keeps
  working after its window ("Season ended") until they choose another palette; it is
  never switched away silently. Fine-tune (shades and background tone), preview, Apply,
  Cancel and Reset work exactly as for the year-round palettes.
- **Persistence**: seasonal Fine-tune is stored apart from the year-round families, with
  the last year-round palette as `fallbackPalette`. Year-round payloads keep their
  original shape. If a saved season is not in a build, the fallback palette, its
  customizations and the appearance are restored instead of resetting everything.
- **Decoration contract**: the root gets `data-season="<id>"` (staged with the preview,
  released on Cancel). A static image from `--rook-season-decor` sits behind content on
  Today, Coach, Progress and Profile only: never in an active workout, a sheet or a form,
  and hidden in forced-colors mode. There is no motion, so reduced motion needs no
  special case.
- **Semantics stay fixed**: seasons cannot set warning, error, success, disabled or
  selected roles. `src/seasonalContract.test.js` checks every merged season: scoped
  rules only, both appearances decorated, no motion or network assets, only
  `--rook-season-*` properties, and every shade at least 0.1 OKLab from error and
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

`VITE_ROOK_ALL_SEASONS=true` lists every merged season regardless of date. On any season
branch (or `claude/seasonal-preview`):

```sh
npm install
VITE_ROOK_ALL_SEASONS=true npm run build   # PowerShell: $env:VITE_ROOK_ALL_SEASONS='true'; npm.cmd run build
npm run preview                            # http://127.0.0.1:4173 → Profile → Display → Appearance → Choose a theme
```
