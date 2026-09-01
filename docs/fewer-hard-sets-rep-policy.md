# Fewer hard sets: rep-range decision

Date: 2026-08-31

## Decision

ROOK-generated plans should treat **Fewer hard sets** as a complete programming
preference, not only a set-count toggle. It keeps exactly two challenging working
sets and uses narrower default rep ranges so double progression is easier to
interpret:

| Goal | Exercise role | Default prescription |
| --- | --- | --- |
| Build muscle | Compound, main or accessory | 2 × 6–8 |
| Build muscle | Isolation | 2 × 8–12 |
| General fitness / Lose fat | Main compound | 2 × 6–8 |
| General fitness / Lose fat | Accessory compound | 2 × 8–10 |
| General fitness / Lose fat | Isolation | 2 × 8–12 |
| Get stronger | Main compound | 2 × 3–6 |
| Get stronger | Accessory compound | 2 × 6–8 |
| Get stronger | Isolation | 2 × 8–12 |
| Athletic performance | Power | 2 × 2–5, stop on speed/quality loss |
| Athletic performance | Main strength compound | 2 × 3–6 |
| Athletic performance | Accessory compound | 2 × 6–8 |
| Athletic performance | Isolation | 2 × 8–12 |
| Any goal | Timed exercise | Exact catalog duration |

Ordinary rep-based work stays at about 1 RIR. Power work retains a larger
quality reserve; timed work has no repetition-based RIR target.

## What the evidence supports

- Hypertrophy can occur across a broad loading spectrum when sets are performed
  with sufficient effort. There is no uniquely superior 8–12 hypertrophy zone.
  Higher loads do, however, have greater specificity for maximal-strength gains.
  See the [2021 load/hypertrophy network meta-analysis](https://pubmed.ncbi.nlm.nih.gov/33433148/),
  the [2022 load meta-analysis](https://pubmed.ncbi.nlm.nih.gov/35015560/), and the
  [2023 resistance-training prescription network meta-analysis](https://pubmed.ncbi.nlm.nih.gov/37414459/).
- Momentary failure is not required for productive hypertrophy training. Proximity
  matters, but the evidence does not establish failure as categorically superior.
  See [Refalo et al. 2023](https://pubmed.ncbi.nlm.nih.gov/36334240/) and the
  [2024 RIR meta-regression](https://pubmed.ncbi.nlm.nih.gov/38970765/).
- Repetition progression and load progression are both viable. See the
  [2022 trained-lifter progression trial](https://pubmed.ncbi.nlm.nih.gov/36199287/).
- The [2026 ACSM guideline update](https://acsm.org/resistance-training-guidelines-update-2026/)
  emphasizes goal-specific loading and consistency rather than one universal
  prescription.

## Product-design inference

Research does **not** prove that 6–8 is physiologically better than 6–12. ROOK
uses the narrower range because it reaches a clear load-increase decision sooner,
reduces long near-failure compound sets, and makes progress easier to understand
in a logging product. This is a progression and usability decision inside an
evidence-supported loading range.

Progression rule: keep the load until both working sets reach the top of the
range at the intended RIR with acceptable execution, then use the smallest
practical load increase and allow reps to return toward the lower boundary.

## Implementation invariants

- Application code owns sets, rep range, and effort for ROOK-generated plans.
- The AI may choose exercises, ordering, and an explicit main/accessory/power
  role, but its returned prescription must exactly match the deterministic
  resolver for that role.
- An invalid AI result is rejected and retried with the validation error. It is
  never silently widened or accepted.
- Imports and manually/expert-authored plans preserve their original sets, reps,
  RIR/RPE, and timed prescriptions. The preference governs ROOK recommendations,
  not user-authored programming.
- The standard ceiling is 12 reps. Any future higher-rep exception must be an
  explicit catalog prescription, never an exercise-name guess made by the AI.

## Scope and limitations

This policy is a default for general resistance-training software, not medical
or rehabilitation advice. Individual comfort, equipment load increments,
technique, and clinician-given restrictions can require a different authored
prescription.
