# Training Blocks v1

## Advance rule

ROOK advances a training block only after every stable workout identity in the current block week has a completed workout record. Calendar time alone never advances the block.

Each block week owns stable workout IDs in the form `block → week → program day`. Flexible Week may change a workout's calendar date, but the workout keeps that ID and its original block-week prescription. A carried workout started after a calendar boundary therefore remains part of its original block week. Duplicate completions cannot advance the block twice.

Adjust Today clones the already-resolved block prescription and changes only that session. The permanent block and its targets remain unchanged.

## Target interaction

Weekly block targets may change repetitions, RIR, or working sets. Default blocks change one primary variable at a time until the planned deload. The deload reduces working sets and increases RIR; it does not diagnose fatigue or require a weight reduction.

Performance-based progression remains authoritative for load selection. A new block week never forces a weight increase.

## Persistence

The current block lives inside the permanent program snapshot. Completed blocks are retained separately in `completedTrainingBlocks` (latest 24). Both are included in normal state serialization and Backup & Restore. Block configuration is part of Plan Version History; lifecycle progress such as moving from Week 2 to Week 3 is not a permanent plan edit and does not create a version.
