import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {ActiveWorkout,Detail} from './App.jsx';
import * as domain from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';

let host,root,current,reduced,animations,changeState,details,navigate,updates;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();sessionStorage.clear();reduced=false;animations=[];details=vi.fn();navigate=vi.fn();updates=vi.fn();
 vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
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
function mount(initial=fixture()){function Harness(){const[state,setState]=useState(initial),[detail,setDetail]=useState(null);current=state;changeState=fn=>{updates();setState(s=>fn(structuredClone(s)));};const open=value=>{details(value);setDetail(value);};return <><ActiveWorkout state={state} update={changeState} setDetail={open} setPage={navigate}/>{detail&&<Detail detail={detail} state={state} update={changeState} close={()=>setDetail(null)} setDetail={open} setPage={navigate}/>}</>;}act(()=>root.render(<Harness/>));}
const button=text=>[...document.querySelectorAll('button')].find(b=>!b.closest('[inert]')&&b.textContent.trim()===text);
const use=()=>host.querySelector('.freestyle-copy'),click=node=>act(()=>node.click());
const openUse=()=>{if(use())return use();click(host.querySelector('.exercise-options-button'));click(button('Use previous values'));act(()=>vi.advanceTimersByTime(20));return document.querySelector('.previous-values-apply');};
const set=()=>current.activeWorkout.exercises[0].sets[0];
const input=field=>host.querySelector(`[data-set-id="${set().id}"] [data-workout-field="${field}"] input`);
const type=(node,raw)=>{act(()=>node.focus());act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,raw);node.dispatchEvent(new Event('input',{bubbles:true}));});};
const settle=()=>act(()=>{for(const a of [...animations])a.onfinish?.();});
const pointerApply=()=>{const apply=openUse();act(()=>apply.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));act(()=>document.activeElement.blur());click(apply);};
function recommendedFixture(){
 const state=fixture(),exercise=state.activeWorkout.exercises[0];state.activeWorkout.source='plan';exercise.repMin=6;exercise.repMax=8;exercise.defaultIncrement=2.5;
 // This fixture represents an original prescribed exercise, not a mid-session Freestyle addition.
 delete exercise.prescriptionSource;
 for(const key of Object.keys(state.profile.increments))state.profile.increments[key]=2.5;
 state.workouts[0].exercises[0].sets=exercise.sets.map((set,index)=>({...structuredClone(state.workouts[0].exercises[0].sets[0]),id:`prior-${index}`,planned:true,added:false,weight:87.5,reps:8}));
 state.workouts.push({...structuredClone(state.workouts[0]),id:'previous-2'});
 expect(domain.progressionFor(exercise,state.workouts,state.profile)?.weight).toBe(90);return state;
}
const recommend=()=>host.querySelector('.recommendation button[data-workout-replaces]');
function repeatedFixture(){
 const state=fixture();state.activeWorkout.exercises[0].sets.forEach(set=>Object.assign(set,{weight:null,reps:6,touched:false}));
 const prior=state.workouts[0].exercises[0];prior.sets=[[15,8],[15,7],[12.5,8]].map(([weight,reps])=>({weight,reps,rir:2,completed:true}));
 return state;
}
it('one explicit reuse fills each remaining historical set, writes once, and Undo restores all three',()=>{
 mount(repeatedFixture());const before=structuredClone(current),save=vi.spyOn(domain,'saveState');
 expect(use().textContent).toBe('Use for 3 sets');click(use());
 expect(current.activeWorkout.exercises[0].sets.map(set=>[set.weight,set.reps,set.rir,set.completed])).toEqual([[15,8,null,false],[15,7,null,false],[12.5,8,null,false]]);
 expect(host.textContent).toContain('Previous values added to 3 sets');expect(save).toHaveBeenCalledOnce();
 click(button('Undo'));expect(current).toEqual(before);expect(save).toHaveBeenCalledTimes(2);
});
it('the next set already has its own weight and reps after logging the first reused set',()=>{
 mount(repeatedFixture());click(use());click(host.querySelector('[aria-label="Log set 1"]'));
 expect(current.activeWorkout.exercises[0].sets[1]).toMatchObject({weight:15,reps:7,completed:false});
 expect(host.querySelector('[aria-label="Weight in kg for set 2"]').value).toBe('15');
 expect(host.querySelector('[aria-label="Reps for set 2"]').value).toBe('7');
 expect(use()).toBeNull();expect(button('Undo')).toBeUndefined();
});
it('a future unsaved draft protects its whole set during pointer copy and keeps later ordinals aligned',()=>{
 mount(repeatedFixture());const future=host.querySelector('[aria-label="Reps for set 2"]');
 act(()=>future.dispatchEvent(new CustomEvent('rook-restore-draft',{detail:{snapshot:{draft:'.',committed:null}}})));
 pointerApply();
 expect(current.activeWorkout.exercises[0].sets[1]).toMatchObject({weight:null,reps:6,completed:false});
 expect(current.activeWorkout.exercises[0].sets[2]).toMatchObject({weight:12.5,reps:8,completed:false});
});
it('re-entering the same number in a copied future set expires Undo rather than undoing new intent',()=>{
 mount(repeatedFixture());click(use());const future=host.querySelector('[aria-label="Weight in kg for set 2"]');
 type(future,'15');expect(button('Undo')).toBeUndefined();act(()=>future.blur());
 expect(current.activeWorkout.exercises[0].sets[1].weight).toBe(15);
});
it('later manual load edits cannot flatten the different historical future weights',()=>{
 mount(repeatedFixture());click(use());type(input('weight'),'20');act(()=>input('weight').blur());
 expect(current.activeWorkout.exercises[0].sets.map(set=>set.weight)).toEqual([20,20,12.5]);
});
it('offers remaining reuse even if the current set already matches, with an accurate affected count',()=>{
 const state=repeatedFixture();Object.assign(state.activeWorkout.exercises[0].sets[0],{weight:15,reps:8});mount(state);
 expect(use().textContent).toBe('Use for 2 sets');click(use());
 expect(host.textContent).toContain('Previous values added to 2 sets');
 expect(current.activeWorkout.exercises[0].sets[0]).toEqual(state.activeWorkout.exercises[0].sets[0]);
 expect(current.activeWorkout.exercises[0].sets[2].weight).toBe(12.5);
});
it('a failed bulk save changes no set and does not claim that values were applied',()=>{
 mount(repeatedFixture());const before=structuredClone(current),save=vi.spyOn(domain,'saveState').mockReturnValue(false);click(use());
 expect(current).toEqual(before);expect(button('Undo')).toBeUndefined();expect(use().textContent).toBe('Use for 3 sets');
 expect(host.querySelector('[role="alert"]').textContent).toContain('Could not save');expect(save).toHaveBeenCalledOnce();
});
const pointerRecommend=()=>{const apply=recommend();act(()=>apply.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));act(()=>document.activeElement.blur());click(apply);};
it('shows whole-session feedback as next-workout guidance without applying a load',()=>{
 const state=recommendedFixture(),before=structuredClone(state.activeWorkout);
 state.workouts.at(-1).sessionFeedback='harder';mount(state);
 expect(host.textContent).toContain('Repeat before increasing');
 expect(host.textContent).toContain('whole last session felt harder than expected');
 expect(recommend()).toBeNull();
 expect(current.activeWorkout).toEqual(before);
 act(()=>changeState(s=>{s.workouts.at(-1).sessionFeedback='easier';return s;}));
 expect(host.textContent).toContain('whole last session also felt easier than expected');
 expect(recommend()).toBeTruthy();
});
it.each(['','53,','.'])('recommendation resolves only remaining weight drafts (%s) without a preliminary update',raw=>{
 const state=recommendedFixture(),exercise=state.activeWorkout.exercises[0];Object.assign(exercise.sets[2],{weight:65,reps:9,completed:true});mount(state);
 const before=structuredClone(current),node=input('weight');type(node,raw);pointerRecommend();expect(updates).toHaveBeenCalledOnce();expect(node.value).toBe('90');
 const sets=current.activeWorkout.exercises[0].sets;expect(sets[0]).toEqual({...before.activeWorkout.exercises[0].sets[0],weight:90,touched:true,weightEntryMode:'manual',weightProvenance:'progression'});
 expect(sets[1]).toEqual({...before.activeWorkout.exercises[0].sets[1],weight:90,touched:true,weightEntryMode:'auto',weightSourceSetId:sets[0].id,weightProvenance:'progression'});expect(sets[2]).toEqual(before.activeWorkout.exercises[0].sets[2]);
 act(()=>node.blur());expect(updates).toHaveBeenCalledOnce();
});
it('recommendation settles an unrelated empty reps edit without inventing reps or blocking its load action',()=>{
 mount(recommendedFixture());type(input('reps'),'');pointerRecommend();expect(set().weight).toBe(90);expect(set().reps).toBeNull();expect(set().completed).toBe(false);expect(updates).toHaveBeenCalledOnce();expect(document.activeElement).not.toBe(input('reps'));
});
it('recommendation excludes a completed set even for its weight draft',()=>{
 const state=recommendedFixture();Object.assign(state.activeWorkout.exercises[0].sets[2],{weight:65,reps:9,completed:true});mount(state);const other=host.querySelectorAll('[data-workout-field="weight"] input')[2];
 type(other,'');const before=structuredClone(current.activeWorkout.exercises[0].sets[2]);pointerRecommend();expect(current.activeWorkout.exercises[0].sets[2]).toEqual(before);expect(other.value).toBe('65');expect(set().weight).toBe(90);expect(updates).toHaveBeenCalledOnce();
});
it('moving focus to the declared resolver preserves the exact draft until keyboard activation',()=>{
 mount();type(input('weight'),'53,');const save=vi.spyOn(domain,'saveState');const action=openUse();act(()=>action.focus());expect(updates).not.toHaveBeenCalled();click(openUse());expect(save).toHaveBeenCalledOnce();click(button('Undo'));expect(input('weight').value).toBe('53,');expect(set().weight).toBeNull();
});
it('a cancelled pointer does not apply values or exempt the next ordinary action',()=>{
 mount();type(input('weight'),'');const apply=openUse(),before=structuredClone(current);act(()=>{apply.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));apply.dispatchEvent(new MouseEvent('pointercancel',{bubbles:true}));});
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
it('an unrelated empty set draft does not block explicit replacement or turn that other set into completed work',()=>{
 mount();const node=input('weight');type(node,'53,');const other=host.querySelectorAll('[data-workout-field="reps"] input')[1];
 act(()=>other.dispatchEvent(new CustomEvent('rook-restore-draft',{detail:{snapshot:{draft:'',committed:null}}})));
 const before=structuredClone(current),save=vi.spyOn(domain,'saveState');pointerApply();expect(set()).toMatchObject({weight:90,reps:7,completed:false});expect(node.value).toBe('90');expect(other.value).toBe('');expect(current.activeWorkout.exercises[0].sets[1]).toEqual(before.activeWorkout.exercises[0].sets[1]);expect(document.activeElement).not.toBe(other);expect(button('Undo')).toBeDefined();expect(save).toHaveBeenCalledOnce();expect(updates).toHaveBeenCalledOnce();
 click(button('Undo'));expect(current).toEqual(before);expect(node.value).toBe('53,');
});
it.each(['next','finish','back'])('ordinary %s settles an invalid required draft without a focus trap or logging it',action=>{
 const initial=fixture();if(action==='finish')Object.assign(initial.activeWorkout.exercises[1].sets[0],{weight:40,reps:8,completed:true});mount(initial);type(input('weight'),'');const before=structuredClone(current);const target=action==='next'?button('NEXT EXERCISE →'):action==='finish'?button('Finish'):host.querySelector('[aria-label="Back to Today"]');click(target);
 expect(current).toEqual(before);expect(input('weight').value).toBe('');expect(details).not.toHaveBeenCalled();expect(updates).not.toHaveBeenCalled();
 if(action==='back')expect(navigate).toHaveBeenCalledWith('today');else expect(document.querySelector('.workout-confirm')).not.toBeNull();
});
it.each([{id:'pull-up',field:'weight'},{id:'assisted-pull-up',field:'weight'},{id:'plank',field:'reps'},{mode:'per_side',field:'sides.left'},{mode:'per_side',field:'sides.right'}])('focused blank %j follows the same set-scoped domain copy and Undo',options=>{
 mount(fixture(options));const before=structuredClone(current),node=input(options.field);act(()=>node.focus());pointerApply();expect(set().reps).toBe(options.id==='plank'?45:7);if(options.mode==='per_side')expect(set().sides).toEqual({left:{reps:7},right:{reps:9}});click(button('Undo'));expect(current).toEqual(before);expect(node.value).toBe('');
});
it('owner flow applies once, acknowledges only affected values, dismisses the hint, and restores just that set',()=>{
 mount();const before=structuredClone(current),weight=input('weight'),reps=input('reps'),history=host.querySelector('.exercise-options-button'),row=weight.closest('.set-row');const save=vi.spyOn(domain,'saveState'),apply=use();
 act(()=>{apply.click();apply.click();});expect(save).toHaveBeenCalledOnce();expect(set()).toMatchObject({weight:90,reps:7,rir:null,completed:false});expect(current.activeWorkout.exercises[0].sets.slice(1)).toEqual(before.activeWorkout.exercises[0].sets.slice(1));
 expect(input('weight')).toBe(weight);expect(input('reps')).toBe(reps);expect(weight.closest('.set-row')).toBe(row);expect(host.querySelector('.exercise-options-button')).toBe(history);expect(button('Undo')).toBeDefined();
 const fields=animations.filter(a=>a.node.matches('input'));expect(fields.map(a=>a.node)).toEqual([weight,reps]);expect(fields.every(a=>a.timing.duration===160)).toBe(true);expect(host.querySelector('.previous-values-offer')).toBeNull();
 const count=animations.length;act(()=>vi.advanceTimersByTime(1000));expect(animations).toHaveLength(count);settle();click(button('Undo'));expect(current).toEqual(before);expect(host.querySelector('.exercise-options-button')).toBe(history);expect(use()).toBeNull();expect(input('weight')).toBe(weight);
});
it('captures comma/leading-zero raw text before native blur and restores it without remounting or reapplying carry-forward',()=>{
 mount();const weight=input('weight');type(weight,'082,50');const apply=openUse();act(()=>apply.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));act(()=>weight.blur());const before=structuredClone(current);click(apply);expect(weight.value).toBe('90');click(button('Undo'));expect(weight.value).toBe('082,50');expect(current).toEqual(before);act(()=>weight.blur());expect(current).toEqual(before);
});
it('keyboard/programmatic activation replaces the draft without a preliminary commit and stale blur cannot overwrite it',()=>{
 mount();const weight=input('weight');type(weight,'82,5');click(openUse());expect(weight.value).toBe('90');expect(set().weight).toBe(90);act(()=>weight.blur());expect(set().weight).toBe(90);click(button('Undo'));expect(weight.value).toBe('82,5');expect(set().weight).toBeNull();
});
it('raw edits expire Undo immediately even if the canonical value has not changed or normalizes back to the same number',()=>{
 mount();click(openUse());const old=button('Undo');type(input('weight'),'090');expect(button('Undo')).toBeUndefined();click(old);expect(set().weight).toBe(90);expect(host.textContent).not.toContain('Previous values applied');
});
it('expiry animates only the notice out after eight seconds, without replaying value feedback',()=>{
 mount();click(openUse());settle();act(()=>host.querySelector('.exercise-options-button').focus());const count=animations.length;act(()=>vi.advanceTimersByTime(8000));
 expect(button('Undo')).toBeDefined();expect(animations).toHaveLength(count+1);
 expect(animations.at(-1).node.classList.contains('previous-values-undo')).toBe(true);
 expect(animations.at(-1).timing.duration).toBe(170);settle();
 expect(button('Undo')).toBeUndefined();expect(host.textContent).not.toContain('Previous values applied');expect(set().weight).toBe(90);
});
it.each([false,true])('keeps a focused previous-values Undo available and restores only its operation (reduced motion=%s)',motion=>{
 reduced=motion;mount();const before=structuredClone(current);click(openUse());settle();const undo=button('Undo');act(()=>undo.focus());
 act(()=>vi.advanceTimersByTime(15000));expect(button('Undo')).toBe(undo);expect(document.activeElement).toBe(undo);
 click(undo);expect(current).toEqual(before);expect(button('Undo')).toBeUndefined();
});
it('pauses the remaining Undo lifetime across internal focus moves and resumes only after leaving the helper',()=>{
 mount();click(openUse());settle();act(()=>host.querySelector('.exercise-options-button').focus());act(()=>vi.advanceTimersByTime(2000));
 const undo=button('Undo');act(()=>undo.focus());act(()=>vi.advanceTimersByTime(8000));
 act(()=>vi.advanceTimersByTime(8000));expect(button('Undo')).toBe(undo);
 act(()=>host.querySelector('.exercise-options-button').focus());act(()=>vi.advanceTimersByTime(5999));expect(button('Undo')).toBe(undo);
 act(()=>vi.advanceTimersByTime(1));settle();expect(button('Undo')).toBeUndefined();expect(set().weight).toBe(90);
});
it('persistence failure leaves prior values/helper truthful; failed Undo keeps applied state and allows retry',()=>{
 mount();const before=structuredClone(current),save=vi.spyOn(domain,'saveState').mockReturnValue(false);click(openUse());expect(current).toEqual(before);expect(button('Undo')).toBeUndefined();expect(host.textContent).not.toContain('Previous values applied');expect(host.querySelector('.freestyle-copy-error').textContent).toContain('Could not save');expect(animations).toHaveLength(0);
 save.mockRestore();click(openUse());const applied=structuredClone(current),fail=vi.spyOn(domain,'saveState').mockReturnValue(false);click(button('Undo'));expect(current).toEqual(applied);expect(button('Undo')).toBeDefined();fail.mockRestore();click(button('Undo'));expect(current).toEqual(before);
});
it('failed replacement retains a transient draft without first persisting or normalizing it',()=>{
 mount();type(input('weight'),'53,');const before=structuredClone(current),save=vi.spyOn(domain,'saveState').mockReturnValue(false);pointerApply();
 expect(save).toHaveBeenCalledOnce();expect(updates).not.toHaveBeenCalled();expect(current).toEqual(before);expect(input('weight').value).toBe('53,');expect(button('Undo')).toBeUndefined();
 save.mockRestore();pointerApply();click(button('Undo'));expect(current).toEqual(before);expect(input('weight').value).toBe('53,');
});
it('matching values hide meaningless copy and re-entry/reload do not replay a success action',()=>{
 mount(fixture({matching:true}));expect(use()).toBeNull();expect(host.textContent).not.toContain('VALUES MATCH');expect(button('Undo')).toBeUndefined();expect(animations).toHaveLength(0);
});
it('a raw edit re-enables matching history before blur and Undo retains that exact edit',()=>{
 mount(fixture({matching:true}));const weight=input('weight'),before=structuredClone(current),save=vi.spyOn(domain,'saveState');expect(use()).toBeNull();type(weight,'095,50');expect(use()).toBeNull();click(openUse());expect(weight.value).toBe('90');click(button('Undo'));expect(weight.value).toBe('095,50');expect(current).toEqual(before);expect(save).not.toHaveBeenCalled();
 expect(use()).toBeNull();pointerApply();expect(weight.value).toBe('90');click(button('Undo'));expect(weight.value).toBe('095,50');expect(current).toEqual(before);expect(save).not.toHaveBeenCalled();
});
it('only a changed RIR acknowledges when load/reps already match',()=>{
 const initial=fixture({matching:true});initial.activeWorkout.exercises[0].sets[0].rir=3;mount(initial);click(openUse());expect(animations.filter(a=>a.node.matches('input'))).toHaveLength(0);expect(animations.some(a=>a.node.classList.contains('rir-value'))).toBe(true);click(button('Undo'));expect(set().rir).toBe(3);
});
it('independent per-side raw drafts survive Undo',()=>{
 mount(fixture({mode:'per_side'}));type(input('sides.left'),'003');type(input('sides.right'),'005');click(openUse());click(button('Undo'));expect(input('sides.left').value).toBe('3');expect(input('sides.right').value).toBe('005');expect(set().sides).toEqual({left:{reps:3},right:{reps:null}});
});
it.each([{id:'hack-squat',units:'lb',rir:false},{id:'pull-up'},{id:'assisted-pull-up'},{id:'plank'},{mode:'per_side'}])('preserves canonical representation, independent sides and Undo for %j',options=>{
 mount(fixture(options));const before=structuredClone(current);click(openUse());expect(set().reps).toBe(options.id==='plank'?45:7);expect(set().weight).toBe(options.id==='plank'?null:90);
 if(options.units==='lb')expect(input('weight').value).toBe(String(domain.displayWeight(90,'lb')));
 if(options.mode==='per_side'){expect(input('sides.left').value).toBe('7');expect(input('sides.right').value).toBe('9');}
 click(button('Undo'));expect(current).toEqual(before);
});
it('only the corresponding first uncompleted set is affected when earlier sets are done',()=>{
 const initial=fixture();Object.assign(initial.activeWorkout.exercises[0].sets[0],{weight:10,reps:5,completed:true});initial.workouts[0].exercises[0].sets.push({weight:80,reps:8,completed:true});mount(initial);click(openUse());expect(current.activeWorkout.exercises[0].sets[0]).toEqual(initial.activeWorkout.exercises[0].sets[0]);expect(current.activeWorkout.exercises[0].sets[1]).toMatchObject({weight:80,reps:8,completed:false});expect(current.activeWorkout.exercises[0].sets[2]).toEqual(initial.activeWorkout.exercises[0].sets[2]);
});
it('logging, navigation and reload expire local Undo without changing timer, identity or copied values',()=>{
 mount();const before=structuredClone(current.activeWorkout);click(openUse());const saved=domain.deserializeState(domain.serializeState(current),{strict:true});expect(saved.activeWorkout.id).toBe(before.id);expect(saved.activeWorkout.startedAt).toBe(before.startedAt);expect(saved.activeWorkout.rest).toEqual(before.rest);
 act(()=>changeState(s=>{s.activeWorkout.exerciseIndex=1;return s;}));act(()=>changeState(s=>{s.activeWorkout.exerciseIndex=0;return s;}));expect(use()).toBeNull();expect(button('Undo')).toBeUndefined();
 act(()=>root.render(null));mount(saved);expect(use()).toBeNull();expect(button('Undo')).toBeUndefined();click(host.querySelector('[aria-label="Log set 1"]'));expect(set().completed).toBe(true);expect(button('Undo')).toBeUndefined();
});
it('reduced motion updates values and confirmation directly while retaining functional Undo',()=>{
 reduced=true;mount();click(openUse());expect(set().weight).toBe(90);expect(animations).toHaveLength(0);expect(button('Undo')).toBeDefined();click(button('Undo'));expect(set().weight).toBeNull();
});

