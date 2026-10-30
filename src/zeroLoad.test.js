import {describe,it,expect} from 'vitest';
import {exerciseCatalog,workingSetCanComplete,serializeState,deserializeState,completeWorkout,startWorkout} from './domain.js';
import {workingLoadCanComplete} from './advancedLogging.js';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise,copyFreestylePrevious} from './freestyleWorkout.js';
import {prepareWorkoutWeightChange} from './workoutWeightChanges.js';
import {createHistoryCorrection,saveHistoryCorrection} from './historyCorrection.js';
import {sessionLogSetParts} from './sessionLog.js';
import {formatExportSet} from './workoutExport.js';
import {exercisePerformance} from './performanceInsights.js';

const exercise={exerciseId:'hip-thrust'};
function fixture(){return addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(0)),'hip-thrust');}
describe('explicit zero external load',()=>{
  it('accepts zero for every catalog exercise without treating an empty required load as zero',()=>{
    for(const item of Object.values(exerciseCatalog))expect(workingSetCanComplete(item,{weight:0,reps:12}),item.id).toBe(true);
    for(const weight of [null,undefined,'',NaN,Infinity,-1,' ',false])expect(workingSetCanComplete(exercise,{weight,reps:12}),String(weight)).toBe(false);
    expect(workingSetCanComplete(exercise,{weight:'0',reps:12})).toBe(true);
    expect(workingSetCanComplete(exercise,{weight:0,reps:0})).toBe(false);
    expect(workingSetCanComplete({...exercise,loggingMode:'per_side'},{weight:0,sides:{left:{reps:8},right:{reps:8}}})).toBe(true);
  });
  it.each(['drop','rest_pause'])('uses the same explicit zero contract for %s segments',setType=>{
    const set={weight:0,reps:12,setType,segments:[{kind:setType,weight:0,reps:8,completed:true}]};
    expect(workingSetCanComplete(exercise,set)).toBe(true);
    for(const weight of [null,-1,NaN])expect(workingSetCanComplete(exercise,{...set,segments:[{...set.segments[0],weight}]})).toBe(false);
    expect(workingLoadCanComplete(0,'optional')).toBe(true);
  });
  it('stores a manual zero, completes it, restores it, and reuses zero instead of an old positive weight',()=>{
    let state=fixture();const ex=state.activeWorkout.exercises[0],set=ex.sets[0];
    state=prepareWorkoutWeightChange(state,{sessionId:state.activeWorkout.id,exerciseId:ex.id,setId:set.id,value:0}).state;
    Object.assign(state.activeWorkout.exercises[0].sets[0],{reps:12,completed:true});
    expect(state.activeWorkout.exercises[0].sets[0]).toMatchObject({weight:0,weightProvenance:'explicit'});
    state=deserializeState(serializeState(state),{strict:true});
    expect(workingSetCanComplete(state.activeWorkout.exercises[0],state.activeWorkout.exercises[0].sets[0])).toBe(true);
    const finished=deserializeState(serializeState(completeWorkout(state)),{strict:true});
    const logged=finished.workouts.at(-1).exercises[0].sets[0];expect(logged).toMatchObject({weight:0,reps:12,completed:true});
    expect(sessionLogSetParts(ex,logged,0,'kg')).toContain('0 kg');
    expect(formatExportSet(ex,logged,{completed:true})).toContain('0 kg');
    expect(exercisePerformance(finished.workouts,'hip-thrust').estimatedOneRepMax).toBeNull();
    const next=addFreestyleExercise(startFreestyleWorkout(finished),'hip-thrust'),entry=next.activeWorkout.exercises[0];
    entry.sets[0].weight=25;
    expect(copyFreestylePrevious(next,entry.id,entry.sets[0].id,0).activeWorkout.exercises[0].sets[0]).toMatchObject({weight:0,reps:12});
    const repeat=startWorkout(finished,{...ex,exercises:[{...ex,repMin:8,repMax:12}],name:'Hip thrust session',id:'zero-repeat'});
    expect(repeat.exercises[0].sets[0]).toMatchObject({weight:0,weightProvenance:'history'});
  });
  it('allows correcting an already completed weighted set to zero',()=>{
    let state=fixture();Object.assign(state.activeWorkout.exercises[0].sets[0],{weight:20,reps:12,completed:true});
    state=completeWorkout(state);const draft=createHistoryCorrection(state.workouts.at(-1));draft.workout.exercises[0].sets[0].weight=0;
    const result=saveHistoryCorrection(state,draft);expect(result.status).toBe('saved');expect(result.state.workouts.at(-1).exercises[0].sets[0].weight).toBe(0);
  });
});
