import {describe,it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise,freestylePreviousSets} from './freestyleWorkout.js';
import {preparePreviousValues,canUndoPreviousValues,undoPreviousValues,previousValuesFutureChanges} from './previousValues.js';

function fixture(id='hack-squat'){
  const state=addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(0)),id);
  const exercise=state.activeWorkout.exercises[0],first=exercise.sets[0];
  exercise.repMin=6;exercise.repMax=10;
  exercise.sets=[0,1,2].map(index=>({...structuredClone(first),id:`working-${index}`,weight:null,reps:6,rir:null,completed:false,touched:false}));
  state.workouts=[{id:'previous',completedAt:'2026-10-22T12:00:00Z',exercises:[{...structuredClone(exercise),sets:[
    {weight:15,reps:8,rir:3,completed:true},
    {weight:15,reps:7,rir:2,completed:true},
    {weight:12.5,reps:8,rir:1,completed:true},
  ]}]}];
  return state;
}
const entry=state=>state.activeWorkout.exercises[0];
const history=state=>state.workouts[0].exercises[0];
const identity=(state,index=0)=>({profileId:state.profile.id,sessionId:state.activeWorkout.id,exerciseId:entry(state).id,catalogExerciseId:entry(state).exerciseId,loggingMode:entry(state).loggingMode||'normal',setId:entry(state).sets[index].id,ordinal:index});
const apply=(state,options={})=>preparePreviousValues(state,identity(state),{remaining:true,...options});

