import {expect,it} from 'vitest';
import {activeExercisePrDetails} from './performanceInsights.js';
import {exerciseRecordPresentation,createExerciseRecordFeedback} from './exerciseRecords.js';

const details=(weight,reps,prior=[[20,8]])=>activeExercisePrDetails([{completedAt:'2026-10-23',exercises:[{exerciseId:'bench',sets:prior.map(([weight,reps])=>({weight,reps,completed:true}))}]}],{exerciseId:'bench',sets:[{id:'new',weight,reps,completed:true}]});
const memory=()=>{const items=new Map();return {getItem:key=>items.get(key)||null,setItem:(key,value)=>items.set(key,value)};};
function fixture(){return {profile:{id:'owner',units:'kg'},workouts:[{completedAt:'2026-10-23',exercises:[{exerciseId:'bench',sets:[{weight:20,reps:8,completed:true}]}]}],activeWorkout:{id:'session',exerciseIndex:0,exercises:[{id:'slot',exerciseId:'bench',sets:[{id:'set-1',weight:22.5,reps:7,completed:false},{id:'set-2',weight:25,reps:7,completed:false}]}]}};}
function logged(state,index=0,exerciseIndex=0){const next=structuredClone(state);next.activeWorkout.exercises[exerciseIndex].sets[index].completed=true;return next;}

