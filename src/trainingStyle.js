export const TRAINING_STYLES = ['plan', 'own-workouts', 'freestyle'];

export function intentionalNoPlan(state) {
  if (state?.program) return false;
  const receipt = state?.profile?.noPlanReceipt;
  const versions = state?.planVersions || [];
  if (versions.length) return receipt?.kind === 'stopped-plan' && receipt.planVersionId === versions.at(-1)?.id;
  // A preference alone is not proof that an active plan was deliberately
  // removed: users can prefer Freestyle while still following a plan.
  if (state?.workouts?.some(workout => workout.source !== 'freestyle')) return false;
  if (receipt?.kind === 'first-run' && ['own-workouts', 'freestyle'].includes(state?.profile?.preferredTrainingStyle)) return true;
  // Older saved-only/freestyle profiles predate the explicit first-run choice.
  return Boolean(state?.savedWorkoutTemplates?.length || state?.workouts?.length);
}

export function trainingStyleFor(state) {
  if (['own-workouts', 'freestyle'].includes(state?.profile?.preferredTrainingStyle))
    return state.profile.preferredTrainingStyle;
  if (state?.program) return 'plan';
  return state?.savedWorkoutTemplates?.length ? 'own-workouts' : 'freestyle';
}
