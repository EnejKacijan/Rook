# Starting a scheduled workout from the workout library

`From your plan` offers scheduled starts alongside the existing detached extra
workout. Exact plan-day and occurrence IDs determine eligibility; names do not.
Missed discovery uses the existing current-week recovery boundary. Future moves
use the existing 14-day window and schedule validators.

- A matching occurrence today starts directly after its effective prescription
  is previewed, including dated exercise edits and block targets.
- Other dates require an explicit review. Multiple occurrences require a date
  selection; none is selected automatically.
- A rest day accepts a move to today. A future workout can swap with today's
  unstarted workout. A missed workout moves to today while today's workout moves
  forward to a visible, editable available date; nothing is backdated.
- The review shows both changed dates and the effective workout. An adjusted
  prescription opens its exercise details automatically.
- Cancel/back before confirmation writes nothing. After confirmation, normal
  workout cancellation retains the accepted temporary schedule without recording
  completion. Only finishing the session resolves its original occurrence.
- Schedule changes and session start use one durable write. Save/start failures,
  stale reviews, midnight, active sessions and unsupported adjustments never
  silently fall back to an extra workout.
- Extra starts leave scheduling unchanged. If the displayed same-day workout is
  adjusted, `Preview extra workout` first shows the reusable template instead.

Implementation: `planWorkoutSchedule.js`, `PlanWorkoutStartSheet.jsx`,
`SavedWorkouts.jsx`. Regression coverage: `planWorkoutSchedule.test.js` and
`SavedWorkouts.plan.test.jsx`, plus the existing flexible-week/template tests.

ChatGPT design and screenshot review:
<https://chatgpt.com/c/6adcc5ff-8110-83ed-9e4f-d8361cb4a658>.
Local synthetic preview: `/artifacts/plan-workout-preview/?schedule=1` in
the isolated theme-preview server. Production startup never seeds demo history.
