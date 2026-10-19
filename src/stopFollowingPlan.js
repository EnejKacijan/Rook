import {isoDay,weekday} from './domain.js';
import {addPlanVersion,planFingerprint} from './planHistory.js';

export function stopFollowingPlan(state,persist) {
  if (!state.program) return state;
  if (state.activeWorkout || state.activeOptionalSession)
    throw new Error('Finish your active session before stopping the plan.');
  const next=structuredClone(state);
  if (planFingerprint(next.planVersions?.at(-1)?.program)!==planFingerprint(next.program))
    addPlanVersion(next,{source:'Plan history',reason:'Plan stopped'});
  next.profile.noPlanReceipt={kind:'stopped-plan',planVersionId:next.planVersions.at(-1).id};
  next.profile.preferredTrainingStyle=next.savedWorkoutTemplates?.length?'own-workouts':'freestyle';
  next.profile.onboardingComplete=true;
  next.program=null;
  next.todayAdaptation=null;
  next.flexibleWeek=null;
  next.weekScheduleOverrides={};
  next.workoutOccurrenceOverrides={};
  next.dismissedMissedReminderKey=null;
  next.selectedDate=isoDay();
  next.selectedDay=weekday();
  if (!persist(next)) throw new Error('ROOK could not save this change. Your plan is still active.');
  return next;
}
