# Workout Photo Compare — 2026-09-06

## 1. Implemented

Progress → existing Workout Photos Timeline → secondary COMPARE action → choose exactly two photos → side-by-side comparison. Normal Timeline browsing remains normal browsing; selection is a separate temporary mode. Both photos retain full date (including year) and workout name. Dates order chronologically, with deterministic same-date ordering and equal visual treatment. CHANGE PHOTOS returns to selection, Back returns through the existing sheet hierarchy, and Cancel returns to normal Timeline.

The entry is absent with fewer than two photo references and enabled only after at least two photos have successfully decoded through the existing lazy thumbnails. Missing or known corrupt thumbnails cannot be selected. This avoids decoding every original merely to decide whether Compare can start.

## 2. Architecture

The existing `workoutPhotoTimeline` entries, month grouping, `LazyWorkoutPhotoThumbnail`, IndexedDB photo store and `PrivateWorkoutPhotoViewer` are reused. The new component owns only transient selection/view state; pure helpers enforce unique two-item selection and chronological ordering.

Only the two selected original records are loaded by the comparison view. Each has a revocable URL lease; the existing full-image viewer reuses that same URL rather than reading or copying a third original. Leaving comparison, changing selection and unmounting revoke leases; late asynchronous reads cannot create URLs after unmount. Normal/selection grids retain existing viewport-based lazy behavior. The hundreds-of-photos test confirms entering selection does not materialize all originals.

Both frames share grid rows and equal dimensions. `object-fit: contain` preserves portrait, landscape and mixed-ratio image content, including visible edges. Long names expand the shared context row, so both images remain aligned. There is no automatic cropping, body alignment, scoring or interpretation.

Unavailable/decode-failed selected images show “This photo is no longer available.” and Choose another, retaining the other choice. Returning to the app rechecks selected records on focus/visibility. Deletion uses the existing private-viewer confirmation and Timeline deletion path; workout history remains. A failed deletion stays in the viewer with a retryable error. Runtime QA exposed Escape dismissing the underlying sheet as well as the viewer; the reused viewer now consumes Escape as the topmost dialog, leaving comparison intact.

## 3. Files changed

New: `src/WorkoutPhotoCompare.jsx`, `src/workoutPhotoCompare.js`, `src/workoutPhotoCompare.css`, `src/workoutPhotoCompare.test.jsx`, `scripts/workout-photo-compare-qa.mjs`, this report.

Extended: `src/App.jsx` (Timeline entry/availability, optional thumbnail selection treatment, shared photo-deletion callback, private-viewer error and topmost Escape handling), `package.json` (`qa:workout-photo-compare`). Existing unrelated modifications were preserved.

## 4. Durable state

None added. Selection, ordering and comparison mode are ephemeral. Existing photo deletion still updates the original media association through its established path. No duplicate photo records, analytics cache, preferences, metadata schema or new database store.

## 5. Backup & Restore

No serialization or migration change is needed. Backup continues protecting the original photo media and workout references. The new runtime test creates a real archive of synthetic JPEG originals, restores into a clean browser profile, reloads, opens Timeline, and successfully compares the restored images. Existing Backup & Restore regression also passed full data/photo round trip and corruption rejection.

## 6. Automated tests

Full suite: **931 tests passed, 41 test files**. New component/helper coverage: **17 tests** for 0/1/2/300 entries, unique/capped/toggle selection, chronological/same-date ordering, missing/corrupt/duplicate eligibility, no full-image reads during choice, exactly two reads, existing-viewer URL reuse, back/unmount/late-read URL lifecycle, decode failures, live/external deletion, failed deletion retry, and ephemeral remount without mutation of source entries.

## 7. Build and diff

Production build passed. Existing Vite >500 kB chunk-size warning remains; no unrelated bundling change. `git diff --check` passed with only existing LF/CRLF notices. No commit or push.

## 8. Runtime QA

All 12 combinations of 320/390/430px × Light/Dark/Premium Light/Premium Dark passed entry, choose-first/second, two-selected readiness, balanced comparison, shared viewer, Escape returning only one layer, and complete object-URL cleanup. Actual computed disabled colors are checked against the disabled theme token, not just the DOM `disabled` attribute.

Additional cases: zero, one, 300 photos, portrait/landscape/mixed, same/different workout types and long names, same dates, corrupt/unselectable images, only one usable photo, deleted/corrupt records between selection and compare, deletion of a selected photo, simulated storage-delete failure and retry, offline comparison, reload and clean-profile ZIP/media restore. Frame dimensions/vertical positions match; contain behavior and no horizontal overflow are asserted. No outgoing POST occurs in the comparison flow.

Regression checks passed: Workout Photo Timeline (including History linkage and deletion), Backup & Restore, authoritative 12-case active-header alignment, Today/calendar/active-workout edge checks, Profile grouping, and Adjust Today. Active KG / REPS / RIR geometry and product calculations were not changed.

## 9. Screenshots

`artifacts/workout-photo-compare/`: **89 PNGs**. The main matrix has 72 images (entry, first choice, second choice, two selected, portrait pair and existing viewer × 12 configurations); the remaining captures cover aspect ratios, missing/corrupt/deleted media, deletion failure, empty/one/many and restored media.

All media in these screenshots are synthetic, non-personal JPEG test fixtures. No actual user's private photo was read for visual QA or sent to ChatGPT. The application adds no image upload, analytics image payload, Coach request or AI-processing path.

## 10. ChatGPT visual loop

Two review submissions in the Codex in-app browser. Immediately before review, the model menu visibly showed **GPT-5.6 Sol selected**, and the reasoning menu showed **Extra High, 4 of 5**; composer label was **5.6 Extra High**. Round 1 received 16 representative runtime images; Round 2 received 10 updated/regression images.

## 11. Visual feedback implemented

Round 1 reported one concrete P1: Premium Light's disabled Compare CTA looked enabled because the Premium primary-color selector overrode the scoped disabled rule. Its specificity was corrected using existing neutral disabled tokens, without changing placement, size, typography, selection markers or the result view. Runtime checks now verify both disabled and enabled computed colors in all 12 configurations. Other image framing, hierarchy, missing states and restraint were accepted in the first review.

## 12. Final visual status

Round 2 returned exactly **APPROVED — no meaningful visual/UX issues remain.** No anti-oscillation stop was necessary. Review conversation: https://chatgpt.com/c/6a9ca0a0-dfb8-83eb-a77b-312ffbe41844 . This is the Photo Compare approval after its own two rounds; earlier approvals concern other tasks.

## 13. Remaining physical/manual checks

Physical iPhone / installed-PWA testing was **not performed**. OS memory pressure/eviction, real camera-format edge cases and native-device gesture feel remain unverified. Browser automation tests actual local image decode/contain behavior, but synthetic fixtures do not prove every photo format supported by every device.

## 14. Intentionally omitted

No overlay/slider: mismatched orientation and framing make automatic before/after alignment misleading, and side-by-side is the reliable requested v1. No Swap toolbar: chronological ordering is sufficient. No image editing, AI alignment, body-fat/muscle estimates, rating, gamification, social Share, new navigation tab, persisted comparison or duplicated media. Existing capture preparation and ordinary Timeline thumbnail cropping are unchanged; comparison itself displays full contained originals.
