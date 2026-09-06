# Post-Workout Feedback — implementation and verification

## 1. Implemented

One optional question after Photo and Session Note on the existing completion screen: “How did this session feel?” Options are Easier than expected / About right / Harder than expected, plus Skip. Selecting or skipping collapses the prompt into a quiet row with Change. Done is independent, even with no response or a persistence error. History only displays an actual rating; it does not ask again. Existing Edit Workout can correct a rating or skip it.

## 2. Architecture

Small domain module and shared scoped UI. The signal means difficulty relative to personal expectation, not recovery, medical fatigue, success or RIR accuracy. Writes target a completed workout by stable ID and pre-persist the next state before publishing it. Failed storage keeps the prior history and permits Done. No new network, AI, analytics, navigation or modal. Local plan-version creation is explicitly disabled for a feedback save.

## 3. Files

New: `src/sessionFeedback.js`, `src/SessionFeedback.jsx`, `src/sessionFeedback.css`, `src/sessionFeedback.test.js`, `scripts/session-feedback-qa.mjs`, this report.

Extended: `src/App.jsx` (completion/History), `src/HistoryCorrectionEditor.jsx`, `src/historyCorrection.js`, `src/blockReview.js`, `src/BlockReviewSheet.jsx`, `src/backup.js`, `src/domain.js` (clear premature rating only when reopening an empty completion), `src/workoutHistoryExport.js`, its tests/documentation, and `package.json` (`qa:session-feedback`).

## 4. Durable state and migration

Optional `workouts[].sessionFeedback`: `easier`, `about_right`, `harder`, or `skipped`. Missing/null is unanswered. Skip is not an ordinal value or score and is excluded from aggregates. Existing serialization retains workout fields; old records remain absent/unrated with no manufactured baseline or bulk migration. Reopening an accidentally completed empty workout clears its old rating from the active session, while the existing frozen correction record keeps the original historical snapshot.

## 5. Backup and export

Existing Backup/Restore serialization retains the field. Backup validation rejects invalid values; legacy absence is accepted. Round-trip tests and a clean browser-profile ZIP restore verify preservation. No new storage collection.

Portable History export now uses JSON schema version 2 with nullable `session_feedback`. CSV appends the same column **after all existing columns**, including optional notes columns, preserving v1 positions and meanings. Feedback is included independently of free-text notes. Existing canonical kg/import provenance semantics are unchanged. See `workout-history-export.md`.

## Conservative Block Review semantics

Uses existing authoritative block-session deduplication. Eligible context excludes optional, adjusted, deload, ended-early and zero-logged-set sessions. Summarize only when at least four eligible sessions have a rating, ratings cover at least half of eligible sessions, and one answer represents at least 60% of ratings. Otherwise show nothing; no nag for missing evidence. Copy states exact counts of **rated sessions**, not all training: e.g. “4 of 5 rated sessions felt about right.”

No per-exercise attribution. The session-level rating cannot justify a Hack Squat claim. No numerical readiness score. Feedback is informational only and does not change any Next Block load, replacement, effort or volume recommendation. Archived review feedback is rederived from authoritative current history, so corrections do not leave a stale cached rating summary. Existing proposal fingerprints already include completed records and safely reject stale reviews.

## 6–9. Verification

**998 tests passed in 43 files**, including 31 new signal/domain/persistence/aggregation/export tests. Production build passed; the existing large-chunk advisory remains. `git diff --check` passes with only existing LF/CRLF notices. No staging, commit or push.

Runtime matrix covers 320/390/430 × four themes: actual workout completion, no selection, every option, Skip, correction, History and reload. All 12 cases additionally inject failed storage and assert the entire error clears the footer by at least 16px while the Done button keeps its exact bounding rectangle. Additional cases cover ignored response, offline, long completion content, clean-profile ZIP restore, and all four themes in Block Review. **117 PNGs**, synthetic data only. Artifacts: `artifacts/session-feedback/`.

Regression scripts passed: `edge-qa.mjs`, `header-alignment-qa.mjs` (12 unchanged-geometry cases), `adjust-today-qa.mjs`, `profile-grouping-qa.mjs`, `workout-history-export-qa.mjs`, and the full `history-correction-qa.mjs` including clean-profile ZIP restore. One History QA run encountered a temporary preview response failure during a production rebuild; it was rerun in full against the stable build and passed. No product workaround was made for that tooling interruption.

## 10–12. Visual loop

GPT-5.6 Sol and Extra High visibly verified in the in-app browser. **Two review rounds.** Round 1 sent 16 actual screenshots with the requested review prompt. One P1: at 320px the fixed Done dock obscured part of a nonfatal save-error message. The fix reveals the entire error on failure/retry/viewport resize without changing ordinary layout, footer geometry, copy or colors. Round 2 sent nine fresh failure/unchanged/long-page screenshots. Final verdict: **APPROVED — no meaningful visual/UX issues remain.**

## 13. Remaining device checks

No physical iPhone/Android or installed-PWA verification. Chromium viewport/theme emulation and real local interactions are not physical-device evidence.

## 14. Intentionally excluded

No scales, soreness/sleep/mood/pain questions, readiness percentage, medical inference, automatic programming changes, exercise-specific claims, new Coach network payload, repeated reminders or extra global preference. Existing active-workout geometry and density untouched. No push or commit.
