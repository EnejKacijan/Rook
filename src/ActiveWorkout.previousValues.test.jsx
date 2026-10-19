import React,{act,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {ActiveWorkout,Detail,ModalLayer} from './App.jsx';
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
const button=text=>[...document.querySelectorAll('button')].find(b=>!b.closest('[inert]')&&b.textContent.trim()===text);
const use=()=>host.querySelector('.previous-values-action'),click=node=>act(()=>node.click());
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

const snackbar=()=>document.querySelector('.previous-values-snackbar');
const noPanel=()=>{expect(host.querySelector('.freestyle-history-aid,.freestyle-copy-helper,.freestyle-copy-applied')).toBeNull();expect(host.textContent).not.toMatch(/VALUES MATCH|Previous values applied|Values already populated|History available|View exercise history/);};
it('scheduled history remains populated with only its compact summary',()=>{
 const state=fixture({matching:true});state.activeWorkout.source='plan';delete state.activeWorkout.exercises[0].prescriptionSource;
 mount(state);expect(use()).toBeNull();expect(set()).toMatchObject({weight:90,reps:7});expect(host.querySelector('.exercise-history-meta').textContent).toBe('Last 7');noPanel();expect(snackbar()).toBeNull();
});
it.each(['plan','freestyle'])('%s without history has no history controls or empty wrapper',source=>{
 const state=fixture();state.activeWorkout.source=source;state.workouts=[];mount(state);expect(use()).toBeNull();expect(host.querySelector('.freestyle-previous')).toBeNull();noPanel();
});
it('a manually added exercise in a planned session offers the single inline action',()=>{
 const state=fixture();state.activeWorkout.source='plan';mount(state);expect(use().textContent).toBe('Use last values');expect(use().closest('.exercise-heading-content')).not.toBeNull();noPanel();
});
it.each(['matching','touched','manual','completed','replaced','saved-template'])('hides redundant or unsafe reuse for %s',kind=>{
 const state=fixture({matching:kind==='matching'}),exercise=state.activeWorkout.exercises[0];
 if(kind==='touched')Object.assign(exercise.sets[1],{reps:13,touched:true});
 if(kind==='manual')Object.assign(exercise.sets[1],{reps:13,repsEntryMode:'manual'});
 if(kind==='completed')exercise.sets[1].completed=true;
 if(kind==='replaced')exercise.replacementOfExerciseId='leg-press';
 if(kind==='saved-template')exercise.prescriptionSource='saved-template';
 mount(state);expect(use()).toBeNull();noPanel();
});
it('safe automatic defaults can be replaced without treating numbers as user edits',()=>{
 const state=fixture();Object.assign(state.activeWorkout.exercises[0].sets[0],{weight:50,reps:10,weightEntryMode:'auto',repsEntryMode:'auto'});
 mount(state);expect(use()).toBeTruthy();click(use());expect(set()).toMatchObject({weight:90,reps:7,rir:null,completed:false});
});
it.each(['53,','082,50','.','9'])('raw user input %s immediately hides reuse and stale button activation is harmless',raw=>{
 mount();const stale=use(),before=structuredClone(current);type(input('weight'),raw);expect(use()).toBeNull();click(stale);expect(current).toEqual(before);expect(input('weight').value).toBe(raw);expect(snackbar()).toBeNull();
});
it('explicit application saves once, keeps rows and identity, and uses only the shared transient snackbar',()=>{
 mount();const before=structuredClone(current),weight=input('weight'),save=vi.spyOn(domain,'saveState'),apply=use();
 act(()=>{apply.click();apply.click();});expect(save).toHaveBeenCalledOnce();expect(updates).toHaveBeenCalledOnce();expect(set()).toMatchObject({weight:90,reps:7,rir:null,completed:false,touched:true});
 expect(current.activeWorkout.id).toBe(before.activeWorkout.id);expect(current.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);expect(current.activeWorkout.rest).toEqual(before.activeWorkout.rest);expect(current.workouts).toEqual(before.workouts);expect(input('weight')).toBe(weight);
 expect(use()).toBeNull();expect(snackbar().textContent).toBe('Previous values appliedUndo');expect(host.contains(snackbar())).toBe(false);noPanel();
});
it.each(['weight','reps'])('focus-only blank %s can apply and Undo restores its exact pre-application draft',field=>{
 mount();const node=input(field),before=structuredClone(current);act(()=>node.focus());pointerApply();expect(set().weight).toBe(90);click(button('Undo'));expect(current).toEqual(before);
 const detail={};node.dispatchEvent(new CustomEvent('rook-snapshot-draft',{detail}));expect(detail.snapshot.draft).toBe('');expect(snackbar()).toBeNull();expect(use()).toBeTruthy();
});
it('Undo preserves later notes, rest and edits to another exercise',()=>{
 mount();const before=structuredClone(set());click(use());act(()=>changeState(s=>{s.activeWorkout.note='Keep';s.activeWorkout.rest.endsAt+=100;s.activeWorkout.exercises[1].sets[0].reps=15;return s;}));
 click(button('Undo'));expect(set()).toEqual(before);expect(current.activeWorkout.note).toBe('Keep');expect(current.activeWorkout.exercises[1].sets[0].reps).toBe(15);
});
it.each(['raw','canonical','completed','profile','replacement'])('new %s work safely invalidates Undo without overwriting it',kind=>{
 mount();click(use());const stale=button('Undo');
 if(kind==='raw')type(input('weight'),'095,50');
 else act(()=>changeState(s=>{if(kind==='profile')s.profile.id='new-profile';else if(kind==='replacement')s.activeWorkout.exercises[0].exerciseId='leg-press';else s.activeWorkout.exercises[0].sets[0][kind==='completed'?'completed':'reps']=kind==='completed'?true:19;return s;}));
 const before=structuredClone(current);expect(snackbar()).toBeNull();click(stale);expect(current).toEqual(before);if(kind==='raw')expect(input('weight').value).toBe('095,50');
});
it('shared snackbar disappears after five seconds without changing applied values',()=>{
 mount();click(use());act(()=>vi.advanceTimersByTime(5000));expect(snackbar()).toBeNull();expect(set().weight).toBe(90);noPanel();
});
it('swiping the shared snackbar dismisses feedback and keeps the applied transaction',()=>{
 mount();click(use());const applied=structuredClone(current),notice=snackbar();
 act(()=>{notice.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:20,clientY:400}));notice.dispatchEvent(new MouseEvent('pointerup',{bubbles:true,clientX:150,clientY:402}));});
 expect(snackbar()).toBeNull();expect(current).toEqual(applied);
});
it('failed save preserves the eligible draft; failed Undo keeps feedback for retry',()=>{
 mount();const before=structuredClone(current),save=vi.spyOn(domain,'saveState').mockReturnValue(false);click(use());expect(current).toEqual(before);expect(snackbar()).toBeNull();expect(host.querySelector('[role="alert"]').textContent).toContain('Could not save');
 save.mockRestore();click(use());const applied=structuredClone(current),failure=vi.spyOn(domain,'saveState').mockReturnValue(false);click(button('Undo'));expect(current).toEqual(applied);expect(snackbar()).toBeTruthy();failure.mockRestore();click(button('Undo'));expect(current).toEqual(before);
});
it.each([{id:'hack-squat',units:'lb',rir:false},{id:'pull-up'},{id:'assisted-pull-up'},{id:'plank'},{mode:'per_side'}])('canonical compatibility and exact Undo for %j',options=>{
 mount(fixture(options));const before=structuredClone(current);click(use());expect(set().reps).toBe(options.id==='plank'?45:7);expect(set().weight).toBe(options.id==='plank'?null:90);
 if(options.units==='lb')expect(input('weight').value).toBe(String(domain.displayWeight(90,'lb')));
 if(options.mode==='per_side')expect(set().sides).toEqual({left:{reps:7},right:{reps:9}});
 click(button('Undo'));expect(current).toEqual(before);
});
it('exercise switching and reload keep values without replaying feedback or an action',()=>{
 mount();click(use());const saved=domain.deserializeState(domain.serializeState(current),{strict:true});act(()=>changeState(s=>{s.activeWorkout.exerciseIndex=1;return s;}));expect(snackbar()).toBeNull();act(()=>changeState(s=>{s.activeWorkout.exerciseIndex=0;return s;}));expect(use()).toBeNull();
 act(()=>root.render(null));mount(saved);expect(set()).toMatchObject({weight:90,reps:7});expect(snackbar()).toBeNull();expect(use()).toBeNull();noPanel();
});
it('reduced motion retains functional application and shared Undo',()=>{reduced=true;mount();const before=structuredClone(current);click(use());expect(snackbar()).toBeTruthy();click(button('Undo'));expect(current).toEqual(before);});
it.each([2,3,6])('one explicit tap populates all %i current sets, and Undo restores all of them',count=>{
 mount(fixture({sets:count}));const before=structuredClone(current),save=vi.spyOn(domain,'saveState');click(use());
 expect(current.activeWorkout.exercises[0].sets).toHaveLength(count);expect(current.activeWorkout.exercises[0].sets.every(set=>set.weight===90&&set.reps===7&&!set.completed)).toBe(true);expect(save).toHaveBeenCalledOnce();expect(snackbar()).toBeTruthy();expect(use()).toBeNull();
 click(button('Undo'));expect(current).toEqual(before);
});

