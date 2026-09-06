# Flexible Week — implementation and verification report

Date: 2026-09-05. Local working-tree implementation; no commit or push.

## Architecture and behavior

1. **Existing architecture:** recurring `program.days` generate dated occurrences. Legacy `weekScheduleOverrides` and date-scoped exercise overrides already existed. Active workouts are snapshots; completed History is authoritative. Flexible Week extends this derivation rather than introducing another permanent calendar.
2. **Temporary model:** `flexibleWeek = { schemaVersion: 1, revision, sessions }`. Records contain ID, template ID, original/effective date, skip flag, pinned block-week number, plan fingerprint and update timestamp. No duplicated exercise snapshots or AI reasoning are stored here.
3. **Identity:** template ID + original local date. Moving again replaces the same record. Active/completed snapshots retain this logical ID separately from actual performance date.
4. **Flows:** secondary Adjust Week entry; missed-session chooser; move one; move to today; changed dates; review; explicit carry/skip; restore schedule; source-day moved/skipped state; destination workout; plan-change conflict explanation.
5. **Missed:** unstarted, nonoptional occurrence whose effective date is before today. Completed, active and explicitly skipped sessions are excluded. Discovery uses the previous/current week and persisted overrides, not an unlimited historical backlog; dates before the block start are excluded.
6. **Algorithm:** deterministic bounded ordered backtracking over a 14-day destination horizon, capped at 30,000 search nodes. Stable ordering/tie resolution, no network or new optimizer dependency.
7. **Hard constraints:** valid future/current date, one scheduled workout per date, no active/completed move, explicit application, unchanged permanent plan, complete assignment or conflict, stale-review rejection. Optional active sessions occupy their date.
8. **Preferences:** minimize day displacement; preserve logical workout order in whole-week scheduling; penalize newly adjacent sessions. Single-session moves are explicit rather than silently rearranging other workouts.
9. **Recovery:** newly consecutive sessions add a cost of 2; shared primary muscle/lower-body overlap adds 6. Already programmed consecutive days are not additionally penalized. This is a scheduling heuristic, not a physiological recovery guarantee. Back-to-back dates receive factual review copy.
10. **Available days:** explicit dates only for the temporary proposal. Profile availability is untouched.
11. **Fewer days:** no silent deletion or merged/two-a-day sessions. Conflict offers carry into next week, choosing a session to skip, or more dates.
12. **Carry:** the explicit carry action allows next-week dates to be proposed; review shows every affected session before confirmation. Original block-week identity remains attached to carried work.
13. **Bridge:** affected future sessions can move within the bounded horizon; unaffected dates stay derived from the base schedule. Review identifies the next unchanged date when available. No permanent weekday rewrite.
14. **Skip:** durable explicit skip; no completed workout, PR, progression or failed-set credit. Today-only adjustment is cleared if the session is skipped.
15. **Training Blocks:** moved occurrences are prescribed using their pinned original block week. Future bridge occurrences retain their corresponding projected program week. Existing completion-driven block advancement is unchanged; moving a calendar date does not advance a block.
16. **Adjust Today:** matching moved adjustment requires restore/keep choice (restore default). Keeping transfers its date. Date-specific exercise ordering/exclusions transfer with the occurrence. Restoring past/quarantined records clears orphaned temporary edits. Destination Adjust Today remains available.
17. **Plan History:** calendar changes create no plan versions. Permanent plan changes invalidate unmatched fingerprints and surface a conflict; active/completed snapshots remain fixed. Plan restore warns that temporary scheduling requires review.
18. **Immutability:** apply does not change `program`, profile weekdays, exercises or global progression rules. Tests compare the permanent plan before/after.
19. **Progression:** existing completed-work progression is reused; moves/skips themselves award nothing. Adjusted workout semantics are preserved.
20. **History:** one actual completed workout with stable logical identity, original scheduled date and actual performance date. History detail quietly identifies the original date. No synthetic completion on move/skip.
21. **Weekly Review:** effective incoming/outgoing movements affect planned counts; explicit skips and moved records are counted separately. Actual completed history is deduplicated. Mixed carried program weeks are identified rather than presenting one misleading block week.
22. **Safety:** review fingerprint includes permanent plan, calendar/exercise overrides, active/completed state, today adaptation and current block week. Apply re-generates and compares changes. Duplicate apply becomes stale. Persistence failure leaves previous UI/storage state unchanged and offers retry.
23. **Offline:** generation and application run locally. Browser QA verified offline interaction and reload persistence separately. No background scheduling, push or external calendar integration was added.
24. **Backup:** durable state includes Flexible Week records and snapshot identity. Restore validates version, date/ID shape and duplicate effective dates. Real ZIP round-trip and fresh-landing restore recovered the schedule. Browser permission and OS share-sheet behavior are not implied by this test.

## Files and tests

