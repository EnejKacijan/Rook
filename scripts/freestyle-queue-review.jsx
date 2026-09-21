import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ActiveWorkout,Today,Detail,SheetHeader,PlanEditor} from '/src/App.jsx';
import {createReturningUserFixture} from '/src/demoFixture.js';
import {serializeState,deserializeState,isoDay,saveState} from '/src/domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from '/src/freestyleWorkout.js';
import {templateDraft,saveWorkoutTemplate} from '/src/savedWorkouts.js';
import {createCustomExerciseRecord} from '/src/customExercises.js';
import '/src/styles.css';import '/src/overrides.css';import '/src/overlay.css';import '/src/calendar.css';import '/src/workout-controls.css';import '/src/onboarding-controls.css';import '/src/import-plan.css';import '/src/coach.css';import '/src/landing.css';import '/src/theme.css';import '/src/navigationFocus.css';import '/src/activeLoggerTouch.css';
if(!import.meta.env.DEV||location.origin!=='http://127.0.0.1:4198')throw Error('Isolated development review only');
const params=new URLSearchParams(location.search),nativeStorage=window.localStorage,prefix='rook-freestyle-queue-review:';
// Isolate all real persistence calls from other review fixtures and owner data.
Object.defineProperty(window,'localStorage',{value:{getItem:k=>nativeStorage.getItem(prefix+k),setItem:(k,v)=>nativeStorage.setItem(prefix+k,v),removeItem:k=>nativeStorage.removeItem(prefix+k),get length(){return Object.keys(nativeStorage).filter(k=>k.startsWith(prefix)).length;},key:i=>Object.keys(nativeStorage).filter(k=>k.startsWith(prefix))[i]?.slice(prefix.length)}});
function fixture(){let state=createReturningUserFixture(0);state.profile.showExerciseImages=true;state.profile.rirEnabled=params.has('rir');state.profile.restTimerEnabled=false;
 const custom=createCustomExerciseRecord({name:'Very long personal exercise name with a controlled eccentric and deliberate pause on each side',equipment:['dumbbells'],loggingMode:'per_side',loggingType:'weight_reps'});state.customExercises.push(custom);
 const today=new Intl.DateTimeFormat('en',{weekday:'short'}).format(new Date());const day=state.program.days.find(d=>d.weekday===today)||state.program.days[0];day.weekday=today;state.selectedDate=isoDay();
 state=deserializeState(serializeState(state),{strict:true});
 state=startFreestyleWorkout(state);for(const id of ['barbell-bench-press',custom.id,'plank','barbell-row'])state=addFreestyleExercise(state,id);
 state=saveWorkoutTemplate(state,{...templateDraft(state.activeWorkout,state),name:'Personal upper body and controlled unilateral work'},{id:'review-template'});
 state.activeWorkout.exercises[0].sets[0]={...state.activeWorkout.exercises[0].sets[0],weight:62.5,reps:9,completed:true};state.activeWorkout.exercises[0].sets.push({id:'pending-first',weight:65,reps:8,completed:false,touched:true});
 if(params.get('case')==='today')state.activeWorkout=null;return state;}
const initial=params.has('resume')?deserializeState(localStorage.getItem('lift-v2-state'),{strict:true}):fixture();if(!params.has('resume'))saveState(initial);
function Harness(){const [state,setState]=useState(initial),[detail,setDetail]=useState(params.get('case')==='today'?{adjustToday:true}:params.get('case')==='library'?'saved-workouts':params.get('case')==='save'?{saveWorkoutTemplate:{sessionId:initial.activeWorkout.id}}:{freestylePicker:true}),[page,setPage]=useState('workout');
 const update=(fn,options)=>setState(previous=>{const next=fn(structuredClone(previous));if(!options?.persistedState)saveState(next);return next;});
 return <div className="app-shell">{state.activeWorkout&&page==='workout'?<ActiveWorkout state={state} update={update} setDetail={setDetail} setPage={setPage}/>:<Today state={state} update={update} setDetail={setDetail} setPage={setPage}/>}
 {detail&&<div className="modal-layer"><Detail detail={detail} state={state} update={update} close={()=>setDetail(null)} setDetail={setDetail} setPage={setPage}/></div>}
 <output id="domain-proof" hidden>{JSON.stringify({active:state.activeWorkout,templates:state.savedWorkoutTemplates,adaptation:state.todayAdaptation,plan:state.program,detail:typeof detail==='string'?detail:Object.keys(detail||{})})}</output>
 <details id="queue-qa" style={{position:'fixed',bottom:0,left:0,zIndex:2000,background:'var(--rook-surface)',maxWidth:'100%',fontSize:12}}><summary>Queue QA</summary><label>Theme <select defaultValue={params.get('theme')||'premium-dark'} onChange={e=>theme(e.target.value)}>{['light','dark','premium-light','premium-dark'].map(t=><option key={t}>{t}</option>)}</select></label><button onClick={()=>setDetail({freestylePicker:true})}>Open picker</button><button onClick={()=>setDetail('saved-workouts')}>Open library</button><button onClick={()=>setDetail({saveWorkoutTemplate:{sessionId:state.activeWorkout?.id}})}>Save preview</button><button onClick={()=>setDetail(null)}>Workout</button><button onClick={()=>document.documentElement.classList.toggle('qa-large')}>Large text</button><button onClick={()=>swipe('add')}>Swipe first result</button><button onClick={()=>swipe('cancel')}>Cancel first swipe</button></details>
 </div>;}
function theme(value){const root=document.documentElement;root.dataset.appearance=value.includes('dark')?'dark':'light';root.dataset.style=value.startsWith('premium')?'premium':'standard';root.dataset.theme=value;}
function swipe(mode){const target=document.querySelector('.queue-add-swipe[data-swipe-enabled=true] .queue-search-body');if(!target)return;const box=target.getBoundingClientRect(),x=Math.max(box.left+50,60),y=box.top+20;const fire=(type,dx)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:type==='touchend'?[]:[{identifier:1,clientX:x+dx,clientY:y}]});target.dispatchEvent(e);};fire('touchstart',0);fire('touchmove',85);if(mode==='cancel')fire('touchmove',20);fire('touchend',mode==='cancel'?20:85);}
theme(params.get('theme')||'premium-dark');const style=document.createElement('style');style.textContent='.qa-large .queue-search-body,.qa-large .saved-workouts{font-size:125%}.qa-large .queue-search-body small{font-size:16px}';document.head.append(style);createRoot(document.getElementById('root')).render(<Harness/>);
