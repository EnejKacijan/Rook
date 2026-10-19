# Christmas theme

Branch: `claude/seasonal-christmas` (on `claude/seasonal-core`, which is on
`claude/theme-polish`). Review only until you decide to release it.

**Character:** Evergreen · warm. Warm cream in Light, deep pine in Dark (`#0d1512` page, `#15201c` cards), with an evergreen accent.

**Accent shades (Fine-tune):** Evergreen (default), Pine, Spruce, Mistletoe, Frost. Burgundy and gold appear in the ornament only: burgundy sits next to the error red and gold next to the warning amber, and a control must never look like an alert.

**Decoration:** A pine garland with burgundy berries and gold stars. It is one static band in the empty top padding of Today,
Coach, Progress and Profile, below the safe area and above every control. It never
appears in an active workout, a sheet or a form, has no motion, and is hidden in
forced-colors mode. The same band previews on the theme's tile in the picker.

Warning, error, success, selected and disabled colors are the shared semantic roles,
unchanged. `src/seasonalContract.test.js` checks contrast, scoping and color distance.

## Proposed release window

**Dec 1 – Dec 27** (`12-01` to `12-27` in `src/seasons/christmas.js`). Advent season through Boxing Day and Independence and Unity Day (Dec 26). The New Year theme takes over on Dec 28, so the two never compete in the picker.

The theme appears in the picker only inside the window. Anyone who picked it keeps it
after the window until they choose another palette.

## Files

- `src/seasons/christmas.js`: palette, shades, window.
- `src/seasons/christmas.css`: decoration band.
- `docs/seasons/christmas.md`: this file.

## Releasing it on its own

1. Merge `claude/seasonal-christmas` into `main` (or open a PR from it). It contains this
   season and nothing from other seasons. If `claude/theme-polish` and
   `claude/seasonal-core` are not merged yet, they come with it.
2. Nothing else to configure: the season registers itself from its files.

To withdraw it later, delete the three files above. People who used it return to their
saved year-round palette with their appearance and Fine-tune choices.

## Previewing

```sh
git checkout claude/seasonal-christmas
npm install
VITE_ROOK_ALL_SEASONS=true npm run build   # lists the season outside its window
npm run preview                            # Profile → Display → Appearance → Choose a theme
```
