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
  // A finished profile requires an explicit receipt. Otherwise a lost plan
  // could be hidden by an unrelated saved template or freestyle session.
  if (state?.profile?.onboardingComplete) return false;
  // Older unfinished saved-only/freestyle profiles predate the choice.
  return Boolean(state?.savedWorkoutTemplates?.length || state?.workouts?.length);
}

export function trainingStyleFor(state) {
  if (state?.program) return 'plan';
  if (['own-workouts', 'freestyle'].includes(state?.profile?.preferredTrainingStyle))
    return state.profile.preferredTrainingStyle;
  return state?.savedWorkoutTemplates?.length ? 'own-workouts' : 'freestyle';
}
