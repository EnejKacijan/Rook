# Bottom-sheet action footer audit

Scope: production sheet routes in `App.jsx`, their nested editors, and standalone review sheets. Classification is per state, not per route: opening a picker does not imply that its later review is also a picker.

| Surface/state | Class | Action treatment |
| --- | --- | --- |
| Edit plan; imported/generated plan review; manual plan editor | D | Shared Save/accept + existing Back/Edit Notes |
| Correct History editor and correction review (entry: Edit workout) | D | Shared Save Changes + Cancel/Back to Edit |
| Adjust Today mode/configuration/replacement selection | A | Existing picker/configuration actions |
| Adjust Today generated, unapplied review | D | Shared Use This Workout + Cancel; error stays with action |
| Applied adjustment viewer | B | Existing Restore Original/Done |
| Restore Original confirmation | C | Existing compact confirmation |
| Flexible Week root/session/date/availability choices | A | Existing selection/review actions |
| Flexible Week proposed schedule review | D | Shared Use This Schedule + Cancel |
| Flexible Week no-change/capacity explanation | B | Existing Edit Days/Done |
| Gym Profiles list/current-gym selection | A | Existing rows |
| Gym Profile create/edit | D | Shared Save Gym; existing delete entry retained |
| Gym deletion confirmation | C | Existing confirmation, including required replacement default |
| Smart exercise substitutions, wider search | A | Selecting replacement is the action |
| Plate calculator | B | Calculation/alternative selection unchanged |
| Plate setup (both entry paths) | D | Shared Save Plate Setup |
| Plan History list/version diff | B | Existing drill-in/restore entry |
| Restore plan version confirmation | C | Existing confirmation |
| Training Block overview; Block Review summary/outcomes | B | Existing navigation/review actions |
| Training Block editor | D | Shared Save Block |
| Next Block / Repeat Block proposal | D | Shared Start Next Block/Repeat Block + Cancel |
| Next Block replacement picker | A | Existing immediate choice |
| Custom exercises list | A | Existing rows/create entry |
| Custom exercise create/edit | D | Shared Create Exercise/Save Details; delete entry retained |
| Custom exercise deletion | C | Existing confirmation |
| Historical workout import source/file/mapping | A | Existing file/mapping actions |
| Historical workout import final review | D | Shared Import Workouts |
| Historical workout import result | B | Existing summary |
| Export workout plan | B | Preview/share/copy/download utility; no single commit |
| Export workout history configuration | D | Shared Export/Share-Download |
| Backup creation/file handoff | B | Existing local export utility |
| Backup restore file selection | A | Existing file choice |
| Backup restore summary confirmation | C | Existing replacement confirmation |
| Backup restore result | B | Existing result |
| Training Restrictions editor | D | Shared Save Restrictions |
| Training Restrictions plan-impact review | D | Shared existing Save & Apply/Review/Pause + Edit Restriction |
| Training priorities | D | Shared Save Preferences/Priorities; existing follow-up action |
| Profile details and training preference editors | D | Shared Save Details/Availability/Setup |
| Logging & increments; Appearance | A | Changes apply immediately; no invented Save |
| Workout completion and completed workout detail | B | Existing completion/photo/note/History hierarchy |
| Workout photo timeline, private viewer and compare | B | No persistent commit action added |
| Photo selection for comparison | A | Existing selection flow |
| Photo delete; logout; workout restart/discard | C | Existing confirmations |
| Weekly schedule, exercise performance, exercise illustration, weight history | B | Existing informational views |
| Progress focus / weight opt-in / Today exercise actions / active exercise options | A | Existing choices |
| Body-weight check-in editor | D | Shared Save, existing delete entry |
| Body-weight unusual-change confirmation | C | Existing Save Anyway confirmation |
| Exercise note editor | D | Shared Save and existing Remove Note |
| Superset partner selection with explicit Create Superset | D | Shared Create Superset |
| Active superset management without a final staged commit | A | Existing immediate actions |
| Rest-day training choices and Change Plan root | A | Existing navigation choices |

## Shared implementation

