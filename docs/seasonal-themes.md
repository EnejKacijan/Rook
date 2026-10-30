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
| `src/seasons/<id>.js` | Plain data, default export: name, character, release window, signature surfaces, five accent shades, optional `atmosphere`. No imports. |
| `src/seasons/<id>.css` | Decoration only, under `:root[data-season="<id>"]` for Light and Dark: `--rook-season-decor` (a 360×24 SVG band, required) and optionally `--rook-season-perch` (a 44×44 SVG motif). |
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
  released on Cancel). Three static layers, all backgrounds or empty pseudo-elements, so
  they take no touches and screen readers never meet them:
  - the band from `--rook-season-decor` in the empty top padding of Today, Coach,
    Progress and Profile, just below the safe area and above the first row of controls;
  - the palette wash (`atmosphere` in the season data, shared by year-round palettes):
    a gradient at the top of the same four tabs. Its strongest point joins the surfaces
    every text color is resolved against, so it can never weaken contrast;
  - an optional 44×44 motif from `--rook-season-perch`, perched on the top edge of
    Today's main action in its empty right corner, clear of the centered label at 320 px.
  Never in an active workout, a sheet or a form, and hidden in forced-colors mode. There
  is no motion, so reduced motion needs no special case. The theme picker shows the
  same band, wash and motif on the season's tile.
- **Labels**: the picker's Seasonal group carries one shared note, "Returns every year".
  Tiles keep name, character and window. New and Back stay discovery marks only; there
  is no scarcity label.
- **Semantics stay fixed**: seasons cannot set warning, error, success, disabled or
  selected roles. `src/seasonalContract.test.js` checks every merged season: scoped
  rules only, both appearances decorated, no motion or network assets, only
  `--rook-season-*` properties, and every shade at least 0.075 OKLab from error and
  warning colors. The contrast report test covers all seasonal shades and tones.

## Optional year-round access with Pro

The current billing-free release keeps the existing season-only behavior and
shows no Pro message or upgrade action. `PersonalThemesProvider` optionally
accepts `seasonalAccess: { enabled: true, status: 'active' | 'free' | 'unknown' }`
and `onExploreSeasonalPro`. The subscription owner supplies its already-verified
status; Appearance never imports a billing SDK or persists an entitlement flag.
`App`/`RookRoot` expose this integration through `themeOptions`. A real Pro
rollout must supply this capability instead of gating the whole theme studio.

When enabled, everyone can apply a released seasonal theme during its local
window. Active Pro also permits the Seasonal archive and keeps the selected
theme after the season. There is no per-theme Keep action, claim or permanent
ownership. Cancelled-but-still-active and SDK-cached active subscriptions remain
active; ROOK does not calculate its own subscription expiry or offline grace.

Confirmed access loss outside the season uses the existing workout/input/editor
safety blockers and preserves all custom shades and appearance choices. Unknown
status holds an already-selected theme without authorizing a new off-season
Apply. Restored access unlocks choices without automatically selecting anything.
The saved `seasonalValidUntil` remains a free-window marker, not a subscription
expiry: an explicit off-season Pro selection binds it to the next free season,
so an entitlement that ends during that window does not remove a free theme.
After an actual fallback, returning seasons never reapply automatically.

Only shipped, released modules appear. The local synthetic preview at
`artifacts/seasonal-access-preview/` injects ephemeral access/date scenarios and
uses its own storage/database namespace. Its Pro information sheet cannot make
purchases. It does not enable billing or change the normal app's default access.

## Branches and dependencies

```
main (year-round themes and Halloween released)
└── claude/local-review-base         verified local fixes (readability, Coach, previous values)
    └── claude/theme-visual-v2-nlh3tv  shared visual layer: washes, perch slot, tab icon, type floor
        ├── claude/seasonal-halloween  Halloween refresh (already on main)
        ├── claude/seasonal-christmas
        ├── claude/seasonal-new-year
        ├── claude/seasonal-winter
        ├── claude/seasonal-spring
        └── claude/seasonal-summer
claude/seasonal-preview              review only: every season, all windows open. Never merge.
```

`claude/theme-polish` and `claude/seasonal-core` are fully contained in `main`.
Each season branch contains only its own season's files beyond the shared visual
layer. Merging one season brings the shared layer with it if it is not merged yet,
and never another season.

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
