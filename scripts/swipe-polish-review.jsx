import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ActiveWorkout,PlanEditor} from '/src/App.jsx';
import {createReturningUserFixture} from '/src/demoFixture.js';
import {startWorkout,serializeState,deserializeState} from '/src/domain.js';
import {SWIPE_ROW} from '/src/swipeRowAction.js';
import '/src/styles.css';import '/src/overrides.css';import '/src/overlay.css';import '/src/calendar.css';import '/src/workout-controls.css';import '/src/onboarding-controls.css';import '/src/import-plan.css';import '/src/coach.css';import '/src/landing.css';import '/src/theme.css';import '/src/navigationFocus.css';import '/src/activeLoggerTouch.css';

if(!import.meta.env.DEV||location.origin!=='http://127.0.0.1:4198')throw Error('Isolated development review only');
const key='rook-swipe-polish-synthetic',params=new URLSearchParams(location.search),scenario=params.get('case')||'active';
const names=['Incline Machine Press','Cable Fly','Straight-Arm Pulldown','Straight Bar Cable Pushdown','Single-Arm Cable Pulldown with a deliberately long exercise name and controlled tempo'];
function fixture(){
 const state=createReturningUserFixture(0),day=structuredClone(state.program.days[0]);
 day.exercises=day.exercises.slice(0,names.length);
 day.exercises.forEach((exercise,i)=>{
  const reps=[8,7,9,8,10][i];
  Object.assign(exercise,{importedName:names[i],repMin:reps,repMax:reps,rir:null,notes:'',personalNote:''});
  exercise.sets=exercise.sets.slice(0,2).map(set=>({...set,reps,rir:null}));
 });
 if(scenario!=='active')state.program.days[0]=day;
 state.activeWorkout=startWorkout(state,day);
 Object.assign(state.activeWorkout.exercises[0].sets[0],{completed:true,weight:52.5});
 Object.assign(state.profile,{showExerciseImages:false,restTimerEnabled:false,rirEnabled:false});
 return state;
}
const initial=params.has('resume')?deserializeState(localStorage.getItem(key),{strict:true}):fixture();
function Harness(){
 const [state,setState]=useState(initial),[saved,setSaved]=useState('');
 const update=fn=>setState(prev=>{const next=fn(structuredClone(prev));localStorage.setItem(key,serializeState(next));return next;});
 return <div className="app-shell">
  {scenario==='active'?<ActiveWorkout state={state} update={update} setPage={()=>setSaved('Today')} setDetail={()=>setSaved('Options')}/>:
   <main className="screen detail-screen edit-plan-screen"><PlanEditor source={state.program} profile={state.profile} exerciseState={state} mode={scenario==='scratch'?'scratch':'edit'} onSave={program=>{update(s=>({...s,program}));setSaved('Saved');}} onCancel={()=>setSaved('Cancelled')}/></main>}
  <output id="domain-proof" hidden>{JSON.stringify({saved,session:state.activeWorkout,plan:state.program})}</output>
 </div>;
}
const reviewRoot=createRoot(document.getElementById('root'));reviewRoot.render(<Harness/>);
const qa=document.createElement('details');qa.id='swipe-polish-qa';
qa.innerHTML=`<summary>Swipe polish QA</summary>
 <label>Theme <select id="theme"><option>premium-dark</option><option>premium-light</option><option>dark</option><option>light</option></select></label>
 <label>Row <select id="row"><option value="0">First</option><option value="1">Second</option><option value="2">Third</option><option value="3">Long name</option></select></label>
 <button id="samples">Measure all rows</button><button id="slow">Slow reveal</button><button id="partial">Hold partial reveal</button><button id="short">Below threshold</button><button id="open">Above threshold</button><button id="right">Close right</button><button id="closing">Closing animation</button><button id="two">Open two rows</button><button id="vertical">Vertical intent</button><button id="edge">Left edge</button><button id="reset">Reset fixture</button>
 <pre id="proof"></pre>`;
