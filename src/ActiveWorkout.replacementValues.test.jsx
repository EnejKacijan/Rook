import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout,Detail} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,serializeState,deserializeState,previousExercise,saveState} from './domain.js';

vi.mock('./domain.js',async original=>({...await original(),saveState:vi.fn(()=>true)}));
let host,root,current,mutate;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();sessionStorage.clear();
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 saveState.mockReset().mockReturnValue(true);host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function fixture(){const s=createReturningUserFixture(0);Object.assign(s.profile,{showExerciseImages:false,restTimerEnabled:false});
 s.activeWorkout=startWorkout(s,s.program.days[0]);s.activeWorkout.exerciseIndex=1;const e=s.activeWorkout.exercises[1];
 e.sets=e.sets.slice(0,2).map(set=>({...set,weight:null,reps:9,completed:false}));e.repMin=e.repMax=9;
 const prior=structuredClone(e);prior.exerciseId='t-bar-row';prior.loggingMode='normal';
 prior.sets=prior.sets.map((set,i)=>({...set,weight:i?45:40,reps:i?8:10,rir:2,completed:true}));
 s.workouts=[{id:'previous-tbar',name:'Upper A',completedAt:new Date(Date.now()-86400000).toISOString(),durationSeconds:3600,exercises:[prior]}];return s;}
function mount(initial=fixture()){function Harness(){const[state,setState]=useState(initial),[detail,setDetail]=useState(null);current=state;
 mutate=fn=>setState(s=>fn(structuredClone(s)));return <><ActiveWorkout state={state} update={mutate} setPage={()=>{}} setDetail={setDetail}/>
 {detail&&<Detail detail={detail} state={state} update={mutate} close={()=>setDetail(null)} setDetail={setDetail} setPage={()=>{}}/>}</>;}act(()=>root.render(<Harness/>));}
