import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/workout-history-export';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const shot=async(page,name)=>{await page.waitForTimeout(180);await page.screenshot({path:`${out}/${name}.png`});};
async function open(width,appearance,style,count=2){
 const state=createReturningUserFixture(2);state.activeWorkout=null;Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 state.workouts=Array.from({length:count},(_,i)=>({...structuredClone(state.workouts[0]),id:`export-${i}`,sessionNote:'Synthetic QA private note'}));
 if(count>1000)state.workouts=state.workouts.map(w=>({id:w.id,name:w.name,completedAt:w.completedAt,exercises:[{exerciseId:'barbell-bench-press',sets:[{completed:true,weight:80,reps:8,rir:1}]}]}));
 const context=await browser.newContext({viewport:{width,height:844},colorScheme:appearance,serviceWorkers:'block',acceptDownloads:true});
 await context.addInitScript(s=>{localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage(),errors=[],posts=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await page.locator('.profile-data-actions').scrollIntoViewIfNeeded();
 return {page,context,errors,posts};
}
async function enter(page){await page.getByRole('button',{name:/Export workout history CSV/}).click();await page.locator('.history-export-screen').waitFor();}
try{
 for(const width of [320,390,430])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
  const {page,context,errors,posts}=await open(width,appearance,style),key=`${width}-${style}-${appearance}`;
  await shot(page,`${key}-data`);await enter(page);await shot(page,`${key}-csv`);
  assert.equal(await page.getByRole('checkbox').isChecked(),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.locator('.history-export-formats .is-selected').evaluate(b=>getComputedStyle(b).color!==getComputedStyle(b).backgroundColor),true,'selected label remains visible');
  await page.getByRole('radio',{name:'JSON',exact:true}).click();await shot(page,`${key}-json`);
  await page.getByRole('radio',{name:'JSON',exact:true}).press('ArrowLeft');assert.equal(await page.getByRole('radio',{name:'CSV',exact:true}).getAttribute('aria-checked'),'true');await page.getByRole('radio',{name:'CSV',exact:true}).press('ArrowRight');
  await page.getByRole('checkbox').check();await shot(page,`${key}-notes`);
  await page.getByRole('button',{name:'EXPORT',exact:true}).click();await page.getByRole('button',{name:'SHARE / DOWNLOAD'}).waitFor();await shot(page,`${key}-ready`);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'SHARE / DOWNLOAD'}).click();const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/^ROOK-workout-history-\d{4}-\d{2}-\d{2}\.json$/);
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(exported.workouts.length,2);assert.equal(exported.metadata.notes_included,true);assert.equal(exported.workouts[0].session_note,'Synthetic QA private note');
  await shot(page,`${key}-handoff`);assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);await context.close();console.log(`${key}: selectors, privacy, actual JSON download, no overflow passed`);
 }
 for(const scenario of ['empty','large','error','cancelled','shared','offline']){
  const {page,context}=await open(320,'dark','standard',scenario==='empty'?0:scenario==='large'?1200:2);await enter(page);
  if(scenario==='offline')await context.setOffline(true);
  if(scenario==='large'){
   // Slow only cooperative export yields to make the genuine busy state capturable.
   await page.evaluate(()=>{const original=window.setTimeout;window.setTimeout=(fn,ms,...args)=>original(fn,ms===0?40:ms,...args);});
  }
  if(scenario==='error')await page.evaluate(()=>{HTMLAnchorElement.prototype.click=function(){throw Error('Synthetic denied download');};});
  if(['shared','cancelled'].includes(scenario))await page.evaluate(cancelled=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{if(cancelled)throw new DOMException('Cancelled','AbortError');}});},scenario==='cancelled');
  await page.getByRole('button',{name:'EXPORT',exact:true}).click();
  if(scenario==='large'){await page.getByRole('button',{name:'PREPARING…',exact:true}).waitFor();await shot(page,'320-loading-1200');}
  await page.getByRole('button',{name:'SHARE / DOWNLOAD'}).waitFor();
  if(['error','shared','cancelled'].includes(scenario)){await page.getByRole('button',{name:'SHARE / DOWNLOAD'}).click();await page.waitForTimeout(150);}
  if(['empty','large','offline'].includes(scenario)){const promise=page.waitForEvent('download');await page.getByRole('button',{name:'SHARE / DOWNLOAD'}).click();const d=await promise;const csv=await readFile(await d.path(),'utf8');assert.ok(csv.includes('workout_id'));assert.ok(!csv.includes('Synthetic QA private note'));}
  if(scenario==='error')assert.match(await page.locator('.history-export-status').innerText(),/Couldn’t/);
  await shot(page,`320-${scenario}`);await context.close();console.log(`${scenario}: passed`);
 }
}finally{await browser.close();}
