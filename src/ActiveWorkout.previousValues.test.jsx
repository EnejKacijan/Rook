import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import * as domain from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';

let host,root,current,reduced,animations,changeState,details,navigate,updates;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();reduced=false;animations=[];details=vi.fn();navigate=vi.fn();updates=vi.fn();
 vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener(){},removeEventListener(){}}));vi.spyOn(window,'scrollTo').mockImplementation(()=>{});HTMLElement.prototype.scrollTo=function({top=0}){this.scrollTop=top;};HTMLElement.prototype.scrollIntoView=()=>{};
 HTMLElement.prototype.animate=function(frames,timing){const a={node:this,frames,timing,cancel:vi.fn()};animations.push(a);return a;};
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return {x:0,left:0,top:0,right:390,bottom:56,width:390,height:this.classList.contains('rook-disclosure-compact')?44:this.style.height==='auto'||this.classList.contains('rook-disclosure-content')?56:parseFloat(this.style.height)||0};});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();delete HTMLElement.prototype.animate;});
function fixture({id='hack-squat',units='kg',rir=true,mode='normal',sets=3,matching=false}={}){
 let state=addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(0)),id);state=addFreestyleExercise(state,'leg-press');
 Object.assign(state.profile,{units,rirEnabled:rir,showExerciseImages:false,restTimerEnabled:true});const exercise=state.activeWorkout.exercises[0];exercise.loggingMode=mode;
 const first=exercise.sets[0];exercise.sets=Array.from({length:sets},(_,i)=>({...structuredClone(first),id:first.id+'-'+i,...(mode==='per_side'?{sides:{left:{reps:null},right:{reps:null}}}:{})}));
 if(matching)Object.assign(exercise.sets[0],{weight:90,reps:7});
 state.workouts=[{id:'previous',completedAt:new Date(Date.now()-86400000).toISOString(),exercises:[{...structuredClone(exercise),sets:[{weight:id==='plank'?null:90,reps:id==='plank'?45:7,rir:2,completed:true,...(mode==='per_side'?{sides:{left:{reps:7},right:{reps:9}}}:{})}]}]}];state.activeWorkout.rest={endsAt:Date.now()+90000,seconds:90};return state;
}
function mount(initial=fixture()){function Harness(){const[state,setState]=useState(initial);current=state;changeState=fn=>{updates();setState(s=>fn(structuredClone(s)));};return <ActiveWorkout state={state} update={changeState} setDetail={details} setPage={navigate}/>;}act(()=>root.render(<Harness/>));}
const button=text=>[...host.querySelectorAll('button')].find(b=>!b.closest('[inert]')&&b.textContent.trim()===text);
const use=()=>host.querySelector('.freestyle-copy'),click=node=>act(()=>node.click());
const set=()=>current.activeWorkout.exercises[0].sets[0];
const input=field=>host.querySelector(`[data-set-id="${set().id}"] [data-workout-field="${field}"] input`);
const type=(node,raw)=>{act(()=>node.focus());act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,raw);node.dispatchEvent(new Event('input',{bubbles:true}));});};
const settle=()=>act(()=>{for(const a of [...animations])a.onfinish?.();});
const pointerApply=()=>{const apply=use();act(()=>apply.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));act(()=>document.activeElement.blur());click(apply);};
function recommendedFixture(){
 const state=fixture(),exercise=state.activeWorkout.exercises[0];state.activeWorkout.source='plan';exercise.repMin=6;exercise.repMax=8;exercise.defaultIncrement=2.5;
 // This fixture represents an original prescribed exercise, not a mid-session Freestyle addition.
 delete exercise.prescriptionSource;
 for(const key of Object.keys(state.profile.increments))state.profile.increments[key]=2.5;
 Object.assign(state.workouts[0].exercises[0].sets[0],{planned:true,added:false,weight:87.5,reps:8});
 state.workouts.push({...structuredClone(state.workouts[0]),id:'previous-2'});
 expect(domain.progressionFor(exercise,state.workouts,state.profile)?.weight).toBe(90);return state;
}
const recommend=()=>host.querySelector('.recommendation button');
const pointerRecommend=()=>{const apply=recommend();act(()=>apply.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));act(()=>document.activeElement.blur());click(apply);};
it.each(['','53,','.'])('recommendation resolves only remaining weight drafts (%s) without a preliminary update',raw=>{
 const state=recommendedFixture(),exercise=state.activeWorkout.exercises[0];Object.assign(exercise.sets[2],{weight:65,reps:9,completed:true});mount(state);
 const before=structuredClone(current),node=input('weight');type(node,raw);pointerRecommend();expect(updates).toHaveBeenCalledOnce();expect(node.value).toBe('90');
 const sets=current.activeWorkout.exercises[0].sets;expect(sets[0]).toEqual({...before.activeWorkout.exercises[0].sets[0],weight:90,touched:true,weightEntryMode:'manual'});
 expect(sets[1]).toEqual({...before.activeWorkout.exercises[0].sets[1],weight:90,touched:true,weightEntryMode:'auto',weightSourceSetId:sets[0].id});expect(sets[2]).toEqual(before.activeWorkout.exercises[0].sets[2]);
 act(()=>node.blur());expect(updates).toHaveBeenCalledOnce();
});
it('recommendation does not own an invalid reps draft in the same set',()=>{
 mount(recommendedFixture());type(input('reps'),'');const before=structuredClone(current);pointerRecommend();expect(current).toEqual(before);expect(updates).not.toHaveBeenCalled();expect(document.activeElement).toBe(input('reps'));expect(recommend()).toBeTruthy();
});
it('recommendation excludes a completed set even for its weight draft',()=>{
 const state=recommendedFixture();Object.assign(state.activeWorkout.exercises[0].sets[2],{weight:65,reps:9,completed:true});mount(state);const other=host.querySelectorAll('[data-workout-field="weight"] input')[2];
 type(other,'');const before=structuredClone(current);pointerRecommend();expect(current).toEqual(before);expect(updates).not.toHaveBeenCalled();expect(document.activeElement).toBe(other);
});
it('moving focus to the declared resolver preserves the exact draft until keyboard activation',()=>{
 mount();type(input('weight'),'53,');const save=vi.spyOn(domain,'saveState');act(()=>use().focus());expect(updates).not.toHaveBeenCalled();click(use());expect(save).toHaveBeenCalledOnce();click(button('Undo'));expect(input('weight').value).toBe('53,');expect(set().weight).toBeNull();
});
it('a cancelled pointer does not apply values or exempt the next ordinary action',()=>{
 mount();type(input('weight'),'');const apply=use(),before=structuredClone(current);act(()=>{apply.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));apply.dispatchEvent(new MouseEvent('pointercancel',{bubbles:true}));});
 click(button('Finish'));expect(current).toEqual(before);expect(updates).not.toHaveBeenCalled();expect(navigate).not.toHaveBeenCalled();expect(button('Undo')).toBeUndefined();
});
it.each(['weight','reps'])('focused empty %s cannot block its explicit previous-values replacement',field=>{
 mount();const node=input(field),before=structuredClone(current);act(()=>node.focus());const save=vi.spyOn(domain,'saveState');pointerApply();
 expect(set()).toMatchObject({id:before.activeWorkout.exercises[0].sets[0].id,weight:90,reps:7,rir:null,completed:false});expect(input('weight').value).toBe('90');expect(input('reps').value).toBe('7');expect(host.textContent).toContain('Previous values applied');expect(save).toHaveBeenCalledOnce();expect(updates).toHaveBeenCalledOnce();
 click(button('Undo'));expect(current).toEqual(before);const snapshot={};node.dispatchEvent(new CustomEvent('rook-snapshot-draft',{detail:snapshot}));expect(snapshot.snapshot.draft).toBe('');
});
it.each(['53,','082,50','.'])('pointerdown/blur/capture/click replaces raw %s without a preliminary write and Undo restores it exactly',raw=>{
 mount();const before=structuredClone(current),node=input('weight'),save=vi.spyOn(domain,'saveState');type(node,raw);pointerApply();expect(set().weight).toBe(90);expect(save).toHaveBeenCalledOnce();expect(updates).toHaveBeenCalledOnce();
 click(button('Undo'));expect(current).toEqual(before);expect(node.value).toBe(raw);expect(save).toHaveBeenCalledTimes(2);expect(updates).toHaveBeenCalledTimes(2);
});
it('an unrelated invalid set draft blocks replacement without losing either raw draft',()=>{
 mount();const node=input('weight');type(node,'53,');const other=host.querySelectorAll('[data-workout-field="reps"] input')[1];
 act(()=>other.dispatchEvent(new CustomEvent('rook-restore-draft',{detail:{snapshot:{draft:'',committed:null}}})));
 const before=structuredClone(current),save=vi.spyOn(domain,'saveState');pointerApply();expect(current).toEqual(before);expect(node.value).toBe('53,');expect(other.value).toBe('');expect(document.activeElement).toBe(other);expect(button('Undo')).toBeUndefined();expect(save).not.toHaveBeenCalled();expect(updates).not.toHaveBeenCalled();
});
it.each(['next','finish','back'])('ordinary %s remains guarded by an invalid required draft',action=>{
 mount();type(input('weight'),'');const before=structuredClone(current);const target=action==='next'?host.querySelector('.workout-primary-action .exercise-navigation-button')||button('NEXT EXERCISE →'):action==='finish'?button('Finish'):host.querySelector('[aria-label="Back to Today"]');click(target);
 expect(current).toEqual(before);expect(navigate).not.toHaveBeenCalled();expect(details).not.toHaveBeenCalled();expect(host.querySelector('[role="alertdialog"]')).toBeNull();expect(updates).not.toHaveBeenCalled();
});
it.each([{id:'pull-up',field:'weight'},{id:'assisted-pull-up',field:'weight'},{id:'plank',field:'reps'},{mode:'per_side',field:'sides.left'},{mode:'per_side',field:'sides.right'}])('focused blank %j follows the same set-scoped domain copy and Undo',options=>{
 mount(fixture(options));const before=structuredClone(current),node=input(options.field);act(()=>node.focus());pointerApply();expect(set().reps).toBe(options.id==='plank'?45:7);if(options.mode==='per_side')expect(set().sides).toEqual({left:{reps:7},right:{reps:9}});click(button('Undo'));expect(current).toEqual(before);expect(node.value).toBe('');
});
it('owner flow applies once, acknowledges only affected values, collapses once, and restores just that set',()=>{
 mount();const before=structuredClone(current),weight=input('weight'),reps=input('reps'),history=button('View exercise history'),row=weight.closest('.set-row');const save=vi.spyOn(domain,'saveState'),apply=use();
 act(()=>{apply.click();apply.click();});expect(save).toHaveBeenCalledOnce();expect(set()).toMatchObject({weight:90,reps:7,rir:null,completed:false});expect(current.activeWorkout.exercises[0].sets.slice(1)).toEqual(before.activeWorkout.exercises[0].sets.slice(1));
 expect(input('weight')).toBe(weight);expect(input('reps')).toBe(reps);expect(weight.closest('.set-row')).toBe(row);expect(document.activeElement.className).toBe('freestyle-copy-applied');expect(button('View exercise history')).toBe(history);expect(button('Undo')).toBeDefined();
 const fields=animations.filter(a=>a.node.matches('input'));expect(fields.map(a=>a.node)).toEqual([weight,reps]);expect(fields.every(a=>a.timing.duration===160)).toBe(true);expect(animations.some(a=>a.frames[0].height==='56px'&&a.frames[1].height==='44px'&&a.timing.duration===200)).toBe(true);
 const count=animations.length;act(()=>vi.advanceTimersByTime(1000));expect(animations).toHaveLength(count);settle();click(button('Undo'));expect(current).toEqual(before);expect(button('View exercise history')).toBe(history);expect(use().disabled).toBe(false);expect(input('weight')).toBe(weight);
});
it('captures comma/leading-zero raw text before native blur and restores it without remounting or reapplying carry-forward',()=>{
 mount();const weight=input('weight');type(weight,'082,50');const apply=use();act(()=>apply.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));act(()=>weight.blur());const before=structuredClone(current);click(apply);expect(weight.value).toBe('90');click(button('Undo'));expect(weight.value).toBe('082,50');expect(current).toEqual(before);act(()=>weight.blur());expect(current).toEqual(before);
});
it('keyboard/programmatic activation replaces the draft without a preliminary commit and stale blur cannot overwrite it',()=>{
 mount();const weight=input('weight');type(weight,'82,5');click(use());expect(weight.value).toBe('90');expect(set().weight).toBe(90);act(()=>weight.blur());expect(set().weight).toBe(90);click(button('Undo'));expect(weight.value).toBe('82,5');expect(set().weight).toBeNull();
});
it('raw edits expire Undo immediately even if the canonical value has not changed or normalizes back to the same number',()=>{
 mount();click(use());const old=button('Undo');type(input('weight'),'090');expect(button('Undo')).toBeUndefined();click(old);expect(set().weight).toBe(90);expect(host.textContent).toContain('Previous values applied');
});
it('expiry follows the existing five-second transient convention without replaying motion',()=>{
 mount();click(use());settle();const count=animations.length;act(()=>vi.advanceTimersByTime(5000));expect(button('Undo')).toBeUndefined();expect(host.textContent).toContain('Previous values applied');expect(animations).toHaveLength(count);
});
it('persistence failure leaves prior values/helper truthful; failed Undo keeps applied state and allows retry',()=>{
 mount();const before=structuredClone(current),save=vi.spyOn(domain,'saveState').mockReturnValue(false);click(use());expect(current).toEqual(before);expect(button('Undo')).toBeUndefined();expect(host.textContent).not.toContain('Previous values applied');expect(host.querySelector('.freestyle-copy-error').textContent).toContain('Could not save');expect(animations).toHaveLength(0);
 save.mockRestore();click(use());const applied=structuredClone(current),fail=vi.spyOn(domain,'saveState').mockReturnValue(false);click(button('Undo'));expect(current).toEqual(applied);expect(button('Undo')).toBeDefined();fail.mockRestore();click(button('Undo'));expect(current).toEqual(before);
});
it('failed replacement retains a transient draft without first persisting or normalizing it',()=>{
 mount();type(input('weight'),'53,');const before=structuredClone(current),save=vi.spyOn(domain,'saveState').mockReturnValue(false);pointerApply();
 expect(save).toHaveBeenCalledOnce();expect(updates).not.toHaveBeenCalled();expect(current).toEqual(before);expect(input('weight').value).toBe('53,');expect(button('Undo')).toBeUndefined();
 save.mockRestore();pointerApply();click(button('Undo'));expect(current).toEqual(before);expect(input('weight').value).toBe('53,');
});
it('matching values disable meaningless copy and re-entry/reload do not replay a success action',()=>{
 mount(fixture({matching:true}));expect(use().disabled).toBe(true);expect(use().textContent).toContain('VALUES MATCH');expect(button('Undo')).toBeUndefined();expect(animations).toHaveLength(0);
});
it('a raw edit re-enables matching history before blur and Undo retains that exact edit',()=>{
 mount(fixture({matching:true}));const weight=input('weight'),before=structuredClone(current),save=vi.spyOn(domain,'saveState');expect(use().disabled).toBe(true);type(weight,'095,50');expect(use().disabled).toBe(false);click(use());expect(weight.value).toBe('90');click(button('Undo'));expect(weight.value).toBe('095,50');expect(current).toEqual(before);expect(save).not.toHaveBeenCalled();
 expect(use().disabled).toBe(false);pointerApply();expect(weight.value).toBe('90');click(button('Undo'));expect(weight.value).toBe('095,50');expect(current).toEqual(before);expect(save).not.toHaveBeenCalled();
});
it('only a changed RIR acknowledges when load/reps already match, and per-side raw drafts survive Undo',()=>{
 const initial=fixture({matching:true});initial.activeWorkout.exercises[0].sets[0].rir=3;mount(initial);click(use());expect(animations.filter(a=>a.node.matches('input'))).toHaveLength(0);expect(animations.some(a=>a.node.classList.contains('rir-value'))).toBe(true);click(button('Undo'));expect(set().rir).toBe(3);
 act(()=>root.render(null));mount(fixture({mode:'per_side'}));type(input('sides.left'),'003');type(input('sides.right'),'005');click(use());click(button('Undo'));expect(input('sides.left').value).toBe('3');expect(input('sides.right').value).toBe('005');expect(set().sides).toEqual({left:{reps:3},right:{reps:null}});
});
it.each([{id:'hack-squat',units:'lb',rir:false},{id:'pull-up'},{id:'assisted-pull-up'},{id:'plank'},{mode:'per_side'}])('preserves canonical representation, independent sides and Undo for %j',options=>{
 mount(fixture(options));const before=structuredClone(current);click(use());expect(set().reps).toBe(options.id==='plank'?45:7);expect(set().weight).toBe(options.id==='plank'?null:90);
 if(options.units==='lb')expect(input('weight').value).toBe(String(domain.displayWeight(90,'lb')));
 if(options.mode==='per_side'){expect(input('sides.left').value).toBe('7');expect(input('sides.right').value).toBe('9');}
 click(button('Undo'));expect(current).toEqual(before);
});
it('only the corresponding first uncompleted set is affected when earlier sets are done',()=>{
 const initial=fixture();Object.assign(initial.activeWorkout.exercises[0].sets[0],{weight:10,reps:5,completed:true});initial.workouts[0].exercises[0].sets.push({weight:80,reps:8,completed:true});mount(initial);click(use());expect(current.activeWorkout.exercises[0].sets[0]).toEqual(initial.activeWorkout.exercises[0].sets[0]);expect(current.activeWorkout.exercises[0].sets[1]).toMatchObject({weight:80,reps:8,completed:false});expect(current.activeWorkout.exercises[0].sets[2]).toEqual(initial.activeWorkout.exercises[0].sets[2]);
});
it('logging, navigation and reload expire local Undo without changing timer, identity or copied values',()=>{
 mount();const before=structuredClone(current.activeWorkout);click(use());const saved=domain.deserializeState(domain.serializeState(current),{strict:true});expect(saved.activeWorkout.id).toBe(before.id);expect(saved.activeWorkout.startedAt).toBe(before.startedAt);expect(saved.activeWorkout.rest).toEqual(before.rest);
 act(()=>changeState(s=>{s.activeWorkout.exerciseIndex=1;return s;}));act(()=>changeState(s=>{s.activeWorkout.exerciseIndex=0;return s;}));expect(use().disabled).toBe(true);expect(button('Undo')).toBeUndefined();
 act(()=>root.render(null));mount(saved);expect(use().disabled).toBe(true);expect(button('Undo')).toBeUndefined();click(host.querySelector('[aria-label="Log set 1"]'));expect(set().completed).toBe(true);expect(button('Undo')).toBeUndefined();
});
it('reduced motion updates values and confirmation directly while retaining functional Undo',()=>{
 reduced=true;mount();click(use());expect(set().weight).toBe(90);expect(animations).toHaveLength(0);expect(button('Undo')).toBeDefined();click(button('Undo'));expect(set().weight).toBeNull();
});
