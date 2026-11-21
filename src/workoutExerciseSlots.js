// Native planned sessions retain the day and exercise entry IDs through
// renames, reschedules and block changes. Older logs can still match by entry.
function detachedWorkout(workout) {
  const adjustment = workout?.adjustment || workout?.todayOnlyAdjustment;
  return workout?.historicalImport || workout?.source === 'freestyle' ||
    workout?.source === 'repeat' || workout?.optionalSessionId ||
    adjustment?.mode === 'combine' || adjustment?.mode === 'repeat';
}

export function plannedExerciseSlot(program, exercise, workout) {
  if (!exercise?.id || detachedWorkout(workout)) return null;
  for (const day of program?.days || []) {
    if (workout?.programDayId && workout.programDayId !== day.id) continue;
    const entry = day.exercises.find(item => item.id === exercise.id && item.exerciseId === exercise.exerciseId);
    if (entry) return {day, exercise:entry};
  }
  return null;
}

export function plannedSlotsForExercise(program, exerciseId) {
  return (program?.days || []).flatMap(day => day.exercises
    .filter(exercise => exercise.exerciseId === exerciseId)
    .map(exercise => ({day, exercise})));
}

export function exerciseInPlannedSlot(workout, slot) {
  if (detachedWorkout(workout) || workout.temporaryPlanAdjustment ||
      workout.programDayId && workout.programDayId !== slot.day.id) return null;
  return workout.exercises?.find(exercise => exercise.id === slot.exercise.id) || null;
}

// Compare the starting prescription, never the weight someone actually
// lifted. A deliberately edited load should start the next session.
export function plannedLoadChanged(weight, previous, index) {
  if (!Number.isFinite(weight)) return false;
  const savedSet = previous?.templatePrescription?.sets?.[index];
  return Boolean(savedSet && weight !== savedSet.weight);
}