it('prioritizes actual weight and same-load rep bests over a simultaneous strength estimate',()=>{
 expect(exerciseRecordPresentation(details(22.5,7))).toMatchObject({label:'Weight best',gain:'+2.5 kg',kind:'weight',previousValue:'20 kg'});
 expect(exerciseRecordPresentation(details(20,9))).toMatchObject({label:'Rep best',gain:'+1 rep',kind:'reps',previousValue:'8 reps'});
 expect(exerciseRecordPresentation(details(20,10)).gain).toBe('+2 reps');
});
it('honestly labels an estimate-only improvement and preserves small gains',()=>{
 expect(exerciseRecordPresentation(details(27.5,9,[[30,5],[25,8]]))).toMatchObject({label:'Strength estimate',gain:'↑ 0.8 kg',value:'35.8 kg',previousValue:'35 kg'});
 expect(exerciseRecordPresentation(details(29.23,8,[[30,7]]))).toMatchObject({kind:'estimate',gain:'↑ <0.1 kg'});
});
it('converts load gains to the selected units and never manufactures a baseline/equal record',()=>{
 expect(exerciseRecordPresentation(details(22.5,7),'lb').gain).toBe('+5.51 lb');
 expect(exerciseRecordPresentation(details(20,8))).toBeNull();
 expect(exerciseRecordPresentation(details(20,8,[]))).toBeNull();
 expect(exerciseRecordPresentation(details(40,15,[[40,14]]))).toMatchObject({kind:'reps',gain:'+1 rep'});
});
it('claims one real logged achievement per exercise, even if later sets improve further',()=>{
 const before=fixture(),receipt=createExerciseRecordFeedback(before,{storage:memory()}),first=logged(before);
 expect(receipt.claim(before,first,'slot','set-1').gain).toBe('+2.5 kg');
 expect(receipt.claim(first,logged(first,1),'slot','set-2')).toBeNull();
});
it('input edits and copied but unchecked values do not consume or announce an achievement',()=>{
 const before=fixture(),receipt=createExerciseRecordFeedback(before,{storage:memory()}),edited=structuredClone(before);edited.activeWorkout.exercises[0].sets[0].weight=25;
 expect(receipt.claim(before,edited,'slot','set-1')).toBeNull();
 expect(receipt.claim(edited,logged(edited),'slot','set-1')).not.toBeNull();
});
it('uncheck/recheck and corrections after an earlier non-record log cannot replay a celebration',()=>{
 const before=fixture();before.activeWorkout.exercises[0].sets[0].weight=20;before.activeWorkout.exercises[0].sets[0].reps=8;
 const receipt=createExerciseRecordFeedback(before,{storage:memory()}),first=logged(before);
 expect(receipt.claim(before,first,'slot','set-1')).toBeNull();
 const corrected=structuredClone(first);corrected.activeWorkout.exercises[0].sets[0].weight=25;
 expect(receipt.claim(first,corrected,'slot','set-1')).toBeNull();
 const unchecked=structuredClone(corrected);unchecked.activeWorkout.exercises[0].sets[0].completed=false;
 receipt.claim(corrected,unchecked,'slot','set-1');
 expect(receipt.claim(unchecked,logged(unchecked),'slot','set-1')).toBeNull();
});
it('reload remembers consumed feedback, including a currently unchecked set',()=>{
 const storage=memory(),before=fixture(),first=logged(before),receipt=createExerciseRecordFeedback(before,{storage});
 expect(receipt.claim(before,first,'slot','set-1')).not.toBeNull();
 const unchecked=structuredClone(first);unchecked.activeWorkout.exercises[0].sets[0].completed=false;receipt.claim(first,unchecked,'slot','set-1');
 const reloaded=createExerciseRecordFeedback(unchecked,{storage});expect(reloaded.claim(unchecked,logged(unchecked),'slot','set-1')).toBeNull();
});
it('resumed logged records are static and do not make a later set replay the same exercise reward',()=>{
 const before=logged(fixture()),receipt=createExerciseRecordFeedback(before,{storage:memory()});
 expect(receipt.claim(before,logged(before,1),'slot','set-2')).toBeNull();
});
it('duplicate catalog exercises, other profiles and new sessions have independent identities',()=>{
 const storage=memory(),before=fixture();before.activeWorkout.exercises.push({...structuredClone(before.activeWorkout.exercises[0]),id:'slot-2',sets:[{id:'other-set',weight:22.5,reps:7,completed:false}]});
 const receipt=createExerciseRecordFeedback(before,{storage}),first=logged(before);
 expect(receipt.claim(before,first,'slot','set-1')).not.toBeNull();
 expect(receipt.claim(first,logged(first,0,1),'slot-2','other-set')).not.toBeNull();
 for(const kind of ['profile','session']){const independent=fixture();if(kind==='profile')independent.profile.id='other';else independent.activeWorkout.id='new-session';
  const separate=createExerciseRecordFeedback(independent,{storage});expect(separate.claim(independent,logged(independent),'slot','set-1')).not.toBeNull();}
});
it.each(['amrap','drop','rest_pause','unconfirmed-import','partial-side'])('retains existing comparability exclusions for %s',kind=>{
 const before=fixture(),set=before.activeWorkout.exercises[0].sets[0];
 if(kind==='unconfirmed-import'){set.rawImport={version:2,loadKind:'unknown'};set.importSetType='standard';}
 else if(kind==='partial-side'){before.activeWorkout.exercises[0].loggingMode='per_side';set.sides={left:{reps:7},right:{reps:null}};}
 else set.setType=kind;
 const receipt=createExerciseRecordFeedback(before,{storage:memory()});expect(receipt.claim(before,logged(before),'slot','set-1')).toBeNull();
});
it('storage failure suppresses a repeatable animation while the static record remains truthful',()=>{
 const before=fixture(),after=logged(before),receipt=createExerciseRecordFeedback(before,{storage:{getItem:()=>null,setItem:()=>{throw Error('blocked');}}});
 expect(receipt.claim(before,after,'slot','set-1')).toBeNull();
 expect(exerciseRecordPresentation(activeExercisePrDetails(after.workouts,after.activeWorkout.exercises[0])).label).toBe('Weight best');
});
it('can render the closing logger after the active workout has been removed',()=>{
  const state=fixture();state.activeWorkout=null;
  expect(()=>createExerciseRecordFeedback(state,{storage:memory()})).not.toThrow();
});
