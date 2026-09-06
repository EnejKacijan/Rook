# Fresh production visual/UX audit — 6 September 2026

Status: complete. Fresh internal audit, final-build runtime verification and one new GPT-5.6 Sol Extra High external review completed. No commit or push.

## Scope and evidence

Fresh real-app Chromium renders using deterministic synthetic fixtures. No production user records or personal photos are included. The final capture root is `artifacts/final-rook-review-2026-09-06-0318`; `RUN.json` records the build hash and each runtime script result. The package manifest will identify each original PNG, its timestamp, dimensions and SHA-256 hash. Earlier audit directories are internal investigation evidence, not the final upload.

The matrix covers the 24 numbered product areas requested, including completion feedback, advanced logging, offline/error paths and the shared modal scaffold. Main states use approximately 390px; dense/long cases include 320px; top-level cases include 430px. Four-theme supplemental runs cover areas whose original QA scripts had narrower theme coverage.

## Verified issues and conservative production fixes

1. Closing an enlarged exercise illustration restored focus to the sheet close button instead of the originating thumbnail. The existing modal initial-focus mechanism now honors the explicitly marked return target. No geometry change.
2. Standard Dark calendar date-range text retained a fixed light-theme green. It now uses the existing accent token. A 12-case width/theme contrast check protects this.
3. Dark onboarding plan-answer summary tiles retained translucent white backgrounds and light-theme text colors. They now use existing surface, secondary-text and primary-text tokens. Dark label/value contrast is checked during the real onboarding flow.
4. The Coach shorter-workout review's sticky action footer retained a white background in dark themes. It now uses the existing opaque surface token. Runtime QA checks that it matches the containing review card.
5. The selected Coach conversation title retained a dark fixed green in Standard Dark. It now uses the existing accent token, with a real-flow contrast assertion.
6. The optional physique-review link below training priorities had the same Standard Dark legacy-color issue. Its secondary action copy now uses the existing accent token.
7. Disabled primary buttons in Premium Light inherited an active gold fill, notably empty plan import and scratch-plan entry. They now use the existing disabled surface/text/border tokens, without changing their disabled logic or geometry.
8. An uncached exercise illustration showed the browser's broken-image icon after offline start/resume. Failed decorative artwork is now omitted and can retry on reconnect; the large viewer has a quiet unavailable message. Four hook tests cover failure, a different source, reconnect and listener cleanup; offline runtime QA asserts that no broken-image affordance remains.

No new feature, navigation, workout semantics, progression logic or active-workout geometry was introduced. KG / REPS / RIR alignment and the approved 11px help-mark spacing remain unchanged.

## QA tooling repairs

Stale assumptions were updated rather than changing approved UI to satisfy old tests: retired Profile equipment destinations, the optional-weight accessible label, current blocked-workout copy, migrated-plan comparison baselines, real persisted theme preferences, network-independent fallback timing, focus restoration timing, and scrolling a History row above its fixed Done dock before clicking it.

Screenshot capture waits for settled CSS animations and visible lazy thumbnails. Fixed modal captures use viewport screenshots. Intentional intermediate swipe frames and guide overlays are excluded from the external package. Restore Original and offline paths now capture the actual relevant visible state.

Two timing-sensitive measurements were also made atomic: Adjust Today header rectangles are read in one browser evaluation, and completion-animation styles are sampled by a MutationObserver in the class-change turn, rather than after several protocol round trips. Lazy-thumbnail capture readiness accounts for ancestor scroll clipping, not just the outer viewport. These changes preserve the assertions and production timing/geometry. Original failed attempts remain in `RUN.json`; explicit repaired-script verification is recorded separately in `RERUNS.json`.

The final runner discovers current package QA commands plus relevant standalone regression scripts. The upload builder includes only manifest-listed original PNGs, not stale directory contents, logs, source files, browser profiles or unrelated artifacts.

## External review protocol

A new in-app ChatGPT conversation was opened at `https://chatgpt.com/c/6a9cd0b6-60ec-83ed-9913-3d850de77d2a`. The UI visibly showed GPT-5.6 Sol / Extra High before the requested initial prompt was sent. ChatGPT acknowledged that it would wait for all batches. No previous approval is reused.

The final package contains 1,592 original PNGs across all 24 numbered folders, split into six ZIPs (approximately 4.9–16.0 MB each). `UPLOAD-INDEX.json` records counts and archive hashes. Internal contact sheets are navigation aids only and are not included in the external ZIPs.

