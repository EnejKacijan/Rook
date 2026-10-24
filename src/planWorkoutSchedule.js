import {isoDay,startWorkout,weekday} from './domain.js';
import {resolvePlanWorkout} from './planWorkoutTemplates.js';
import {templateUseIssues,templateDraft} from './savedWorkouts.js';
import {reusableExerciseDefinition} from './workoutTemplateSchema.js';
import {combinedAdjustment} from './combinedWorkoutLifecycle.js';
import {addCalendarDays,applyFlexibleWeek,flexibleReviewFingerprint,flexibleSessions,flexibleWeekConflict,missedFlexibleSessions,proposeFlexibleWeek} from './flexibleWeek.js';

const changed='Your plan or sessions changed. Close this review and try again.';
const name=item=>item.workout.workoutName||item.workout.name||'Workout';
const prescription=(state,workout)=>templateDraft({reusableStructure:{name:workout.workoutName||workout.name,exercises:workout.exercises.map(e=>reusableExerciseDefinition(e,{prescribed:true}))}},state);
export const planStartFingerprint=state=>JSON.stringify([state.profile,state.gymProfiles,state.defaultGymProfileId,flexibleReviewFingerprint(state)]);

function available(state,today){
  return !state.activeWorkout&&!state.activeOptionalSession&&!combinedAdjustment(state)&&state.todayAdaptation?.mode!=='repeat'&&!state.program?.trainingBlock?.completed&&!flexibleWeekConflict(state,today);
}
function matching(state,reference,today){
  resolvePlanWorkout(state,reference);
  if(!available(state,today))return [];
  const missed=new Set(missedFlexibleSessions(state,today).map(item=>item.logicalSessionId));
  return flexibleSessions(state,today).filter(item=>item.workoutId===reference.dayId&&!item.optional&&!item.workout.optional&&
    (item.status==='planned'&&item.scheduledDate>=today&&item.scheduledDate<=addCalendarDays(today,13)||missed.has(item.logicalSessionId))&&
    !(state.todayAdaptation?.programDayId===item.workoutId&&state.todayAdaptation.date===item.scheduledDate));
}
function stage(state,source,today,displacedTo){
  let next=state;const changes=[];
  const occupants=flexibleSessions(state,today).filter(item=>item.scheduledDate===today&&item.status!=='skipped'&&item.logicalSessionId!==source.logicalSessionId);
  if(occupants.length>1||occupants.some(item=>item.status!=='planned'||item.optional||item.workout.optional))throw Error('Today already has another session. Start this as an extra workout instead.');
  const other=occupants[0];
  const move=request=>{
    const proposal=proposeFlexibleWeek(next,request,today);
    if(proposal.status!=='ready'||proposal.adaptationConflict)throw Error(proposal.error||'Review your today-only adjustment before moving this workout.');
    const result=applyFlexibleWeek(next,proposal);
    if(result.status!=='applied')throw Error(result.error||changed);
    next=result.state;changes.push(...proposal.changes);
  };
  let mode='today';
  if(source.scheduledDate!==today){
    if(other&&source.scheduledDate>today){
      mode='swap';move({mode:'swap',sessionId:source.logicalSessionId,otherSessionId:other.logicalSessionId});
    }else{
      mode=other?'recover':'move';
      if(other){
        if(!displacedTo||displacedTo<=today)throw Error('Choose a future date for today’s workout.');
        move({mode:'move',sessionId:other.logicalSessionId,toDate:displacedTo});
      }
      move({mode:'move',sessionId:source.logicalSessionId,toDate:today});
    }
  }
  // Resolve the staged occurrence again: it owns the pinned block prescription
  // and any date-specific exercise edits transferred by the schedule engine.
  const occurrence=flexibleSessions(next,today).find(item=>item.logicalSessionId===source.logicalSessionId&&item.scheduledDate===today&&item.status==='planned');
  if(!occurrence)throw Error(changed);
  for(const change of changes){
    const before=flexibleSessions(state,today).find(item=>item.logicalSessionId===change.logicalSessionId);
    const after=flexibleSessions(next,today).find(item=>item.logicalSessionId===change.logicalSessionId);
    if(before?.workout.temporaryPlanAdjustment?.id&&before.workout.temporaryPlanAdjustment.id!==after?.workout.temporaryPlanAdjustment?.id)throw Error('This move leaves your temporary plan. Review that schedule first.');
  }
  const issues=templateUseIssues({...next,activeWorkout:occurrence.workout},occurrence.workout);if(issues.length)throw Error(issues.join(' '));
  const finalDates=flexibleSessions(next,today).filter(item=>item.scheduledDate>=today&&item.scheduledDate<=addCalendarDays(today,13)&&!['skipped','completed','combined'].includes(item.status)).map(item=>item.scheduledDate).sort();
  const warnings=changes.length&&finalDates.some((date,index)=>index&&addCalendarDays(finalDates[index-1],1)===date)?['Your schedule includes back-to-back training days.']:[];
  return {state:next,workout:occurrence.workout,changes,warnings,mode,other};
}

export function planScheduledOptions(state,reference,today=isoDay()){
  const candidates=matching(state,reference,today),options=[];
  for(const source of candidates){
    const occupied=flexibleSessions(state,today).some(item=>item.logicalSessionId!==source.logicalSessionId&&item.scheduledDate===today&&item.status!=='skipped');
    const destinations=[];
    if(source.scheduledDate<today&&occupied){
      for(let i=1;i<=13;i++){
        const date=addCalendarDays(today,i);
        try{stage(state,source,today,date);destinations.push(date);}catch{/* Only offer fully valid transactions. */}
      }
      if(!destinations.length)continue;
    }
    try{
      stage(state,source,today,destinations[0]);
      options.push({id:source.logicalSessionId,name:name(source),date:source.scheduledDate,originalDate:source.originalDate,status:source.status,destinations});
    }catch{/* The explicit extra path remains available. */}
  }
  return {today,fingerprint:planStartFingerprint(state),options};
}

export function reviewPlanWorkoutStart(state,{reference,snapshot,sessionId,displacedTo}){
  if(snapshot.today!==isoDay()||snapshot.fingerprint!==planStartFingerprint(state))throw Error(changed);
  const option=snapshot.options.find(item=>item.id===sessionId);
  if(!option||option.destinations.length&&!option.destinations.includes(displacedTo))throw Error('Choose an available date.');
  const source=matching(state,reference,snapshot.today).find(item=>item.logicalSessionId===sessionId);
  if(!source)throw Error(changed);
  const reviewed=stage(state,source,snapshot.today,displacedTo),draft=prescription(reviewed.state,reviewed.workout);
  return {...reviewed,draft,adjusted:JSON.stringify(draft.exercises)!==JSON.stringify(resolvePlanWorkout(state,reference).draft.exercises)};
}

export function startScheduledPlanWorkout(state,request){
  if(!request.requestId)throw Error('Missing workout action identity.');
  if(state.activeWorkout?.queueCommandIds?.includes(request.requestId))return state;
  const reviewed=reviewPlanWorkoutStart(state,request);
  const next={...reviewed.state,selectedDate:request.snapshot.today,selectedDay:weekday(new Date(`${request.snapshot.today}T12:00:00`))};
  const activeWorkout=startWorkout(next,reviewed.workout);
  activeWorkout.queueCommandIds=[request.requestId];
  return {...next,activeWorkout};
}
