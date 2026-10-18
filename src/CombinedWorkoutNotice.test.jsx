import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {CombinedWorkoutNotice} from './CoachCombine.jsx';
import {TodayActionsSheet} from './App.jsx';
import {combineExample} from './combineWorkouts.fixture.js';
import {combineSources,buildCombinedProposal,applyCombinedProposal} from './combineWorkouts.js';
import {combinedOccurrenceState} from './combinedWorkoutLifecycle.js';
import {setCombinedWorkoutNoticeHidden,combinedWorkoutNoticeHidden} from './combinedWorkoutPresentation.js';
import {deserializeState,serializeState,STORAGE_KEY,isoDay} from './domain.js';
import {forgetStorageSession} from './localStateStorage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,current;
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('requestAnimationFrame',callback=>setTimeout(callback,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 localStorage.clear();forgetStorageSession(localStorage);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();localStorage.clear();forgetStorageSession(localStorage);});
function fixture(){
 const state=combineExample(),sources=combineSources(state).filter(source=>source.status==='missed');
 const {proposal}=buildCombinedProposal(state,{sourceIds:sources.map(source=>source.logicalSessionId),minutes:45});
 return applyCombinedProposal(state,proposal,()=>true);
}
function render(initial,{menu=false,close=()=>{}}={}){
 function Owner(){const [state,setState]=useState(initial);current=state;
  return <><CombinedWorkoutNotice state={state} update={setState}/>{menu&&<TodayActionsSheet state={state} update={setState} close={close} setDetail={()=>{}} date={isoDay()} hasWorkout/>}</>;
 }
 act(()=>root.render(<Owner key={Math.random()}/>));
}
const hide=()=>host.querySelector('[aria-label="Hide combined workout notice"]');
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent===text);
it('Hide persists only a display preference; rapid taps never cancel or release the sources',()=>{
 const initial=fixture(),before=structuredClone(initial);render(initial);
 const write=vi.spyOn(Storage.prototype,'setItem'),target=hide();
 act(()=>{target.click();target.click();});
 expect(hide()).toBeNull();expect(write.mock.calls.filter(([key])=>key===STORAGE_KEY)).toHaveLength(1);
 expect({...current,dismissedCombinedWorkoutNoticeKey:null}).toEqual(before);
 const restored=deserializeState(localStorage.getItem(STORAGE_KEY));
 expect(combinedWorkoutNoticeHidden(restored)).toBe(true);
 expect(restored.todayAdaptation).toEqual(before.todayAdaptation);
 for(const source of restored.todayAdaptation.sourceSessions)expect(combinedOccurrenceState(restored,source)).toBe('reserved');
 render(restored);expect(hide()).toBeNull();
});
it('a failed Hide keeps the notice, cancel action and reservation available for retry',()=>{
 const initial=fixture();render(initial);
 const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});
 act(()=>hide().click());expect(current).toEqual(initial);expect(hide()).not.toBeNull();
 expect(button('Cancel combined workout')).toBeDefined();expect(host.querySelector('[role="alert"]').textContent).toContain('still visible');
 write.mockRestore();act(()=>hide().click());expect(hide()).toBeNull();
});
it('More options can restore the hidden notice and its canonical Cancel action',()=>{
 const initial=setCombinedWorkoutNoticeHidden(fixture(),true),close=vi.fn();render(initial,{menu:true,close});
 expect(hide()).toBeNull();act(()=>button('Show combined workout info').click());expect(close).toHaveBeenCalledOnce();
 expect(hide()).not.toBeNull();expect(current.todayAdaptation).toEqual(initial.todayAdaptation);
 act(()=>button('Cancel combined workout').click());expect(current.todayAdaptation).toBeNull();expect(current.workouts).toEqual(initial.workouts);
 expect(button('Show combined workout info')).toBeUndefined();
 for(const source of initial.todayAdaptation.sourceSessions)expect(combinedOccurrenceState(current,source)).toBeNull();
});
it('failed Show stays recoverable without closing or changing the combined workout',()=>{
 const initial=setCombinedWorkoutNoticeHidden(fixture(),true),close=vi.fn();render(initial,{menu:true,close});
 const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});
 act(()=>button('Show combined workout info').click());expect(current).toEqual(initial);expect(close).not.toHaveBeenCalled();
 expect(host.querySelector('[role="alert"]').textContent).toContain('Try again');
 write.mockRestore();act(()=>button('Show combined workout info').click());expect(hide()).not.toBeNull();
});
it('unrelated edits retain Hide, while a different combined workout or revision shows a fresh notice',()=>{
 const hidden=setCombinedWorkoutNoticeHidden(fixture(),true);hidden.profile.units='lb';
 render(deserializeState(serializeState(hidden)));expect(hide()).toBeNull();
 for(const field of ['id','revision','date']){
  const revised=structuredClone(hidden);revised.todayAdaptation[field]=field==='revision'?1:field==='date'?'2026-09-13':'another-combination';
  render(revised);expect(hide()).not.toBeNull();
 }
});
it('legacy and malformed preferences are safe, and an ended combination never offers Show',()=>{
 const legacy=fixture();delete legacy.dismissedCombinedWorkoutNoticeKey;
 expect(deserializeState(serializeState(legacy)).dismissedCombinedWorkoutNoticeKey).toBeNull();
 legacy.dismissedCombinedWorkoutNoticeKey={invalid:true};expect(deserializeState(serializeState(legacy)).dismissedCombinedWorkoutNoticeKey).toBeNull();
 const ended=setCombinedWorkoutNoticeHidden(fixture(),true);ended.todayAdaptation=null;
 render(ended,{menu:true});expect(hide()).toBeNull();expect(button('Show combined workout info')).toBeUndefined();
});
