// @vitest-environment jsdom
import React,{act,useState,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import * as domain from './domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {interactionFeedback} from './interactionFeedback.js';

let host,root,current,feedback;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
 vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});
 vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.getAnimations=()=>[];
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){const row=this.closest('[data-reorder-block-index]');const top=row?200+Number(row.dataset.reorderBlockIndex)*60:0,height=row?60:700;return {left:0,top,right:390,bottom:top+height,width:390,height};});
 feedback=Object.fromEntries(['pickup','selection','drop','threshold'].map(name=>[name,vi.spyOn(interactionFeedback,name).mockImplementation(()=>{})]));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function initial(kind){let s=createReturningUserFixture(0);s.profile.showExerciseImages=false;s.profile.restTimerEnabled=false;
 if(kind==='planned')s.activeWorkout=domain.startWorkout(s,s.program.days[0]);
 else {s=startFreestyleWorkout(s);for(const id of ['barbell-bench-press','cable-fly','barbell-row','plank'])s=addFreestyleExercise(s,id);}
 s.activeWorkout.exercises=s.activeWorkout.exercises.slice(0,4);return s;
}
function mount(s,strict=true){function Harness(){const[state,setState]=useState(s);current=state;return <ActiveWorkout state={state} update={fn=>setState(prev=>fn(structuredClone(prev)))} setPage={()=>{}} setDetail={()=>{}}/>;}act(()=>root.render(strict?<StrictMode><Harness/></StrictMode>:<Harness/>));}
const handles=()=>[...host.querySelectorAll('.up-next-queue .rook-reorder-handle')];
function touch(type,target,x,y){const e=new Event(type,{bubbles:true,cancelable:true}),p={identifier:1,clientX:x,clientY:y};Object.assign(e,{touches:['touchend','touchcancel'].includes(type)?[]:[p],changedTouches:[p]});act(()=>target.dispatchEvent(e));return e;}
function lastToFirst(){const last=handles().at(-1),y=last.getBoundingClientRect().top+30;
 touch('touchstart',last,360,y);expect(feedback.pickup).not.toHaveBeenCalled();
 touch('touchmove',last,360,y-15);expect(feedback.pickup).toHaveBeenCalledOnce();
 expect(host.querySelector('.queue-reorder-preview')).not.toBeNull();
 touch('touchmove',last,360,220);touch('touchend',last,360,220);
}
it.each(['planned','freestyle'])('StrictMode %s: last-to-first works before any set/input/advance, persists and follows the new queue',kind=>{
 const s=initial(kind),before=structuredClone(s),ids=s.activeWorkout.exercises.map(e=>e.id),save=vi.spyOn(domain,'saveState');mount(s);
 expect(domain.workoutSetSummary(current.activeWorkout).completed).toBe(0);lastToFirst();
 expect(current.activeWorkout.exercises.map(e=>e.id)).toEqual([ids[0],ids[3],ids[1],ids[2]]);
 expect(save).toHaveBeenCalledOnce();expect(current.activeWorkout.exerciseIndex).toBe(0);expect(current.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);
 expect(feedback.pickup).toHaveBeenCalledOnce();expect(feedback.selection).toHaveBeenCalledOnce();expect(feedback.drop).toHaveBeenCalledOnce();
 expect(current.program).toEqual(before.program);expect(domain.workoutSetSummary(current.activeWorkout)).toEqual(domain.workoutSetSummary(before.activeWorkout));
 expect(current.activeWorkout.exercises.map(e=>e.id).sort()).toEqual(ids.toSorted());
 const restored=domain.loadState();expect(restored.activeWorkout.exercises.map(e=>e.id)).toEqual([ids[0],ids[3],ids[1],ids[2]]);
 act(()=>root.render(null));mount(restored);expect(handles().map(h=>h.dataset.exerciseId)).toEqual([ids[3],ids[1],ids[2]]);
 act(()=>{window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));});expect(current.activeWorkout.exercises.map(e=>e.id)).toEqual([ids[0],ids[3],ids[1],ids[2]]);
 const next=[...host.querySelectorAll('button')].find(b=>b.textContent.trim()==='NEXT EXERCISE →');act(()=>next.click());
 const skip=[...document.querySelectorAll('.workout-confirm-actions button')].find(b=>/^SKIP INCOMPLETE/.test(b.textContent.trim()));expect(skip).toBeTruthy();act(()=>skip.click());act(()=>vi.advanceTimersByTime(1000));
 expect(current.activeWorkout.exercises[current.activeWorkout.exerciseIndex].id).toBe(ids[3]);
 // The same gesture remains bound after the current exercise changes.
 Object.values(feedback).forEach(spy=>spy.mockClear());const afterAdvance=structuredClone(current.activeWorkout);lastToFirst();
 expect(current.activeWorkout.exercises.map(e=>e.id)).toEqual([ids[0],ids[3],ids[2],ids[1]]);
 expect(current.activeWorkout.exercises[1]).toEqual(afterAdvance.exercises[1]);
});

