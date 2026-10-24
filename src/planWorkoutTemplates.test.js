import {it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {completeWorkout,currentWeekSchedule,serializeState,deserializeState} from './domain.js';
import {saveWorkoutTemplate} from './savedWorkouts.js';
import {planWorkoutChoices,resolvePlanWorkout,startPlanWorkoutExtra} from './planWorkoutTemplates.js';
import {createCustomExerciseRecord,customExerciseSnapshot} from './customExercises.js';

const fixture=()=>createReturningUserFixture(0);
it('projects every active plan day without writing or duplicating saved workouts',()=>{
  const state=fixture(),before=structuredClone(state);
  state.program.days[1].name=state.program.days[0].name;
  const rows=planWorkoutChoices(state);
  expect(rows).toHaveLength(state.program.days.length);
  expect(rows[0].reference.dayId).not.toBe(rows[1].reference.dayId);
  state.program.days[1].weekday=state.program.days[0].weekday;
  expect(planWorkoutChoices(state)[0].contextLabel).not.toBe(planWorkoutChoices(state)[1].contextLabel);
  expect(state.savedWorkoutTemplates).toEqual(before.savedWorkoutTemplates);
  expect(planWorkoutChoices({...state,program:null})).toEqual([]);
  const first=rows[0];state.program.days[0].name='Updated';
  expect(planWorkoutChoices(state)[0].name).toBe('Updated');
  expect(()=>resolvePlanWorkout(state,first.reference)).toThrow('changed');
});
it('preserves declared per-set targets and creates only explicit independent saved copies',()=>{
  const state=fixture(),day=state.program.days[0];
  Object.assign(day.exercises[0].sets[0],{weight:42.5,reps:9,completed:true,touched:true});
  const reference=planWorkoutChoices(state)[0].reference;
  const {draft}=resolvePlanWorkout(state,reference);
  expect(draft.exercises[0].sets[0]).toMatchObject({weight:42.5,reps:9});
  expect(draft.exercises[0].sets[0]).not.toHaveProperty('completed');
  const saved=saveWorkoutTemplate(state,draft,{id:'explicit-copy'});
  expect(saved.savedWorkoutTemplates).toHaveLength((state.savedWorkoutTemplates?.length||0)+1);
  const copy=structuredClone(saved.savedWorkoutTemplates[0]);
  saved.program.days[0].exercises[0].sets[0].reps=20;
  expect(saved.savedWorkoutTemplates[0]).toEqual(copy);
  expect(state.savedWorkoutTemplates?.length||0).toBe(0);
});
it('starts a fresh detached extra workout, is idempotent, and cannot complete a planned day',()=>{
  const state=fixture(),before=structuredClone(state),reference=planWorkoutChoices(state)[0].reference;
  const schedule=currentWeekSchedule(state);
  const next=startPlanWorkoutExtra(state,{reference,requestId:'extra-start'}),active=next.activeWorkout;
  expect(active).toMatchObject({source:'freestyle',programDayId:null,sourcePlanSlotId:null,templateId:null});
  expect(active.logicalSessionId).toBeUndefined();
  expect(active.planWorkoutOrigin).toEqual({programId:state.program.id,dayId:reference.dayId,requestId:'extra-start'});
  expect(active.exercises[0].id).not.toBe(state.program.days[0].exercises[0].id);
  expect(active.exercises[0].sets[0].id).not.toBe(state.program.days[0].exercises[0].sets[0].id);
  expect(active.exercises.every(e=>e.sets.every(s=>s.completed===false))).toBe(true);
  expect(startPlanWorkoutExtra(next,{reference,requestId:'extra-start'})).toBe(next);
  expect(()=>startPlanWorkoutExtra(next,{reference,requestId:'another-start'})).toThrow('in progress');
  active.exercises.forEach(e=>e.sets.forEach(s=>{s.completed=true;s.weight??=20;}));
  const finished=completeWorkout(next);
  expect(finished.program).toEqual(before.program);
  expect(finished.workouts).toHaveLength(before.workouts.length+1);
  expect(currentWeekSchedule(finished).map(s=>s.status)).toEqual(schedule.map(s=>s.status));
  expect(finished.savedWorkoutTemplates).toEqual(before.savedWorkoutTemplates);
  expect(deserializeState(serializeState(finished),{strict:true}).workouts.at(-1).planWorkoutOrigin).toEqual(active.planWorkoutOrigin);
});
it('rejects changed, replaced and removed plans before start without mutating user state',()=>{
  const state=fixture(),reference=planWorkoutChoices(state)[0].reference;
  for(const mutate of [s=>{s.program.version++;},s=>{s.program.id='replacement';},s=>{s.program.days[0].exercises[0].sets.pop();},s=>{s.program=null;},s=>{s.profile.id='other-profile';},s=>{s.profile.onboardingComplete=false;}]){
    const changed=structuredClone(state);mutate(changed);const before=structuredClone(changed);
    expect(()=>startPlanWorkoutExtra(changed,{reference,requestId:'stale'})).toThrow('changed');
    expect(changed).toEqual(before);
  }
});
it('retains supersets, timed per-side custom prescriptions and independently identified segments',()=>{
  const state=fixture(),record=createCustomExerciseRecord({name:'Custom hold',equipment:['bodyweight'],loggingType:'duration',loggingMode:'per_side'});
  const day=state.program.days[0];day.warmupPlan={mode:'none'};
  day.exercises=day.exercises.slice(0,2).map(e=>({...e,supersetId:'pair'}));
  day.exercises.push({id:'custom-entry',exerciseId:record.id,exerciseSource:'custom',importedExercise:customExerciseSnapshot(record),loggingMode:'per_side',measure:'seconds',repMin:35,repMax:45,restSeconds:60,targetRir:null,
    sets:[{id:'custom-set',reps:35,weight:null,rir:null,sides:{left:{reps:35},right:{reps:40}},segments:[{id:'segment',reps:20,weight:null}]}]});
  const reference=planWorkoutChoices(state)[0].reference;
  const next=startPlanWorkoutExtra(state,{reference,requestId:'complex'}),[one,two,custom]=next.activeWorkout.exercises;
  expect(one.supersetId).toBe(two.supersetId);expect(one.supersetId).not.toBe('pair');
  expect(custom.importedExercise.id).toBe(record.id);expect(custom.restSeconds).toBe(60);
  expect(custom.sets[0].sides).toEqual(day.exercises[2].sets[0].sides);
  expect(custom.sets[0].segments[0]).toMatchObject({reps:20,completed:false});
  expect(custom.sets[0].segments[0].id).not.toBe('segment');
});
it('rechecks equipment and active optional sessions at the final start action',()=>{
  const state=fixture(),reference=planWorkoutChoices(state)[0].reference;
  const restricted=structuredClone(state);restricted.profile.environment='Home gym';restricted.profile.equipment=['bodyweight'];
  expect(()=>startPlanWorkoutExtra(restricted,{reference,requestId:'equipment'})).toThrow('incompatible');
  expect(()=>startPlanWorkoutExtra({...state,activeOptionalSession:{id:'cardio'}},{reference,requestId:'cardio'})).toThrow('in progress');
});
