# Spring theme

Branch: `claude/seasonal-spring` (on `claude/seasonal-core`, which is on
`claude/theme-polish`). Review only until you decide to release it.

**Character:** Blossom · fresh. Blush ivory in Light and a soft rose-brown night in Dark, with a blossom pink accent tuned away from the error red.

**Accent shades (Fine-tune):** Blossom (default), Peony, Lilac, Leaf, Sky.

**Decoration:** A blossom branch with five flowers and three leaves. It is one static band in the empty top padding of Today,
Coach, Progress and Profile, below the safe area and above every control. It never
appears in an active workout, a sheet or a form, has no motion, and is hidden in
forced-colors mode. The same band previews on the theme's tile in the picker.

Warning, error, success, selected and disabled colors are the shared semantic roles,
unchanged. `src/seasonalContract.test.js` checks contrast, scoping and color distance.

## Proposed release window

**Mar 20 – May 31** (`03-20` to `05-31` in `src/seasons/spring.js`). From the March equinox to the end of May, the season most people restart outdoor and gym routines.

The theme is offered only inside its local date window. After the inclusive last day,
ROOK restores the last year-round palette, its Fine-tune choices and the same appearance
at the next safe moment. Active or paused sessions and open editors/previews defer
this automatic transition. A quiet notice explains the return. Seasonal settings
remain saved, but the theme must be selected again in a future year.

## Files

- `src/seasons/spring.js`: palette, shades, window.
- `src/seasons/spring.css`: decoration band.
- `docs/seasons/spring.md`: this file.

## Releasing it on its own

1. Merge `claude/seasonal-spring` into `main` (or open a PR from it). It contains this
   season and nothing from other seasons. If `claude/theme-polish` and
   `claude/seasonal-core` are not merged yet, they come with it.
2. Nothing else to configure: the season registers itself from its files.

To withdraw it later, remove this season's files. People who used it return to their
saved year-round palette with their appearance and Fine-tune choices.

## Previewing

```sh
git checkout claude/seasonal-spring
npm install
VITE_ROOK_ALL_SEASONS=true npm run build   # lists the season outside its window
npm run preview -- --port 4398             # Profile → Display → Appearance → Choose a theme
```
