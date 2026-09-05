# Advanced set and per-side logging

ROOK keeps legacy sets structurally standard: an absent `setType` means `standard`, and an absent exercise `loggingMode` means `normal`.

## Durable model

- `set.setType`: `amrap`, `drop`, or `rest_pause`; omitted for standard sets.
- `set.segments[]`: ordered child efforts for drop and rest-pause sets. Each segment retains its own weight, reps, RIR and completion state while remaining attached to one parent set.
- `exercise.loggingMode`: `normal` or `per_side`.
- `set.sides.left.reps` and `set.sides.right.reps`: optional side observations. Weight and RIR remain shared because ROOK does not silently assume different implements per side.

RIR 0 already means no clean repetitions remain, so there is no duplicate `failure` set type.

## Analytics semantics

Standard completed sets remain the only direct evidence for normal double-progression. AMRAP, drop and rest-pause work is preserved in History but excluded from direct standard-set load comparisons. Child segments are not counted as separate planned sets.

For per-side exercises, a factual one-sided set may still be completed, but both sides are required for comparable progression and PR evidence. The weaker side's reps are the conservative canonical result. A missing side remains unknown and cannot create a PR. ROOK does not emit separate left/right PR notifications.

The complete state is serialized by the existing local-first persistence and Backup & Restore pipeline; normalization supplies safe defaults to legacy data.
