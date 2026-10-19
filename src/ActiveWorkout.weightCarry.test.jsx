import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,serializeState,deserializeState} from './domain.js';
import {addWorkoutExercise} from './freestyleWorkout.js';
import {prefillReplacementValues,preparePreviousValues,undoPreviousValues} from './previousValues.js';

let root,host,current;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});

function fixture({weights=[80,80,80],count=3,source='scheduled',id='hack-squat',mode='normal'}={}){
 let s=createReturningUserFixture(0);Object.assign(s.profile,{showExerciseImages:false,restTimerEnabled:false,rirEnabled:false});
 const base={...s.program.days[0].exercises[0],exerciseId:id,loggingMode:mode,repMin:8,repMax:12,targetRir:1};
 delete base.prescriptionSource;delete base.supersetId;delete base.nextBlockStartingLoad;
 base.sets=Array.from({length:count},(_,i)=>({id:`template-${i}`,weight:id==='pull-up'?null:80,reps:8,rir:null,completed:false}));
 s.workouts=weights.length?[{id:'previous',completedAt:new Date(Date.now()-86400000).toISOString(),exercises:[{...structuredClone(base),sets:weights.map((weight,i)=>({id:`old-${i}`,weight,reps:8+i,completed:true,...(mode==='per_side'?{sides:{left:{reps:8+i},right:{reps:10+i}}}:{})}))}]}]:[];
 s.activeWorkout=startWorkout(s,{...s.program.days[0],exercises:[base],warmupPlan:{mode:'none'}});
 if(source==='reuse'){
  s.activeWorkout.exercises=[];s=addWorkoutExercise(s,id);const e=s.activeWorkout.exercises[0];e.loggingMode=mode;
  e.sets=Array.from({length:count},(_,i)=>({...structuredClone(e.sets[0]),id:`added-${i}`}));
 }else if(source==='replacement'){
  const e=s.activeWorkout.exercises[0];e.replacementOfExerciseId='leg-press';e.sets.forEach(set=>{set.weight=null;set.reps=8;});
  s.activeWorkout.exercises[0]=prefillReplacementValues(s,e);
 }
 return s;
}
function mount(initial){function Harness(){const[s,setState]=useState(initial);current=s;return <ActiveWorkout state={s} update={fn=>setState(before=>fn(structuredClone(before)))} setPage={()=>{}} setDetail={()=>{}}/>;}act(()=>root.render(<Harness/>));}
const sets=()=>current.activeWorkout.exercises[0].sets;
const weights=()=>sets().map(set=>set.weight);
const click=node=>{expect(node).toBeTruthy();act(()=>node.click());};
const plus=index=>host.querySelectorAll('.set-row')[index].querySelector('[data-workout-field="weight"] button:last-child');
const apply=()=>click(host.querySelector('.previous-values-action'));
const reload=()=>{const saved=deserializeState(serializeState(current),{strict:true});act(()=>root.render(null));mount(saved);};

