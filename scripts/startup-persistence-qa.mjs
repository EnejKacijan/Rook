import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {deserializeState,serializeState} from '../src/domain.js';
const dir='artifacts/ROOK-STABILITY-PASS',base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173',results=[];
await mkdir(`${dir}/screenshots`,{recursive:true});
const fixture=createReturningUserFixture(2);fixture.profile.name='Startup safety';fixture.profile.units='lb';fixture.profile.avoid='No jumping';fixture.workouts[0].sessionNote='Preserve this history';fixture.ai.planUpgradeDismissed=true;
fixture.customExercises=[{id:'custom-startup',name:'Recovery exercise',equipment:['other'],primaryMuscle:'Full body',loggingType:'weight_reps',createdAt:'2026-09-01T12:00:00Z'}];
const raw=serializeState(deserializeState(fixture));
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
let control;
const noMutations=p=>p.evaluate(()=>window.__startup.events.filter(e=>['write','remove'].includes(e.kind)));
try{
 for(const [mode,width]of [['normal',390],['empty',320],['once',390],['repeat',320],['malformed',390],['schema',320],['structure',390],['secondary',320],['journal',390]]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage();
  await context.addInitScript(({raw,mode})=>{
   const key='lift-v2-state',get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
   if(!get.call(localStorage,'rook-startup-qa-seeded')){
    if(mode!=='empty')set.call(localStorage,key,mode==='malformed'?'{not json':mode==='schema'?'{"schemaVersion":99}':mode==='structure'?JSON.stringify({...JSON.parse(raw),workouts:'broken'}):raw);
    if(mode==='secondary')set.call(localStorage,'lift-funnel-events-v1','{broken analytics');
    if(mode==='journal')set.call(localStorage,'rook-restore-journal-v1','{broken journal');
    set.call(localStorage,'rook-startup-qa-seeded','yes');
   }
   let reads=0;
   window.__startup={events:[],fail:mode==='once'||mode==='repeat',snapshot:()=>get.call(localStorage,key),repair:()=>{set.call(localStorage,key,raw);remove.call(localStorage,'rook-restore-journal-v1');window.__startup.fail=false;}};
   Storage.prototype.getItem=function(k){
    if(k===key){reads++;if(reads>=2&&window.__startup.fail){if(mode==='once')window.__startup.fail=false;window.__startup.events.push({kind:'read-error'});throw new DOMException('Synthetic transient storage error','SecurityError');}window.__startup.events.push({kind:'read-ok',present:get.call(this,k)!==null});}
    return get.call(this,k);
   };
   Storage.prototype.setItem=function(k,v){if(k===key)window.__startup.events.push({kind:'write',landing:!!document.querySelector('.entry-screen')});return set.call(this,k,v);};
   Storage.prototype.removeItem=function(k){if(k===key)window.__startup.events.push({kind:'remove'});return remove.call(this,k);};
  },{raw,mode});
  await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({available:false})}));
  await page.goto(base,{waitUntil:'networkidle'});
  const initialRaw=await page.evaluate(()=>window.__startup.snapshot());
  if(mode==='empty'){
   await page.locator('.entry-screen').waitFor();assert.equal(initialRaw,null);assert.deepEqual(await noMutations(page),[]);
  }else if(['normal','secondary'].includes(mode)){
   await page.getByRole('button',{name:'TODAY',exact:true}).waitFor();assert.equal(await page.locator('.entry-screen').count(),0);
   await page.waitForFunction(()=>JSON.parse(window.__startup.snapshot()).ai.available===false);
   const state=await page.evaluate(()=>JSON.parse(window.__startup.snapshot()));assert.equal(state.workouts.length,8);assert.equal(state.program.days.length,4);assert.equal(state.customExercises[0].id,'custom-startup');
   if(mode==='normal')control=state;
   const events=await page.evaluate(()=>window.__startup.events);assert.ok(events.findIndex(e=>e.kind==='write')>events.map(e=>e.kind).lastIndexOf('read-ok'));
  }else{
   await page.locator('.startup-recovery[role=alert]').waitFor();assert.equal(await page.locator('.entry-screen').count(),0);assert.deepEqual(await noMutations(page),[]);
   await page.screenshot({path:`${dir}/screenshots/startup-${mode}-${width}.png`});
   if(mode==='repeat'){
    for(let i=0;i<2;i++){await page.getByRole('button',{name:'RETRY',exact:true}).click();await page.locator('.startup-recovery[role=alert]').waitFor();assert.deepEqual(await noMutations(page),[]);assert.equal(await page.evaluate(()=>window.__startup.snapshot()),initialRaw);}
   }
   if(mode!=='once')await page.evaluate(()=>window.__startup.repair()); // Only QA repairs synthetic corruption, never the app.
   await page.getByRole('button',{name:'RETRY',exact:true}).click();await page.getByRole('button',{name:'TODAY',exact:true}).waitFor();await page.waitForLoadState('networkidle');
   await page.waitForFunction(()=>JSON.parse(window.__startup.snapshot()).ai.available===false);
   const recovered=await page.evaluate(()=>JSON.parse(window.__startup.snapshot()));assert.deepEqual(recovered,control,'all restored fields match healthy startup, not just UI');
   await page.evaluate(()=>{window.__startup.fail=false;});
   if(mode==='once'){
    // Init injection is intentionally disabled for the next healthy reopen.
    await context.addInitScript(()=>{if(window.__startup)window.__startup.fail=false;});
    await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'TODAY',exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>JSON.parse(window.__startup.snapshot())),control);
    await page.screenshot({path:`${dir}/screenshots/startup-recovered-390.png`});
   }
  }
  results.push({mode,width,passed:true});await context.close();console.log(`PASS startup ${mode} ${width}`);
 }
}finally{await browser.close();await writeFile(`${dir}/startup-browser-results${base.includes(':5173')?'-dev':''}.json`,JSON.stringify(results,null,2));}
