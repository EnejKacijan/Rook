# Bottom-sheet usage audit — 2026-09-29

Scope: current non-monetization release worktree. No commit, push or deployment.

## Findings and shared ownership

The previous audit missed actual implementations: `ModalDragHandle` discovered
headers only below `.screen` and `.workout-confirm`, excluding `.sheet` roots.
Several compact sheets worked only because they manually mounted a second,
independent `SheetDragHandle`. Other `.sheet` roots had neither owner. Account
confirmation had a modal wrapper but no discoverable header. Plan Editor's
superset picker also mounted a raw `.modal-layer` instead of `ModalLayer`.

All true sheets now use `ModalLayer → ModalDragHandle → createSheetDragMotion`.
Compact headers may reserve a `SheetHandleSlot`; it is only layout, with no
gesture handlers, indicator, close callback or timers. The real shared handle
is portaled into it. The independent `SheetDragHandle` implementation is gone.
Header discovery observes actual DOM replacements, including transitions inside
a child component, so there is exactly one owner after nested navigation.

Contract:

- 38 × 4 CSS px indicator, within a header hit area at least 44px high.
- Direct `translate3d` tracking, one latest position per animation frame.
- Shared backdrop opacity `1 − distance / (height × 0.65)`, clamped at zero.
- Shared threshold: `min(140px, height × 0.24)`; velocity dismissal at ≥0.55px/ms
  requires at least `min(72px, threshold × 0.72)` travel. Pointer and touch use
  the same predicate.
- Shared 180ms ease-out cancellation and guarded modal dismissal; reduced motion
  uses immediate settling. No extra native-handle exit timer before modal exit.
- Shared touch direction, scrolling, search-keyboard and edge-back arbitration.
  An explicit handle drag remains available with scrolled content.
- Pointer cancellation, lost capture, touch cancellation, page/visibility/resize
  interruptions and unmount clean up pending frames, transforms and scrim.
- Existing viewport ownership, per-surface safe-area/footer insets, focus and
  before-close guards remain in place.

## Migrated / corrected usage

| Actual component / route | Previous gap | Current owner |
| --- | --- | --- |
| `LogoutConfirmSheet`, `Detail('logout-confirm')` | `.sheet` with `SheetHeader` was excluded | Shared header discovery |
| `Detail({todayFreestyle})` / `FreestyleEntry` | Same `.sheet` exclusion | Shared header discovery |
| `TodayExerciseActions` options and destructive confirmation branches | Bare X, no header/handle | Canonical compact header + shared owner |
| `ExerciseNoteEditor` | Compact header existed, `.sheet` excluded | Shared header discovery |
| `ActiveSuperset` manage-pair, locked and no-candidate branches | Bare X, no header/handle | Canonical compact header + shared owner |
| `AccountConfirmation` (sign out, return to saved profile, separate profile) | Modal wrapper but no header | Canonical compact header + shared owner; actions unchanged |
| `PlanEditor` nested `SupersetPartnerPicker` | Raw modal div, separate dismissal/focus lifecycle | `ModalLayer` portal; nested cancel/Back stays separate from Save |
| `WorkoutConfirmation` (finish early / incomplete exercise) | Independent native handle | Shared owner via layout slot |
| `SupersetPartnerPicker` (Active Workout create and Plan Editor create) | Independent native handle | Shared owner via layout slot |
| `RestTrainingSheet` | Independent native handle | Shared owner via layout slot |
| `ChangePlanSheet` | Independent native handle | Shared owner via layout slot |
| `WorkoutOptionsSheet` and consumers: `ActiveWorkoutOptions`, restart confirmation, `ActiveExerciseOptions`, `UpNextExerciseOptions` | Independent native handle | Shared owner via layout slot |
| `Replace` (compatible options and all-exercises search) | Independent native handle | Shared owner via layout slot |

## Already canonical

These were checked through their actual modal wrapper and header, including
conditional destinations. They retain the shared owner.

| Surface / components | Presentation path |
| --- | --- |
| Calendar, both Today and no-plan Today | `ModalLayer → MonthCalendar → SheetHeader` |
| Train Today / occupied-day conflict / displaced-workout date chooser | `Detail → UseWorkoutTodaySheet → Header` |
| Temporary schedule, missed-workout recovery, move destination, skip/review/result steps | `Detail → FlexibleWeekSheet → Header`; Train Today child uses the same owner |
| Today overflow, repeat/delete-workout chooser | `TodayActionsSheet → SheetHeader` |
| Delete completed workout | Nested `ModalLayer → CompletedWorkoutDeletion` confirmation header |
| Completed workout, options and history correction | `CompletedWorkoutDetail`, nested options modal, `HistoryCorrectionEditor`; correction dirty-close guard preserved |
| Saved Workouts library, preview, create/edit, save-current-workout, option/deletion flow | `SavedWorkouts` header; nested options use `ModalLayer`. Embedded library/editor inherits its picker header |
| Freestyle Add Exercise search, preview and embedded Saved Workouts | `FreestyleQueuePicker` shared header; no second sheet owner |
| RIR choice | Active Workout's nested `ModalLayer`, `SheetHeader` |
| Plate calculator and bar/plate setup | `PlateCalculatorSheet`, nested destination retains the header and same owner |
| This week | `Detail('week') → SheetHeader` |
| Training priorities and restrictions | `TrainingPriorities`, `TrainingRestrictions` headers |
| Personal details and individual training settings | `ProfileDetails`, `ProfileTrainingSetting` headers |
| Logging and Appearance | `Logging`, `Appearance` headers; Appearance choices remain inline |
| Plan import, Scratch setup/editor and sheet-mode Edit Plan | `ImportPlan`, `ScratchPlan`, `EditPlan` headers; `PlanEditor` content inherits its presentation owner's header |
| Plan workout options and custom-exercise creation from editor | Existing nested `ModalLayer` portals with headers |
| Stop following plan | `StopFollowingPlanSheet → SheetHeader` |
| Back up ROOK / Back up first and Restore backup, including success | `BackupSheet`, `RestoreBackupSheet` headers |
| Gym profiles and profile editor | `GymProfilesSheet` headers |
| Training block overview/edit, block review/next-block/replacement | `TrainingBlockScreen`, `BlockReviewSheet` headers |
| Plan history list and version detail | `PlanHistoryScreen` headers |
| Private photo timeline | `WorkoutPhotoTimelineScreen → SheetHeader`; viewers are separate fullscreen surfaces |
| Progress focus, weight opt-in, weight entry/history, logged exercises, exercise history/details | Corresponding `Detail` branches and headers |
| Export workout/session data; import workout history source/loading/setup/mapping/review/success | `ExportSheet`, `WorkoutHistoryExport`, `HistoricalWorkoutImportScreen` headers |
| Custom exercises list/editor | `CustomExercisesScreen` header; inline delete confirmation stays inside it |
| Plan repair review | App's existing `ModalLayer` and `SheetHeader` |
| Expert Lab and corrected-plan review, when presented as detail | Existing direct `.detail-header` |