25. **Files:** added `src/flexibleWeek.js`, `src/FlexibleWeekSheet.jsx`, `src/flexibleWeek.test.js`; integrated `src/domain.js`, `src/App.jsx`, `src/calendar.css`, `src/performanceInsights.js`, `src/planHistory.js`, `src/backup.js`. Added three `scripts/flexible-week-*-qa.mjs` scripts and this report. Smart Substitutions QA now waits for the settled sheet entrance before measuring geometry. Other existing dirty files are previous user-requested work and were preserved.
26. **Added tests:** 31 Flexible Week tests: move/re-move, invalid/occupied dates, immutable sessions, stale variants, duplicate apply, skip, block carry, Adjust Today restore/keep, reload/quarantine, ZIP restore, 5/5–1/1 capacity cases, bridge ordering, partial completion, active restore collision, optional work, occurrence ordering, actual start date, orphan cleanup, mixed weeks and local day/month/year/DST arithmetic.
27. **Complete unit/integration suite:** 784 tests across 35 files passed (`npm test`).
28. **Production build:** passed (`npm run build`); existing >500 kB chunk-size advisory remains. No dependency changes.
29. **Diff check:** `git diff --check` passed. Git reports existing LF/CRLF conversion advisories, not whitespace errors. Working tree intentionally remains uncommitted.
30. **Screenshots/runtime:** `artifacts/flexible-week/` contains 320/390/430 × Standard Light/Dark and Premium Light/Dark normal flow; missed, fewer-days, carry review/footer, skip, persistence failure, clean-install restore; moved Adjust Today entry, start/reload, completed Today, History, Weekly Review and adjustment-choice captures. Long-review QA asserts that the final row can scroll completely above the sticky footer.

Regression scripts passed: Adjust Today, Gym Profiles, Smart Substitutions, Plate Calculator, Training Blocks, Plan History, Performance Insights, Workout Resume and the current 12-case header-alignment matrix.

Tooling cleanup, 2026-09-06: `active-workout-clarity-qa.mjs` is retained for its interaction/logging coverage. Its obsolete RIR mark-gap (12–16px versus the approved 11px) and group-centering assertions were removed along with duplicated RIR-enabled header geometry checks. Geometry now belongs to `header-alignment-qa.mjs`; the clarity script retains its distinct RIR-disabled layout and tooltip/focus tests. `npm run qa:active-workout-clarity` runs clarity followed by the authoritative matrix through the new `qa:header-alignment` package command. Both scripts use `ROOK_QA_URL` with the same 4173 default. No CI references exist in this repository; the screenshot-package folder reference is unchanged. Both runtime scripts passed, all 784 tests passed, production build passed (existing chunk advisory), and `git diff --check` passed. Production UI, the approved 11px gap and all KG/REPS/RIR styling remain untouched.

## Visual review

31. **Rounds:** 3 in the existing ChatGPT in-app-browser review task, GPT-5.6 Sol Medium as displayed by the UI.
32. **Final verdict:** `APPROVED — no meaningful visual/UX issues remain.` Round 1 identified long-review footer occlusion at 320px. The footer now has an opaque theme surface and bottom clearance/masking; fresh top/bottom screenshots at 320/390/430 were approved in round 2. Round 3 approved supplemental Adjust Today choice, started workout, History and Weekly Review captures after native blue radio accents were replaced by theme tokens. Existing typography, menu, dates, source/destination and theme treatments were retained. The final adjustment-choice captures include theme names in their filenames; the earlier unsuffixed capture is pre-fix evidence.

## Physical device and limits

33. **Physical iPhone / installed-PWA QA: NOT PERFORMED**. No physical device model or iOS version is claimed.
34. **Physical findings/fixes:** none; desktop Chromium viewport QA is not physical-device verification.
35. **Still UNVERIFIED:** physical Safari/PWA safe areas, home-indicator behavior, software keyboard, touch dragging, OS termination/resume, actual midnight/timezone change while installed, native backup share/file-picker flows and notification regression. Synthetic calendar arithmetic and desktop reload/offline tests do not substitute for these checks. Arbitrary long-term scheduling beyond the bounded window and exhaustive search-optimality are not claimed.
36. **Intentional boundaries:** no external calendar sync, AI scheduling, merged workouts, two-a-days, readiness/recovery scores, new reminders or permanent frequency changes. No unrestricted backlog rescheduler; bounded recent-session discovery avoids turning every historical absent log into a current obligation. Physical QA uses the explicitly permitted unavailable-device fallback.

### Manual iPhone checklist — all pending

- Record device model, iOS version, Safari vs installed standalone mode.
- In Safari and installed PWA, open normal Today and Adjust Week; compare Standard/Premium Light/Dark.
- Move today’s workout and a missed workout; inspect source and destination; reload each state.
- Change available dates, carry across Sunday/month/year and review every change before applying.
- At narrow width/large text, scroll the longest review so the last change and final CTA are both readable; inspect safe areas and home indicator.
- Verify sheet scrolling, close/back and touch targets without accidental background scrolling.
- Open a keyboard elsewhere, close it, then open the sheet; verify viewport and CTA recover.
- Background during review, resume, change another state and verify stale review cannot overwrite it.
- Background/reopen an active moved workout; ensure snapshot, rest timer and Resume stay correct. Test normal app reload separately from OS termination.
- Cross local midnight with Today selected and with another date selected; verify Today updates without moving the other selection. Repeat after timezone/DST change.
- Export backup through native share/save; clear only an isolated test installation; restore via native file picker from the landing page and inspect moved/skipped/active/history state.
- Verify existing notification permission, rest-complete foreground feedback and permission-denied behavior; do not infer reliable terminated-app local notifications.
- Capture normal Today, moved Today, one sheet and a long-content state; document any findings before claiming physical verification.
