# ROOK quality mission — final local review, 13 October 2026

## Final outcome

Completed the bounded source audit, demonstrated fixes, full regression/build checks, independent review and representative rendered review of CURRENT main `EnejKacijan/Rook`. This is a local handoff, not approval of every screen on physical iPhone or of live cloud/AI services. No P0 was demonstrated.

Corrected current-state ownership, history compatibility, plan-start date ownership, restore/import consistency, nested modal ownership, focused Undo lifetime and asynchronous cleanup. The user's final steering also requested comparison with `rook-companion`: Profile now separates **Training**, **Display** and **Data**, using the existing ROOK modules. No companion domain, renderer, state model or new settings were transplanted.

No push, merge, deployment, remote PR, live account/billing/Firebase access change, owner-data/photo operation, dependency installation or Capacitor change occurred. Physical iPhone/WebKit, installed-PWA keyboard/safe-area behavior and live service integration remain explicit handoff gates.

## Preservation and LOCAL checkpoints

Quality branch `codex/rook-overnight-quality` is in `C:/Users/enejk/.codex/worktrees/rook-overnight-quality/Fitness App`. Original current source/server remains on 4290 in `rook-free-access-release`, HEAD `4ef7491f6d0d975f7f9d0cd9e079c499119764bc`.

The 39 previously approved dirty files were deliberately adopted into baseline `91a73fe56d7a029e7bbafbd330cf9a517295fd55`; they are preserved earlier work, not new overnight fixes. Original tracked binary diff still equals its captured starting patch, and all 39 original files match this baseline after only Git's CRLF/LF checkout translation. A raw comparison against the new-checkout manifest differed for 21 files solely for these line endings; content and captured-diff verification passes. Evidence: ignored `artifacts/overnight-quality/original-preservation.json`.

Main remains `80765c6`, Pro/non-monetization `5eb280c`, iOS `e8c0c17`; no source mutation commands targeted them. Concurrent companion work has its own ongoing commits; our access there was read-only. No `.env`, credentials, private keys, owner records, QA media/logs, dependency tree or build output entered changed tracked paths. No package/dependency file changed.

| Local commit | Verified batch |
| --- | --- |
| `91a73fe` | Adopt approved current local baseline in isolation |
| `aaeecaf` | Workout history compatibility/resume ownership, custom snapshot safety and rotation start boundary |
| `876c4bb` | AI cancellation/image cleanup and late rejected photo-database connection cleanup |
| `d159213` | Focus/pointer pause ownership for Undo timeout |
| `fe33030` | Root/Coach/restore receipt safety, shared modal ownership, unique Add Set IDs, Profile Display grouping and honest adjustment label |
| `d7fa790` | Windows line-ending-safe provenance checks without changing artwork |

The report is committed after these code checkpoints; final branch HEAD is provided in the handoff. Local commits are authorized by the mission; no remote integration is authorized/performed.

## Final verified issues

