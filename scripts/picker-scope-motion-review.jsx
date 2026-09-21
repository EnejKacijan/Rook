import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ActiveWorkout,Detail,ModalLayer} from '/src/App.jsx';
import {createReturningUserFixture} from '/src/demoFixture.js';
import {saveState} from '/src/domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from '/src/freestyleWorkout.js';
import {templateDraft,saveWorkoutTemplate} from '/src/savedWorkouts.js';
import {observeVisibleViewport} from '/src/sheetVisibleViewport.js';
import '/src/styles.css';import '/src/overrides.css';import '/src/overlay.css';import '/src/calendar.css';import '/src/workout-controls.css';import '/src/theme.css';import '/src/navigationFocus.css';import '/src/activeLoggerTouch.css';
if(!import.meta.env.DEV||location.origin!=='http://127.0.0.1:4198')throw Error('Isolated development review only');
const params=new URLSearchParams(location.search),theme=params.get('theme')||'standard-light';
const nativeStorage=window.localStorage,prefix='rook-picker-scope-motion-review:';
Object.defineProperty(window,'localStorage',{value:{getItem:k=>nativeStorage.getItem(prefix+k),setItem:(k,v)=>nativeStorage.setItem(prefix+k,v),removeItem:k=>nativeStorage.removeItem(prefix+k)}});
document.documentElement.dataset.appearance=theme.endsWith('dark')?'dark':'light';
document.documentElement.dataset.style=theme.startsWith('premium')?'premium':'standard';
let initial=addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(1)),'plank');
initial.profile.restTimerEnabled=false;
if(params.get('saved')!=='empty')for(let i=1;i<=18;i++)initial=saveWorkoutTemplate(initial,{...templateDraft(initial.activeWorkout,initial),name:`Upper routine ${i} with controlled recovery`},{id:`scope-review-${i}`});
saveState(initial);
// An explicit QA-only viewport model, not a claim to emulate the native keyboard.
const simulate=params.get('keyboard')==='simulated',vv=new EventTarget();
if(simulate){Object.assign(vv,{height:innerHeight,width:innerWidth,offsetTop:0,offsetLeft:0,scale:1});Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});}
observeVisibleViewport();
const keyboard=open=>{if(!simulate)return;Object.assign(vv,{height:open?480:innerHeight,offsetTop:open?24:0});vv.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('scroll'));};
function Harness(){
  const background=useRef(null),[state,setState]=useState(initial),[detail,setDetail]=useState({freestylePicker:true});
  const update=(fn,options)=>setState(previous=>{const next=fn(structuredClone(previous));if(!options?.persistedState)saveState(next);return next;});
  return <><div ref={background} className="app-shell"><ActiveWorkout state={state} update={update} setDetail={setDetail} setPage={()=>{}}/></div>
    {detail&&<ModalLayer backgroundRef={background} close={()=>setDetail(null)}>{close=><Detail detail={detail} state={state} update={update} close={close} setDetail={setDetail} setPage={()=>{}}/>}</ModalLayer>}
    {simulate&&<aside style={{position:'fixed',bottom:0,left:0,zIndex:100000,background:'#fff',color:'#000'}}><button id="qa-keyboard-open" onPointerDown={e=>e.preventDefault()} onClick={()=>keyboard(true)}>QA keyboard open</button><button id="qa-keyboard-close" onPointerDown={e=>e.preventDefault()} onClick={()=>keyboard(false)}>QA keyboard close</button></aside>}
    <output id="scope-proof" hidden>{JSON.stringify(state)}</output></>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
