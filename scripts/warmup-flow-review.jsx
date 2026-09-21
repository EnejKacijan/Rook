import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ActiveWorkout} from '/src/App.jsx';
import {createReturningUserFixture} from '/src/demoFixture.js';
import {startWorkout,serializeState,deserializeState,saveState,STORAGE_KEY,refreshWorkoutWarmup} from '/src/domain.js';
import {warmupProgress} from '/src/warmupSession.js';
import '/src/styles.css';import '/src/overrides.css';import '/src/overlay.css';import '/src/calendar.css';import '/src/workout-controls.css';import '/src/onboarding-controls.css';import '/src/import-plan.css';import '/src/coach.css';import '/src/landing.css';import '/src/theme.css';import '/src/navigationFocus.css';import '/src/activeLoggerTouch.css';
if(!import.meta.env.DEV||location.origin!=='http://127.0.0.1:4198')throw Error('Isolated development review only');
const params=new URLSearchParams(location.search),nativeStorage=window.localStorage,prefix='rook-warmup-review:'+(params.get('review')||'default')+':';let fail=false;
Object.defineProperty(window,'localStorage',{value:{getItem:k=>nativeStorage.getItem(prefix+k),setItem:(k,v)=>{if(fail&&k===STORAGE_KEY)throw new DOMException('Test write failed','QuotaExceededError');nativeStorage.setItem(prefix+k,v);},removeItem:k=>nativeStorage.removeItem(prefix+k),get length(){return Object.keys(nativeStorage).filter(k=>k.startsWith(prefix)).length;},key:i=>Object.keys(nativeStorage).filter(k=>k.startsWith(prefix))[i]?.slice(prefix.length)}});
function fixture(kind='generated'){
 const state=createReturningUserFixture(0);Object.assign(state.profile,{showExerciseImages:false,restTimerEnabled:true,rirEnabled:true,recommendedWarmupsEnabled:true,rampUpSetsEnabled:true});state.program.includeRecommendedWarmups=true;
 const day=structuredClone(state.program.days[0]);day.exercises[0].exerciseId='barbell-bench-press';
 if(kind!=='generated'){
  day.exercises[0].importedName='Long custom bench press exercise with a controlled eccentric and deliberate pause';
  day.warmupPlan={mode:kind==='none'?'none':'custom',provenance:'imported',items:kind==='ramp'?[]:[{id:'custom-general',label:'Long preparation activity with deliberate controlled breathing and comfortable range of motion',prescriptionText:'2 × 45 seconds each side',provenance:'imported'},{id:'custom-mobility',label:'Shoulder preparation',seconds:45}],rampUpSets:kind==='general'?[]:[{id:'custom-ramps',targetExerciseEntryId:day.exercises[0].id,sets:[{id:'custom-ramp-1',loadKind:'instruction',loadInstruction:'Comfortable load with a controlled eccentric and deliberate pause',reps:12},{id:'custom-ramp-2',loadKind:'absolute',loadValue:42.5,reps:6}]}]};
 }
 if(kind==='long')day.warmupPlan.items=Array.from({length:8},(_,i)=>({...day.warmupPlan.items[0],id:'long-general-'+i,label:'Preparation '+(i+1)+' · '+day.warmupPlan.items[0].label}));
 state.activeWorkout=startWorkout(state,day);state.activeWorkout.startedAt=Date.now()-185000;
 state.activeWorkout.exercises[0].sets.forEach((set,i)=>Object.assign(set,{weight:100,reps:8,rir:2,completed:i===0}));
 if(kind==='generated')refreshWorkoutWarmup(state.activeWorkout,state.profile,state.program);
 state.activeWorkout.rest={startedAt:Date.now(),endsAt:Date.now()+3600000,duration:3600};
 return deserializeState(serializeState(state),{strict:true});
}
let initial=params.has('resume')?deserializeState(localStorage.getItem(STORAGE_KEY),{strict:true}):fixture(params.get('case')||'generated'),version=0;
function Harness(){const[state,setState]=useState(()=>structuredClone(initial));
 const update=(fn,options={})=>setState(prev=>{const next=fn(structuredClone(prev));if(!options.persistedState)saveState(next);return next;});
 return <div className="app-shell"><ActiveWorkout state={state} update={update} setPage={()=>{}} setDetail={()=>{}}/><output id="domain-proof" hidden>{JSON.stringify(state)}</output></div>;
}
const root=createRoot(document.getElementById('root'));const reset=()=>root.render(<Harness key={++version}/>);reset();
const qa=document.createElement('details');qa.id='warmup-qa';qa.innerHTML='<summary>Warm-up QA</summary><button id="matrix">Run four-theme suite</button><button id="reset">Reset fixture</button><button id="resume">Reload saved session</button><button id="fail">Toggle save failure</button><button id="record">Capture next collapse geometry</button><select aria-label="Review theme" id="theme"><option>premium-dark</option><option>premium-light</option><option>dark</option><option>light</option></select><pre id="proof"></pre>';document.body.append(qa);
const style=document.createElement('style');style.textContent='#warmup-qa{position:fixed;bottom:0;right:0;z-index:9999;font:10px system-ui;background:var(--rook-surface);color:var(--rook-text);width:150px}#warmup-qa button,#warmup-qa select{display:block;width:100%;min-height:44px}#proof{max-height:100px;overflow:auto}';document.head.append(style);
const el=id=>document.getElementById(id),frame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),settle=()=>new Promise(resolve=>setTimeout(resolve,260));
const theme=value=>{el('theme').value=value;Object.assign(document.documentElement.dataset,{theme:value.startsWith('premium')?'premium':value,style:value.startsWith('premium')?'premium':'standard',appearance:value.endsWith('dark')?'dark':'light'});};el('theme').onchange=()=>theme(el('theme').value);theme(params.get('theme')||'premium-dark');
const state=()=>JSON.parse(el('domain-proof').textContent),stage=()=>state().activeWorkout.warmup?.stages[0],progress=()=>warmupProgress(stage()),rows=()=>[...document.querySelectorAll('.warmup-check-row')],q=s=>document.querySelector(s),rect=e=>e.getBoundingClientRect();
const assert=(value,message)=>{if(!value)throw Error(message);},tap=async target=>{(typeof target==='string'?q(target):target).click();await frame();await frame();};
const fresh=async kind=>{initial=fixture(kind);reset();await settle();};
function measure(){const region=q('.workout-warmup'),controls=[...document.querySelectorAll('.workout-warmup button')].filter(b=>!b.closest('[inert]'));return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,region:region?{height:rect(region).height,top:rect(region).top}:null,controls:controls.map(b=>({name:b.textContent,width:rect(b).width,height:rect(b).height,contained:rect(b).left>=rect(region).left-.5&&rect(b).right<=rect(region).right+.5,overflow:b.scrollWidth>b.clientWidth+1})),scroll:document.scrollingElement.scrollTop,headingTop:rect(q('.exercise-heading')).top,header:rect(q('.workout-header')).top,rest:rect(q('.rest-timer')).top};}
async function suite(){const results=[];qa.open=false;try{
 for(const t of ['premium-dark','premium-light','dark','light']){theme(t);
  for(const kind of ['generated','custom','general','ramp','none']){el('proof').textContent=JSON.stringify({running:true,theme:t,kind,passed:results.length});
   await fresh(kind);const before=state(),base=measure();
   if(kind==='none'){assert(!q('.workout-warmup'),'Empty warm-up shown');results.push({theme:t,kind,passed:true});continue;}
   await tap('.workout-warmup-toggle');await settle();const geometry=measure();
   assert(!geometry.overflow&&geometry.controls.every(c=>c.height>=44&&c.contained&&!c.overflow),'Containment/targets');
   const footerHeight=rect(q('.warmup-exit')).height;assert(q('.warmup-exit').textContent==='Skip warm-up','Initial CTA');assert(!q('.warmup-skip'),'Duplicate Skip');
   await tap(rows().at(-1).querySelector('span'));assert(progress().done===1,'Whole row did not toggle once');
   await tap(rows().at(-1).querySelector('i'));assert(progress().done===0,'Indicator double toggle');
   await tap('.warmup-exit');await settle();assert(progress().outcome==='skipped'&&q('.workout-warmup-toggle').textContent==='Warm-up skipped','Skip summary');
   initial=deserializeState(localStorage.getItem(STORAGE_KEY),{strict:true});reset();await settle();assert(progress().outcome==='skipped','Skip reload');
   await tap('.workout-warmup-toggle');await settle();await tap(rows()[0]);
   if(rows().length>1){assert(q('.warmup-exit').textContent==='Skip remaining','Partial CTA');await tap('.warmup-exit');await settle();assert(q('.workout-warmup-toggle').textContent.includes('Remaining steps skipped'),'Partial summary');initial=deserializeState(localStorage.getItem(STORAGE_KEY),{strict:true});reset();await settle();assert(progress().outcome==='partial','Partial reload');await tap('.workout-warmup-toggle');await settle();}
   for(const row of rows())if(row.getAttribute('aria-checked')!=='true')await tap(row);
   assert(q('.workout-warmup-toggle').getAttribute('aria-expanded')==='true','Auto-collapse');assert(q('.warmup-exit').textContent==='Continue to workout','Full CTA');assert(Math.abs(rect(q('.warmup-exit')).height-footerHeight)<.5,'Footer height changed');
   await tap('.warmup-exit');await settle();assert(q('.warmup-summary-check')&&progress().outcome==='complete','Complete summary');
   const after=state();for(const key of ['id','exercises','startedAt','exerciseIndex','rest'])assert(JSON.stringify(before.activeWorkout[key])===JSON.stringify(after.activeWorkout[key]),'Changed '+key);assert(JSON.stringify(before.program)===JSON.stringify(after.program),'Plan changed');
   initial=deserializeState(localStorage.getItem(STORAGE_KEY),{strict:true});reset();await settle();assert(progress().outcome==='complete','Complete reload');
   await tap('.workout-warmup-toggle');await settle();await tap(rows()[0]);assert(!q('.warmup-summary-check'),'False check after correction');
   const draft=JSON.stringify(stage());await tap('.workout-warmup-toggle');await settle();assert(JSON.stringify(stage())===draft,'Chevron changed data');
   await tap('.workout-warmup-toggle');await settle();const row=rows()[0],checked=row.getAttribute('aria-checked');for(let i=0;i<11;i++)row.click();await frame();assert(rows()[0].getAttribute('aria-checked')!==checked,'Rapid taps lost');
   fail=true;const saved=JSON.stringify(stage());await tap('.warmup-exit');assert(JSON.stringify(stage())===saved&&q('.warmup-error')&&q('.workout-warmup-toggle').getAttribute('aria-expanded')==='true','Failed save changed UI');fail=false;await tap('.warmup-exit');await settle();assert(!q('.warmup-error'),'Retry error retained');
   results.push({theme:t,kind,passed:true,geometry,summary:measure(),base});
  }
 }
 await fresh(params.get('case')||'generated');el('proof').textContent=JSON.stringify({complete:true,width:innerWidth,results});
 }catch(error){fail=false;el('proof').textContent=JSON.stringify({complete:false,width:innerWidth,error:error.message,results});}}
el('matrix').onclick=suite;el('reset').onclick=async()=>{qa.open=false;await fresh(params.get('case')||'generated');};el('resume').onclick=()=>{params.set('resume','1');location.search=params.toString();};el('fail').onclick=()=>{fail=!fail;el('proof').textContent=fail?'Save failure enabled':'Save restored';};
el('record').onclick=()=>{qa.open=false;const frames=[];let start;const capture=()=>{frames.push({ms:Math.round(performance.now()-start),...measure()});if(performance.now()-start<3000)requestAnimationFrame(capture);else el('proof').textContent=JSON.stringify({capture:frames});};const button=q('.warmup-exit');if(button)button.addEventListener('click',()=>{start=performance.now();requestAnimationFrame(capture);},{once:true});};
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();qa.remove();style.remove();});
