# Year-round theme polish — 2026-10-19

Branch: `claude/theme-polish` (from `codex/claude-theme-handoff-2026-10-19`). Not for
direct release without review; seasonal themes live on their own branches.

## What changed

**Family character.** Each of the six families now owns an art-directed surface ladder
(page, card, muted) for its own default tone and a one-line character shown in the
picker:

| Family | Character | Light page / card | Dark page / card |
|---|---|---|---|
| ROOK Green | Signature · focused | `#f5f6f3` / `#ffffff` | `#0f1312` / `#1a1f1c` |
| ROOK Gold | Warm · premium | `#f8f5ef` / `#fffdf8` | `#11100e` / `#1a1915` |
| Ocean | Cool · clear | `#f1f5f9` / `#fbfdff` | `#0c131a` / `#152029` |
| Slate | Quiet · minimal | `#f3f4f5` / `#ffffff` | `#111315` / `#1a1d20` |
| Plum | Rich · calm | `#f6f4f7` / `#fffdff` | `#131117` / `#1d1a22` |
| Terracotta | Earthy · warm | `#f9f4f0` / `#fffcfa` | `#15110f` / `#201a17` |

Other background tones (Fine-tune) are still derived from the shared Neutral, Warm and
Cool vocabulary, tinted toward the family.

**Ink and depth.** Text, secondary text and control borders carry a trace of the family
hue instead of one green-gray for every palette. Text on a filled control is tinted with
the fill hue. New semantic roles: `--rook-shadow-soft`, `--rook-accent-shadow` and a
family-tinted `--rook-scrim` and `--rook-shadow`. Dark `--rook-surface-elevated` is one
step above the card surface. Enabled primary actions get one soft accent-tinted lift;
pressed and disabled states stay flat. Scrims and sheet shadows now come from the theme
in Light too, not only Dark.

**Fine-tune.** Shades within a family are visibly distinct (Slate gains Graphite and a
teal Steel, Gold gains Antique and an orange Amber, Plum gains Orchid). Shade ids are
unchanged, so saved choices keep working. Background tone swatches show all three
surfaces.

**Picker.** Each palette tile is a miniature of the palette in the current appearance
(page, card with text lines, primary action) plus its character line.

**System mode and reopening.** The pre-paint script in `index.html` reads the saved
Personal Theme appearance, so a saved Dark (or System on a dark device) never flashes
Light while the app loads.

**Token hygiene.** Eleven references to undefined tokens (`--rook-danger`,
`--rook-subtle`, `--rook-warning-border`, `--rook-accent-text-text` and others) fell back
to Light-only literals or to nothing in Dark. They now use the existing semantic roles.
The custom-exercise delete button uses the destructive fill pair instead of error text
with fixed white. `src/themeTokenDefinitions.test.js` fails on any new undefined token.

Calculations, workouts, history, storage, accounts, imports and navigation are
unchanged. No preference format change.

## Verification

- `npm test`: see the handoff message for the exact run.
- `node scripts/theme-contrast-report.mjs`: worst case per family and mode across all
  shades and tones. 7,560 checks, 0 below target (4.5:1 text, 3:1 controls).
- `node scripts/theme-gallery-qa.mjs` against `npm run preview` captures Today,
  calendar, Adjust Today, Edit today's exercises, exercise search, active workout,
  Coach, Progress, Profile and the theme picker for every family in Light and Dark,
  and fails on horizontal overflow or console errors. Set `CHROME_PATH`, `THEMES`,
  `MODES`, `WIDTHS` (for example `375,390,430`) and `OUT` as needed.