| Issue | Severity | Exact correction | Evidence / commit |
| --- | --- | --- | --- |
| Late Coach reply overwrites other-tab edits | P1 | Merge only owned pending entry into CURRENT parent state, guarding profile/conversation/entry/request generation, cancellation and existing reply. Persist before publishing; cache identical StrictMode replay, reset status on each rebase. | Actual persistence/unmount proof;15 `Coach.quality` tests; `fe33030` |
| Restore → history import blocked until reload | P1 | Restore had appended an unsaved Manual edit version and mutated its own receipt. Use `planVersion:false`; detach caller-owned transition before normalizers and capture immutable receipt AFTER callback. Save real normalization differences; retain replacement/continuity/stale guards. | Real ZIP/worker browser before/after;4 actual-root/UI regressions; `fe33030` |
| Rapid Add Set duplicate IDs | P1 | Replace millisecond-only ID with existing `uid('set')`. | Two real ReactDOM activations at frozen time, strict reload; `fe33030` |
| Empty completion Resume ignores active optional/reserved preparation | P1 | Shared predicate respects existing one-active-owner contract, optional/repeat/combined owners. | Domain regressions; `aaeecaf` |
| Empty photo-owned historical Resume orphans IndexedDB workout owner | P1 | Conservatively reject unsafe photo-owned empty-resume path; preserve photo-free resume and ordinary reversible completion. No cross-store relinking invented. | Synthetic domain/backup proof; `aaeecaf` |
| Custom/imported snapshot bypasses existing training safety | P1 | Catalog-first, then canonical imported snapshot fallback in start/validation/Today. Built-in identity remains authoritative. | Snapshot + Today regressions; `aaeecaf`/`fe33030` |
| Startup preloads incompatible logging history | P1 | Apply current mode/load/measure compatibility contract rather than ID alone. | Normal/per-side/bodyweight/added-load/reload tests; `aaeecaf` |
| Partial unilateral reuse leaves stale representative reps/carry intent | P1 | Derive canonical representative reps after merging; mark only reused side reps manual, preserve opposite/unknown fields and exact Undo. |4 focused previous-values regressions; `aaeecaf` |
| New plan invents pre-start Monday missed workout | P1 | Remove weekday fallback only before VALID explicit rotation anchor. Preserve legacy/no-anchor mapping, actual history and saved active IDs. |10 tests + before/after calendar/early-start reload; `aaeecaf` |
| Nested Escape closes parent and child | P2 | Effective modal/ancestor inert ownership, only top layer handles Escape/Tab. | Actual single-Escape + shared tests; `fe33030` |
| Swapped/headerless destination leaves duplicate role/stale label | P2 | Keep one current dialog semantic owner; exclude effectively hidden/inert focus stops. |5 shared modal regressions; `fe33030` |
| Focused Undo expires | P2 | Independent focus/pointer pause owners, retain remaining time until both release. |10 new +9 existing gesture tests; `d159213` |
| Pre-cancelled import still reaches auth/API | P1 | Inherit abort state and check before status/auth/fetch and after awaited preflight. | AI lifecycle regressions; `876c4bb` |
| Failed image decode/draw/encode leaks resources | P2 | Bitmap/object URL cleanup in finally, success and failure. | Lifecycle tests; `876c4bb` |
| Rejected database open later retains unowned connection | P2 | Close only rejected request's late connection; do not affect valid retry. |5 IndexedDB regressions; `876c4bb` |
| KEEPING includes replaced exercises | P2 | Rename full resulting list WORKOUT PREVIEW; keep CHANGES and domain result. | Rendered review/delta test; `fe33030` |
| Unchanged Windows checkout fails provenance | P3 | Allow ONLY CRLF/LF equivalence. Geometry/color/other whitespace/new/missing/duplicate inventory still fail. No assets/manifests regenerated. |5 tests + full integrity audit; `d7fa790` |

## Profile and companion comparison

Read current local companion `Profile.tsx`/`PreferencePanels.tsx` and rendered its memory-only Profile/Companion & display. Adopted the useful organization by purpose and current-state summary. Its card/avatar, bedtime, ambient weather, Rook activity, water/motion/text-setting implementations belong to that separate application and were not copied.

- **Training:** Training setup; Workout preferences (same existing `preferences` child, training style/logging/units/increments).
- **Display:** current Personal Theme/appearance and illustration visibility summary; existing Appearance and installed-PWA app zoom are here. Same staged preview/Apply/Cancel/persistence implementation.
- **Data:** existing Data & backup. Account & Sync stays independently grouped.
- Existing Program, shared chevrons, whole-row targets, per-section separators, root/Back/tab-re-tap/dirty guards and account logic remain. Final section row has no bottom separator; nav boundary remains. No writes simply from navigation.

Ten grouping regressions plus the installed-page-zoom integration test check callbacks, one Appearance modal/focus restoration, summaries/Apply, illustration-only mutation, unchanged timer/history, canonical Back/Escape/tab reset and Data isolation.

## Coverage matrix

PASS applies ONLY to the named state and evidence type. Source/regression coverage is broader than rendering. Evidence paths below are under ignored `artifacts/overnight-quality/`, except named `src/` tests.

