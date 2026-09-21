import {isoDay, uid, workoutPerformedDate, saveState, weekday,calendarDate,estimateSessionMinutes} from './domain.js';
import {addCalendarDays, flexibleSessions, flexibleSessionById, flexibleReviewFingerprint, proposeFlexibleWeek, applyFlexibleWeek, completedWorkoutForOccurrence} from './flexibleWeek.js';
import {preparedExercise} from './workoutSessionStart.js';

export const isRepeatAdjustment = value => value?.schemaVersion===1 && value.mode==='repeat';
export function cancelRepeatedWorkout(state,{persist=saveState}={}) {
  if(!isRepeatAdjustment(state.todayAdaptation))return state;
  if(state.activeWorkout && state.activeWorkout.adjustment?.id!==state.todayAdaptation.id)throw Error('Finish the active workout first.');
  if(state.activeWorkout?.exercises.some(e=>e.sets.some(s=>s.completed)))throw Error('Finish early to preserve your logged sets.');
  const next={...state,activeWorkout:null,todayAdaptation:null};
  if(!persist(next))throw Error('Couldn’t save. Your workout is unchanged. Try again.');
  return next;
}
export function repeatTemplate(state,date) {
  const a=state.todayAdaptation;
  if(!isRepeatAdjustment(a) || a.date!==date)return null;
  return {...structuredClone(a.workout),adapted:true,todayOnlyAdjustment:structuredClone(a)};
}
export function proposeWorkoutToday(state,request,today=isoDay(),{eligibilityOnly=false}={}) {
  const sessions=flexibleSessions(state,today);
  const record=request.workoutId ? state.workouts.find(w=>w.id===request.workoutId && w.completedAt) : null;
  const source=request.sessionId ? flexibleSessionById(state,request.sessionId,today) : null;
  const resolved=request.sessionId?completedWorkoutForOccurrence(state,source||{logicalSessionId:request.sessionId}):null;
  const fail=error=>({status:'conflict',error,...(resolved?{completedWorkoutId:resolved.id}:{}),sourceStatus:source?.status});
  if(resolved&&!record)return fail(`This workout was already performed. View the completed workout or start a new repeat.`);
  if(!record && (!source || !['planned','missed','optional'].includes(source.status)))return fail(source?.status==='active'?'This workout is already in progress.':source?.status==='skipped'?'This session was skipped.':source?.status==='reserved'?'This session is included in a combined workout.':'The schedule changed. Choose another workout.');
  if(state.activeWorkout || state.activeOptionalSession)return fail('Finish or cancel your active workout first.');
  if(state.todayAdaptation)return fail('Finish or cancel the pending workout adjustment first.');
  if(source?.scheduledDate===today)return fail('This workout is already scheduled for today.');
  const displaced=sessions.find(s=>s.scheduledDate===today && s.logicalSessionId!==source?.logicalSessionId && ['planned','missed','optional'].includes(s.status));
  if(displaced && !request.displacedToDate){
    const dates=[];
    for(let i=1;i<=13;i++){
      const toDate=addCalendarDays(today,i);
      if(proposeFlexibleWeek(state,{mode:'move',sessionId:displaced.logicalSessionId,toDate},today).status!=='ready')continue;
      dates.push(toDate);
      // Menu eligibility needs one valid destination. The actual proposal still
      // enumerates every date using exactly the same canonical move validation.
      if(eligibilityOnly)break;
    }
    if(!dates.length)return fail('No dates are free for today’s workout. Adjust your week first.');
    return {status:'choose-date',sourceName:record?.name || source.workout.name,displaced,dates};
  }
  let displacedProposal=null,staged=state;
  if(displaced){
    if(request.displacedToDate<=today)return fail('Choose a future date for today’s workout.');
    displacedProposal=proposeFlexibleWeek(state,{mode:'move',sessionId:displaced.logicalSessionId,toDate:request.displacedToDate},today);
    if(displacedProposal.status!=='ready')return displacedProposal;
    const result=applyFlexibleWeek(state,displacedProposal);if(result.status!=='applied')return result;staged=result.state;
  }
  let moveProposal=null;
  if(source){
    moveProposal=proposeFlexibleWeek(staged,{mode:'move',sessionId:source.logicalSessionId,toDate:today,allowCompletedToday:true},today);
    if(moveProposal.status!=='ready')return moveProposal;
  }
  if(record && !record.exercises?.length)return fail('This workout has no exercises to repeat.');
  return {status:'ready',today,request:structuredClone(request),fingerprint:flexibleReviewFingerprint(state),kind:record?'repeat':'move',
    sourceName:record?.name || source.workout.name,sourceDate:record?workoutPerformedDate(record):source.originalDate,displaced,displacedProposal,moveProposal};
}
export function canUseWorkoutToday(state,request,today=isoDay()) {
  return ['ready','choose-date'].includes(proposeWorkoutToday(state,request,today,{eligibilityOnly:true}).status);
}
export function applyWorkoutToday(state,proposal,{persist=saveState}={}) {
  if(proposal?.status!=='ready' || proposal.today!==isoDay() || proposal.fingerprint!==flexibleReviewFingerprint(state))throw Error('The workouts changed. Review your selection again.');
  const checked=proposeWorkoutToday(state,proposal.request,proposal.today);
  if(checked.status!=='ready')throw Error(checked.error || 'Review your selection again.');
  let next=structuredClone(state);
  if(checked.displacedProposal){const r=applyFlexibleWeek(next,checked.displacedProposal);if(r.status!=='applied')throw Error(r.error);next=r.state;}
  if(checked.moveProposal){
    // Displacement writes an updatedAt timestamp. Rebase the already reviewed
    // move request on that exact intermediate state, not an earlier timestamp.
    const move=proposeFlexibleWeek(next,checked.moveProposal.request,checked.today);
    const r=applyFlexibleWeek(next,move);if(r.status!=='applied')throw Error(r.error);next=r.state;
  }
  else {
    const record=state.workouts.find(w=>w.id===checked.request.workoutId),id=uid('repeat');
    // Copy prescriptions and exercise identity only. Logger fills previous values
    // by its normal rules; no historical actuals, segments or completion flags.
    const workout={id,name:record.name,workoutName:record.workoutName,weekday:weekday(calendarDate(checked.today)),logicalSessionId:id,originalScheduledDate:checked.today,
      exercises:record.exercises.map(e=>{
        const {originalPrescription,personalNote,notes,...base}=preparedExercise(e);
        return {...base,id:uid('repeat-exercise'),...(originalPrescription?{repMin:originalPrescription.repMin,repMax:originalPrescription.repMax,targetRir:originalPrescription.targetRir}:{}),
          sets:(originalPrescription?.sets || e.sets).map(s=>({id:uid('set'),...(s.setType?{setType:s.setType}:{}),weight:null,reps:null,rir:null,completed:false,planned:true,added:false}))};
      })};
    workout.estimatedMinutes=estimateSessionMinutes(workout.exercises);
    next.todayAdaptation={schemaVersion:1,id,mode:'repeat',date:checked.today,programDayId:id,sourceWorkoutId:record.id,sourceDate:checked.sourceDate,workout,originalWorkout:structuredClone(workout),appliedAt:new Date().toISOString()};
  }
  next.selectedDate=checked.today;next.selectedDay=weekday(calendarDate(checked.today));
  if(!persist(next))throw Error('Couldn’t save the schedule. Your previous schedule is unchanged. Try again.');
  return next;
}
