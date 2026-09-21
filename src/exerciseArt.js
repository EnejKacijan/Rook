import {exerciseCatalog,matchImportedExerciseName,splitImportedExerciseLabel,EXERCISE_THUMBNAIL_NORMALIZATION} from './domain.js';
const EXERCISE_ART_ASSETS = import.meta.glob("./assets/exercise-art/wg-*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
function exerciseArtId(exercise) {
  const aliasMatch = [
    exercise?.importedName,
    exercise?.name,
    exercise?.exerciseName,
    exercise?.title,
  ]
    .filter(Boolean)
    .map((name) => matchImportedExerciseName(splitImportedExerciseLabel(name).name))
    .find((match) => exerciseCatalog[match?.exerciseId]?.artId);
  const artId =
    exerciseCatalog[exercise?.exerciseId]?.artId ||
    exerciseCatalog[aliasMatch?.exerciseId]?.artId ||
    exercise?.artId;
  return artId || null;
}
export function exerciseArt(exercise) {
  const artId = exerciseArtId(exercise);
  return artId
    ? EXERCISE_ART_ASSETS[`./assets/exercise-art/${artId}.svg`] || null
    : null;
}
const preloadedExerciseArt = new Map();
export function preloadExerciseArt(exercise, fetchPriority = "auto") {
  const source = exerciseArt(exercise);
  if (!source || typeof Image === "undefined") return null;
  if (preloadedExerciseArt.has(source)) return preloadedExerciseArt.get(source);
  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = fetchPriority;
  image.src = source;
  const ready = image.decode?.().catch(() => {}) || Promise.resolve();
  preloadedExerciseArt.set(source, ready);
  return ready;
}
export function exerciseThumbnailPresentation(exercise) {
  const artId = exerciseArtId(exercise);
  const normalization = EXERCISE_THUMBNAIL_NORMALIZATION[artId] || {
    scale: 1,
    x: 0,
    y: 0,
  };
  return {
    artId: artId || null,
    style: {
      "--exercise-art-scale": normalization.scale,
      "--exercise-art-offset-x": `${normalization.x}px`,
      "--exercise-art-offset-y": `${normalization.y}px`,
    },
  };
}
