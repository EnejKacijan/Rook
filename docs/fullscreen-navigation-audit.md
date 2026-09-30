# Full-screen navigation consistency — 2026-09-29

Current non-monetization candidate; no commit, push, merge or deployment.

## Cause and implementation

`swipePageMotion.js` moved the entire Profile page by the gesture distance, with
an opaque parent and 16px parallax. `firstRunMotion.js` used the same recognizer
but mapped that distance to only 24px of content movement, faded the child to
0.88 and faded the parent in. This exposed both pages' readable text together.
Its button transitions also used that overlapping fade. Profile button Back had
another short 18px/0.96-opacity entrance, independent of its successful drag.

The Profile physical model now lives in `pageStackMotion.js`. Both route/step
gestures and button push/pop use its `physicalStack`: full-width child transform,
opaque pages, existing 16px parent parallax, and the original Profile easing.
First-run motion exports delegate to it; there is no second first-run renderer.
Coach's live history parent uses the same stack without cloning its live scroll
owner. Its obsolete CSS entrance was removed after browser QA caught a second
12px entrance replaying after the shared animation finished.

Gesture recognition remains in `edgeBack.js`: 24px edge, 10px intent, 1.4
horizontal/vertical ratio, 33% distance, or a 56px minimum flick at 0.65px/ms.
The existing standalone-only policy remains. `pointercancel` now also clears
tracking/settling without navigating. Button transitions take 200ms; gesture
settling retains its existing remaining-distance calculation. Reduced motion
does not create a visual snapshot or animated transition.

Tracking coalesces transform writes into one animation frame, with no React
updates or geometry reads per move. Fixed descendants are measured once and
temporarily anchored at their existing position within the moving page. All
inline styles are restored on cleanup. Copies are inert, hidden from assistive
technology, stripped of IDs, and retain current field values and nested scroll.
Live forms are never replaced while dragging. Navigation still calls the same
guarded Back action only after gesture acceptance and settling.

## Actual route/component inventory

| Surface | Classification and behavior |
| --- | --- |
| Profile → Program / Training setup / Preferences / Data & backup | Already used the physical gesture; migrated its renderer and button transitions to the shared owner. |
| Data & backup → Storage diagnostics | Same shared stack; Back first returns to Data & backup, then Profile. Existing focus and scroll restoration retained. |
| Landing → Build a plan with ROOK | Migrated from first-run fade to opaque full-page push/pop. First question returns to Landing. |
| Later questionnaire steps | Migrated; Back reveals the previous question and pops only one step. Existing forward/right-edge policy and answer validation retained. |
| Landing → Import / Scratch setup / Restore | Migrated outer full-page route. Import/Scratch live drafts remain mounted across Landing round trips; Restore retains its intentional close/unmount and busy guard. |
| Coach → Chat history → historical conversation | Migrated button navigation and full-page gesture rendering. The existing live parent, transcript scroll, current conversation ID and draft remain owned by Coach. |
| Active Workout → Today | Existing physical edge renderer now delegates to the same core. This is resumable session navigation, not a new hierarchical form route; its lifecycle, raw-input guard and existing workout transition owner are unchanged. |
| Expanded Edit Plan | Intentionally retains its existing modal expansion/close semantics: it is the same mounted editor expanded from a sheet, not a pushed second editor. Existing semantic Back can use the shared physical renderer; no second draft or history entry was added. |
| Returning-user builder opened from Change plan | Its questions use the shared step stack. Its first Back retains the established return to the **Change plan sheet**, not Landing/Profile. Mixed sheet/page presentation and modal ownership were not reclassified as a new page route. |
| Saved Workouts list / preview / create / edit / save-workout | Sheet or embedded sheet editor, not a full-screen push route in the current app. Vertical sheet primitive and draft/Save semantics retained. |
| Preferences → Logging / Appearance; Training setup detail forms | `Detail` in `ModalLayer` sheet presentation. Not migrated to horizontal full-page motion. |
| Data backup / restore / Delete local data | Normal signed-in `Detail` sheets; vertical interaction retained. First-run Restore is separately classified above. |
| Logged exercises / exercise detail/history / completed workout | `Detail` sheet routes. Nested semantic Back remains inside the sheet; no conversion to page-stack navigation. |
| Import decisions / combine-review / supplemental wizard steps | Scoped content navigation inside their host; existing inline renderer remains distinct from full-page and vertical sheet motion. |
| Illustration / photo / comparison viewers | Fullscreen media modals with pan/zoom, dedicated dismissal and browser-history semantics. Intentionally distinct. |
| Main bottom tabs / completion / account lock / processing | Peer-tab, workflow/result or blocking states, not hierarchical page Back. Existing owners retained. |

No bottom-sheet drag, deletion, backup, account, persistence, plan-generation or
workout-domain implementation was changed for this correction.

## Verification

- **343 tests passed in 15 files**: first-run routes/steps, Profile paths, physical
  stack, edge recognizer, semantic selection, step Forward, plan-builder entry,
  diagnostics, Coach lifecycle/scroll, Active Workout Back/Resume, Today resume,
  Delete local data, shared bottom-sheet contract and completion navigation.
- **24 Chromium combinations passed**: 320/390/430px × Standard/Premium ×
  Light/Dark × normal/reduced motion. Native Chromium touch dispatch tests slow
  tracking, short cancellation, committed Back, short fast flick, pointercancel,
  repeated entry, retained forms, nested question and diagnostics hierarchy.
  Tracking asserts exact displacement and opacity 1 on both pages.
- Full-app Coach history QA passed: empty/single/many/long titles, scroll
  retention, read-only history, unchanged current conversation and draft.
- **12 WebKit combinations passed**: all three widths and four themes, with
  synthetic touch events, exact tracking, opaque parent/child, unchanged footer
  vertical position, cancellation and button Back. Screenshots/results are under
  `artifacts/fullscreen-navigation/`; these are browser automation, not a
  physical-iPhone measurement.
- Production build and `git diff --check` passed. No pre-existing test failures
  were encountered in the checks run. Existing >500kB chunk-size warning remains.

Task files: `src/pageStackMotion.js`, `src/swipePageMotion.js`,
`src/firstRunMotion.js`, `src/FirstRunNavigation.jsx`,
`src/firstRunNavigation.css`, `src/edgeBack.js`, `src/App.jsx`, `src/coach.css`,
`src/pageStackMotion.test.js`, `src/FirstRunNavigation.test.jsx`,
`src/edgeBack.test.js`, `scripts/page-stack-navigation-qa.mjs`,
`scripts/coach-history-qa.mjs`, and this audit. Existing worktree edits in these
files were preserved; pre-task snapshots are in the ignored artifact directory.

Remaining owner check: actual iPhone standalone drag/release feel, OS interruption,
safe areas and native keyboard/viewport behavior. In particular, compare slow
Landing-builder Back with Profile-program Back, cancel midway, then commit and
reopen the builder. Automated touch success does not establish physical-device
smoothness or native keyboard behavior.
