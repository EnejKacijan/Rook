import React,{useState,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {ActiveWorkout,PlanEditor,Today,ActiveWorkoutOptions} from '/src/App.jsx';
import {createReturningUserFixture} from '/src/demoFixture.js';
import {startWorkout,serializeState,deserializeState,isoDay,estimateWorkoutMinutes} from '/src/domain.js';
import {interactionFeedback} from '/src/interactionFeedback.js';
import {startFreestyleWorkout,addFreestyleExercise} from '/src/freestyleWorkout.js';
import '/src/styles.css';import '/src/overrides.css';import '/src/overlay.css';import '/src/calendar.css';import '/src/workout-controls.css';import '/src/onboarding-controls.css';import '/src/import-plan.css';import '/src/coach.css';import '/src/landing.css';import '/src/theme.css';import '/src/navigationFocus.css';import '/src/activeLoggerTouch.css';
if(!import.meta.env.DEV||location.origin!=='http://127.0.0.1:4198')throw Error('Isolated development review only');
const params=new URLSearchParams(location.search),scenario=params.get('case')||'active',key='rook-initial-reorder-review:'+scenario;
const nativeStorage=window.localStorage,prefix='rook-initial-reorder:';Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>nativeStorage.getItem(prefix+k),setItem:(k,v)=>nativeStorage.setItem(prefix+k,v),removeItem:k=>nativeStorage.removeItem(prefix+k)}});
const feedbackCounts={pickup:0,selection:0,drop:0,threshold:0},originalFeedback={...interactionFeedback};for(const kind of Object.keys(feedbackCounts))interactionFeedback[kind]=(...args)=>{feedbackCounts[kind]++;return originalFeedback[kind](...args);};
const names=['Leg Press','Hack Squat','Single-Leg Leg Extension','Single-Leg Hamstring Curl','Calf Raises na Leg Press mašini','Straight Bar Cable Pushdown','Step-down'];
function fixture(){
 let state=createReturningUserFixture(0);
 Object.assign(state.profile,{showExerciseImages:false,restTimerEnabled:false,rirEnabled:params.has('rir')});
 const day=structuredClone(state.program.days[0]);while(day.exercises.length<7){const n=day.exercises.length;day.exercises.push({...structuredClone(day.exercises[1]),id:'fixture-exercise-'+n});}
 day.exercises.forEach((e,i)=>{e.importedName=names[i%names.length];e.repMin=e.repMax=[8,7,9,8,10,12,15][i%7];e.targetRir=null;e.notes='';e.personalNote='';});
 day.estimatedMinutes=estimateWorkoutMinutes(day,state.profile,state.program);
 if(scenario==='freestyle'){state=startFreestyleWorkout(state);for(const id of ['barbell-bench-press','cable-fly','barbell-row','dumbbell-bench-press','pull-up'])state=addFreestyleExercise(state,id);}
 else if(scenario==='active')state.activeWorkout=startWorkout(state,day);
 else {
  state.program.days[0]=day;
  if(scenario==='import')state.program.source='ai-import';
  if(scenario==='today'){state.selectedDate=isoDay();const current=state.program.days.find(d=>d.weekday===new Intl.DateTimeFormat('en',{weekday:'short'}).format(new Date()));if(current){current.exercises=structuredClone(day.exercises);current.estimatedMinutes=estimateWorkoutMinutes(current,state.profile,state.program);}}
 }
 if(state.activeWorkout){state.activeWorkout.exercises.forEach((e,i)=>{e.importedName=names[i%7];e.repMin=e.repMax=[8,7,9,8,10,12,15][i%7];e.targetRir=null;e.sets=e.sets.slice(0,2);if(params.has('notes')&&i===4)e.personalNote='Keep the tempo steady and the range comfortable.';});if(params.has('progressed')){state.activeWorkout.exercises[0].sets.forEach(set=>Object.assign(set,{weight:52.5,reps:8,completed:true}));state.activeWorkout.exerciseIndex=1;}
  if(params.has('long')){const sample=state.activeWorkout.exercises[1];for(let i=0;i<12;i++)state.activeWorkout.exercises.push({...structuredClone(sample),id:'long-queue-'+i,sets:sample.sets.map((set,j)=>({...set,id:'long-set-'+i+'-'+j}))});}
 }
 return state;
}
const initial=params.has('resume')?deserializeState(localStorage.getItem(key),{strict:true}):['active','freestyle'].includes(scenario)?deserializeState(serializeState(fixture()),{strict:true}):fixture();
function Harness(){const [state,setState]=useState(initial),[detail,setDetail]=useState(null),[notice,setNotice]=useState('');
 const update=fn=>setState(prev=>{const next=fn(structuredClone(prev));localStorage.setItem(key,serializeState(next));return next;});
 return <div className="app-shell">
  {['active','freestyle'].includes(scenario)?<ActiveWorkout state={state} update={update} setPage={setNotice} setDetail={setDetail}/>:
   scenario==='today'?<Today state={state} update={update} setPage={setNotice} setDetail={setDetail}/>:
   <div className="modal-layer edit-plan-page-layer"><main className="screen detail-screen edit-plan-screen"><PlanEditor source={state.program} profile={state.profile} exerciseState={state} mode={scenario==='preview'?'review':scenario==='import'?'import':scenario==='scratch'?'scratch':'edit'} generatedAcceptance={scenario==='preview'} onSave={program=>{update(s=>({...s,program}));setNotice('Saved');}} onCancel={()=>setNotice('Cancelled')}/></main></div>}
  {detail?.workoutOptions&&<div className="modal-layer"><ActiveWorkoutOptions workout={state.activeWorkout} close={()=>setDetail(null)} onMoveUpNext={detail.onMoveUpNext} onRemoveUpNext={detail.onRemoveUpNext}/></div>}
  <output id="domain-proof" hidden>{JSON.stringify({notice,session:state.activeWorkout,plan:state.program})}</output>
 </div>;
}
const reviewRoot=createRoot(document.getElementById('root'));reviewRoot.render(<StrictMode><Harness/></StrictMode>);
const qa=document.createElement('details');qa.id='reorder-qa';
qa.innerHTML='<summary>Reorder QA</summary><label>Theme <select id="theme"><option>premium-dark</option><option>premium-light</option><option>dark</option><option>light</option></select></label><label>From <input id="from" type="number" value="3" min="0"></label><label>To <input id="to" type="number" value="0" min="0"></label><label>Swipe target <select id="swipe-target"><option>body</option><option>prescription</option><option>handle</option></select></label><button id="measure">Measure</button><button id="drag">Drag</button><button id="hold">Hold drag</button><button id="release">Release</button><button id="cancel">Cancel drag</button><button id="swipe">Swipe source</button><button id="edge">Autoscroll edge</button><button id="middle">Leave edge</button><pre id="proof"></pre>';
const style=document.createElement('style');style.textContent='#reorder-qa{position:fixed;top:0;right:0;z-index:9999;font:11px system-ui;background:#eee;color:#111;width:150px}#reorder-qa button,#reorder-qa label{display:block;min-height:28px;width:100%}#reorder-qa input{width:60px;font-size:16px}#proof{white-space:pre-wrap;max-height:120px;overflow:auto}';document.head.append(style);document.body.append(qa);
const fixturePointer=event=>{if(qa.contains(event.target))event.stopPropagation();};window.addEventListener('pointerdown',fixturePointer,true);
const el=id=>qa.querySelector('#'+id),frame=()=>new Promise(requestAnimationFrame),settle=()=>new Promise(resolve=>setTimeout(resolve,240));
const handles=()=>[...document.querySelectorAll('#root .rook-reorder-handle')].filter(h=>h.dataset.reorderKind!=='workout'&&h.getBoundingClientRect().height>0&&!h.closest('[inert]'));
const theme=()=>{const value=el('theme').value;Object.assign(document.documentElement.dataset,{theme:value.startsWith('premium')?'premium':value,style:value.startsWith('premium')?'premium':'standard',appearance:value.endsWith('dark')?'dark':'light',premiumScheme:value.endsWith('dark')?'dark':'light'});};el('theme').onchange=theme;theme();
const rect=e=>e.getBoundingClientRect();let held=null;
function proof(){
 const list=document.querySelector('.up-next-queue'),items=[...document.querySelectorAll('#root .rook-reorder-handle')].filter(h=>rect(h).height>0&&!h.closest('[inert]'));
 return {feedback:{...feedbackCounts},sourceGeometry:held?.geometry,width:innerWidth,theme:el('theme').value,geometry:geometry(),overflow:document.documentElement.scrollWidth>innerWidth,
  handles:items.map(h=>{const r=h.closest('.swipe-up-next-body,.plan-editor-card-header,.plan-workout-reorder-bar,.today-exercise-edit-row'),b=rect(h),row=rect(r),p=r.querySelector('.up-next-prescription'),g=rect(h.querySelector('i'));return {name:h.getAttribute('aria-label'),id:h.dataset.exerciseId,width:b.width,height:b.height,rightInset:row.right-b.right,outside:b.left<row.left||b.right>row.right+.1,glyphWidth:g.width,metadataGap:p?g.left-rect(p).right:null};}),
  queueOrder:handles().map(h=>h.dataset.exerciseId),open:document.querySelectorAll('[data-swipe-revealed]').length,floating:Boolean(document.querySelector('.queue-reorder-preview,.plan-reorder-preview,.today-reorder-preview')),
  transforms:[...document.querySelectorAll('[data-swipe-content]')].map(n=>n.style.transform),listScroll:list?.scrollTop,documentScroll:document.scrollingElement.scrollTop,
  swipe:[...document.querySelectorAll('[data-swipe-row][data-swipe-revealed]')].map(r=>({gap:rect(r.querySelector('[data-swipe-action]')).left-rect(r.querySelector('[data-swipe-content]')).right,handleInsideForeground:Boolean(r.querySelector('[data-swipe-content] .rook-reorder-handle'))}))};
}
function rowGeometry(r){
 const box=n=>{if(!n)return null;const b=rect(n),css=getComputedStyle(n);return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,radius:css.borderRadius,paddingLeft:css.paddingLeft,paddingRight:css.paddingRight,borderBottom:css.borderBottomWidth,font:css.font,color:css.color};};
 return {row:box(r),title:box(r?.querySelector('strong')),prescription:box(r?.querySelector('.up-next-prescription')),handle:box(r?.querySelector('.rook-reorder-handle')),notes:[...r?.querySelectorAll('.up-next-note')||[]].map(n=>({text:n.textContent,...box(n)}))};
}
function geometry(){
 const q=document.querySelector('.up-next-queue'),heading=q?.parentElement.querySelector('.eyebrow'),p=document.querySelector('.queue-reorder-preview');
 return {heading:heading?{x:rect(heading).x+parseFloat(getComputedStyle(heading).paddingLeft)}:null,rows:[...q?.querySelectorAll('.swipe-up-next-body')||[]].map(rowGeometry),preview:p?{box:{x:rect(p).x,y:rect(p).y,width:rect(p).width,height:rect(p).height,radius:getComputedStyle(p).borderRadius},...rowGeometry(p.querySelector('.swipe-up-next-body'))}:null};
}
function send(type,target,x,y){const e=new Event(type,{bubbles:true,cancelable:true}),point={identifier:1,clientX:x,clientY:y};Object.assign(e,{touches:['touchend','touchcancel'].includes(type)?[]:[point],changedTouches:[point]});target.dispatchEvent(e);}
async function drag(hold=false){const source=handles()[Number(el('from').value)],target=handles()[Number(el('to').value)];if(!source||!target)throw Error('Choose visible handle indices');source.scrollIntoView({block:'center'});await frame();await frame();const b=rect(source),t=rect(target),x=b.left+b.width/2,y=b.top+b.height/2,dy=t.top+t.height/2-y+(t.top>b.top?10:-10);held={target:source,x,y:y+dy,geometry:rowGeometry(source.closest('.swipe-up-next-body'))};send('touchstart',source,x,y);for(let i=1;i<=8;i++){send('touchmove',source,x,y+dy*i/8);await frame();}if(!hold){send('touchend',source,x,y+dy);held=null;}await settle();}
async function run(kind){qa.open=false;el('proof').textContent='Running';
 if(kind==='drag'||kind==='hold')await drag(kind==='hold');
 if(kind==='release'||kind==='cancel'){if(held){send(kind==='release'?'touchend':'touchcancel',held.target,held.x,held.y);held=null;}await settle();}
 if(kind==='swipe'){const h=handles()[Number(el('from').value)],r=h.closest('[data-swipe-row]');r.scrollIntoView({block:'center'});await frame();await frame();const target=r.querySelector(el('swipe-target').value==='handle'?'.rook-reorder-handle':el('swipe-target').value==='prescription'?'.up-next-prescription':'.up-next-main'),b=rect(r),t=rect(target),x=t.left+t.width*.75,y=t.top+t.height/2,distance=b.width*.7;send('touchstart',target,x,y);for(let i=1;i<=8;i++){send('touchmove',target,x-distance*i/8,y);await frame();}send('touchend',target,x-distance,y);await settle();}
 if(kind==='edge'||kind==='middle'){if(!held)await drag(true);const q=rect(document.querySelector('.up-next-queue'));held.y=kind==='edge'?Math.min(q.bottom,innerHeight-80)-2:Math.max(q.top,64)+(Math.min(q.bottom,innerHeight-80)-Math.max(q.top,64))/2;send('touchmove',held.target,held.x,held.y);await new Promise(resolve=>setTimeout(resolve,400));}
 el('proof').textContent=JSON.stringify(proof());
}
for(const kind of ['measure','drag','hold','release','cancel','swipe','edge','middle'])el(kind).onclick=()=>run(kind);
if(import.meta.hot)import.meta.hot.dispose(()=>{reviewRoot.unmount();qa.remove();style.remove();window.removeEventListener('pointerdown',fixturePointer,true);Object.defineProperty(window,'localStorage',{configurable:true,value:nativeStorage});Object.assign(interactionFeedback,originalFeedback);});
