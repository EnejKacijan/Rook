# Exercise illustration surface audit — 2026-09-12

## Source of truth

349 records in `exerciseCatalog`, 331 unique `artId` values. `exerciseArt` in
`App.jsx` resolves the canonical ID first, then supported imported-name aliases,
then explicit art ID. Its eager Vite `wg-*.svg` URL manifest is the only runtime
art library. 92 other root SVG files are not in that runtime manifest.

## Rendering surfaces

| Surface | Rendering / shared path | Decision |
| --- | --- | --- |
| Exercise Detail, including Progress history | `ExerciseDetail` → `exerciseArt` → `.exercise-detail-art` | Replace shared asset; retain layout and decode cache. |
| Today exercise Detail | Same `ExerciseDetail` | Same asset, no Today-only override. |
| Active planned workout | `activeArtwork` → `exerciseArt(currentExercise)` | Same asset; logger unchanged. |
| Active freestyle workout | Same active-workout component with freestyle exercise identity | Same asset; no separate artwork library. |
| Expanded illustration viewer | `ExerciseVisualViewer` → `exerciseArt` | Same URL as parent Detail, parent remains mounted. |
| Generated plan Review | `PlanReviewIllustration` → canonical catalog ID → shared `exerciseArt` | Same source; no guessing artwork for unresolved/custom records. |
| Today rows / Edit Plan / Scratch editor | Current rows are text-based; Detail actions use shared surface | No new thumbnails or UI redesign. |
| Add / Replace / dedicated exercise search | Current picker rows are text-based; selection retains canonical ID | No separate picker illustrations to replace. |
| Manual / imported plans | Canonical resolved IDs use the same Detail / Active path | No parser, name, ID or prescription changes. |
| Custom or unknown exercise | Existing no-art behavior | Do not invent a similar movement image. |

The five existing thumbnail-only scale adjustments are independent of full-view
art; no duplicate image files or theme-specific drawings are selected. Theme
filters adapt the common green ink to existing theme tokens. Viewer title,
centering, close hit area and image containment are covered by the browser audit.

## Migration status

The per-asset status is in
`artifacts/ROOK-ILLUSTRATION-SYSTEM-2026-09-12/ASSET-AUDIT.md`.
`KEEP`, `REPLACED`, `REPLACE_PENDING` and `BLOCKED_IDENTITY` are deliberately
distinct. Technical loading success is **not** full visual migration approval.
All originals were copied before replacement. Source PNGs, generation prompts,
before/after SVG renders and live/master parity are retained locally.

Final visual result: 331/331 runtime assets reviewed, 208 replacements and 123
unchanged canonical assets. No pending or blocked identity cases. Every retained
asset matches its before-pass SHA-256; all 208 replacements differ from their
before-pass bytes. The 349 catalog identities and mappings remain unchanged.

Final browser proof: 461 Detail/viewer flows (all 349 records, plus 16
representatives at the remaining width/theme combinations), 12 plan-review
flows, and 4 Today/planned/Freestyle active/viewer/offline-reopen flows. These
are desktop Chromium mobile viewports, not physical iPhone verification.

## Asset cache correction found during QA

The real service worker failed to persist fetched SVGs: `response.clone()` ran
inside the asynchronous `caches.open().then(...)`, after the image consumer had
used the response body. Observed worker rejection: `Response body is already
used`. Clone now happens before handing the response to its consumer; the
existing cache write is kept alive with `event.waitUntil`. The identical race
in the navigation/other-resource cache branches is corrected too. No cache
version bump, storage clearing, global artwork prefetch or URL reuse was added.
Tests cover consumption before CacheStorage opens and a cache hit without fetch.
Real browser QA verifies current SVG bytes, reload/resume and offline reopen.

## Legacy cardio artwork identity

Hiking and Swimming initially looked ambiguous because their old drawings used
apparatus and their catalog equipment said `machines`. Inspection of
`scripts/import-workout-guide.mjs` proves that **all** source `Cardio` equipment
is converted to `machines`; this is not exercise-specific evidence. Their names,
source slugs, no-load requirement and distance/duration semantics identify the
activities. The artwork therefore depicts actual hiking/swimming. The coarse
catalog equipment metadata is left untouched in this asset-only task.