it('a failed first reorder write leaves the queue and current exercise unchanged',()=>{
 const s=initial('planned'),before=structuredClone(s.activeWorkout);vi.spyOn(domain,'saveState').mockReturnValue(false);mount(s);lastToFirst();
 expect(current.activeWorkout).toEqual(before);expect(feedback.drop).not.toHaveBeenCalled();expect(host.textContent).toContain('Could not save');
 expect(host.querySelector('.queue-reorder-preview')).toBeNull();
});

it('pickup uses an inert copy of the actual row, retaining notes; cancel never publishes order',()=>{
 const s=initial('freestyle');s.activeWorkout.exercises[3].personalNote='A longer note with a deliberately steady tempo';const before=structuredClone(s.activeWorkout);mount(s);
 const last=handles().at(-1),y=last.getBoundingClientRect().top+30,source=last.closest('[data-swipe-row]');
 touch('touchstart',last,360,y);expect(feedback.pickup).not.toHaveBeenCalled();touch('touchmove',last,360,y-15);
 const preview=host.querySelector('.queue-reorder-preview');expect(preview.hasAttribute('inert')).toBe(true);
 expect(preview.querySelector('.up-next-main').textContent).toBe(source.querySelector('.up-next-main').textContent);
 expect(preview.querySelector('.up-next-prescription').textContent).toBe(source.querySelector('.up-next-prescription').textContent);
 expect(preview.querySelector('[data-reorder-kind],[data-exercise-id],[id],[data-swipe-row]')).toBeNull();
 expect(current.activeWorkout).toEqual(before);touch('touchcancel',last,360,y-15);
 expect(current.activeWorkout).toEqual(before);expect(host.querySelector('.queue-reorder-preview')).toBeNull();expect(feedback.drop).not.toHaveBeenCalled();
});

it.each(['.up-next-main','.up-next-prescription','.rook-reorder-handle'])('first-exercise horizontal remove from %s preserves current/plan and supports Undo',selector=>{
 const s=initial('planned'),before=structuredClone(s),removed=s.activeWorkout.exercises[1].id;mount(s);
 const row=handles()[0].closest('[data-swipe-row]'),target=row.querySelector(selector);
 touch('touchstart',target,360,230);touch('touchmove',target,130,230);touch('touchend',target,130,230);act(()=>vi.advanceTimersByTime(600));
 expect(current.activeWorkout.exercises.map(e=>e.id)).toEqual(before.activeWorkout.exercises.filter(e=>e.id!==removed).map(e=>e.id));
 expect(current.activeWorkout.exercises[0]).toEqual(before.activeWorkout.exercises[0]);expect(current.program).toEqual(before.program);expect(feedback.pickup).not.toHaveBeenCalled();
 const undo=[...host.querySelectorAll('button')].find(b=>b.textContent==='Undo');act(()=>undo.click());expect(current.activeWorkout.exercises).toEqual(before.activeWorkout.exercises);
});
