import {describe,it,expect} from 'vitest';
import {blankState,buildProgram,startWorkout,serializeState,deserializeState,possibleFatigueSignal,recentExerciseProgress} from './domain.js';
import {createTrainingBlock,prescribeTrainingBlockWorkout,trainingBlockExerciseContext} from './trainingBlocks.js';
import {nextWorkoutAdvice} from './nextWorkoutAdvice.js';
import {reviewTrainingBlock,proposeNextBlock} from './blockReview.js';
import {freestylePreviousSets} from './freestyleWorkout.js';
import {selectProgressionRows} from './progressionOverview.js';
import {weeklyPerformanceReview,prEventsForWorkouts,workoutPersonalBests,exercisePerformance,activeExercisePrDetails} from './performanceInsights.js';
import {progressionApplyTargets} from './progressionApply.js';
import {progressionPresentation} from './progressionPresentation.js';

let seed;
function fixture(length=6){
  if(!seed){
    seed=blankState();Object.assign(seed.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
    seed.program=buildProgram(seed.profile);Object.assign(seed.program,{source:'manual',userEdited:true,rotationStartDate:'2026-08-03'});
    seed.profile.increments=Object.fromEntries(Object.keys(seed.profile.increments).map(key=>[key,2.5]));
    Object.assign(seed.profile,{recommendedWarmupsEnabled:false,rampUpSetsEnabled:false});
  }
  const state=structuredClone(seed);
  const exercise=state.program.days[0].exercises[0],first=exercise.sets[0];
  Object.assign(exercise,{repMin:6,repMax:10,targetRir:2,programmingRole:'main',defaultIncrement:2.5});
  exercise.sets=[1,2,3].map(i=>({...first,id:`base-${i}`,weight:null,reps:6,rir:null,planned:true,completed:false}));
  state.program.trainingBlock=createTrainingBlock(state.program,{id:'block-under-test',totalWeeks:length,startDate:'2026-08-03'});
  return state;
}
const day=state=>state.program.days[0];
function prescription(state,week){state.program.trainingBlock.currentWeek=week;return prescribeTrainingBlockWorkout(state,day(state));}
function record(state,week,{weight=50,reps,rir,legacy=false,phaseOnly=false}={}){
  const workout=prescription(state,week),count=state.workouts.length;
  const performed=Math.max(Date.UTC(2026,7,3+7*(week-1),12+count),state.workouts.length?Date.parse(state.workouts.at(-1).completedAt)+86400000:0);
  const completed={...workout,id:`performed-${count}`,programDayId:day(state).id,completedAt:new Date(performed).toISOString(),
    exercises:workout.exercises.map(exercise=>({...exercise,sets:exercise.sets.map(set=>({...set,weight,reps:reps??exercise.repMax,rir:rir??exercise.targetRir,completed:true,planned:true}))}))};
  if(legacy)completed.exercises.forEach(exercise=>{delete exercise.blockPrescription;});
  if(phaseOnly)delete completed.trainingBlock.plannedDeload;
  state.workouts.push(completed);return completed;
}
const advice=(state,week)=>nextWorkoutAdvice(prescription(state,week).exercises[0],state.workouts,state.profile,state);

describe('planned block transitions and progression evidence',()=>{
  it('keeps a useful rep-building step when the planned range rises',()=>{
    const state=fixture();record(state,1);const before=serializeState(state),result=advice(state,2);
    expect(result).toMatchObject({type:'hold',title:'Build reps first'});expect(result.detail).toContain('below 11');expect(result).not.toHaveProperty('weight');
    // Reading advice only selects a program week in this test, never rewrites logs.
    expect(serializeState({...state,program:{...state.program,trainingBlock:{...state.program.trainingBlock,currentWeek:1}}})).toBe(before);
  });
  it('does not treat reaching an older lower rep target as reaching the new higher one twice',()=>{
    const state=fixture(4);record(state,1);record(state,2);
    expect(advice(state,3)).toMatchObject({title:'Repeat to confirm'});expect(advice(state,3)).not.toHaveProperty('weight');
  });
  it.each([false,true])('supports a four-week review across planned RIR changes (legacy=%s)',legacy=>{
    const state=fixture(4);record(state,1,{legacy});record(state,2,{legacy});record(state,3,{legacy});record(state,4,{weight:20,reps:6,legacy});
    state.program.trainingBlock.completed=true;const before=structuredClone(state.workouts),review=reviewTrainingBlock(state),row=review.rows.find(item=>item.id===day(state).exercises[0].id);
    expect(row.comparableSessions).toBe(3);expect(row.decision).toMatchObject({type:'progress',fromWeight:50,weight:52.5});
    expect(proposeNextBlock(state).changes.find(item=>item.id===row.id)).toMatchObject({kind:'load',from:50,to:52.5});
    expect(state.workouts).toEqual(before);if(legacy)expect(state.workouts.every(workout=>!workout.exercises[0].blockPrescription)).toBe(true);
  });
  it('preserves advice after backup-style serialization without changing the saved prescription',()=>{
    const state=fixture(4);record(state,1,{legacy:true});record(state,2,{legacy:true});record(state,3,{legacy:true});
    const restored=deserializeState(serializeState(state),{strict:true}),last=restored.workouts.at(-1).exercises[0];
    expect(nextWorkoutAdvice(last,restored.workouts,restored.profile,restored)).toMatchObject({type:'progress',weight:52.5});
    expect(restored.workouts[0].exercises[0]).not.toHaveProperty('blockPrescription');
  });
  it('keeps legacy phase changes strict when their block provenance cannot be verified',()=>{
    const state=fixture();record(state,2,{legacy:true});delete state.workouts[0].trainingBlock;
    expect(advice(state,3)).toBeNull();
  });
  it('does not reinterpret manual target edits or a different permanent prescription as a planned phase',()=>{
    const state=fixture();record(state,2);const current=prescription(state,3).exercises[0];current.repMax=15;
    expect(trainingBlockExerciseContext(state,current)).toBeNull();expect(nextWorkoutAdvice(current,state.workouts,state.profile,state)).toBeNull();
    day(state).exercises[0].repMin=4;day(state).exercises[0].repMax=8;expect(advice(state,3)).toBeNull();
  });
  it('does not use a one-off adjustment to bridge a different block target',()=>{
    const state=fixture();record(state,2);state.workouts[0].adjustment={mode:'manual'};
    expect(advice(state,3)).toBeNull();
  });
  it('explains the added set, then requires evidence at the larger volume before increasing load',()=>{
    const state=fixture();record(state,2);record(state,3);expect(advice(state,4)).toMatchObject({title:'Build this week’s volume'});
    expect(advice(state,4)).not.toHaveProperty('weight');record(state,4);expect(advice(state,5)).toMatchObject({title:'Repeat to confirm'});
    record(state,5);const latest=state.workouts.at(-1).exercises[0];expect(nextWorkoutAdvice(latest,state.workouts,state.profile,state)).toMatchObject({type:'progress',weight:52.5});
  });
  it('explains a planned decrease in normal working sets without manufacturing a heavier load',()=>{
    const state=fixture();record(state,2);state.program.trainingBlock.weeks[2].mainSetDelta=-1;
    expect(advice(state,3)).toMatchObject({title:'Follow this week’s set target'});expect(advice(state,3)).not.toHaveProperty('weight');
  });
  it('describes a higher planned RIR as a new effort target rather than a past failure',()=>{
    const state=fixture();record(state,3);state.program.trainingBlock.weeks[4].mainSetDelta=0;state.program.trainingBlock.weeks[4].rirDelta=1;
    expect(advice(state,5)).toMatchObject({title:'Follow this week’s effort target'});expect(advice(state,5).detail).not.toContain('higher than planned');
  });
  it('retains conservative effort checks when an old session missed its own prescribed RIR',()=>{
    const state=fixture(4);record(state,2,{rir:0});record(state,3,{rir:1});const latest=state.workouts.at(-1).exercises[0];
    expect(nextWorkoutAdvice(latest,state.workouts,state.profile,state)).not.toHaveProperty('weight');
  });
});

describe('deload stays outside normal progression',()=>{
  it('shows an explicit deload step even without history and never offers a load increase',()=>{
    const state=fixture(),workout=prescription(state,6),exercise=workout.exercises[0];
    expect([exercise.sets.length,exercise.repMin,exercise.repMax,exercise.targetRir]).toEqual([2,6,10,4]);
    expect(nextWorkoutAdvice(exercise,[],state.profile,state)).toMatchObject({title:'Planned deload',type:'hold'});
    expect(nextWorkoutAdvice(exercise,[],state.profile,state)).not.toHaveProperty('weight');
  });
  it.each([false,true])('does not count even an unusually strong deload as a second normal success (phaseOnly=%s)',phaseOnly=>{
    const state=fixture();record(state,1);record(state,6,{weight:200,reps:20,phaseOnly});
    expect(advice(state,1)).toMatchObject({title:'Repeat to confirm'});expect(advice(state,1)).not.toHaveProperty('weight');
  });
  it('does not call a lighter deload regression or discard the normal load baseline',()=>{
    const state=fixture();record(state,1);record(state,1);record(state,6,{weight:20,reps:6});
    expect(advice(state,1)).toMatchObject({type:'progress',fromWeight:50,weight:52.5});
  });
  it('retains deload classification when a copied workout keeps its phase prescriptions without the parent block',()=>{
    const state=fixture();record(state,1);const deload=record(state,6,{weight:200,reps:20});delete deload.trainingBlock;
    expect(advice(state,1)).toMatchObject({title:'Repeat to confirm'});expect(prEventsForWorkouts(state.workouts).some(event=>event.workoutId===deload.id)).toBe(false);
  });
  it('requires fresh repeated poor sessions after recovery before suggesting a load review',()=>{
    const state=fixture();record(state,1,{reps:4});record(state,1,{reps:4});record(state,6,{weight:20,reps:6});
    expect(advice(state,1).title).not.toBe('Review the load');record(state,1,{reps:4});
    expect(advice(state,1).title).not.toBe('Review the load');record(state,1,{reps:4});expect(advice(state,1).title).toBe('Review the load');
  });
  it('does not carry a pre-deload plateau warning straight into the first normal return',()=>{
    const state=fixture();for(let i=0;i<4;i++)record(state,1,{reps:8});record(state,6,{weight:20,reps:6});
    expect(advice(state,1).type).not.toBe('stalled');record(state,1,{reps:8});
    expect(advice(state,1).type).not.toBe('stalled');
  });
  it('starts the next normal session from normal loads and keeps deload rep defaults within its own target',()=>{
    const state=fixture();record(state,1);record(state,6,{weight:20,reps:6});
    const normal=startWorkout(state,prescription(state,1));expect(normal.exercises[0].sets[0]).toMatchObject({weight:50,reps:10,completed:false});
    const deload=startWorkout(state,prescription(state,6));expect(deload.exercises[0].sets[0]).toMatchObject({weight:50,reps:6,completed:false});
  });
  it('keeps explicit previous-value sources separate for normal and deload sessions',()=>{
    const state=fixture();record(state,1);record(state,6,{weight:20,reps:6});
    state.activeWorkout=startWorkout(state,prescription(state,1));expect(freestylePreviousSets(state,state.activeWorkout.exercises[0]).map(set=>set.weight)).toEqual([50,50,50]);
    state.activeWorkout=null;state.activeWorkout=startWorkout(state,prescription(state,6));expect(freestylePreviousSets(state,state.activeWorkout.exercises[0]).map(set=>set.weight)).toEqual([20,20]);
  });
  it('uses the latest normal prescription for the Progress overview',()=>{
    const state=fixture();record(state,1);record(state,1);record(state,6,{weight:20,reps:6});
    const row=selectProgressionRows(state).find(item=>item.exercise.id===day(state).exercises[0].id);
    expect(row.result).toMatchObject({type:'progress',fromWeight:50,weight:52.5,afterDeload:true});expect(row.exercise.sets).toHaveLength(3);
    expect(progressionApplyTargets(row.exercise,row.result)).toEqual([]);expect(progressionPresentation(row.result,row.exercise).action).toContain('After deload:');
  });
  it('does not count deload as a normal progressed or held exercise in the weekly review',()=>{
    const state=fixture();record(state,1);record(state,6,{weight:20,reps:6});
    const review=weeklyPerformanceReview(state,new Date(state.workouts.at(-1).completedAt));
    expect(review.exercisesProgressed).toBe(0);expect(review.exercisesHeld).toBe(0);expect(review.completedSets).toBeGreaterThan(0);expect(review.blockContext.plannedDeload).toBe(true);
  });
  it('does not derive a fatigue warning from two exercises deliberately made lighter on deload',()=>{
    const state=fixture();record(state,1);record(state,6,{weight:20,reps:6});expect(possibleFatigueSignal(state.workouts)).toBeNull();
  });
  it('clears a pre-deload fatigue window and waits for new normal comparisons',()=>{
    const state=fixture();record(state,1,{weight:60});record(state,1,{weight:50});
    expect(possibleFatigueSignal(state.workouts)).not.toBeNull();record(state,6,{weight:20,reps:6});
    expect(possibleFatigueSignal(state.workouts)).toBeNull();record(state,1,{weight:45});expect(possibleFatigueSignal(state.workouts)).toBeNull();
    record(state,1,{weight:40});expect(possibleFatigueSignal(state.workouts)).not.toBeNull();
  });
  it('compares recent improvements with the last normal session instead of a deload',()=>{
    const state=fixture();record(state,1);record(state,6,{weight:200,reps:12});
    expect(recentExerciseProgress(state.workouts)).toEqual([]);
    record(state,1,{weight:55});
    expect(recentExerciseProgress(state.workouts)[0]).toMatchObject({type:'weight',deltaWeight:5,weight:55});
  });
  it('keeps deload records factual in history without raising normal personal bests or their baseline',()=>{
    const state=fixture(),normal=record(state,1),deload=record(state,6,{weight:200,reps:12}),exerciseId=normal.exercises[0].exerciseId;
    const before=structuredClone(state.workouts);
    expect(workoutPersonalBests(deload,[normal],()=>true).size).toBe(0);
    expect(activeExercisePrDetails([normal],deload.exercises[0])).toBeNull();
    expect(prEventsForWorkouts(state.workouts).filter(event=>event.workoutId===deload.id)).toEqual([]);
    const performance=exercisePerformance(state.workouts,exerciseId);expect(performance.bestWeight).toBe(50);
    expect(performance.sessions.at(-1)).toMatchObject({deload:true,bestWeight:200});
    const after=record(state,1,{weight:55});expect(prEventsForWorkouts(state.workouts).some(event=>event.workoutId===after.id&&event.exerciseId===exerciseId)).toBe(true);
    expect(state.workouts.slice(0,2)).toEqual(before);
  });
});
