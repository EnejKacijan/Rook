import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {FlexibleWeekSheet} from './FlexibleWeekSheet.jsx';
import {MissedWorkoutFeedbackProvider} from './MissedWorkoutFeedback.jsx';
import {adjustWeekReorderState} from './fixtures/adjustWeekReorderState.js';
let root,current,change,updateSpy;
const Header=({onBack,onClose})=><header>{onBack&&<button className="detail-header-back" onClick={onBack}>Back</button>}<button onClick={onClose}>Close</button></header>;
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent===text);
const click=text=>act(()=>button(text).click());
const slots=()=>[...document.querySelectorAll('[data-date-slot]')];
const grip=name=>[...document.querySelectorAll('.rook-reorder-handle')].find(node=>node.getAttribute('aria-label').startsWith('Reorder '+name+','));
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-05T12:00:00'));vi.stubGlobal('matchMedia',()=>({matches:true}));vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(()=>fn(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);localStorage.clear();const node=document.createElement('div');document.body.append(node);root=createRoot(node);});
afterEach(()=>{act(()=>root.unmount());document.body.innerHTML='';vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
function draw(initial=adjustWeekReorderState()){updateSpy=vi.fn();function Harness(){const[state,setState]=useState(initial),[open,setOpen]=useState(true);current=state;change=fn=>act(()=>setState(fn));const update=fn=>{updateSpy();setState(fn);};return <MissedWorkoutFeedbackProvider state={state} update={update}>{open&&<FlexibleWeekSheet state={state} update={update} close={()=>setOpen(false)} Header={Header}/>}</MissedWorkoutFeedbackProvider>;}act(()=>root.render(<Harness/>));}
function review(){act(()=>[...document.querySelectorAll('button')].find(node=>node.textContent.includes('My available days changed')).click());click('REVIEW SCHEDULE');}
function keyboardMove(name,key){act(()=>grip(name).dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key})));}
it('secondary reorder belongs only to a resolved availability review, uses fixed dates and returns to the same canonical review',()=>{
 draw();expect(button('Reorder workouts ')).toBeUndefined();review();expect(button('Reorder workouts ')).toBeDefined();const baseline=current;
 click('Reorder workouts ');expect(document.querySelector('h1').textContent).toBe('Reorder workouts');expect(slots().map(node=>node.dataset.dateSlot)).toEqual(['2026-10-05','2026-10-07','2026-10-11']);
 keyboardMove('Upper B','ArrowUp');keyboardMove('Upper B','ArrowUp');expect(slots().map(node=>node.querySelector('strong').textContent)).toEqual(['Upper B','Upper A','Lower A']);expect(document.activeElement).toBe(grip('Upper B'));expect(current).toBe(baseline);expect(updateSpy).not.toHaveBeenCalled();expect(localStorage.length).toBe(0);
 click('REVIEW SCHEDULE');expect(document.querySelector('h1').textContent).toBe('Review your schedule');expect([...document.querySelectorAll('.flexible-week-review article')].find(node=>node.querySelector('strong').textContent==='Upper B').textContent).toContain('Mon, Oct 5');expect(button('EDIT DAYS')).toBeDefined();expect(button('Reorder workouts ')).toBeDefined();
 click('USE THIS SCHEDULE');expect(updateSpy).toHaveBeenCalledTimes(1);expect(document.querySelector('.rook-snackbar').textContent).toBe('Schedule updatedUndo');expect(Object.values(current.flexibleWeek.sessions).find(row=>row.name==='Upper B').scheduledDate).toBe('2026-10-05');click('Undo');expect(current.flexibleWeek.sessions).toEqual({});expect(current.program).toEqual(baseline.program);
});
it('accessible move controls are disclosed by the same grip, maintain limits and announce the destination',()=>{
 draw();review();click('Reorder workouts ');act(()=>grip('Upper A').click());expect(button('Move earlier').disabled).toBe(true);click('Move later');expect(slots()[1].querySelector('strong').textContent).toBe('Upper A');expect(document.querySelector('.visually-hidden[role="status"]').textContent).toContain('Upper A moved to Wed, Oct 7');expect(button('Move earlier').disabled).toBe(false);
});
it('closing the reordered draft writes nothing; Back and Edit days do not commit',()=>{
 draw();review();click('Reorder workouts ');keyboardMove('Upper B','ArrowUp');click('Back');expect(document.querySelector('h1').textContent).toBe('Review your schedule');click('EDIT DAYS');click('REVIEW SCHEDULE');expect([...document.querySelectorAll('.flexible-week-review article')].find(node=>node.querySelector('strong').textContent==='Upper B').textContent).toContain('Wed, Oct 7');click('CANCEL');expect(current.flexibleWeek).toBeNull();expect(updateSpy).not.toHaveBeenCalled();expect(localStorage.length).toBe(0);
});
it('one workout or unresolved capacity never opens a meaningless reorder view',()=>{
 const state=adjustWeekReorderState();state.program.days=state.program.days.slice(0,1);draw(state);review();expect(button('Reorder workouts ')).toBeUndefined();
});
it('changing available days recalculates automatic placement and retains unresolved choices',()=>{
 draw();review();click('Reorder workouts ');keyboardMove('Upper B','ArrowUp');click('Back');click('EDIT DAYS');act(()=>document.querySelector('[data-available-date="2026-10-11"]').click());click('REVIEW SCHEDULE');expect(button('Reorder workouts ')).toBeUndefined();expect(button('USE THIS SCHEDULE').disabled).toBe(true);expect(button('MOVE LATER ›')).toBeDefined();expect(button('Skip this workout')).toBeDefined();
});
it('external revision while dragging/editor open returns to canonical review and cannot Apply stale assignments',()=>{
 draw();review();click('Reorder workouts ');keyboardMove('Upper B','ArrowUp');change(state=>({...state,flexibleWeek:{schemaVersion:1,revision:9,generation:'remote',sessions:{}}}));expect(document.querySelector('h1').textContent).toBe('Review your schedule');expect(button('Reorder workouts ')).toBeUndefined();expect(document.querySelector('[role="alert"]').textContent).toContain('changed');click('USE THIS SCHEDULE');expect(current.flexibleWeek.generation).toBe('remote');expect(updateSpy).not.toHaveBeenCalled();click('EDIT DAYS');click('REVIEW SCHEDULE');expect(button('Reorder workouts ')).toBeDefined();
});
function pointer(type,target,y){const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:1,pointerType:'mouse',button:0,clientX:270,clientY:y});act(()=>target.dispatchEvent(event));}
function geometry(){const list=document.querySelector('.flexible-reorder-list');list.getBoundingClientRect=()=>({top:100,bottom:400,left:20,right:300,width:280,height:300});slots().forEach((slot,index)=>{slot.querySelector('.flexible-reorder-body').getBoundingClientRect=()=>({top:130+index*90,bottom:178+index*90,left:20,right:300,width:280,height:48});});return list;}
it.each(['pointerup','pointercancel','lostpointercapture'])('shared long-press %s clears preview/placeholder; only drop changes draft',end=>{
 draw();review();click('Reorder workouts ');const list=geometry(),handle=grip('Upper B');pointer('pointerdown',handle,334);act(()=>vi.advanceTimersByTime(300));expect(document.querySelector('.flexible-reorder-preview')).not.toBeNull();expect(list.querySelector('.reorder-live-source')).not.toBeNull();pointer('pointermove',window,134);expect(slots().map(node=>node.dataset.dateSlot)).toEqual(['2026-10-05','2026-10-07','2026-10-11']);expect(slots().every(slot=>!slot.style.transform&&!slot.querySelector('.eyebrow').style.transform)).toBe(true);
 pointer(end,window,134);expect(document.querySelector('.flexible-reorder-preview')).toBeNull();expect(list.querySelector('.reorder-live-source')).toBeNull();expect([...list.querySelectorAll('.flexible-reorder-body')].every(node=>!node.style.transform)).toBe(true);expect(slots()[0].querySelector('strong').textContent).toBe(end==='pointerup'?'Upper B':'Upper A');expect(updateSpy).not.toHaveBeenCalled();
});
it('vertical scroll before pickup and unmount while held never mutate the schedule',()=>{
 draw();review();click('Reorder workouts ');geometry();const handle=grip('Upper B');pointer('pointerdown',handle,334);pointer('pointermove',window,304);act(()=>vi.advanceTimersByTime(350));expect(document.querySelector('.flexible-reorder-preview')).toBeNull();pointer('pointerup',window,304);expect(slots()[0].querySelector('strong').textContent).toBe('Upper A');
 pointer('pointerdown',handle,334);act(()=>vi.advanceTimersByTime(300));click('Close');expect(document.querySelector('.flexible-reorder-preview')).toBeNull();expect(current.flexibleWeek).toBeNull();expect(updateSpy).not.toHaveBeenCalled();
});
it('a wrapped workout name reserves enough space in every fixed slot, without truncating the name',()=>{
 const original=HTMLElement.prototype.getBoundingClientRect;
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return this.matches('.flexible-reorder-body > strong')&&this.textContent.includes('Long')?{...original.call(this),height:101}:original.call(this);});
 const state=adjustWeekReorderState();state.program.days[2].name='Long workout name with several lines';draw(state);review();click('Reorder workouts ');
 expect(document.querySelector('.flexible-reorder-list').style.getPropertyValue('--flexible-reorder-row-height')).toBe('101px');keyboardMove(state.program.days[2].name,'ArrowUp');expect(slots()[1].querySelector('strong').textContent).toBe(state.program.days[2].name);
});
it('an external revision during pickup cancels the shared drag owner before returning to review',()=>{
 draw();review();click('Reorder workouts ');geometry();pointer('pointerdown',grip('Upper B'),334);act(()=>vi.advanceTimersByTime(300));expect(document.querySelector('.flexible-reorder-preview')).not.toBeNull();
 change(state=>({...state,flexibleWeek:{schemaVersion:1,revision:9,generation:'remote',sessions:{}}}));expect(document.querySelector('.flexible-reorder-preview')).toBeNull();expect(document.querySelector('.reorder-live-source')).toBeNull();expect(document.querySelector('h1').textContent).toBe('Review your schedule');pointer('pointerup',window,134);expect(current.flexibleWeek.generation).toBe('remote');expect(updateSpy).not.toHaveBeenCalled();
});
