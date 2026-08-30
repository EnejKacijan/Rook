# ROOK conversion funnel

Rook has no paywall, purchase SDK, RevenueCat, StoreKit, or remote analytics provider in this PWA today. This pass does not introduce a subscription model or transmit analytics data.

`src/analytics.js` defines a privacy-conscious event contract, keeps a bounded local event history, and emits a `lift:analytics` browser event. A future first-party endpoint or approved analytics adapter can subscribe to that event without changing product flows.

## Active funnel events

- `app_open` — new versus returning app sessions.
- `onboarding_started` — entry into personalized or import onboarding.
- `onboarding_step_viewed` — denominator for step-level drop-off.
- `onboarding_step_completed` — completion by meaningful questionnaire step.
- `plan_generation_started` — attempts by personalized or import path.
- `plan_generation_completed` — generation success, duration, plan size, and source.
- `plan_generation_failed` — categorized failures without raw user content or error messages.
- `first_plan_viewed` — onboarding-to-first-value conversion.
- `onboarding_completed` — accepted plan and completed onboarding path.
- `first_workout_started` — plan-to-first-action conversion.
- `first_workout_completed` — first-value-to-retained-training conversion.

## Reserved monetization events

- `paywall_viewed`
- `purchase_started`
- `purchase_completed`
- `purchase_failed`

These names are ready for a future monetization implementation, but are intentionally not emitted while the product has no paywall or purchase flow. Any future integration should emit them through the same contract and include only placement, offering/product identifiers, and categorized failure reasons—not prices inferred by the client or personal profile content.

## Privacy and metrics

The allowlist rejects names, free-text preferences, restrictions, photos, Coach messages, workout values, and raw provider errors. The stored queue is capped at 250 events.

The event sequence supports onboarding completion, step drop-off, generation success, onboarding-to-plan, plan-to-first-workout, and first-workout completion. Paywall exposure and paid conversion become measurable when a real monetization model is implemented.
