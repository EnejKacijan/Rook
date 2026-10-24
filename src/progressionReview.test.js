import {it,expect} from 'vitest';
import {progressionFor,coachContext,startWorkout} from './domain.js';
import {nextWorkoutAdvice} from './nextWorkoutAdvice.js';
import {selectProgressionRows} from './progressionOverview.js';
import {createReturningUserFixture} from './demoFixture.js';
import {prepareProgressionApply,progressionApplyTargets} from './progressionApply.js';
import {canUndoWorkoutWeightChange,undoWorkoutWeightChange} from './workoutWeightChanges.js';

const e={id:'bench-slot',exerciseId:'barbell-bench-press',repMin:6,repMax:10,targetRir:2,defaultIncrement:1};
const w=(reps=[10,10,10],loads=[40,40,40],day=1)=>({id:`session-${day}`,completedAt:`2026-10-${String(day).padStart(2,'0')}T12:00:00Z`,exercises:[{...e,sets:reps.map((reps,i)=>({id:`s-${i}`,weight:loads[i],reps,rir:2,completed:true,planned:true}))}]});
const top=()=>[w(),w(undefined,undefined,8)];
it.each(['partial','load','target'])('an intervening %s breaks success confirmation',kind=>{
  const middle=w(undefined,undefined,8);
  if(kind==='partial')middle.exercises[0].sets[0].completed=false;
  if(kind==='load')middle.exercises[0].sets.forEach(set=>set.weight=45);
  if(kind==='target')middle.exercises[0].repMax=12;
  expect(progressionFor(e,[w(),middle,w(undefined,undefined,15)]).title).toBe('Repeat to confirm');
});
it('later-set rep gains are real progress, while four unchanged sessions can still flag slowed progress',()=>{
  const history=[[8,6,5],[8,7,6],[8,8,7],[8,8,8]].map((r,i)=>w(r,undefined,1+i*7));
  expect(progressionFor(e,history).title).toBe('Build reps first');
  expect(progressionFor(e,[1,8,15,22].map(day=>w([8,7,7],undefined,day))).type).toBe('stalled');
});
it('mixed loads never produce a scalar recommendation and changed current set count withholds old success',()=>{
  expect(progressionFor(e,[w(undefined,[40,35,30]),w(undefined,[40,35,30],8)])).toMatchObject({title:'Keep your load pattern',type:'hold'});
  expect(progressionFor(e,[w(undefined,[40,35,30]),w(undefined,[40,35,30],8)])).not.toHaveProperty('weight');
  expect(progressionFor({...e,sets:[{},{}]},top())).toBeNull();
});
it('zero never supplies a required working load, and stale weight fields cannot load a no-load variation',()=>{
  expect(progressionFor(e,[w(undefined,[0,0,0]),w(undefined,[0,0,0],8)]).title).toBe('Log a working load first');
  const noLoad={...e,exerciseId:'custom-unloaded',loadRequirement:'none'};
  const history=top().map(workout=>({...workout,exercises:workout.exercises.map(exercise=>({...exercise,...noLoad}))}));
  expect(progressionFor(noLoad,history).title).toBe('Ready for a harder variation');
  expect(progressionFor(noLoad,history)).not.toHaveProperty('weight');
});
it('history is chronological, corrected revisions replace originals, and same-session duplicates cannot confirm',()=>{
  expect(progressionFor(e,top().reverse()).weight).toBe(41);
  const one=w();expect(progressionFor(e,[one,structuredClone(one)]).title).toBe('Repeat to confirm');
  const corrected=structuredClone(one);corrected.exercises[0].sets[0].completed=false;
  expect(progressionFor(e,[one,corrected])).toBeNull();
  const ambiguous=w();ambiguous.exercises.push({...structuredClone(ambiguous.exercises[0]),id:'other-slot'});
  expect(progressionFor({...e,id:'unknown'},[ambiguous])).toBeNull();
  expect(progressionFor(e,[ambiguous]).title).toBe('Repeat to confirm');
});
it('small-increment explanation follows lb and timed holds have duration-specific build and confirm states',()=>{
  expect(progressionFor(e,top(),{units:'lb',increments:{barbell:10}}).detail).toContain('22.05 lb');
  const timed={...e,exerciseId:'plank',measure:'seconds',loadRequirement:'none',repMin:20,repMax:30,targetRir:null};
  const holds=(r,day=1)=>({...w(r,[null,null,null],day),exercises:[{...timed,sets:r.map(reps=>({reps,weight:null,completed:true}))}]});
  expect(progressionFor(timed,[holds([20,25,30])]).title).toBe('Build hold time');
  expect(progressionFor(timed,[holds([30,30,30])]).title).toBe('Repeat to confirm');
  expect(progressionFor(timed,[holds([30,30,30]),holds([30,30,30],8)]).detail).toContain('30 seconds');
});
function fixture(){const state=createReturningUserFixture(0);state.profile.increments.barbell=1;Object.assign(state.program.days[0].exercises[0],e);state.workouts=top();state.activeWorkout=startWorkout(state,state.program.days[0]);return state;}
it('logger, Progress and Coach context agree on a harder-session hold',()=>{
  const state=fixture();state.workouts[1].sessionFeedback='harder';
  expect(nextWorkoutAdvice(state.activeWorkout.exercises[0],state.workouts,state.profile).title).toBe('Repeat before increasing');
  expect(selectProgressionRows(state).find(row=>row.exercise.exerciseId===e.exerciseId).result.title).toBe('Repeat before increasing');
  expect(coachContext(state).progressionResults.find(row=>row.exerciseId===e.exerciseId).result.title).toBe('Repeat before increasing');
});
it('apply preserves manual, backoff, logged and special sets; a changed suggestion is rejected; Undo restores exact fields',()=>{
  const state=fixture(),exercise=state.activeWorkout.exercises[0],advice=nextWorkoutAdvice(exercise,state.workouts,state.profile);
  exercise.sets[1].weightEntryMode='manual';exercise.sets[1].weightProvenance='explicit';exercise.sets[1].weight=42;
  exercise.sets[2].weight=35;
  expect(progressionApplyTargets(exercise,advice)).toHaveLength(1);
  const before=structuredClone(state),result=prepareProgressionApply(state,{sessionId:state.activeWorkout.id,exerciseId:exercise.id,advice,units:state.profile.units});
  expect(result.count).toBe(1);expect(result.state.activeWorkout.exercises[0].sets.map(s=>s.weight)).toEqual([41,42,35]);
  expect(canUndoWorkoutWeightChange(result.state,result.record)).toBe(true);
  expect(undoWorkoutWeightChange(result.state,result.record).activeWorkout.exercises).toEqual(before.activeWorkout.exercises);
  expect(state).toEqual(before);
  const changed=structuredClone(state);changed.workouts[1].sessionFeedback='harder';
  expect(()=>prepareProgressionApply(changed,{sessionId:state.activeWorkout.id,exerciseId:exercise.id,advice,units:state.profile.units})).toThrow('suggestion changed');
  exercise.sets[0].completed=true;expect(progressionApplyTargets(exercise,advice)).toHaveLength(0);
  exercise.sets[0].completed=false;exercise.sets[0].setType='drop';expect(progressionApplyTargets(exercise,advice)).toHaveLength(0);
});
