# Optional exercise linking — release contract

Both importers use `importExerciseMatching.js` for cached, proof-only default
identity resolution. Explicit equipment/side/angle/load-mode contradictions and
catalog ties cannot be resolved with a fuzzy score. Catalog labels, verified
aliases, plural spellings and compact aliases share one index. Advanced candidates
are produced only when the user opens optional exercise matching.

History keeps provider-scoped original identities, raw results and provenance.
Source workout/set fingerprints never depend on the chosen catalog association.
Unknown catalog names are not invalid rows. Dates, units, numbers, session grouping
and duplicate validation remain mandatory. Current training restrictions do not
erase factual past results.

Notes keeps an original identity inside the plan draft. For `Chest flys - 4 seti`,
the four sets are known; reps/load remain null, not zero, failure or a default
range. No library name question is required. `plan-import` scoped aliases record
explicit Match/Keep original decisions only in the existing atomic Apply path.
There is no eager creation of rich global catalog metadata.

The optional Notes surface uses the existing Import decision scrollport/footer
and keyboard viewport ownership. Source excerpts are visible. Candidate choices
respect current eligibility and the existing measurement unit; they do not turn
seconds into reps. Existing explicit identity edits still revalidate dependent
prescriptions. Back leaves unresolved optional links as original names.

True source choices, unknown execution modes, missing required set count, set
ranges, optional inclusion, unsupported multi-exercise circuits and real safety
conflicts remain decisions. An original name cannot prove compatibility with a
saved restriction: unresolved movement safety blocks Apply with that concrete
reason. Neither Apply nor matching invents a safe prescription.

Regression entry points:

- `fastImportMatching.test.js`, `historyImportClient.test.js`,
  `HistoricalMatching.ux.test.jsx`, `ImportResolution.ux.test.jsx`.
- `release-notes-qa.mjs`: current grouped owner fixture, optional exit, keyboard,
  Apply/reload/active/export. It supersedes old ungrouped selectors and excluded
  local baseline JSON dependencies, not their semantic assertions.
- `import-open-targets-qa.mjs`: actual result entry/history vs unchanged source
  targets, optional numeric corrections and single-exercise round provenance.
- History scripts listed in `historical-exercise-matching.md`.

Browser QA is isolated desktop mobile emulation, not physical-iPhone verification.
