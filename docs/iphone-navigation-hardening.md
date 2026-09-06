# iPhone/navigation hardening — implementation and evidence

Physical iPhone / installed-PWA QA: NOT PERFORMED

No physical iPhone connection was available. Model and iOS version: not recorded, not tested. Chromium touch automation and mocked standalone detection are **not** Safari, an installed iOS PWA, an actual keyboard, or OS termination. This pass does not certify release on iPhone. ChatGPT visual approval was obtained after the user's requested retry in ordinary Chat (Extra High), because Work was exhausted. No credits purchased.

## 1–4. Architecture, evaluated surfaces, rollout

ROOK uses React state for four explicit bottom tabs, `Detail`/`ModalLayer` for secondary surfaces, and local component state for nested screens. There is no shared route-history stack for sheets. `SheetHeader` distinguishes Back from Close; `ModalLayer` handles X/Escape, focus trapping, background inertness and body scroll locking. Its fullscreen exercise illustration viewer has its own browser-history marker/popstate behavior. Root sheet drag uses the shared header handle and scrollable-sheet touch binding. Existing View Transitions and motion tokens remain unchanged.

| Audited surface | Existing semantics | Swipe decision |
| --- | --- | --- |
| Flexible Week mode picker | Root X/drag close | Disabled at root |
| Available days, result, picker/missed picker, destination, schedule review | Internal Back | Enabled when previous view was visited; now pops one level, including review → destination → picker → mode |
| Flexible Week directly opened destination | Back to mode, but mode not yet visited | Visible Back retained; no fabricated previous-view preview/swipe until a real prior view exists |
| Adjust Today time, equipment, energy, unavailable | Back to mode | Enabled |
| Adjust Today saved/custom equipment choices | Choices within same equipment view, not another Back level | Existing Back still returns to mode; no invented equipment sub-route |
| Adjust Today generated review | Back to originating configuration | Enabled |
| Adjust Today manual resolution | Back clears query/manual selection, keeps proposal | Enabled, except while editing/focused input |
| Directly opened applied adjustment/restore | No visited previous view; restore confirmation | No swipe; existing buttons retained |
| Plan History version detail | Back to list | Enabled after opening from list |
| Plan History restore confirmation | Destructive decision within detail | Swipe disabled, existing Back/Cancel unchanged |
| Training Block root | X/drag close | Disabled |
| Training Block editor/review | Back to overview; draft/program decisions | Evaluated, deferred; no gesture added without editor-specific interaction validation |
| Historical import source/file/review | Back changes source/file and clears preview | Deferred; potentially discards import work, no new gesture |
| Historical import exercise mapping | Back clears search/mapping name, retains preview | Deferred with import flow; no alias or mapping changes |
| Gym list/editor/create | Editor Back returns list, clears editing ID/delete/error | Deferred; unsaved form remains explicit-button only |
| Gym plate setup; calculator setup | Local draft/save and Back | Deferred; no draft loss via newly introduced gesture |
| Custom exercise list/editor | Back returns list, editor draft not saved | Deferred; unchanged explicit Back |
| Weight-history exercise detail | Back replaces current Detail with history list | Deferred; cross-Detail lifecycle rather than opted-in local stack |
| Backup/Restore and recovery entry | Close/Cancel or “Back to start” closing recovery surface | No internal swipe stack invented; destructive safeguards unchanged |
| Exercise illustration/photo viewer/timeline | Viewer/history/root navigation and image interactions | Excluded; no image gesture interference |
| Active workout, search/replace, notes, logging, reorder, charts | Controls/root sheets or other navigation semantics | Excluded |
| Today date strip and Today/Coach/Progress/Profile tabs | Explicit date/tab selection | Excluded |

No shared Header-wide auto-enablement. Only three components opt into `useSheetBack`.

## 5–11. Gesture implementation

