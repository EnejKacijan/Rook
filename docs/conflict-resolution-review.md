# Focused plan-conflict resolution

## Scope and architecture

- The existing Edit plan card has a dedicated conflict state, not a new sheet.
- Movement conflicts show a solution-focused heading and an explicit replacement picker. Sets/reps, superset and Done controls return after resolution.
- `PlanConflictResolution.jsx` uses the existing strict substitution ranker and existing equipment/restriction filters. It excludes the source and duplicates already in the day. Candidate generation is lazy and memoized; search only filters the eligible result.
- No generic-catalog fallback or custom-equivalence guess is introduced. Symptom context preserves the existing restriction-review policy and does not recommend substitutions.
- Effort-only conflicts show the applicable minimum RIR, a constrained selector and explicit Apply Effort. Both correction paths edit the existing draft; the existing Save validation and persistence path remain authoritative.
- The next requested conflict expands automatically. Normal editing returns when the conflict clears.
- `revealPlanConflict.js` performs a 180ms ease-out, sheet-only reveal after the sheet's actual entrance animations finish. Long travel starts within the final 75% of the viewport. Reduced motion and already-visible targets are positioned instantly. User wheel/touch/pointer/key input and effect cleanup cancel pending animation; focus uses `preventScroll` after completion.
- No active-workout geometry, Today layout, normal editor fields or safety policy was redesigned.
- The external screenshot review found overlap during the existing 80ms reduced-motion sheet fade. Edit plan alone now appears immediately and fully opaque in reduced motion; the shared behavior of other sheets is unchanged. Reference screenshot capture now waits for settled animations/frames.

## Files

`src/App.jsx`, `src/overrides.css`, `src/PlanConflictResolution.jsx`, `src/PlanConflictResolution.test.jsx`, `src/revealPlanConflict.js`, `src/revealPlanConflict.test.js`, `scripts/edit-plan-opening-qa.mjs`, `scripts/conflict-resolution-qa.mjs`, `scripts/package-conflict-resolution-review.mjs`, `package.json`, and this report. Generated captures/packages remain ignored under `artifacts/`.

## Durable state and backup

No new durable fields, schema, migration or cache. Existing exercise identity/prescription fields are updated through the existing editor. Existing Backup & Restore QA passed, including data/photo round-trip. New runtime coverage verifies an effort correction persists after Save and reload, while selection alone does not change stored state. Simulated storage failure leaves the prior persisted plan intact and displays the existing storage warning.

## Verification

- Full suite: 46 files, 1017 tests passed (`npm test -- --maxWorkers=1`).
- 15 new tests cover candidate safety/exclusions, symptom/effort separation, lazy initial state, explicit selection, no candidate, last-exercise protection, constrained effort correction, animation duration/clamping, reduced motion and input/cleanup cancellation.
- Production build passed (409 modules); existing large-chunk advisory remains.
- Main runtime matrix: 12 cases, 320/390/430px × Standard/Premium Light/Dark. The real browser observed 13 distinct scroll positions in normal motion and 2 in reduced-motion cases, with correct final focus and sequential review.
- Edge matrix: 24 cases, 320/390px × four themes × effort/empty/search. Includes offline Save, reload, restoration of normal fields, no arbitrary search results, disabled last-exercise removal and simulated persistence failure.
- Regression scripts passed: planned-today, adjust-today, active-today, workout-flow, profile-logging, backup-restore, edit-plan-hierarchy, import-review-ux, training-restriction-plan.
- Motion/theme QA passed again after the scoped reduced-motion opacity correction. The main runtime matrix now samples sheet opacity on every captured animation frame and requires opacity 1.
- `git diff --check` passed.

## Visual evidence

- `artifacts/conflict-resolution/before/edit-plan-opening/`: fresh baseline flow captures.
- `artifacts/edit-plan-opening/`: final main flow (72 PNGs).
- `artifacts/conflict-resolution/states/`: edge states (64 PNGs).
- `artifacts/conflict-resolution/review.zip`: 148 original screenshots (12 before + 72 after + 64 edge) and scope/readme.
- External model visibly selected: GPT-5.6 Sol Extra High.
- Review conversation: https://chatgpt.com/c/6a9d2ffd-b484-83eb-852d-e2bdd3788531
- One design consultation recommended dedicated movement/effort resolution and bounded reveal motion, followed by two post-implementation screenshot reviews. The first requested the scoped opacity correction; the second returned exactly: **APPROVED — no meaningful visual/UX issues remain.** No anti-oscillation exception was needed.

## Limits

Desktop Chromium mobile-viewport QA is not physical iPhone/Android verification. Screenshots cannot prove motion or device-specific touch feel. No new medical-clearance interpretation or broad catalog fallback was added. No commit or push was performed for this refinement.
