import React,{useState} from 'react';
import {flushSync} from 'react-dom';
import {FreestyleExercisePicker} from '/src/FreestyleQueuePicker.jsx';
import {interactionFeedback,createVibrationAdapter} from '/src/interactionFeedback.js';
import {createRoot} from 'react-dom/client';
import {ActiveWorkout,PlanEditor,Today,ActiveWorkoutOptions,SheetHeader} from '/src/App.jsx';
import {createReturningUserFixture} from '/src/demoFixture.js';
import {startWorkout,serializeState,deserializeState,isoDay,estimateWorkoutMinutes,saveState} from '/src/domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from '/src/freestyleWorkout.js';
import '/src/styles.css';import '/src/overrides.css';import '/src/overlay.css';import '/src/calendar.css';import '/src/workout-controls.css';import '/src/onboarding-controls.css';import '/src/import-plan.css';import '/src/coach.css';import '/src/landing.css';import '/src/theme.css';import '/src/navigationFocus.css';import '/src/activeLoggerTouch.css';
if(!import.meta.env.DEV||location.origin!=='http://127.0.0.1:4198')throw Error('Isolated development review only');
const params=new URLSearchParams(location.search),scenario=params.get('case')||'active';
let failWrites=false;const nativeStorage=window.localStorage,prefix='rook-threshold-review:'+scenario+':'+(params.get('review')||'default')+':';
Object.defineProperty(window,'localStorage',{value:{getItem:k=>nativeStorage.getItem(prefix+k),setItem:(k,v)=>{if(failWrites)throw Error('Injected review write failure');nativeStorage.setItem(prefix+k,v)},removeItem:k=>nativeStorage.removeItem(prefix+k),get length(){return Object.keys(nativeStorage).filter(k=>k.startsWith(prefix)).length;},key:i=>Object.keys(nativeStorage).filter(k=>k.startsWith(prefix))[i]?.slice(prefix.length)}});
const key='lift-v2-state';
const names=['Bench Press','Cable Fly','Straight-Arm Pulldown','Straight Bar Cable Pushdown','Single-Leg Romanian Deadlift','Single-Leg Leg Extension','Very long custom exercise name with controlled tempo and a deliberate pause'];
function fixture(){
 let state=createReturningUserFixture(0);
 Object.assign(state.profile,{showExerciseImages:params.has('images'),restTimerEnabled:false,rirEnabled:params.has('rir')});
 const day=structuredClone(state.program.days[0]);
 day.exercises.forEach((e,i)=>{e.importedName=names[i%names.length];e.repMin=e.repMax=[8,7,9,8,10,12,15][i%7];e.targetRir=null;e.notes='';e.personalNote='';});
 day.estimatedMinutes=estimateWorkoutMinutes(day,state.profile,state.program);
 if(['freestyle','search'].includes(scenario)){state=startFreestyleWorkout(state);if(!params.has('empty'))for(const id of ['barbell-bench-press','cable-fly','barbell-row','dumbbell-bench-press','pull-up'])state=addFreestyleExercise(state,id);}
 else if(scenario==='active')state.activeWorkout=startWorkout(state,day);
 else {
  state.program.days[0]=day;
  if(scenario==='import')state.program.source='ai-import';
  if(scenario==='today'){state.selectedDate=isoDay();const current=state.program.days.find(d=>d.weekday===new Intl.DateTimeFormat('en',{weekday:'short'}).format(new Date()));if(current){current.exercises=structuredClone(day.exercises);current.estimatedMinutes=estimateWorkoutMinutes(current,state.profile,state.program);}}
 }
 if(state.activeWorkout?.exercises.length){state.activeWorkout.exercises.forEach((e,i)=>{e.importedName=names[i%7];e.repMin=e.repMax=[8,7,9,8,10,12,15][i%7];e.targetRir=null;e.sets=e.sets.slice(0,2);});state.activeWorkout.exercises[0].sets.forEach(set=>Object.assign(set,{weight:52.5,reps:8,completed:true}));
  if(params.has('long')){const sample=state.activeWorkout.exercises[1];for(let i=0;i<12;i++)state.activeWorkout.exercises.push({...structuredClone(sample),id:'long-queue-'+i,sets:sample.sets.map((set,j)=>({...set,id:'long-set-'+i+'-'+j}))});}
 }
 return state;
}
const initial=params.has('resume')?deserializeState(localStorage.getItem(key),{strict:true}):['active','freestyle','search'].includes(scenario)?deserializeState(serializeState(fixture()),{strict:true}):fixture();
function Harness(){const [state,setState]=useState(()=>structuredClone(initial)),[detail,setDetail]=useState(null),[notice,setNotice]=useState('');
 const update=(fn,options)=>setState(prev=>{const next=fn(structuredClone(prev));if(!options?.persistedState)saveState(next);return next;});
 return <div className="app-shell">
  {scenario==='search'?<div className="modal-layer"><FreestyleExercisePicker state={state} update={update} close={()=>setNotice('Closed')} Header={SheetHeader}/></div>:['active','freestyle'].includes(scenario)?<ActiveWorkout state={state} update={update} setPage={setNotice} setDetail={setDetail}/>:
   scenario==='today'?<Today state={state} update={update} setPage={setNotice} setDetail={setDetail}/>:
   <div className="modal-layer edit-plan-page-layer"><main className="screen detail-screen edit-plan-screen"><PlanEditor source={state.program} profile={state.profile} exerciseState={state} mode={scenario==='preview'?'review':scenario==='import'?'import':scenario==='scratch'?'scratch':'edit'} generatedAcceptance={scenario==='preview'} onSave={program=>{update(s=>({...s,program}));setNotice('Saved');}} onCancel={()=>setNotice('Cancelled')}/></main></div>}
  {detail?.workoutOptions&&<div className="modal-layer"><ActiveWorkoutOptions workout={state.activeWorkout} close={()=>setDetail(null)} onMoveUpNext={detail.onMoveUpNext} onRemoveUpNext={detail.onRemoveUpNext}/></div>}
  <output id="domain-proof" hidden>{JSON.stringify({notice,session:state.activeWorkout,plan:state.program})}</output>
 </div>;
}
const reviewRoot=createRoot(document.getElementById('root'));let version=0;
const reset=()=>flushSync(()=>reviewRoot.render(<Harness key={++version}/>));reset();
const events=[],requests=[],originalFeedback={...interactionFeedback};for(const name of ['pickup','selection','drop','threshold']){const original=originalFeedback[name];interactionFeedback[name]=()=>{events.push(name);const result=original();requests.push({event:name,result});el('runtime').textContent=JSON.stringify({...createVibrationAdapter().capabilities(),requests:requests.slice(-12),physicalIPhone:'not tested',audio:'not implemented'});return result;};}
const nativeMatch=window.matchMedia.bind(window);if(params.has('reduced'))window.matchMedia=query=>query==='(prefers-reduced-motion: reduce)'?{matches:true,addEventListener(){},removeEventListener(){}}:nativeMatch(query);
const qa=document.createElement('details');qa.id='threshold-qa';qa.innerHTML='<summary>Threshold QA</summary><button id="matrix">Run four-theme suite</button><button id="neutral">Hold unarmed</button><button id="armed">Arm gesture</button><button id="farther">Pull farther</button><button id="disarm">Disarm gesture</button><button id="release">Release gesture</button><button id="reset">Reset fixture</button><select aria-label="Review theme" id="theme"><option>premium-dark</option><option>premium-light</option><option>dark</option><option>light</option></select><select aria-label="Armed icon comparison" id="scale"><option value="">Production 1.08</option><option value="1.06">Compare 1.06</option><option value="1.10">Compare 1.10</option></select><pre id="proof"></pre><pre id="runtime"></pre>';
const style=document.createElement('style');style.textContent='#threshold-qa{position:fixed;bottom:0;right:0;z-index:9999;font:11px system-ui;background:var(--rook-surface);color:var(--rook-text);width:160px}#threshold-qa button,#threshold-qa select{display:block;min-height:28px;width:100%}#threshold-qa pre{white-space:pre-wrap;max-height:100px;overflow:auto}';document.head.append(style);document.body.append(qa);
const el=id=>qa.querySelector('#'+id),frame=()=>new Promise(requestAnimationFrame),settle=()=>new Promise(resolve=>setTimeout(resolve,260));
const comparisonStyle=document.createElement('style');document.head.append(comparisonStyle);el('scale').onchange=()=>{comparisonStyle.textContent=el('scale').value?`.swipe-action-row[data-swipe-armed] > .swipe-remove-background svg{transform:scale(${Number(el('scale').value)})}`:'';qa.open=false;};
// Exercise the actual reduced-motion CSS rules as well as the existing JS model.
const reducedStyle=document.createElement('style');if(params.has('reduced')){reducedStyle.textContent=[...document.styleSheets].flatMap(s=>[...s.cssRules]).filter(r=>r.conditionText?.includes('prefers-reduced-motion:reduce')||r.conditionText?.includes('prefers-reduced-motion: reduce')).flatMap(r=>[...r.cssRules].map(c=>c.cssText)).join('\n');document.head.append(reducedStyle);}
const theme=value=>{el('theme').value=value;Object.assign(document.documentElement.dataset,{theme:value,style:value.startsWith('premium')?'premium':'standard',appearance:value.endsWith('dark')?'dark':'light'});};el('theme').onchange=()=>theme(el('theme').value);theme(params.get('theme')||'premium-dark');
el('runtime').textContent=JSON.stringify({...createVibrationAdapter().capabilities(),standalone:matchMedia('(display-mode: standalone)').matches,reduced:params.has('reduced'),audio:'not implemented',physicalIPhone:'not tested'});
const adding=scenario==='search',reorderOnly=['import','preview'].includes(scenario),rows=()=>[...document.querySelectorAll(reorderOnly?'#root [data-reorder-block-index]':'#root [data-swipe-enabled=true]')].filter(r=>!reorderOnly||r.querySelector('[data-reorder-kind]')),rect=e=>e.getBoundingClientRect(),domain=()=>JSON.parse(document.querySelector('#domain-proof').textContent),order=()=>domain().session?.exercises.map(e=>e.id)||rows().map(r=>r.id);let held=null;
const assert=(v,m)=>{if(!v)throw Error(m);};
function send(type,target,x,y){const e=new Event(type,{bubbles:true,cancelable:true}),p={identifier:1,clientX:x,clientY:y};Object.assign(e,{touches:['touchend','touchcancel'].includes(type)?[]:[p],changedTouches:[p]});target.dispatchEvent(e);return e;}
async function begin(origin='body',index=0){const row=rows()[index];row.scrollIntoView({block:'center'});await frame();await frame();const b=rect(row),target=row.querySelector(origin==='handle'?'[data-reorder-kind]':adding?'[data-swipe-body]':'.up-next-main,.plan-editor-heading'),x=origin==='handle'?rect(target).left+22:adding?b.left+45:b.right-55,y=b.top+b.height/2;held={row,target,x,y,width:b.width,lastX:x,lastY:y};send('touchstart',target,x,y);}
function move(fraction,dy=0){held.lastX=held.x+(adding?1:-1)*held.width*fraction;held.lastY=held.y+dy;return send('touchmove',held.target,held.lastX,held.lastY);}
let releaseFrames=[];
async function release(cancel=false){const row=held.row,body=row.querySelector('[data-swipe-content]'),start=performance.now();releaseFrames=[];
 const sample=()=>{const css=getComputedStyle(body);releaseFrames.push({ms:performance.now()-start,x:css.transform==='none'?0:new DOMMatrixReadOnly(css.transform).m41,opacity:css.opacity,armed:row.hasAttribute('data-swipe-armed'),status:row.querySelector('.queue-result-status')?.textContent});};
 send(cancel?'touchcancel':'touchend',held.target,held.lastX,held.lastY);held=null;if(adding){sample();while(performance.now()-start<210){await frame();sample();}}else{
  const sampleRemove=()=>{const visual=row.isConnected?row:document.querySelector('[data-row-exit]');if(!visual)return;const foreground=visual.querySelector('[data-swipe-content]'),bg=visual.querySelector('.swipe-remove-background'),icon=bg.querySelector('svg'),b=rect(visual),f=rect(foreground),i=rect(icon),css=getComputedStyle(bg);releaseFrames.push({ms:performance.now()-start,x:f.left-b.left,height:b.height,color:css.backgroundColor,opacity:getComputedStyle(visual).opacity,iconCenter:i.left+i.width/2,revealCenter:b.right+(f.left-b.left)/2,exit:visual.hasAttribute('data-row-exit')});};
  sampleRemove();while(performance.now()-start<235){await frame();sampleRemove();}
 }}