- Activation is within 24 CSS px of the actual sheet bounding rectangle's left edge, not a device-specific screen coordinate.
- Touch-only. No mouse drag handler or global document swipe handler; no pointer capture is acquired, so none can leak.
- Intent: rightward displacement greater than 10px and greater than `abs(dy) * 1.4`. Vertical/wrong-direction movement is abandoned before claiming; default scrolling is not prevented on touch-down.
- A recognized gesture prevents default and propagation. The existing vertical sheet recognizer relinquishes horizontal intent **only on an opted-in standalone surface**. Header drag handles remain higher-priority/excluded.
- Commit at 33% width, or at least 56px with recent rightward velocity ≥0.65px/ms. Velocity older than 100ms is ignored. Tiny fast movements do not navigate. Release/cancel settles for 200ms using `--rook-ease-standard`; reduced motion uses zero-duration settle.
- The current content tracks the finger directly over an inert previous-view DOM snapshot. One stationary outer clip/handle; no scrim motion, spring, scale, duplicate rounded corners, or decorative haptic. Snapshots have no IDs, are aria-hidden/inert and pointer-inert, remain memory-only, and are capped at 12 per mounted navigator. They are not screenshots or duplicated photo blobs in storage.
- Actual content stays mounted; the preview is removed before calling the same Back callback used by the button. Repeated end events cannot double-pop. Unmount, blur, resize, visibility change, cancellation or changed view remove previews/transforms/listeners. No durable state is mutated during drag/cancel.
- Safari and all normal browser tabs: disabled. `navigator.standalone === true` or `(display-mode: standalone)` is required; no browser `history.back()`/pushState from this feature. Installed standalone detection is runtime-tested by mocking, not a physical installation claim.

## 12–13. Data, input, accessibility, conflicts

Back buttons and accessible names remain; root X/Escape/drag dismissal and existing confirmations remain. No alternative apply/restore/save path exists. Plan restore and Adjust restore confirmation disable swipe. Gym/custom/import editors were deliberately not opted in. Focused inputs/textarea/select/contenteditable, nonempty text selection, gestures originating in buttons/links/inputs/ranges/SVG/canvas/images/drag handles and explicit `data-no-edge-back` surfaces are excluded. Busy generation disables gesture. Focus moves to destination heading after swipe; cancellation does not explicitly move focus. Existing scroll reset behavior is unchanged for actual Back, while preview snapshots preserve their prior scroll offset. Active logging and all KG/REPS/RIR CSS are untouched.

## 14–18. Files and automated evidence

This pass changes `src/App.jsx` (three opt-ins/scoped vertical coordination), `src/FlexibleWeekSheet.jsx` (real local step stack), and adds `src/edgeBack.js`, `src/useSheetBack.js`, `src/edgeBack.test.js`. It extends `src/FlexibleWeekSheet.test.jsx`; adds `scripts/edge-back-qa.mjs`, `scripts/edge-back-interactions-qa.mjs`; fixes only the day-dependent fixture name in `scripts/adjust-today-qa.mjs`; adds this report and review prompt. All other existing dirty feature/UI work is preserved, not attributed to this pass.

The old Adjust Today QA unconditionally renamed today's generated day “Upper”, which on Sunday turned a Lower session into an apparent consecutive Upper/Upper boundary and failed `validateProgram` before opening the browser. The fixture now preserves its generated split identity while keeping a long name. No production validation rule changed.

The dedicated matrix uses Chromium CDP touch sequences at 320/390/430 × Standard/Premium × Light/Dark. It captures before, partial cancel, cancelled, partial commit and destination for Flexible Week, Adjust Today and Plan History (180 matrix PNGs). Adversarial tests separately exercise synthetic native TouchEvents; do not confuse those with real-device gestures.

Final gates:

- `npm test`: **817 tests / 38 files passed** (17 new tests versus 800-test baseline).
- `npm run build`: **PASS**, existing >500kB bundle-size advisory only.
- `git diff --check`: **PASS**, line-ending conversion warnings only; no commit/staging/push.
- `node scripts/edge-back-qa.mjs`: **PASS**, 12 width/theme cases, three nested flows, 180 captures; additional equipment/custom, energy review and unavailable mode Back at 390px.
- `node scripts/edge-back-interactions-qa.mjs`: **PASS**, root/browser gates, vertical/diagonal/wrong-direction, multitouch, short cancel, fast flick, reduced motion, scrolled Back, focused custom input, interrupted view change, manual replacement/query Back and preserved unavailable selection. The unknown-exercise fixture uses the existing `imported-custom-` ID convention so restoration recognizes it rather than rejecting the fixture.
- `qa:header-alignment`: **PASS**, authoritative 12 cases, unchanged header/control geometry and tooltip.
- `qa:bottom-sheet-drag`, `qa:modal-scaffold`, `qa:workout-resume`, `qa:rest-notifications`, `qa:adjust-today`, `qa:plan-history`: **PASS**.
- `flexible-week-states-qa.mjs`, `flexible-week-integration-qa.mjs`, `flexible-availability-qa.mjs`: **PASS**, including clean ZIP restore, missed/skip/capacity/apply failure, moved adjusted workout/History/Progress and 12 availability result flows.

## 19–26. Physical and platform findings

