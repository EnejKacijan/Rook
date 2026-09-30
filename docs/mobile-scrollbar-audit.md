# Mobile scrollbar presentation audit

Candidate: `release/non-monetization-fixes`, 2026-09-29. No scroll ownership,
navigation, domain, persistence or viewport-geometry changes are part of this pass.

## Policy

`src/scrollbarPresentation.css`, imported by the shared overrides stylesheet, owns
scrollbar decoration for an explicit allowlist of ROOK vertical content surfaces.
It uses ROOK's existing `hover: none`, `pointer: coarse`, `max-width: 768px`
convention. Only normal-contrast, non-forced-color touch layouts opt in. Narrow
mouse windows, desktop, increased contrast and forced colors retain native bars.
There are no new overflow rules, scroll wrappers, event handlers or body locks.

The old unconditionally hidden Coach/sheet/priority scrollbars, width-only Active
Workout document rule and picker-specific thin bars now use this policy.

## Inspected owners

Runtime measurements use real components in Chrome and WebKit with isolated local
QA data. `artifacts/landing-scroll-polish/owners.json` records computed overflow,
actual scroll range, scrollbar presentation and horizontal overflow. An expanding
`.screen` with `overflow: auto` and equal client/content heights is not a second
scrolling viewport. Long document pages continue to use `document.scrollingElement`.

| Surface | Actual owner / ownership contract | Treatment | Exception or qualification |
| --- | --- | --- | --- |
| Landing | Document (`html`); `.entry-v2` expands with its content | Shared mobile policy | No custom indicator or duplicate scrolling viewport found. Native iOS viewport indicator suppression is not guaranteed. |
| First-run builder | Document on expanding steps; `.onboarding-content` on fixed-height priorities; bounded `.onboarding` when applicable | Shared policy for each established owner | Age selection popup retains native affordance; multiline input internals excluded. |
| Returning plan builder | `.onboarding` inside editor-page modal; priorities content retains its own established scroll area | Shared policy | Footer, keyboard geometry and existing clipping boundaries unchanged. |
| Today | Document; summary `.screen` expands | Shared document policy | Calendar paging is a transformed track, not a scrollbar target. |
| Active Workout | Document; bounded `.up-next-queue` when queue exceeds its cap | Shared policy | Queue has a separate intentional range; no logger, timer or gesture changes. |
| Profile hub / Program / Training / Preferences / Data & backup / Diagnostics | Document on long pages; short pages have no range | Shared document policy | Diagnostics `pre` retains its independent native scrollbar. Runtime sampled hub, Training and Data & backup; remaining variants inspected in source. |
| Profile training setting sheet | `.profile-setting-scroll`; panel itself clips | Shared policy | Sticky header/footer and sheet viewport contract unchanged. |
| Progress / workout history overview | Document | Shared document policy | Existing charts/layout are unchanged. |
| Logged exercises / exercise-history detail | Modal `.screen.detail-screen` | Shared policy | The backdrop and background document remain locked by existing modal logic. |
| Coach conversation | `.coach-scroll`; fixed root is not a scroller | Shared policy | Composer textarea excluded; no follow/anchoring code changes. |
| Coach history | `.coach-history-scroll` | Shared policy | Retained conversation behind the history surface has its own saved position, not duplicate visible content. |
| Add / Replace / exercise picker | `[data-exercise-search-scroll]`; outer search body/panel clips | Shared policy | Add measured at runtime; Replace and other shared-helper consumers inspected in source and covered by search-sheet regression tests. |
| Freestyle Exercise preview | `.queue-exercise-preview` | Shared policy | Source-inspected; footer/safe-area geometry unchanged. |
| Saved workouts / saved preview | `.saved-workout-list` / `.saved-workout-preview` | Shared policy | Independent list position restored on Back. |
| General bottom sheets / confirmations | Modal `.screen` or `.sheet`; replacement/superset body `.sheet-scroll`; `.workout-confirm` | Shared policy | Existing height caps and body lock remain untouched. |
| Plan editor / import choice lists | Existing reorder scope, scratch results, picker results, action body, import-decision body, history-match list | Shared policy | Source-inspected vertical list owners; no new nested wrapper. |
| Textareas, diagnostics/export `pre`, CSV/table samples, image viewers, provider surfaces | Their existing native scroll owners | Retain native bars | Input editing, wide-content discoverability, image interaction and external UI are outside this policy. |

