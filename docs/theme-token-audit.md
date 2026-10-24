# Theme token audit — 2026-10-24

Generic confirmations now follow the selected theme: Coach applied acknowledgments,
saved/backup notices, completed sets and warm-ups, import readiness, and add-swipe
feedback. Filled controls use accent-fill/on-accent-fill; text, washes and borders
use accent-text, accent-soft and accent-hairline. This supersedes the earlier
semantic-success classification below. Warning/error/destructive states and
actual positive/negative statistical meaning retain their separate semantic roles.

Weekly Review is cumulative progress, not a success confirmation. The default
`.consistency-bars .filled` contained `#1f6b4c`; the Dark and Premium layers then
overrode it with `--rook-success`. Personal Themes intentionally keeps success
green, so Ocean rendered `rgb(97, 193, 141)` while `--rook-progress` was blue
`#83bcee`. All progress fills, chart bars and progression markers now consume
`--rook-progress`, which resolves to the readable theme accent.

The audit classified 352 green-looking CSS declarations, including 102 existing
token fallbacks, canonical palette definitions and neutral photo-overlay text.
183 reviewed legacy component declarations were migrated to shared accent,
success, focus, disabled or secondary roles. No layout or domain data changed.
The full per-declaration inventory and classification is in the ignored local
`artifacts/theme-token-audit` directory.

THEMED ACCENT: primary actions; text/navigation actions; selected controls;
focus outlines; checked switches; rest/activity controls; Coach send/loading,
selection and informational emphasis; spinner fills; import/editor selection;
progression guidance; week navigation; notes controls. Selection in Coach's
adaptation review is a choice, not an already-successful outcome.

CONFIRMATION STATES: completed-set paint, completion marks, Coach applied-action
acknowledgments, logged Today checks, completed import matching, ready photo uploads,
backup notices and add-swipe feedback use the selected theme accent. Filled glyphs
use accent-fill/on-accent-fill; text and soft surfaces use accent-text/accent-soft.
The audit migrated 61 remaining confirmation declarations across 9 stylesheets.
The available semantic success role is kept separate for genuine metric meaning.
Warning, error and destructive roles remain independent of the selected palette.
The theme contrast checks cover readable accent/soft-surface and filled-glyph pairs.

BRAND IDENTITY: packaged application icons and wordmark assets retain their
authored colors. The `.brand` UI text was already themeable in Dark/Premium;
its Light declaration now uses that same accent contract. `--rook-style-standard`
and `--rook-style-premium`, Green palette swatches and Fine-tune shade swatches
retain their own identities so users can recognize choices in another theme.

DECORATIVE/ILLUSTRATION: exercise raster/SVG sources are unchanged. The existing
alpha-mask illustration primitive already consumes `--rook-illustration-ink`.
Inline UI SVGs use currentColor or existing semantic stroke/fill rules. The
working-weight SVG polyline already uses `--rook-accent`; no JS chart palette,
canvas green constant or Tailwind green utility was found in production source.
Image-processing canvases resize/draw the user image; they do not use ROOK
Green as an app accent. Photo export preserves the original loaded asset.

NEUTRAL/LEGACY: fixed dark photo viewer text retains its slightly green-gray
neutral colors. Canonical Green token definitions and token fallback colors
are legitimate defaults. They are overridden centrally for Personal Themes;
they are not per-palette component rules. No ambiguous green was blindly themed.

Snackbar Undo retains its dark/raised surface and uses `--rook-inverse-accent`, resolved
centrally against both supported surfaces (at least 4.5:1), rather than a dark Light-theme
accent on black. The main progress/text/fill roles retain the existing contrast
resolver across all six families, five shades, three tones and Light/Dark.

The existing root theme owner applies staged and committed tokens. No additional
preview state, preferences, billing/entitlement, sync or navigation logic was
introduced. Cancel uses the existing token rollback.
