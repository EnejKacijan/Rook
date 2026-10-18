import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Coach} from './App.jsx';
import {CoachCombineRecovery} from './CoachCombine.jsx';
import {AIService} from './aiService.js';
import {combineExample} from './combineWorkouts.fixture.js';
import {combineSources,buildCombinedProposal} from './combineWorkouts.js';
import {saveState,serializeState,deserializeState,estimateWorkoutMinutes,STORAGE_KEY} from './domain.js';
let root,host,current,open;
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});
 vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 vi.spyOn(AIService,'status').mockResolvedValue({available:true,requiresSignIn:false});
 host=document.createElement('main');document.body.append(host);root=createRoot(host);open=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
function fixture(){
 let state=combineExample();state.program.source='ai-import';const exercise=state.program.days[0].exercises[0];
 Object.assign(exercise,{exerciseId:'imported-custom-hop',exerciseSource:'imported-custom',matchStatus:'original',originalImportedName:'Lateral skater hops',importedName:'Lateral skater hops',
   importedExercise:{id:'imported-custom-hop',name:'Lateral skater hops',pattern:null,muscles:null,equipment:null},loadRequirement:'none'});
 exercise.sets.forEach(set=>set.weight=null);state.program.days.forEach(day=>{day.estimatedMinutes=estimateWorkoutMinutes(day,state.profile,state.program);});
 state=deserializeState(serializeState(state));
 const result=buildCombinedProposal(state,{sourceIds:combineSources(state).filter(s=>s.status==='missed').map(s=>s.logicalSessionId),minutes:75});
 state.activeCoachConversationId='current';state.coachConversationMeta={current:{createdAt:Date.now(),lastActivityAt:Date.now()}};state.coachDraft='Keep my draft';
 state.conversations=[{id:'blocked',conversationId:'current',createdAt:Date.now(),user:'Combine Push and Pull',reply:{text:result.error,combineReviewRequired:result.combineReviewRequired}}];
 return {state,request:result.combineReviewRequired};
}
async function mount(state){expect(saveState(state)).toBe(true);
 function Owner(){const [value,setValue]=useState(state);current=value;const update=fn=>setValue(previous=>{const draft=structuredClone(previous);return fn(draft)||draft;});return <Coach state={value} update={update} setPage={()=>{}} setDetail={open}/>;}
 await act(async()=>root.render(<Owner/>));
}
const button=text=>[...host.querySelectorAll('button')].find(button=>button.textContent.trim()===text);
it('the real Coach offers Confirm Skater Hop, saves one identity link and exposes the next step without opening an editor',async()=>{
 const {state}=fixture(),before=structuredClone(state);await mount(state);
 expect(button('Confirm Skater Hop')).toBeDefined();expect(button('Review Lateral skater hops')).toBeUndefined();
 const write=vi.spyOn(Storage.prototype,'setItem'),confirm=button('Confirm Skater Hop');
 act(()=>{confirm.click();confirm.click();});
 expect(current.program.days[0].exercises[0].exerciseId).toBe('wg-skater-hop');expect(current.program.days[0].exercises[0].sets).toEqual(before.program.days[0].exercises[0].sets);
 expect(current.planVersions).toHaveLength(before.planVersions.length+1);expect(write.mock.calls.filter(([key])=>key===STORAGE_KEY)).toHaveLength(1);
 expect(current.workouts).toEqual(before.workouts);expect(current.todayAdaptation).toBeNull();expect(open).not.toHaveBeenCalled();
 expect(button('PREPARE COMBINED WORKOUT')).toBeDefined();expect(document.activeElement).toBe(button('PREPARE COMBINED WORKOUT'));expect(host.querySelector('textarea').value).toBe('Keep my draft');
 expect(deserializeState(localStorage.getItem(STORAGE_KEY)).program.days[0].exercises[0].exerciseId).toBe('wg-skater-hop');
});
it('a failed save leaves the original exercise intact, shows a useful error and permits confirmation retry',async()=>{
 const {state}=fixture();await mount(state);const before=localStorage.getItem(STORAGE_KEY),setItem=Storage.prototype.setItem;
 const blocked=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){if(key===STORAGE_KEY)throw new DOMException('Synthetic quota','QuotaExceededError');return setItem.call(this,key,value);});
 act(()=>button('Confirm Skater Hop').click());expect(current.program.days[0].exercises[0].exerciseId).toBe('imported-custom-hop');expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
 expect(host.querySelector('[role="alert"]').textContent).toContain('Could not save');expect(button('Confirm Skater Hop')).toBeDefined();
 blocked.mockRestore();act(()=>button('Confirm Skater Hop').click());expect(current.program.days[0].exercises[0].exerciseId).toBe('wg-skater-hop');expect(host.querySelector('[role="alert"]')).toBeNull();
});
it('Choose another exercise retains the manual route and does not confirm or mutate anything',()=>{
 const {state,request}=fixture(),confirm=vi.fn(),review=vi.fn(),before=structuredClone(state);
 act(()=>root.render(<CoachCombineRecovery state={state} request={request} onConfirmMatch={confirm} onReview={review}/>));
 act(()=>button('Choose another exercise').click());expect(review).toHaveBeenCalledExactlyOnceWith({workoutId:state.program.days[0].id,exerciseEntryId:state.program.days[0].exercises[0].id,exerciseId:'imported-custom-hop'});expect(confirm).not.toHaveBeenCalled();expect(state).toEqual(before);
});
