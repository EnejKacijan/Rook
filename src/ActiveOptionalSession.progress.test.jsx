import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {ActiveOptionalSession,NoPlanToday} from './App.jsx';
import * as domain from './domain.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,initial,current,navigation;
const cardio={kind:'Cardio',activity:'Walking',duration:20,intensity:'Easy'};
const interval={kind:'Conditioning',intent:'conditioning',activity:'Rower',format:'intervals',intervals:{rounds:8,workSeconds:30,restSeconds:60},intensity:'Hard'};
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-04T12:00:00'));localStorage.clear();
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 initial=domain.blankState();Object.assign(initial.profile,{onboardingComplete:true,preferredTrainingStyle:'freestyle',noPlanReceipt:{kind:'first-run'}});
 navigation=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
function mount(){function Harness(){const[state,setState]=useState(initial);current=state;return <ActiveOptionalSession state={state} update={fn=>setState(s=>fn(s))} setPage={navigation}/>;}act(()=>root.render(<Harness/>));}
const start=(config,seconds)=>{initial=domain.startOptionalSession(initial,config,Date.now()-seconds*1000);};
const progress=()=>host.querySelector('[role="progressbar"]');
const click=text=>act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===text).click());
it('20-minute Light cardio at 10 minutes shows the canonical target and 50% before controls',()=>{
 start(cardio,600);mount();
 expect(progress().firstChild.style.width).toBe('50%');expect(progress().getAttribute('aria-valuetext')).toBe('10 minutes of 20 minutes');
 expect(host.querySelector('.optional-session-clock').textContent).toBe('10:00');
 expect(host.querySelector('.optional-session-target-time').textContent).toBe('/ 20:00');
 expect(progress().compareDocumentPosition(host.querySelector('.optional-session-actions'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(current).toEqual(initial);
});
it.each([1200,1500])('at/past target %s stays active, caps the bar and exposes a quiet reached state',seconds=>{
 start(cardio,seconds);mount();expect(progress().firstChild.style.width).toBe('100%');
 expect(host.querySelector('[role="status"]').textContent).toBe('Target reached');
 expect(host.querySelector('.optional-session-clock').textContent).toBe(seconds===1200?'20:00':'25:00');
 expect(current.activeOptionalSession.status).toBe('active');expect(current.optionalSessions).toEqual([]);
});
it('steady conditioning uses the same duration model and an edited-before-start target',()=>{
 start({...cardio,kind:'Conditioning',intent:'conditioning',activity:'Bike',format:'steady',duration:30,intensity:'Moderate'},600);mount();
 expect(progress().getAttribute('aria-valuemax')).toBe('1800');expect(host.querySelector('.optional-session-target-time').textContent).toBe('/ 30:00');
 expect(parseFloat(progress().firstChild.style.width)).toBeCloseTo(100/3);
});
it.each([{seconds:279,done:3,phase:'WORK',remaining:'0:21'},{seconds:306,done:4,phase:'REST',remaining:'0:54'},{seconds:639,done:7,phase:'WORK',remaining:'0:21'}])('interval phase $phase at $seconds seconds uses canonical rounds, not duration',({seconds,done,phase,remaining})=>{
 start(interval,seconds);mount();expect(host.querySelector('.conditioning-phase').textContent).toContain(`Round ${done===7?8:4} of 8${phase}`);
 expect(host.querySelector('.optional-session-clock').textContent).toBe(remaining);
 expect(progress().getAttribute('aria-valuenow')).toBe(String(done));expect(progress().getAttribute('aria-valuemax')).toBe('8');
 expect(host.querySelectorAll('[data-state="complete"]')).toHaveLength(done);
 expect(host.querySelectorAll('[role="progressbar"]')).toHaveLength(1);expect(host.querySelector('.session-progress-continuous')).toBeNull();
});
it('interval target completes its segments without auto-finishing the session',()=>{
 start(interval,800);mount();expect(host.querySelector('.conditioning-phase').textContent).toContain('INTERVALS COMPLETE');
 expect(host.querySelectorAll('[data-state="complete"]')).toHaveLength(8);expect(host.querySelector('[data-current]')).toBeNull();
 expect(current.activeOptionalSession).toEqual(initial.activeOptionalSession);expect(current.optionalSessions).toEqual([]);
});
it('foreground after missed ticks reconstructs timed and interval progress from timestamps',()=>{
 start(cardio,120);mount();vi.setSystemTime(Date.now()+480000);act(()=>window.dispatchEvent(new Event('focus')));
 expect(progress().getAttribute('aria-valuenow')).toBe('600');expect(progress().firstChild.style.width).toBe('50%');expect(current).toEqual(initial);
 act(()=>root.unmount());root=createRoot(host);initial=domain.startOptionalSession(domain.blankState(),interval,Date.now());mount();
 vi.setSystemTime(Date.now()+306000);act(()=>document.dispatchEvent(new Event('visibilitychange')));
 expect(progress().getAttribute('aria-valuenow')).toBe('4');expect(host.querySelector('.conditioning-phase').textContent).toContain('Round 4 of 8REST');
});
it('paused time is excluded; resume keeps completed time and uses a fresh running timestamp',()=>{
 start(cardio,600);mount();click('PAUSE');const paused=structuredClone(current);
 vi.setSystemTime(Date.now()+480000);act(()=>window.dispatchEvent(new Event('focus')));
 expect(progress().getAttribute('aria-valuenow')).toBe('600');expect(current).toEqual(paused);
 click('RESUME');act(()=>vi.advanceTimersByTime(60000));expect(progress().getAttribute('aria-valuenow')).toBe('660');
});
it.each([undefined,null,0,-5])('an open-ended/no-target session (%s) has no fabricated progress',duration=>{
 start(cardio,120);initial.activeOptionalSession.duration=duration;mount();
 expect(progress()).toBeNull();expect(host.textContent).toContain('Open-ended');
 expect(host.querySelector('.optional-session-target-reached')).toBeNull();
});
it('current duration-only Mobility does not fabricate movement counts or a movement progress bar',()=>{
 start({kind:'Mobility',activity:'Mobility / recovery',duration:15},180);mount();
 expect(progress()).toBeNull();expect(host.querySelector('.optional-session-clock').textContent).toBe('3:00');expect(host.textContent).toContain('15 min');
 expect(current).toEqual(initial);
});
it('explicit finish removes active progress, records once and keeps completed Today rows compact',()=>{
 start(cardio,600);mount();click('FINISH SESSION');expect(progress()).toBeNull();
 expect(current.activeOptionalSession).toBeNull();expect(current.optionalSessions).toHaveLength(1);
 expect(current.optionalSessions[0].elapsedSeconds).toBe(600);
 act(()=>root.render(<NoPlanToday state={current} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/>));
 expect(host.querySelector('.optional-session-note')).not.toBeNull();expect(progress()).toBeNull();
});