| Feature | Screen/state | Visual | Functional | Main issue | Severity | Change | Evidence | Commit | Remaining risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A First run | Landing/Build/saved entry | Pass | Pass | No new landing defect | — | Preserved | real first-run/create journey | baseline | Native keyboard |
| A Import | Initial Bring/local preview/accept | Preview reviewed; final browser acceptance Not Reviewed | Pass actual-root regression; browser accept Not Tested | IAB action completion stopped after native confirmation, not reproduced as product bug | — | Guard retained | full actual-root probe +55 existing first-run/import checks | baseline | Native/tool confirmation qualification |
| B Builder |8 steps,3-day preview/accept/first session | Pass390 | Pass | Phantom pre-anchor Monday | P1 | Valid rotation boundary | `rotation-after`, `rotation-reload-started-early`;10 tests | `aaeecaf` | Other branches source/tests only |
| B Import plan |2 day/4 bodyweight notes, targets/source links | Pass DOM | Parser/review Pass; native existing-plan acceptance Not Tested | Existing native confirmation not exposed | — | No bypass | actual preview + import suites | baseline | Live provider/existing-plan physical approval |
| C Today | Planned/rest/missed/moved/active/completed/early-start | Pass | Pass | Anchor/snapshot safety | P1 | Shared canonical fixes | real DOM/screens, Today/domain tests | `aaeecaf`/`fe33030` | Physical midnight/locale |
| C Optional | Conditioning/cardio/mobility ownership | Not Reviewed this rendered pass | Pass regression | Optional owner omitted by Resume | P1 | Predicate only | optional/conditioning suites | `aaeecaf` | Physical optional journey |
| D Schedule | Valid move/review/apply, missed eligibility/summary | Pass | Pass; Undo regression-covered | No empty missed action offered | — | Preserved | real picker/summary; schedule/Undo tests | baseline | Native drag/date conflicts |
| E Logger | Normal/BW, log/rest/next/skip/Keep training/reload | Pass | Pass | IDs/history startup compatibility | P1 | UID/compatibility | real journeys, settled Keep training,16-case style matrix | `aaeecaf`/`fe33030` | Physical keyboard/font scaling |
| E Advanced logger | Notes/supersets/advanced rest/reorder/raw drafts | Not Reviewed comprehensively in browser | Pass regression | No additional demonstrated defect | — | Preserved | full logger/notes/raw/superset suites | baseline | Remaining rendered branches |
| F Replacement | Real T-Bar lookup,10/8, explicit per-set values/Log/Undo | Pass | Pass | Reuse existed in approved baseline; partial-side/start edge cases found | P1 | Existing reuse retained, domain edges fixed |40×10,45×8 and immediate Undo; replacement suites | baseline/`aaeecaf` | Native rapid touch; no-history/identity cases regression |
| G Completion | Early/short/long, Done/details/Continue | Pass | Pass | Unsafe empty historical resume | P1 | Predicate only; approved primary Done retained | real finish→Continue→finish→Done;16 case/short matrix | baseline/`aaeecaf` | Live photo-owned physical reversal |
| H Saved workouts | Create/edit2 sets/Save/MyWorkouts/Start/Log/Finish/reload | Pass | Pass | No additional defect | — | Preserved | real375journey, saved suites | baseline | All clone/edit variants not rendered |
| I Picker | Editor search, freestyle Preview/Add, replacement search | Pass DOM/screens | Pass | No additional defect | — | Preserved | bodyweight/T-Bar real controls; picker/custom suites | baseline | Long catalog/native keyboard |
| J Progress | Sparse/rich overview,25progressions, history/chart point | Pass | Pass | No extra semantic color migration justified | — | Preserved | actual19→25kg chart/sparse history; progress suites | baseline | Huge archive/physical charts |
| K Photos | Timeline/viewer/boundary/short/flick/next/ViewWorkout/middle delete | Pass | Pass exercised controls | Late DB connection and unsafe empty resume | P1/P2 | Lifetime/predicate fixes | real-root correct target/next-after-delete;16 case final viewer | `aaeecaf`/`876c4bb` | Physical swipe/pinch/native Save |
| K Compare | Two-photo pick/divider keyboard51%/zoom/side-by-side/close | Pass390 | Pass exercised controls | No additional defect | — | Preserved | `photo-comparison-390`; comparison suites | baseline | Native pinch/divider |
| L Profile | Grouped root/long synthetic email/sync/Display/Appearance | Pass | Pass | Display mixed into preferences | P3 polish | Existing module grouping |16final cases, main Profile/Display,25grouping/zoom tests | `fe33030` | Installed-PWA zoom visual check |
| L Recovery | ZIP create/save/validate/restore/immediate Hevy/duplicate | Pass | Pass | Mutated restore receipt | P1 | No fake version, immutable receipt | real ZIP + worker after-fix screen;4 real UI/transaction tests | `fe33030` | Phone quota/private storage |
| L Account | Anonymous/unavailable + synthetic linked/synced UI | Pass inspected states | Boundary/outbox regressions Pass; live Not Tested | Secret-free quality build has no live services | — | Logic unchanged | real unavailable state/mock-linked UI/current sync suites | baseline | Google/signout/remote reconciliation |
| M Equipment | Required radio/preset/empty/no-op/custom review/apply/short large | Pass | Pass | KEEPING misleading | P2 | WORKOUT PREVIEW label only |16 case; apply1/default unchanged; equipment suites | baseline/`fe33030` | Physical drag/scroll |
| N Coach | Offline/history/re-tap, asynchronous tab-unmount/rebase | Pass offline/history | Real-persistence regressions Pass; live Not Tested | Frozen late reply/replay status | P1 | Owned-entry current-state transaction | actual root + StrictMode/rebase tests/review | `fe33030` | Live conversation/latest-scroll feel |
| Shared mobile | Modal roles/Escape/focus, Undo, press/motion/tab contracts | Pass named states; native motion Not Reviewed | Pass regression | Inert ownership/focus lifetime | P2 | Shared fixes | real Escape; modal/snackbar/press/motion tests | `d159213`/`fe33030` | VoiceOver/keyboard/native edge swipe |

