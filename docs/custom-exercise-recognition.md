# Local custom-exercise recognition

New-exercise drafts can suggest equipment, main/secondary muscles, supported movement and logging type from the existing local catalog (including library-only and active custom entries). No network request, new AI service, Pro gate, persisted schema migration or changes to existing exercise records are involved.

## Matching contract

- A complete normalized catalog name/alias must resolve to a unique exercise ID. Case, Unicode accents, punctuation/hyphens and whitespace normalize for comparison only; the user name stays intact.
- The reviewed Skater Hop family additionally accepts `single leg` before a complete name/alias. This qualifier is not removed globally and is not combined with typo matching.
- One edit or adjacent-letter transposition in one word of at least five source letters is allowed, with every other word exact and in order. Partial search prefixes and generic `press`, `row`, `leg`, etc. do not classify a draft.
- Multiple distinct IDs at the strongest tier mean no catalog suggestion. Names/aliases are deduplicated within each ID. Metadata is never combined across candidates.
- Explicit unambiguous equipment words may fill only equipment even without a catalog match. Negation, conflicting equipment, or disagreement with manually selected equipment cannot transfer incompatible catalog fields.

`single leg skater hops` resolves to Skater Hop: Bodyweight, Quads, Hamstrings / glutes + Calves, Reps only. Per-side remains Normal. Its catalog `mobility` pattern has no equivalent in the custom form's supported movement choices, so it stays Not specified. Catalog role order is established by `scripts/import-workout-guide.mjs` (primary followed by secondary) and the custom catalog adapter.

`dumbbell skater hops` recognizes Dumbbells only: it does not inherit the bodyweight entry's muscles, movement or Reps only. Unknown required metadata remains visible for explicit user selection. Optional-load logging that the custom schema cannot faithfully represent is also left for the user rather than silently changing its meaning.

## Draft and save behavior

Each metadata field is unresolved, automatically suggested, or manually owned. A real change, including clearing a selector, locks that field. Secondary muscles are owned as one selection. Renaming refreshes/retracts only automatic fields. Manual equipment changes immediately revalidate dependent suggestions. A suggested main target cannot displace a manually selected secondary muscle; unresolved/conflicting required choices block Create with the existing visible validation.

Only the allowlisted metadata fields enter the draft. No catalog identity, alias, illustration, generation flag or exercise history is copied. Existing record editing disables inference. Create validates and saves the currently displayed form, without rerunning the recognizer.

A compact source disclosure shows Suggested from / Review details for families and typos, and Name matches / View existing for exact names. The disclosure is read-only and does not apply or save anything. All ordinary fields stay editable. Equipment-only suggestions have a short inline hint; an unrecognized name is not itself an error.

## Verification

Pure resolver/draft tests cover aliases, the Skater Hop family, typo boundaries, ambiguity, equipment and negation conflicts, logging fidelity, stale suggestion retraction, manual/cleared values, secondary ownership and editing isolation. Real replacement-editor tests verify initial-name inference, read-only review, saved values, independent custom identity, required-field validation and unchanged plan/session/history. Browser checks use synthetic data and the existing local preview.
