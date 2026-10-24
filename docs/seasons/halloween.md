# Halloween theme

Branch: `claude/seasonal-halloween` (on the shared visual layer `claude/theme-visual-v2-nlh3tv`). Review only until you decide to release it.

**Character:** Ember · night. Charcoal-violet nights (`#121016` page, `#1c1822` cards) and smoky lilac paper in Light. A measured pumpkin orange carries actions and selection.

**Accent shades (Fine-tune):** Pumpkin (default), Moonlight, Witch Violet, Potion, Ash. Amber and blood-red shades were left out: they would read like the warning and error colors.

**Decoration:** Three static layers. A crescent moon, three small bats, a dotted web thread and a few stars in the empty top padding of Today, Coach, Progress and Profile; a violet night glow behind the top of those tabs; and a small pumpkin, outlined in the page color, perched in the empty right corner of Today's main action, clear of its label. None of it appears in an active workout, a sheet or a form; it has no motion, takes no touches, is invisible to screen readers and is hidden in forced-colors mode. The theme's tile in the picker shows the same band, glow and pumpkin.

Warning, error, success, selected and disabled colors are the shared semantic roles,
unchanged. `src/seasonalContract.test.js` checks contrast, scoping and color distance.

## Proposed release window

**Oct 1 – Nov 2** (`10-01` to `11-02` in `src/seasons/halloween.js`). Halloween is Oct 31. A month-long window gives the theme time to be found, and it ends after All Saints' Day (Nov 1), a public holiday in Slovenia.

The theme is offered only inside its local date window. After the inclusive last day,
ROOK restores the last year-round palette, its Fine-tune choices and the same appearance
at the next safe moment. Active or paused sessions and open editors/previews defer
this automatic transition. A quiet notice explains the return. Seasonal settings
remain saved, but the theme must be selected again in a future year.

## Files

- `src/seasons/halloween.js`: palette, shades, window.
- `src/seasons/halloween.css`: decoration band.
- `docs/seasons/halloween.md`: this file.

## Releasing it on its own

1. Merge `claude/seasonal-halloween` into `main` (or open a PR from it). It contains this
   season and nothing from other seasons. If `claude/theme-polish` and
   `claude/seasonal-core` are not merged yet, they come with it.
2. Nothing else to configure: the season registers itself from its files.

To withdraw it later, remove this season's files. People who used it return to their
saved year-round palette with their appearance and Fine-tune choices.

## Previewing

```sh
git checkout claude/seasonal-halloween
npm install
VITE_ROOK_ALL_SEASONS=true npm run build   # lists the season outside its window
npm run preview -- --port 4398             # Profile → Display → Appearance → Choose a theme
```
