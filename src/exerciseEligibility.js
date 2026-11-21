import { isExerciseAllowed, exerciseCatalog } from './domain.js';
import { compileProfileTrainingSafety } from './trainingSafety.js';
import { availableCustomExerciseItems } from './customExercises.js';

// The one exercise library every picker searches: built-in catalog plus the
// person's own custom exercises. Pickers differ only in the profile they filter by.
export function exerciseLibraryItems(state) {
  return [...Object.values(exerciseCatalog), ...availableCustomExerciseItems(state)];
}

// Shared library-selection policy for Plan Editor and freestyle workouts.
export function planEditorExerciseAllowed(item, profile, compiledSafety) {
  if (!isExerciseAllowed(item, profile, compiledSafety)) return false;
  if (!item.custom) return true;
  const safety = compiledSafety ?? compileProfileTrainingSafety(profile || {}, Object.values(exerciseCatalog));
  const constraints = safety?.constraints || {};
  // Custom labels cannot prove equivalence to a restricted catalog ID.
  if (constraints.avoidExerciseIds?.length) return false;
  const restricted = Boolean(profile?.avoid?.trim() || constraints.avoidPatterns?.length || constraints.allowedBodyRegions?.length || constraints.avoidNameTokens?.length);
  return !restricted || Boolean(item.pattern && item.muscles?.length && !item.muscles.includes('Full body'));
}

export function createPlanEditorExerciseFilter(profile) {
  const safety = compileProfileTrainingSafety(profile || {}, Object.values(exerciseCatalog));
  return item => planEditorExerciseAllowed(item, profile, safety);
}
