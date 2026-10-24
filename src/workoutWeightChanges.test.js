import {describe,it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,serializeState,deserializeState} from './domain.js';
import {prepareWorkoutWeightChange,canUndoWorkoutWeightChange,undoWorkoutWeightChange} from './workoutWeightChanges.js';

function fixture(weights=[15,15,12.5],id='barbell-bench-press'){
  const state=createReturningUserFixture(0),template=structuredClone(state.program.days[0]);
  template.exercises=template.exercises.slice(0,1);template.exercises[0].exerciseId=id;
  const source=template.exercises[0];
  source.sets=weights.map((weight,index)=>({...source.sets[0],id:`template-${index}`,weight,reps:8-index,completed:false}));
  state.activeWorkout=startWorkout(state,template);
  state.activeWorkout.exercises[0].sets.forEach((set,index)=>Object.assign(set,{weight:weights[index],weightProvenance:weights[index]==null?null:'history'}));
  return state;
}
const exercise=state=>state.activeWorkout.exercises[0];
const change=(state,value,index=0,options={})=>prepareWorkoutWeightChange(state,{sessionId:state.activeWorkout.id,exerciseId:exercise(state).id,setId:exercise(state).sets[index].id,value,...options});
const weights=state=>exercise(state).sets.map(set=>set.weight);

