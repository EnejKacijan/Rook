import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PlanEditor,ScratchPlan} from './App.jsx';
import {blankState} from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
beforeEach(()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});
 host=document.createElement('main');host.className='scratch-editor-screen screen';document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const button=(text,scope=host)=>[...scope.querySelectorAll('button')].find(e=>e.textContent.trim()===text||e.getAttribute('aria-label')===text);
const renderEditor=async({populated=false,include=true,modes=['auto','custom','none'],mode='scratch',name='My training plan'}={})=>{
 const state=createReturningUserFixture(0),source=structuredClone(state.program);source.name=name;source.includeRecommendedWarmups=include;
 source.days=source.days.slice(0,3).map((d,i)=>({...d,name:`Day ${i}`,workoutName:`Day ${i}`,exercises:populated?d.exercises.slice(0,1):[],warmupPlan:{mode:modes[i],provenance:'user',items:[],rampUpSets:[]}}));
 const save=vi.fn();await act(async()=>root.render(<PlanEditor source={source} profile={state.profile} mode={mode} showCancel={false} onSave={save} onCancel={()=>{}}/>));return {source,save};
};
it('keeps a labelled plan name before compact settings and makes each empty day actionable without repeated diagnostics',async()=>{
 await renderEditor();expect(host.querySelector('h1').textContent).toBe('Build your week.');
 expect(host.textContent).not.toMatch(/more needed|days ready|Warm-up included|Build every workout/);
 expect(host.querySelector('.scratch-day-status')).toBeNull(); // Compact drag summaries stay available during the existing reorder mode.
 const field=host.querySelector('.plan-name-field');expect(field.textContent).toBe('Plan name');expect(field.querySelector('input').value).toBe('My training plan');
 expect(field.compareDocumentPosition(host.querySelector('.plan-warmup-preference'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(host.querySelector('#plan-reorder-help').className).toBe('visually-hidden');
 expect(host.querySelectorAll('.scratch-readiness')).toHaveLength(1);expect(button('USE THIS PLAN').disabled).toBe(true);
 for(const day of host.querySelectorAll('[data-reorder-workout-section]')){
  expect(day.querySelector('.plan-workout-reorder-bar .plan-workout-overflow')).not.toBeNull();expect(day.querySelector('.plan-workout-tools .plan-workout-overflow')).toBeNull();
  expect(day.querySelector('.workout-name-field > span')).toBeNull();expect(day.querySelector('input').getAttribute('aria-label')).toMatch(/workout name/);
  expect(day.querySelector('.plan-workout-drag-surface').getAttribute('data-reorder-kind')).toBe('workout');
  expect(day.querySelector('.plan-workout-tools').compareDocumentPosition(day.querySelector('.scratch-warmup-row'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 }
});
it('shows Automatic, Custom and Off from existing warm-up state, never generated counts on empty days',async()=>{
 await renderEditor();expect([...host.querySelectorAll('.scratch-warmup-row .plan-warmup-card-header > strong')].map(e=>e.textContent)).toEqual(['Warm-up · Automatic','Warm-up · Custom','Warm-up · Off']);
 expect(host.querySelector('.scratch-warmup-row').textContent).not.toMatch(/movements|min|ramp-up group/);
});
it('global disabled warm-ups truthfully show Off without mutating custom configuration',async()=>{
 const {source}=await renderEditor({include:false});expect([...host.querySelectorAll('.scratch-warmup-row strong')].map(e=>e.textContent)).toEqual(['Warm-up · Off','Warm-up · Off','Warm-up · Off']);expect(source.days[1].warmupPlan.mode).toBe('custom');
});
it('generated-materialized warm-ups say Recommended, not live Automatic or user Custom',async()=>{
 const s=createReturningUserFixture(0),source=structuredClone(s.program);source.days=source.days.slice(0,1);source.days[0].warmupPlan={mode:'custom',provenance:'generated-materialized',items:[],rampUpSets:[]};
 await act(async()=>root.render(<PlanEditor source={source} profile={s.profile} mode="scratch" onSave={()=>{}} onCancel={()=>{}}/>));expect(host.querySelector('.scratch-warmup-row strong').textContent).toBe('Warm-up · Recommended');
});
it('populated days keep exercise cards/counts and Apply remains explicit',async()=>{
 const {source,save}=await renderEditor({populated:true});expect(host.querySelectorAll('.plan-editor-exercise')).toHaveLength(3);expect(host.querySelectorAll('.scratch-day-status')).toHaveLength(3);expect(host.querySelector('.scratch-readiness')).toBeNull();
 expect(button('USE THIS PLAN').disabled).toBe(false);expect(save).not.toHaveBeenCalled();await act(async()=>button('USE THIS PLAN').click());expect(save).toHaveBeenCalledOnce();expect(save.mock.calls[0][0].days.map(d=>d.exercises)).toEqual(source.days.map(d=>d.exercises));
});
it('reports a missing name rather than claiming missing exercise work',async()=>{
 await renderEditor({name:'',populated:true});expect(host.querySelector('.scratch-readiness').textContent).toBe('Enter a plan name to continue.');expect(button('USE THIS PLAN').disabled).toBe(true);
});
it('leaves the shared Edit Plan presentation unchanged',async()=>{
 host.className='screen edit-plan-screen';await renderEditor({mode:'edit',populated:true});expect(host.querySelector('h1').textContent).toBe('Edit your plan');expect(host.querySelector('.scratch-warmup-row')).toBeNull();
 expect(host.querySelector('.import-plan-meta .plan-name-field')).not.toBeNull();expect(host.querySelector('.plan-workout-tools .plan-workout-overflow')).not.toBeNull();expect(host.querySelector('.workout-name-field > span').textContent).toBe('WORKOUT NAME');
});
it('removes only the duplicate editor footer Back, retaining the original setup handler and draft',async()=>{
 await act(async()=>root.render(<ScratchPlan state={blankState()} update={()=>{}} close={()=>{}}/>));
 await act(async()=>button('Mon').click());await act(async()=>button('CONTINUE').click());const surface=host.querySelector('.scratch-editor-screen');
 expect(surface.querySelector('.sheet-action-footer').querySelectorAll('button')).toHaveLength(1);expect(button('Back',surface)).toBeUndefined();
 await act(async()=>button('Back to plan setup',surface).click());expect(surface.hidden).toBe(true);await act(async()=>button('CONTINUE').click());expect(host.querySelector('.scratch-editor-screen')).toBe(surface);
});
