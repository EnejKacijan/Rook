I am attaching a Claude Design export named:

`Fitness App Design System.zip`

It contains the complete visual/product design for a mobile fitness PWA, including:

* the visual system
* a tappable Today → Active Workout → Finish flow
* the full screen board
* interaction states
* realistic example content

Treat this Claude Design as the PRIMARY VISUAL SOURCE OF TRUTH.

Do not redesign the product.

The design is already approved.

Your job is to turn it into a real, functional, production-quality mobile PWA while preserving the visual hierarchy, spacing, typography, component language, interaction patterns, and simplicity of the supplied design.

---

# 1. FIRST: INSPECT EVERYTHING

Before implementing:

1. inspect the entire attached ZIP
2. inspect `Lift - Mobile App.dc.html`
3. inspect its supporting assets/scripts
4. identify every designed screen/state
5. identify reusable components and design tokens
6. inspect the current repository, if one already exists
7. understand the data model and navigation required

Do not blindly copy Claude Design's generated HTML.

The `.dc.html` file is a DESIGN SPEC / interactive prototype, not necessarily production architecture.

Translate it into proper reusable application components.

Do not depend on Claude-specific `<sc-if>`, `<sc-for>`, or design-runtime components in production.

---

# 2. PRODUCT CONCEPT

The product principle is:

**A workout plan that progresses with you.**

The AI builds a personalized weekly training plan.

The app remembers previous workouts.

Logging should require almost no typing.

The user mainly changes weight/reps using `− / +` controls.

Progressive overload logic helps determine what the user should attempt next.

The Coach understands the user's actual program and training history.

Do not turn this into a generic workout database or feature-heavy bodybuilding app.

---

# 3. PLATFORM

V1 is:

* mobile-first PWA
* phone only
* optimized primarily around ~375–430px width
* touch-first
* installable as a PWA
* no desktop-specific product UI required yet

Make the layout robust at approximately:

* 360px
* 375px
* 390px
* 430px
* 500px

Do not build a separate desktop dashboard.

On wider screens, simply keep the mobile application contained appropriately.

---

# 4. PRESERVE THE APPROVED VISUAL SYSTEM

The supplied design uses:

* warm off-white canvas
* near-black ink
* restrained green accent
* muted supporting colors
* system sans typography
* tabular figures for training numbers
* strong hierarchy
* intentional whitespace
* rounded but restrained controls
* minimal visual clutter

Reuse the exact visual principles from the design.

Extract reusable tokens for:

* colors
* spacing
* typography
* radii
* borders
* control heights
* button states
* tabular-number styles

Do NOT introduce:

* gradients
* neon fitness colors
* random shadows
* excessive cards
* gamification styling
* new visual motifs
* a different design system

Only deviate from the design when required for usability, accessibility, responsive safety, or a missing functional state.

---

# 5. MAIN NAVIGATION

Bottom navigation:

* TODAY
* COACH
* PROGRESS
* PROFILE

Preserve the visual treatment from the supplied design.

Make the navigation persistent where appropriate without covering page content.

Respect mobile safe-area insets.

---

# 6. ONBOARDING

Implement the short structured onboarding shown in the design.

Capture only information that materially changes the training plan, including the designed concepts such as:

* goal
* experience
* days per week
* session duration
* training environment/equipment
* priorities
* exercises/preferences to avoid

Then support a small AI follow-up phase.

AI follow-up should normally ask only a few material questions, not conduct a long interview.

After onboarding:

`Build my plan`

generates the personalized weekly plan.

Persist onboarding/profile answers.

Do not ask the user to complete onboarding again on every launch.

---

# 7. PROGRAM GENERATION

The generated program must be STABLE.

Do not regenerate exercises randomly every day.

Persist:

* program
* workout days
* exercises
* sets
* rep ranges
* progression settings
* exercise order
* default rest duration
* weight increments

The program should change only through deliberate mechanisms such as:

* user request
* Adjust Program
* schedule/equipment changes
* exercise substitution
* accepted Coach recommendation
* explicit rebuild
* future programmed review logic

AI must not silently rewrite the program.

---

# 8. TODAY

Implement the approved Today screen faithfully.

It should answer immediately:

**What am I doing today?**

Include the designed:

* week strip
* current workout
* estimated duration
* last completed information
* exercise preview
* START WORKOUT
* rest-day state

Tapping the week should allow viewing the relevant planned days without turning the app into a complex calendar manager.

---

# 9. ACTIVE WORKOUT — HIGHEST PRIORITY

This is the most important part of the entire application.

Spend disproportionate QA effort here.

Use the exercise-at-a-time interaction from the supplied design.

Do NOT replace it with one enormous scrolling workout form.

