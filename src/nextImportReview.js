export function nextImportReview(program, currentId) {
  const exercises = program.days.flatMap(day => day.exercises);
  const index = exercises.findIndex(exercise => exercise.id === currentId);
  return [...exercises.slice(index + 1), ...exercises.slice(0, Math.max(0, index))]
    .find(exercise => ['unresolved', 'needs-name-review'].includes(exercise.matchStatus))?.id ?? null;
}