- **Device/Safari/installed PWA:** UNVERIFIED. No model/version available. Native Safari edge-history interaction is protected by disabling custom handling, not claimed physically tested.
- **Keyboard:** existing search uses visualViewport handling; focused editing disables gesture. Browser input preservation is tested; real iOS software keyboard height, dismissal and selection handles are UNVERIFIED.
- **Safe areas:** `viewport-fit=cover`, sheet `dvh` height caps and `env(safe-area-inset-top/bottom)` already exist. No global padding change was justified. Runtime widths/theme/scaffold checks pass where listed; actual notch/Dynamic Island/home indicator insets are UNVERIFIED.
- **Background/resume:** existing absolute rest `endsAt` and completion deduplication remain. Browser reload/resume and stale-review checks are separate from OS background/force-close. Actual suspension/termination is UNVERIFIED.
- **Backup/Restore:** controlled clean-install ZIP restore and feature-state browser checks pass where listed. Actual iOS share/save/file picker and restored photo orientation are UNVERIFIED. No real user data erased.
- **Notifications:** ROOK explicitly describes page-lifetime best effort, not closed-app reliability; no backend or scheduling claim added. Permission denied/granted/restore and expired timer browser QA are separate from physical delivery. Physical/terminated delivery UNVERIFIED and not promised. Apple documents Home Screen Web Push support, which is not a local timer guarantee: [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
- **Offline:** service worker precaches app shell and current build and caches fetched immutable assets, excluding API responses. Browser feature-offline tests do not prove installed iOS offline launch or first installation. Physical offline launch UNVERIFIED.

## 27–29. Captures, review, remaining work

Current matrix captures: `artifacts/edge-back/`. Only numbered-by-width/theme feature captures are review material; any `FAILED-gesture` is a diagnostic from an earlier test run, not a current visual verdict. No screen recordings or physical-device recordings were made. Prompt: `docs/iphone-navigation-review-prompt.md`.

ChatGPT review: **APPROVED — no meaningful visual/UX issues remain.** Initially Work showed 0% remaining. On the user's requested retry, ordinary Chat was available in the same account, with Extra High selected. Sixteen current representative screenshots and the requested scoped prompt were submitted through the in-app browser. The review returned the exact approval above: [Review ROOK Screenshots](https://chatgpt.com/c/6a9ca0a0-dfb8-83eb-a77b-312ffbe41844). No purchase/reset/alternate account was used. Static approval is not gesture correctness or physical-device evidence.

## Physical iPhone handoff checklist (all unchecked)

Record device model, iOS version and separate Safari/installed mode results. Use a disposable test profile and verified backup; never erase the actual user's data.

- [ ] Safari: navigate with native Back; internal root/nested sheets retain visible Back/X; no custom edge trap.
- [ ] Install via Home Screen, reopen; test slow 33% commit, fast flick, short cancel, diagonal/vertical, multitouch and interruption on all three enabled flows.
- [ ] Flexible Week: available → mode; picker → destination → review → destination → picker; selection retained, no apply on Back.
- [ ] Adjust Today: all four modes, saved/custom equipment, manual replacement/query, review → configuration; root not dismissed and overrides not applied.
- [ ] Plan version → list; restore confirmation disabled for swipe; Back/Cancel preserve plan.
- [ ] Root drag down versus edge Back, long scrolling/sticky final CTA, body locked, no scrim flash, focus/VoiceOver Back reachable.
- [ ] Notch/top inset, X/Back, bottom nav/home indicator, all sticky CTAs and viewer edges.
- [ ] Actual keyboard: shared search, custom exercise name, gym name, import mapping, session note; input/CTA visible; dismiss returns viewport; text selection never navigates.
- [ ] Active KG/REPS/RIR/help, set complete, rest/Skip, previous/next, note, Replace, calculator and Resume without geometry changes.
- [ ] Today dates, Standard/Premium selection, Rest Day, active card, moved source/destination, Adjust Week; horizontal date gestures do not trigger Back.
- [ ] Background/resume workout/rest/reviews; force-close/reopen separately; stale review cannot overwrite current data or replay alerts.
- [ ] Real backup share/save and file picker restore in clean test profile; photos, blocks, Flexible Week/Adjust Today preserved.
- [ ] Camera/photo picker, thumbnail/viewer/timeline/delete/orientation; no upload.
- [ ] Notification explicit permission, denied, foreground, elapsed rest return; do not infer terminated reliability.
- [ ] Previously installed app launch offline and visit Today/workout/Adjust Today/Flexible Week/gyms/History/Progress/backup.
- [ ] One larger accessibility text size and VoiceOver; no clipping/overlap/hidden CTA.
- [ ] Landscape then portrait; viewport, sheet, nav and safe areas recover.