For the current exercise show:

* exercise name
* current position in workout
* target sets / rep range
* previous-session result
* today's sets
* progression suggestion where relevant
* Replace action
* Up Next

Set logging must be extremely fast.

---

# 10. SET CONTROL

Implement the designed row:

SET #

KG:
`−   80   +`

REPS:
`−   10   +`

COMPLETE:
`✓`

Important:

* minimum comfortable mobile touch targets
* tabular numeric figures
* immediate response
* no unnecessary confirmation
* completed state remains visible
* tapping a completed set can allow correction/reopen according to the design

Do not require the keyboard for ordinary logging.

---

# 11. DIRECT NUMBER ENTRY FALLBACK

Even though `− / +` is the primary interaction:

tapping the actual weight or reps number should allow direct numeric entry.

Examples:

tap `80`
→ numeric keyboard
→ user can type `82.5`

tap `10`
→ numeric keyboard
→ type reps directly

This is a fallback for large changes.

The stepper remains the default interaction.

Validate numeric input safely.

---

# 12. EXERCISE-SPECIFIC INCREMENTS

Support configurable increments.

Defaults follow the designed idea, such as:

* barbell: 2.5 kg
* dumbbell: 2 kg
* machine/cable: 5 kg
* reps: 1

Allow per-exercise override.

Do not expose increment settings in the active workout UI.

They belong in Logging/Profile preferences.

---

# 13. PRE-FILL FROM PREVIOUS WORKOUT

This behavior is essential.

When starting an exercise, prefill today's sets from the most relevant previous session.

Example:

Previous:

80 × 10
80 × 10
80 × 9

Today starts with:

80 / 10
80 / 10
80 / 9

The user then changes only what differs.

Do not force users to re-enter the entire workout.

---

# 14. ACTIVE WORKOUT PERSISTENCE — CRITICAL

An active workout must survive:

* accidental refresh
* browser/PWA reload
* tab switch
* temporary app backgrounding
* browser crash where feasible
* user reopening the PWA

Persist current workout state incrementally.

After every meaningful change, safely save:

* active workout ID
* current exercise
* completed sets
* current weight/reps
* elapsed workout time
* rest timer state where appropriate

If the user returns with an unfinished workout, offer:

`Resume Upper A`

Do NOT lose completed sets.

This is critical for a gym app.

---

# 15. OFFLINE / POOR CONNECTION BEHAVIOR

A user may train in a gym with poor reception.

Core workout logging must NOT require a live AI/network request.

The following should work locally/offline once the program exists:

* open Today
* start workout
* navigate exercises
* modify kg/reps
* complete sets
* rest timer
* finish workout
* view recent workout history

AI Coach functionality may require connectivity.

If offline:

* preserve user data locally
* show a calm offline state for AI-only features
* sync when appropriate if the architecture supports remote persistence

Do not block workout logging because an AI/network provider is unavailable.

---

# 16. REST TIMER

Use the approved behavior:

set ✓
→ rest timer automatically starts

Use sensible defaults based on exercise type/program data.

Keep it visually minimal.

Allow:

* dismiss
* extend/reduce if supported cleanly
* continue logging when timer finishes

Do not make the timer a large disruptive modal.

Persist enough timer state that a brief background/foreground cycle behaves sensibly.

---

# 17. OPTIONAL RIR

RIR is OFF by default.

If enabled in Profile/Logging:

allow quick RIR input.

Do not expose RIR in the default beginner UI.

Do not make it mandatory.

---

# 18. PROGRESSIVE OVERLOAD ENGINE

Implement progressive-overload logic as a deterministic application layer where possible.

Do not delegate every progression decision to an LLM.

Example double-progression behavior:

Target:
3 × 8–10

If user achieves:

80 × 10
80 × 10
80 × 10

→ candidate recommendation:
increase weight next session

If:

80 × 9
80 × 8
80 × 7

→ continue at the same weight and build reps

The exact implementation should be inspectable and consistent.

Use exercise increment configuration.

Do not increase weight silently.

---

# 19. PROGRESSION SUGGESTION

Match the approved design principle:

show one concise progression recommendation with an explicit action.

Example:

READY TO PROGRESS

Try 82.5 kg next time.

`USE`

The recommendation does NOT change the working values automatically unless the user accepts it.

The user always retains control.

---

# 20. FINISH WORKOUT

Implement the supplied completion screen:

* workout name
* duration
* sets
* meaningful progress
* concise Coach note
* Done
* optional review

Avoid meaningless celebration/gamification.

Persist the completed workout before navigating away.

Ensure progression calculations update after completion.

---

# 21. WEEKLY PLAN

Implement a lightweight weekly-plan overview.

The user should be able to:

