# Whole-application consistency audit

## Authoritative source and scope

Use the latest remote commit of `codex/claude-visual-audit-oct30` in
`EnejKacijan/Rook`. Record `git rev-parse HEAD` as the input revision. This branch
already contains all integrated local follow-up fixes. Do not apply any previous
handoff patch, use `main` as the source, or replace current behavior with an older
snapshot. The user explicitly approved this snapshot refresh for GitHub access;
the next audit and its fixes remain for review only.

Review **the whole application, every screen and every meaningfully distinct
state**, then implement justified consistency improvements. The two new reference
images are examples that prompted this request. They do not limit the scope.
A review of just Profile, Today, the reference images, themes, or top-level tabs
does not satisfy the task. Include subpages and every nested sheet, menu, dialog,
disclosure, confirmation and recovery/error state.

Start the real application in your cloud workspace using the instructions in
`docs/claude-visual-audit.md`. No Claude Desktop, Remote Control connection,
local Windows folder, real account or private workout backup is required.

## Coverage inventory before editing

Discover the actual view tree from the application source, page/detail routes,
component exports, tests, `scripts/release-browser-manifest.mjs` and existing QA
scripts. Then visit it in the running application. Treat scripts as discovery
aids, not evidence of coverage. Add isolated synthetic fixtures using the real
components when an existing fixture does not expose a required state. Preserve
their development-mode, storage-isolation and account-sync guards.

Keep a coverage table with a row per screen/state and these fields:

- Unique identifier, parent flow, component/route and reproducible fixture.
- State and relevant conditions; width, appearance and theme inspected.
- Screenshot path, findings, change or justified unchanged decision.
- Retest result and any unresolved limitation or blocked state.

Mark a view reviewed only after opening it and inspecting its screenshot.
Code reading, passing tests and a working fixture URL are not visual evidence.
Use explicit statuses such as pending, inspected, fixed/rechecked and blocked.
Reconcile every discovered view against this table before the handoff.

Required areas include, but are not limited to:

1. First launch, the interactive intro, entry choices, plan generation and
   preview, custom blocks and muscle selections, import/paste/matching and edits.
2. Today, calendar/week selection, rest days, upcoming/past/completed days,
   active-workout notices, missed sessions and recovery, move/swap/combine,
   adjustment/review/apply/undo and optional training/workout library entry points.
3. Active strength workouts: exercise and set editing, previous values,
   progression guidance, records, warm-up/rest, reorder/replace/remove, notes,
   supersets, finish/early finish, completion and abandoned-workout recovery.
4. Conditioning and optional activity setup, intervals, active sessions,
   completion, history and correction screens.
5. Coach: new/ongoing/history conversations, composing, loading/failure states,
   contextual entry, action proposals, reviews, applied/rejected/superseded
   results, combined-workout and schedule workflows.
6. Progress: empty/populated history, all charts/statistics and their info,
   improvements and filters, exercise details/history, records, photos and
   timelines, history import/correction and deletion confirmation.
7. Profile: account summary, current program, streak and info, profile completion,
   training/personal/equipment settings, workout preferences, display/theme
   selection, help, data/backup/export/import/restore and destructive confirmations.
8. Authentication and recovery: signed-out and linked-account states, email
   sign-in, add/reset password, sync/loading/error/recovery and missing-data flows.
9. Shared overlays and supporting flows: exercise search/detail/create/edit,
   workout creation/library/use-today, every menu and nested sheet, info control,
   disclosure, snackbar/undo and confirmation.

Inspect empty and populated states, long labels, many items, disabled/error
states, open inputs, expanded details, existing active sessions, historical days
and pending changes wherever those affect presentation or behavior. Use synthetic
service responses for views requiring unavailable external services. Clearly
distinguish that UI coverage from testing real Google sign-in or a live AI model.

## Compare roles across screens

Before changing individual views, establish a small role matrix: primary action,
secondary action, navigation, selection, destructive action, information,
status/feedback, form control, disclosure, page header and overlay header/footer.
For each, choose established ROOK patterns and identify unexplained deviations.
Different roles can justify different appearances. Equal roles should follow
consistent rules. Do not force every element into the same card or button.

The Profile example specifically mixes an outlined account card, a flat current
program section and rule, a filled streak surface, a left accent for profile
completion, and flat settings rows. Assess which distinctions communicate a
useful role and which add visual noise. Apply the same reasoning throughout the
application, not only to those five elements.

Compare and improve:

- Type size, weight, line height, case and tracking for equivalent roles.
- Alignment, spacing rhythm, padding, touch areas and corner radii.
- Surfaces, borders, separators and nested/adjacent rules; avoid doubled lines.
- Navigation versus immediate mutation, selection and destructive actions.
- Chevrons, overflow, back/close, info controls and their placement.
- Press/focus feedback and open/close/expand motion, including reduced motion.
- Redundant copy, repeated headings and appropriate secondary information.
- Theme tokens, readability and contrast across appearances and accent families.
- Focus rings, keyboard layout, safe areas, fixed footers/navigation, clipping,
  unintended horizontal scrolling and scroll beyond content boundaries.

Fix shared ownership/components/tokens where appropriate. Avoid a growing stack
of competing screen-specific overrides. Preserve the brand and theme families;
this task is a consistency audit rather than a new art direction. Make changes
because they solve observed problems, not to produce a difference everywhere.

## Visual verification and evidence

Inspect every screen at 320, 393 and 430 px, in light and dark appearance. Use
additional theme accents to validate shared styling. Check enlarged text at
130% and 200%, 200% browser zoom, keyboard focus and reduced motion for each
distinct layout/control pattern. Let text reflow and controls grow; retain at
least 44 px touch areas and readable inputs. Do not shrink text merely to fit.

Capture before/after of the same state and viewport for every affected view,
including downstream consumers of shared styles. Check interactions as well as
static frames: opening and closing, focus restoration, scrolling and input
editing. Recheck actual running screens after implementing fixes. Do not replace
them with static mockups or claim real phone-keyboard testing from a low viewport.

If an environment limitation prevents a required view or interaction, record the
exact gap and continue independent coverage. Do not call the entire app reviewed
while undisclosed gaps remain. The final inventory must include unchanged and
blocked screens, not just an attractive selection of changed examples.

## Boundaries, checks and delivery

Preserve training/account behavior, persistence, ownership, prescriptions and
scheduling semantics. Use only synthetic data and never upload credentials or
real user backups. Do not add premium restrictions, subscriptions or paywalls.
Implement justified reversible visual fixes without asking for approval for
every screen or stopping after advice alone.

Run relevant existing tests and the production build. After broad shared changes,
run the full suite as well. Investigate failures and compare with the unmodified
input revision before calling them pre-existing; CSS-only scope is not proof.
Do not weaken validations or tests to obtain a pass.

Return the full coverage inventory, role rules, concrete changes and unchanged
decisions, matched before/after screenshots, test/build results and remaining
gaps. Include an actual downloadable patch against the recorded input commit,
its SHA-256 and a successful `git apply --check` result on that clean revision.
The application of the patch must recreate your final source tree.

No commit, push, PR, merge, deployment, build hook or hosting/account change is
authorized for this next audit. Retain `netlify.toml`'s `build.ignore = "exit 0"`.
