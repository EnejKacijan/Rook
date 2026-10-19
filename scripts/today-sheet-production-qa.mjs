import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {chromium} from 'playwright-core';
import {dayOverflowFixture} from '../src/dayOverflow.fixture.js';import {serializeState} from '../src/domain.js';
const NativeDate=Date,fixed='2026-09-17T18:00:00';globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return new NativeDate(fixed).getTime();}};
const state=dayOverflowFixture({count:2});state.program.createdAt='2026-09-14T12:00:00';state.program.trainingBlock.startDate='2026-09-14';Object.assign(state.profile,{showExerciseImages:false,stylePreference:'premium',appearancePreference:'dark',themePreference:'premium'});
state.workouts[0].endedEarly=true;state.workouts[0].status='ended-early';state.workouts[0].exercises[0].sets.at(-1).completed=false;
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),results=[];
await context.addInitScript(({fixed,seed})=>{
 const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return new NativeDate(fixed).getTime();}};
 const native=localStorage,prefix='rook-today-motion-production-qa:';Object.defineProperty(window,'localStorage',{value:{getItem:k=>native.getItem(prefix+k),setItem:(k,v)=>native.setItem(prefix+k,v),removeItem:k=>native.removeItem(prefix+k)}});localStorage.setItem('lift-v2-state',seed);
 window.longTasks=[];new PerformanceObserver(l=>window.longTasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask'});
},{fixed,seed:serializeState(state)});
await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
try{
 await page.goto('http://127.0.0.1:4199/');const trigger=page.getByRole('button',{name:'Today options',exact:true});await trigger.waitFor();
 for(let i=0;i<10;i++){
  await page.evaluate(()=>{
   window.probe={frames:[],done:false};document.addEventListener('click',()=>probe.start=performance.now(),{capture:true,once:true});
   const observer=new MutationObserver(()=>{const panel=document.querySelector('.today-actions-sheet');if(!panel)return;observer.disconnect();probe.mount=performance.now()-probe.start;
    const frame=()=>{probe.frames.push({time:performance.now()-probe.start,top:panel.getBoundingClientRect().top});if(performance.now()-probe.start<350)requestAnimationFrame(frame);else{probe.longTasks=longTasks.filter(e=>e.start+e.duration>=probe.start&&e.start<performance.now());probe.done=true;}};frame();
   });observer.observe(document.body,{childList:true,subtree:true});
  });
  await trigger.tap();await page.waitForFunction(()=>probe.done);const probe=await page.evaluate(()=>probe);assert.ok(probe.frames[0].top>=844&&probe.frames[1].top>=844);results.push(probe);
  await page.locator('.today-actions-sheet .detail-header-close').tap();await page.locator('.today-actions-sheet').waitFor({state:'detached'});await page.locator('.app-content[inert]').waitFor({state:'detached'});
 }
}finally{await browser.close();await writeFile('artifacts/today-sheet-motion/production.json',JSON.stringify(results,null,2));}
const first=results.map(p=>p.frames.find(f=>f.top<p.frames[0].top-.1).time).sort((a,b)=>a-b);console.log({cases:results.length,firstMotionMs:{min:first[0],median:first[5],max:first.at(-1)},longTasks:results.flatMap(p=>p.longTasks)});