describe('one weight carry rule for history reuse and normal repeat',()=>{
  it.each(['start-prefill','history','legacy-use','auto'])('%s carries equal loads but preserves a distinct backoff',mode=>{
    const state=fixture(),before=structuredClone(state);
    exercise(state).sets.forEach(set=>{
      if(mode==='history')set.weightEntryMode='history';
      if(mode==='legacy-use')set.weightEntryMode='manual';
      if(mode==='auto')set.weightEntryMode='auto';
    });
    const result=change(state,17.5);expect(weights(result.state)).toEqual([17.5,17.5,12.5]);expect(result.propagated).toBe(1);
    expect(result.state.workouts).toEqual(before.workouts);expect(result.state.program).toEqual(before.program);
    expect(exercise(result.state).sets.map(set=>[set.reps,set.rir,set.completed])).toEqual(exercise(state).sets.map(set=>[set.reps,set.rir,set.completed]));
    expect(undoWorkoutWeightChange(result.state,result.record)).toEqual({...state,activeWorkout:{...state.activeWorkout,updatedAt:result.state.activeWorkout.updatedAt}});
  });
  it('same-valued manual entry is a boundary and does not allow propagation through it',()=>{
    const state=fixture([15,15,15]);Object.assign(exercise(state).sets[1],{weightEntryMode:'manual',weightProvenance:'explicit'});
    expect(weights(change(state,17.5).state)).toEqual([17.5,15,15]);
  });
  it.each(['completed','drop','rest_pause','segments','side'])('stops at a %s boundary',kind=>{
    const state=fixture([15,15,15]),set=exercise(state).sets[1];
    if(kind==='completed')set.completed=true;
    else if(kind==='segments')set.segments=[{weight:10,reps:3}];
    else if(kind==='side')set.sides={left:{completed:true}};
    else set.setType=kind;
    expect(weights(change(state,17.5).state)).toEqual([17.5,15,15]);
  });
  it.each(['completed','drop','side'])('editing a %s source does not alter later loads',kind=>{
    const state=fixture([15,15,15]),set=exercise(state).sets[0];
    if(kind==='completed')set.completed=true;else if(kind==='drop')set.setType='drop';else set.sides={left:{completed:true}};
    expect(weights(change(state,20).state)).toEqual([20,15,15]);
  });
  it('fills initial blank defaults, but not explicitly cleared manual blanks',()=>{
    const state=fixture([null,null,null]);expect(weights(change(state,2.5).state)).toEqual([2.5,2.5,2.5]);
    Object.assign(exercise(state).sets[1],{weightEntryMode:'manual',weightProvenance:null});
    expect(weights(change(state,2.5).state)).toEqual([2.5,null,null]);
  });
  it('pending raw intent stops the chain before any later sets',()=>{
    const state=fixture([15,15,15]);
    expect(weights(change(state,20,0,{protectedSetIds:[exercise(state).sets[1].id]}).state)).toEqual([20,15,15]);
  });
  it('continues correctly across rapid edits and a serialized reload',()=>{
    let state=fixture();state=change(state,17.5).state;state=deserializeState(serializeState(state));
    expect(weights(change(state,20).state)).toEqual([20,20,12.5]);
    state=change(state,17.5,1).state; // Explicit same-valued entry makes this set independent.
    expect(weights(change(state,20).state)).toEqual([20,17.5,12.5]);
  });
  it('a change starting at the second set never touches the first',()=>{
    const state=fixture([15,15,15]);expect(weights(change(state,20,1).state)).toEqual([15,20,20]);
  });
  it('decreasing assistance uses the entered absolute amount without changing direction',()=>{
    const state=fixture([35,35,25],'assisted-pull-up');expect(weights(change(state,30).state)).toEqual([30,30,25]);
  });
  it('bodyweight null, explicit zero and an unknown blank keep their distinct meanings',()=>{
    const state=fixture([5,null,5],'pull-up');exercise(state).sets[1].weightProvenance='history';
    expect(weights(change(state,10).state)).toEqual([10,null,5]);
    const zero=fixture([0,null,0],'pull-up');exercise(zero).sets[1].weightProvenance='history';
    expect(weights(change(zero,5).state)).toEqual([5,null,0]);
    const allBw=fixture([null,null,null],'pull-up');allBw.activeWorkout.exercises[0].sets.forEach(set=>set.weightProvenance='history');
    expect(weights(change(allBw,5).state)).toEqual([5,5,5]);
  });
  it('manual effort/counts do not turn the weight field into a manual boundary',()=>{
    const state=fixture();Object.assign(exercise(state).sets[1],{reps:6,repsEntryMode:'manual',rir:3,rirEntryMode:'manual',touched:true});
    const result=change(state,20);expect(weights(result.state)).toEqual([20,20,12.5]);
    expect(exercise(result.state).sets[1]).toMatchObject({reps:6,repsEntryMode:'manual',rir:3,rirEntryMode:'manual'});
  });
  it('Undo preserves later unrelated effort, notes and timer changes',()=>{
    const state=fixture(),result=change(state,20);result.state.activeWorkout.note='Keep';result.state.activeWorkout.rest={seconds:60};
    exercise(result.state).sets[1].rir=3;
    const undone=undoWorkoutWeightChange(result.state,result.record);expect(weights(undone)).toEqual([15,15,12.5]);
    expect(exercise(undone).sets[1].rir).toBe(3);expect(undone.activeWorkout.note).toBe('Keep');expect(undone.activeWorkout.rest).toEqual({seconds:60});
  });
  it.each(['edited','logged','removed','units','session'])('Undo safely expires after %s',kind=>{
    const result=change(fixture(),20);
    if(kind==='edited')exercise(result.state).sets[1].weight=25;
    if(kind==='logged')exercise(result.state).sets[1].completed=true;
    if(kind==='removed')exercise(result.state).sets.splice(1,1);
    if(kind==='units')result.state.profile.units='lb';
    if(kind==='session')result.state.activeWorkout.id='another';
    expect(canUndoWorkoutWeightChange(result.state,result.record)).toBe(false);
    expect(undoWorkoutWeightChange(result.state,result.record)).toBe(result.state);
  });
  it('rejects stale targets and invalid values without any mutation',()=>{
    const state=fixture(),before=structuredClone(state);
    for(const value of [-1,NaN,Infinity])expect(change(state,value)).toEqual({state,record:null,propagated:0});
    expect(prepareWorkoutWeightChange(state,{sessionId:'stale',exerciseId:exercise(state).id,setId:exercise(state).sets[0].id,value:20}).state).toBe(state);
    expect(state).toEqual(before);
  });
});
