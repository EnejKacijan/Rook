# Historical exercise matching

Shared deterministic identity proofs, with history-specific validation. The source of truth for exercise identities,
equipment, unilateral execution, aliases and load contracts remains the existing
ROOK catalog. `importExerciseMatching.js` supplies cheap proof lookups to History
and Notes; their result/target validation remains separate. Generated plans do
not use this fallback policy.

## Matching pipeline

1. Resolve a provider + normalized source identity once, across workouts/files.
2. Honor an explicit `historical-import` scoped alias before automatic matching.
   A missing/deleted saved target retains the original identity, never an
   automatic different canonical replacement.
3. Reuse existing custom exercises and legacy global aliases where applicable.
4. Look up indexed names/aliases from the entire catalog, including
   library-only `wg-` identities. Preserve equipment, side, posture, grip,
   angle/direction and weighted/assisted qualifiers during normalization.
5. Default returns A (auto canonical) or C (auto separate). Only an explicit
   optional review performs advanced matching and may return B (suggestion). Preserve the
   original source name and keep canonical matching separate from source results.

Normalization handles case, punctuation, plural equipment/movements, common
equipment abbreviations and semantically equivalent word order. Parentheses do
not make equipment disposable. Existing catalog aliases supply supported concepts;
there is no provider-name dispatch or owner-CSV lookup in production.

## Confidence is evidence, not probability

- A requires exact named/alias identity or equivalent semantic tokens, no explicit
  conflicts, and one proven identity after existing canonical/library duplicate
  resolution. Distinct canonical names and conflicting equipment remain reviewable.
  Fuzzy score alone never earns A.
- B requires a conflict-free lexical candidate with score at least 0.60 and a
  margin of at least 0.10 over the next candidate, with no unresolved competing
  proven identities. Canonical acceptance always requires explicit confirmation,
  individually. Skipping B imports a separate
  source identity, never its candidate.
- C covers ties, material variant conflicts and insufficient evidence. It defaults
  to a stable imported custom identity, with no mandatory exercise decision.
  A deleted explicit saved target cannot silently switch to a different catalog item.
- Contradictions cap candidate scores below 0.50. Diagnostic scores are not
  displayed as confidence percentages.

Thresholds are checked with positive/negative generic cases and the real-file
candidate table, not tuned to a target count. Suggestions remain proposals even
when a score is high. If the catalog acquires a new close variant, rerun tie and
equipment tests before accepting a newly ambiguous automatic mapping.

Weighted/bodyweight matching uses existing load contracts and distinct weighted
identities where present. Matching never decides what a historical weight means:
explicit added/assisted source values remain intact. Missing load meaning uses the
existing `unknown` representation, preserves the raw number/unit, and is excluded
from load/PR metrics. Clarification is optional, never inferred from a name match.
Units, invalid rows, ambiguous duplicates, and ambiguous session grouping retain
their independent blocking rules.

## Storage / UX contract

- `sourceName` remains the original source label; `exerciseId` is the selected
  catalog/custom identity. `matchProvenance` records version, tier, reason and
  normalized source identity. Review diagnostics retain candidates/conflicts.
- `exerciseAliases` reuses the existing durable record architecture with optional
  `scope: 'historical-import'` and `source`. Historical overrides may replace catalog defaults
  without redefining global aliases or affecting plan parsing.
- Default remembered choices are written only when the import is applied. The
  existing remember opt-out remains available for manual mappings.
- Imported custom IDs encode `[provider, normalized source name]` reversibly,
  avoiding short-hash collisions and cross-provider merging. The original label
  remains on every historical entry and in provider identity metadata, even after
  a custom display-name edit. Similar distinct names stay distinct.
- The summary separates Matched / Original names, independently from real errors.
  `Review exercise matches · Optional` opens a review of unlinked unique names:
  Use match / Choose another / Keep original. Leaving never applies a suggestion.
  The ordinary Import action is immediately available for valid source records.
- One worker per open flow; job-local unique-name cache, one final SHA-256/dedupe
  pass, no advanced lookup before review. Diagnostic stage counts/timings contain
  no source values and are not part of persisted data. Cancel terminates the job;
  a replacement file cannot receive an old worker's result.
- No equipment, muscles, movement pattern, logging measurement, rest/increment,
  illustration or progression guidance is fabricated for imported identities.
  Actual historical set fields determine the factual result display.
- Apply is the only persistence boundary. Explicit mappings can be corrected on
  a future re-import: only exercise association/provenance changes in matching
  provider history. Existing set objects, local corrections, timestamps, notes
  and duplicate fingerprints remain intact. No new management area was added.
- No source/workout/set fingerprint, load, reps, time, distance, RPE, unit or note
  changes as a consequence of matching. Re-import retains existing duplicate and
  local-edit protection.

## Regression entry points

- `src/historicalExerciseMatching.test.js`: generic semantic positives/negatives,
  independent reviewed source-label goldens, overrides, deleted targets, cross-file
  reuse, result/fingerprint preservation and save/reload.
- `src/HistoricalMatching.ux.test.jsx`: actual review UI and batch logic; no writes
  before Apply; separate auto/review/custom paths.
- `src/lowFrictionHistoryImport.test.js`: optional/default policy, provider-scoped
  identities, no invented metadata, ordering, override/remap and all providers.
- `scripts/release-history-batch-qa.mjs <workout.csv> <measurement.csv>`: actual
  worker/UI, independent/combined files, no-subtle, storage failure and cancellation.
- `scripts/hevy-local-hash-qa.mjs <workout.csv> <measurement.csv>`: full source
  reconciliation, all hash capabilities, persistence, duplicate protection, backup.
- `scripts/low-friction-history-qa.mjs <original.csv>`: current real-file UI
  acceptance, every source row, reimport/local edits, optional decisions, all
  themes at 320/390, Strong/generic CSV/XLSX through real file selection.
- Older matching evaluation reports describe their dated candidate, not the
  current default pipeline; use the release tests above for current acceptance.
- `scripts/historical-smart-matching-qa.mjs`: historical pre-low-friction policy
  evidence; superseded by low-friction QA (old assertions intentionally archived).
- `scripts/history-import-interoperability-qa.mjs`: existing Strong, generic
  CSV/XLSX and custom-fallback regression, selectable via `ROOK_HISTORY_CASE`.

These scripts use isolated browser profiles and the local runtime. They do not
alter the original source file or the owner's browser data. Real phone/PWA file
selection and keyboard behavior still require physical-device verification.