All six archives were uploaded to that conversation. ChatGPT acknowledged receipt; the final four archives were explicitly reported readable. The exact `ALL BATCHES UPLOADED. Provide the consolidated review now.` message then started the consolidated review.

External review rounds: **1**, after the eight verified internal fixes above. ChatGPT reported all 1,592 PNGs across folders 01–24 reviewed and no actionable P1/P2/P3 visual defects. The final completed response was:

> APPROVED — no meaningful visual/UX issues remain.

No external-finding implementation/replacement round was necessary. No anti-oscillation stop was used. This is the new current-build verdict, not an earlier approval.

The visible response passed hierarchy/spacing/density/CTA priority; calendar semantics; back/X controls and sheets; active workouts and long names; four-theme equivalence; empty/error/offline/destructive states; browser-default control leakage; and factual, non-gamified tone. Touch, keyboard, swipe, persistence, notifications and physical safe areas remained explicitly unverified **by screenshots**. Separate automated runtime evidence is summarized below.

## Current final-build automated results

- Full suite rerun: 44 files / 1,002 tests passed (05:41 local time).
- Production build: passed, 407 modules. Existing advisory about a bundle over 500 kB remains; this visual audit does not introduce a code-splitting redesign.
- Rebuilt `dist/index.html` has the same SHA-256 as the screenshot manifest: `fd1e641d3ad6e971822566ec2c9a59901af3d72efec8ffaa3922d98ed6560d93`.
- Authoritative/package QA plus standalone flow checks: 79 distinct scripts have successful final results. Initial run was 77/79; Photo Compare capture readiness and the settled Profile RIR-help tap-target measurement passed explicit reruns after tooling-only repairs. Both original failures and successful reruns remain recorded.
- Supplemental four-theme matrix: 32/32 passed. Four additional 320px Coach-review theme runs passed. Updated modal-scaffold/physique-link assertion passed separately.
- Approved active-workout header QA: 12/12 passed, including unchanged row geometry, text centers, 44px help target and 18px icon.
- `git diff --check`: passed. Git reports line-ending conversion warnings, not whitespace errors.

## Verification boundaries

- Physical iPhone/iPad and Android device behavior: UNVERIFIED.
- Native notification delivery, fully terminated app behavior and real-device touch/keyboard ergonomics: UNVERIFIED.
- Browser-emulated viewport, pointer, keyboard, drag/back, persistence, backup and offline checks are separate runtime evidence; screenshots do not prove them.
- Coach visual fixtures use deterministic local/mock responses. They do not establish live provider availability or model-output quality.
- No push, commit, staging, history rewrite or deployment is part of this audit.

## Final handoff / requested report index

1. Package: `artifacts/final-rook-review-2026-09-06-0318/`; upload ZIPs are in `upload-batches/`.
2. Total: 1,592 original PNGs; 189 internal contact boards are not counted as screenshots or uploaded as originals.
3. Numbered coverage: all 01–24. `INDEX.md` in the package lists each product group and its count.
4. Model: GPT-5.6 Sol / Extra High, visibly shown in the in-app ChatGPT composer before and after the completed review.
5. External consolidated rounds: one.
6. Initial issues: eight internal implementation regressions listed above; no additional external actionable finding.
7. Implemented fixes: focus return, six scoped theme/contrast treatments, unavailable offline artwork handling.
8. Shared components: modal initial-focus resolution, reusable artwork-availability hook used in active/detail/enlarged illustration views, scoped semantic theme rules. No active-workout logging geometry changed.
9. Regression coverage: all 79 discovered QA scripts, 32 supplemental theme runs, four narrow Coach runs and an updated modal check; includes pointer/keyboard/drag/back, scrolling, logging, history correction, temporary-state reconciliation, backup/photos, offline/reload and mocked permission paths.
10. Full suite: 44 files / 1,002 tests passed.
11. Production build: passed, identical build hash to screenshots; non-blocking bundle-size advisory remains.
12. Diff check: passed, line-ending advisories only.
13. Final external verdict: `APPROVED — no meaningful visual/UX issues remain.`
14. Anti-oscillation: not invoked.
15. Physical devices: iPhone/iPad/Android, actual native notification delivery, terminated-app behavior and real-device safe-area/keyboard/touch ergonomics remain UNVERIFIED.
16. Not established: live Coach provider availability/output quality (mocked visual responses), real user datasets/photos (intentionally excluded), physical-device behavior. Extra duplicate width/theme captures not in the upload are explicitly listed in the manifest rather than claimed externally reviewed.
