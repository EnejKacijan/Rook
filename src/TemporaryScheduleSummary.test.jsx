import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Today,TodayActionsSheet} from './App.jsx';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {TemporaryScheduleSummary} from './TemporaryScheduleSummary.jsx';
import {temporaryScheduleReview,proposeFlexibleWeek,applyFlexibleWeek} from './flexibleWeek.js';
import {hideTemporaryScheduleSummary} from './temporarySchedulePresentation.js';
import {temporaryScheduleSummaryState} from './fixtures/temporaryScheduleSummaryState.js';
let root,host,write;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-29T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  write=vi.spyOn(Storage.prototype,'setItem');
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
const notice=()=>host.querySelector('.temporary-schedule-summary');
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
function render(state,view=vi.fn(),today=false){act(()=>root.render(today?<Today state={state} update={()=>{}} setDetail={view} setPage={()=>{}}/>:<TemporaryScheduleSummary review={temporaryScheduleReview(state)} onView={view}/>));}
function unresolved(){const state=hideTemporaryScheduleSummary(temporaryScheduleSummaryState());Object.values(state.flexibleWeek.sessions)[0].planFingerprint='stale';return state;}
it('saved moves do not stack another notice beside the missed reminder on Today',()=>{
  const state=temporaryScheduleSummaryState(),before=structuredClone(state);render(state,vi.fn(),true);
  expect(notice()).toBeNull();expect(host.querySelector('[aria-label="Applied schedule changes"]')).toBeNull();
  expect(host.querySelectorAll('[aria-label="Missed-workout reminder"]')).toHaveLength(1);
  expect(host.querySelector('[aria-label^="Hide missed workout"]')).not.toBeNull();
  expect(state).toEqual(before);expect(write).not.toHaveBeenCalled();
});
it('a new valid revision remains quiet without requiring a dismissal receipt',()=>{
  const state=temporaryScheduleSummaryState();render(state);expect(notice()).toBeNull();
  render({...state,flexibleWeek:{...state.flexibleWeek,revision:state.flexibleWeek.revision+1}});
  expect(notice()).toBeNull();expect(state.dismissedTemporarySchedule).toBeNull();expect(write).not.toHaveBeenCalled();
});
it('a saved skip does not require the user to clear a success banner',()=>{
  const state=temporaryScheduleSummaryState(),id=Object.keys(state.flexibleWeek.sessions)[0];
  const result=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'skip',sessionId:id}));expect(result.status).toBe('applied');
  render(result.state);expect(notice()).toBeNull();expect(write).not.toHaveBeenCalled();
});
it('an actual unresolved move stays actionable despite a legacy Hide receipt',()=>{
  const state=unresolved(),before=structuredClone(state),view=vi.fn();render(state,view);
  expect(notice().textContent).toContain('Review schedule');expect(notice().textContent).toContain('1 workout needs attention');
  expect(notice().querySelectorAll('button')).toHaveLength(1);expect(notice().textContent).not.toContain('Hide');
  act(()=>notice().querySelector('button').click());expect(view).toHaveBeenCalledOnce();
  render(state,view);expect(notice()).not.toBeNull();expect(state).toEqual(before);expect(write).not.toHaveBeenCalled();
});
it('the warning disappears only when the underlying invalid links are resolved',()=>{
  const state=unresolved();Object.values(state.flexibleWeek.sessions)[1].planFingerprint='stale';render(state);
  expect(notice().textContent).toContain('2 workouts need attention');
  const valid=temporaryScheduleSummaryState();render(valid);expect(notice()).toBeNull();expect(write).not.toHaveBeenCalled();
});
it('Today routes the warning directly to the existing schedule repair view',()=>{
  const state=unresolved(),view=vi.fn();render(state,view,true);act(()=>host.querySelector('.schedule-attention-open').click());
  expect(view).toHaveBeenCalledWith({flexibleWeek:{reviewExisting:true}});expect(write).not.toHaveBeenCalled();
});
it.each(['current','past'])('the overflow menu keeps %s schedule changes directly accessible without writes',kind=>{
  const state=temporaryScheduleSummaryState(),view=vi.fn();
  if(kind==='past'){
    state.flexibleWeek.sessions=Object.fromEntries(Object.values(state.flexibleWeek.sessions).map((record,index)=>{const date=['2026-09-14','2026-09-15'][index],id=`${record.workoutId}:${date}`;state.workouts.push({id:'past-'+index,logicalSessionId:id,completedAt:date+'T11:00:00',exercises:[]});return [id,{...record,id,originalDate:date,scheduledDate:date,planFingerprint:'old-plan'}];}));
  }
  if(kind==='past')expect(temporaryScheduleReview(state).historical).toHaveLength(2);
  act(()=>root.render(<TodayActionsSheet state={state} date="2026-09-29" hasWorkout={false} update={()=>{}} setDetail={view} close={()=>{}}/>));
  act(()=>button('Schedule changes').click());expect(view).toHaveBeenCalledWith({flexibleWeek:{reviewExisting:true}});expect(write).not.toHaveBeenCalled();
});
it.each([false,true])('Done only closes the review; unresolved=%s is not acknowledged or changed',invalid=>{
  const state=invalid?unresolved():temporaryScheduleSummaryState(),before=structuredClone(state),close=vi.fn();
  const Header=({title})=><header>{title}</header>;
  act(()=>root.render(<FlexibleWeekSheet state={state} update={()=>{}} close={close} Header={Header} request={{reviewExisting:true}}/>));
  act(()=>button('DONE').click());expect(close).toHaveBeenCalledOnce();expect(state).toEqual(before);expect(write).not.toHaveBeenCalled();
  render(state);expect(Boolean(notice())).toBe(invalid);
});
