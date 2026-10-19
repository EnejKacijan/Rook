import {it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise,freestylePreviousSets} from './freestyleWorkout.js';
import {preparePreviousValues,canUndoPreviousValues,undoPreviousValues,previousValuesEligibility,prefillReplacementValues} from './previousValues.js';
import {serializeState,deserializeState} from './domain.js';

function fixture({id='hack-squat',count=3,historyCount=2,mode='normal'}={}){
 let state=addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(0)),id);
 const exercise=state.activeWorkout.exercises[0];exercise.loggingMode=mode;
 exercise.sets=Array.from({length:count},(_,i)=>({id:`current-${i}`,weight:null,reps:null,rir:null,completed:false,planned:true,added:false,...(mode==='per_side'?{sides:{left:{reps:null},right:{reps:null}}}:{})}));
 state.workouts=[{id:'history',completedAt:'2026-09-19T12:00:00Z',exercises:[{...structuredClone(exercise),sets:Array.from({length:historyCount},(_,i)=>({id:`historical-${i}`,weight:id==='plank'?null:id==='pull-up'?null:90+i*5,reps:id==='plank'?45:7+i,rir:2,completed:true,completedAt:123,pr:true,...(mode==='per_side'?{sides:{left:{id:'old-side',reps:7+i,completed:true,completedAt:123},right:{reps:9+i,completed:true}}}:{})}))}]}];
 state.activeWorkout.rest={endsAt:Date.now()+90000};return state;
}
const identity=s=>({sessionId:s.activeWorkout.id,exerciseId:s.activeWorkout.exercises[0].id,canonicalExerciseId:s.activeWorkout.exercises[0].exerciseId,profileId:s.profile.id});
const exercise=s=>s.activeWorkout.exercises[0];
const set=s=>exercise(s).sets[0];
const eligible=s=>previousValuesEligibility(s,identity(s));

