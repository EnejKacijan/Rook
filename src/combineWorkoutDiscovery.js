import {isoDay,exerciseCatalog} from './domain.js';
import {combineSources,buildCombinedProposal} from './combineWorkouts.js';
import {pendingCoachWorkflows} from './coachConversations.js';
import {flexibleWeekConflict} from './flexibleWeek.js';
import {effectiveGymContext} from './gymProfiles.js';
import {compileProfileTrainingSafety,trainingSafetyBlocks} from './trainingSafety.js';
import {validateSupersetExercises} from './supersets.js';

export const COMBINE_WORKOUTS_PROMPT='Combine two workouts';
// Probe the same canonical operation that will later prepare the real proposal.
// A focused source review is a valid next step; a plain conflict is not.
export function combineWorkoutDiscovery(state,today=isoDay()) {
  const unavailable={available:false,hasMissed:false};
  if(!state.program||today!==isoDay()||state.activeWorkout||state.activeOptionalSession||state.todayAdaptation)return unavailable;
  if(pendingCoachWorkflows(state).length)return {...unavailable,reason:'coach-workflow'};
  if(flexibleWeekConflict(state)||state.optionalSessions?.some(s=>s.date===today&&s.status==='planned'))return unavailable;
  const safety=compileProfileTrainingSafety(effectiveGymContext(state,{}).profile,Object.values(exerciseCatalog));
  if(trainingSafetyBlocks(safety.status))return unavailable;
  const eligible=combineSources(state,today),required=eligible.filter(s=>s.scheduledDate===today);
  const sources=eligible.filter(s=>s.workout.warmupPlan?.mode!=='custom'&&!validateSupersetExercises(s.workout.exercises).length)
    .sort((a,b)=>Number(b.status==='missed')-Number(a.status==='missed'));
  for(let i=0;i<sources.length-1;i++)for(let j=i+1;j<sources.length;j++){
    if(required.some(s=>s!==sources[i]&&s!==sources[j]))continue;
    const result=buildCombinedProposal(state,{sourceIds:[sources[i].logicalSessionId,sources[j].logicalSessionId],minutes:null,date:today});
    const review=result.combineReviewRequired?.issues;
    if(result.status==='ready'||review?.length&&review.every(issue=>issue.workoutId&&issue.exerciseEntryId))
      return {available:true,hasMissed:sources[i].status==='missed'||sources[j].status==='missed'};
  }
  return unavailable;
}
