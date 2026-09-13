import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {PlanEditor} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';

it('copies only to an empty draft day, preserving prescriptions, pair and custom warm-up semantics with fresh identities',async()=>{
 const state=createReturningUserFixture(0),source=structuredClone(state.program);
 source.days=source.days.slice(0,3);source.days[1].exercises=[];
 const a=source.days[0];a.exercises=a.exercises.slice(0,2);
 for(const [i,e]of a.exercises.entries()){
  e.supersetId='original-pair';e.repMin=8;e.repMax=10;e.targetRir=i;
  e.sets=Array.from({length:3},(_,j)=>({id:`original-${i}-${j}`,reps:8,weight:20+i*10,completed:false,setType:j===2?'drop':'normal',...(j===2?{segments:[]}:{} )}));
 }
 a.warmupPlan={mode:'custom',provenance:'user',items:[{id:'original-warmup',label:'Band preparation',sets:2,reps:10,seconds:null,minutes:null,provenance:'user'}],rampUpSets:[{id:'original-ramp',targetExerciseEntryId:a.exercises[0].id,sets:[{id:'original-ramp-set',weight:10,reps:8}]}]};
 const before=JSON.stringify(source),saved=vi.fn(),host=document.createElement('main');host.className='screen';document.body.append(host);const root=createRoot(host);
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});
 const button=(name,scope=document)=>[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===name||b.getAttribute('aria-label')===name);
 try{
  await act(async()=>root.render(<PlanEditor source={source} profile={state.profile} exerciseState={state} mode="edit" onSave={saved} onCancel={()=>{}}/>));
  await act(async()=>host.querySelector('.plan-workout-overflow').click());
  await act(async()=>button('Copy exercises to another day›').click());
  const sheet=document.querySelector('.plan-workout-actions-sheet');
  expect(sheet.querySelectorAll('[role="radio"]')).toHaveLength(2);
  expect(sheet.querySelectorAll('[role="radio"]')[1].disabled).toBe(true);
  expect(button('COPY').disabled).toBe(true);
  await act(async()=>sheet.querySelector('[role="radio"]:not(:disabled)').click());
  expect(saved).not.toHaveBeenCalled();expect(JSON.stringify(source)).toBe(before);
  await act(async()=>button('COPY').click());
  await act(async()=>button('SAVE CHANGES',host).click());
  expect(saved).toHaveBeenCalledTimes(1);
  const plan=JSON.parse(JSON.stringify(saved.mock.calls[0][0])),copied=plan.days[1];
  expect(copied.exercises).toHaveLength(2);
  expect(copied.exercises[0].supersetId).toBe(copied.exercises[1].supersetId);expect(copied.exercises[0].supersetId).not.toBe(a.exercises[0].supersetId);
  for(const [i,e]of copied.exercises.entries()){
   const original=a.exercises[i];expect(e.id).not.toBe(original.id);
   for(const key of ['exerciseId','repMin','repMax','targetRir','loggingMode','restSeconds','notes'])expect(e[key]).toEqual(original[key]);
   expect(e.sets.map(({id,...s})=>s)).toEqual(original.sets.map(({id,...s})=>s));
   expect(e.sets.every((s,j)=>s.id!==original.sets[j].id)).toBe(true);
  }
  expect(copied.warmupPlan.items.map(({id,...s})=>s)).toEqual(a.warmupPlan.items.map(({id,...s})=>s));expect(copied.warmupPlan.items[0].id).not.toBe(a.warmupPlan.items[0].id);
  expect(copied.warmupPlan.rampUpSets[0].targetExerciseEntryId).toBe(copied.exercises[0].id);
  expect(copied.warmupPlan.rampUpSets[0].sets.map(({id,...s})=>s)).toEqual(a.warmupPlan.rampUpSets[0].sets.map(({id,...s})=>s));
  expect(JSON.stringify(source)).toBe(before);expect(plan.days[2].exercises).toEqual(source.days[2].exercises);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
