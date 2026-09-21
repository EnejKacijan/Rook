import React,{act,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Detail,ModalLayer} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import * as domain from './domain.js';
import {semanticBackSurface} from './useSemanticSwipeBack.js';

let host,root,current,route,target,initial,closed,navigate,persist;
const detail=()=>document.querySelector('.completed-workout-detail');
const options=()=>document.querySelector('.completed-workout-options-sheet');
const trigger=()=>detail().querySelector('[aria-label="Workout options"]');
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const click=node=>act(()=>node.click());
const settle=()=>{act(()=>vi.advanceTimersByTime(240));act(()=>vi.advanceTimersByTime(40));};
const choose=text=>{click(trigger());click(button(text));settle();};
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-20T12:00:00'));
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{width:100,height:44}]);
 HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.getAnimations=()=>[];
 initial=createReturningUserFixture(2);initial.activeWorkout=null;initial.todayAdaptation=null;
 target=initial.workouts[0];target.sessionNote='Keep this note';
 initial.workouts[1].name=target.name;
 persist=vi.spyOn(domain,'saveState').mockReturnValue(true);closed=vi.fn();navigate=vi.fn();
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function mount(){
 function Harness(){
  const[state,setState]=useState(initial),[selection,setSelection]=useState({completedWorkout:target.id});const background=useRef(null);
  current=state;route=selection;
  const close=()=>{closed();setSelection(null);};
  return <><div ref={background}><button>Today</button></div>{selection&&<ModalLayer close={close} backgroundRef={background}>{requestClose=><Detail detail={selection} state={state} update={fn=>setState(s=>fn(structuredClone(s)))} close={requestClose} setDetail={next=>{navigate(next);setSelection(next);}} setPage={navigate}/>}</ModalLayer>}</>;
 }
 act(()=>root.render(<Harness/>));settle();
}
function back(){const child=document.querySelector('.modal-layer > main');const selected=semanticBackSurface(child);expect(selected?.button).toBe(child.querySelector('.detail-header-back'));click(selected.button);settle();}
function parent(){expect(route).toEqual({completedWorkout:target.id});expect(detail()?.querySelector('h1').textContent).toBe(target.name);expect(closed).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();expect(document.querySelectorAll('.modal-layer')).toHaveLength(1);}
it('Save Back keeps the parent route, templates, history and current workout; semantic edge Back selects the same action',()=>{
 mount();const before=structuredClone(current);detail().scrollTop=113;
 choose('Save as template');expect(document.querySelector('.saved-workouts')).not.toBeNull();back();parent();
 expect(current).toEqual(before);expect(persist).not.toHaveBeenCalled();expect(detail().scrollTop).toBe(113);expect(document.activeElement).toBe(trigger());
});
it('successful template save persists exactly once, returns to the same detail and announces success',()=>{
 mount();const history=structuredClone(current.workouts),plan=structuredClone(current.program);
 choose('Save as template');click(button('Save template'));settle();parent();
 expect(persist).toHaveBeenCalledTimes(1);expect(current.savedWorkoutTemplates).toHaveLength(1);expect(current.workouts).toEqual(history);expect(current.program).toEqual(plan);expect(current.activeWorkout).toBeNull();
 expect(detail().querySelector('[role="status"]').textContent).toBe('Workout template saved');
});
it('failed template save stays in the child and retry returns to the parent',()=>{
 mount();choose('Save as template');persist.mockReturnValueOnce(false);click(button('Save template'));
 expect(detail()).toBeNull();expect(current.savedWorkoutTemplates).toEqual([]);expect(document.querySelector('[role="alert"]').textContent).toContain('Could not save');expect(closed).not.toHaveBeenCalled();
 click(button('Save template'));settle();parent();expect(current.savedWorkoutTemplates).toHaveLength(1);
});
it('Save Back after reviewing template exercises still returns to the completed parent without saving the draft',()=>{
 mount();const before=structuredClone(current);choose('Save as template');click(button('Edit exercises'));click(button('REVIEW TEMPLATE'));back();parent();expect(current).toEqual(before);expect(persist).not.toHaveBeenCalled();
});
it('Edit Back preserves the existing correct path and a successful correction returns to the same workout',()=>{
 mount();const before=structuredClone(current);choose('Edit history');back();parent();expect(current).toEqual(before);
 choose('Edit history');click(button('Harder than expected'));click(button('REVIEW CHANGES'));click(button('SAVE CHANGES'));settle();parent();
 expect(current.workouts[0].id).toBe(target.id);expect(current.workouts[0].completedAt).toBe(target.completedAt);expect(current.workouts[0].sessionFeedback).toBe('harder');expect(current.program).toEqual(before.program);
});
it('Edit Back retains the existing dirty-draft confirmation before returning to its parent',()=>{
 mount();const before=structuredClone(current);choose('Edit history');click(button('Harder than expected'));back();
 expect(document.querySelector('.history-correction-confirm').textContent).toContain('Discard changes?');expect(detail()).toBeNull();expect(closed).not.toHaveBeenCalled();
 click(button('KEEP EDITING'));expect(button('Harder than expected').getAttribute('aria-pressed')).toBe('true');back();click(button('DISCARD CHANGES'));settle();parent();expect(current).toEqual(before);expect(persist).not.toHaveBeenCalled();
});
it('independent Save as template retains its original Back-to-close behavior',()=>{
 act(()=>root.render(<Detail detail={{saveWorkoutTemplate:{workoutId:target.id}}} state={initial} update={vi.fn()} close={closed} setDetail={navigate}/>));
 click(document.querySelector('.saved-workouts .detail-header-back'));expect(closed).toHaveBeenCalledOnce();expect(navigate).not.toHaveBeenCalled();expect(persist).not.toHaveBeenCalled();
});
it.each(['Back','CANCEL'])('Repeat %s returns to the parent without creating an adjustment/session',method=>{
 mount();const before=structuredClone(current);choose('Repeat today');expect(document.querySelector('.use-workout-today-sheet')).not.toBeNull();
 if(method==='Back')back();else{click(button('CANCEL'));settle();}parent();expect(current).toEqual(before);expect(persist).not.toHaveBeenCalled();
});
it('Repeat APPLY retains the existing domain operation and closes the details stack',()=>{
 initial.program=null;mount();const history=structuredClone(current.workouts);choose('Repeat today');click(button('APPLY'));settle();
 expect(current.todayAdaptation.mode).toBe('repeat');expect(current.workouts).toEqual(history);expect(route).toBeNull();expect(closed).toHaveBeenCalledOnce();
});
it.each(['close','back','backdrop','escape','handle'])('options %s dismissal preserves the mounted detail, log, scroll, state and focus',method=>{
 mount();const panel=detail(),note=panel.querySelector('textarea'),log=panel.querySelector('.session-log-trigger'),before=structuredClone(current);
 click(log);panel.scrollTop=147;click(trigger());settle();expect(panel.inert).toBe(true);expect(trigger().getAttribute('aria-expanded')).toBe('true');
 expect([...options().querySelectorAll('.list-row')].map(n=>n.textContent)).toEqual(['Save as template','Repeat today','Edit history','Delete workout']);
 if(method==='backdrop')click(options().parentElement);
 else if(method==='escape')act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));
 else click(options().querySelector(method==='close'?'.detail-header-close':method==='back'?'.detail-header-back':'.modal-drag-handle'));
 settle();parent();expect(detail()).toBe(panel);expect(panel.scrollTop).toBe(147);expect(note.isConnected).toBe(true);expect(log.getAttribute('aria-expanded')).toBe('true');expect(panel.inert).toBe(false);expect(document.activeElement).toBe(trigger());expect(current).toEqual(before);expect(persist).not.toHaveBeenCalled();
});
it.each(['activeWorkout','activeOptionalSession'])('keeps %s Repeat/Delete guards and exposes explanations only in options',key=>{
 initial[key]={id:'active'};mount();expect(detail().textContent).not.toContain('before deleting history');click(trigger());
 const rows=[...options().querySelectorAll('.list-row')];expect(rows[0].disabled).toBe(false);expect(rows[1].disabled).toBe(true);expect(rows[1].textContent).toContain('active workout');expect(rows[2].disabled).toBe(false);expect(rows[3].disabled).toBe(true);expect(rows[3].textContent).toContain('before deleting history');
});
it.each(['Save as template','Edit history','Repeat today'])('%s explicit Close still closes the complete stack',action=>{
 mount();choose(action);click(document.querySelector('.modal-layer > main .detail-header-close'));settle();expect(route).toBeNull();expect(closed).toHaveBeenCalledOnce();
});