const style=document.createElement('style');style.textContent='#swipe-polish-qa{position:fixed;right:0;top:0;z-index:9999;background:#eee;color:#111;font:11px system-ui;max-width:180px}#swipe-polish-qa button,#swipe-polish-qa label{display:block;width:100%;min-height:28px;margin:2px 0}#proof{max-height:160px;overflow:auto;white-space:pre-wrap}';document.head.append(style);document.body.append(qa);
// Fixture controls must not themselves count as an outside tap on the real list.
const fixturePointer=event=>{if(qa.contains(event.target))event.stopPropagation();};
window.addEventListener('pointerdown',fixturePointer,true);
const control=id=>qa.querySelector('#'+id),rows=()=>[...document.querySelectorAll('[data-swipe-row][data-swipe-enabled=true]')];
const theme=()=>{const value=control('theme').value;Object.assign(document.documentElement.dataset,{theme:value.startsWith('premium')?'premium':value,style:value.startsWith('premium')?'premium':'standard',appearance:value.endsWith('dark')?'dark':'light'});};
control('theme').onchange=theme;theme();
const frame=()=>new Promise(requestAnimationFrame),settled=()=>new Promise(resolve=>setTimeout(resolve,SWIPE_ROW.duration+40));
const rect=node=>node.getBoundingClientRect();
function measure(row){
 const content=row.querySelector('[data-swipe-content]'),action=row.querySelector('[data-swipe-action]');
 const name=row.querySelector('.up-next-title,.plan-editor-heading strong'),prescription=row.querySelector('.up-next-prescription');
 const r=rect(row),c=rect(content),a=rect(action),p=prescription&&rect(prescription),n=name&&rect(name);
 const hit=(x,y)=>action.contains(document.elementFromPoint(x,y));
 return {name:name?.textContent,prescription:prescription?.textContent,open:row.hasAttribute('data-swipe-revealed'),rowWidth:r.width,rowHeight:r.height,
  travel:-new DOMMatrixReadOnly(getComputedStyle(content).transform).m41,gap:a.left-c.right,actionWidth:a.width,actionHeight:a.height,actionX:a.x,
  prescriptionGap:p?a.left-p.right:null,nameX:n?.x,prescriptionX:p?.x,
  actionTransform:getComputedStyle(action).transform,foregroundBackground:getComputedStyle(content).backgroundColor,
  coveredAreaHitsForeground:c.right>a.left?content.contains(document.elementFromPoint((a.left+c.right)/2,a.top+a.height/2)):null,
  foregroundZ:getComputedStyle(content).zIndex,actionZ:getComputedStyle(action).zIndex,radius:getComputedStyle(action).borderRadius,
  visibility:getComputedStyle(action).visibility,transition:getComputedStyle(content).transition,
  actionHits:[hit(a.left+10,a.top+10),hit(a.right-10,a.top+10),hit(a.left+10,a.bottom-10),hit(a.right-10,a.bottom-10)],
  separatorOwner:row.querySelector('.swipe-up-next-body')?.parentElement===content,
  pageOverflow:document.documentElement.scrollWidth>innerWidth};
}
async function drag(row,distance,{steps=8,dy=0,edge=false,hold=false,position=true,trace=false}={}){
 if(position)row.scrollIntoView({block:'center'});await frame();await frame();
 const target=row.querySelector('.up-next-main,.plan-editor-heading'),b=rect(row),x=edge?4:b.left+b.width*.72,y=b.top+b.height/2;
 const send=(type,dx,ddy)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:type==='touchend'?[]:[{identifier:1,clientX:x+dx,clientY:y+ddy}]});target.dispatchEvent(event);};
 send('touchstart',0,0);
 for(let i=1;i<=steps;i++){send('touchmove',distance*i/steps,dy*i/steps);await frame();}
 const tracking=measure(row);
 if(!hold)send('touchend',distance,dy);
 const frames=[];
 if(trace){const end=performance.now()+SWIPE_ROW.duration+40;while(performance.now()<end){frames.push(measure(row));await frame();}}
 else await settled();
 return {tracking,settled:measure(row),...(trace?{frames}:{})};
}
async function run(kind){
 qa.open=false;control('proof').textContent='Running';
 let result;
 if(kind==='samples'){
  result=[];
  for(const row of rows()){
   const before=measure(row),after=await drag(row,-92);
   result.push({before,...after});
  }
 } else if(kind==='two'){
  const [first,second]=rows();
  // Keep both rows stationary/visible so opening the second, not a scroll, closes the first.
  first.parentElement.scrollIntoView({block:'end'});await frame();await frame();
  await drag(first,-92,{position:false});result={second:await drag(second,-92,{position:false}),first:measure(first)};
 } else if(kind==='closing'){
  const row=rows()[Number(control('row').value)];await drag(row,-92);
  result=await drag(row,65,{trace:true,position:false});
 } else {
  const row=rows()[Number(control('row').value)];
  result=await drag(row,kind==='right'?92:kind==='short'?-35:kind==='open'?-36:kind==='partial'?-24:kind==='vertical'?-3:-92,{steps:kind==='slow'?40:8,dy:kind==='vertical'?100:0,edge:kind==='edge',hold:kind==='partial'});
 }
 control('proof').textContent=JSON.stringify(result);
}
for(const kind of ['samples','slow','partial','short','open','right','closing','two','vertical','edge'])control(kind).onclick=()=>run(kind);
control('reset').onclick=()=>location.href=location.pathname+'?case='+scenario;
if(import.meta.hot)import.meta.hot.dispose(()=>{reviewRoot.unmount();qa.remove();style.remove();window.removeEventListener('pointerdown',fixturePointer,true);});
