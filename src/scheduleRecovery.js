import {adaptedTemplateForToday,baseWeekSchedule,calendarDate,isoDay,weekday,weekKey} from './domain.js';
import {todayWorkoutFingerprint} from './adjustToday.js';
import {combinedAdjustment} from './combinedWorkoutLifecycle.js';
import {flexiblePlanFingerprint,flexibleReviewFingerprint,flexibleSessionStatus,flexibleSessions,addCalendarDays,linkedScheduleChanges,temporaryScheduleIssue,createFlexibleWeekPlanner,proposeFlexibleWeek,applyFlexibleWeek} from './flexibleWeek.js';
import {scheduleTransactionId} from './scheduleTransactions.js';
import {templateUseIssues} from './savedWorkouts.js';
import {recoveredWorkoutDraft,recoveredWorkoutForDate} from './recoveredWorkout.js';

const fingerprint=state=>JSON.stringify([state.profile,state.gymProfiles,state.defaultGymProfileId,state.optionalSessions,flexibleReviewFingerprint(state)]);
export const scheduleRecoveryIsCurrent=(state,review)=>Boolean(review && review.today===isoDay() && review.fingerprint===fingerprint(state));
const protectedStatuses=['completed','active','reserved','combined'];
const dateAtNoon=date=>new Date(`${date}T12:00:00`);
const ownsAdjustment=(record,adjustment)=>adjustment?.date===record.scheduledDate&&adjustment.programDayId===record.workoutId;
const adjustmentFor=(state,records)=>records.some(record=>ownsAdjustment(record,state.todayAdaptation)) ? state.todayAdaptation : null;
function editable(state,id){
  const record=state.flexibleWeek?.sessions?.[id];
  if(!record||id!==`${record.workoutId}:${record.originalDate}`)throw Error('This schedule change is no longer available.');
  if(state.activeWorkout||state.activeOptionalSession||combinedAdjustment(state)||state.todayAdaptation?.mode==='repeat')throw Error('Finish or cancel the current workout before updating the schedule.');
  if(protectedStatuses.includes(flexibleSessionStatus(state,record)))throw Error('This workout has already started or finished. Its schedule stays protected.');
  if(!temporaryScheduleIssue(state,record))throw Error('This schedule change is already up to date.');
  if(record.skipped&&(record.scheduledDate<isoDay()||state.program?.trainingBlock?.resolvedSkips?.some(skip=>skip.logicalSessionId===id)))throw Error('This skip belongs to the recorded schedule and can’t be changed here.');
  return record;
}
function moveGroup(state,id){
  return linkedScheduleChanges(state,id).filter(record=>!protectedStatuses.includes(flexibleSessionStatus(state,record)));
}
function projectKeptDates(state,group,choice,today=isoDay()){
  const block=state.program?.trainingBlock,plan=flexiblePlanFingerprint(state);
  const adjustment=adjustmentFor(state,group);
  const next={...state, flexibleWeek:{...state.flexibleWeek,sessions:{...state.flexibleWeek.sessions}},
    workoutOccurrenceOverrides:{...state.workoutOccurrenceOverrides},
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
    next.flexibleWeek.sessions[record.id]={...record,programId:state.program.id,planFingerprint:plan};
    const override=next.workoutOccurrenceOverrides[record.scheduledDate]?.[record.workoutId];
    if(override?.skipWorkout){
      next.workoutOccurrenceOverrides[record.scheduledDate]={...next.workoutOccurrenceOverrides[record.scheduledDate],
        [record.workoutId]:{...override,skipWorkout:false}};
    }
  }
  for(const record of group){
    const issue=temporaryScheduleIssue(next,next.flexibleWeek.sessions[record.id]);
    if(issue)throw Error(issue);
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

function projectOneOff(state,record){
  const adjustment=detachedFor(record)||adjustmentFor(state,[record]);
  if(record.skipped||state.program?.days.some(day=>day.id===record.workoutId)||!adjustment?.workout?.exercises?.length)
    throw Error('There is no detached adjustment to keep for this workout.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(record.scheduledDate)||record.scheduledDate<isoDay()||record.scheduledDate>addCalendarDays(isoDay(),13))
    throw Error('The moved date is no longer available for a one-off workout.');
  const session=recoveredWorkoutDraft(record,adjustment);
  if(recoveredWorkoutForDate(state,record.scheduledDate)||state.optionalSessions?.some(item=>item.id===session.id))
    throw Error('There is already a saved one-off workout for this date.');
  const issues=templateUseIssues({...state,activeWorkout:session.workout},session.workout);
  if(issues.length)throw Error(issues.join(' '));
  const next=removeMoves(state,[record]);
  return {...next,optionalSessions:[...(state.optionalSessions||[]),session],selectedDate:record.scheduledDate,selectedDay:weekday(calendarDate(record.scheduledDate))};
}
const detachedFor=record=>ownsAdjustment(record,record.detachedAdjustment)?record.detachedAdjustment:null;

function recoveryMoveSource(state,record) {
  const original=removeMoves(state,[record]);
  // Stage this exact occurrence at its source so the normal Move validator can
  // choose a new date while retaining its pinned training-block week.
  original.flexibleWeek.sessions[record.id]={...record,scheduledDate:record.originalDate,
    programId:state.program?.id,planFingerprint:flexiblePlanFingerprint(state)};
  return original;
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
  const detached=detachedFor(record);
  let oneOff=false,oneOffReason='';
  if((detached||ownsAdjustment(record,adjustment))&&!state.program?.days.some(day=>day.id===record.workoutId)){
    try{projectOneOff(state,record);oneOff=true;}catch(error){oneOffReason=error.message;}
  }
  const removed=removeMoves(state,group);
  const afterRemoval=flexibleSessions(removed,isoDay(),{includeDuration:false}).filter(item=>item.status!=='skipped'&&group.some(record=>
    item.workoutId===record.workoutId&&weekKey(item.originalDate)===weekKey(record.originalDate))).map(item=>({date:item.scheduledDate,name:item.workout.workoutName||item.workout.name,status:item.status}));
  const occurrence=state.workoutOccurrenceOverrides?.[record.scheduledDate]?.[record.workoutId];
  const canMove=group.length===1 && !record.skipped && !adjustment && !detached &&
    !Object.keys(occurrence||{}).some(key=>key!=='skipWorkout');
  const moves=canMove ? createFlexibleWeekPlanner(recoveryMoveSource(state,record)) : null;
  const moveDates=canMove ? Array.from({length:14},(_,index)=>addCalendarDays(isoDay(),index))
    .filter(date=>date!==record.scheduledDate && moves.check({mode:'move',sessionId:record.id,toDate:date}).status==='ready') : [];
  return {id,today:isoDay(),fingerprint:fingerprint(state),record:structuredClone(record),groupCount:group.length,
    workout:planned.workout,reason:planned.reason,adjustment:detached?{snapshot:detached.workout}:adjustment?{snapshot:adjustment.workout,...adjusted}:null,oneOff,oneOffReason,
    discardsChanges:Boolean(adjustment||group.some(item=>detachedFor(item)||state.workoutOccurrenceOverrides?.[item.scheduledDate]?.[item.workoutId])),afterRemoval,moveDates};
}
export function applyScheduleRecovery(state,review,mode,{toDate}={}){
  if(!scheduleRecoveryIsCurrent(state,review))throw Error('The plan or sessions changed. Review this move again.');
  const record=editable(state,review.id);
  const group=moveGroup(state,review.id);
  let next;
  if(mode==='keep'||mode==='keep-adjustment'){
    if(mode==='keep-adjustment'&&!adjustmentFor(state,group))throw Error('The one-off adjustment changed. Review the move again.');
    next=projectKeptDates(state,group,mode==='keep'?'plan':'adjustment').state;
  }
  else if(mode==='move'){
    if(!review.moveDates?.includes(toDate))throw Error('Choose an available date for this workout.');
    const original=recoveryMoveSource(state,record);
    const proposal=proposeFlexibleWeek(original,{mode:'move',sessionId:record.id,toDate});
    const result=applyFlexibleWeek(original,proposal);
    if(result.status!=='applied')throw Error(result.error||'This date is no longer available.');
    next=result.state;
  }
  else if(mode==='remove'||mode==='one-off'){
    next=mode==='one-off'?projectOneOff(state,record):removeMoves(state,group);
    // Retain the old fact for backups/audits; never delete workout history or
    // move a completed session. Removing an unstarted override resumes the plan.
    next.flexibleWeek.recoveryHistory=[...(next.flexibleWeek.recoveryHistory||[]),...(mode==='one-off'?[record]:group).map(({detachedAdjustment,...record})=>({...record,removedAt:new Date().toISOString(),reason:mode==='one-off'?'outdated-move-kept-as-one-off':'outdated-move-removed'}))].slice(-40);
  }else throw Error('Choose how to repair this schedule change.');
  next.flexibleWeek.revision=(state.flexibleWeek.revision||0)+1;next.flexibleWeek.generation=scheduleTransactionId();
  return next;
}