## Representative browser journeys and persistence

1. Fresh production origin → all builder stages → preview → acceptance → Today. Before fix Monday was falsely missed; after fix Monday rest/Wednesday A/Friday B. Starting A early/reload owns Wednesday with Tuesday actual execution.
2. Local import notes →2 workouts4 exercises including timed Plank/source blocks → complete editable review. Non-initial Apply reached existing native Replace guard; IAB did not expose/resolve it. Actual initial full-root React/StartupBoundary/useLiftState/local parser/storage independently passes acceptance with no confirmation; browser acceptance is NOT claimed.
3. Freestyle → Add/Preview Bodyweight Squat →12 reps → Log → Finish → Done. The test session was long because work resumed later; elapsed time was not fabricated/shortened.
4. Create Push-up2 sets → name/save → My workouts → start →8/8 bodyweight → finish → Done → reload. Template and one corresponding completion persist.
5. Active replacement → canonical T-Bar → Last10/8 with empty loads → set1 explicit40×10 → Log → set2 offer45×8 → reuse+immediate Undo restores empty/target9. Target2×9 and logged set1 remain; no historical completion flags copied.
6. Weighted80×8/RIR2 → rest → next/incomplete guard → skip → Finish/Keep training returns first unfinished set → reload/resume preserves entries. Settled recapture has one heading; earlier transition-overlap image is not final evidence. Advanced notes/supersets remain regression-reviewed, not falsely marked rendered.
7. Planned Move picker has real future dates/disabled conflicts → review/back-to-back notice → Apply produces temporary summary and rest day. Missed Monday has no enabled dead-end Move/Train. Undo expired during one separate tool roundtrip; that attempt is NOT counted as successful. Timed/focused Undo has explicit regressions.
8. Completed first/saved sessions → sparse Progress/history. Returning fixture →25progressions → Belt Squat → Oct3 chart point19kg → close/back. Wording remains estimated, not measured.
9. Actual-root5synthetic photos → second → View Workout opens LowerB/Oct3 → reopen → cancel Delete → confirm current Delete → next UpperB at2of4; workout remains. Authored synthetic pointer controls verify boundary settle, left1→2, short stays2, fast flick2→3. Accessible controls/target verified; physical velocity feel not claimed.
10. Actual Appearance/Ocean staged preview → Escape closes studio only, keeps Appearance/focus, restores original. Active Profile tap returns root. Same controls now under Display; Apply/illustration-only change/persistence/remount additionally verified in actual-component integration tests.
11. Real synthetic ZIP download → validation/Restore succeeds → immediate Hevy import formerly blocked until reload. Repeated after fix: Restore → preview → Import1 workout2 sets succeeds WITHOUT reload. Duplicate preview reports1duplicate/0new. No owner files/data used.
12. Actual anonymous/unavailable account state, synthetic linked/synced UI and full account/profile/outbox regressions. No live Google/login/sign-out/cloud operation.

