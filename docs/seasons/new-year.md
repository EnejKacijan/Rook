# New Year theme

Branch: `claude/seasonal-new-year` (on `claude/seasonal-core`, which is on
`claude/theme-polish`). Review only until you decide to release it.

**Character:** Midnight · sparkle. Midnight navy in Dark (`#0a0c17` page, `#131628` cards) and frosted silver in Light, with a midnight indigo accent.

**Accent shades (Fine-tune):** Midnight Indigo (default), Ice, Silver, Electric Violet, Night Blue. Champagne gold stays in the ornament: as an accent it would read like a warning.

**Decoration:** Gold, silver and indigo confetti with three sparkles. It is one static band in the empty top padding of Today,
Coach, Progress and Profile, below the safe area and above every control. It never
appears in an active workout, a sheet or a form, has no motion, and is hidden in
forced-colors mode. The same band previews on the theme's tile in the picker.

Warning, error, success, selected and disabled colors are the shared semantic roles,
unchanged. `src/seasonalContract.test.js` checks contrast, scoping and color distance.

## Proposed release window

**Dec 28 – Jan 7** (`12-28` to `01-07` (wraps the year) in `src/seasons/new-year.js`). Starts the day after Christmas ends and runs through the first training week of January, when new-year training plans begin.

The theme is offered only inside its local date window. After the inclusive last day,
ROOK restores the last year-round palette, its Fine-tune choices and the same appearance
at the next safe moment. Active or paused sessions and open editors/previews defer
this automatic transition. A quiet notice explains the return. Seasonal settings
remain saved, but the theme must be selected again in a future year.

## Files

- `src/seasons/new-year.js`: palette, shades, window.
- `src/seasons/new-year.css`: decoration band.
- `docs/seasons/new-year.md`: this file.

## Releasing it on its own

1. Merge `claude/seasonal-new-year` into `main` (or open a PR from it). It contains this
   season and nothing from other seasons. If `claude/theme-polish` and
   `claude/seasonal-core` are not merged yet, they come with it.
2. Nothing else to configure: the season registers itself from its files.

To withdraw it later, remove this season's files. People who used it return to their
saved year-round palette with their appearance and Fine-tune choices.

## Previewing

```sh
git checkout claude/seasonal-new-year
npm install
VITE_ROOK_ALL_SEASONS=true npm run build   # lists the season outside its window
npm run preview -- --port 4398             # Profile → Display → Appearance → Choose a theme
```
