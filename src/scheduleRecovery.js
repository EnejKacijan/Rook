import {adaptedTemplateForToday,baseWeekSchedule,isoDay,weekKey} from './domain.js';
import {todayWorkoutFingerprint} from './adjustToday.js';
import {combinedAdjustment} from './combinedWorkoutLifecycle.js';
import {flexiblePlanFingerprint,flexibleReviewFingerprint,flexibleSessionStatus,flexibleSessions,addCalendarDays,linkedScheduleChanges} from './flexibleWeek.js';
import {scheduleTransactionId} from './scheduleTransactions.js';
import {templateUseIssues} from './savedWorkouts.js';

const fingerprint=state=>JSON.stringify([state.profile,state.gymProfiles,state.defaultGymProfileId,flexibleReviewFingerprint(state)]);
const protectedStatuses=['completed','active','reserved','combined'];
const dateAtNoon=date=>new Date(`${date}T12:00:00`);
const ownsAdjustment=(record,adjustment)=>adjustment?.date===record.scheduledDate&&adjustment.programDayId===record.workoutId;
const adjustmentFor=(state,records)=>records.some(record=>ownsAdjustment(record,state.todayAdaptation)) ? state.todayAdaptation : null;
function editable(state,id){
  const record=state.flexibleWeek?.sessions?.[id];
  if(!record||id!==`${record.workoutId}:${record.originalDate}`)throw Error('This schedule change is no longer available.');
  if(state.activeWorkout||state.activeOptionalSession||combinedAdjustment(state)||state.todayAdaptation?.mode==='repeat')throw Error('Finish or cancel the current workout before updating the schedule.');
  if(protectedStatuses.includes(flexibleSessionStatus(state,record)))throw Error('This workout has already started or finished. Its schedule stays protected.');
  if(record.planFingerprint===flexiblePlanFingerprint(state)&&state.program?.days.some(day=>day.id===record.workoutId)&&
    !state.workoutOccurrenceOverrides?.[record.scheduledDate]?.[record.workoutId]?.skipWorkout)throw Error('This schedule change is already up to date.');
  if(record.skipped&&(record.scheduledDate<isoDay()||state.program?.trainingBlock?.resolvedSkips?.some(skip=>skip.logicalSessionId===id)))throw Error('This skip belongs to the recorded schedule and can’t be changed here.');
  return record;
}
function moveGroup(state,id){
  const group=linkedScheduleChanges(state,id);
  if(group.some(record=>protectedStatuses.includes(flexibleSessionStatus(state,record))))throw Error('A linked workout has already started or finished. Its schedule stays protected.');
  return group;
}
function projectKeptDates(state,group,choice,today=isoDay()){
  const block=state.program?.trainingBlock,plan=flexiblePlanFingerprint(state);
  const adjustment=adjustmentFor(state,group);
  const next={...state, flexibleWeek:{...state.flexibleWeek,sessions:{...state.flexibleWeek.sessions}},
    todayAdaptation:choice==='plan' && adjustment ? null : state.todayAdaptation};
  for(const record of group){
    const day=state.program?.days?.find(day=>day.id===record.workoutId);
    if(record.skipped)throw Error('Remove the old skip to use the current schedule.');
    if(!day)throw Error('The original workout is no longer available in the current plan.');
    if(block?.completed||record.blockId&&record.blockId!==block?.id||record.blockWeekNumber&&!block?.weeks?.some(w=>w.weekNumber===record.blockWeekNumber&&w.workouts.some(item=>item.programDayId===record.workoutId)))throw Error('This move belongs to a different training block.');
    if(record.scheduledDate<today||record.scheduledDate>addCalendarDays(today,13))throw Error('This moved date has passed or is outside the next 14 days.');
    const originalWeek=baseWeekSchedule(state,record.originalDate,{includeDuration:false});
    if(!originalWeek.some(item=>item.workoutId===record.workoutId&&item.originalDate===record.originalDate)&&
      originalWeek.some(item=>item.workoutId===record.workoutId))throw Error('The current plan puts this workout on a different original date.');
    next.flexibleWeek.sessions[record.id]={...record,planFingerprint:plan};
  }
  const all=flexibleSessions(next,today,{includeDuration:false});
  const workouts=Object.fromEntries(group.map(record=>{
    const item=all.find(item=>item.logicalSessionId===record.id&&item.scheduledDate===record.scheduledDate);
    if(!item||!['planned','optional'].includes(item.status)||!item.workout.exercises.length)throw Error('The current workout cannot use this moved date.');
    const collision=all.some(other=>other.logicalSessionId!==record.id&&other.scheduledDate===record.scheduledDate&&other.status!=='skipped')||Object.values(next.flexibleWeek.sessions).some(other=>other.id!==record.id&&!other.skipped&&other.scheduledDate===record.scheduledDate);
    if(collision)throw Error('Another workout uses that date.');
    const saved=ownsAdjustment(record,adjustment);
    const workout=adaptedTemplateForToday(next,dateAtNoon(record.scheduledDate),item.workout);
    if(choice==='adjustment'&&saved&&!workout.todayOnlyAdjustment)throw Error('The saved one-off adjustment can no longer be used.');
    const issues=templateUseIssues({...next,activeWorkout:{...workout,adjustment:workout.todayOnlyAdjustment}},workout);
    if(issues.length)throw Error(issues.join(' '));
    return [record.id,workout];
  }));
  return {state:next,workouts};
}
function removeMoves(state,group){
  const next={...state,flexibleWeek:{...state.flexibleWeek,sessions:{...state.flexibleWeek.sessions}},
    workoutOccurrenceOverrides:{...state.workoutOccurrenceOverrides},todayAdaptation:adjustmentFor(state,group)?null:state.todayAdaptation};
  for(const record of group){
    delete next.flexibleWeek.sessions[record.id];
    if(!next.workoutOccurrenceOverrides[record.scheduledDate]?.[record.workoutId])continue;
    const day={...next.workoutOccurrenceOverrides[record.scheduledDate]};
    delete day[record.workoutId];
    if(Object.keys(day).length)next.workoutOccurrenceOverrides[record.scheduledDate]=day;
    else delete next.workoutOccurrenceOverrides[record.scheduledDate];
  }
  return next;
}

