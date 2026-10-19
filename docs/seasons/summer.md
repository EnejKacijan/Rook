# Summer theme

Branch: `claude/seasonal-summer` (on `claude/seasonal-core`, which is on
`claude/theme-polish`). Review only until you decide to release it.

**Character:** Lagoon · sun. Sunlit sand in Light and deep-sea nights in Dark (`#0a1416` page), with a lagoon turquoise accent that differs from Ocean's blue.

**Accent shades (Fine-tune):** Lagoon (default), Sea, Seafoam, Palm, Dusk. Coral and mango shades were left out: they would read like the error and warning colors.

**Decoration:** A small sun in the corner and two wave lines. It is one static band in the empty top padding of Today,
Coach, Progress and Profile, below the safe area and above every control. It never
appears in an active workout, a sheet or a form, has no motion, and is hidden in
forced-colors mode. The same band previews on the theme's tile in the picker.

Warning, error, success, selected and disabled colors are the shared semantic roles,
unchanged. `src/seasonalContract.test.js` checks contrast, scoping and color distance.

## Proposed release window

**Jun 21 – Aug 31** (`06-21` to `08-31` in `src/seasons/summer.js`). From the June solstice to the end of August holidays.

The theme is offered only inside its local date window. After the inclusive last day,
ROOK restores the last year-round palette, its Fine-tune choices and the same appearance
at the next safe moment. Active or paused sessions and open editors/previews defer
this automatic transition. A quiet notice explains the return. Seasonal settings
remain saved, but the theme must be selected again in a future year.

## Files

- `src/seasons/summer.js`: palette, shades, window.
- `src/seasons/summer.css`: decoration band.
- `docs/seasons/summer.md`: this file.

## Releasing it on its own

1. Merge `claude/seasonal-summer` into `main` (or open a PR from it). It contains this
   season and nothing from other seasons. If `claude/theme-polish` and
   `claude/seasonal-core` are not merged yet, they come with it.
2. Nothing else to configure: the season registers itself from its files.

To withdraw it later, remove this season's files. People who used it return to their
saved year-round palette with their appearance and Fine-tune choices.

## Previewing

```sh
git checkout claude/seasonal-summer
npm install
VITE_ROOK_ALL_SEASONS=true npm run build   # lists the season outside its window
npm run preview -- --port 4398             # Profile → Display → Appearance → Choose a theme
```
