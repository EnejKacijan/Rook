# Edit Completed Workout / Correct History

Implemented and verified locally on 2026-09-06. No commit or push.

## 1. Implemented

The existing completed Workout Details / View History sheet now has a secondary EDIT action. Its editor supports actual load (KG/LB), reps or seconds, RIR, logged/unlogged status, standard/AMRAP/drop/rest-pause sets, existing per-side reps, session notes and exercise notes. Users can add missed sets and remove added sets/advanced segments with confirmation. Prescribed sets are marked unlogged instead of deleting their prescription.

Performance changes receive a concise Before/After review and “This may update PRs and progression history.” Note-only corrections save directly. Save failure leaves the draft available for retry. Cancel, Back, X, Escape and downward sheet dismissal protect unsaved changes. Existing session-detail accordions and exercise-performance drill-in remain separate; no active-workout screen was recreated.

## 2. Architecture and audit

`state.workouts` remains the single authoritative completed-history representation. Existing session-note editing and the separate empty-completion resume/correction mechanism were audited and preserved; this feature does not restart or duplicate a completed session.

The editor clones a snapshot. The domain boundary checks its source fingerprint, whitelists editable actual values and constructs a corrected whole-state candidate. Existing `workingSetCanComplete`, advanced-set normalization and canonical weight conversion remain authoritative. Additional serialized-shape/numeric checks reject malformed containers, nonfinite/negative values, invalid reps/RIR and incompatible segments rather than normalizing invalid corrections silently. Legacy missing row IDs receive deterministic IDs only in the editable snapshot and successful correction.

Workout/session IDs, original/performed dates, Flexible Week movement metadata, accepted Adjust Today prescription, block identity, photo association, permanent program, Plan History, active workout and later completed sessions remain unchanged. Unknown imported values stay unknown unless explicitly supplied; already-known required data cannot be erased through that exception. Imported raw source metadata is retained.

PRs, e1RM, Weekly Review and progression evidence derive from corrected authoritative history using existing rules/formula. There is no new analytics cache. Pending Next Block proposals become stale through the existing history fingerprint. An affected archived block summary is invalidated and recomputed; its archived program remains intact. Already-applied Next Block decisions and their approved starting-load markers are not silently rewritten. Relevant archived Block Review shows a quiet historical-correction explanation.

Persistence uses the existing synchronous whole-state store: validate/clone, persist, then publish React state. A failed/throwing storage write does not publish a partial correction. A successful-save lock and stale source fingerprint prevent repeated submission. This is not a new cross-store database transaction; no photo store mutation is needed.

## 3. Files changed for this feature

New: `src/historyCorrection.js`, `src/historyCorrection.test.js`, `src/HistoryCorrectionEditor.jsx`, `src/historyCorrection.css`, `scripts/history-correction-qa.mjs`, this report.

