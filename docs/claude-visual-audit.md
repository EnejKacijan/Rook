# Complete ROOK visual/layout audit

## Starting point and boundaries

Start from **`codex/claude-visual-audit-oct30`**, not `main`. This snapshot contains
the actual current local application, including the compact weekly streak,
count-only missed-workout reminder, compact Coach review navigation, typography,
Coach quality and calendar changes. It is not the older `rook-visual-v2` theme
bundle. Do not reset these changes to the published application.

The user approved publishing this baseline to a separate GitHub branch solely
to make it available to Claude Code on the web. No Desktop install or Remote
Control connection is required. The repository is `EnejKacijan/Rook`.

Keep audit changes in the review environment. Do not merge, create a PR, push
audit results, deploy, invoke a build hook, change hosting settings, or remove
the Netlify guard without a new explicit request. `netlify.toml` intentionally
contains `build.ignore = "exit 0"`. Local `npm run build` remains available.
The handoff commit also uses `[skip netlify]`. Production still follows `main`.

Do not add subscriptions, premium restrictions, purchase flows or paywalls.
Existing authentication, API budgets, ownership checks, data persistence,
schedule semantics and workout prescriptions must remain intact.

## What the user actually requested

Inspect the layout and visual usability of **every application screen and
meaningfully distinct state**, using the running application and screenshots.
Themes are a way to validate the layout, not the primary subject of the audit.
Do not substitute a theme redesign, a few theme galleries or new mockups for
the whole-screen review. Implement concrete visual improvements, then capture
the same states again.

Create a coverage inventory first. Include Today, Coach, Progress, Profile,
onboarding and plan creation/import, auth/recovery, active and completed
strength/optional sessions, history, settings, all supporting sheets and menus.
Give particular attention to missed sessions, move/swap/combine flows, review
and confirmation screens, exercise editors and information disclosures. Cover
empty/populated states, long names, multiple items, disabled/error states,
an existing active workout, an open keyboard and expanded/collapsed details.

Inspect:

- Spacing, alignment, type sizes and hierarchy; excessive empty space and
  tall/nested cards holding only a single action.
- Duplicate separators from neighboring cards, disclosure rows or header/
  footer borders. Adjacent review disclosures now share one separator; keep
  that rule when both closed and expanded.
- Redundant headings/explanations. Put secondary help under the shared info
  control where appropriate, while preserving essential consequences before
  confirmation.
- Consistent navigation chevrons, 44 px minimum touch areas, theme tokens,
  disclosure/sheet motion and clear differences between navigation and an
  action that actually applies a change.
- Horizontal overflow, scroll beyond the content boundary, clipping, focused
  input rings, safe areas, fixed headers/footers and keyboard behavior.

Retain accepted patterns: the profile weekly streak is a compact full-width
row; Coach's combined-workout review entry is one neutral navigation row;
missed-workout feedback is a single count with a separate Hide/Undo; Today has
compact Add conditioning/Choose a workout rows under its exercises.

## Run locally in the cloud workspace

Use the repository lockfile and existing Node project:

```sh
npm ci --ignore-scripts
VITE_ROOK_ACCOUNT_SYNC_ROLLOUT=false npm run dev -- --mode theme-preview --host 0.0.0.0 --port 4400 --strictPort
```

No real account, real API credentials or personal workout backup is necessary.
Run the dev server and browser inside your cloud workspace. A localhost URL in
this document refers to that server, not the user's Windows computer. Use your
cloud browser/headless Playwright and the existing QA tooling for screenshots;
do not request Claude Desktop, a local folder bridge or Remote Control to obtain
this already-uploaded source. If a browser capability is unavailable, report
that concrete limitation rather than claiming screenshots were inspected.
The dev-only pages under `review/` use scoped local/session storage and scoped
IndexedDB. They must be served in `theme-preview` mode with account sync disabled;
their runtime guards intentionally reject other modes. Do not weaken those
guards or use the ordinary application's stored user data for captures.

Useful synthetic entry points (append to the local origin):

| Route | Relevant views |
| --- | --- |
| `/review/coach-quality-preview/?scenario=occupied&fixture=audit-v1` | Coach reply, compact review row, occupied-day move choice, combined review, Today/Profile/Progress |
| `/review/missed-recovery-preview/?scenario=today&fixture=audit-v1` | Planned Today, missed reminder, Add conditioning, workout library |
| `/review/missed-recovery-preview/?scenario=three&fixture=audit-v1` | Multiple missed sessions and pair selection |
| `/review/streak-preview/?scenario=empty&fixture=audit-v1` | Profile zero streak and its info sheet (open Profile) |
| `/review/streak-preview/?scenario=large&fixture=audit-v1` | Profile with a 104-week synthetic history |
| `/review/plan-workout-preview/?review=audit-logger&start=repeat&history=varied&chrome=0` | Planned workout logging, previous values, rest and exercise options |
| `/review/plan-workout-preview/?review=audit-timing&idle=1&palette=halloween&chrome=0` | Inactive/open workout recovery and timing details |
| `/review/plan-workout-preview/?review=audit-today&today-copy=1&palette=champagne&chrome=0` | Selected day while a different workout is still open |

These are starting points, not exhaustive coverage. Build additional isolated
fixtures as needed using the actual components. The current local day affects
calendar fixture counts; record the date of each capture. Use the source QA
inventory in `scripts/release-browser-manifest.mjs` and the existing `*qa.mjs`
scripts to discover other states and flows. Do not claim coverage merely because
a route or script exists.

Approved synthetic reference screenshots are under
`docs/visual-audit-reference/`. They show the last accepted Today, Profile,
Coach entry and combined-review layouts. They contain no real account or
personal workout data.

## Verification and delivery

Inspect widths 320, 393 and 430 px, light/dark appearance and several different
theme accents. Check enlarged text/200% zoom, keyboard focus and reduced motion.
Allow accessible reflow rather than shrinking text to force everything to fit.
Inspect both opening and closing of each shared overlay/disclosure pattern.

Fix causes in shared components and style ownership rather than adding a stack
of screen-specific overrides. Preserve data and functionality; do not weaken
tests, validations or security to make the audit pass. Run appropriate existing
tests and `npm run build`. Report baseline failures separately and investigate
them before deciding they are unrelated.

Deliver an inventory of screens/states actually inspected, concrete changes,
matched before/after screenshots, verification results and remaining gaps.
Keep all evidence synthetic. Do not claim the application is fully reviewed or
perfect when some screens or states were not inspected.
