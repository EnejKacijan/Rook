# ROOK post-review cleanup — 2026-09-05

## Production onboarding

The legacy LIFT / longer onboarding was not production-reachable in the inspected build. `App.jsx` has one `Onboarding` component and one production personalization entry, selected when onboarding is incomplete and `entryMode` is `personalize`. Its `allStages` array contains eight stages; there is no alternate legacy URL router or LIFT branding in the current JSX.

The conflicting `04-frequency.png`, `05-days.png`, `06-duration.png`, `07-environment.png`, `08-equipment.png`, `09-priorities.png`, `10-effort.png`, and `11-preferences.png` were older files left in the artifact directory (including captures dated August 23). They are now explicitly excluded by the manual-review packaging script. Original artifacts and the previously delivered ZIP were preserved, not deleted or overwritten.

No production onboarding changes were made. Sequence: personal details → goal → experience → consolidated schedule (frequency, available days, duration) → setup/equipment → priorities → effort → split/preferences/restrictions. The new clean-install test completes this exact 8-step sequence at 320/390/430px, checks ROOK branding and step numbers, verifies schedule answers survive Back/Continue, and verifies restriction persistence after accepting the generated plan. Fresh browser contexts have no saved application state or IndexedDB databases before application boot. Database creation during normal boot is expected.

## Shared search correction

`SearchInput.jsx` wraps the existing controlled input and adds a neutral 44×44px button named “Clear search”. It suppresses the native WebKit/MS cancel controls, clears through the owner's state setter, restores input focus, and keeps keyboard focus indication. Input classes, dimensions, existing results, and sheet structure remain. Search focus color uses theme tokens, including Premium; clear itself is not an accent CTA.

All six search inputs in App.jsx use it:

- ambiguous plan-import exercise matching;
- permanent plan editor exercise replacement;
- scratch-plan exercise search;
- historical workout import mapping;
- Adjust Today manual replacement picker;
- active-workout Smart Substitutions manual picker.

Custom Exercises does not have a separate library search input. Its exercises participate in the existing import/replacement search; that integration was tested. No unrelated text fields changed.

The 320px initial Smart Substitutions title “Replace Back Squat” is visible, and its scroll container starts at zero. The older densest screenshot is captured after pressing More suggestions, which scrolls to that action; it is not evidence of missing initial context. No replacement layout change was made.

## Runtime evidence and limits

- Long content: Adjust Today, Plan History, Training Blocks, custom editor, historical import, per-side logging, and Performance Insights passed their existing runtime checks plus a test-only 34px bottom-safe-area CSS substitution. Last actions can be scrolled into the viewport; no horizontal overflow was found. This is desktop simulation, not physical Safari validation or an exhaustive occlusion audit.
- Search: four-theme typed/empty/clear states, unchanged input bounds, Tab/Enter, visible focus ring, and focus restoration passed in Smart Substitutions. Import mapping and custom-exercise import resolution also clear and restore the query correctly. Existing import-review QA passed with the shared wrapper. Not every search surface was separately exercised in every theme.
- Input/keyboard: desktop keyboard behavior verified. A real Android/iOS virtual keyboard was not available; keyboard resizing, OS overlays, and physical-device input behavior remain unverified.
- Backup: real browser ZIP download, state/photo round-trip, corrupt rejection, cancellation-safe recovery flow, clean-install restore before profile creation, logout recovery, and four-theme layout passed. Journal recovery passed at journal-only, photos staged, state written, and post-commit interruptions. Actual OS share/save panels on mobile remain unverified; browser download and mocked cancellation/failure paths are not physical OS verification.
- Notifications: runtime default/granted/denied/restored preference states and expired absolute timer on return passed with permission test doubles. Unit checks cover no launch permission request, permission revoked/default/denied, hidden versus foreground eligibility, stale/repeated completion suppression, fresh subsequent rests, and null rest after Skip/Finish. Native OS notification delivery and actual suspended/terminated mobile behavior were not tested. Closed-app reliability remains explicitly unsupported; no backend was added.
- Accessibility: shared clear has an accessible name, genuine button type, keyboard activation and focus return. Visible close/back utility controls are checked for names; existing option/disabled assertions and destructive-flow tests passed. This is not a full screen-reader audit; universal sheet-dismissal focus restoration was not independently proven on every new screen.
- KG/REPS/RIR: production implementation untouched in this pass. Existing 12-case alignment suite passed unchanged.

## Changed files and tests

Production: `src/SearchInput.jsx`, six call sites in `src/App.jsx`, search-only rules in `src/overrides.css`.

Tests/tooling: `src/SearchInput.test.jsx`, `src/restNotifications.test.js`, `scripts/post-review-onboarding-qa.mjs`, `scripts/post-review-runtime-checks.mjs`, `scripts/package-manual-visual-review.mjs`; focused additions to smart-substitutions, import-review-ux, historical-workout-import, custom-exercises, adjust-today, plan-history, training-blocks, advanced-logging, and performance-insights QA scripts.

Final full suite: 34 files, 753 tests passed. Production build passed. `git diff --check` passed (only existing LF/CRLF conversion warnings). Two runtime invocations briefly failed to load the preview while a build replaced dist; both were rerun successfully after the build settled.

Screenshots: `artifacts/post-review-onboarding/` contains current full-flow captures at three widths; `artifacts/smart-substitutions/390-clear-*.png` contains four theme states and `320-initial-unscrolled.png` the opening context. Other current outputs include historical import mapping, import-review picker, unchanged active header, Adjust Today review, recovery landing, and the long-content feature matrices. Onboarding capture now waits 350ms for entry animation to settle.

## External visual review

The exact requested prompt and 16 runtime/reference PNGs were sent through the in-app browser to ChatGPT (GPT-5.6 Sol Medium, as shown by the available default model control). Round 1 approved search controls, initial 320px replacement context, theme restraint and scaffold consistency. It flagged the equipment CTA and faded priorities content in screenshots taken during entrance animations. The capture script was corrected to wait for settled state, and four corrected onboarding images were sent in round 2. No production onboarding modification was necessary.

Final response: **APPROVED — no meaningful visual/UX issues remain.**

Review: https://chatgpt.com/c/6a9c0c2b-faa4-83eb-a901-1eb6ad732255

Physical-device limitations above cannot be resolved by screenshot approval.

No commit or push performed. No approved feature was redesigned.
