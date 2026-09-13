# ROOK illustration reference

The owner-approved **new Leg Press** is the canonical line-art reference:
`src/assets/exercise-art/consistent-masters/wg-leg-press.svg`.
Keep this approved drawing unchanged. Supersede another reviewed master only
when the renewed per-ID visual audit proves it is an outlier and explicitly
approves its replacement; retain the earlier source for recovery.

## Drawing rules

- Smooth, clean medium-fine contours, thinner interior anatomy and equipment details. No faceless mannequin, rough sketch, scratchy hatching, heavy icon outlines or shaded muscles.
- **Hair is predominantly filled dark green**, with only a few negative-space highlights. Hair reference: the earlier `wg-dumbbell-skull-crusher.svg`, also shown by the owner. Do not fill skin, clothes or machine panels to match the hair.
- Realistic anatomy, plausible limb count and contacts, enough machine detail to distinguish its mechanism. Preserve unilateral/bilateral execution, attachment type, grip and movement identity.
- Choose the perspective that explains each exercise; do not force all subjects into one view. Step-down is not Step-up, inner adductor pads are not outer abductor pads, and single-leg press must remain unilateral.
- Complete body and necessary apparatus; no labels, arrows, logos, texture or decorative background.

## Existing renderer contract

512 × 512 static SVG. Preserve the existing `#1f6b4c` ink and theme adaptation. Transparent unpainted areas, no baked-in tile. Center painted bounds, with longest extent occupying approximately 87.7% of the square viewBox. Check the real small Detail image and full viewer, not just the source PNG.

The synchronous Vite manifest resolves one artwork per canonical exercise. Detail, Active Workout, plan-review thumbnail and expanded viewer must use that same resolver. Today overview and picker rows that are currently text-only stay text-only. No global library preload or new viewer layout.

Vite fingerprinted `/assets/…hash.svg` URLs provide version identity. The existing service worker caches visited asset URLs; do not clear user storage or reuse an old URL for new bytes.

## Replacement workflow

1. Inspect actual catalog ID, aliases, apparatus and live mapping.
2. Compare at equal sizes against the approved source; separate drawing defects from scaling, mapping and stale-cache defects.
3. For a necessary redraw, use the approved Leg Press **source image** as style reference and the Skull Crusher as hair reference. State the exercise-specific constraints. Built-in image generation is the established artwork workflow; vector tracing is conversion, not a style repair.
4. Visually inspect the generated image and converted SVG before installation. Preserve exact previous SVGs and project-local source PNGs.
5. Store reviewed/live matching masters; check related variants, aliases, all four themes at 320/390, Detail → viewer → same Detail, and offline cached artwork.

## Completed full-catalog visual coverage

The full-system audit covers all 349 exercise records / 331 runtime drawings:
123 canonical illustrations retained and 208 outliers redrawn and reviewed.
All 12 final same-size contact pages and every replacement's PNG and SVG were
visually inspected. No pending or identity-blocked artwork remains.
Current per-ID decisions and counts are in
`artifacts/ROOK-ILLUSTRATION-SYSTEM-2026-09-12/ASSET-AUDIT.md`.
The prior review folder is historical evidence, not the current completion status.

`scripts/illustration-system-decisions.mjs` is the explicit review registry.
Approved new SVGs are copied to `consistent-masters` and matched byte-for-byte
to runtime assets by tests. Source refresh and derived-art regeneration prefer
these masters. New runtime IDs must enter the audited-ID inventory and visual
review; file format or green color is not automatic approval.

Before declaring the library complete, run
`node scripts/illustration-system-report.mjs --require-complete`.
It fails while any replacement or identity decision remains outstanding.

A file is not approved merely because it is SVG, green, loads successfully, or
comes from the same source. The coverage test requires a reviewed decision for
every runtime ID. Replacement source PNGs and their prompts are project-local in
the audit folder; the manifest keeps the original generation path as provenance
only. Runtime builds consume the reviewed SVGs, not a generation service.