Horizontal overflow is audited separately. The sampled settled app owners and
landing matrices have no unintended horizontal range; horizontal tables/previews
are not included in the hide policy. Transition snapshots are excluded from
settled geometry measurements. No duplicate-owner defect was confirmed.

## Landing and Restore boundary

Four secondary choices now share `EntryActionRow`: Profile's `.list-row` content
hierarchy plus the existing `ExerciseNavigationButton` transient-feedback
primitive. The chevron is decorative, inside the same native button. Existing
callbacks and no-plan failure handling are unchanged. The generated-plan primary
keeps its accented outline. Native clicks/keyboard activation keep ownership;
feedback does not capture pointers or prevent scrolling.

Before this pass, `.entry-demo` had a 1px bottom border, `.entry-actions` had a 1px
top border after 22px of margin, and Restore itself had another 1px top border.
The footer `.entry-actions` now owns the sole boundary. Demo bottom and button top
borders are removed at source; footer margin is zero. Demo's existing 19px bottom
padding separates its note from the line. Restore retains its 46px minimum target.
The internal demo separators remain intact.

## Physical-device scope

The supplied five-second recording was inspected. Current candidate DOM/CSS and
computed geometry establish that Landing scrolling belongs to the document, not a
custom scroll widget. Pixels alone do not identify the exact iOS/browser-managed
indicator in the recording, or prove that author CSS can suppress it in that PWA.

No new physical iPhone measurement was performed. Owner still needs to capture
Landing at rest/during scroll, test each route and Back, and verify sheet/Coach
scrolling on device. Chrome emulated touch and desktop WebKit are not physical
iPhone evidence. If iOS retains a transient viewport indicator, keep native
scrolling; do not restructure the app to remove it.

## Validation

- 48 Landing combinations passed: Chrome + WebKit, 320/390/430px, four themes,
  normal/reduced motion. All four secondary rows exceed 44px, wrap safely, keep
  one target, and expose a decorative chevron. One Restore boundary remains.
- Chrome CDP native touch scroll/cancel did not activate a route or leave pressed
  feedback. Both engines passed edge-of-row taps, exact callback counts, real
  Import/Scratch/no-plan destinations, Restore opening and Landing Back restoration.
- Both engines passed the actual-app owner audit, start/end reachability,
  horizontal containment, saved-list Back and Coach position preservation.
- Both engines retained default bars in narrow/large mouse viewports, forced
  colors and increased contrast. Keyboard focus and Enter navigation passed.
  Separate probes confirmed textarea/pre/table exceptions remain native and wide
  table/pre content still scrolls horizontally.
- Existing plan-builder entry QA passed all 12 width/theme cases, including the
  returning questionnaire, live draft, routes and saved workouts.
- Existing bottom-sheet drag and Coach-history browser suites passed.
- 171 tests passed across 13 focused navigation/feedback/Coach/search-sheet/modal/
  viewport/swipe test files. Production build and `git diff --check` passed.
- Pre-existing issues: bottom-sheet QA still expected the earlier import-route
  label; its selector now also accepts the current `Bring my plan`. Vite's existing
  >500kB chunk-size warning remains. No remaining tested failure.

## Files changed in this pass

- `src/App.jsx` — local shared secondary Landing row; existing callbacks retained.
- `src/landing.css` — row layout/focus, one Restore boundary.
- `src/scrollbarPresentation.css` — new shared, conditional presentation policy.
- `src/overrides.css` — imports policy; removes legacy sheet/confirmation hiding.
- `src/coach.css` — removes unconditional scrollbar hiding.
- `src/onboarding-controls.css` — removes per-step scrollbar hiding.
- `src/activeLoggerTouch.css` — removes width-only root scrollbar hiding.
- `src/freestyleQueuePicker.css` — removes picker-specific scrollbar decoration.
- `src/exerciseRowFeedback.css` — comment reflects the additional navigation-row consumer.
- `scripts/landing-scroll-polish-qa.mjs` — focused browser matrix and owner audit.
- `scripts/bottom-sheet-drag-qa.mjs` — current import-route label in QA selector.
- `docs/mobile-scrollbar-audit.md` — this audit and evidence scope.

Candidate phone server was verified as `0.0.0.0:4275` in the current worktree.
Port 5173 serves a different, older worktree. Existing unrelated local changes
were retained. HEAD remains `3d95bdc5dab4ed127a4f04ee24e448311c946bc0`.
