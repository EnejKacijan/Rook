import { progressionFor } from './domain.js';
import { sessionFeedbackLabel } from './sessionFeedback.js';

// The rating describes the whole session, not an individual lift. It can
// temper or contextualize a result-based suggestion, but never create a load
// increase/decrease without that exercise's own comparable set evidence.
export function nextWorkoutAdvice(exercise, history, profile) {
  const advice = progressionFor(exercise, history, profile);
  if (!advice) return null;

  const lastExposure = [...(history || [])].reverse().find(workout =>
    workout.exercises?.some(item => item.exerciseId === exercise.exerciseId),
  );
  if (!lastExposure?.completedAt || lastExposure.endedEarly ||
      lastExposure.adjustment || lastExposure.optionalSessionId ||
      lastExposure.trainingBlock?.plannedDeload ||
      !sessionFeedbackLabel(lastExposure.sessionFeedback)) return advice;

  const rating = lastExposure.sessionFeedback;
  if (rating === 'about_right') return {
    ...advice,
    detail: `${advice.detail} The whole last session felt about right; follow the logged progression.`,
  };
  if (rating === 'harder' && advice.type === 'progress') {
    return {
      type: 'hold',
      title: 'Repeat before increasing',
      detail: 'Exercise targets support an increase, but the whole last session felt harder than expected. Repeat the current load or variation first; your plan is unchanged.',
    };
  }
  const context = rating === 'easier'
    ? advice.type === 'progress'
      ? 'The whole last session also felt easier than expected.'
      : 'The whole last session felt easier; this exercise’s logged results still favor this step.'
    : 'The whole last session felt harder; base the next step on this exercise’s results, not the rating alone.';
  return { ...advice, detail: `${advice.detail} ${context}` };
}
