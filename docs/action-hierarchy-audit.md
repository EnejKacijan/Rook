# ROOK semantic action audit

## Taxonomy

- **Primary:** the main next/commit action, existing `Button` default / `.button.primary`, existing theme accent fill and on-accent foreground. Standard Light retains its established light foreground; no blanket near-black override.
- **Secondary:** substantial optional alternatives use existing `.secondary` neutral outline. Optional does not become primary merely because it is clickable.
- **Tertiary:** navigation/escape/context uses existing `.quiet` or text/row controls, preserving hit targets and focus behavior.
- **Destructive:** existing red semantic text (`--rook-error-text`); existing filled destructive confirmation patterns use explicit `variant="danger"` and the already-used logout red `#9b302a`, not `.primary`/Premium gold. Disabled destructive buttons use existing disabled tokens.

## Production actions changed

1. Correct History discard confirmation: KEEP EDITING secondary → primary. DISCARD CHANGES now has a defined, theme-safe destructive text rule (its previous `danger-text` class had no general definition).
2. Correct History remove-added-set/segment confirmation: KEEP secondary → primary; REMOVE now receives the same destructive text rule.
3. Logout's LOG OUT AND DELETE DATA: explicit destructive variant replaces the misleading primary variant; the existing filled-red confirmation pattern remains. BACK UP FIRST remains the safe primary.
4. Confirmed DELETE GYM: explicit destructive variant; disabled delete stays disabled, not gold.
5. Confirmed Today SKIP WORKOUT / MAKE REST DAY / REMOVE FROM FUTURE / REMOVE FROM PLAN and RESTART WORKOUT: explicit destructive variants retain their existing destructive confirmation patterns.
6. Plan-version restore confirmation CANCEL: outlined → quiet, subordinate to RESTORE VERSION.
7. Gym DELETE GYM entry, custom exercise Delete exercise entry, DELETE CHECK-IN, conflict REMOVE EXERCISE, alias REMOVE, and Remove note: use the shared destructive text token instead of warning/neutral/accent or a dim fallback.
8. Custom exercise confirmed DELETE: reuse the existing filled destructive red rather than an independent fallback.
9. Imported exercise REMOVE in Premium: replace fixed pale red with the brightness-appropriate destructive token.
10. Photo DELETE PHOTO (entry and confirmation, including inline delete): protect destructive color from generic dark-button overrides. Runtime QA exposed a white destructive confirmation in Dark. The always-dark private viewer retains its established `#ef8a82` red through a local semantic token.
11. Existing normal Edit plan REMOVE now resolves through the shared destructive rule; its already-correct red value is retained.

## Intentionally unchanged production actions