## Visual evidence

Five surfaces each have320/375/390/430 × Standard Light/Dark/Premium Light/Dark =80 measured cases. These are legacy stylesheet regression states; the removed Standard/Premium selector was NOT restored. Current user-facing selection remains Personal Themes. Six-family theme/contrast/preview suites pass; not every Fine-tune combination was newly screenshot-reviewed.

Final prefixes in `screenshots/`: `profile-final-*`, `profile-final-bottom-*`, `viewer-final-*`, `logger-*`, `complete-*`, `equipment-*`; matrices are their corresponding `*-matrix.json` files. All80 cases have no document horizontal overflow. Decoded viewer images use contain, Done stays primary regardless of scroll, details secondary, Continue quiet; final Profile row borders0px/nav boundary0.8px. Viewport dimensions are checked separately from raster cropping.

Short/synthetic enlarged-text: `viewer-320-short-large.png`, `complete-short-320-large.jpg`, `equipment-short-320-large.jpg`. All actions remain reachable; equipment Review fits above the568px boundary and list has no nested scroll trap. This does NOT claim operating iOS Dynamic Type or a real home indicator. Focus outlines are keyboard feedback, not duplicate separators.

Adopted component fixtures omitted some main styles initially; fixed only the ignored fixtures to load EXACT `main.jsx` CSS order via `qa-styles.js`, no production CSS change. Final Profile/viewer matrices recaptured afterward. Main-root journeys always use the real root/full styles. Early incomplete-style captures are historical only. Some earlier `.png` filenames contain screenshot API JPEG bytes; final captures use `.jpg`. Fullpage images stitch fixed navigation at its viewport position; use viewport-bottom shots for actual boundary assessment.

Before/after evidence: `today-first-plan-390-dark.png` → `rotation-after-390-dark.png`; old `profile-main-390-dark.png` → `profile-grouped-main-390.jpg`/final matrix; old KEEPING review → `equipment-review-after-390.jpg`; restore mismatch probe/error → `restore-import-without-reload-after-390.jpg`. Gallery uses qualified current evidence.

## Final validation

- Frozen original: `npm test -- --maxWorkers=1`:5771 passed/8 skipped/358 files,944.42s, `frozen-baseline-tests.log`.
- FINAL full serial run: **5863 passed,8 skipped;370 passed files +1 skipped (371 total)**,570.33s, `final-all-tests.log`.92 additional passing tests against the adopted current baseline; overlapping targeted totals are not summed.
- `npm run build`: **passed**,1.43s, `final-profile-build.log`. Existing main~1.884MB/Firebase~556KB chunk warning retained; no speculative splitting claimed.
- `git diff --check` and staged checks: **passed**. Checkout LF/CRLF notices are not failures.
- `audit-visual-provenance.mjs`:766 files+18 inlineSVG=784records verified, no artwork change. `compile-visual-provenance.mjs --check`:331runtime records match.
- Initial two-worker survey had two10s plan-matrix timeouts and CRLF provenance failure. Frozen serial passes unchanged plan cases; final uses serial and strict line-ending tests. No domain assertion weakened.
- Repository has no standalone lint/typecheck script. Full meaningful regressions and production compilation ran. No shell Playwright/WebKit fallback; browser work used authorized Codex IAB. Native confirmation was not bypassed.

## Performance and independent review

Synthetic desktop24/260/1300 workout probes: latest-history under0.01ms, miss under0.4ms at 1300; no index rewrite justified. Serialization/hydration dominate large archives: about19.4MB at 1300eight-exercise workouts, median233/270.7ms. This reaches/exceeds browser storage safety limits, not supported unlimited history or iPhone timing. Methodology in `reliability-performance.mjs/json` and independent report.

