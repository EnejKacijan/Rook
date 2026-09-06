# Edit plan opening and restriction-review handoff

Completed 6 September 2026. No commit/push.

## Change

- Normal Edit plan no longer filters the entire catalog or ranks alternatives for every closed exercise picker before painting.
- Custom/catalog lookup data is memoized; allowed catalog filtering is deferred to an opened picker/add selector and reused during its updates. Preview substitution ranking only runs for the opened picker. The duplicate initial draft preparation/reset is removed.
- Add/replace commands still validate the selected exercise against the current profile. Restriction and progression rules are unchanged.
- A concrete blocked Today conflict now uses the existing primary theme button: `REVIEW CONFLICT` or `REVIEW N CONFLICTS`. General unresolved restrictions retain their separate existing action.
- The existing editor opens the applicable exercise. It waits for real entrance animations and the expanded DOM, scrolls only the sheet, and focuses the non-input card without opening a keyboard. A restrained accent outline and `RESTRICTION CONFLICT` explanation identify the target.
- Resolving one requested conflict reveals the next; a resolved card loses its conflict treatment. No automatic plan save or workout start is introduced. Effort conflicts use effort-specific wording.

## Performance evidence

Earlier production measurement: 306 ms from click to the following rendered frame, returning-user fixture with 24 exercises, 390px Chromium, CPU profiler enabled.

Same fixture/viewport/instrumentation after the change, with the machine no longer running the test suite concurrently: 94, 95, 98 ms. This is a local comparative measurement, not a physical-device guarantee or universal latency budget.

## Verification

- Full suite: 44 files, 1,002 tests passed.
- New `qa:edit-plan-opening`: 12 combinations, 320/390/430px × Standard/Premium Light/Dark, including reduced motion. Actual persisted theme attributes are asserted, not merely inferred from filenames.
- Real-flow checks: late-plan target, two different conflicting exercises, sequential reveal/focus, blocked Start, filtered replacements, unchanged saved plan while editing, explicit Save, restored Start, unchanged restrictions, no browser errors.
- Existing edit-plan hierarchy, import-review UX, plan reorder, scratch plan and training-restriction plan QA all passed.
- Production build and `git diff --check` passed. Existing bundle-size and Git line-ending advisories are not errors.
- Active-workout logging geometry was not changed.

The two-conflict fixture uses distinct exercises because canonical plan normalization intentionally deduplicates duplicate exercise IDs. The shared sheet header intentionally bleeds into clipped side insets; card containment is checked separately from that existing decorative header extent. No shared header geometry was changed to satisfy a test.

## Visual review

The first attempt was blocked by Work usage. The user asked to retry; the subsequent in-app session succeeded with **GPT-5.6 Sol Extra High visibly selected**.

Conversation: https://chatgpt.com/c/6a9d2ffd-b484-83eb-852d-e2bdd3788531

One recommendation exchange and one post-implementation visual review. The model recommended the primary contextual CTA, explicit conflict label/outline, non-input focus and sequential instant reveal. These were implemented conservatively using the existing sheet and safety semantics.

72 fresh real-app PNGs: `artifacts/edit-plan-opening/`; uploaded as `review.zip`. States: normal editor, blocked Today, first target, picker, next target, saved/resolved Today. Synthetic fixtures only.

Final completed response:

> APPROVED — no meaningful visual/UX issues remain.

Physical touch/keyboard/device behavior remains unverified. Screenshots do not prove persistence or scrolling; those have separate Chromium runtime checks above. No anti-oscillation stop was needed.