const entry=()=>current.activeWorkout.exercises[current.activeWorkout.exerciseIndex];
const click=node=>act(()=>node.click());
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text&&!b.closest('[inert]'));
const use=()=>host.querySelector('.freestyle-copy');
const openUse=()=>{if(use())return use();click(host.querySelector('.exercise-options-button'));click(button('Use previous values'));act(()=>vi.advanceTimersByTime(20));return document.querySelector('.previous-values-apply');};
const input=field=>host.querySelector(`[data-set-id="${entry().sets[0].id}"] [data-workout-field="${field}"] input`);
const type=(node,value)=>{act(()=>node.focus());act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});};
async function replace(name){click(button('Replace'));await act(async()=>{await vi.advanceTimersByTimeAsync(240);});
 click(button('Search all exercises'));const node=document.querySelector('input[aria-label="Search all available exercises"]');type(node,name);
 const choice=[...document.querySelectorAll('.replace-sheet .choice-row')].find(b=>b.querySelector('strong')?.textContent===name);expect(choice).toBeTruthy();click(choice);
}
it('real replacement resolves canonical T-Bar history and reuses each remaining set independently',async()=>{
 const s=fixture(),history=structuredClone(s.workouts),plan=structuredClone(s.program);mount(s);expect(use()).toBeNull();
 await replace('T-Bar Row');expect(entry().exerciseId).toBe('t-bar-row');expect(previousExercise(current.workouts,entry().exerciseId).exerciseId).toBe('t-bar-row');
 expect(host.textContent).toContain('Last 10 / 8');expect(host.querySelector('.previous-values-offer').textContent).toContain('40 kg × 10 reps');expect(entry().sets[0].weight).toBeNull();
 const before=structuredClone(entry()),start=current.activeWorkout.startedAt;click(openUse());
 expect(entry().sets[0]).toMatchObject({id:before.sets[0].id,weight:40,reps:10,rir:null,completed:false});expect(entry().sets[1]).toMatchObject({id:before.sets[1].id,weight:45,reps:8,rir:null,completed:false});
 expect(entry()).toMatchObject({repMin:9,repMax:9});expect(current.program).toEqual(plan);expect(current.workouts).toEqual(history);expect(current.activeWorkout.startedAt).toBe(start);
 click(button('Undo'));expect(entry()).toEqual(before);expect(current.workouts).toEqual(history);
});
it('an originally prescribed T-Bar Row hides the redundant helper and preserves automatic start-prefill semantics',()=>{
 const s=fixture();s.program.days[0].exercises[1].exerciseId='t-bar-row';s.activeWorkout=null;s.activeWorkout=startWorkout(s,s.program.days[0]);s.activeWorkout.exerciseIndex=1;
 expect(s.activeWorkout.exercises[1].sets[0]).toMatchObject({weight:40,reps:10});mount(s);expect(use()).toBeNull();expect(host.textContent).not.toContain('VALUES MATCH');
});
it('replacement without history offers no fabricated reuse and rapid B → C does not retain B’s action',async()=>{
 mount();await replace('T-Bar Row');const stale=use();expect(stale).toBeTruthy();
 await replace('Barbell Row');const before=structuredClone(entry());expect(use()).toBeNull();expect(host.textContent).toContain('First session');click(stale);expect(entry()).toEqual(before);expect(entry().exerciseId).toBe('barbell-row');
});
it('replacement and its historical action survive a strict reload without copying completion flags',async()=>{
 mount();await replace('T-Bar Row');const saved=deserializeState(serializeState(current),{strict:true}),history=structuredClone(saved.workouts);
 act(()=>root.render(null));mount(saved);expect(entry().exerciseId).toBe('t-bar-row');expect(use()).toBeTruthy();click(openUse());
 expect(entry().sets[0].completed).toBe(false);expect(current.workouts).toEqual(history);expect(entry().sets[0]).not.toHaveProperty('sessionId');
});
it('explicit reuse replaces only the chosen set draft and Undo restores it; other sets are preserved',async()=>{
 mount();await replace('T-Bar Row');type(input('weight'),'082,50');const other=entry().sets[1];Object.assign(other,{weight:65,reps:12,touched:true});
 const before=structuredClone(other);click(openUse());expect(input('weight').value).toBe('40');expect(entry().sets[1]).toEqual(before);
 click(button('Undo'));expect(input('weight').value).toBe('082,50');expect(entry().sets[1]).toEqual(before);
});
it('reps-only history keeps an entered load, including its pending raw draft',async()=>{
 const s=fixture();s.workouts[0].exercises[0].sets.forEach(set=>set.weight=null);mount(s);await replace('T-Bar Row');
 type(input('weight'),'62,5');click(openUse());expect(entry().sets[0]).toMatchObject({weight:null,reps:10,completed:false});
 expect(input('weight').value).toBe('62,5');expect(button('Undo')).toBeTruthy();
 click(button('Undo'));expect(entry().sets[0].weight).toBeNull();expect(input('weight').value).toBe('62,5');
});
it('completed working sets remain unchanged and the helper maps by the next unlogged ordinal',async()=>{
 mount();await replace('T-Bar Row');act(()=>mutate(s=>{Object.assign(s.activeWorkout.exercises[1].sets[0],{weight:99,reps:11,completed:true});return s;}));
 const completed=structuredClone(entry().sets[0]);expect(use()).toBeNull();const action=openUse();expect(document.querySelector('.previous-values-source-card').textContent).toContain('45 kg × 8 reps');click(action);expect(entry().sets[0]).toEqual(completed);expect(entry().sets[1]).toMatchObject({weight:45,reps:8,completed:false});
});
it('mode mismatch and entirely empty historical values keep context without a misleading reusable action',()=>{
 const s=fixture();s.activeWorkout.exercises[1].exerciseId='t-bar-row';s.workouts[0].exercises[0].loggingMode='per_side';mount(s);expect(host.textContent).toContain('Last 10 / 8');expect(use()).toBeNull();
 act(()=>mutate(state=>{state.workouts[0].exercises[0].loggingMode='normal';state.workouts[0].exercises[0].sets.forEach(set=>{set.reps=null;set.weight=null});return state;}));expect(use()).toBeNull();
});
