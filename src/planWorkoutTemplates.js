import {refreshWorkoutWarmup} from './domain.js';
import {startFreestyleWorkout} from './freestyleWorkout.js';
import {instantiateTemplate,templateUseIssues,templateDraft} from './savedWorkouts.js';
import {reusableExerciseDefinition} from './workoutTemplateSchema.js';

const changed='Your plan changed. Go back and reopen this workout.';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const signature=(program,day)=>{const {estimatedMinutes,...prescription}=day;return JSON.stringify(canonical([program.id,program.version??null,{...prescription,exercises:day.exercises.map(e=>({...e,loggingMode:e.loggingMode||'normal'}))}]));};
const workoutName=day=>day.workoutName||day.name||'Workout';

// A live library projection, never persisted as another saved-workout record.
export function planWorkoutChoices(state) {
  const program=state.profile.onboardingComplete?state.program:null;
  const days=(program?.days||[]).filter(day=>day.exercises?.length);
  return days.map((day,index)=>({
    reference:{profileId:state.profile.id,programId:program.id,dayId:day.id,signature:signature(program,day)},
    name:workoutName(day),weekday:day.weekday,
    contextLabel:day.weekday?`${day.weekday}${days.some(other=>other!==day&&workoutName(other)===workoutName(day)&&other.weekday===day.weekday)?` · Workout ${index+1}`:''}`:`Workout ${index+1}`,
    exerciseCount:day.exercises.length,
  }));
}

export function resolvePlanWorkout(state,reference) {
  const program=state.program,day=program?.days?.find(item=>item.id===reference?.dayId);
  if(!state.profile.onboardingComplete||!program||!day||state.profile.id!==reference.profileId||program.id!==reference.programId||signature(program,day)!==reference.signature)throw Error(changed);
  const draft=templateDraft({reusableStructure:{name:workoutName(day),exercises:day.exercises.map(e=>reusableExerciseDefinition(e,{prescribed:true}))}},state);
  if(!draft.exercises.length)throw Error('This workout has no exercises. Edit your plan first.');
  return {day,draft};
}

export function startPlanWorkoutExtra(state,{reference,requestId}) {
  if(!requestId)throw Error('Missing workout action identity.');
  if(state.activeWorkout?.queueCommandIds?.includes(requestId))return state;
  const {day,draft}=resolvePlanWorkout(state,reference);
  const issues=templateUseIssues(state,draft);if(issues.length)throw Error(issues.join(' '));
  const next=startFreestyleWorkout(state);
  const active={...next.activeWorkout,name:draft.name,workoutName:draft.name,
    planWorkoutOrigin:{programId:state.program.id,dayId:day.id,requestId},
    exercises:instantiateTemplate(draft,requestId),queueCommandIds:[requestId],
    warmupPlan:structuredClone(day.warmupPlan||{mode:'auto'}),
  };
  // Source remains freestyle: finishing this detached copy cannot resolve a
  // scheduled occurrence, advance a training block or rewrite the active plan.
  refreshWorkoutWarmup(active,state.profile,state.program);
  return {...next,activeWorkout:active};
}
