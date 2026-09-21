import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ActiveWorkout,PlanEditor,Today,ActiveWorkoutOptions} from '/src/App.jsx';
import {createReturningUserFixture} from '/src/demoFixture.js';
import {startWorkout,serializeState,deserializeState,isoDay,estimateWorkoutMinutes,saveState} from '/src/domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from '/src/freestyleWorkout.js';
import '/src/styles.css';import '/src/overrides.css';import '/src/overlay.css';import '/src/calendar.css';import '/src/workout-controls.css';import '/src/onboarding-controls.css';import '/src/import-plan.css';import '/src/coach.css';import '/src/landing.css';import '/src/theme.css';import '/src/navigationFocus.css';import '/src/activeLoggerTouch.css';
if(!import.meta.env.DEV||location.origin!=='http://127.0.0.1:4198')throw Error('Isolated development review only');
const params=new URLSearchParams(location.search),scenario=params.get('case')||'active';
const nativeStorage=window.localStorage,prefix='rook-direct-swipe-review:'+scenario+':'+(params.get('review')||'default')+':';
Object.defineProperty(window,'localStorage',{value:{getItem:k=>nativeStorage.getItem(prefix+k),setItem:(k,v)=>nativeStorage.setItem(prefix+k,v),removeItem:k=>nativeStorage.removeItem(prefix+k),get length(){return Object.keys(nativeStorage).filter(k=>k.startsWith(prefix)).length;},key:i=>Object.keys(nativeStorage).filter(k=>k.startsWith(prefix))[i]?.slice(prefix.length)}});
const key='lift-v2-state';
const names=['Bench Press','Cable Fly','Straight-Arm Pulldown','Straight Bar Cable Pushdown','Single-Leg Romanian Deadlift','Single-Leg Leg Extension','Very long custom exercise name with controlled tempo and a deliberate pause'];
function fixture(){
 let state=createReturningUserFixture(0);
 Object.assign(state.profile,{showExerciseImages:false,restTimerEnabled:false,rirEnabled:params.has('rir')});
 const day=structuredClone(state.program.days[0]);
 day.exercises.forEach((e,i)=>{e.importedName=names[i%names.length];e.repMin=e.repMax=[8,7,9,8,10,12,15][i%7];e.targetRir=null;e.notes='';e.personalNote='';});
 day.estimatedMinutes=estimateWorkoutMinutes(day,state.profile,state.program);
 if(scenario==='freestyle'){state=startFreestyleWorkout(state);for(const id of ['barbell-bench-press','cable-fly','barbell-row','dumbbell-bench-press','pull-up'])state=addFreestyleExercise(state,id);}
 else if(scenario==='active')state.activeWorkout=startWorkout(state,day);
 else {
  state.program.days[0]=day;
  if(scenario==='import')state.program.source='ai-import';
  if(scenario==='today'){state.selectedDate=isoDay();const current=state.program.days.find(d=>d.weekday===new Intl.DateTimeFormat('en',{weekday:'short'}).format(new Date()));if(current){current.exercises=structuredClone(day.exercises);current.estimatedMinutes=estimateWorkoutMinutes(current,state.profile,state.program);}}
 }
 if(state.activeWorkout){state.activeWorkout.exercises.forEach((e,i)=>{e.importedName=names[i%7];e.repMin=e.repMax=[8,7,9,8,10,12,15][i%7];e.targetRir=null;e.sets=e.sets.slice(0,2);});state.activeWorkout.exercises[0].sets.forEach(set=>Object.assign(set,{weight:52.5,reps:8,completed:true}));
  if(params.has('long')){const sample=state.activeWorkout.exercises[1];for(let i=0;i<12;i++)state.activeWorkout.exercises.push({...structuredClone(sample),id:'long-queue-'+i,sets:sample.sets.map((set,j)=>({...set,id:'long-set-'+i+'-'+j}))});}
 }
 return state;
}
const initial=params.has('resume')?deserializeState(localStorage.getItem(key),{strict:true}):['active','freestyle'].includes(scenario)?deserializeState(serializeState(fixture()),{strict:true}):fixture();
function Harness(){const [state,setState]=useState(()=>structuredClone(initial)),[detail,setDetail]=useState(null),[notice,setNotice]=useState('');
 const update=fn=>setState(prev=>{const next=fn(structuredClone(prev));saveState(next);return next;});
 return <div className="app-shell">
  {['active','freestyle'].includes(scenario)?<ActiveWorkout state={state} update={update} setPage={setNotice} setDetail={setDetail}/>:
   scenario==='today'?<Today state={state} update={update} setPage={setNotice} setDetail={setDetail}/>:
   <div className="modal-layer edit-plan-page-layer"><main className="screen detail-screen edit-plan-screen"><PlanEditor source={state.program} profile={state.profile} exerciseState={state} mode={scenario==='preview'?'review':scenario==='import'?'import':scenario==='scratch'?'scratch':'edit'} generatedAcceptance={scenario==='preview'} onSave={program=>{update(s=>({...s,program}));setNotice('Saved');}} onCancel={()=>setNotice('Cancelled')}/></main></div>}
  {detail?.workoutOptions&&<div className="modal-layer"><ActiveWorkoutOptions workout={state.activeWorkout} close={()=>setDetail(null)} onMoveUpNext={detail.onMoveUpNext} onRemoveUpNext={detail.onRemoveUpNext}/></div>}
  <output id="domain-proof" hidden>{JSON.stringify({notice,session:state.activeWorkout,plan:state.program})}</output>
 </div>;
}
const reviewRoot=createRoot(document.getElementById('root'));let version=0;
const reset=()=>reviewRoot.render(<Harness key={++version}/>);reset();
const qa=document.createElement('details');qa.id='direct-swipe-qa';qa.innerHTML='<summary>Direct swipe QA</summary><button id="matrix">Run four-theme suite</button><button id="body">Hold body 60%</button><button id="handle">Hold handle 60%</button><button id="reverse">Reverse to 20%</button><button id="release">Release swipe</button><button id="cancel">Cancel swipe</button><button id="reset">Reset fixture</button><select aria-label="Review theme" id="theme"><option>premium-dark</option><option>premium-light</option><option>dark</option><option>light</option></select><pre id="proof"></pre>';
const style=document.createElement('style');style.textContent='#direct-swipe-qa{position:fixed;bottom:0;right:0;z-index:9999;font:11px system-ui;background:var(--rook-surface);color:var(--rook-text);width:160px}#direct-swipe-qa button,#direct-swipe-qa select{display:block;min-height:28px;width:100%}#proof{white-space:pre-wrap;max-height:100px;overflow:auto}';document.head.append(style);document.body.append(qa);
const el=id=>qa.querySelector('#'+id),frame=()=>new Promise(requestAnimationFrame),settle=()=>new Promise(resolve=>setTimeout(resolve,240));
const theme=value=>{el('theme').value=value;Object.assign(document.documentElement.dataset,{theme:value.startsWith('premium')?'premium':value,style:value.startsWith('premium')?'premium':'standard',appearance:value.endsWith('dark')?'dark':'light'});};el('theme').onchange=()=>theme(el('theme').value);theme(params.get('theme')||'premium-dark');
const rows=()=>[...document.querySelectorAll('#root [data-swipe-enabled="true"]')],ids=()=>rows().map(r=>r.id||r.querySelector('[data-exercise-id]')?.dataset.exerciseId),rect=e=>e.getBoundingClientRect();let held=null;
function send(type,target,x,y){const e=new Event(type,{bubbles:true,cancelable:true}),point={identifier:1,clientX:x,clientY:y};Object.assign(e,{touches:['touchend','touchcancel'].includes(type)?[]:[point],changedTouches:[point]});target.dispatchEvent(e);return e;}
function measure(){return {width:innerWidth,theme:el('theme').value,overflow:document.documentElement.scrollWidth>innerWidth,rows:rows().map(r=>({width:rect(r).width,height:rect(r).height,handle:rect(r.querySelector('[data-reorder-kind]')).width,foreground:rect(r.querySelector('[data-swipe-content]')).width,background:getComputedStyle(r.querySelector('.swipe-remove-background')).backgroundColor,border:getComputedStyle(r.querySelector('[data-swipe-content]')).borderTopWidth})),active:document.querySelectorAll('[data-swipe-active]').length,armed:document.querySelectorAll('[data-swipe-armed]').length,revealButtons:document.querySelectorAll('[data-swipe-action]').length,order:ids()};}
async function begin(origin='body'){const row=rows()[0];row.scrollIntoView({block:'center'});await frame();await frame();const b=rect(row),target=row.querySelector(origin==='body'?'.up-next-main,.plan-editor-heading':'[data-reorder-kind]'),x=origin==='handle'?rect(target).left+22:b.right-55,y=b.top+b.height/2;held={row,target,x,y,width:b.width,lastX:x,lastY:y};send('touchstart',target,x,y);}
function move(fraction,dy=0){held.lastX=held.x-held.width*fraction;held.lastY=held.y+dy;return send('touchmove',held.target,held.lastX,held.lastY);}
async function release(cancel=false){send(cancel?'touchcancel':'touchend',held.target,held.lastX,held.lastY);held=null;await settle();}
async function swipe(origin,distance,reverse=false,steps=8){await begin(origin);for(let i=1;i<=steps;i++){move(distance*i/steps);await frame();}if(reverse)move(.2);await release();}
async function reorder(){await begin('handle');const target=rows()[2],dy=rect(target).top-rect(held.row).top+10;move(.005,20);move(.01,dy);await release();}
async function fresh(){held=null;reset();await settle();}
function assert(condition,message){if(!condition)throw Error(message);}
const undo=async()=>{const button=[...document.querySelectorAll('.exercise-remove-undo button')].find(b=>b.textContent==='Undo');assert(button,'Undo absent');button.click();await frame();await frame();};
async function suite(){qa.open=false;const results=[];try{for(const t of ['light','dark','premium-light','premium-dark']){theme(t);await fresh();const geometry=measure();assert(!geometry.overflow,'Horizontal overflow');assert(geometry.rows.every(r=>r.handle===44),'Handle target');
 const run=async(name,fn)=>{await fresh();await fn();assert(!document.querySelector('[data-swipe-armed],[data-removing],.reorder-live-source'),'Stale visual');results.push({theme:t,name,pass:true});el('proof').textContent=JSON.stringify({running:true,results});};
 await run('1 handle vertical reorder',async()=>{const before=ids();await reorder();assert(ids().join()!==before.join(),'Reorder did not commit');});
 for(const [name,origin,distance,reverse,steps] of [['2 handle short','handle',.2,false,8],['3 handle deep','handle',.6,false,8],['4 handle reversal','handle',.6,true,8],['6 body short','body',.2,false,8],['7 body deep','body',.6,false,8],['8 body slow deep','body',.6,false,30],['9 body fast short','body',.2,false,1]])await run(name,async()=>{const before=ids();await swipe(origin,distance,reverse,steps);assert(ids().length===before.length-(distance>=.5&&!reverse?1:0),'Wrong removal count');if(distance>=.5&&!reverse){await undo();assert(ids().join()===before.join(),'Wrong Undo order');}});
 await run('5 body vertical yields',async()=>{const before=ids();await begin('body');assert(!move(.005,40).defaultPrevented,'Scroll blocked');await release();assert(ids().join()===before.join(),'Body reordered');});
 await run('10 exact Undo',async()=>{const before=ids(),domain=document.querySelector('#domain-proof').textContent;await swipe('handle',.6);await undo();assert(ids().join()===before.join(),'Undo order');const a=JSON.parse(domain),b=JSON.parse(document.querySelector('#domain-proof').textContent);assert(JSON.stringify(a.session?.exercises||a.plan)===JSON.stringify(b.session?.exercises||b.plan),'Undo metadata');});
 await run('11 remove then reorder',async()=>{await swipe('body',.6);await reorder();assert(!document.querySelector('.exercise-remove-undo'),'Stale Undo');});
 await run('12 reorder then remove identity',async()=>{await reorder();const before=ids();await swipe('handle',.6);assert(ids().join()===before.slice(1).join(),'Wrong identity removed');});
 results.push({theme:t,geometry});}
 await fresh();el('proof').textContent=JSON.stringify({complete:true,scenario,width:innerWidth,results});}catch(error){el('proof').textContent=JSON.stringify({complete:false,error:error.message,results});}}
el('matrix').onclick=suite;
for(const kind of ['body','handle'])el(kind).onclick=async()=>{qa.open=false;await begin(kind);move(.6);el('proof').textContent=JSON.stringify(measure());};
el('reverse').onclick=()=>{move(.2);el('proof').textContent=JSON.stringify(measure());};el('release').onclick=async()=>{await release();el('proof').textContent=JSON.stringify(measure());};el('cancel').onclick=async()=>{await release(true);el('proof').textContent=JSON.stringify(measure());};el('reset').onclick=async()=>{await fresh();el('proof').textContent=JSON.stringify(measure());};
if(import.meta.hot)import.meta.hot.dispose(()=>{reviewRoot.unmount();qa.remove();style.remove();});