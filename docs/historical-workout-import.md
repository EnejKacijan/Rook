# Historical workout import

ROOK parses workout CSV files entirely on-device. Selecting a file only creates a dry-run preview; history changes only after the user explicitly imports it.

## Generic CSV

Use UTF-8, comma-separated CSV with one row per completed set and this header:

```csv
workout_date,workout_name,exercise_name,set_order,weight,weight_unit,reps,duration_seconds,notes,workout_notes
2026-08-18 18:05:00,Upper A,Bench Press,1,80,kg,8,,Paused first rep,Felt good
```

- `workout_date`, `workout_name`, `exercise_name`, `set_order`, and `weight_unit` are required columns.
- `workout_date` accepts ISO dates/times or `YYYY-MM-DD HH:mm:ss`.
- `weight_unit` must be `kg` or `lb` on every row that has a weight. Leave both weight and unit blank for unloaded work.
- Provide `reps` or `duration_seconds`. Unknown values must stay blank.
- Optional extra columns currently recognized: `workout_duration_seconds`, `set_type`, and `rpe`.
- RPE is retained as raw import metadata; it is not converted into RIR.

## Verified brand formats

- Hevy support is intentionally limited to the current set-level export with `title`, `start_time`, `end_time`, `exercise_title`, `set_index`, `set_type`, `weight_lbs`, `reps`, and related documented columns.
- Strong support is intentionally limited to the English set-level export with `Date`, `Workout Name`, `Exercise Name`, `Set Order`, `Weight`, and `Reps`. Because common Strong exports do not identify the weight unit, ROOK requires the user to select the original unit before parsing.

ROOK rejects unrecognized schemas instead of guessing field meanings.

## Duplicate and transaction policy

The deterministic fingerprint includes the completion timestamp, normalized workout name, mapped exercise identity, and completed set values. Exact duplicates are skipped. Same-date, same-name sessions with different contents are treated as possible duplicates and require an explicit import-or-skip choice.

The complete candidate state is built and storage-tested before the UI switches to the imported state. A failed parse, validation, conversion, or storage write leaves existing history unchanged.