async function fresh(){if(held)await release(true);reset();await settle();if(scenario==='preview'){[...document.querySelectorAll('#root button')].find(b=>b.textContent==='Reorder')?.click();await frame();await frame();}events.length=0;}
function paint(){const background=held.row.querySelector(adding?'.queue-swipe-cue':'.swipe-remove-background'),b=rect(held.row),icon=rect(background.querySelector('svg')),css=getComputedStyle(background);return {state:held.row.dataset.swipeState,armed:held.row.hasAttribute('data-swipe-armed'),color:css.backgroundColor,foregroundColor:css.color,iconX:icon.x,iconRight:icon.right,iconCenter:icon.x+icon.width/2,revealCenter:b.right-(held.x-held.lastX)/2,width:b.width,foreground:held.row.querySelector('[data-swipe-content]').style.transform,events:[...events]};}
async function undo(){const button=document.querySelector('.exercise-remove-undo button');assert(button,'Undo absent');button.click();await frame();await frame();}
async function suite(){if(el('matrix').disabled)return;el('matrix').disabled=true;el('proof').textContent=JSON.stringify({running:true});qa.open=false;const results=[];try{for(const t of ['light','dark','premium-light','premium-dark']){theme(t);await fresh();const start=order();
 assert(document.documentElement.scrollWidth<=innerWidth,'page overflow');assert(rows().every(r=>rect(r).width<=innerWidth),'row overflow');
 for(const origin of reorderOnly?[]:adding?['body']:['body','handle']){
  await fresh();const before=order();await begin(origin);move(.2);const neutral=paint();assert(!neutral.armed,'20% armed');assert(!events.length,'20% feedback');await release();assert(JSON.stringify(order())===JSON.stringify(before),'20% mutated');
  await begin(origin);move(adding?.241:.5);const armed=paint();assert(armed.armed&&events.join()==='threshold','arm event/state');assert(adding?armed.color!==neutral.color:armed.color===neutral.color,'wrong semantic color');if(!adding)assert(Math.abs(armed.iconCenter-armed.revealCenter)<1&&Math.abs(neutral.iconCenter-neutral.revealCenter)<1,'icon not centered in reveal');move(.6);move(adding?.23:.49);move(adding?.19:.41);assert(events.length===1&&paint().armed,'hysteresis flicker');move(adding?.17:.39);assert(!paint().armed&&paint().color===neutral.color,'failed disarm');await release();assert(JSON.stringify(order())===JSON.stringify(before),'reversal mutated');if(!adding)assert(releaseFrames.every(f=>f.color===neutral.color),'cancel changed red');
  events.length=0;await begin(origin);move(adding?.241:.5);move(adding?.17:.39);move(adding?.241:.5);assert(events.join()==='threshold,threshold','rearm count');const current=held;const sameIcon=paint();assert(Math.abs(sameIcon.iconX-armed.iconX)<1,'icon moved');await release();const after=order();assert(after.length===before.length+(adding?1:-1),'commit count');assert(!current.row.hasAttribute('data-swipe-committing'),'stuck Add');
  const frames=releaseFrames;if(adding){assert(frames.every((f,i)=>f.opacity==='1'&&(!i||f.x<=frames[i-1].x+.1)),'foreground faded or reveal grew');assert(frames.at(-1).x===0,'return did not close');assert(frames.filter(f=>f.status?.trim()).every(f=>f.x<1),'result changed before return');}else{assert(frames.every(f=>f.color===armed.color&&f.opacity==='1'),'remove faded or changed red');assert(frames.every((f,i)=>!i||f.x<=frames[i-1].x+.1),'remove reversed on release');}
  await undo();assert(JSON.stringify(order())===JSON.stringify(before),'Undo identity');
  results.push({theme:t,origin,neutral,armed,releaseUndo:true,releaseFrames:frames});
 }
 await fresh();const before=order();await begin();assert(!move(.005,40).defaultPrevented,'vertical scroll captured');await release();assert(JSON.stringify(order())===JSON.stringify(before),'vertical mutation');
 if(!adding){
  await begin('handle');events.length=0;move(.005,15);assert(events.join()==='pickup','vertical lock pickup');move(.005,18);assert(events.join()==='pickup','same slot repeated');const target=rows()[2];move(.005,rect(target).top-rect(held.row).top+20);assert(events.filter(e=>e==='selection').length===1,'slot event');await release();assert(events.at(-1)==='drop','changed drop');assert(JSON.stringify(order())!==JSON.stringify(before),'reorder mutation');
 } else {
  await fresh();const input=document.querySelector('input[aria-label="Search exercises"]');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'bench');input.dispatchEvent(new Event('input',{bubbles:true}));await frame();await frame();const scroller=document.querySelector('[data-exercise-search-scroll]');scroller.scrollTop=30;await begin();const scroll=scroller.scrollTop,session=domain().session,plan=domain().plan;move(.6);await release();assert(document.activeElement===input&&input.value==='bench','query/focus lost');assert(scroller.scrollTop===scroll,'scroll reset');assert(domain().session.id===session.id&&domain().session.exerciseIndex===session.exerciseIndex&&domain().session.startedAt===session.startedAt,'session changed');assert(JSON.stringify(domain().plan)===JSON.stringify(plan),'plan changed');await undo();
  await fresh();const beforeFail=order();await begin();move(.6);failWrites=true;await release();failWrites=false;assert(JSON.stringify(order())===JSON.stringify(beforeFail),'failed write mutated');assert(document.querySelector('[role=alert]')?.textContent.includes('Could not save'),'missing failure');assert(!document.querySelector('.exercise-remove-undo'),'false success');
 }
 results.push({theme:t,scroll:true,reorder:!adding,focusedSearch:adding});el('proof').textContent=JSON.stringify({running:true,scenario,width:innerWidth,results});}
 await fresh();el('proof').textContent=JSON.stringify({complete:true,scenario,width:innerWidth,reduced:params.has('reduced'),results});}catch(error){failWrites=false;el('proof').textContent=JSON.stringify({complete:false,scenario,width:innerWidth,error:error.message,events,results});}finally{el('matrix').disabled=false;}}
el('matrix').onclick=suite;el('neutral').onclick=async()=>{qa.open=false;await begin();move(.2);el('proof').textContent=JSON.stringify(paint());};el('armed').onclick=()=>{move(adding?.241:.55);qa.open=false;el('proof').textContent=JSON.stringify(paint());};el('disarm').onclick=()=>{move(adding?.17:.35);qa.open=false;el('proof').textContent=JSON.stringify(paint());};el('release').onclick=async()=>{await release();el('proof').textContent=JSON.stringify({events,order:order(),releaseFrames});};el('reset').onclick=fresh;
el('farther').onclick=()=>{move(.75);qa.open=false;el('proof').textContent=JSON.stringify(paint());};
if(import.meta.hot)import.meta.hot.dispose(()=>{Object.assign(interactionFeedback,originalFeedback);window.matchMedia=nativeMatch;reviewRoot.unmount();qa.remove();style.remove();comparisonStyle.remove();reducedStyle.remove();});