it.each(['plan','freestyle'])('manually added exercise is eligible in a %s workout',source=>{const state=fixture();state.activeWorkout.source=source;expect(eligible(state)).toHaveLength(3);});
it.each(['scheduled','saved-template','replaced','no history','incompatible mode'])('%s never exposes reuse',kind=>{
 const s=fixture();if(kind==='scheduled')delete exercise(s).prescriptionSource;
 if(kind==='saved-template')exercise(s).prescriptionSource='saved-template';
 if(kind==='replaced')exercise(s).replacementOfExerciseId='leg-press';
 if(kind==='no history')s.workouts=[];
 if(kind==='incompatible mode')s.workouts[0].exercises[0].loggingMode='per_side';
 expect(eligible(s)).toEqual([]);expect(preparePreviousValues(s,identity(s))).toEqual({state:s,record:null});
});
it.each(['touched','weightEntryMode','repsEntryMode','rirEntryMode','completed','completedAt','sideRepsEntryMode','legacy weight','legacy reps'])('protects meaningful %s work anywhere in the exercise',kind=>{
 const s=fixture(),other=exercise(s).sets[2];
 if(kind==='sideRepsEntryMode')other.sideRepsEntryMode={left:'manual'};
 else if(kind==='legacy weight')other.weight=20;
 else if(kind==='legacy reps')other.reps=12;
 else other[kind]=kind.endsWith('EntryMode')?'manual':true;
 expect(eligible(s)).toEqual([]);
});
it('numbers from automatic seeding or target defaults remain safely eligible',()=>{
 const s=fixture();exercise(s).repMin=10;Object.assign(set(s),{weight:55,reps:10,weightEntryMode:'auto'});
 expect(eligible(s)).toHaveLength(3);const result=preparePreviousValues(s,identity(s));expect(set(result.state)).toMatchObject({weight:90,reps:7,rir:null});expect(undoPreviousValues(result.state,result.record)).toEqual(s);
});
it('already equivalent values are a no-op despite different provenance',()=>{
 const s=fixture({count:1,historyCount:1});Object.assign(set(s),{weight:90,reps:7,weightProvenance:'history'});
 expect(eligible(s)).toEqual([]);expect(preparePreviousValues(s,identity(s)).record).toBeNull();
});
it.each([[1,3],[3,1],[3,2],[6,1],[6,2],[6,3]])('fills all %i current sets from %i historical sets, repeating the final historical values for extras', (count,historyCount)=>{
 const s=fixture({count,historyCount}),before=structuredClone(s),{state:next,record}=preparePreviousValues(s,identity(s));
 expect(exercise(next).sets).toHaveLength(count);expect(record.sets).toHaveLength(count);
 for(let i=0;i<count;i++){const ordinal=Math.min(i,historyCount-1);expect(exercise(next).sets[i]).toMatchObject({id:`current-${i}`,weight:90+ordinal*5,reps:7+ordinal,rir:null,completed:false,touched:true,weightEntryMode:i<historyCount?'manual':'auto',repsEntryMode:'manual',weightProvenance:'history'});if(i>=historyCount)expect(exercise(next).sets[i].weightSourceSetId).toBe(`current-${i-1}`);expect(exercise(next).sets[i]).not.toHaveProperty('completedAt');expect(exercise(next).sets[i]).not.toHaveProperty('pr');}
 expect(s).toEqual(before);expect(next.workouts).toEqual(s.workouts);expect(next.activeWorkout.rest).toEqual(s.activeWorkout.rest);expect(preparePreviousValues(next,identity(next))).toEqual({state:next,record:null});expect(undoPreviousValues(next,record)).toEqual(s);
});
it.each(['weight','reps','rir','completed','sides'])('later applied-set %s changes invalidate Undo atomically',field=>{
 const s=fixture(),{state:next,record}=preparePreviousValues(s,identity(s));set(next)[field]=field==='completed'?true:field==='sides'?{left:{reps:2}}:99;
 expect(canUndoPreviousValues(next,record)).toBe(false);expect(undoPreviousValues(next,record)).toBe(next);
});
it('Undo preserves unrelated later notes, timers and edits to another exercise',()=>{
 const s=fixture();s.activeWorkout.exercises.push({...structuredClone(exercise(s)),id:'other-instance',exerciseId:'leg-press'});
 const {state:next,record}=preparePreviousValues(s,identity(s));next.activeWorkout.note='Keep';next.activeWorkout.rest.endsAt+=100;next.activeWorkout.exercises[1].sets[2].reps=19;
 const result=undoPreviousValues(next,record);expect(exercise(result)).toEqual(exercise(s));expect(result.activeWorkout.note).toBe('Keep');expect(result.activeWorkout.rest).toEqual(next.activeWorkout.rest);expect(result.activeWorkout.exercises[1].sets[2].reps).toBe(19);
});
it.each(['session','instance','canonical','profile','units','navigation'])('rejects stale %s transactions and Undo',kind=>{
 const s=fixture(),id=identity(s),{state:next,record}=preparePreviousValues(s,id);
 for(const state of [s,next]){
 if(kind==='session')state.activeWorkout.id='different';if(kind==='instance')exercise(state).id='different';if(kind==='canonical')exercise(state).exerciseId='leg-press';if(kind==='profile')state.profile.id='different';if(kind==='units')state.profile.units='lb';if(kind==='navigation')state.activeWorkout.exerciseIndex=1;
 }
 if(kind!=='units')expect(previousValuesEligibility(s,id)).toEqual([]);
 expect(undoPreviousValues(next,record)).toBe(next);
});
it.each(['pull-up','assisted-pull-up','plank'])('uses canonical bodyweight / added-load / seconds semantics for %s',id=>{
 const s=fixture({id}),{state:next,record}=preparePreviousValues(s,identity(s));expect(set(next)).toMatchObject({weight:id==='plank'||id==='pull-up'?null:90,reps:id==='plank'?45:7,rir:null,completed:false});expect(undoPreviousValues(next,record)).toEqual(s);
});
it('unilateral values retain independent sides and exclude historical IDs, completion and PR state',()=>{
 const s=fixture({mode:'per_side'}),{state:next,record}=preparePreviousValues(s,identity(s));expect(set(next).sides).toEqual({left:{reps:7},right:{reps:9}});expect(undoPreviousValues(next,record)).toEqual(s);
});
it('incomplete, advanced and unavailable historical values are never fabricated',()=>{
 const s=fixture(),history=s.workouts[0].exercises[0];history.sets.unshift({weight:1,reps:1,completed:false},{weight:2,reps:2,completed:true,setType:'drop'});expect(freestylePreviousSets(s,exercise(s))).toHaveLength(2);
 history.sets.at(-1).reps=null;expect(eligible(s)).toEqual([{setId:'current-0',ordinal:0},{setId:'current-2',ordinal:0}]);history.sets.at(-2).weight=null;expect(eligible(s)).toEqual([]);
});
it('replacement uses only B history, preserving current set count and instance identity',()=>{
 const s=fixture(),e=exercise(s);e.prescriptionSource='plan';e.replacementOfExerciseId='leg-press';e.sets.forEach(set=>{set.reps=6;});
 const next=prefillReplacementValues(s,e);expect(next.id).toBe(e.id);expect(next.sets.map(s=>[s.weight,s.reps])).toEqual([[90,7],[95,8],[null,6]]);expect(next.sets.every(s=>!s.completed&&!s.touched)).toBe(true);expect(eligible({...s,activeWorkout:{...s.activeWorkout,exercises:[next]}})).toEqual([]);
});
it('roundtrip retains application, user edits and replacement origin without duplicate reuse',()=>{
 const s=fixture(),applied=preparePreviousValues(s,identity(s)).state;set(applied).reps=13;
 const reloaded=deserializeState(serializeState(applied),{strict:true});expect(set(reloaded)).toMatchObject({weight:90,reps:13,touched:true});expect(eligible(reloaded)).toEqual([]);expect(reloaded.workouts).toEqual(deserializeState(serializeState(s),{strict:true}).workouts);
});
it('replacement origin survives reload even with no compatible previous values',()=>{
 const s=fixture();exercise(s).replacementOfExerciseId='leg-press';s.workouts=[];
 const loaded=deserializeState(serializeState(s),{strict:true});expect(exercise(loaded).replacementOfExerciseId).toBe('leg-press');expect(eligible(loaded)).toEqual([]);
});
it.each(['pull-up','assisted-pull-up','plank'])('repeats compatible %s history through all six sets without changing logging semantics',id=>{
 const s=fixture({id,count:6,historyCount:1}),{state:next,record}=preparePreviousValues(s,identity(s));
 for(const current of exercise(next).sets)expect(current).toMatchObject({weight:id==='assisted-pull-up'?90:null,reps:id==='plank'?45:7,rir:null,completed:false});
 expect(undoPreviousValues(next,record)).toEqual(s);
});
it('repeats independent unilateral historical values, with safe Undo for every populated set',()=>{
 const s=fixture({count:6,historyCount:2,mode:'per_side'}),{state:next,record}=preparePreviousValues(s,identity(s));
 expect(exercise(next).sets.map(set=>set.sides)).toEqual([{left:{reps:7},right:{reps:9}},...Array.from({length:5},()=>({left:{reps:8},right:{reps:10}}))]);
 const saved=deserializeState(serializeState(next),{strict:true});expect(exercise(saved).sets.map(set=>set.reps)).toEqual([7,8,8,8,8,8]);expect(eligible(saved)).toEqual([]);
 expect(undoPreviousValues(next,record)).toEqual(s);exercise(next).sets[5].reps=12;expect(undoPreviousValues(next,record)).toBe(next);
});
