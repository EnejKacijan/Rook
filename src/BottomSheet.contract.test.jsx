import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Detail,ModalLayer,SheetHeader} from './App.jsx';
import {AccountSyncPanel} from './AccountSyncPanel.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout} from './domain.js';
import {useAnimationClock} from './testAnimationClock.js';

let host,root,state,close,update;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  useAnimationClock();vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  HTMLElement.prototype.scrollIntoView=()=>{};HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.setPointerCapture=()=>{};
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  state=createReturningUserFixture(0);state.profile.showExerciseImages=false;state.activeWorkout=startWorkout(state,state.program.days[0]);
  state.activeWorkout.exercises.forEach(e=>{e.supersetId=null;e.sets=e.sets.slice(0,1);});close=vi.fn();update=vi.fn();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const advance=ms=>act(()=>vi.advanceTimersByTime(ms));
const pointer=(h,type,y)=>act(()=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{clientX:190,clientY:y,pointerId:1,pointerType:'mouse',button:0});h.dispatchEvent(e);});
function renderDetail(detail){act(()=>root.render(<ModalLayer backgroundRef={{current:null}} close={close}>{requestClose=><Detail detail={detail} state={state} update={update} close={requestClose} setDetail={()=>{}} setPage={()=>{}}/>}</ModalLayer>));advance(300);}

it.each(['logout-confirm','change-plan','logging','appearance','backup-rook','restore-backup','saved-workouts','training-priorities','training-restrictions','profile-details','custom-exercises','gym-profiles','import-plan','import-workout-history','export-workout-history'])('%s has exactly one real canonical handle',detail=>{
  renderDetail(detail);expect(host.querySelectorAll('.modal-drag-handle')).toHaveLength(1);
  expect(host.querySelectorAll('[aria-label="Drag down or tap to close"]')).toHaveLength(1);
});
it.each(['options','exerciseNote','replace','superset','locked-superset','empty-superset','workoutOptions','upNextOptions'])('%s uses the shared live transform, cancel and dismissal without mutating the workout',kind=>{
  const e=state.activeWorkout.exercises[0];
  if(kind==='locked-superset')e.sets[0].completed=true;
  if(kind==='empty-superset')state.activeWorkout.exercises=[e];
  const detail=kind.includes('superset')?{superset:e}:{[kind]:kind==='workoutOptions'?true:e};renderDetail(detail);
  const panel=host.querySelector('.modal-layer').firstElementChild,h=panel.querySelector('.modal-drag-handle');expect(h).not.toBeNull();
  expect(panel.querySelectorAll('[aria-label="Drag down or tap to close"]')).toHaveLength(1);
  vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({height:500,top:344,bottom:844,width:390,left:0,right:390});
  pointer(h,'pointerdown',100);advance(250);pointer(h,'pointermove',130);act(()=>vi.advanceTimersToNextFrame());
  expect(panel.style.transform).toBe('translate3d(0, 30px, 0)');expect(Number(host.querySelector('.sheet-drag-scrim').style.opacity)).toBeCloseTo(1-30/325);
  pointer(h,'pointercancel',130);advance(220);expect(panel.style.transform).toBe('');expect(host.querySelector('.sheet-drag-scrim')).toBeNull();expect(close).not.toHaveBeenCalled();
  pointer(h,'pointerdown',100);advance(250);pointer(h,'pointermove',260);pointer(h,'pointerup',260);advance(220);
  expect(close).toHaveBeenCalledOnce();expect(update).not.toHaveBeenCalled();
});
it('header changes inside a child component transfer the sole gesture owner to the new header',async()=>{
  function Destination(){const[compact,setCompact]=useState(false);return compact?<main className="sheet"><header className="sheet-header-chrome"/><h2>New destination</h2></main>:<main className="screen detail-screen"><SheetHeader title="Start"/><button onClick={()=>setCompact(true)}>Next</button></main>;}
  act(()=>root.render(<ModalLayer backgroundRef={{current:null}} close={close}><Destination/></ModalLayer>));
  const old=host.querySelector('.modal-drag-handle');await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Next').click());
  expect(host.querySelectorAll('.modal-drag-handle')).toHaveLength(1);expect(old.isConnected).toBe(false);
  expect(host.querySelector('.modal-drag-handle').parentElement.matches('.sheet-header-chrome')).toBe(true);
});
it('account confirmation drag and X are cancellation only, never sign-out',()=>{
  const signOut=vi.fn();act(()=>root.render(<AccountSyncPanel Modal={ModalLayer} sync={{linked:true,state:'synced',signOutAccount:signOut}}/>));
  const open=()=>act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent.startsWith('Sign out')).click());open();advance(300);
  let panel=document.querySelector('.account-confirm-sheet'),h=panel.querySelector('.modal-drag-handle');expect(h).not.toBeNull();
  vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({height:400});pointer(h,'pointerdown',100);advance(250);pointer(h,'pointermove',260);pointer(h,'pointerup',260);advance(220);
  expect(document.querySelector('.account-confirm-sheet')).toBeNull();expect(signOut).not.toHaveBeenCalled();
  open();act(()=>document.querySelector('.account-confirm-sheet .sheet-close').click());advance(220);expect(signOut).not.toHaveBeenCalled();
});
it.each(['fullscreen','editor-page'])('%s stays a separate presentation without a bottom-sheet handle',presentation=>{
  act(()=>root.render(<ModalLayer presentation={presentation} close={close} backgroundRef={{current:null}}><main className="screen detail-screen"><SheetHeader title="Page"/></main></ModalLayer>));
  expect(host.querySelector('.modal-drag-handle')).toBeNull();
});
