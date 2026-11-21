import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout,Detail} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,serializeState,deserializeState,previousExercise,saveState,exerciseName} from './domain.js';
import {saveWorkoutTemplate,useSavedWorkout} from './savedWorkouts.js';

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

it('replacing an exercise preserves the existing session rest deadline',async()=>{
 const state=fixture();state.profile.restTimerEnabled=true;state.activeWorkout.rest={seconds:90,endsAt:Date.now()+60000};
 const rest=structuredClone(state.activeWorkout.rest),plan=structuredClone(state.program),history=structuredClone(state.workouts);mount(state);await replace('T-Bar Row');
 expect(entry().exerciseId).toBe('t-bar-row');expect(current.activeWorkout.rest).toEqual(rest);expect(current.program).toEqual(plan);expect(current.workouts).toEqual(history);
});
it('saves only this recurring workout slot and uses the replacement when the workout starts again',async()=>{
 const s=fixture(),plan=structuredClone(s.program),original=plan.days[0].exercises[1];
 mount(s);expect(button('Save to plan')).toBeUndefined();
 await replace('T-Bar Row');
 expect(current.program).toEqual(plan);
 expect(button('Save to plan').closest('.active-replacement')).toBeTruthy();
 expect(host.querySelector('.active-replacement [role="status"]').textContent).toBe(`Future ${plan.days[0].name} sessions still use ${exerciseName(original)}.`);
 expect(host.querySelector('.active-replacement-future strong').textContent).toBe(plan.days[0].name);
 expect(button('Revert to original').closest('.active-replacement-future')).toBeNull();
 expect(button('Save to plan').closest('.active-replacement-future')).toBeTruthy();
 act(()=>mutate(s=>{Object.assign(s.activeWorkout.exercises[1].sets[0],{weight:87,reps:5,completed:true});return s;}));
 const active=structuredClone(entry()),history=structuredClone(current.workouts);
 click(button('Save to plan'));
 const saved=current.program.days[0].exercises[1];
 expect(saved).toMatchObject({id:original.id,exerciseId:'t-bar-row',repMin:original.repMin,repMax:original.repMax,restSeconds:original.restSeconds});
 expect(saved.sets.map(set=>[set.id,set.reps])).toEqual(original.sets.map(set=>[set.id,set.reps]));
 expect(saved.sets.every(set=>set.weight===null&&!set.completed)).toBe(true);
 expect(current.program.days.slice(1)).toEqual(plan.days.slice(1));
 expect(current.program.days[0].exercises.filter(e=>e.id!==original.id)).toEqual(plan.days[0].exercises.filter(e=>e.id!==original.id));
 expect(current.substitutionPreferences).toEqual(s.substitutionPreferences);expect(current.workouts).toEqual(history);expect(entry()).toEqual(active);
 expect(current.planVersions.at(-1)).toMatchObject({summary:'Exercise replaced',program:{days:current.program.days}});
 expect(host.textContent).toContain('Saved to plan');
 expect(host.querySelector('.active-replacement [role="status"]').textContent).toBe(`Future ${plan.days[0].name} sessions will use T-Bar Row.`);
 expect(button('Undo saved change').closest('.active-replacement-future')).toBeTruthy();
 const restored=deserializeState(serializeState(current),{strict:true});
 const next=startWorkout({...restored,activeWorkout:null},restored.program.days[0]);
 expect(next.exercises[1].exerciseId).toBe('t-bar-row');
 expect(next.exercises[1].sets[0]).toMatchObject({weight:40,reps:10,completed:false});
});
it('after two swaps and a reload, undo restores only the future workout and Revert restores the active superset slot',async()=>{
 const s=fixture(),original=structuredClone(s.activeWorkout.exercises[1]),plan=structuredClone(s.program);
 s.activeWorkout.exercises[1].supersetId=s.activeWorkout.exercises[2].supersetId='my-pair';
 mount(s);
 await replace('T-Bar Row');
 click(button('Save to plan'));
 await replace('Barbell Row');
 click(button('Save to plan'));
 expect(current.program.days[0].exercises[1].exerciseId).toBe('barbell-row');
 expect(current.program.days.slice(1)).toEqual(plan.days.slice(1));
 const loaded=deserializeState(serializeState(current),{strict:true});
 act(()=>root.render(null));mount(loaded);
 expect(button('Revert to original')).toBeUndefined();
 click(button('Undo saved change'));
 expect(current.program.days[0].exercises[1].exerciseId).toBe('t-bar-row');
 expect(entry().exerciseId).toBe('barbell-row');
 click(button('Revert to original'));
 expect(entry()).toMatchObject({id:original.id,exerciseId:original.exerciseId,supersetId:'my-pair',sets:original.sets});
 expect(current.activeWorkout.exercises[2].supersetId).toBe('my-pair');
 expect(current.activeWorkout.exerciseReplacements).toBeUndefined();
 expect(current.substitutionPreferences).toEqual([]);
 expect(current.program.days[0].exercises[1].exerciseId).toBe('t-bar-row');
});
it('can undo the future workout change after logging without undoing the active exercise or its sets',async()=>{
 mount();await replace('T-Bar Row');
 const original=current.program.days[0].exercises[1].exerciseId;
 click(button('Save to plan'));
 act(()=>mutate(s=>{Object.assign(s.activeWorkout.exercises[1].sets[0],{weight:40,reps:9,completed:true});return s;}));
 const before=structuredClone(entry());click(button('Undo saved change'));
 expect(current.program.days[0].exercises[1].exerciseId).toBe(original);
 expect(button('Revert to original')).toBeUndefined();expect(host.textContent).toContain('once you’ve entered values or logged work');
 expect(entry()).toEqual(before);expect(current.substitutionPreferences).toEqual([]);
});
it('a failed revert or permanent save preserves the current replacement and allows retry',async()=>{
 mount();await replace('T-Bar Row');const before=structuredClone(current);
 saveState.mockReturnValue(false);click(button('Revert to original'));click(button('Save to plan'));
 expect(current).toEqual(before);expect(host.querySelector('.active-replacement [role="alert"]').textContent).toMatch(/Could not save/);
 saveState.mockReturnValue(true);click(button('Save to plan'));
 expect(current.program.days[0].exercises[1].exerciseId).toBe('t-bar-row');
});
it('updates a saved workout by its source slot, and starts the saved replacement next time',async()=>{
 const s=fixture(),program=structuredClone(s.program);
 const ready=saveWorkoutTemplate({...s,activeWorkout:null},{name:'Saved upper',exercises:s.program.days[0].exercises.slice(1,3)},{id:'upper'});
 mount(useSavedWorkout(ready,{templateId:'upper',revision:1,requestId:'start-upper'}));
 await replace('T-Bar Row');
 const active=structuredClone(entry());
 expect(button('Save to plan')).toBeUndefined();
 click(button('Update saved workout'));
 expect(host.textContent).toContain('Saved workout updated');
 expect(host.querySelector('.active-replacement [role="status"]').textContent).toBe('Future Saved upper sessions will use T-Bar Row.');
 expect(current.savedWorkoutTemplates[0]).toMatchObject({id:'upper',revision:2,exercises:[{exerciseId:'t-bar-row'},ready.savedWorkoutTemplates[0].exercises[1]]});
 expect(entry()).toEqual(active);expect(current.program).toEqual(program);expect(current.substitutionPreferences).toEqual([]);
 const next=useSavedWorkout({...current,activeWorkout:null},{templateId:'upper',revision:2,requestId:'next-upper'});
 expect(next.activeWorkout.exercises[0].exerciseId).toBe('t-bar-row');
});
it('keeps one-off and stale source replacements local to the current session',async()=>{
 const s=fixture();s.activeWorkout.temporaryPlanAdjustment={id:'temporary',equipment:['full gym']};mount(s);
 await replace('T-Bar Row');
 expect(button('Save to plan')).toBeUndefined();
 expect(button('Revert to original')).toBeTruthy();expect(current.program).toEqual(s.program);
 expect(host.querySelector('.active-replacement [role="status"]')).toBeNull();
 act(()=>root.render(null));mount(fixture());await replace('T-Bar Row');
 act(()=>mutate(s=>{s.program.days[0].exercises[1].exerciseId='barbell-row';return s;}));
 expect(button('Save to plan')).toBeUndefined();
 expect(host.textContent).toContain('The saved workout changed');
});
it('moves replacement actions to the exercise menu without changing the workout until an action is selected',async()=>{
 mount();await replace('T-Bar Row');
 const before=structuredClone(current);
 click(button('Hide'));
 expect(host.querySelector('.active-replacement')).toBeNull();
 expect(entry()).toEqual(before.activeWorkout.exercises[1]);
 expect(current.program).toEqual(before.program);
 expect(document.activeElement).toBe(host.querySelector('.exercise-options-button'));
 click(host.querySelector('.exercise-options-button'));
 expect(button('Revert to original').closest('.active-replacement-menu')).toBeTruthy();
 click(button('Save to plan'));
 expect(current.program.days[0].exercises[1].exerciseId).toBe('t-bar-row');
 expect(host.querySelector('.active-replacement')).toBeNull();
 click(button('Undo saved change'));
 expect(current.program.days[0].exercises[1].exerciseId).toBe(before.program.days[0].exercises[1].exerciseId);
 click(button('Show replacement details'));
 expect(host.querySelector('.active-replacement-menu')).toBeNull();
 expect(button('Save to plan').closest('.active-replacement')).toBeTruthy();
});
it('keeps a hidden replacement in the menu after reload and shows a new replacement again',async()=>{
 mount();await replace('T-Bar Row');click(button('Hide'));
 const loaded=deserializeState(serializeState(current),{strict:true});
 act(()=>root.render(null));mount(loaded);
 expect(host.querySelector('.active-replacement')).toBeNull();
 await replace('Barbell Row');
 expect(button('Hide').closest('.active-replacement')).toBeTruthy();
 click(button('Hide'));
 click(host.querySelector('.exercise-options-button'));
 click(button('Revert to original'));
 expect(entry().exerciseId).toBe(loaded.program.days[0].exercises[1].exerciseId);
 expect(host.querySelector('.active-replacement-menu')).toBeNull();
});