Extended: `src/App.jsx` (History entry/editor, exercise notes in session detail, protected dismissal and header rebinding when a sheet's internal root changes), `src/BlockReviewSheet.jsx` (relevant archived correction context), `src/backup.js` (correction metadata validation), `package.json` (`qa:history-correction`). Other existing dirty/untracked work was preserved and is not attributed to this feature.

## 4. Durable state

Corrected actual values replace the same completed record. Minimal `correctedAt` and `correctionRevision` fields are added without changing completion time. On first performance correction, an exercise can retain `originalPrescription` (rep range, target RIR and original planned set IDs/types). Affected archived blocks can carry `historyCorrectedAt`; their old derived `reviewSummary` is removed. Drafts and Before/After review are transient, not another durable history or audit-log system.

## 5. Backup & Restore

Existing whole-state serialization already round-trips the additive fields; restore validation now checks correction timestamps/revisions and original-prescription shape. No schema-breaking migration or duplicated media is introduced. Tests cover corrected values, metadata and photo identity/blob round trip together. Runtime QA restores a real corrected-history ZIP into a clean isolated browser profile and compares the restored records with the parsed archive. The existing Backup & Restore runtime suite separately verifies photo-store restore, Timeline reconstruction and corrupted-backup rejection.

## 6. Automated tests

Full suite: **914 passed, 40 test files**. This feature adds **46 tests** covering weight/reps/RIR/status correction, false PR/e1RM removal, progression/weekly recomputation, notes, all supported set types, unilateral values and malformed containers, imports/unknown data, legacy IDs, added sets/original prescription, immutable exercise identity, metadata/photos/later sessions, pending/applied Next Block behavior, archived summary invalidation, stale/double save, storage false/throw, draft cancellation and ZIP round trips.

## 7. Build and diff check

Production build passed. Vite still reports the existing >500 kB chunk-size warning; no unrelated bundle redesign was made. `git diff --check` passed, with only Git LF/CRLF conversion notices. Nothing staged, committed or pushed by this task.

## 8. Runtime QA

The correction script verifies all **12 width/theme combinations** (320/390/430 × Light/Dark/Premium Light/Premium Dark): edit, performance review, storage failure with unchanged source, retry/save, unchanged plan/session identity, corrected History and reload.

Additional 320/390 cases cover drop/rest-pause, per-side fields clearing the sticky footer, long names, note-only save, Cancel/Escape/X/downward-drag discard, and offline save. Separate cases cover LB conversion, timed values, exercise-performance detail after correction and clean-profile ZIP restore. Browser page-error assertions pass. The downward drag test waits for the sheet's scroll/entrance state to settle before dragging the actual handle.

Regression checks: authoritative 12-case header alignment, shared modal scaffold, workout resume/correction, Today/calendar/active-workout edge QA, Adjust Today, Profile grouping, and Backup & Restore. Normal workout completion is exercised in the correction fixtures and existing suite. KG / REPS / RIR geometry and the active-workout UI were not changed.

## 9. Screenshots

Real Chromium screenshots are in `artifacts/history-correction/`, named by width/theme/state. Coverage includes completed details, edit, standard numeric correction, advanced/per-side logging, notes, review, error, corrected History, e1RM/performance detail, long exercise names, discard, offline, LB/seconds and restored History. The main matrix provides 72 images (6 states × 12 configurations); additional captures cover the requested difficult states. Two earlier drag-debug captures are diagnostic QA artifacts, not production assets.

## 10. ChatGPT iterations

**Two visual-review rounds** for this feature in the Codex in-app browser. The selected model menu visibly showed **GPT-5.6 Sol** and the reasoning control **Extra High (4 of 5)**; the composer showed **5.6 Extra High**. No lower-reasoning substitute was used.

## 11. Changes from visual feedback

Round 1 identified one meaningful issue: 320px per-side inputs were partly obscured by the sticky Save/Cancel footer. The correction editor now measures footer height, reserves scroll clearance and reveals the entire focused numeric row after input changes or viewport resizing. Footer sizing, input density and active-workout layout were preserved. Runtime investigation also fixed shared sheet-header rebinding when switching internal panel roots, preserving visible Back/X controls. Updated screenshots were sent in Round 2.

## 12. Final approval

Round 2 returned exactly: **APPROVED — no meaningful visual/UX issues remain.** No anti-oscillation stop was necessary.

Review conversation: https://chatgpt.com/c/6a9ca0a0-dfb8-83eb-a77b-312ffbe41844 . This is the Correct History approval following its own two rounds, not the earlier End-of-Block approval in the same conversation. Screenshot approval is not a claim of functional or physical-device verification.

## 13. Physical/manual checks still outstanding

**Physical iPhone / installed-PWA testing was not performed.** Actual iOS keyboard/safe-area behavior, native edge-swipe feel, OS storage eviction and crash timing remain unverified. Chromium viewport/gesture automation and synthetic write failures do not prove those behaviors. Saved corrections survive tested reload and restore; an unsaved draft is intentionally not durable across a page reload.

## 14. Intentional v1 limits

Historical exercise identity and exercise-level logging mode remain immutable to avoid changing an exercise's meaning or rewriting the program. Prescribed sets cannot be deleted; their actual logged status can be cleared. Only added sets and advanced segments can be removed. Per-side corrections use the existing model's left/right reps with a shared load/RIR, not a new independent-per-side load model. Reps-only and timed logging follow current metadata; no new unsupported load-only schema was invented. Failure remains existing RIR=0 rather than a duplicate set type. No new workout deletion, social feature, navigation tab, analytics formula or automatic permanent-plan rewrite was added.
