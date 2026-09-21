import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PlanEditor,EntryLanding,Onboarding,ImportPlan,ScratchPlan} from '/src/App.jsx';
import {createReturningUserFixture} from '/src/demoFixture.js';
import {startWorkout,serializeState,STORAGE_KEY,isoDay} from '/src/domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from '/src/freestyleWorkout.js';
import {AIService} from '/src/aiService.js';
import {todayMissedRestFixture} from '/src/todayMissedRest.fixture.js';
import {createCustomExercise} from '/src/customExercises.js';
import {measureContainment} from './containment-contract.js';
import {measureActiveSetLayout} from './active-set-layout-contract.mjs';
import '/src/styles.css';import '/src/overrides.css';import '/src/overlay.css';import '/src/calendar.css';import '/src/workout-controls.css';import '/src/onboarding-controls.css';import '/src/import-plan.css';import '/src/coach.css';import '/src/landing.css';import '/src/theme.css';import '/src/navigationFocus.css';import '/src/activeLoggerTouch.css';
if(!import.meta.env.DEV||location.origin!=='http://127.0.0.1:4198')throw Error('Isolated local review only');
const real=window.localStorage,prefix='rook-containment-review:';
Object.defineProperty(window,'localStorage',{value:{getItem:k=>real.getItem(prefix+k),setItem:(k,v)=>real.setItem(prefix+k,v),removeItem:k=>real.removeItem(prefix+k)}});
const params=new URLSearchParams(location.search),scenario=params.get('case')||'planned',kind=params.get('kind')||'weighted';
const long='Upper Strength and Hypertrophy A';
let state=['missed','rest'].includes(scenario)?todayMissedRestFixture({count:scenario==='rest'?0:3}):createReturningUserFixture(2);
if(['today','rest'].includes(scenario))state.workouts=[];
state.selectedDate=isoDay();state.profile.name='Alexandertest Longdisplayname';
createCustomExercise(state,{name:'Single-Leg Romanian Deadlift with a deliberately long custom variation and controlled tempo',notes:'Technique '+ 'LongUnbrokenReference'.repeat(10),equipment:['dumbbells'],primaryMuscle:'Hamstrings / glutes'});
Object.assign(state.profile,{rirEnabled:params.get('rir')!=='off',restTimerEnabled:true,showExerciseImages:true});
state.program.name=long+' · four-day training plan';
state.program.days.forEach((d,i)=>{d.name=long+' '+(i+1);if(d.workoutName)d.workoutName=d.name;d.exercises[0].importedName='Single-Leg Romanian Deadlift with a deliberately long custom variation';d.exercises[1].importedName='Single-Leg Leg Extension';d.exercises[2].importedName='Bulgarian Split Squat';});
state.workouts.forEach(w=>{w.name=long;w.exercises[0].importedName='Single-Leg Romanian Deadlift with a deliberately long custom variation';});
if(['planned','freestyle'].includes(scenario)) {
 const ids=kind==='timed'?['plank','side-plank']:kind==='bodyweight'?['pull-up','push-up']:kind==='per-side'?['split-squat','bulgarian-split-squat']:['barbell-bench-press','dumbbell-bench-press'];
 if(scenario==='freestyle'){state=startFreestyleWorkout(state);for(const id of ids)state=addFreestyleExercise(state,id);}
 else {state.program.days[0].exercises.slice(0,2).forEach((e,i)=>e.exerciseId=ids[i]);state.activeWorkout=startWorkout(state,state.program.days[0]);}
 state.activeWorkout.exercises.forEach((e,i)=>{if(kind==='per-side')e.loggingMode='per_side';e.importedName=i?'Bulgarian Split Squat':'Single-Leg Romanian Deadlift with a deliberately long custom variation';e.sets=Array.from({length:3},(_,j)=>({...e.sets[j]||e.sets[0],id:`containment-set-${i}-${j}`}));e.sets.forEach((s,j)=>Object.assign(s,{added:j===1,weight:kind==='timed'||kind==='bodyweight'?null:52.5,reps:kind==='timed'?30:12,rir:2,completed:j===0,...(kind==='per-side'?{sides:{left:{reps:12,completed:j===0},right:{reps:12,completed:j===0}}}:{})}));});
 state.activeWorkout.rest={seconds:90,endsAt:Date.now()+90000};
}
state.activeCoachConversationId='containment-chat';delete state.coachConversationMeta;
state.conversations=Array.from({length:4},(_,i)=>({id:'containment-'+i,conversationId:'containment-chat',createdAt:Date.now(),user:'Could we review the Single-Leg Romanian Deadlift with a longer description?',reply:{text:'A deliberately long coaching answer to check readable line wrapping. '+ 'https://example.test/'+ 'LongUnbrokenReference'.repeat(8)+'\nKeep the exercise controlled and log your completed sets.'}}));
// Only this fixture's disposable namespace, never owner/other-review storage.
for(let i=real.length-1;i>=0;i--){const key=real.key(i);if(key.startsWith(prefix))real.removeItem(key);}
if(scenario!=='landing')localStorage.setItem(STORAGE_KEY,serializeState(state));
AIService.status=async()=>({available:true});AIService.coach=async()=>({text:'Synthetic local reply.'});
const vv=new EventTarget();Object.assign(vv,{height:innerHeight,width:innerWidth,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});
if(scenario==='editor'||scenario==='import-review') {
 const preview=scenario==='import-review'?await AIService.importTrainingPlan(state.profile,'Monday: Upper Strength and Hypertrophy A\nPlank 3 sets\nChest flys 4 sets\nSingle-Leg Romanian Deadlift 3x8\nNote: '+ 'LongUnbrokenReference'.repeat(15),{review:true}):null;
 createRoot(document.getElementById('root')).render(<div className="app-shell"><main className={`screen detail-screen ${preview?'import-plan-screen':'edit-plan-screen'}`}><PlanEditor source={preview?.program||state.program} sourceReview={preview?.sourceReview} profile={preview?.profile||state.profile} mode={preview?'import':'edit'} exerciseState={state} onSave={()=>{}} onCancel={()=>{}}/></main></div>);
}
else if(scenario==='landing') {
 function FirstRunFixture(){const [page,setPage]=useState('landing'),[draft,setDraft]=useState(state);const update=fn=>setDraft(s=>fn(structuredClone(s)));return page==='landing'?<EntryLanding personalize={()=>setPage('setup')} importPlan={()=>setPage('import')} startFromScratch={()=>setPage('scratch')} restoreBackup={()=>{}}/>:page==='setup'?<Onboarding update={update} exit={()=>setPage('landing')} onPlanAccepted={()=>{}}/>:page==='import'?<ImportPlan state={draft} update={update} close={()=>setPage('landing')} initial onPlanAccepted={()=>{}}/>:<ScratchPlan state={draft} update={update} close={()=>setPage('landing')} onPlanAccepted={()=>{}}/>;}
 createRoot(document.getElementById('root')).render(<div className="app-shell"><FirstRunFixture/></div>);
} else await import('/src/main.jsx');
const qa=document.createElement('details');qa.id='containment-qa';qa.style.cssText='position:fixed;top:70px;right:0;z-index:99999;background:#eee;color:#111;font:11px system-ui;width:160px';
qa.innerHTML='<summary>Containment QA</summary><label>Audit theme <select id="audit-theme"><option>light</option><option>dark</option><option>premium-light</option><option>premium-dark</option></select></label><button id="audit">Measure layout</button><button id="keyboard">Keyboard model</button><button id="font">Text 120%</button><pre id="containment-proof" style="white-space:pre-wrap;max-height:150px;overflow:auto"></pre>';
const style=document.createElement('style');style.textContent='#containment-qa button,#containment-qa label{display:block;min-height:36px;padding:4px;margin:2px;width:calc(100% - 4px)}';document.head.append(style);document.body.append(qa);
const el=id=>document.getElementById(id);
el('audit-theme').onchange=()=>{const value=el('audit-theme').value;Object.assign(document.documentElement.dataset,{theme:value.startsWith('premium')?'premium':value,appearance:value.endsWith('dark')?'dark':'light',style:value.startsWith('premium')?'premium':'standard'});};
let textScaled=false;
el('audit').onclick=()=>{qa.open=false;qa.hidden=true;const result=measureContainment();if(document.querySelector('#root .workout-screen .set-row')&&!document.querySelector('[role=dialog]')&&!textScaled){try{measureActiveSetLayout();result.loggerContract='passed';}catch(error){result.issues.push({kind:'logger/contract',text:error.message});}}el('containment-proof').textContent=JSON.stringify(result);qa.hidden=false;};
el('keyboard').onclick=()=>{const field=document.querySelector('.modal-layer input,.modal-layer textarea,.coach-input textarea');field?.focus({preventScroll:true});Object.assign(vv,{height:480,offsetTop:24,width:innerWidth});vv.dispatchEvent(new Event('resize'));qa.open=false;};
el('font').onclick=()=>{textScaled=true;const nodes=[...document.querySelectorAll('#root *')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize)]);nodes.forEach(([n,size])=>n.style.fontSize=`${size*1.2}px`);qa.open=false;};
