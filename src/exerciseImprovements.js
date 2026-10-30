import {exerciseCatalog,exerciseLoadRequirement,exerciseMeasure,isoDay,calendarDate as localDate,progressionContextMatches,recentExerciseProgress,weekKey,workoutPerformedDate} from './domain.js';
import {effectiveSetReps,loggingModeOf,prComparableSet} from './advancedLogging.js';
import {progressionHistory} from './progressionHistory.js';

function startOrder(workout) {
  const source=workout.sourceDate;
  if(workout.historicalImport||source) {
    if(source?.precision!=='datetime'||typeof source.value!=='string')return null;
    const zoned=/(?:Z|[+-]\d{2}:?\d{2})$/.test(source.value);
    const provider=workout.historicalImport?.source;
    if(!zoned&&!provider)return null;
    // Unzoned source times can order the same provider's local-day records;
    // they cannot order a native UTC instant or a different source's clock.
    const time=Date.parse(source.value+(zoned?'':'Z'));
    return Number.isFinite(time)?{time,basis:zoned?'instant':`source-wall:${provider}`}:null;
  }
  const value=workout.startedAt;
  if(typeof value!=='number'&&!(typeof value==='string'&&/T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)))return null;
  const time=new Date(value).getTime();return Number.isFinite(time)?{time,basis:'instant'}:null;
}

function comparisonExercise(exercise) {
  if(exerciseMeasure(exercise)!=='reps'||exerciseCatalog[exercise.exerciseId]?.exerciseType==='assisted_bodyweight'||/assist/i.test(exercise.exerciseId))return null;
  const load=exerciseLoadRequirement(exercise);
  const sets=(exercise.sets||[]).filter(set=>{
    const reps=effectiveSetReps(exercise,set);
    if(!set.completed||set.warmup||set.isWarmup||set.setType==='warmup'||!prComparableSet(exercise,set)||!Number.isInteger(reps)||reps<=0)return false;
    if(load==='none')return true;
    const weight=set.weight;
    if(load==='optional'&&weight==null)return true;
    return weight!==''&&weight!=null&&Number.isFinite(Number(weight))&&(load==='required'?Number(weight)>0:Number(weight)>=0);
  }).map(set=>({...set,reps:effectiveSetReps(exercise,set),weight:load==='none'?null:load==='optional'&&set.weight==null?0:Number(set.weight)}));
  return sets.length?{...exercise,sets}:null;
}

// Every event is one factual gain against the preceding compatible exposure,
// not an all-time PR. Keep earlier gains even if a later session holds/regresses.
export function exerciseImprovementHistory(workouts=[],now=new Date()) {
  const today=isoDay(now);
  const chronological=progressionHistory(workouts).filter(workout=>{
    if(!workout?.completedAt||typeof workout.completedAt==='boolean')return false;
    const date=workoutPerformedDate(workout),time=new Date(workout.completedAt).getTime();
    if(!date||date>today||!Number.isFinite(time)||time>now.getTime())return false;
    return true;
  }).sort((left,right)=>{
    const dateOrder=String(workoutPerformedDate(left)).localeCompare(String(workoutPerformedDate(right)));
    if(dateOrder)return dateOrder;
    const a=startOrder(left),b=startOrder(right);
    return String(a?.basis||'unknown').localeCompare(String(b?.basis||'unknown'))||
      (a&&b?a.time-b.time:0)||String(left.id||'').localeCompare(String(right.id||''));
  });
  const sameDay=new Map(),ambiguous=new Set();
  for(const workout of chronological)for(const exercise of workout.exercises||[]) {
    if(!exercise.exerciseId||!exercise.sets?.some(set=>set.completed))continue;
    const key=`${workoutPerformedDate(workout)}:${exercise.exerciseId}`,group=sameDay.get(key)||[];
    group.push(startOrder(workout));sameDay.set(key,group);
  }
  for(const [key,group] of sameDay)if(group.length>1&&
    (group.some(order=>!order)||new Set(group.map(order=>order.basis)).size!==1||new Set(group.map(order=>order.time)).size!==group.length))ambiguous.add(key);
  const previous=new Map(),events=[];
  for(const [workoutIndex,workout] of chronological.entries()) {
    const groups=new Map();
    for(const exercise of workout.exercises||[]) {
      if(!exercise.exerciseId||!exercise.sets?.some(set=>set.completed))continue;
      const group=groups.get(exercise.exerciseId)||[];group.push(exercise);groups.set(exercise.exerciseId,group);
    }
    for(const [exerciseId,group] of groups) {
      // Two performed slots with the same exercise are not an unambiguous pair.
      if(group.length!==1||ambiguous.has(`${workoutPerformedDate(workout)}:${exerciseId}`)){previous.delete(exerciseId);continue;}
      const exercise=group[0],snapshot=comparisonExercise(exercise),prior=previous.get(exerciseId);
      if(!snapshot){previous.delete(exerciseId);continue;}
      if(prior&&progressionContextMatches(prior.snapshot,snapshot)) {
        const change=recentExerciseProgress([{...prior.workout,exercises:[prior.snapshot]},{...workout,exercises:[snapshot]}])[0];
        if(change)events.push({...change,exercise,date:workoutPerformedDate(workout),workoutId:workout.id,
          id:`${workout.id||`legacy-${workout.completedAt}-${workoutIndex}`}:${exerciseId}`,
          previousDate:workoutPerformedDate(prior.workout),previousWorkoutId:prior.workout.id,loggingMode:loggingModeOf(exercise)});
      }
      previous.set(exerciseId,{snapshot,workout});
    }
  }
  return events.reverse();
}
export function improvementsForPeriod(events,period='week',today=isoDay()) {
  if(period==='all')return events;
  const start=weekKey(localDate(today));return events.filter(event=>event.date>=start&&event.date<=today);
}
export function latestImprovedExercises(events) {
  const seen=new Set();return events.filter(event=>{if(seen.has(event.exerciseId))return false;seen.add(event.exerciseId);return true;});
}
export function improvementDateLabel(date,today=isoDay()) {
  if(date===today)return 'Today';
  const yesterday=localDate(today);yesterday.setDate(yesterday.getDate()-1);
  if(date===isoDay(yesterday))return 'Yesterday';
  return new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric',...(date.slice(0,4)!==today.slice(0,4)?{year:'numeric'}:{})}).format(localDate(date));
}
