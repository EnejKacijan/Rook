# Flexible Week availability window — 2026-09-06

Historical report for the earlier window-only pass. Superseded by [the availability correctness/result-state fix](flexible-availability-results.md), including profile preselection and rolling-window target discovery.

- Initial availability selection shows today through today + 6 using existing local-calendar helpers. No past dates. Existing active/completed disabled-date rules remain.
- Copy identifies the seven-day window; profile immutability is a quieter separate line. After expansion, copy correctly says 14 days.
- No defaults are selected: normal recurring profile weekdays are not reliable evidence of exceptional availability. This avoids implying that the user confirmed those dates.
- After a review conflict, SHOW MORE DATES exposes days +7 through +13, grouped under FOLLOWING 7 DAYS. This rolling label is accurate even when today is midweek, unlike a calendar-week label. Expansion does not select or schedule anything.
- REVIEW SCHEDULE uses the existing available-dates mode with only explicit selections. The old UI carry shortcut is no longer invoked here because its engine flag can add unselected next-week dates. The engine and its bounded 14-day carry/bridge search are unchanged; this UI path does not silently shift other planned workouts. Occupied-date conflicts remain explicit, and the skip option remains available.
- Existing buttons, two-column grid, targets, sheet scaffold, scrolling and CTA styling are unchanged. At 320px the initial CTA fits in the captured 844px viewport; expanded content scrolls normally.

## Verification

- Six added component tests (eight total): Monday/Wednesday/Sunday initial dates, no preselection, no-days conflict, explicit expansion, selected-only second-window review, profile immutability, one/multiple remaining sessions fitting within seven days.
- Runtime: 12 combinations of 320/390/430 × Standard/Premium Light/Dark. Captured initial, selected, insufficient capacity, expanded and final review states. Asserted 7 → 14 dates, every changed effective date belongs to selected dates, unchanged profile and reload persistence.
- Existing extended Flexible Week runtime passed missed/fewer-days/explicit expansion/carry-date review/skip/persistence failure and actual clean-install ZIP restore. Its old carry-button step was updated to select additional dates explicitly.
- Full test suite: 792 tests / 36 files passed. Production build passed with existing large-chunk advisory. `git diff --check` passed (existing LF/CRLF advisories only).
- Screenshots: `artifacts/flexible-availability/` (60 PNGs).
- Physical iPhone / installed-PWA QA: NOT PERFORMED. Native safe areas and physical touch behavior remain unverified.

Changed in this pass: `src/FlexibleWeekSheet.jsx`, `src/FlexibleWeekSheet.test.jsx`, `scripts/flexible-week-states-qa.mjs`; added `scripts/flexible-availability-qa.mjs` and this report. No scheduler, block, progression, backup schema, active-workout UI or timezone logic changes. No commit or push.
