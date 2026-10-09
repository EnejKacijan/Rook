# ROOK visual provenance audit — 2026-10-04

Audit of the current `codex/pro-native-review` worktree serving port 4284.
HEAD remained `5eb280ceda115cb051c052d33a9c3153c9857e7e`. Existing uncommitted
work was preserved. No asset was replaced, deleted, newly generated or deployed.

## Evidence-based inventory

| Classification | All maintained records | Current exercise illustrations |
|---|---:|---:|
| AI-generated for ROOK | 662 | 330 |
| First-party inline UI/icon/chart renderer code | 18 | 0 |
| Licensed third-party, attribution required | 93 | 1 |
| Reference-only image | 0 | 0 |
| Public-domain image | 0 | 0 |
| Unknown original author / license | 11 | 0 |
| **Total** | **784** | **331** |

The 784 records comprise **766 physical image files and 18 inline SVG renderer
blocks**. They are not 784 distinct artworks. Physical files include 330 current
AI exercise drawings, 332 AI regeneration masters, 1 current third-party drawing,
92 unused third-party legacy drawings and 11 branding/source/native files.
There are 428 distinct file hashes and 338 extra byte-identical file copies.
The exercise-art directories contain 421 distinct file hashes. The same drawing
can have different framing bytes; a distinct hash is not proof of distinct art.

The 332 images in the pre-existing compiled native web bundle were also checked:
all match the canonical source bytes. They are build copies, outside the
maintained-source count. That existing native bundle was not resynced and retains
its earlier compiled UI until a later native build. Native icon/splash sources
and their seven raster outputs were inspected: all seven are exact pixel matches
to their local SVG rasterization, including the flattened icon background.

The early inventory treated branding repository lineage as original authorship.
The final audit deliberately tightens that classification: first-commit presence
does not establish who created the root R monogram. Its 11 files therefore remain
unknown pending an authoring/permission record, with no change to their display.

One catalog reference source, Workout Guide, contributes **302 catalog records**.
Those information references are separate from image authorship and are not
counted as `reference_only` images. No separate reference-only image is shipped.

## Evidence and exceptions

The complete [internal manifest](visual-provenance.json) records each file or
inline block, IDs, hash, use, prior credit, source, license, attribution flag,
generation evidence and review notes. [Every third-party and unknown file is
listed individually](visual-provenance-exceptions.md), not just grouped by folder.

330 runtime AI drawings have keyed generation records, existing generated raster
sources and exact live/reviewed-master parity. The records come from the original
checkout's ignored review folders, which were missing from this worktree:

| Generation evidence folder | Current runtime drawings |
|---|---:|
| `artifacts/art-corrections` | 24 |
| `artifacts/ROOK-BASELINE-CORRECTION-REVIEW/illustration-consistency` | 90 |
| `artifacts/ROOK-FULL-CATALOG-ILLUSTRATION-REVIEW` | 8 |
| `artifacts/ROOK-ILLUSTRATION-SYSTEM-2026-09-12` | 208 |

The other two original corrected masters were superseded by later AI redraws
but retained. Source hashes and manifest keys are durable evidence; generation
prompts and private local generated-image paths are not bundled into production.
AI provenance was not inferred from green line-art style or the `wg-` prefix.
Recorded workflow: built-in imagegen followed by green-ink/Potrace vectorization
and exercise-identification review. The latest 123-kept/208-redrawn visual review
is a review decision, not a split between third-party and AI authorship.

The one current third-party exception is
`src/assets/exercise-art/wg-cable-crunch.svg` (`cable-crunch`). It and all 92
non-prefixed legacy files have exact SVG path geometry matches to Workout Guide
frame 2 at pinned upstream commit
`aac599224bb9780305239607ef98540b7e0ce389`. The importer recolors the ink and the
normalizer changes framing. The exact upstream file, geometry hash, creator and
modification notice are recorded per asset. All 92 legacy files remain outside
the runtime `wg-*.svg` glob; none is deleted or used as a fallback.

The 11 unknown branding files share one root R monogram. Initial repository
commit `0c31ec8` (2026-08-30) and exact copies/rasterization establish file lineage
but not the original designer or permission. Existing public credit was none
and remains none. Next action: find the authoring/design source and permission;
if unavailable, replace the one root design and regenerate its derivatives in a
separately authorized task. No replacement is generated in this task.

## Current bugs and changes

The old Appearance section broadly stated that library illustrations were by
Bryl Lim / Everkinetic, color-adapted for ROOK and CC BY-SA 4.0, followed by
“Additional exercise illustrations created for ROOK with AI assistance.” It did
not reflect cumulative replacement of all but one current drawing.

Prior runtime asset metadata had 302 `Workout Guide | CC BY-SA 4.0` labels,
20 `Bryl Lim / Everkinetic · ROOK adaptation | CC BY-SA 4.0` labels and nine
`ROOK original | Proprietary` labels. Those are per-art-family counts, not 331
independent copyright determinations. The generic visual fields followed catalog
imports or historical artwork mappings even after the installed drawing changed.
The nine proprietary claims were unsupported for recorded AI output.

The built-in catalog now separates:

- `illustrationProvenance`: follows the installed asset's audited registry entry;
- `exerciseReferenceSources`: follows imported exercise catalog information,
  using source and catalog record IDs.