it.each(['scheduled','reuse','replacement'])('%s history keeps equal later loads independent when the first load increases',source=>{
 const s=fixture({source}),history=structuredClone(s.workouts);mount(s);if(source==='reuse')apply();
 const later=structuredClone(sets().slice(1)),ids=sets().map(s=>s.id);click(plus(0));expect(weights()[0]).toBeGreaterThan(80);expect(sets().slice(1)).toEqual(later);
 expect(sets().map(s=>s.id)).toEqual(ids);expect(current.workouts).toEqual(history);click(plus(0));expect(sets().slice(1)).toEqual(later);
});
it('different historical loads remain independent as well',()=>{
 mount(fixture({weights:[80,75,70]}));click(plus(0));expect(weights()[0]).toBeGreaterThan(80);expect(weights().slice(1)).toEqual([75,70]);
});
it('preserves actual history even when a resumed legacy set still has an automatic link',()=>{
 const s=fixture(),e=s.activeWorkout.exercises[0];Object.assign(e.sets[1],{weightEntryMode:'auto',weightSourceSetId:e.sets[0].id});mount(s);
 click(plus(0));expect(weights().slice(1)).toEqual([80,80]);
});
it('with no history, changing the first load still propagates through untouched linked sets',()=>{
 mount(fixture({weights:[]}));click(plus(0));expect(weights()[0]).toBeGreaterThan(80);expect(new Set(weights()).size).toBe(1);
 click(plus(0));expect(new Set(weights()).size).toBe(1);
});
it('an exercise with history only for set one still carries into sets without their own history',()=>{
 mount(fixture({weights:[80]}));click(plus(0));expect(new Set(weights()).size).toBe(1);expect(weights()[2]).toBeGreaterThan(80);
});
it('a historical set forms a boundary; later history-free sets follow it when it changes',()=>{
 mount(fixture({weights:[80,80]}));click(plus(0));expect(weights()[0]).toBeGreaterThan(80);expect(weights().slice(1)).toEqual([80,80]);
 click(plus(1));expect(weights()[1]).toBeGreaterThan(80);expect(weights()[2]).toBe(weights()[1]);
});
it('Use last values fills six sets, and only the four extra sets follow edits to the second set',()=>{
 mount(fixture({weights:[80,75],count:6,source:'reuse'}));const before=structuredClone(current);apply();expect(weights()).toEqual([80,75,75,75,75,75]);
 expect(sets().slice(2).every(set=>set.weightEntryMode==='auto')).toBe(true);
 click(plus(0));expect(weights().slice(1)).toEqual([75,75,75,75,75]);click(plus(1));expect(weights()[1]).toBeGreaterThan(75);expect(weights().slice(2)).toEqual(Array(4).fill(weights()[1]));
 expect(current.workouts).toEqual(before.workouts);expect(sets()).toHaveLength(6);
});
it('explicit reuse Undo restores the exact draft including the new automatic-link origins',()=>{
 const s=fixture({weights:[80,75],count:6,source:'reuse'}),e=s.activeWorkout.exercises[0];
 const {state:applied,record}=preparePreviousValues(s,{sessionId:s.activeWorkout.id,exerciseId:e.id,canonicalExerciseId:e.exerciseId,profileId:s.profile.id});
 expect(record.sets).toHaveLength(6);expect(undoPreviousValues(applied,record)).toEqual(s);
});
it('reload retains independent history and the automatic links for extra sets',()=>{
 mount(fixture({weights:[80,75],count:6,source:'reuse'}));apply();reload();expect(weights()).toEqual([80,75,75,75,75,75]);
 click(plus(0));expect(weights().slice(1)).toEqual([75,75,75,75,75]);click(plus(1));expect(weights().slice(2)).toEqual(Array(4).fill(weights()[1]));
});
it('a manually edited future set is protected even if a stale automatic source ID remains',()=>{
 const s=fixture({weights:[]}),e=s.activeWorkout.exercises[0];Object.assign(e.sets[1],{weightEntryMode:'manual',weightSourceSetId:e.sets[0].id});mount(s);
 click(plus(0));expect(weights().slice(1)).toEqual([80,80]);
});
it('completed future sets are never changed',()=>{
 const s=fixture({weights:[]});s.activeWorkout.exercises[0].sets[1].completed=true;mount(s);const before=structuredClone(sets()[1]);click(plus(0));expect(sets()[1]).toEqual(before);
});
it('new Add Set rows have no independent history and follow their preceding set',()=>{
 mount(fixture({weights:[80,80,80]}));click([...host.querySelectorAll('.sets > button')].find(b=>b.textContent.includes('ADD SET')));
 expect(sets()).toHaveLength(4);click(plus(0));expect(weights().slice(1)).toEqual([80,80,80]);click(plus(2));expect(weights()[3]).toBe(weights()[2]);expect(weights()[1]).toBe(80);
});
it('bodyweight history remains bodyweight when the first set gains added load',()=>{
 mount(fixture({id:'pull-up',weights:[null,null,null]}));click(plus(0));expect(weights()[0]).toBeGreaterThan(0);expect(weights().slice(1)).toEqual([null,null]);
});
it('a manual bodyweight choice is protected even with no previous history',()=>{
 const s=fixture({id:'pull-up',weights:[]});Object.assign(s.activeWorkout.exercises[0].sets[1],{weight:null,weightEntryMode:'manual'});mount(s);click(plus(0));expect(weights()[1]).toBeNull();
});
it('per-side history retains its later loads and independent repetition values',()=>{
 mount(fixture({mode:'per_side',source:'reuse'}));apply();const later=structuredClone(sets().slice(1));click(plus(0));expect(sets().slice(1)).toEqual(later);
});
it('history belonging to another exercise does not block automatic carry',()=>{
 const s=fixture();s.workouts[0].exercises[0].exerciseId='leg-press';mount(s);click(plus(0));expect(new Set(weights()).size).toBe(1);
});
it('incompatible side logging modes do not claim an independent historical slot',()=>{
 const s=fixture();s.workouts[0].exercises[0].loggingMode='per_side';mount(s);click(plus(0));expect(new Set(weights()).size).toBe(1);
});
it('an extra repeated historical load is not linked to an empty incompatible preceding set',()=>{
 const s=fixture({weights:[80,75],count:3,source:'reuse'});s.workouts[0].exercises[0].sets[1].reps=null;mount(s);apply();expect(weights()).toEqual([80,null,80]);
 click(plus(0));expect(weights()[0]).toBeGreaterThan(80);expect(weights().slice(1)).toEqual([null,80]);
});