* view planned workouts
* inspect a workout
* recognize completed workouts/rest days
* move a workout if supported by the approved design
* ask Coach to adjust the week

Do not implement a complex calendar editor.

---

# 22. COACH

Coach is context-aware.

It must have access to:

* onboarding/profile
* goal
* experience
* current program
* workout schedule
* completed workout history
* exercise performance
* progressive overload status
* missed workouts
* preferences

The Coach should be:

* direct
* concise
* useful
* not motivational/chattery

Example style:

“You reached the top of the rep range on all three bench sets. Increase to 82.5 kg next session.”

Not:

“Amazing job! You're crushing it 🔥🔥🔥”

---

# 23. COACH ACTIONS

Where the Coach proposes an actionable program change, require explicit acceptance.

Examples:

* Apply to today
* Replace exercise
* Move workout
* Update next-session target

AI text alone must not silently mutate the program.

Separate:

AI suggestion
→ user accepts
→ deterministic application mutation

---

# 24. ADAPT TODAY

Implement the approved concept.

User:

`I only have 35 minutes today.`

Coach may return a shortened version of today's workout.

Show exactly what changes.

Example:

Keep:

* Bench Press
* Chest Supported Row
* Overhead Press

Skip today:

* Lat Pulldown
* Lateral Raise

Estimated ~34 min

`APPLY TO TODAY`

Applying modifies today's session only unless explicitly stated otherwise.

Do not rewrite the entire stored program unintentionally.

---

# 25. EXERCISE SUBSTITUTION

Support Replace Exercise.

Replacement should preserve training purpose as well as possible.

The UI should remain lightweight.

When replacing:

* retain relevant set/rep structure if sensible
* use the replacement's increment configuration
* clearly distinguish one-time replacement vs program-level replacement if both are supported

Never silently replace an exercise.

---

# 26. PROGRESS

Implement the restrained Progress design.

Focus on useful metrics:

* strength progress
* consistency
* recent meaningful progress
* progression status

Do not add a dozen charts because data exists.

---

# 27. EXERCISE DETAIL

Implement exercise-specific history.

Show:

* current working weight
* simple trend
* recent sessions
* kg
* reps by set
* progression status

Keep the chart readable.

Historical sessions must remain immutable unless explicit edit support is intentionally implemented.

---

# 28. PROFILE

Implement the supplied Profile structure.

Include:

* current program
* goal
* experience
* schedule
* session length
* environment/equipment
* priorities/preferences
* exercises to avoid
* units
* RIR
* default increments
* per-exercise increment overrides
* rest timer
* Adjust Program
* Rebuild Program

Keep it simple.

---

# 29. DATA MODEL

Design a clean persistent model for at least:

UserProfile

TrainingPreferences

Program

ProgramDay / WorkoutTemplate

ExerciseDefinition

ProgramExercise

ActiveWorkout

WorkoutSession

CompletedExercise

SetLog

ExerciseProgress

CoachConversation / messages if needed

Do not store everything as one huge JSON blob unless there is a strong architectural reason.

Separate:

* reusable program definitions
* active workout state
* immutable-ish completed workout history

---

# 30. IDs AND HISTORY

Use stable IDs.

Do not identify exercises/program entries purely by display name.

Editing current program must not retroactively rewrite historical workout logs.

Past workout sessions should preserve snapshots needed to render them accurately later.

---

# 31. AI ARCHITECTURE

Do not hardcode the product to one particular model/provider throughout the UI layer.

Create a clear AI service boundary.

AI tasks may include:

* initial plan generation
* onboarding follow-up
* Coach conversation
* adaptation suggestions
* exercise substitution suggestions

Use structured outputs/schema validation for AI-generated application actions.

Never execute arbitrary AI text as application mutations.

Validate outputs before applying them.

---

# 32. SAFETY / FITNESS SCOPE

Keep Coach language within general fitness coaching.

Do not make medical diagnoses.

If the user describes injury/pain or a situation beyond general training guidance, provide appropriate conservative handling rather than confidently prescribing treatment.

Do not overstate precision of AI-generated programs.

---

# 33. PWA

Implement proper PWA behavior:

* manifest
* app name
* icons/placeholders if final brand assets are not supplied
* installability
* mobile viewport
* theme colors
* safe-area handling
* standalone display
* appropriate caching strategy

Do not cache AI responses in a way that creates incorrect stale program mutations.

---

# 34. ACCESSIBILITY

Ensure:

* touch targets are comfortable
* controls have accessible names
* sufficient contrast
* focus states
* semantic buttons
* numeric inputs have appropriate input modes
* screen is usable without precision tapping

The design can remain visually minimal while being accessible.

---

