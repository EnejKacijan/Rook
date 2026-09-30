import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Today} from './App.jsx';
import {TemporaryScheduleSummary} from './TemporaryScheduleSummary.jsx';
import {temporaryScheduleReview} from './flexibleWeek.js';
import {hideTemporaryScheduleSummary} from './temporarySchedulePresentation.js';
import {temporaryScheduleSummaryState} from './fixtures/temporaryScheduleSummaryState.js';
let root,host,current,change,animations,originalAnimate;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-29T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);animations=[];
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  originalAnimate=Element.prototype.animate;
  Element.prototype.animate=vi.fn(function(frames,options){const animation={node:this,frames,options,cancel:vi.fn(),onfinish:null};animations.push(animation);return animation;});
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){return {height:this.classList.contains('rook-disclosure-content')||this.style.height==='auto'?120:parseFloat(this.style.height)||0};});
});
afterEach(()=>{act(()=>root.unmount());host.remove();Element.prototype.animate=originalAnimate;vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function render(initial=temporaryScheduleSummaryState(),today=false,onView=()=>{}){
 function Harness(){const[state,setState]=useState(initial);current=state;change=fn=>act(()=>setState(fn));
  return today?<Today state={state} update={setState} setDetail={onView} setPage={()=>{}}/>:<TemporaryScheduleSummary state={state} review={temporaryScheduleReview(state)} update={setState} onView={onView}/>;
 }
 act(()=>root.render(<Harness/>));return initial;
}
const region=()=>host.querySelector('.temporary-schedule-disclosure');
const summary=()=>host.querySelector('.temporary-schedule-summary');
const hide=()=>act(()=>host.querySelector('[aria-label="Hide temporary schedule summary"]').click());
const geometry=()=>animations.filter(a=>'height' in a.frames[0]).at(-1);
it('real Today shows two moved workouts with View/Hide, not Review; View preserves schedule and opens existing details',()=>{
  const view=vi.fn(),before=render(undefined,true,view);
  expect(summary().textContent).toContain('2 workouts moved');expect(summary().textContent).not.toContain('REVIEW');
  act(()=>[...summary().querySelectorAll('button')].find(b=>b.textContent==='View schedule').click());
  expect(view).toHaveBeenCalledWith({flexibleWeek:{reviewExisting:true}});expect(current).toEqual(before);
});
it('Hide uses the same measured 200ms Disclosure and retains content until it finishes',()=>{
  const before=render(),node=region();hide();
  expect({...current,dismissedTemporarySchedule:null}).toEqual(before);expect(JSON.parse(localStorage.getItem('lift-v2-state')).dismissedTemporarySchedule).toEqual(current.dismissedTemporarySchedule);
  expect(region()).toBe(node);expect(node.hasAttribute('inert')).toBe(true);expect(summary()).not.toBeNull();
  expect(geometry().frames).toEqual([{height:'120px'},{height:'0px'}]);expect(geometry().options.duration).toBe(200);
  act(()=>geometry().onfinish());expect(summary()).toBeNull();expect(node.style.height).toBe('0px');
});
it('reload-like initial hidden state renders no summary, and a changed revision reveals it',()=>{
  render(hideTemporaryScheduleSummary(temporaryScheduleSummaryState()));expect(summary()).toBeNull();
  change(s=>({...s,flexibleWeek:{...s.flexibleWeek,revision:s.flexibleWeek.revision+1}}));expect(summary().textContent).toContain('View schedule');
});
it('a hidden valid summary becoming unresolved reveals actionable copy with no Hide',()=>{
  render(hideTemporaryScheduleSummary(temporaryScheduleSummaryState()));
  change(s=>{const next=structuredClone(s);Object.values(next.flexibleWeek.sessions)[0].planFingerprint='stale';return next;});
  expect(summary().textContent).toContain('SCHEDULE NEEDS ATTENTION');expect(summary().textContent).toContain('1 workout still needs a date');
  expect(summary().textContent).toContain('REVIEW SCHEDULE');expect(summary().querySelector('[aria-label="Hide temporary schedule summary"]')).toBeNull();
});
it('reduced motion hides immediately without animations',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true}));render();hide();expect(summary()).toBeNull();expect(region().style.height).toBe('0px');expect(animations).toHaveLength(0);
});
it('failed persistence leaves summary, schedule and backup intact',()=>{
  const before=render();localStorage.setItem('rook-recovery-v1','untouched-backup');
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});hide();
  expect(current).toEqual(before);expect(region().style.height).toBe('auto');expect(animations).toHaveLength(0);
  expect(summary().querySelector('[role="alert"]').textContent).toContain('still visible');expect(localStorage.getItem('rook-recovery-v1')).toBe('untouched-backup');
});
it('removal during collapse cancels old animation without reviving stale content',()=>{
  render();hide();const closing=geometry();change(s=>({...s,flexibleWeek:null}));expect(region()).toBeNull();expect(closing.cancel).toHaveBeenCalled();
  act(()=>closing.onfinish());expect(region()).toBeNull();
});
