import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {CoachCombineRecovery} from './CoachCombine.jsx';
import {PlanEditor,Coach} from './App.jsx';
import {combineExample} from './combineWorkouts.fixture.js';
import {combineSources,buildCombinedProposal} from './combineWorkouts.js';
import {combinedPrescriptionReview} from './combineExerciseReview.js';
let root,host;
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});
 host=document.createElement('main');host.className='screen detail-screen';document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
function fixture(){const state=combineExample(),exercise=state.program.days[1].exercises[0];
 exercise.partialPrescription={missing:['sets']};exercise.sets=[];
 const result=buildCombinedProposal(state,{sourceIds:combineSources(state).filter(s=>s.status==='missed').map(s=>s.logicalSessionId),minutes:75});
 return {state,exercise,request:result.combineReviewRequired};
}
it('opens the exact source exercise and does not mutate the plan',()=>{
 const {state,exercise,request}=fixture(),onReview=vi.fn(),before=structuredClone(state);
 act(()=>root.render(<CoachCombineRecovery state={state} request={request} onReview={onReview}/>));
 expect(host.textContent).toContain('missing sets');act(()=>host.querySelector('button').click());
 expect(onReview).toHaveBeenCalledExactlyOnceWith({workoutId:state.program.days[1].id,exerciseEntryId:exercise.id,exerciseId:exercise.exerciseId});expect(state).toEqual(before);
});
it('the actual Coach transcript gives an existing legacy dead-end its direct Edit plan route, even while offline',()=>{
 const {state,exercise,request}=fixture(),detail=vi.fn(),before=structuredClone(state.program);
 state.activeCoachConversationId='current';state.coachConversationMeta={current:{createdAt:Date.now(),updatedAt:Date.now()}};
 state.conversations=[{id:'time',conversationId:'current',user:'Combine Push and Pull',createdAt:Date.now()-1000,reply:{text:'How much time?',combineRequest:{step:'time',sourceIds:request.sourceIds}}},
   {id:'blocked',conversationId:'current',user:'No strict limit',createdAt:Date.now(),reply:{text:'Review Pull-up against your current equipment, restrictions or unresolved prescription first. No workout was changed.'}}];
 act(()=>root.render(<Coach state={state} update={()=>{}} setPage={()=>{}} setDetail={detail}/>));
 const recovery=host.querySelector('[aria-label="Combined workout next step"]');expect(recovery,host.textContent).not.toBeNull();
 act(()=>recovery.querySelector('button').click());expect(detail).toHaveBeenCalledExactlyOnceWith({editPlan:{reviewExerciseIds:[exercise.id]}});expect(state.program).toEqual(before);
});
it('recomputes after resolving a detail and retries with the same sources and time',()=>{
 const {state,exercise,request}=fixture(),onRetry=vi.fn();
 const render=()=>act(()=>root.render(<CoachCombineRecovery state={state} request={request} onReview={()=>{}} onRetry={onRetry}/>));
 render();exercise.sets=[{id:'resolved-set',reps:8,weight:null,completed:false}];delete exercise.partialPrescription;render();
 expect(host.textContent).not.toContain('missing sets');expect(host.querySelectorAll('button')).toHaveLength(1);
 act(()=>host.querySelector('button').click());expect(onRetry).toHaveBeenCalledExactlyOnceWith({sourceIds:request.sourceIds,minutes:75});expect(state.todayAdaptation).toBeNull();
});
it.each(['plan','profile','exercise'])('a stale %s link never opens another target',kind=>{
 const {state,request}=fixture(),onReview=vi.fn();
 if(kind==='plan')state.program.id='other-plan';if(kind==='profile')state.profile.id='other-profile';
 if(kind==='exercise')state.program.days[1].exercises.splice(0,1);
 act(()=>root.render(<CoachCombineRecovery state={state} request={request} onReview={onReview}/>));
 expect([...host.querySelectorAll('button')].filter(b=>b.textContent.startsWith('Review '))).toHaveLength(0);expect(onReview).not.toHaveBeenCalled();
});
it('focused missing-prescription editor opens the target, preserves known source values, and saves only the chosen detail',()=>{
 const {state,exercise}=fixture(),before=structuredClone(state.program),save=vi.fn(),dirty=vi.fn();
 const review=combinedPrescriptionReview(state.program,[exercise.id]);
 act(()=>root.render(<PlanEditor source={state.program} profile={state.profile} exerciseState={state} mode="edit" reviewExerciseIds={[exercise.id]} sourceReview={review} onSave={save} onCancel={()=>{}} onDirtyChange={dirty}/>));
 const expanded=host.querySelector('.plan-editor-exercise.is-expanded');expect(expanded.id).toBe(`import-exercise-${exercise.id}`);
 expect(host.querySelector('.plan-import-issues')).toBeNull();expect(expanded.querySelector('.plan-import-choice')).not.toBeNull();
 expect(expanded.querySelector('[aria-label="Source Min reps"]').textContent).toContain(String(exercise.repMin));
 const input=expanded.querySelector('[aria-label="Reviewed Sets"]');
 act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(dirty).toHaveBeenLastCalledWith(true);
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='SAVE CHANGES');expect(button,host.textContent).toBeDefined();expect(button.disabled).toBe(false);
 act(()=>button.click());expect(save).toHaveBeenCalledOnce();const saved=save.mock.calls[0][0],next=saved.days[1].exercises[0];
 expect(next).not.toHaveProperty('partialPrescription');expect(next.sets).toHaveLength(2);expect(next.repMin).toBe(exercise.repMin);expect(next.repMax).toBe(exercise.repMax);
 expect(saved.days[0].exercises).toEqual(before.days[0].exercises);expect(state.program).toEqual(before);
});
it('removing the specific unresolved exercise releases only its decision, and Undo restores the guard',()=>{
 const {state,exercise}=fixture(),save=vi.fn();
 act(()=>root.render(<PlanEditor source={state.program} profile={state.profile} exerciseState={state} mode="edit" reviewExerciseIds={[exercise.id]} sourceReview={combinedPrescriptionReview(state.program,[exercise.id])} onSave={save} onCancel={()=>{}}/>));
 const saveButton=()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='SAVE CHANGES');
 expect(saveButton().disabled).toBe(true);
 const remove=host.querySelector('.plan-editor-exercise.is-expanded .plan-exercise-remove');
 act(()=>remove.click());expect(saveButton().disabled).toBe(false);expect(save).not.toHaveBeenCalled();
 act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Undo').click());expect(saveButton().disabled).toBe(true);
});
