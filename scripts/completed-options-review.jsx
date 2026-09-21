import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Today,Detail,ModalLayer} from '/src/App.jsx';
import {createReturningUserFixture} from '/src/demoFixture.js';
import {saveState} from '/src/domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from '/src/freestyleWorkout.js';
import {useSemanticSwipeBack} from '/src/useSemanticSwipeBack.js';
import {bindNavigationFocus} from '/src/navigationFocus.js';
import {observeVisibleViewport} from '/src/sheetVisibleViewport.js';
import '/src/styles.css';import '/src/overrides.css';import '/src/overlay.css';import '/src/calendar.css';import '/src/workout-controls.css';import '/src/onboarding-controls.css';import '/src/import-plan.css';import '/src/coach.css';import '/src/landing.css';import '/src/theme.css';import '/src/navigationFocus.css';
if(!import.meta.env.DEV||location.origin!=='http://127.0.0.1:4198')throw Error('Isolated development review only');
const params=new URLSearchParams(location.search),storage=window.localStorage,prefix='rook-completed-options-review:';
Object.defineProperty(window,'localStorage',{value:{getItem:k=>storage.getItem(prefix+k),setItem:(k,v)=>storage.setItem(prefix+k,v),removeItem:k=>storage.removeItem(prefix+k)}});
for(const key of ['rook-install-meta-v1','rook-recovery-v1','rook-restore-journal-v1'])localStorage.removeItem(key);
const theme=params.get('theme')||'standard-light';document.documentElement.dataset.appearance=theme.endsWith('dark')?'dark':'light';document.documentElement.dataset.style=theme.startsWith('premium')?'premium':'standard';
let initial=createReturningUserFixture(2);initial.activeWorkout=null;initial.todayAdaptation=null;initial.profile.restTimerEnabled=false;
const completed=initial.workouts[0];completed.name='Upper body, controlled unilateral strength and deliberate recovery';completed.durationSeconds=3600;completed.sessionNote='Preserve this completed workout note.';
if(params.has('active'))initial=addFreestyleExercise(startFreestyleWorkout(initial),'plank');
saveState(initial);bindNavigationFocus();observeVisibleViewport();
function Harness(){
 useSemanticSwipeBack();const background=useRef(null);
 const[state,setState]=useState(initial),[detail,setDetail]=useState({completedWorkout:completed.id}),[page,setPage]=useState('today');
 const update=(fn,options)=>setState(previous=>{const next=fn(structuredClone(previous));if(!options?.persistedState)saveState(next);return next;});
 return <><div ref={background} className="app-shell"><Today state={state} update={update} setDetail={setDetail} setPage={setPage}/></div>
 {detail&&<ModalLayer backgroundRef={background} close={()=>setDetail(null)}>{requestClose=><Detail detail={detail} state={state} update={update} close={requestClose} setDetail={setDetail} setPage={setPage}/>}</ModalLayer>}
 <output id="completed-options-proof" hidden>{JSON.stringify({state,detail,page})}</output></>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
