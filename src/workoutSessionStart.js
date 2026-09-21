// Session preparation may contain numeric defaults, but never execution credit.
// Keep instance IDs and prescription metadata; do not reconstruct from titles.
const executionFields = [
  'started', 'startedAt', 'completedAt', 'skippedAt', 'touched',
  'parked', 'parkedAt', 'partialProgress', 'lastActiveAt',
  'completedSetCount', 'completedPlannedSetCount', 'performedSetCount',
  'weightEntryMode', 'repsEntryMode', 'rirEntryMode', 'sideRepsEntryMode',
  'weightSourceSetId', 'repsSourceSetId',
];

function clearExecution(value) {
  for (const key of executionFields) delete value[key];
  if (Object.hasOwn(value, 'completed')) value.completed = false;
  if (Object.hasOwn(value, 'skipped')) value.skipped = false;
  return value;
}

function resetSet(set) {
  clearExecution(set);
  set.completed = false;
  for (const side of Object.values(set.sides || {})) clearExecution(side);
  for (const segment of set.segments || []) resetSet(segment);
  return set;
}

export function preparedExercise(entry) {
  const result = clearExecution(structuredClone(entry));
  result.sets = (result.sets || []).map(resetSet);
  return result;
}

function preparedWarmup(warmup) {
  if (!warmup) return null;
  const result = clearExecution(structuredClone(warmup));
  // Both stage-owned checks and legacy top-level copies are persisted.
  const reset = group => {
    clearExecution(group);
    for (const item of [...group.general || [], ...group.movementPreparation || []]) clearExecution(item);
    for (const entry of group.rampUpSets || []) {
      clearExecution(entry);
      for (const set of entry.sets || []) resetSet(set);
    }
  };
  reset(result);
  for (const stage of result.stages || []) reset(stage);
  return result;
}

/** Small detached baseline, shared by preparation and restart compatibility.
 * Cleaning older stored snapshots must not change their numbers or structure. */
export function sessionStartSnapshot(prepared) {
  if (prepared.source === 'freestyle') return {exercises: [], warmup: null};
  return {
    exercises: prepared.exercises.map(preparedExercise),
    warmup: preparedWarmup(prepared.warmup),
  };
}

export function restartBaseline(workout) {
  // Freestyle has always been created empty. This is also safe for older
  // sessions without a snapshot or resumed from an empty completion; their
  // mutated queue is not a start baseline.
  if (workout?.source === 'freestyle') return {exercises: [], warmup: null};
  if (Array.isArray(workout?.restartSnapshot?.exercises))
    return sessionStartSnapshot(workout.restartSnapshot);
  return null;
}