Measured lifecycle fixes prevent cancelled auth/API, always release failed image resources, release only unowned late DB connections and prevent obsolete Coach writes. Shared updater clones external results only when necessary. No unmeasured speedup claim.

Functional/domain, mobile/accessibility/visual and reliability reviewers used exclusive source ownership and before-fix probes. Final source/qualified screenshots reviewed independently; no demonstrated final blocker. Reports: `functional-audit.md`, `mobile-audit.md`, `reliability-audit.md`. Three agents were used because the mission explicitly requested parallel specialized review.

## Remaining gates and next value

1. Physical iPhone/PWA: slow/flick/boundary swipe, native photo Save/Delete/ViewWorkout, keyboard/notes/raw drafts, sheet scroll/drag dismissal, zoom/enlarged text, tab re-tap, VoiceOver, real safe area and Reduce Motion. No physical verification performed.
2. Native existing-plan/discard confirmation and first-run acceptance after IAB blockage remain browser-tool qualifications; actual-root regressions pass. Do not remove the genuine decision guard merely to automate QA.
3. No server secrets copied. Live Google/cloud/AI-provider readiness is NOT validated. Owner backend/account configuration untouched.
4. Owner review of grouped Profile/Display especially PWA zoom; advanced forms, every Fine-tune/logger permutation and large archives not individually screenshot-approved.
5. Profile large archives on an isolated target-device copy before persistence architecture work. Existing chunk-size warning is a follow-up, not hidden failure or justification for unbounded rewrite.

## Addresses / stop

Production preview: **http://10.34.34.59:4292/** (local http://127.0.0.1:4292/).
Quality development: **http://10.34.34.59:4291/** (local http://127.0.0.1:4291/).
Evidence gallery: **http://127.0.0.1:4291/artifacts/overnight-quality/review.html**, also reachable on the LAN dev address.

Wi-Fi 10.34.34.59/endpoints200 verified. Original owner's 4290 remains; new port/origin has separate browser data. Its fresh landing does not mean the old profile was deleted. These are local servers, not deployment. STOP after handoff; no remote integration.

## Archived early checkpoint — superseded by the final report above

The following records the initial audit stage only. Its then-pending items are historical; use the final coverage, results and gates above.

This is the primary `EnejKacijan/Rook` application. Companion work is excluded.
No push, merge, deployment, live account, billing, Firebase-setting or real-user-data operation is authorized or performed.

- Original current worktree: `C:/Users/enejk/.codex/worktrees/rook-free-access-release/Fitness App`, branch `codex/free-access-release`, HEAD `4ef7491f6d0d975f7f9d0cd9e079c499119764bc`.
- Isolated worktree: `C:/Users/enejk/.codex/worktrees/rook-overnight-quality/Fitness App`, branch `codex/rook-overnight-quality`.
- Explicitly adopted the 39 approved current local source/test/doc changes into local baseline commit `91a73fe56d7a029e7bbafbd330cf9a517295fd55`. Original source changes are retained in their original checkout. Manifest: `artifacts/overnight-quality/adopted-baseline-files.json`.
- Other active work is the independent companion repository; primary Pro and iOS checkouts are excluded.
- Current development port 4291; stable production preview port 4292. Browser tests use a fresh isolated `127.0.0.14` origin and synthetic profiles.

## Baseline validation

Frozen original current source: `npm test -- --maxWorkers=1`: **5771 passed, 8 skipped, 358 files**, 944.42 s. Log `frozen-baseline-tests.log`. Production build passed in 4.86 s. Existing large-chunk warnings retained.

Initial two-worker survey in new checkout: 5768 passed, 3 failed, 8 skipped. Two plan-matrix cases exceeded 10 s under concurrent workload; frozen serial run passes unchanged. New Windows checkout also exposed CRLF-only inline/generated provenance checks; original LF checkout passes. Exact evidence hashes and assets are preserved while allowing only CRLF/LF translation.

## Proven issues and implementation status

