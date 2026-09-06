# Export Workout History — schema and feature report

## 1. Implemented

Profile → DATA → Export workout history, directly after Import workout history. CSV or JSON, Include notes OFF on each fresh opening. All completed history is included, including sessions ended early. Export Workout Plan remains under PROGRAM; Backup/Restore remains the complete recovery mechanism. No changes to workout calculations, logging or progression.

## 2. Architecture

Pure whitelist projection of authoritative `state.workouts`, with explicit portable fields. Generation yields every 20 sessions; repeated exercise-name normalization is cached only within that export. File parts are assembled incrementally, avoiding one giant concatenated string. No network calls, File System Access requirement, new service worker or backend.

EXPORT prepares the file. SHARE / DOWNLOAD is a separate explicit gesture, preserving browser user activation even after large asynchronous generation. Web Share Files is preferred; unsupported/failed sharing falls back to an anchor download. Deliberate sharing cancellation does not force a download. Errors retain the prepared file for retry. Object URLs are revoked, including when the anchor click throws. Status describes handoff/download request, never a verified OS save.

## 3. Files

- `src/workoutHistoryExport.js`: whitelist, schema, CSV protection, cooperative generation and file handoff.
- `src/WorkoutHistoryExport.jsx`: ephemeral sheet.
- `src/workoutHistoryExport.css`: scoped themed styling.
- `src/workoutHistoryExport.test.js`: domain and handoff tests.
- `scripts/workout-history-export-qa.mjs`: isolated Chromium matrix and actual downloads.
- `src/App.jsx`: Profile row and existing detail router integration.
- `package.json`: `qa:workout-history-export` command.
- This document.

## 4. Durable state

None. Format choice, notes choice, prepared file and messages are temporary component state. Closing and reopening resets privacy to notes OFF. Existing source history is never mutated.

## 5. Backup & Restore

No new storage or migration. Existing backup protects source records. A test compares exports before/after ZIP Backup Restore with a fixed export timestamp. Existing browser Backup/Restore QA also passes. CSV/JSON is NOT accepted as a new restore format.

## Portable schema v2 (additive Post-Workout Feedback extension)

JSON envelope: `metadata` and `workouts`. Metadata contains schema=`rook.workout-history`, version=2, ISO exported_at, notes_included, weight_unit=`kg`, weight_semantics, display_unit_at_export and workout_count. Version 2 adds nullable workout-level `session_feedback`: `easier`, `about_right`, `harder`, `skipped`, or null. It means subjective session difficulty relative to expectation, not readiness/recovery. Existing fields and unit semantics are unchanged.

Each workout contains:

- workout_id (existing stable ID; deterministic position fallback for malformed legacy missing IDs), workout_name.
- workout_date = actual start date using the recorded start UTC offset when available; otherwise UTC date of start/completion. `date_basis` makes this explicit. started_at/completed_at are ISO timestamps. No date is inferred from the selected calendar day.
- scheduled_date = preserved canonical plan reference; original_scheduled_date = original Flexible Week date when recorded. Unknown values are null.
- adjusted (Adjust Today snapshot present), moved, source (`rook` or recorded import provider), has_workout_photo (reference exists, not a media-availability guarantee).
- block_name, block_week, block_phase from the completed snapshot, never the current plan.
- session_note only when explicitly included.
- exercises: exercise_id, one-based exercise_number, exercise_name (existing display-name resolution), logging_mode, optional exercise_note, sets.
- sets: original one-based set_number, set_type, performed flag, current performed values, segments. Unlogged sets with no completed segments are omitted. A compound parent with performed segments but no performed base is retained without invented parent performance.
- segments: original one-based segment_number within the parent, segment_type and performed values. Unperformed segments are excluded.

Performed values: weight, unit, original_import_weight, original_import_unit, reps, duration_seconds, rir, left_reps, right_reps. Numbers are finite numeric values or null; zero is preserved. Timed exercises use seconds, not repetitions. Per-side values remain independent; missing sides are not invented. Failure remains RIR=0, not a new type.

### Units and provenance

`weight` is the exact stored numeric kg value, without a new conversion or rounding. Native logging does not reliably retain the originally entered lb/kg value; a current UI preference is not claimed to be the unit used for an old set. JSON separately identifies the current display preference. CSV always identifies canonical unit on each performed row.

