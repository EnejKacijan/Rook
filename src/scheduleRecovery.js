import {isoDay} from './domain.js';
import {combinedAdjustment} from './combinedWorkoutLifecycle.js';
import {flexiblePlanFingerprint,flexibleReviewFingerprint,flexibleSessionStatus,flexibleSessions,addCalendarDays} from './flexibleWeek.js';
import {scheduleTransactionId} from './scheduleTransactions.js';
import {templateUseIssues} from './savedWorkouts.js';

const fingerprint=state=>JSON.stringify([state.profile,state.gymProfiles,state.defaultGymProfileId,flexibleReviewFingerprint(state)]);
function editable(state,id){
  const record=state.flexibleWeek?.sessions?.[id];
  if(!record||id!==`${record.workoutId}:${record.originalDate}`)throw Error('This schedule change is no longer available.');
  if(state.activeWorkout||state.activeOptionalSession||combinedAdjustment(state))throw Error('Finish or cancel the active workout before repairing the schedule.');
  if(['completed','active','reserved','combined'].includes(flexibleSessionStatus(state,record)))throw Error('This workout has already started or finished. Its schedule stays protected.');
  if(record.planFingerprint===flexiblePlanFingerprint(state))throw Error('This schedule change is already up to date.');
  return record;
}
function keepMovedDate(state,id){
  const record=editable(state,id),today=isoDay(),day=state.program?.days?.find(day=>day.id===record.workoutId),block=state.program?.trainingBlock;
  if(!day||record.skipped)throw Error('This workout is no longer available in the current plan.');
  if(block?.completed||record.blockId&&record.blockId!==block?.id||record.blockWeekNumber&&!block?.weeks?.some(w=>w.weekNumber===record.blockWeekNumber&&w.workouts.some(item=>item.programDayId===record.workoutId)))throw Error('This move belongs to a different training block.');
  if(record.scheduledDate<today||record.scheduledDate>addCalendarDays(today,13))throw Error('This moved date is outside the next 14 days. Remove the outdated move, then choose a new date.');
  if(state.todayAdaptation?.date===record.scheduledDate)throw Error('Review your today-only adjustment first.');
  const next=structuredClone(state),updated=next.flexibleWeek.sessions[id];
  updated.planFingerprint=flexiblePlanFingerprint(state);updated.updatedAt=new Date().toISOString();
  const all=flexibleSessions(next,today),item=all.find(item=>item.logicalSessionId===id&&item.scheduledDate===record.scheduledDate);
  if(!item||!['planned','optional'].includes(item.status)||!item.workout.exercises.length)throw Error('The current workout cannot use this moved date.');
  const collision=all.some(other=>other.logicalSessionId!==id&&other.scheduledDate===record.scheduledDate&&other.status!=='skipped')||Object.values(next.flexibleWeek.sessions).some(other=>other.id!==id&&!other.skipped&&other.scheduledDate===record.scheduledDate);
  if(collision)throw Error('Another workout uses that date. Remove this outdated move, then review the schedule.');
  const issues=templateUseIssues({...next,activeWorkout:item.workout},item.workout);if(issues.length)throw Error(issues.join(' '));
  return {state:next,workout:item.workout};
}
export function reviewScheduleRecovery(state,id){
  const record=editable(state,id);let workout=null,reason='';
  try{workout=keepMovedDate(state,id).workout;}catch(error){reason=error.message;}
  const removed=structuredClone(state);delete removed.flexibleWeek.sessions[id];
  const afterRemoval=flexibleSessions(removed).filter(item=>item.workoutId===record.workoutId&&item.status!=='skipped').map(item=>({date:item.scheduledDate,name:item.workout.workoutName||item.workout.name,status:item.status}));
  return {id,today:isoDay(),fingerprint:fingerprint(state),record:structuredClone(record),workout,reason,afterRemoval};
}
export function applyScheduleRecovery(state,review,mode){
  if(!review||review.today!==isoDay()||review.fingerprint!==fingerprint(state))throw Error('The plan or sessions changed. Review this move again.');
  const record=editable(state,review.id);
  let next;
  if(mode==='keep')next=keepMovedDate(state,review.id).state;
  else if(mode==='remove'){
    next=structuredClone(state);delete next.flexibleWeek.sessions[review.id];
    // Retain the old fact for backups/audits; never delete workout history or
    // move a completed session. Removing an unstarted override resumes the plan.
    next.flexibleWeek.recoveryHistory=[...(next.flexibleWeek.recoveryHistory||[]),{...record,removedAt:new Date().toISOString(),reason:'outdated-move-removed'}].slice(-40);
  }else throw Error('Choose how to repair this schedule change.');
  next.flexibleWeek.revision=(state.flexibleWeek.revision||0)+1;next.flexibleWeek.generation=scheduleTransactionId();
  return next;
}