| Issue | Severity | Cause / bounded correction | Current evidence |
| --- | --- | --- | --- |
| Late Coach response overwrites other-tab edits | P1 | Frozen component ref replaced whole state after unmount. Merge only owned pending message into current parent state, guard profile/conversation/entry/request generation, durable save, replay-safe result | Baseline actual-persistence probe; central StrictMode tests in progress |
| Rapid Add Set duplicates IDs | P1 | Millisecond-only ID. Reuse existing `uid('set')` | Real ReactDOM baseline two-click probe; new regression |
| Empty completion Resume ignores active optional/reserved sessions | P1 | Incomplete shared eligibility predicate. Respect optional session and repeat/combined reservations | Focused domain tests |
| Empty completion Resume orphans photo owner | P1 | New completion ID leaves old IndexedDB owner; backup rejects valid blob | Synthetic cross-store backup proof; conservatively disallow photo-owned resume |
| Custom snapshot bypasses training safety | P1 | Catalog-only resolution at start/validation/Today conflict UI | Existing canonical snapshot fallback, catalog remains authoritative |
| Startup copies incompatible logging history | P1 | Same exercise ID alone permits normal/per-side cross-context prefill | Same logging/load/measure gate as explicit reuse |
| Partial side reuse has stale representative reps/auto intent | P1 | Sides merged without deriving representative reps or marking explicit copied side manual | Canonical unilateral derivation, opposite side preserved, exact Undo |
| Escape closes nested and parent modal | P2 | Only first child inert property checked | Effective layer/ancestor ownership; real Personal Themes regression |
| Stale duplicate dialog semantics after destination swap | P2 | Wrapper aria role/name not removed when child owns dialog | One current modal semantic owner, including headerless swaps |
| Focused snackbar Undo expires | P2 | Pointer-only timer pause | Shared focus/pointer pause ownership, original remaining duration |
| Cancelled import still submits after preflight | P1 | Already-aborted signal not inherited | Cancellation before auth/fetch and after awaited status |
| Failed image decode/draw leaks resources | P2 | Cleanup only on success | Bitmap/URL finally cleanup |
| Blocked photo database later opens unowned connection | P2 | Promise already rejected; eventual success not closed | Close only rejected request's connection; retry independent |

Targeted agent verification so far: functional/domain 129 tests / 10 files; AI lifecycle/availability 66 / 3; photo storage 5; nested modal 5; snackbar 19 / 2. These overlaps are not summed as a unique total. Full final suite remains required.

## Audit coverage checkpoint

Source/test inventory covers landing/build/import, plan safety, Today/date ownership, scheduling/repeat/combined, logger/drafts/history/supersets/rest/finish/Continue, saved workouts, picker, progression, photos/backup, Profile/preferences, equipment, Coach, local persistence and shared mobile navigation/sheets/keyboard/press/motion. Reports: `functional-audit.md`, `reliability-audit.md`, `mobile-audit.md` under ignored artifacts.

Rendered so far: first-run landing at390; all eight builder stages; final preview; plan acceptance; Today rest and future first-session views. Main journey recording is ongoing. Initial dev HMR interrupted the draft; subsequent first-run journey uses stable production preview. This is not a production reload finding.

Do not mark the entire app or every theme/viewport as visually passed yet. Browser interaction, responsive/theme matrix, recovery/media journeys and second-pass review remain in progress. Physical iPhone/native keyboard/WebKit/live account/provider verification are separate external-device/service gates and are not claimed.

## Performance findings

Synthetic desktop probes at 24/260/1300 eight-exercise workouts: history lookup under0.01 ms for latest and under0.4 ms for miss at 1300; no speculative history-index optimization warranted. Serialization/hydration dominate large archives (about19.4 MB fixture at 1300, median serialize233 ms/hydrate270.7 ms). This fixture approaches/exceeds storage safety limits; do not imply supported unlimited archives or phone timings. Full report retains methodology and limitations.

## Next work

Finish central StrictMode Coach regressions, final source review, actual browser journeys and responsive/theme evidence; investigate any newly rendered defects with canonical domain proof; run final serial regression/build/diff checks; create logical LOCAL checkpoints and truthful final coverage/report. Preserve all originals and other checkouts.
