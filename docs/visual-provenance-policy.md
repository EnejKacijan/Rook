# Visual provenance policy

`visual-provenance.json` is the authoritative internal inventory. It records each
maintained image file and inline SVG renderer, its hash, use, exercise/movement
mapping, provenance, evidence, license and attribution requirements. Copied
masters are separate file records; they are not counted as additional live
illustrations. `rook_original` currently identifies source-defined UI/icon/chart
renderers; it is not a legal determination of copyright ownership. The branding
mark and its derivatives remain `unknown`: their repository/pixel lineage is
known, but the original designer and permission were not recorded.

The current classifications are `rook_ai_generated`, `rook_original`,
`licensed_third_party`, `public_domain`, `reference_only`, and `unknown`.
`attributionRequired` is a separate flag. Null means undetermined, not waived.
An unknown file must retain any existing credit until its evidence is resolved.
An illustration that uses a reference does not automatically become that
reference's artwork. Conversely, model generation alone does not settle whether
an input reference created a legally relevant derivative: record the input and
escalate that question if needed rather than inventing an ownership claim.

Only a small public projection is compiled into the application:
`src/illustrationProvenance.generated.js`. It contains current asset IDs,
provenance classifications and necessary public credits. It contains no prompts,
local generated-image paths, internal evidence hashes or model guesses.

Exercise information uses `exerciseReferenceSources`, with a source ID and
catalog record ID. The installed drawing uses `illustrationProvenance`. An
equivalent-artwork mapping must never copy exercise reference metadata merely
because two exercises share a drawing. `visualSource` and `visualLicense` were
removed from the built-in catalog; historical names of exported art mapping
constants remain stable for compatibility, without establishing authorship.
No stored workout/account data or historical backups are rewritten by this audit.

For a new/replaced drawing:

1. Record its exact path, asset ID, hash and exercise IDs. Preserve the previous
   evidence before replacing a master.
2. Record evidence of origin. For AI, keep a keyed generation record, original
   raster hash, workflow and exact model/date when actually recorded. Do not
   infer them from file timestamps. Record any input reference separately.
3. For third-party art, verify the exact frame/file, creator, source, license and
   modifications. Keep required attribution and license files. For an unknown,
   use `unknown` and document the missing proof and safe next action.
4. Run `node scripts/compile-visual-provenance.mjs` to update the public projection.
5. Run `node scripts/audit-visual-provenance.mjs` and
   `node scripts/compile-visual-provenance.mjs --check`, relevant tests and build.
   These checks do not download anything, generate images, or infer provenance.
6. Inspect the affected detail/viewer and Appearance credits before publishing.

The existing source importer preserves reviewed masters. It records imported
catalog metadata as references, not illustration credit. Adding a new upstream
image requires auditing and registering its provenance; the current complete
catalog/asset integrity tests prevent silently adding an unregistered image.

Credits remain in Profile → Appearance. Only required current-image entries are
shown there, followed by separately labeled exercise references. No repeated AI
badge or blanket proprietary/copyright statement is added to exercise details.
