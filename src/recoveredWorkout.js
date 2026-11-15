import {calendarDate,isoDay,weekday} from './domain.js';
import {preparedExercise} from './workoutSessionStart.js';

export const recoveredWorkoutSession = session => session?.kind==='Strength' &&
  session.workout?.optionalSessionId===session.id && Boolean(session.workout.recoveredMove?.occurrenceId);

export function recoveredWorkoutForDate(state,date){
  return (state.optionalSessions||[]).find(session=>session.status==='planned'&&session.date===date&&recoveredWorkoutSession(session))?.workout || null;
}

// A moved day can outlive the permanent plan entry. Save the draft with that
// exact move before replacing the plan, freeing the ordinary Adjust Today slot.
// Callers own the draft state and persist both changes in their transaction.
export function transferRemovedMoveAdjustment(state,today=isoDay()){
  const adjustment=state.todayAdaptation;
  if(adjustment?.schemaVersion!==1||['repeat','combined'].includes(adjustment.mode)||
    !adjustment.workout?.exercises?.length||!state.program||adjustment.date<today||
    state.program.days.some(day=>day.id===adjustment.programDayId))return false;
  const record=Object.values(state.flexibleWeek?.sessions||{}).find(record=>!record.skipped&&
    record.originalDate!==record.scheduledDate&&record.workoutId===adjustment.programDayId&&record.scheduledDate===adjustment.date&&
    record.id===`${record.workoutId}:${record.originalDate}`);
  if(!record)return false;
  state.flexibleWeek.sessions[record.id]={...record,detachedAdjustment:structuredClone(adjustment)};
  state.todayAdaptation=null;
  return true;
}

export function recoveredWorkoutDraft(record,adjustment){
  const source=adjustment.workout,id=`recovered-strength:${record.id}`;
  const {name,workoutName,workoutDescriptor,location,estimatedMinutes,warmupPlan}=source;
  const workout={id,optionalSessionId:id,weekday:weekday(calendarDate(record.scheduledDate)),type:'workout',
    name:name||record.name||'One-off workout',workoutName,workoutDescriptor,location,estimatedMinutes,warmupPlan,
    recoveredMove:{occurrenceId:record.id,originalDate:record.originalDate,date:record.scheduledDate,
      temporaryEquipment:adjustment.temporaryEquipment||null,gymProfileId:adjustment.gymProfileId||null,gymProfileName:adjustment.gymProfileName||null},
    exercises:source.exercises.map(preparedExercise)};
  return {id,date:record.scheduledDate,kind:'Strength',activity:workout.name,duration:estimatedMinutes||null,
    intensity:'One-off workout',status:'planned',createdAt:Date.now(),workout};
}

export function cancelRecoveredWorkout(state,id,today=isoDay()){
  const session=state.optionalSessions?.find(item=>item.id===id);
  if(!recoveredWorkoutSession(session)||session.status!=='planned'||session.date<today||
    state.activeWorkout?.optionalSessionId===id||state.workouts?.some(item=>item.optionalSessionId===id&&item.completedAt)){
    throw Error('This one-off workout is no longer available to remove.');
  }
  return {...state,optionalSessions:state.optionalSessions.map(item=>item.id===id?{...item,status:'cancelled'}:item)};
}
