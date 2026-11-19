import { progressionFor } from './domain.js';
import { sessionFeedbackLabel } from './sessionFeedback.js';
import {progressionHistory,isDeloadWorkout} from './progressionHistory.js';
import {currentTrainingBlockWeek} from './trainingBlocks.js';

// The rating describes the whole session, not an individual lift. It can
// temper or contextualize a result-based suggestion, but never create a load
// increase/decrease without that exercise's own comparable set evidence.
export function nextWorkoutAdvice(exercise, history, profile, state=null) {
  let advice = progressionFor(exercise, history, profile,state);
  if (!advice) return null;
  if(advice.title==='Planned deload')return advice;
  const block=state?.program?.trainingBlock;
  if(!block?.completed&&currentTrainingBlockWeek(state)?.phase==='deload')
    advice={...advice,afterDeload:true,detail:`For your next normal workout after deload. ${advice.detail}`};

  const lastExposure = progressionHistory(history).reverse().find(workout =>
    workout.exercises?.some(item => (exercise.id&&item.id===exercise.id) || item.exerciseId === exercise.exerciseId),
  );
  if (!lastExposure?.completedAt || isDeloadWorkout(lastExposure) || lastExposure.endedEarly ||
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
      ...(advice.afterDeload?{afterDeload:true}:{}),
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