function mountDetails(initial){
 function Harness(){const[state,setState]=useState(initial),[detail,setDetail]=useState(null),background=useRef(null);current=state;
 changeState=fn=>setState(s=>fn(structuredClone(s)));
 return <><div ref={background}><ActiveWorkout state={state} update={changeState} setDetail={setDetail} setPage={navigate}/></div>{detail&&<ModalLayer backgroundRef={background} close={()=>setDetail(null)}>{close=><Detail detail={detail} state={state} update={changeState} close={close} setDetail={setDetail}/>}</ModalLayer>}</>;
 }act(()=>root.render(<Harness/>));
}
const advance=()=>act(()=>vi.advanceTimersByTime(250));
const detailAction=()=>[...document.querySelectorAll('.choice-row')].find(node=>node.querySelector('strong')?.textContent==='View exercise details');
const replacementChoice=()=>[...document.querySelectorAll('.choice-row')].find(node=>node.querySelector('strong')?.textContent==='Pull-up');
async function openReplacement(){
 click(button('Replace'));await act(async()=>{vi.advanceTimersByTime(100);await Promise.resolve();});
 click(button('Search all exercises'));advance();
}
it.each(['plan','added'])('Replace in %s uses B history automatically without carrying A results or exposing reuse',async kind=>{
 const state=fixture({id:'pull-up'}),e=state.activeWorkout.exercises[0];state.activeWorkout.source='plan';
 if(kind==='plan')delete e.prescriptionSource;
 e.repMin=6;e.repMax=10;e.exerciseId='assisted-pull-up';Object.assign(e.sets[0],{weight:20,reps:4,touched:true,weightEntryMode:'manual',repsEntryMode:'manual'});
 const before=structuredClone(state);mountDetails(state);await openReplacement();click(replacementChoice());advance();
 expect(current.activeWorkout.id).toBe(before.activeWorkout.id);expect(current.activeWorkout.exercises[0].id).toBe(e.id);expect(current.activeWorkout.exercises[0].exerciseId).toBe('pull-up');
 expect(set()).toMatchObject({weight:90,reps:7,rir:null,completed:false});expect(set().touched).toBeUndefined();expect(set().weightEntryMode).toBeUndefined();expect(current.activeWorkout.exercises[0].sets).toHaveLength(3);expect(current.activeWorkout.exercises[0].sets[1].reps).toBe(kind==='plan'?6:null);
 expect(host.querySelector('.exercise-history-meta').textContent).toBe('Last 7');expect(use()).toBeNull();expect(snackbar()).toBeNull();expect(current.workouts).toEqual(before.workouts);noPanel();
});
it.each(['profile','session'])('stale Replace cannot write into a different %s',async kind=>{
 const state=fixture({id:'pull-up'});state.activeWorkout.exercises[0].exerciseId='assisted-pull-up';mountDetails(state);await openReplacement();const stale=replacementChoice();
 act(()=>changeState(s=>{if(kind==='profile')s.profile.id='other';else s.activeWorkout.id='other';return s;}));const before=structuredClone(current);click(stale);expect(current).toEqual(before);
});
it('the existing options action opens canonical history and progression for a prescribed instance and Close returns to logging',()=>{
 const state=fixture({id:'pull-up'});state.activeWorkout.source='plan';delete state.activeWorkout.exercises[0].prescriptionSource;Object.assign(state.activeWorkout.exercises[0],{repMin:6,repMax:10});
 mountDetails(state);click(host.querySelector('[aria-label="Exercise options"]'));advance();expect(detailAction()).toBeTruthy();expect(document.querySelectorAll('.active-exercise-options-sheet .choice-row').length).toBeGreaterThan(0);
 click(detailAction());advance();const sheet=document.querySelector('.detail-screen');expect(sheet.querySelector('.detail-header').textContent).toContain('Pull-up');expect(sheet.textContent).toContain('HISTORY');expect(sheet.textContent).toContain('PROGRESSION');expect(sheet.textContent).toContain('7 reps');
 const before=structuredClone(current);click(document.querySelector('[aria-label="Close Pull-up details"]'));advance();expect(document.querySelector('.detail-screen')).toBeNull();expect(host.querySelector('.exercise-heading h1').textContent).toBe('Pull-up');expect(current).toEqual(before);
});