Equivalent artwork mappings no longer copy generic source/license labels.
The importer records catalog references and still preserves reviewed masters.
Existing exported mapping constant names, exercise IDs, art IDs, file paths,
restrictions and programming rules remain stable. No workout, account, quota,
billing or backup data is rewritten. Historical backups may retain legacy fields;
the current renderer does not use them as attribution authority.

The [policy](visual-provenance-policy.md) explains maintenance. The internal
manifest is compiled into a small public projection; production does not import
the 1.3 MB evidence manifest. Unknown IDs return `unknown`, not assumed AI/ROOK
ownership. Offline integrity checks detect missing/new/changed files and stale
public metadata. No network lookup is required by the application or checks.

## Public UI

Credits stay in **Profile → Appearance**, with one quiet AI disclosure:

> Most exercise illustrations were generated for ROOK using AI and reviewed for exercise identification.

The required exception reads:

> Cable Crunch illustration by Bryl Lim / Workout Guide. Recolored and reframed for ROOK. Licensed under CC BY-SA 4.0.

Creator/library and license are accessible external links using the existing
native/browser link handler. A separate **EXERCISE REFERENCES** area states:

> Workout Guide provides exercise catalog information, including names, muscles and equipment.

No repeated AI badge, provider endorsement, proprietary license or © ROOK claim
is added. Required entries are rendered from the registry rather than hardcoded
into Appearance. The same component can display additional audited licensed art.

**Exercise Detail already had no displayed per-image credit/source line.** Its
image availability `.source` is a URL, not authorship metadata. Detail, active
planned/freestyle workouts, expanded viewer, plan review, Add/Replace picker
identity thumbnails and mobility/conditioning all use the shared resolver. No
credit container was removed from Detail and no layout gap was created.
The before/after Detail screenshots are identical at decoded-pixel level.

CSS backgrounds contain no additional image URL pipeline. Onboarding is text/UI
geometry rather than a second exercise image library. Unknown/custom exercises
keep the current no-art behavior; there is no generic legacy image fallback.
User-uploaded workout/progress photos, photo comparison and export/import canvas
content are user-provided data, outside the shipped-art inventory. Their original
authorship cannot be inferred from app code; no private photos were inspected,
deleted, reclassified or sent anywhere.

## Licensing and open items

[Workout Guide licensing](https://github.com/bryllim/workout-guide/blob/main/LICENSES.md)
separates MIT software/documentation from CC BY-SA 4.0 artwork. Its frame-level
manifest names Bryl Lim for the matching frame 2 drawings. The upstream project
also preserves Everkinetic ancestry for its foundational/first-pose frames;
that notice remains in the [copied upstream attribution](licenses/workout-guide/ATTRIBUTION.md).
It is not blanket authorship of ROOK's AI replacements.

[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) permits commercial
sharing/adaptation with attribution, a license link, modification notice and
share-alike for adaptations. Those requirements remain attached to the 93
retained third-party files. Unmodified upstream notices and pinned usage notes
are in [docs/licenses/workout-guide](licenses/workout-guide/ROOK-USAGE.md).

Open items before any publication/rights claim:

- Original designer/permission for the root branding mark and its derivatives.
- Exact AI provider/model, generation timestamps and applicable contractual terms
  were not recorded. The tool/workflow is known; those fields remain null.
- Historical records do not exhaustively record every early input/style reference.
  Review that input history and applicable provider terms before claiming legal
  ownership or deciding that generation settles derivative-work questions.

No provider attribution requirement or AI copyright ownership is invented. This
audit identifies provenance and preserves known obligations; it is not a legal
determination that generated output is copyrightable or exclusively owned.

## QA and diff

- **284 tests passed in eight focused/domain/illustration files.**
- Final provenance/credits tests re-run after tightening unknown-branding handling.
- Production `npm run build` succeeded, output isolated in
  `artifacts/visual-provenance/production-build`; existing review/native outputs
  were preserved. No commit, push, merge, deploy or native sync occurred.
- `git diff --check` passed. Integrity: 766 files, 18 inline SVG blocks, all 331
  current exercise IDs have valid image paths and provenance, projection current.
- Before/after Detail decoded-pixel comparison: identical, zero changed channels.
- Actual component browser proof: Credits at 320/390/430, Standard Dark and
  Premium Dark; no horizontal overflow, source/license links present.
- Tests cover AI detail/no gap, required credit, catalog reference separation,
  unknown/new IDs, retained branding unknowns, valid paths, and registry-driven
  required entries. No misleading per-image AI credit was introduced.

Task source changes: Appearance credit component integration, catalog metadata
separation, shared provenance lookup, importer metadata, two scoped credit layout
rules and tests. New files contain manifest/policy/exceptions, public projection,
compiler/integrity scripts, credits component and upstream notices. The final
task scope is nine previously existing files changed and 16 new source/docs files.
The seven application/importer/test files changed are separate from two doc updates.
The final
task baseline comparison lists changed files under
`artifacts/visual-provenance/changed-source-files.json`; earlier dirty work is not
represented as newly authored changes in this report.

Screenshots and full evidence are in the [local review page](http://127.0.0.1:4284/artifacts/visual-provenance/review.html).
The screenshots use actual exported ROOK components with a synthetic state;
they do not mutate the user's profile, workouts or sync data.

Phone review on the same Wi-Fi: **http://10.34.34.59:4284/**.
Evidence: **http://10.34.34.59:4284/artifacts/visual-provenance/review.html**.
Physical iPhone review remains to be done. Stop for review before publishing
attribution changes or resolving branding/provider rights through replacement.
