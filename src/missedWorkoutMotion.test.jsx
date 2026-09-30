import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {MissedWorkoutSummary} from './missedWorkoutPresentation.jsx';
import {MissedWorkoutFeedbackProvider} from './MissedWorkoutFeedback.jsx';
import {todayMissedRestFixture} from './todayMissedRest.fixture.js';
import {missedReminderKey} from './missedWorkoutActions.js';

let root,host,current,change,show,animations,originalAnimate;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-19T12:00:00'));localStorage.clear();
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 vi.stubGlobal('matchMedia',()=>({matches:false}));animations=[];
 originalAnimate=Element.prototype.animate;
 Element.prototype.animate=vi.fn(function(frames,options){const animation={node:this,frames,options,cancel:vi.fn(),onfinish:null};animations.push(animation);return animation;});
 vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){
  // Different measured heights for singular/multiple content; no fixed height in production.
  const height=host.querySelector('.is-single')?148:120;
  return {height:this.classList.contains('rook-disclosure-content')||this.style.height==='auto'?height:parseFloat(this.style.height)||0};
 });
});
afterEach(()=>{act(()=>root.unmount());host.remove();Element.prototype.animate=originalAnimate;vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function draw(count=3){
 const initial=todayMissedRestFixture({count});
 function Harness(){const[state,setState]=useState(initial),[visible,setVisible]=useState(true);current=state;change=fn=>act(()=>setState(fn));show=value=>act(()=>setVisible(value));
  return <MissedWorkoutFeedbackProvider state={state} update={setState}>{visible&&<MissedWorkoutSummary state={state} update={setState} onSelect={()=>{}}/>}</MissedWorkoutFeedbackProvider>;
 }
 act(()=>root.render(<Harness/>));return initial;
}
const region=()=>host.querySelector('.today-missed-disclosure');
const hide=()=>act(()=>host.querySelector('.missed-reminder-hide').click());
const undo=()=>act(()=>host.querySelector('.exercise-remove-undo button').click());
const geometry=()=>animations.filter(a=>'height' in a.frames[0]).at(-1);
const finish=()=>act(()=>geometry().onfinish());

it.each([1,3])('Hide retains and collapses the same reminder, Undo expands its measured content (%i)',count=>{
 const before=draw(count),element=region(),label=host.querySelector('.today-missed-open').textContent;
 hide();
 expect(current).toEqual({...before,dismissedMissedReminderKey:missedReminderKey(before)});
 expect(region()).toBe(element);expect(element.getAttribute('aria-hidden')).toBe('true');expect(element.hasAttribute('inert')).toBe(true);
 expect(host.querySelector('.today-missed-open').textContent).toBe(label);
 const height=count===1?148:120;
 expect(geometry().frames).toEqual([{height:`${height}px`},{height:'0px'}]);
 expect(geometry().options).toEqual({duration:200,easing:'cubic-bezier(.2,0,0,1)'});
 expect(host.querySelector('.exercise-remove-undo')).not.toBeNull();
 finish();expect(element.style.height).toBe('0px');expect(host.querySelector('.today-missed-row')).toBeNull();
 act(()=>vi.advanceTimersByTime(4999));undo();
 expect(region()).toBe(element);expect(host.querySelector('.today-missed-open').textContent).toBe(label);
 expect(geometry().frames).toEqual([{height:'0px'},{height:`${height}px`}]);
 expect(element.hasAttribute('inert')).toBe(false);finish();expect(element.style.height).toBe('auto');expect(element.style.opacity).toBe('1');
 expect(current).toEqual(before);
});
it('rapid Hide/Undo cancels the old collapse and ignores its late completion',()=>{
 draw();const element=region();hide();const closing=geometry();
 element.getBoundingClientRect=()=>({height:70});undo();
 expect(closing.cancel).toHaveBeenCalled();expect(geometry().frames[0]).toEqual({height:'70px'});
 act(()=>closing.onfinish());expect(host.querySelector('.today-missed-row')).not.toBeNull();
 finish();expect(element.style.height).toBe('auto');expect(element.style.opacity).toBe('1');
});
it('ordinary rerenders do not restart collapse or the five-second Undo lifetime',()=>{
 draw();hide();const closing=geometry(),count=animations.length;
 act(()=>vi.advanceTimersByTime(2500));change(s=>({...s,profile:{...s.profile,units:'lb'}}));
 expect(animations).toHaveLength(count);expect(geometry()).toBe(closing);finish();
 act(()=>vi.advanceTimersByTime(2499));expect(host.querySelector('.exercise-remove-undo')).not.toBeNull();
 act(()=>vi.advanceTimersByTime(1));expect(host.querySelector('.exercise-remove-undo')).toBeNull();expect(region().style.height).toBe('0px');
});
it('leaving Today during collapse cleans up; Undo off-route restores normally on return',()=>{
 const before=draw();hide();const closing=geometry();show(false);
 expect(closing.cancel).toHaveBeenCalled();expect(region()).toBeNull();act(()=>closing.onfinish());
 undo();show(true);expect(region().style.height).toBe('auto');expect(region().style.opacity).toBe('1');expect(current).toEqual(before);
});
it('a changed occurrence group never inherits stale height or an obsolete Undo',()=>{
 draw();const old=region();hide();const closing=geometry();change(()=>todayMissedRestFixture({count:1}));
 expect(closing.cancel).toHaveBeenCalled();expect(region()).not.toBe(old);act(()=>closing.onfinish());
 expect(region().style.height).toBe('auto');expect(host.querySelector('.today-missed-label').textContent).toBe('MISSED WORKOUT');expect(host.querySelector('.exercise-remove-undo')).toBeNull();
});
it('reduced motion closes/restores immediately with identical presentation-only semantics',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}));const before=draw();hide();
 expect(host.querySelector('.today-missed-row')).toBeNull();expect(region().style.height).toBe('0px');undo();
 expect(region().style.height).toBe('auto');expect(animations).toHaveLength(0);expect(current).toEqual(before);
});
it('failed persistence does not start a collapse',()=>{
 const before=draw();vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('full');});hide();
 expect(region().style.height).toBe('auto');expect(animations).toHaveLength(0);expect(current).toEqual(before);expect(host.querySelector('[role="alert"]').textContent).toContain('still visible');
});