When imports retained a source weight/unit, `original_import_weight` and `original_import_unit` preserve those separately. They are **original import provenance**, not necessarily current corrected performance. Corrections may legitimately make canonical weight differ from original import weight. Raw importer objects, filenames, hashes and debug data are not exported.

### CSV v2

UTF-8 with BOM for spreadsheet compatibility; comma separator; CRLF records; double-quote escaping. One row per performed base set plus one row per performed drop/rest-pause segment. `row_type` is `set` or `segment`. Segment rows repeat the parent set_number and set_type; segment_number/type describe their relationship. Counting all CSV rows as independent normal working sets is incorrect. Workout/exercise identity columns repeat for standalone readability.

Stable column order:

```text
workout_id,workout_date,started_at,completed_at,date_basis,scheduled_date,original_scheduled_date,workout_name,block_name,block_week,block_phase,adjusted,moved,source,has_workout_photo,exercise_id,exercise_number,exercise_name,logging_mode,set_number,set_type,row_type,segment_number,segment_type,weight,unit,original_import_weight,original_import_unit,reps,duration_seconds,rir,left_reps,right_reps
```

When notes are ON, append `session_note,exercise_note`. When OFF, those columns/JSON properties do not exist. Version 2 then appends `session_feedback` as the final column in either variant, preserving all v1 column positions. Feedback is session-level context repeated on performed rows, never a per-set rating. Exercise notes include saved personal/imported note text, deduplicated. Blank CSV fields correspond to null/non-applicable values. Empty CSV contains only the header. A workout with no performed sets has no CSV rows, but remains represented in JSON. Choose JSON when session-level empty history matters.

Potential spreadsheet formulas in user-authored strings (leading whitespace followed by `=`, `+`, `-`, `@`) receive a protective apostrophe in CSV. Numeric values are not altered. JSON preserves original text verbatim.

Filenames: `ROOK-workout-history-YYYY-MM-DD.csv` / `.json` (generation date in UTC).

## 6–9. Verification

Final verification (2026-09-06): **967 tests passed in 42 files**, including **36 new export tests**. Coverage includes 1,200 realistic sessions / 28,800 performed CSV rows, exact kg and preserved imported lb provenance, missing RIR/load/side, advanced segments, Unicode/escaping/formula protection, notes privacy, moved/adjusted/imported/custom history, schema, Backup Restore equivalence and handoff failures. Production build passed; only the existing large-chunk advisory remains. `git diff --check` passed (existing LF/CRLF notices only).

Regression browser scripts passed: `backup-restore-qa.mjs`, `adjust-today-qa.mjs`, `header-alignment-qa.mjs` (12 cases), `edge-qa.mjs`, `profile-grouping-qa.mjs`. These cover normal/adjusted active logging and completion, Today/calendar, Profile and recovery. The final export runtime script passes all 12 theme/width cases and six additional scenarios, including keyboard radio navigation and actual downloaded file inspection. **79 PNG screenshots** captured.

Runtime matrix: 320/390/430 × Standard Light/Dark and Premium Light/Dark. Captures DATA entry, CSV, JSON, notes ON, prepared file, handoff. Additional 320px empty, 1,200 sessions/loading, offline, share cancellation, mock share completion and injected download failure. Actual downloaded files are inspected for valid JSON/CSV and note privacy; mock sharing is not physical-device evidence. Screenshots are in `artifacts/workout-history-export/` and contain synthetic data only.

## 10–12. ChatGPT review

GPT-5.6 Sol and Extra High were visibly verified in the in-app browser. **One review round**: 16 runtime screenshots sent with the requested feature and standing review criteria. Response: **APPROVED — no meaningful visual/UX issues remain.** No changes requested by ChatGPT. Before submission, local screenshot inspection corrected a selected-format text color collision in Dark, applied restrained themed checkbox styling and neutral disabled CTA semantics. No existing screen was redesigned.

## 13. Physical-device checks

Physical iPhone/iPad, installed PWA share sheet, Android OS destinations and actual destination-app saving were not tested. Browser emulation cannot prove them. No claim of verified OS save success.

## 14. Intentionally excluded

No photo binaries, media keys/URLs, AI reasoning, auth/browser/debug state, full raw application dump, new restore format, export preference persistence or additional export toggles. Warmup preparation/checklist prescriptions are not represented as measured working-set performance. No new analytics caches. No unrelated UI changes. No commit or push.
