import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';

const out='artifacts/missed-hide-motion',base=process.env.QA_URL||'http://127.0.0.1:4273';
await mkdir(out,{recursive:true});
await writeFile(`${out}/review.html`,'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Missed reminder motion — synthetic review</title></head><body><div id="root"></div><script type="module" src="./review.jsx"></script></body></html>');
await writeFile(`${out}/review.jsx`, `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Today} from '/src/App.jsx';
import {MissedWorkoutFeedbackProvider} from '/src/MissedWorkoutFeedback.jsx';
import {todayMissedRestFixture} from '/src/todayMissedRest.fixture.js';
${['styles','overrides','overlay','calendar','workout-controls','onboarding-controls','import-plan','coach','landing','theme','navigationFocus','activeLoggerTouch'].map(name=>`import '/src/${name}.css';`).join('\n')}
const params=new URLSearchParams(location.search),RealDate=Date;
const fixed=new RealDate(params.has('planned')?'2026-09-18T12:00:00':'2026-09-19T12:00:00').getTime();
window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
document.documentElement.dataset.style=params.get('style')||'premium';
document.documentElement.dataset.appearance=params.get('appearance')||'dark';
document.documentElement.dataset.theme=params.get('appearance')||'dark';
const initial=todayMissedRestFixture({count:Number(params.get('count')||3)});
if(params.has('long'))initial.program.days.forEach(day=>{day.name=day.workoutName='Upper body strength and controlled accessory movements';});
function Review(){const[state,setState]=useState(initial);window.readState=()=>structuredClone(state);window.changeState=setState;
return <div className="app-shell"><div className="app-content"><MissedWorkoutFeedbackProvider state={state} update={setState}><Today state={state} update={setState} setPage={()=>{}} setDetail={()=>{}}/></MissedWorkoutFeedbackProvider></div></div>;}
createRoot(document.getElementById('root')).render(<Review/>);
`);

