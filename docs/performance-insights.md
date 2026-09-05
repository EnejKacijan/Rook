# Performance Insights

Performance Insights is a derived, local-only analytics layer over completed workout history. It does not add an authoritative PR table or analytics cache to durable state.

## Estimated 1RM

ROOK uses the Epley formula consistently:

`estimated 1RM = weight × (1 + reps ÷ 30)`

Only completed, externally loaded sets from 1 through 12 reps are eligible. Higher-rep sets, timed work, unloaded work and bodyweight movements without a known total system load are excluded. RIR is not used to adjust the estimate. The UI always labels the result **Estimated 1RM** and describes it as estimated rather than measured.

## Personal records

The first valid exposure establishes a baseline. Later completed sets can produce:

- a weight PR when the load exceeds the prior heaviest load;
- a rep PR when reps exceed the prior best at the same already-recorded load;
- an estimated 1RM PR when the eligible Epley estimate exceeds the prior best.

Identical sets are not PRs. Events are collapsed to at most one event of each type per exercise and completed session, and Weekly Review counts an exercise only once even if one set establishes both a weight and estimated-1RM record. Session-volume PRs are intentionally omitted in v1 because Adjust Today and user-added sets make a single comparable volume definition unreliable.

## Weekly Review

Weeks run Monday through Sunday, including across calendar-year boundaries. Reviews derive completed sessions, completed planned working sets, explicit occurrence skips, Adjust Today usage, Flexible Week moves, exercise progress/holds, PRs and Training Block context from existing state.

Flexible Week moves are counted from the weekly schedule override once, while completed sessions are deduplicated by stable source occurrence identity. Sets intentionally absent from an Adjust Today workout are not represented as failed work. Planned deload weeks use factual block context and never classify lower targets as regression.

## Backup & Restore

Completed workout history, schedule overrides and Training Blocks are already authoritative backed-up state. PRs, e1RM trends and Weekly Reviews are recomputed after restore, so no new cache can become stale or disappear independently of its source data.