## Intentionally not bottom sheets

| Surface | Reason |
| --- | --- |
| Landing, questionnaire/plan builder, first-run generated/import/Scratch pages | Full-page navigation; page Back/edge navigation semantics |
| Fullscreen Edit Plan (`presentation="editor-page"`) | Explicit full-page editor presentation |
| Exercise illustration viewer (`presentation="fullscreen"`) | Fullscreen image viewer with its own image/navigation semantics |
| Private workout photo viewer and `PhotoComparisonViewer` | Fullscreen pan/zoom/compare viewers, no bottom-sheet chrome |
| Coach conversation history | Full-height secondary chat page (`inset:0`), not a bottom-origin sheet |
| `PlanProcessing` / `.building-overlay` | Centered blocking processing dialog, not a draggable bottom sheet |
| Account lock, Profile subpages, storage diagnostics | Full-page/account/navigation surfaces |
| `HelpPopover` | Anchored tooltip/popover without bottom-sheet presentation |
| Restriction impact, custom-exercise deletion, history correction/discard, Saved Workout and restore inline confirmations | Inline content inside an existing page/sheet, not independent overlays |
| Browser-native confirm/file picker/share UI | Platform-owned dialogs, not ROOK-rendered sheets |
| Rest timer, toast/Undo feedback, fixed action footers, reorder preview | No modal scrim or bottom-sheet navigation; retain their own UI purpose |

No remaining known non-canonical **true ROOK bottom sheet** was found in the
current source inventory. The search included `createPortal`, `ModalLayer`,
raw `.modal-layer`, dialog/alertdialog roles, scrims, fixed overlays,
bottom-origin transforms and rounded-top surface styles; component naming alone
was not used to decide coverage.

## Safety and verification

Files changed for this task:

- `src/App.jsx`, `src/overrides.css`, `src/sheetMotion.js` (ownership comment).
- `src/AccountSyncPanel.jsx`, `src/accountSync.css` (confirmation chrome only).
- `src/DeleteLocalDataSheet.test.jsx`, `src/BottomSheet.contract.test.jsx`.
- `src/ActiveWorkout.confirmation.test.jsx`, `src/FreestyleCancellation.test.jsx`
  (canonical handle selector and animation-frame assertions).
- `scripts/bottom-sheet-drag-qa.mjs` and this inventory.

The pre-existing worktree changes were retained. Task-local snapshots and
comparison output are under the ignored artifact directory.

`LogoutConfirmSheet`, `BackupSheet`, and `RestoreBackupSheet` implementations
were compared directly with the pre-task worktree snapshot and are unchanged.
Only explicit `DELETE LOCAL DATA` calls the existing deletion routine.
Dismissal does not call it, sign out, delete cloud data, or create a backup.
`BACK UP FIRST` still enters the existing backup flow. Existing content/scope,
success callback and failure/retry behavior are retained.

Automated results and screenshots are in
`artifacts/bottom-sheet-complete-audit/`; the targeted tests include
`DeleteLocalDataSheet.test.jsx` and `BottomSheet.contract.test.jsx`.

Final results:

- 314 distinct passing tests across 20 targeted/regression files. The last safety
  run passed all 42 Delete Local Data and shared-contract cases; this includes
  a touch drag starting on the destructive button and suppression of its
  trailing click.
- 292 passing Chromium/WebKit cases: 320/390/430px, Standard/Premium Light/Dark,
  reduced motion, direct pre-release transform and backdrop measurements,
  cancellation/dismissal, plus a 32-route rendered inventory.
- 13 native Chromium touch-pipeline surface cases, including scrolled-content
  arbitration and interrupted gestures. These are emulated input, not iPhone.
- Full-app bottom-sheet audit, modal-scaffold audit and imported/generated
  Plan Editor superset QA passed. The latter confirms nested Escape keeps the
  underlying editor open and pairing is still draft-only until Save.
- Production build and `git diff --check` passed. Existing build warning about
  chunks exceeding 500kB remains; no failing regression tests remain in the
  checks run.

The browser harness uses production components with synthetic fixtures. The
full-app bottom-sheet audit also opens the real Profile → Data & backup route
and checks unchanged local storage after safe exits. Actual deletion is tested
with a mock, never against the owner's stored data.

Browser/desktop touch testing is not a physical-iPhone measurement. Remaining
owner check: foreground one-finger pull/cancel/dismiss and safe-area appearance
on physical iPhone, including return from Back up first. No destructive tap is
needed for that physical gesture review.
