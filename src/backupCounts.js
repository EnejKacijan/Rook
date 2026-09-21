// Counts describe records in data/state.json, before runtime hydration/migration.
// Both ZIP export and ZIP validation must use this same archive-level contract.
export function canonicalBackupCounts(state, photos = []) {
  const workouts = Array.isArray(state.workouts) ? state.workouts : [];
  return {
    programDays: state.program?.days?.length || 0,
    workouts: workouts.length,
    // Count completed top-level set records, not sides, segments, warmups or
    // the active session. Those remain nested data in their owning records.
    completedSets: workouts.reduce((total, workout) => total + (workout.exercises || [])
      .reduce((sum, exercise) => sum + (exercise.sets || []).filter(set => set.completed).length, 0), 0),
    workoutPhotos: photos.length,
    // Historical field name: this counts message records, not unique thread IDs.
    coachConversations: Array.isArray(state.conversations) ? state.conversations.length : 0,
    weightCheckins: Array.isArray(state.weightCheckins) ? state.weightCheckins.length : 0,
    savedWorkoutTemplates: Array.isArray(state.savedWorkoutTemplates) ? state.savedWorkoutTemplates.length : 0,
    importedMeasurementSources: Array.isArray(state.importedMeasurementSources) ? state.importedMeasurementSources.length : 0,
  };
}

export function compareBackupCounts(expected, state, photos = [], {schemaVersion=1}={}) {
  const actual = canonicalBackupCounts(state, photos);
  return [...new Set([...Object.keys(actual), ...Object.keys(expected)])].map(field => {
    const present = Object.hasOwn(expected, field);
    let status;
    if (!Object.hasOwn(actual, field)) status = 'unsupported';
    // Original schema-1 exporters predate imported measurements. Their six
    // counters still MUST match. Missing is compatible only for this known
    // additive field, when the archived collection itself is also absent.
    else if (!present && schemaVersion===1 && ['importedMeasurementSources','savedWorkoutTemplates'].includes(field) &&
      !Object.hasOwn(state, field) && actual[field] === 0) status = 'legacy-zero';
    else if (!present) status = 'missing';
    else if (!Number.isSafeInteger(expected[field]) || expected[field] < 0) status = 'invalid';
    else status = expected[field] === actual[field] ? 'match' : 'mismatch';
    return { field, expected: present ? expected[field] : null, recomputed: actual[field] ?? null, status };
  });
}
