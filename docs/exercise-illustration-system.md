# ROOK exercise illustration system

## Current implementation status

**Current accepted checkpoint:** [ILLUSTRATION-STYLE.md](ILLUSTRATION-STYLE.md) and [the surface audit](illustration-surface-audit.md) supersede the earlier partial 328-asset/90-replacement checkpoint. The completed visual review covers 349 catalog records and 331 runtime artworks: 123 retained, 208 redrawn, no pending identity decisions. The approved new Leg Press and filled green hair remain the reference. This release preserves those reviewed drawings; it does not run a new cosmetic migration.

The durable review registry is `scripts/illustration-system-decisions.mjs` with `scripts/illustration-system-audited-ids.json`. Local generation/contact-sheet evidence remains excluded from Git. Release tests verify registry coverage, live/master parity, mapping resolution, shared viewer rendering and offline asset reuse; technical checks are not a claim of a new physical-device visual review.

## Canonical art direction

The full 328-asset audit found source-style drift inside the imported Workout Guide set as well as later ROOK additions. File format, a shared tint, and identical canvas dimensions alone do not establish visual consistency.

Use the clean technical line-art family as the quality reference (the reviewed Single-Leg Leg Press and incline-machine/Smith illustrations), not the thick simplified sketch family or weak jagged traces. Keep anatomy restrained and plausible, equipment construction legible, and line hierarchy controlled. No scratchy strokes, hatching, shading, visual noise, photorealism, or caricature proportions. Facial features are subordinate; a recognisable exercise is the subject, not a portrait.

- Outer contours: continuous, smooth, medium-fine; interior anatomy/details lighter than the silhouette. Judge at 76px as well as viewer size, not by raw source pixel width alone.
- Machine/equipment detail: enough to identify the actual apparatus and contact points, without dense decorative bolts, invented cables or texture.
- Perspective: a readable side/three-quarter view is preferred; front/back views remain valid where grip or movement is clearer. Do not distort an exercise solely to force an identical camera angle.
- Movement correctness takes precedence over reuse. Bilateral/unilateral, cable/band, bench angles, grip types, knee/hip motion and attachment points must remain distinct.
- One complete subject and required apparatus, no cropped limbs or equipment. Center **painted bounds**, not an arbitrary nominal artboard.
- Shared framing: square 512px SVG; longest painted extent occupies `1 / 1.14` (87.72%) of the viewBox. Transparent background and transparent unpainted interiors.
- Shared ink: existing `#1f6b4c` filled paths. The existing theme renderer owns appearance adaptation. No baked-in tile, labels, shadows, gradient or embedded bitmap. The color is an existing asset convention, not a new UI theme token.

## Source and regeneration

`src/assets/exercise-art/wg-*.svg` are the only artwork files consumed by the app's synchronous asset manifest. Legacy non-prefixed SVGs are not part of the runtime illustration set. 349 catalog records currently resolve to 331 unique artwork families.

The original 26 corrected assets remain in `corrected-masters/`. Catalog-wide redraws are stored in `consistent-masters/`; live/master parity is tested. The generator copies reviewed masters. The Workout Guide importer also preserves them rather than reinstating old library drawings. Exercise catalog identity, names, eligibility and exercise behavior are not changed by asset replacement.

New redraws use the built-in imagegen tool, one illustration per exercise, with the same local style reference and explicit movement constraints. `scripts/illustration-consistency-jobs.mjs` records the art direction and subjects. The local review package records returned source paths and preserves PNG copies plus exact pre-pass SVGs. No exercise illustration or owner data is uploaded by the runtime app. Existing source attribution is retained as provenance; this pass does not change licensing policy.

`scripts/vectorize-consistent-art.mjs` uses the existing isolated green-ink/Potrace conversion workflow. This is format conversion of generated artwork, not an automatic substitute for visual approval. Only the green ink is traced, so whitespace/checkerboard backgrounds cannot become runtime artwork. The served result contains vector paths only. Tooling dependencies are isolated under ignored `artifacts/art-correction-tools/`, not added to the app.

## Viewer contract

Keep the existing title/header, 44px Close hit target, shared backdrop/theme, scroll/focus restoration and dismissal motion. Illustration width is constrained to its actual padded stage rather than viewport width; this prevents narrow-screen horizontal miscentering. No exercise-specific viewer layout overrides.

## Addition/replacement checklist

1. Inspect the actual catalog reference, exercise identity and source provenance.
2. Compare with the reference family and adjacent variations at thumbnail and viewer sizes.
3. Review anatomy, grip, supports, attachments, machine type and resistance path. Do not approve from a filename, successful load or format test alone.
4. Save a reviewed master, keep existing art ID, record the prompt/source and retain the previous version in the local review package.
5. Normalize painted bounds, verify live/master parity and generation idempotence.
6. Run the whole-library contact-sheet audit, relevant illustration tests, actual detail/viewer flows at 320/390 and four themes, plus release/domain/build checks.

Static illustrations identify movements; they are not a complete exercise-technique tutorial or a substitute for coaching.
