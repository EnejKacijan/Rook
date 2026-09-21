// @vitest-environment jsdom
import React,{act,useState,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout,ActiveWorkoutOptions,UpNextExerciseOptions} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import * as domain from './domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {bindNavigationFocus} from './navigationFocus.js';
import {repeatedRestartFixture} from './restartWorkout.fixture.js';
let host,root,current,detail,dispose;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});
 vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.getAnimations=()=>[];
 host=document.createElement('div');document.body.append(host);root=createRoot(host);dispose=bindNavigationFocus();
});
afterEach(()=>{act(()=>root.unmount());dispose();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function fixture(kind='planned',changed=true){let s=createReturningUserFixture(0);s.profile.showExerciseImages=false;s.profile.restTimerEnabled=true;
 if(kind==='freestyle'){s=startFreestyleWorkout(s);for(const id of ['barbell-bench-press','cable-fly','barbell-row'])s=addFreestyleExercise(s,id);}
 else s.activeWorkout=domain.startWorkout(s,s.program.days[0]);
 s.activeWorkout.startedAt-=100000;
 if(changed){Object.assign(s.activeWorkout.exercises[0].sets[0],{weight:62.5,reps:10,rir:2,touched:true,completed:true,completedAt:Date.now()-5000});s.activeWorkout.rest={endsAt:Date.now()+90000,seconds:90};}return s;
}
function mount(s){function Harness(){const[state,setState]=useState(s),[open,setOpen]=useState(null);current=state;detail=open;
 return <><ActiveWorkout state={state} update={fn=>setState(prev=>fn(structuredClone(prev)))} setPage={()=>{}} setDetail={setOpen}/>
 {open?.workoutOptions&&<ActiveWorkoutOptions workout={state.activeWorkout} onRestart={open.onRestart} close={()=>setOpen(null)}/>}
 {open?.upNextOptions&&<UpNextExerciseOptions workout={state.activeWorkout} request={open.upNextOptions} onMoveUpNext={open.onMoveUpNext} onRemoveUpNext={open.onRemoveUpNext} close={()=>setOpen(null)}/>}</>;}
 act(()=>root.render(<StrictMode><Harness/></StrictMode>));
}
const click=node=>act(()=>node.click());
const button=name=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===name||b.getAttribute('aria-label')===name);
const open=()=>click(button('Workout options'));
const request=()=>click(host.querySelector('.workout-restart-option'));
it.each(['planned','freestyle'])('%s menu contains only Restart; Cancel retains the exact session and restores focus',kind=>{
 mount(fixture(kind));const before=structuredClone(current);open();
 const sheet=host.querySelector('.active-workout-options-sheet');expect(sheet.querySelectorAll('.sheet-scroll button')).toHaveLength(1);
 expect(sheet.textContent).not.toMatch(/autosave|saved automatically|UP NEXT|Save as template|Move up/i);
 request();expect(document.activeElement.textContent).toBe('Cancel');expect(host.querySelector('.workout-restart-danger').classList.contains('danger')).toBe(true);
 click(button('Cancel'));expect(current).toEqual(before);expect(document.activeElement).toBe(host.querySelector('.workout-restart-option'));
});
it.each(['planned','freestyle'])('%s confirmation saves before publishing, restarts once on double submit, and retains identity',kind=>{
 mount(fixture(kind));const before=structuredClone(current),restart=vi.spyOn(domain,'restartActiveWorkout'),save=vi.spyOn(domain,'saveState');open();request();
 const confirm=host.querySelector('.workout-restart-danger');act(()=>{confirm.click();confirm.click();});
 expect(restart).toHaveBeenCalledOnce();expect(save).toHaveBeenCalledOnce();expect(detail).toBeNull();
 expect(current.activeWorkout.id).toBe(before.activeWorkout.id);expect(current.activeWorkout.startedAt).toBe(Date.now());expect(current.activeWorkout.rest).toBeNull();
 expect(domain.workoutSetSummary(current.activeWorkout).completed).toBe(0);expect(current.program).toEqual(before.program);expect(current.workouts).toEqual(before.workouts);
 expect(domain.loadState().activeWorkout.id).toBe(before.activeWorkout.id);expect(domain.activeWorkoutCanRestart(current.activeWorkout)).toBe(false);
});
it('failed persistence keeps the original live session, confirmation and rest timer; retry succeeds',()=>{
 mount(fixture());const before=structuredClone(current),save=vi.spyOn(domain,'saveState').mockReturnValueOnce(false);open();request();click(host.querySelector('.workout-restart-danger'));
 expect(current).toEqual(before);expect(host.querySelector('[role="alert"]').textContent).toContain('Your workout is unchanged');expect(detail.workoutOptions).toBe(true);
 click(host.querySelector('.workout-restart-danger'));expect(save).toHaveBeenCalledTimes(2);expect(detail).toBeNull();expect(current.activeWorkout.rest).toBeNull();
});
it('a pristine workout retains the header menu with Restart disabled',()=>{
 mount(fixture('planned',false));expect(button('Workout options').disabled).toBe(false);open();expect(host.querySelector('.workout-restart-option').disabled).toBe(true);
});
it('recording reproduction: restart removes both Started labels, preserves prepared values, and stays clean after reload',()=>{
 const s=repeatedRestartFixture({legacySnapshot:true});mount(s);
 expect(host.querySelector('.up-next-queue').textContent).toContain('Hack Squat');
 expect(host.querySelector('.up-next-queue').textContent).toContain('Single-Leg Leg Extension');
 expect(host.querySelectorAll('.up-next-note')).toHaveLength(2);
 const id=s.activeWorkout.id;open();request();click(host.querySelector('.workout-restart-danger'));
 expect(host.querySelectorAll('.up-next-note')).toHaveLength(0);
 expect(host.querySelector('.workout-header').textContent).toContain('0 / 14 sets');
 expect(current.activeWorkout.exercises[0].sets.map(s=>[s.weight,s.reps])).toEqual([[165,11],[165,11],[100,11]]);
 const reloaded=domain.loadState();expect(reloaded.activeWorkout.id).toBe(id);
 act(()=>root.render(null));mount(reloaded);
 expect(host.querySelectorAll('.up-next-note')).toHaveLength(0);
 expect(button('Cancel repeated workout')).toBeTruthy();
});
it('freestyle confirmation describes the empty reset and renders a usable empty session',()=>{
 mount(fixture('freestyle'));open();request();
 expect(host.querySelector('#restart-workout-detail').textContent).toContain('empty freestyle workout');
 click(host.querySelector('.workout-restart-danger'));
 expect(host.querySelector('.freestyle-empty h1').textContent).toBe('No exercises yet');
 expect(current.activeWorkout.exercises).toEqual([]);expect(domain.loadState().activeWorkout.exercises).toEqual([]);
 expect(button('Finish').disabled).toBe(true);expect(host.querySelector('.rest-timer')).toBeNull();
});
it('handle tap opens only that instance; contextual move/remove uses the same durable operations and Undo',()=>{
 mount(fixture());const initial=structuredClone(current),ids=initial.activeWorkout.exercises.map(e=>e.id);
 click(host.querySelectorAll('.up-next-queue .rook-reorder-handle')[0]);expect(detail.upNextOptions.exerciseId).toBe(ids[1]);expect(button('Move up').disabled).toBe(true);
 click(button('Move down'));expect(current.activeWorkout.exercises[2].id).toBe(ids[1]);expect(current.activeWorkout.exercises[0]).toEqual(initial.activeWorkout.exercises[0]);
 click([...host.querySelectorAll('.up-next-queue .rook-reorder-handle')].find(b=>b.dataset.exerciseId===ids[1]));click(button('Remove from this workout'));
 expect(current.activeWorkout.exercises.some(e=>e.id===ids[1])).toBe(false);click(button('Undo'));expect(current.activeWorkout.exercises[2].id).toBe(ids[1]);expect(current.program).toEqual(initial.program);
});
it('restart clears the removal Undo and tombstones',()=>{
 mount(fixture());click(host.querySelector('.up-next-queue [data-swipe-fallback]'));expect(button('Undo')).toBeTruthy();open();request();click(host.querySelector('.workout-restart-danger'));
 expect(button('Undo')).toBeUndefined();expect(current.activeWorkout.removedUpNextExercises).toBeUndefined();
});
it('the row fallback respects last-item and protected-instance boundaries',()=>{
 const s=fixture(),workout=s.activeWorkout,last=workout.exercises.at(-1),render=()=>act(()=>root.render(<UpNextExerciseOptions workout={workout} request={{sessionId:workout.id,exerciseId:last.id}} close={()=>{}}/>));render();
 expect(button('Move down').disabled).toBe(true);expect(button('Move up').disabled).toBe(false);
 last.sets[0].touched=true;render();expect(button('Move up')).toBeUndefined();expect(button('Remove from this workout')).toBeUndefined();
});