// Edit Plan can safely keep a move when the identity, schedule rule and
// prescription it was made against have not changed. Never revive stale links.
export function preserveMovesAfterPlanEdit(before,after,today=isoDay()){
  if(!before.program||!after.program||!after.flexibleWeek?.sessions||
    before.program.id!==after.program.id||before.program.rotationStartDate!==after.program.rotationStartDate||
    before.program.trainingBlock?.id!==after.program.trainingBlock?.id||before.program.trainingBlock?.startDate!==after.program.trainingBlock?.startDate)return after;
  const previousFingerprint=flexiblePlanFingerprint(before),changed=new Set();
  if(previousFingerprint===flexiblePlanFingerprint(after))return after;
  const eligible=record=>{
    const oldDay=before.program.days.find(day=>day.id===record.workoutId);
    const day=after.program.days.find(day=>day.id===record.workoutId);
    return !record.skipped&&record.planFingerprint===previousFingerprint&&oldDay&&day&&
      !protectedStatuses.includes(flexibleSessionStatus(after,record,today))&&
      todayWorkoutFingerprint(oldDay)===todayWorkoutFingerprint(day);
  };
  let next=after;
  for(const record of Object.values(after.flexibleWeek.sessions)){
    if(changed.has(record.id))continue;
    const group=linkedScheduleChanges(after,record.id);
    if(!group.length||!group.every(eligible))continue;
    try{
      next=projectKeptDates(next,group,adjustmentFor(next,group)?'adjustment':'plan',today).state;
      group.forEach(item=>changed.add(item.id));
    }catch{/* Conflicting moves remain reviewable without losing their saved context. */}
  }
  return next;
}
export function reviewScheduleRecovery(state,id){
  const record=editable(state,id),group=moveGroup(state,id),adjustment=adjustmentFor(state,group);
  const preview=(choice,workoutId)=>{try{return {workout:projectKeptDates(state,group,choice).workouts[workoutId]};}catch(error){return {workout:null,reason:error.message};}};
  const planned=preview('plan',id),adjusted=adjustment?preview('adjustment',group.find(item=>ownsAdjustment(item,adjustment)).id):null;
  const removed=removeMoves(state,group);
  const afterRemoval=flexibleSessions(removed,isoDay(),{includeDuration:false}).filter(item=>item.status!=='skipped'&&group.some(record=>
    item.workoutId===record.workoutId&&weekKey(item.originalDate)===weekKey(record.originalDate))).map(item=>({date:item.scheduledDate,name:item.workout.workoutName||item.workout.name,status:item.status}));
  return {id,today:isoDay(),fingerprint:fingerprint(state),record:structuredClone(record),groupCount:group.length,
    workout:planned.workout,reason:planned.reason,adjustment:adjustment?{snapshot:adjustment.workout,...adjusted}:null,
    discardsChanges:Boolean(adjustment||group.some(item=>state.workoutOccurrenceOverrides?.[item.scheduledDate]?.[item.workoutId])),afterRemoval};
}
export function applyScheduleRecovery(state,review,mode){
  if(!review||review.today!==isoDay()||review.fingerprint!==fingerprint(state))throw Error('The plan or sessions changed. Review this move again.');
  editable(state,review.id);
  const group=moveGroup(state,review.id);
  let next;
  if(mode==='keep'||mode==='keep-adjustment'){
    if(mode==='keep-adjustment'&&!adjustmentFor(state,group))throw Error('The one-off adjustment changed. Review the move again.');
    next=projectKeptDates(state,group,mode==='keep'?'plan':'adjustment').state;
  }
  else if(mode==='remove'){
    next=removeMoves(state,group);
    // Retain the old fact for backups/audits; never delete workout history or
    // move a completed session. Removing an unstarted override resumes the plan.
    next.flexibleWeek.recoveryHistory=[...(next.flexibleWeek.recoveryHistory||[]),...group.map(record=>({...record,removedAt:new Date().toISOString(),reason:'outdated-move-removed'}))].slice(-40);
  }else throw Error('Choose how to repair this schedule change.');
  next.flexibleWeek.revision=(state.flexibleWeek.revision||0)+1;next.flexibleWeek.generation=scheduleTransactionId();
  return next;
}
