# Data and AI architecture

## Production constants

The exercise catalog contains stable exercise IDs, display names, movement patterns, muscle groups, equipment requirements, rest defaults, and safe load increments. Weekday labels, onboarding option labels, visual copy, and generalized training-volume bounds are also product constants.

No production state contains completed workouts, previous reps, working weights, dates, progress values, Coach answers, or a preselected user profile. First-session program sets store `weight: null`.

## Personalized program flow

Structured onboarding collects goal, experience, frequency, available weekdays, duration, environment, relevant equipment, optional priorities, restrictions, and exercise preference. Before generation, the server derives a machine-readable programming context without replacing explicit profile constraints. Established users also contribute a bounded 12-week training-history summary; new users receive no fabricated history defaults.

Production plan generation is a quality pipeline: candidate generation, deterministic hard validation, structured whole-week review, bounded targeted repair when needed, post-policy validation, and final client normalization before persistence. Repairs preserve sound candidate decisions instead of generating an unrelated week. Expert Lab candidates intentionally bypass the production reviewer so the developer can still review imperfect and varied examples.

When AI is unavailable, generalized local rules choose a split, prescriptions, and catalog exercises from the entire profile. This output is marked `local-rules`; it is not presented as AI. The stored plan remains stable across reloads and changes only through an explicit user action.

## AI boundary

`src/aiService.js` owns client operations for follow-ups, plan generation, Coach conversation, same-day adaptation, and replacement suggestions. `server.mjs` owns the provider credential, model selection, reasoning effort, and OpenAI Responses API calls. `src/planQuality.js` owns deterministic context, compact history, planner catalog metadata, and raw-plan checks; `src/planPipeline.js` owns review/repair orchestration. The browser never reads the API key. Structured Outputs constrain every generation, review, and repair result, and domain validation remains authoritative.

Coach/default, plan, and expert-review model/reasoning settings are independently configurable. `EXPERT_LAB_ENABLED` controls access to the review UI, while `EXPERT_POLICY_ENABLED` independently controls whether distilled expert rules improve production generation. Relevant expert examples are retrieved selectively; normal plans are not forced to differ from previous candidates merely for novelty.

Coach context contains the actual profile, stored program, selected or active workout, up to eight recent workouts, and logging preferences. Deterministic progression and time-fit calculations run locally. AI can explain or propose, but plan/session mutations require a preview and explicit acceptance.

## QA fixtures

`src/demoFixture.js` is an explicit returning-user fixture used only by QA scripts. Production startup never imports or seeds it. Default storage begins empty, and the v2 storage key intentionally ignores the former demo-shaped v1 state.