`SheetActionFooter.jsx` and `sheetActionFooter.css` consolidate the existing sticky approach. The established sheet remains the scroll owner: this avoids changing reorder coordinates, the collapsing header observer, or swipe/back handling. The footer stays in sheet flow, uses `position: sticky` (not viewport fixed), reserves its own normal-flow height, and uses an opaque `--rook-bg` surface. The shared bottom padding is 12px plus `env(safe-area-inset-bottom, 0px)`, action gap 8px. Existing button heights and disabled styles remain authoritative.

This is the explicitly permitted sticky/overlay variant, not a new header/body grid scaffold. Body scroll-padding tracks actual footer height through ResizeObserver. Its normal-flow position leaves final body content above it at the end of scrolling. Focus handling reveals inputs above the action area. A reduced, unzoomed visual viewport lifts/resizes the containing modal; viewport dismissal clears those temporary styles. Full-page onboarding reuse is not made sticky.

No plan/history persistence logic, logging geometry, action callback, or dirty-state policy is changed.

## Verification evidence

Runtime measurements and screenshots: `artifacts/sheet-action-footer/`. The matrix covers 320/390/430 × Standard/Premium × Light/Dark, long Edit plan top/middle/bottom, disabled Save, reduced viewport, and 34px safe-area substitution. Additional existing feature QA covers review/save/error/reload and destructive/dirty dismissal paths.

Physical iOS/Android keyboard, home indicator, and installed-PWA behavior remain **UNVERIFIED**. Desktop viewport simulation is not physical-device proof.

Existing independently scrolling scaffolds (profile training settings and superset partner selection) use the same footer primitive with its `separate` layout flag, retaining their body container and gutters. Imported-plan review no longer retains the old viewport-fixed primary button inside the shared footer.

## Results and review

- Edit plan: previously Save Changes required reaching the document end; now Save Changes and Back remain reachable at top/middle/bottom without shrinking any exercise card.
- Edit plan measured final-body clearance: **24px** in all 12 width/theme combinations. In the 844px viewport, the normal two-action footer occupied y=710–844 and its primary CTA y=722–780 (58px high). Synthetic 34px safe-area padding cleared the final action by at least 34px. The reduced 480px viewport kept the primary and focused name input visible.
- Opaque surfaces and disabled semantics passed Standard Light/Dark and Premium Light/Dark checks. No accent was added to informational/picker surfaces.
- New unit tests cover disabled/enabled callback preservation, secondary navigation, exclusion cleanup, a single error message, and the independent-scroll scaffold variant. New runtime QA covers long scroll, final clearance, reduced viewport/focus and safe-area substitution. The superset QA now waits for expansion before counting Create Superset (rather than racing React rendering), and captures its existing independently scrolling footer.
- Runtime QA passed: footer matrix; Correct History; Next Block/Block Review; Adjust Today; Flexible Week; long available-days/carry review; Remove/Undo; Gym Profiles; Custom Exercises/Aliases; Plate Calculator; plan reorder; imported/generated supersets; import review; Training Restrictions plan application.
- External review: **one consolidated visual review round**, uploaded in two batches (182 original PNGs). GPT-5.6 Sol **Extra High was visibly selected**. Verdict: **APPROVED — no meaningful visual/UX issues remain.**
- Review: https://chatgpt.com/c/6a9d5c84-14a4-83eb-8241-939a6cd445de
- No commit or push.
- Final complete suite: **1041/1041 tests, 49/49 files passed**, using `npm test -- --maxWorkers=2`. Default-worker runs intermittently exceeded the existing 10-second limit in the large domain personalization matrix; no timeout or assertion was relaxed.
- Final production build: **PASS**, 414 modules. Existing >500kB bundle-size warning remains.
- `git diff --check`: **PASS**; Git only reports existing LF-to-CRLF normalization warnings.

## Files touched by this pass

- `src/SheetActionFooter.jsx`, `src/sheetActionFooter.css`, `src/SheetActionFooter.test.jsx`
- `src/App.jsx`
- `src/HistoryCorrectionEditor.jsx`, `src/FlexibleWeekSheet.jsx`, `src/BlockReviewSheet.jsx`, `src/WorkoutHistoryExport.jsx`
- `scripts/sheet-action-footer-qa.mjs`, `scripts/package-sheet-action-footer-review.mjs`, `scripts/edit-plan-superset-qa.mjs`
- This audit document.

Other dirty working-tree changes predate this task and were preserved.