describe('reuse corresponding previous sets in one operation',()=>{
  it('uses each historical load/count, keeps the plan and unlogged set identities, and supports exact Undo',()=>{
    const state=fixture(),before=structuredClone(state),result=apply(state);
    expect(entry(result.state).sets.map(set=>[set.weight,set.reps,set.rir,set.completed])).toEqual([[15,8,null,false],[15,7,null,false],[12.5,8,null,false]]);
    expect(entry(result.state).sets.map(set=>set.id)).toEqual(entry(before).sets.map(set=>set.id));
    expect(entry(result.state)).toMatchObject({repMin:6,repMax:10});
    expect(result.state.program).toEqual(before.program);expect(result.state.workouts).toEqual(before.workouts);expect(state).toEqual(before);
    expect(result.record.future).toHaveLength(2);expect(undoPreviousValues(result.state,result.record)).toEqual(before);
  });
  it('protects manual future fields even when equal to the planned default and does not shift skipped ordinals',()=>{
    const state=fixture(),sets=entry(state).sets;
    Object.assign(sets[1],{weight:30,weightEntryMode:'manual',touched:true});
    Object.assign(sets[2],{reps:6,repsEntryMode:'manual',touched:true});
    const result=apply(state);
    expect(entry(result.state).sets[1]).toMatchObject({weight:30,reps:7});
    expect(entry(result.state).sets[2]).toMatchObject({weight:12.5,reps:6});
    expect(undoPreviousValues(result.state,result.record)).toEqual(state);
  });
  it('protects manually cleared future fields',()=>{
    const state=fixture();Object.assign(entry(state).sets[1],{weight:null,weightEntryMode:'manual',reps:null,repsEntryMode:'manual',touched:true});
    const result=apply(state);
    expect(entry(result.state).sets[1]).toEqual(entry(state).sets[1]);
    expect(entry(result.state).sets[2]).toMatchObject({weight:12.5,reps:8});
  });
  it('skips a future set with an unsaved draft, without moving its history into the next set',()=>{
    const state=fixture(),result=apply(state,{protectedFields:[{setId:entry(state).sets[1].id,field:'reps'}]});
    expect(entry(result.state).sets[1]).toEqual(entry(state).sets[1]);
    expect(entry(result.state).sets[2]).toMatchObject({weight:12.5,reps:8});
  });
  it('retains completed, advanced and legacy manually touched future sets',()=>{
    const state=fixture();Object.assign(entry(state).sets[1],{weight:20,reps:5,completed:true});
    Object.assign(entry(state).sets[2],{weight:40,reps:4,touched:true});
    const result=apply(state);expect(entry(result.state).sets.slice(1)).toEqual(entry(state).sets.slice(1));
    entry(state).sets[1].completed=false;entry(state).sets[1].setType='drop';
    expect(entry(apply(state).state).sets.slice(1)).toEqual(entry(state).sets.slice(1));
  });
  it('does not consume an ordinary history ordinal for an inserted drop set',()=>{
    const state=fixture(),sets=entry(state).sets;
    sets.splice(1,0,{...structuredClone(sets[0]),id:'drop',setType:'drop'});
    const result=apply(state);
    expect(entry(result.state).sets[1]).toEqual(sets[1]);
    expect(entry(result.state).sets[2]).toMatchObject({weight:15,reps:7});
    expect(entry(result.state).sets[3]).toMatchObject({weight:12.5,reps:8});
  });
  it('never invents a missing historical set or repeats the final one',()=>{
    const state=fixture();history(state).sets.pop();
    const result=apply(state);expect(entry(result.state).sets[2]).toEqual(entry(state).sets[2]);
    expect(result.record.future).toHaveLength(1);
  });
  it('uses only available fields, preserves today’s effort and does not import timestamps',()=>{
    const state=fixture();history(state).sets[1]={weight:20,reps:null,completed:true,completedAt:123};
    history(state).sets[2]={weight:null,reps:9,completed:true};
    Object.assign(entry(state).sets[2],{weight:25,rir:3,rirEntryMode:'manual',touched:true});
    const result=apply(state);
    expect(entry(result.state).sets[1]).toMatchObject({weight:20,reps:6,rir:null,completed:false});
    expect(entry(result.state).sets[1].completedAt).toEqual(entry(state).sets[1].completedAt);
    expect(entry(result.state).sets[2]).toMatchObject({weight:25,reps:9,rir:3,completed:false});
  });
  it.each([null,0])('retains optional bodyweight load %s instead of treating it as missing',weight=>{
    const state=fixture('pull-up');history(state).sets[1].weight=weight;
    entry(state).sets[1].weight=5;
    expect(entry(apply(state).state).sets[1]).toMatchObject({weight,reps:7,completed:false});
  });
  it('keeps canonical kilograms when the display unit is pounds',()=>{
    const state=fixture();state.profile.units='lb';
    expect(entry(apply(state).state).sets.map(set=>set.weight)).toEqual([15,15,12.5]);
  });
  it('can fill following sets even when the current set already matches',()=>{
    const state=fixture();Object.assign(entry(state).sets[0],{weight:15,reps:8});
    const result=apply(state);expect(result.record.patch).toEqual([]);
    expect(entry(result.state).sets[0]).toEqual(entry(state).sets[0]);
    expect(entry(result.state).sets[2].weight).toBe(12.5);expect(undoPreviousValues(result.state,result.record)).toEqual(state);
    expect(apply(result.state)).toEqual({state:result.state,record:null});
  });
  it('leaves earlier logged sets alone when starting with the second set',()=>{
    const state=fixture();entry(state).sets[0].completed=true;
    const result=preparePreviousValues(state,identity(state,1),{remaining:true});
    expect(entry(result.state).sets[0]).toEqual(entry(state).sets[0]);
    expect(entry(result.state).sets.slice(1).map(set=>[set.weight,set.reps])).toEqual([[15,7],[12.5,8]]);
  });
  it('Undo keeps later unrelated notes, timer and future effort changes',()=>{
    const state=fixture(),result=apply(state);result.state.activeWorkout.note='Keep this';
    result.state.activeWorkout.rest={endsAt:12345};entry(result.state).sets[1].rir=4;
    expect(canUndoPreviousValues(result.state,result.record)).toBe(true);
    const undone=undoPreviousValues(result.state,result.record);
    expect(undone.activeWorkout.note).toBe('Keep this');expect(undone.activeWorkout.rest).toEqual({endsAt:12345});
    expect(entry(undone).sets[1]).toEqual({...entry(state).sets[1],rir:4});
  });
  it.each(['edited','completed','removed'])('expires Undo safely after a future copied set is %s',change=>{
    const state=fixture(),result=apply(state);
    if(change==='edited')entry(result.state).sets[1].weight=100;
    if(change==='completed')entry(result.state).sets[1].completed=true;
    if(change==='removed')entry(result.state).sets.splice(1,1);
    expect(canUndoPreviousValues(result.state,result.record)).toBe(false);
    expect(undoPreviousValues(result.state,result.record)).toBe(result.state);
  });
  it('does not copy incompatible historical modes or partially completed sides',()=>{
    const state=fixture();history(state).loggingMode='per_side';
    expect(apply(state)).toEqual({state,record:null});
    history(state).loggingMode='normal';entry(state).sets[1].sides={left:{completed:true}};
    expect(previousValuesFutureChanges(state,identity(state)).map(item=>item.setId)).toEqual([entry(state).sets[2].id]);
  });
  it('keeps compatible side values independent and preserves manual side counts',()=>{
    const state=fixture('one-arm-dumbbell-row');entry(state).loggingMode=history(state).loggingMode='per_side';
    entry(state).sets.forEach(set=>{set.sides={left:{reps:6},right:{reps:6}};});
    history(state).sets.forEach((set,index)=>{set.sides={left:{reps:8-index,rir:2},right:{reps:9-index,completed:true,completedAt:123}};});
    Object.assign(entry(state).sets[1],{sideRepsEntryMode:{left:'manual'},touched:true});
    const result=apply(state);
    expect(entry(result.state).sets[1].sides).toEqual({left:{reps:6},right:{reps:8}});
    expect(entry(result.state).sets[2].sides).toEqual({left:{reps:6},right:{reps:7}});
    expect(undoPreviousValues(result.state,result.record)).toEqual(state);
  });
  it('reuses timed seconds without converting them to rep or distance targets',()=>{
    const state=fixture('plank');history(state).sets.forEach((set,index)=>Object.assign(set,{weight:null,reps:45-index*5}));
    const result=apply(state);expect(entry(result.state).sets.map(set=>set.reps)).toEqual([45,40,35]);
    expect(entry(result.state).measure).toBe(entry(state).measure);
    expect(undoPreviousValues(result.state,result.record)).toEqual(state);
  });
  it('rejects a source history that changed after the displayed offer',()=>{
    const state=fixture(),expectedHistory=JSON.stringify(freestylePreviousSets(state,entry(state)));
    history(state).sets[1].weight=99;const before=structuredClone(state);
    expect(()=>apply(state,{expectedHistory})).toThrow('Previous workout data changed');expect(state).toEqual(before);
  });
});