const results=[];
async function settle(page){await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
async function read(page){return page.evaluate(()=>{
 const region=document.querySelector('.today-missed-disclosure'),below=region?.nextElementSibling;
 const bounds=node=>node?{top:node.getBoundingClientRect().top,height:node.getBoundingClientRect().height}:null;
 return {region:bounds(region),below:bounds(below),week:bounds(document.querySelector('.week-strip')),hero:bounds(document.querySelector('.rest-day-state h1')),
 opacity:region?Number(getComputedStyle(region).opacity):null,overflow:document.documentElement.scrollWidth>innerWidth,
 margin:below?getComputedStyle(below).marginTop:null,height:region?.style.height,content:!!region?.querySelector('.today-missed-row'),inert:region?.inert};
});}
// Pause real browser animations after the normal button handler has committed.
// Sampling fixed animation times lets reflow be compared without wall-clock flakes.
async function sampleAction(page,selector,times){return page.evaluate(async({selector,times})=>{
 document.querySelector(selector).click();await new Promise(r=>requestAnimationFrame(r));
 const region=document.querySelector('.today-missed-disclosure'),below=region.nextElementSibling;
 const animations=[...region.getAnimations(),...below.getAnimations()].filter(a=>a.playState!=='finished');
 const metadata=animations.map(a=>({target:a.effect.target.className,duration:a.effect.getTiming().duration,easing:a.effect.getTiming().easing,frames:a.effect.getKeyframes()}));
 animations.forEach(a=>a.pause());
 const samples=[];
 for(const time of times){animations.forEach(a=>a.currentTime=time);samples.push({time,height:region.getBoundingClientRect().height,below:below.getBoundingClientRect().top,opacity:Number(getComputedStyle(region).opacity),week:document.querySelector('.week-strip').getBoundingClientRect().top});}
 animations.forEach(a=>a.play());return {metadata,samples};
 },{selector,times});}
const sameData=(actual,expected)=>assert.deepEqual({...actual,dismissedMissedReminderKey:null},{...expected,dismissedMissedReminderKey:null});
async function verify(browser,engine,{width,style,appearance,count,reduce=false,planned=false}){
 const key=[engine,width,style,appearance,count,reduce?'reduced':'motion',planned?'planned':'rest'].join('-');
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:true,isMobile:true,reducedMotion:reduce?'reduce':'no-preference',serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 try{
  await page.goto(`${base}/${out}/review.html?style=${style}&appearance=${appearance}&count=${count}${count===1?'&long':''}${planned?'&planned':''}`);
  await page.locator('.today-missed-row').waitFor();await settle(page);
  const before=await read(page),state=await page.evaluate(()=>window.readState());
  assert.equal(before.overflow,false);assert.ok(before.region.height>44);
  // Compare the original bare-aside layout against the animated wrapper. This
  // catches added paragraph margins and hidden gaps without a screenshot guess.
  const original=await page.evaluate(()=>{
   const region=document.querySelector('.today-missed-disclosure'),inner=region.firstElementChild,row=inner.firstElementChild,below=region.nextElementSibling;
   const style=document.createElement('style');style.textContent='.rest-day-state > .today-missed-row {margin-top:16px;border-bottom:0}.rest-day-state > .today-missed-row + .rest-up-next {margin-top:16px}.rest-up-next{transition:none!important}';document.head.append(style);
   region.replaceWith(row);const top=below.getBoundingClientRect().top;
   row.replaceWith(region);inner.append(row);style.remove();return top;
  });
  assert.equal(before.below.top,original,'Open reminder keeps its previous spacing');
  const targets=await page.locator('.today-missed-row button').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
  targets.forEach(b=>assert.ok(b.width>=44&&b.height>=44));
  const closing=await sampleAction(page,'.missed-reminder-hide',[0,40,100,180]);
  if(!reduce){
   const heightAnimation=closing.metadata.find(a=>a.frames.some(f=>f.height));assert.equal(heightAnimation.duration,200);assert.equal(heightAnimation.easing,'cubic-bezier(0.2, 0, 0, 1)');
   assert.ok(closing.samples[0].height>closing.samples[1].height&&closing.samples[1].height>closing.samples[2].height&&closing.samples[2].height>closing.samples[3].height);
   assert.ok(closing.samples[0].below>closing.samples[1].below&&closing.samples[1].below>closing.samples[2].below&&closing.samples[2].below>closing.samples[3].below);
   closing.samples.forEach(s=>assert.equal(s.week,before.week.top));
  }else assert.equal(closing.metadata.length,0);
  await settle(page);await page.locator('.today-missed-row').waitFor({state:'detached'});
  const hidden=await read(page);assert.equal(hidden.region.height,0);assert.equal(hidden.content,false);assert.equal(hidden.inert,true);assert.equal(hidden.week.top,before.week.top);
  const absentTop=await page.evaluate(()=>{const region=document.querySelector('.today-missed-disclosure'),below=region.nextElementSibling;region.remove();const top=below.getBoundingClientRect().top;below.before(region);return top;});
  assert.equal(hidden.below.top,absentTop,'Closed reminder leaves exactly the layout of an absent reminder');
  assert.ok(hidden.below.top<before.below.top);sameData(await page.evaluate(()=>window.readState()),state);
  const opening=await sampleAction(page,'.exercise-remove-undo button',[0,40,100,180]);
  if(!reduce){assert.ok(opening.samples[0].height<opening.samples[1].height&&opening.samples[1].height<opening.samples[2].height);assert.ok(opening.samples[0].below<opening.samples[1].below&&opening.samples[1].below<opening.samples[2].below);}
  await settle(page);const restored=await read(page);assert.deepEqual(restored,before);sameData(await page.evaluate(()=>window.readState()),state);
  // Actual pointer tap on Hide followed by a quick Undo while collapsing.
  await page.locator('.missed-reminder-hide').tap();await page.locator('.exercise-remove-undo button').tap();await settle(page);assert.deepEqual(await read(page),before);
  // Navigate off Today during the closing animation, then Undo and return.
  await page.evaluate(()=>{document.querySelector('.missed-reminder-hide').click();window.changeState(s=>({...s,selectedDate:'2026-09-20',selectedDay:'Sun'}));});
  await page.locator('.today-missed-disclosure').waitFor({state:'detached'});
  await page.locator('.exercise-remove-undo button').tap();
  await page.evaluate(date=>window.changeState(s=>({...s,selectedDate:date,selectedDay:date.endsWith('18')?'Fri':'Sat'})),state.selectedDate);
  await page.locator('.today-missed-row').waitFor();await settle(page);assert.deepEqual(await read(page),before);
  if(width===390&&style==='standard'&&appearance==='dark'&&!reduce&&!planned){
   await page.locator('.missed-reminder-hide').tap();
   const notice=page.locator('.exercise-remove-undo');await notice.waitFor();
   const accepted=await page.evaluate(()=>structuredClone(window.readState()));
   const box=await notice.boundingBox(),x=box.x+26,y=box.y+box.height/2;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+45,y,{steps:4});
   assert.match(await notice.evaluate(node=>node.style.transform),/translate3d\(45px/,'snackbar follows the pointer before release');
   await page.mouse.move(x+130,y,{steps:4});await page.mouse.up();
   await notice.waitFor({state:'detached'});
   assert.deepEqual(await page.evaluate(()=>window.readState()),accepted,'swipe dismisses only the message, not the Hide transaction');
  }
  if(!reduce&&!planned&&count===1)await page.screenshot({path:`${out}/${key}.png`,fullPage:true});
  assert.deepEqual(errors,[]);results.push({key,before,hidden,restored,closing,opening,passed:true});console.log('PASS',key);
 }finally{await context.close();}
}
try{
 if(process.env.QA_ENGINE!=='webkit'){
 const chrome=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [320,390,430])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const count of [1,3])for(const reduce of [false,true])await verify(chrome,'chromium',{width,style,appearance,count,reduce});
 for(const width of [320,390,430])await verify(chrome,'chromium',{width,style:'premium',appearance:'dark',count:2,planned:true});}finally{await chrome.close();}}
 const safari=await webkit.launch({headless:true});
 try{for(const width of [320,390,430])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])await verify(safari,'webkit',{width,style,appearance,count:width===320?1:3,reduce:false});
 await verify(safari,'webkit',{width:390,style:'premium',appearance:'dark',count:1,reduce:true});}finally{await safari.close();}
}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(`${results.length} cases passed; ${out}/results.json`);