it('a prescribed exercise offers reuse in its menu without an automatic card',()=>{
 mount(recommendedFixture());expect(use()).toBeNull();expect(host.textContent).not.toContain('VALUES MATCH');
 const before=structuredClone(current),action=openUse();expect(action.textContent).toBe('Use for 3 sets');
 expect(document.querySelector('.previous-values-sheet').textContent).toContain('Hack Squat');
 expect(current).toEqual(before);click(action);expect(set().weight).toBe(87.5);click(button('Undo'));expect(current).toEqual(before);
});
it('matching history has neither an automatic hint nor a meaningless menu action',()=>{
 mount(fixture({matching:true}));click(host.querySelector('.exercise-options-button'));
 expect(button('Use previous values')).toBeUndefined();expect(host.textContent).not.toContain('VALUES MATCH');
});
it('Hide survives leaving the workout and a strict reload, while manual reuse remains available',()=>{
 mount();const before=structuredClone(current);click(host.querySelector('.previous-values-hide'));
 expect(use()).toBeNull();expect(current).toEqual(before);expect(updates).not.toHaveBeenCalled();
 const saved=domain.deserializeState(domain.serializeState(current),{strict:true});act(()=>root.render(null));mount(saved);
 expect(use()).toBeNull();click(openUse());expect(set().weight).toBe(90);click(button('Undo'));expect(current).toEqual(saved);expect(use()).toBeNull();
});
it('a new occurrence of the same exercise and a new session may show their own hint',()=>{
 mount();click(host.querySelector('.previous-values-hide'));expect(use()).toBeNull();
 const next=structuredClone(current);next.activeWorkout.exercises[0].id+='-another';act(()=>root.render(null));mount(next);expect(use()).toBeTruthy();
 click(host.querySelector('.previous-values-hide'));next.activeWorkout.id+='-new-session';act(()=>root.render(null));mount(next);expect(use()).toBeTruthy();
});
it('Hide still works for the running app if storing its presentation preference fails',()=>{
 mount();const before=structuredClone(current),blocked=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Storage unavailable');});
 click(host.querySelector('.previous-values-hide'));expect(use()).toBeNull();expect(current).toEqual(before);
 act(()=>root.render(null));mount(before);expect(use()).toBeNull();blocked.mockRestore();
 expect(openUse()).toBeTruthy();
});
it('cancelling manual reuse preserves raw drafts and releases the draft guard for ordinary editing',()=>{
 mount();type(input('weight'),'053,');const before=structuredClone(current);expect(use()).toBeNull();openUse();
 expect(document.querySelector('.previous-values-current').textContent).toContain('053,');click(button('Cancel'));
 expect(current).toEqual(before);expect(input('weight').value).toBe('053,');type(input('weight'),'52');act(()=>input('weight').blur());expect(set().weight).toBe(52);
});
it('an unrelated state update cannot disable resolving a raw edit over matching canonical values',()=>{
 mount(fixture({matching:true}));type(input('weight'),'095,50');act(()=>changeState(s=>{s.profile.showExerciseImages=false;return s;}));
 const action=openUse();expect(action.disabled).toBe(false);click(action);expect(input('weight').value).toBe('90');
 click(button('Undo'));expect(input('weight').value).toBe('095,50');expect(set().weight).toBe(90);
});
it('the Undo lifetime pauses while the app is hidden and resumes with the remaining time',()=>{
 mount();click(openUse());act(()=>vi.advanceTimersByTime(3000));
 const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');act(()=>document.dispatchEvent(new Event('visibilitychange')));
 act(()=>vi.advanceTimersByTime(20000));expect(button('Undo')).toBeTruthy();visibility.mockReturnValue('visible');act(()=>document.dispatchEvent(new Event('visibilitychange')));
 act(()=>vi.advanceTimersByTime(4999));expect(button('Undo')).toBeTruthy();act(()=>vi.advanceTimersByTime(1));settle();expect(button('Undo')).toBeUndefined();
});
