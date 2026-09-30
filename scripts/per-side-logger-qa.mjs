// Real ActiveWorkout/Stepper components; isolated synthetic state, no owner data.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';

const dir='artifacts/per-side-polish';
const origin=process.env.ROOK_QA_URL||'http://127.0.0.1:4273';
await mkdir(dir,{recursive:true});
await writeFile(`${dir}/review.html`, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="./review.jsx"></script></body></html>');
await writeFile(`${dir}/review.jsx`, `
import React,{useState,useRef} from 'react';import{createRoot}from'react-dom/client';
import{ActiveWorkout,ModalLayer,Detail,Stepper}from'/src/App.jsx';
import{createReturningUserFixture}from'/src/demoFixture.js';
import{startFreestyleWorkout,addFreestyleExercise}from'/src/freestyleWorkout.js';
import'/src/styles.css';import'/src/overrides.css';import'/src/overlay.css';
import'/src/workout-controls.css';import'/src/onboarding-controls.css';import'/src/theme.css';import'/src/activeLoggerTouch.css';
const p=new URLSearchParams(location.search);
document.documentElement.dataset.style=p.get('style')||'standard';
document.documentElement.dataset.appearance=p.get('appearance')||'light';
function Harness(){
 const ref=useRef(null);const[state,setState]=useState(()=>{
  let s=createReturningUserFixture(0);s.profile.rirEnabled=p.get('rir')!=='off';s.profile.restTimerEnabled=false;
  s=startFreestyleWorkout(s);s=addFreestyleExercise(s,p.get('kind')==='none'?'y-balance-reach':p.get('kind')==='weighted'?'split-squat':'bodyweight-split-squat');
  s=addFreestyleExercise(s,'pull-up');const e=s.activeWorkout.exercises[0];
  e.loggingMode=p.get('mode')==='normal'?'reps':'per_side';e.unilateral=p.get('mode')!=='normal';
  e.importedName='Single-leg exercise with a deliberately long name to check wrapping';
  e.failureTarget=p.get('failure')==='1';e.repMin=e.failureTarget?null:8;e.repMax=e.failureTarget?null:12;
  e.sets=Array.from({length:3},(_,i)=>({...e.sets[0],id:'qa-set-'+i,weight:p.get('kind')==='weighted'?35:[null,0,10][i],reps:8,sides:{left:{reps:8},right:{reps:8}},completed:false}));return s;
 });
 const[detail,setDetail]=useState(null);const update=f=>setState(s=>f(structuredClone(s)));
 const[legacyWeight,setLegacyWeight]=useState(null);window.reviewState=()=>structuredClone(state);
 if(p.has('legacy'))return <div className="workout-screen"><section className="sets"><div className="set-row per-side"><Stepper className="logger-load" label="Legacy bodyweight load" emptyLabel="Bodyweight" value={legacyWeight} step={2.5} onChange={setLegacyWeight}/></div></section></div>;
 return <><div ref={ref}><ActiveWorkout state={state} update={update} setDetail={setDetail} setPage={()=>{}}/></div>{detail&&<ModalLayer backgroundRef={ref} close={()=>setDetail(null)}><Detail detail={detail} state={state} update={update} setDetail={setDetail} close={()=>setDetail(null)}/></ModalLayer>}</>;
}createRoot(document.getElementById('root')).render(<Harness/>);
`);

const results=[];
async function tapAt(page,locator,rx=.5,ry=.5){
 await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();
 await page.touchscreen.tap(b.x+b.width*rx,b.y+b.height*ry);
}
function measure(node){
 const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
 const controls=[...node.querySelectorAll('button,input')].map(e=>({label:e.getAttribute('aria-label'),...box(e)}));
 const hits=[...node.querySelectorAll('button:not(:disabled),input:not(:disabled)')].flatMap(e=>{
  // Edge midpoints stay inside the existing rounded button corners.
  const r=e.getBoundingClientRect();return[[2,r.height/2],[r.width-2,r.height/2],[r.width/2,2],[r.width/2,r.height-2],[r.width/2,r.height/2]].map(([x,y])=>({label:e.getAttribute('aria-label'),ok:e.contains(document.elementFromPoint(r.x+x,r.y+y))}));
 });
 const values=[...node.querySelectorAll('.stepper-display-label')].map(e=>{
  const input=e.parentElement.querySelector('input'),s=getComputedStyle(e),i=getComputedStyle(input);
  return{text:e.textContent,size:s.fontSize,inputSize:i.fontSize,line:s.lineHeight,inputLine:i.lineHeight,font:s.fontFamily,inputFont:i.fontFamily,align:s.alignItems,
   parts:[...e.children].map(c=>({box:box(c),size:getComputedStyle(c).fontSize,weight:getComputedStyle(c).fontWeight})),box:box(e)};
 });
 return{row:box(node),controls,hits,values,overflow:document.documentElement.scrollWidth-innerWidth};
}
for(const [engine,type] of [['chrome',chromium],['webkit',webkit]]){
 const browser=await type.launch(engine==='chrome'?{channel:'chrome',headless:true}:{headless:true});
 try{
  for(const width of [320,390,430])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const rir of ['on','off']){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   for(const variant of ['bodyweight','weighted','none','normal']){
    const params=new URLSearchParams({style,appearance,rir,kind:variant==='normal'?'bodyweight':variant,mode:variant==='normal'?'normal':'per-side',failure:variant==='weighted'?'1':'0'});
    const key=[engine,width,style,appearance,rir,variant].join('-');
    await page.goto(`${origin}/${dir}/review.html?${params}`,{waitUntil:'domcontentloaded'});
    const row=page.locator('.set-row').first();await row.waitFor();await row.scrollIntoViewIfNeeded();
    const m=await row.evaluate(measure);results.push({key,...m});
    assert(m.overflow<=1,`${key}: horizontal overflow`);
    assert(m.hits.every(h=>h.ok),`${key}: intercepted hit ${JSON.stringify(m.hits.filter(h=>!h.ok))}`);
    for(let i=0;i<m.controls.length;i++)for(let j=i+1;j<m.controls.length;j++){
     const a=m.controls[i],b=m.controls[j];
     assert(!(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1),`${key}: overlap ${a.label}/${b.label}`);
    }
    if(variant!=='normal'){
     assert(m.row.h<=104,`${key}: per-side row too tall (${m.row.h})`);
     assert(m.controls.every(c=>c.w>=43.9&&c.h>=44),`${key}: small interactive target ${JSON.stringify(m.controls)}`);
    }else assert(m.row.h<=56,`${key}: normal row grew`);
    for(const v of m.values){
     assert.equal(v.size,v.inputSize,`${key}: idle/edit font size differs`);
     assert.equal(v.line,v.inputLine,`${key}: idle/edit line height differs`);
     assert.equal(v.font,v.inputFont,`${key}: idle/edit font family differs`);
     for(const part of v.parts){assert.equal(part.size,v.inputSize,`${key}: nested token size`);
      assert(Math.abs(part.box.y+part.box.h/2-(v.box.y+v.box.h/2))<1,`${key}: token not vertically centered`);}
    }
    if(variant==='none'){
     assert.equal(await row.locator('.logger-load input').count(),0,'No-load exercise must stay read-only');
     assert.equal(await row.locator('.set-load-context').innerText(),'Bodyweight');
    }else{
     // Real touchscreen taps on the native field under the visible BW/+10 text.
     for(const index of [0,1,2]){
      const input=page.locator('.set-row').nth(index).locator('.logger-load input');
      await tapAt(page,input,index===0?.04:index===1?.96:.5,.5);
      assert(await input.evaluate(e=>document.activeElement===e),`${key}: field did not receive focus`);
      await input.press('Enter');
     }
     const third=page.locator('.set-row').nth(2);await third.scrollIntoViewIfNeeded();
     const tm=await third.evaluate(measure);
     for(const v of tm.values)for(const p of v.parts)assert(Math.abs(p.box.y+p.box.h/2-(v.box.y+v.box.h/2))<1,`${key}: +load baseline`);
    }
    if(variant==='bodyweight'){
     const first=page.locator('.set-row').first(),input=first.locator('.logger-load input');
     const initial=await page.evaluate(()=>({id:reviewState().activeWorkout.id,start:reviewState().activeWorkout.startedAt}));
     await tapAt(page,input);await input.fill('12,5');
     await tapAt(page,first.locator('.logger-load button').last(),.94,.85);
     assert.equal(await input.inputValue(),'13','raw draft then existing 1 kg step must survive blur');
     const sides=first.locator('.unilateral-side');
     await tapAt(page,sides.nth(0).locator('button').last(),.94,.85);
     await tapAt(page,sides.nth(1).locator('button').last(),.06,.15);
     await tapAt(page,sides.nth(1).locator('button').last(),.94,.85);
     assert.deepEqual(await sides.locator('input').evaluateAll(nodes=>nodes.map(n=>n.value)),['9','10']);
     await tapAt(page,first.locator('.check'),.9,.85);
     const state=await page.evaluate(()=>reviewState());
     assert.equal(state.activeWorkout.id,initial.id);assert.equal(state.activeWorkout.startedAt,initial.start);
     assert.equal(state.activeWorkout.exercises[0].sets[0].completed,true);
     assert.equal(state.activeWorkout.exercises[0].sets[0].weight,13);
     if(rir==='on'&&style==='premium'&&appearance==='dark'){
      await first.scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/after-${engine}-${width}.png`});
     }
    }
   }
   assert.deepEqual(errors,[]);await context.close();
   console.log(`PASS ${engine} ${width} ${style}/${appearance} RIR ${rir}: bodyweight, weighted/failure, no-load, normal`);
  }
  // The shared Stepper's legacy full-word Bodyweight label must also pass taps.
  const context=await browser.newContext({viewport:{width:320,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();await page.goto(`${origin}/${dir}/review.html?legacy=1`);
  const input=page.getByRole('spinbutton',{name:'Legacy bodyweight load'});await input.waitFor();
  assert.equal(await page.locator('.stepper-empty-label').innerText(),'Bodyweight');
  await tapAt(page,input);assert(await input.evaluate(e=>document.activeElement===e));
  await input.fill('10');await input.press('Enter');assert.equal(await input.inputValue(),'10');
  await context.close();
 }finally{await browser.close();}
}
await writeFile(`${dir}/after.json`,JSON.stringify(results,null,2));
console.log(`PASS ${results.length} layouts + native load/side/Done taps; legacy Bodyweight focus in both engines`);