# 35. LOADING / EMPTY / ERROR STATES

The design board cannot contain every runtime state.

Create states that are visually derived from the approved system for:

* generating plan
* AI request failed
* offline Coach
* no completed workouts
* no progression data yet
* empty history
* program generation failure
* saving failure
* resuming active workout
* no workout today
* no replacement suggestions

Do not invent a new visual language for these states.

Keep them calm and minimal.

---

# 36. DESTRUCTIVE ACTIONS

For destructive operations such as rebuilding/replacing meaningful program state:

use appropriate confirmation.

For low-cost reversible actions, prefer lightweight undo where sensible.

Do not litter the app with confirmation dialogs.

---

# 37. MINOR POLISH ALLOWED

I approve the supplied visual design.

Do not conduct another subjective redesign.

You MAY make small changes when required for:

* preventing overlap
* mobile safe areas
* keyboard behavior
* accessibility
* touch targets
* loading/error states
* long text
* real data edge cases
* functional clarity
* responsive behavior

If you make a visual deviation from the source design, it should have a concrete usability/technical reason.

---

# 38. DO NOT ADD V1 FEATURE CREEP

Do not add:

* social feed
* friends/followers
* leaderboards
* badges
* nutrition tracking
* sleep tracking
* body measurements
* Apple Health
* huge exercise video library
* complex periodization editor
* recipe functionality
* community functionality
* elaborate gamification

Build the approved core exceptionally well.

---

# 39. IMPLEMENTATION APPROACH

First give yourself a short implementation plan based on:

* repository architecture
* design components
* data model
* navigation
* persistence
* AI boundaries

Then implement.

Do not stop after scaffolding.

Build the application end-to-end.

Reuse components rather than duplicating each screen independently.

Examples of reusable components likely include:

* phone shell/layout
* bottom navigation
* week strip/day chip
* exercise row
* set stepper
* completed set state
* progress recommendation
* workout header
* rest timer
* Coach action card
* section heading
* trend/history row
* toggle
* primary/secondary action

---

# 40. TEST THE REAL INTERACTIONS

Do not only test that pages render.

Actually exercise the core flows:

## First run

onboarding
→ follow-up
→ plan generation
→ plan persisted

## Workout

Today
→ Start Workout
→ change kg
→ change reps
→ direct numeric input
→ complete sets
→ rest timer
→ next exercise
→ progression suggestion
→ finish workout

## Persistence

start workout
→ log sets
→ reload app
→ resume
→ no data loss

## Coach

ask question
→ context uses actual program/history

## Adapt

ask to shorten workout
→ preview
→ Apply to Today
→ current workout changes correctly

## Progress

finish multiple sample sessions
→ progress updates

## Profile

change units/increments/preferences
→ appropriate behavior updates

---

# 41. SCREENSHOT-DRIVEN VISUAL QA

Once the main implementation works:

run the app in realistic mobile viewports and make screenshots.

At minimum inspect:

* onboarding
* generated plan
* Today workout day
* Today rest day
* Active Workout
* progression state
* rest timer
* Workout Complete
* Coach empty
* Coach active
* Adapt Today
* Weekly plan
* Progress
* exercise history
* Profile
* logging preferences
* loading/error state

At:

* 375px
* 390/430px
* 500px

Check for:

* overflow
* clipping
* keyboard issues
* bottom-nav overlap
* safe-area issues
* unreadable content
* inconsistent spacing
* buttons outside viewport
* long exercise names
* large numeric values

Fix concrete issues and retest.

Do not use this QA phase for redesign.

---

# 42. MOST IMPORTANT QUALITY TEST

The final product should pass this scenario:

A user is physically standing in a gym.

They unlock their phone.

Open the PWA.

Within seconds they see today's workout.

They tap Start.

Bench Press already shows what they did last time.

They complete most sets by touching only:

`+`
`−`
`✓`

They barely use the keyboard.

They finish the workout.

The app clearly tells them what changed and what they should target next session.

If this interaction is not excellent, keep improving it before polishing secondary screens.

---

# 43. FINAL REVIEW

Before declaring completion:

perform a fresh user walkthrough.

Look specifically for anything that feels like:

* unnecessary setup
* unnecessary typing
* hidden common action
* duplicate information
* confusing AI behavior
* accidental data loss
* excessive navigation
* clutter during the workout

Fix concrete problems while keeping the approved Claude visual system intact.

At the end report:

1. architecture chosen
2. screens implemented
3. major reusable components
4. persistence/data model
5. AI integration boundaries
6. offline/resume behavior
7. progressive overload logic
8. test flows completed
9. screenshot/viewports checked
10. any remaining limitations or external configuration required

Do not claim something was tested if it was not actually tested.
