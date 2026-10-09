// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout,Detail} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import * as domain from './domain.js';
import {addFreestyleExercise,startFreestyleWorkout} from './freestyleWorkout.js';
let host,root,current;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('scrollTo',()=>{});HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.getAnimations=()=>[];
 vi.spyOn(domain,'saveState').mockReturnValue(true);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(id){
 let s=createReturningUserFixture(0);s.profile.showExerciseImages=false;
 s=addFreestyleExercise(addFreestyleExercise(startFreestyleWorkout(s),id),'seated-cable-row');
 return s;
}
function mount(initial){
 function Harness(){const [state,setState]=useState(initial),[detail,setDetail]=useState(null);current=state;
  const update=fn=>setState(old=>fn(structuredClone(old)));
  return <><ActiveWorkout state={state} update={update} setDetail={setDetail} setPage={()=>{}}/>
   {detail&&<Detail detail={detail} state={state} update={update} setDetail={setDetail} close={()=>setDetail(null)}/>}</>;
 }
 act(()=>root.render(<Harness/>));
}
const button=text=>[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===text||b.textContent.trim().startsWith(text));
const click=text=>{expect(button(text),text).toBeTruthy();act(()=>button(text).click());};
const open=()=>{click('Exercise options');click('Edit logging setup');expect(host.querySelector('.active-logging-setup-sheet')).toBeTruthy();};
it.each(['bodyweight-split-squat','one-arm-dumbbell-row'])('real menu changes %s only in this session, returns to logger, and serializes the override',id=>{
 const s=fixture(id);mount(s);const before=structuredClone(current);open();click('Reps per side');
 expect(host.querySelector('.active-logging-setup-sheet')).toBeNull();expect(host.querySelector('.set-row.per-side')).toBeTruthy();
 expect(current.activeWorkout.exercises[0].loggingMode).toBe('per_side');expect(current.program).toEqual(before.program);
 expect(current.workouts).toEqual(before.workouts);expect(current.savedWorkoutTemplates).toEqual(before.savedWorkoutTemplates);
 expect(current.activeWorkout.exercises.slice(1)).toEqual(before.activeWorkout.exercises.slice(1));
 expect(current.activeWorkout.exercises[0].id).toBe(before.activeWorkout.exercises[0].id);
 expect(domain.deserializeState(domain.serializeState(current)).activeWorkout.exercises[0].loggingMode).toBe('per_side');
 open();click('Total reps');expect(host.querySelector('.set-row.per-side')).toBeNull();
 expect(current.activeWorkout.exercises[0].loggingMode).toBe('normal');expect(domain.saveState).toHaveBeenCalledTimes(2);
});
it.each(['touched','completed','side'])('keeps the menu reachable but blocks reinterpretation after %s data',kind=>{
 const s=fixture('bodyweight-split-squat'),ex=s.activeWorkout.exercises[0];ex.loggingMode='per_side';
 if(kind==='side')ex.sets[0].sides={left:{reps:7},right:{reps:null}};else ex.sets[0][kind]=true;
 mount(s);const before=structuredClone(current);open();expect(button('Total reps').disabled).toBe(true);
 expect(host.querySelector('#logging-setup-locked').textContent).toContain('will not be reinterpreted');click('Total reps');
 expect(current).toEqual(before);expect(domain.saveState).not.toHaveBeenCalled();
});
it('does not publish a mode change when persistence fails',()=>{
 mount(fixture('one-arm-dumbbell-row'));const before=structuredClone(current);open();vi.mocked(domain.saveState).mockReturnValueOnce(false);
 click('Reps per side');expect(current).toEqual(before);expect(host.querySelector('.active-logging-setup-sheet [role="alert"]').textContent).toContain('Could not save');
});

it('Rear Delt Fly per-side -> Total reps -> reload -> per-side keeps the same menu and exercise/set identities',()=>{
 const s=fixture('dumbbell-rear-delt-fly');s.activeWorkout.exercises[0].loggingMode='per_side';mount(domain.deserializeState(domain.serializeState(s),{strict:true}));const before=structuredClone(current);
 open();click('Total reps');expect(host.querySelector('.set-row.per-side')).toBeNull();
 const saved=domain.deserializeState(domain.serializeState(current),{strict:true});act(()=>root.render(null));mount(saved);
 open();click('Reps per side');expect(host.querySelector('.set-row.per-side')).toBeTruthy();expect(current.activeWorkout.exercises[0].id).toBe(before.activeWorkout.exercises[0].id);
 expect(current.activeWorkout.exercises[0].sets.map(s=>s.id)).toEqual(before.activeWorkout.exercises[0].sets.map(s=>s.id));expect(current.program).toEqual(before.program);expect(current.workouts).toEqual(before.workouts);
});
