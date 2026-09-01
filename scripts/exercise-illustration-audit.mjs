import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  EXERCISE_ILLUSTRATION_EQUIVALENTS,
  EXERCISE_THUMBNAIL_NORMALIZATION,
  ROOK_ADAPTED_ILLUSTRATIONS,
  exerciseCatalog,
  isExerciseAutoGenerationBlocked,
  isExerciseGloballyBlocked,
  matchImportedExerciseName,
} from "../src/domain.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const artDirectory = path.join(projectRoot, "src", "assets", "exercise-art");
const artFiles = (await readdir(artDirectory)).filter((file) =>
  /^wg-.*\.svg$/iu.test(file),
);
const artFileIds = new Set(artFiles.map((file) => file.replace(/\.svg$/iu, "")));
const canonical = Object.values(exerciseCatalog).filter(
  (item) => !item.id.startsWith("wg-"),
);
const generated = canonical.filter(
  (item) =>
    !isExerciseAutoGenerationBlocked(item) && !isExerciseGloballyBlocked(item),
);

for (const file of artFiles) {
  const source = await readFile(path.join(artDirectory, file), "utf8");
  assert.match(source, /<svg\b[^>]*\bwidth="512"[^>]*\bheight="512"/u, file);
  assert.match(source, /\bviewBox="[^"]+"/u, file);
  assert.match(source, /\bfill="#1f6b4c"/u, file);
  assert.doesNotMatch(source, /\bstroke=|<text\b|<(?:linear|radial)Gradient\b|<filter\b/iu, file);
}
for (const item of Object.values(exerciseCatalog).filter((item) => item.artId))
  assert.ok(artFileIds.has(item.artId), `${item.id}: missing ${item.artId}.svg`);

const illustrationFamilies = new Set(
  Object.values(exerciseCatalog).map((item) => item.artId).filter(Boolean),
);
assert.equal(illustrationFamilies.size, artFiles.length);

for (const [artId, normalization] of Object.entries(
  EXERCISE_THUMBNAIL_NORMALIZATION,
)) {
  assert.ok(artFileIds.has(artId), `${artId}: thumbnail normalization has no asset`);
  assert.ok(
    normalization.scale >= 1 && normalization.scale <= 1.14,
    `${artId}: scale ${normalization.scale} exceeds the normalized SVG safety margin`,
  );
  assert.ok(Math.abs(normalization.x) <= 2, `${artId}: excessive horizontal offset`);
  assert.ok(Math.abs(normalization.y) <= 2, `${artId}: excessive vertical offset`);
}

for (const item of canonical.filter((item) => item.artId))
  for (const alias of item.aliases || []) {
    const match = matchImportedExerciseName(alias);
    assert.ok(match.exerciseId, `${item.id}: unresolved alias ${alias}`);
    assert.ok(
      exerciseCatalog[match.exerciseId]?.artId,
      `${item.id}: alias ${alias} resolves without art`,
    );
  }

const report = {
  canonicalExercises: canonical.length,
  canonicalResolvingToArt: canonical.filter((item) => item.artId).length,
  canonicalWithoutArt: canonical.filter((item) => !item.artId).map((item) => item.name),
  generatedExercises: generated.length,
  generatedResolvingToArt: generated.filter((item) => item.artId).length,
  generatedWithoutArt: generated.filter((item) => !item.artId).map((item) => item.name),
  illustrationFamilies: illustrationFamilies.size,
  explicitAliasesResolvingToArt: canonical
    .filter((item) => item.artId)
    .reduce((count, item) => count + (item.aliases?.length || 0), 0),
  canonicalFamilyMappings: Object.entries(EXERCISE_ILLUSTRATION_EQUIVALENTS).map(
    ([exerciseId, sourceSlug]) => ({ exerciseId, sourceSlug }),
  ),
  rookAdaptedFamilies: Object.entries(ROOK_ADAPTED_ILLUSTRATIONS).map(
    ([exerciseId, assetSlug]) => ({ exerciseId, assetSlug }),
  ),
  thumbnailNormalization: Object.entries(EXERCISE_THUMBNAIL_NORMALIZATION).map(
    ([artId, values]) => ({ artId, ...values }),
  ),
  svgSystem: {
    format: "static SVG",
    canvas: "512 × 512",
    color: "#1f6b4c",
    paint: "filled paths; no stroke, text, gradients, filters or shadows",
    thumbnailSafety:
      "all SVG painted bounds are normalized to 88%; thumbnail-only scale is capped at 1.14",
    themeTreatment:
      "shared artwork with separate light/dark CSS paint treatment",
  },
};

console.log(JSON.stringify(report, null, 2));
