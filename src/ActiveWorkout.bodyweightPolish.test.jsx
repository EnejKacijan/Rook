import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ActiveWorkout} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,isoDay,serializeState,deserializeState} from './domain.js';
let root,host,current,writes;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-18T12:00:00'));
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('requestAnimationFrame',cb=>setTimeout(cb,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 HTMLElement.prototype.scrollTo=()=>{};host=document.createElement('div');document.body.append(host);root=createRoot(host);writes=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
function mount({weight=null,id='pull-up',units='kg'}={}){
 const s=createReturningUserFixture(0);Object.assign(s.profile,{units,rirEnabled:true,showExerciseImages:false,restTimerEnabled:false});s.selectedDate=isoDay();
 const t=structuredClone(s.program.days[0]);t.exercises=t.exercises.slice(0,2);t.exercises[0].exerciseId=id;
 s.activeWorkout=startWorkout(s,t);s.activeWorkout.startedAt=Date.now()-185000;s.activeWorkout.exercises[0].sets=s.activeWorkout.exercises[0].sets.slice(0,3);
 s.activeWorkout.exercises[0].sets.forEach(set=>Object.assign(set,{weight,reps:9,rir:null,completed:false,weightEntryMode:undefined,weightSourceSetId:undefined}));
 function Harness(){const[state,setState]=useState(s);current=state;return <ActiveWorkout state={state} update={fn=>setState(prev=>{const next=fn(structuredClone(prev));writes(next);return next;})} setPage={()=>{}} setDetail={()=>{}} onLiveFinish={()=>{}}/>;}
 act(()=>root.render(<Harness/>));
}
const input=(n=1)=>host.querySelector(`[aria-label="set ${n}"] .logger-load input`);
const row=(n=1)=>host.querySelector(`[aria-label="set ${n}"]`);
const plus=(n=1)=>row(n).querySelector('.logger-load button:last-child');
const minus=(n=1)=>row(n).querySelector('.logger-load button:first-child');
const label=(n=1)=>row(n).querySelector('.stepper-display-label')?.textContent;
const sets=()=>current.activeWorkout.exercises[0].sets;
function type(el,value){act(()=>el.focus());act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
it.each([null,0])('presents %s as BW with a full accessible description and unchanged numeric value',weight=>{
 mount({weight});expect(label()).toBe('BW');expect(input().value).toBe(weight===null?'':'0');expect(document.getElementById(input().getAttribute('aria-describedby')).textContent).toBe('Bodyweight, no added load');expect(sets()[0].weight).toBe(weight);
});
it.each([5,12.5,999.5])('presents added load %s without writing formatted text to the model',weight=>{
 mount({weight});expect(label()).toBe(`+${weight}`);expect(input().value).toBe(String(weight));expect(sets()[0].weight).toBe(weight);type(input(),'12,5');expect(label()).toBeUndefined();act(()=>input().blur());expect(label()).toBe('+12.5');expect(sets()[0].weight).toBe(12.5);
});
it('raw edit then rapid stepping commits exact increments once and retains input identities',()=>{
 mount();const el=input(),future=input(3),id=current.activeWorkout.id,start=current.activeWorkout.startedAt;
 type(el,'12,5');act(()=>plus().click());expect(sets()[0].weight).toBe(15);act(()=>el.blur());expect(label()).toBe('+15');
 act(()=>{for(let i=0;i<20;i++)plus().click();});expect(sets().map(s=>s.weight)).toEqual([115,115,115]);
 act(()=>{for(let i=0;i<5;i++)minus().click();});expect(sets()[0].weight).toBe(90);expect(writes).toHaveBeenCalledTimes(26);
 expect(input()).toBe(el);expect(input(3)).toBe(future);expect(current.activeWorkout.id).toBe(id);expect(current.activeWorkout.startedAt).toBe(start);
});
it('future manual load survives carry-forward, logging, and serialized reload',()=>{
 mount();type(input(3),'20');act(()=>input(3).blur());act(()=>plus().click());expect(sets().map(s=>s.weight)).toEqual([5,5,20]);
 type(input(),'5');act(()=>row().querySelector('[aria-label="Log set 1"]').click());expect(sets()[0]).toMatchObject({weight:5,completed:true});expect(sets()[2]).toMatchObject({weight:20,completed:false});
 const restored=deserializeState(serializeState(current));expect(restored.activeWorkout.id).toBe(current.activeWorkout.id);expect(restored.activeWorkout.startedAt).toBe(current.activeWorkout.startedAt);expect(restored.activeWorkout.exercises[0].sets.map(s=>[s.weight,s.completed])).toEqual([[5,true],[5,false],[20,false]]);
});
it('zero and optional empty retain null semantics; negative drafts do not invent assistance',()=>{
 mount({weight:1});act(()=>minus().click());expect(sets()[0].weight).toBeNull();expect(label()).toBe('BW');type(input(),'-5');expect(input().value).toBe('');act(()=>input().blur());expect(sets()[0].weight).toBeNull();
});
it('assisted and weighted exercises retain their existing numeric presentation',()=>{
 mount({weight:35,id:'assisted-pull-up'});expect(label()).toBeUndefined();expect(input().value).toBe('35');expect(input().getAttribute('aria-describedby')).toBeNull();
});
it('pound presentation and stepping keep the existing unit conversion',()=>{
 mount({weight:5,units:'lb'});expect(label()).toBe('+11.02');expect(input().value).toBe('11.02');act(()=>plus().click());expect(input().value).toBe('22.05');expect(label()).toBe('+22.05');expect(sets()[0].weight).toBe(10);
});
