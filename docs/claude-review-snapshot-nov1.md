# ROOK review snapshot — 1 November 2026

This branch refresh is explicitly authorized only to make the current source
available to Claude on GitHub. The branch is `codex/claude-visual-audit-oct30`;
its previous published revision was `e27689e9b165649ca95e5f4afbc1918a167b3b5d`.
Use the latest branch commit, not that older snapshot. Do not reapply downloaded
patches. No merge, PR, release, Netlify deployment or hosting change is authorized.
The commit retains `[skip netlify]` and the unchanged `netlify.toml` guard.

## Integrated source

- Whole-app consistency K01–K14, including the recovery-sheet footer, title,
  action case, error color and English activity date. The invalid duration
  border now also uses the error color in Light.
- Uniform missed-workout summary placement on Today/rest days and bounded
  recovery, preserving Hide/Undo and schedule semantics.
- Coach legacy-result cancellation guards, compact layout, review navigation
  and block-review presentation fixes.
- Calm weekly progress: completed/pending meter only, with a separate neutral
  in-progress label and the one-time completion transition.
- Compact whole-row Profile streak navigation. Best, six-week calendar, open
  current week and distinctions between missing history/missed weeks live in
  the existing shared sheet. The original weekly counting rules remain.
- Feasible privacy/legal checklist implementation: separate default-off AI
  sharing and diagnostics choices, request-boundary minimization, static draft
  legal pages, source/license notices, data-rights links and supporting checks.
  The compatible production dependency update fixes the reported RE2JS issue.
- Development-only isolated review fixtures and their guards.

The new weekend streak reminder is **not implemented** in this snapshot. Its
brief is `docs/claude-streak-reminder.md`.

## Important boundaries for the next task

The legal pages remain drafts/noindex, with publication approval false.
Verified operator identity/contact, operational erasure intake, provider/legal
review and remaining upstream license-notice gaps are unresolved. Do not invent
business details or treat the GitHub review push as approval to publish policies.
See `docs/legal-privacy-audit.md` and `src/legalOperator.js`.

Do not restore former large streak cards, inline Best on the Profile hub,
dotted animated active-progress bars, permanent surprise preference changes,
or old duplicated separators. Current reference screenshots below are synthetic
captures of the actual app, not an exhaustive coverage claim.

## Checks already completed

- Broad privacy/integration checkpoint: 7,397 tests passed, eight skipped,
  no failures; 470 files passed and one skipped. This full run preceded the
  final narrow weekly/streak/K14 follow-ups.
- Weekly indicator: 21 targeted tests passed; build passed.
- Streak detail follow-up: 91 targeted tests passed, then 21 shared-modal/streak
  tests after async test cleanup; overlapping runs, not 112 unique tests.
- K14 follow-up: 35 targeted tests passed (ActiveWorkout recovery, workout
  timing, ModalLayer quality/focus and theme text roles); final build passed.
- No new full-suite run after the last narrow follow-ups. Existing non-failing
  ModalLayer quality fixture warning and bundle-size warning are documented.
- Production dependency audit at the checkpoint reported no vulnerabilities.
- Cumulative local source patch checked successfully against a clean HEAD
  index before this branch refresh. Actual index was untouched until staging
  this explicitly requested snapshot.

## Review without personal data

Run with the repository lockfile, Node 24 and account rollout disabled:

```sh
npm ci --ignore-scripts
VITE_ROOK_ACCOUNT_SYNC_ROLLOUT=false npm run dev -- --mode theme-preview --host 0.0.0.0 --port 4400 --strictPort
```

Useful source fixtures:

- `/review/streak-detail-preview/?scenario=open` — positive streak, current
  week still open. Also `one`, `empty`, `gap`, `large`; `appearance=light`,
  `palette=champagne`, `text=200`.
- `/review/weekly-progress-preview/?scenario=active&palette=forest` — active
  workout shown separately from the completion meter.
- `/review/workout-recovery-preview/` — real ActiveWorkout recovery.
  `appearance=light`, `legacy=1`, `sets=0`, `text=200` cover variants.
- `/review/privacy-preview/` — guarded synthetic privacy/consent UI.

The new streak/recovery/privacy fixtures use memory-backed scoped storage to
avoid changing user records or depending on room in a shared localStorage.
The older plan-workout fixture encountered a full localhost storage quota in
this desktop session; no real data was cleared to work around it.

Reference captures under `docs/visual-audit-reference/`:

- `nov1-weekly-calm-green-393.jpg`
- `nov1-profile-streak-row-393.jpg`
- `nov1-streak-detail-393.jpg`
- `nov1-recovery-dark-393.jpg`
- `nov1-recovery-error-light-320.jpg`

Actual phone keyboard/safe-area behavior, spoken screen-reader output, real
Google login and live AI-provider requests were not validated by these captures.
Use synthetic state; do not request Desktop/Remote Control or private backups.