| Area | Kept primary | Kept optional/secondary/tertiary and why |
| --- | --- | --- |
| Today | START WORKOUT; REVIEW 2 CONFLICTS | View Workout/destination, Adjust Today, Adjust Week, Train today instead, block metadata remain subordinate/contextual |
| Active workout | NEXT EXERCISE; main progression/next controls | Finish, notes, replace, skip rest and optional controls retain established density; set inputs/selected states are not action hierarchy |
| Completion | Existing Done/next action | Photo, Session Note and optional subjective feedback remain optional |
| Correct History / Edit Workout | SAVE CHANGES | Cancel/Back to Edit keep escape/navigation semantics |
| Edit Plan | SAVE CHANGES / accept imported plan | Back, Add Exercise, optional custom-create entry, Remove/Undo, expansion/reorder remain contextual |
| Adjust Today | USE THIS WORKOUT | Mode choices, Cancel and optional Restore Original remain subordinate; applied viewer is not a new commit review |
| Flexible Week | USE THIS SCHEDULE | Cancel, Adjust Week, Show More Dates and Restore Original Schedule remain text/contextual |
| Gym Profiles | SAVE GYM | Add Gym is optional; list rows and default selections remain controls |
| Smart substitutions | Existing actual replacement selection | Wider search, optional preference and custom creation are not promoted to main CTA |
| Plate Calculator | SAVE PLATE SETUP | Calculator/config navigation and nearest-load alternatives remain optional |
| Plan History | Confirmed RESTORE VERSION; existing selected-version entry | History navigation/current-version disabled state unchanged |
| Training Blocks / Next Block | SAVE BLOCK; START NEXT BLOCK / REPEAT BLOCK | Edit Block entry, outcome rows, replacement choice and Cancel remain subordinate |
| Coach | APPLY CHANGES and existing accepted-action CTA | Review alternative, Cancel and conversational controls retain current hierarchy |
| Photo timeline / compare | Existing compare selection completion where applicable | Timeline/viewer navigation and photo choice remain quiet; no filled chrome added to photos |
| Custom exercises | CREATE EXERCISE / SAVE DETAILS | Library navigation, metadata selections and aliases keep their existing layout |
| Historical Import | IMPORT WORKOUTS / accepted-plan commit | Source selection, matching and file navigation remain contextual |
| Export Plan / History | Existing Export or main Share/Copy action | Alternate handoff/download and include-notes controls stay subordinate |
| Backup / Restore | CREATE BACKUP; confirmed RESTORE BACKUP | Create-without-unavailable-photos, download retry and Cancel remain alternatives |
| Onboarding | Continue / accept plan | Optional preferences, Back and selected answer chips are unchanged |
| Training Restrictions | SAVE RESTRICTIONS / SAVE & APPLY / required REVIEW | Optional context and navigation remain quiet |
| Settings | Existing explicit Save where present | Logging/appearance switches apply immediately; no invented Save or primary treatment |

## Components, geometry and verification

No callbacks, storage logic, disabled conditions, copy, sheet dimensions or logging geometry were changed. Existing `Button`, `SheetActionFooter`, primary/secondary/quiet classes and theme tokens remain authoritative. `actionHierarchy.css` only defines semantic destructive styling; it is not a new footer or button geometry system.

`scripts/action-hierarchy-qa.mjs` checks 320/390/430 × four themes, saves fresh screenshots, verifies Keep Editing retains the draft, Discard does not write History, checks enabled/disabled Save, primary-vs-destructive styles, disabled destructive CSS, backup/restore and photo deletion confirmations. Photo fixtures are generated color blocks, not personal photos. Component tests cover safe-primary/destructive roles, unchanged draft retention and existing discard callback.

Focused review packaging retains all four themes at 390 plus 320 Dark and 430 Premium Light, and includes explicit restriction, Adjust Today, Flexible Week and Next Block references. Full runtime captures remain available separately.

No commit or push. Pre-existing unrelated working-tree changes are preserved.

## Final validation

- Full suite: 1044/1044 tests, 50/50 files passed (`npm test -- --maxWorkers=2`).
- Production build passed (415 modules; existing large-chunk warning only).
- `git diff --check` passed.
- Action hierarchy: all 12 viewport/theme cases passed, including disabled and destructive semantics and unchanged draft callbacks.
- Edit-plan opening: all 12 cases passed; required conflict review remains primary.
- Adjust Today, Flexible Week (12 cases), and Block Review (12 cases plus edge cases) runtime QA passed.
- Gym Profiles and Custom Exercise/Alias runtime QA passed. History Correction passed all 12 theme/width cases plus advanced sets, per-side, long content, notes, cancel/escape/close/drag, offline, lb, timed and clean-profile backup restore.
- 82 fresh original screenshots reviewed using GPT-5.6 Sol Extra High; first consolidated review returned: **APPROVED — no meaningful visual/UX issues remain.**
- Review: https://chatgpt.com/c/6a9d6415-a890-83eb-bc74-79be400b4b6e
- Screenshot package: `artifacts/action-hierarchy-review.zip`; full semantic captures: `artifacts/action-hierarchy/`.
- Desktop browser responsive QA is not physical iPhone/PWA verification.
