// Focused shared-renderer proof on the real local build, isolated QA storage.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {exerciseCatalog} from '../src/domain.js';
import {startFreestyle} from './qa-current-navigation.mjs';
const out='artifacts/ROOK-ILLUSTRATION-SYSTEM-2026-09-12/after/surfaces';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const item=Object.values(exerciseCatalog).find(e=>e.artId==='wg-archer-push-up');
try{for(const width of [320,390])for(const source of ['planned','freestyle']){
 const state=createReturningUserFixture(1);state.workouts=[];state.activeWorkout=null;
 Object.assign(state.profile,{showExerciseImages:true,stylePreference:'standard',appearancePreference:'dark',themePreference:'dark'});
 // Pin a scheduled day: a Sunday wall clock must not turn this art test into
 // a rest-day screen with no planned exercise rows.
 const date='2026-09-14',day=state.program.days[0];day.weekday='Mon';day.name='Illustration QA';
 day.exercises=[{...day.exercises[0],exerciseId:item.id}];
 // A deliberately one-exercise owner-authored fixture, not a generated program
 // with its required duration/weekly-volume validation contract removed.
 state.program.source='manual';state.program.userEdited=true;
 state.program.rotationStartDate=null;
 state.selectedDay=day.weekday;state.selectedDate=date;
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce',serviceWorkers:'allow'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date(`${date}T12:00:00`));
 // No request routing here: keep native service-worker/cache behavior observable.
 await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4177');
 const verify=async selector=>{
  const img=page.locator(selector);await img.waitFor();await img.evaluate(e=>e.decode());
  const src=await img.getAttribute('src');assert.ok(src.includes('wg-archer-push-up-'));
  const bytes=await page.evaluate(async src=>(await fetch(src)).text(),src);
  assert.equal(bytes,await readFile('src/assets/exercise-art/wg-archer-push-up.svg','utf8'),'served artwork is the current reviewed SVG');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  return src;
 };
 if(source==='planned'){
  await page.locator('.today-screen .exercise-list-row').first().click();await verify('.exercise-detail-art');
  await page.getByRole('button',{name:/^Close/}).click();
  await page.getByRole('button',{name:'START WORKOUT',exact:true}).click();
 }else{
  await startFreestyle(page);
  await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search exercises',exact:true}).fill(item.name);
  await page.locator('.freestyle-picker .list-row').filter({hasText:item.name}).first().click();
 }
 const src=await verify('.exercise-heading-art');
 await page.locator('.exercise-heading-art-button').click();
 assert.equal(await verify('.exercise-visual-stage img'),src);
 await page.screenshot({path:`${out}/${width}-${source}-viewer.png`});
 await page.getByRole('button',{name:'Close visual viewer',exact:true}).click();
 await page.locator('.exercise-visual-viewer').waitFor({state:'detached'});
 await verify('.exercise-heading-art');
 // The same fingerprinted artwork is reusable offline; no separate legacy URL.
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const worker=context.serviceWorkers()[0];
 await worker.evaluate(()=>{self.artQaErrors=[];self.addEventListener('unhandledrejection',e=>self.artQaErrors.push(String(e.reason)));});
 await page.reload({waitUntil:'networkidle'});
 await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
 await verify('.exercise-heading-art');
 await page.evaluate(async src=>{await fetch(src);},src);
 let cached=false;
 for(let attempt=0;attempt<50&&!cached;attempt++){
  cached=await page.evaluate(async src=>!!(await caches.match(src,{ignoreVary:true})),src);
  if(!cached)await page.waitForTimeout(100);
 }
 if(!cached)console.log('Cache diagnostics:',await worker.evaluate(()=>self.artQaErrors),JSON.stringify(await page.evaluate(async()=>Promise.all((await caches.keys()).map(async key=>({key,urls:(await (await caches.open(key)).keys()).map(r=>r.url)}))))));
 assert.ok(cached,'current fingerprinted image was cached by the real service worker');
 await context.setOffline(true);
 // A separate intentional reopen, after the shared overlay's click-through guard.
 await page.waitForTimeout(400);
 await page.locator('.exercise-heading-art-button').click();
 await verify('.exercise-visual-stage img');
 await page.getByRole('button',{name:'Close visual viewer',exact:true}).click();
 assert.deepEqual(errors,[]);
 assert.deepEqual(await worker.evaluate(()=>self.artQaErrors),[]);
 results.push({width,source,src,todayDetail:source==='planned',picker:source==='freestyle',active:true,viewer:true,offlineReopen:true,result:'PASS'});
 await context.close();console.log(`PASS ${width} ${source}: shared asset, active/viewer, offline reopen`);
}}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
