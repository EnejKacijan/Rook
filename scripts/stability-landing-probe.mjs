// Diagnostic only. All data is synthetic in fresh browser contexts.
// A nonzero exit reports the production safety invariant failure, not test success.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {serializeState,STORAGE_KEY} from '../src/domain.js';

const root='artifacts/ROOK-STABILITY-PASS';
await mkdir(`${root}/screenshots`,{recursive:true});
const source=createReturningUserFixture(2),raw=serializeState(source);
assert.ok(source.profile.onboardingComplete&&source.program&&source.workouts.length);
const results={syntheticOnly:true,physicalDevice:false,source:{bytes:Buffer.byteLength(raw),sha256:createHash('sha256').update(raw).digest('hex'),workouts:source.workouts.length,planDays:source.program.days.length},cases:[]};
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
try {
 for(const fault of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(({raw,key,fault})=>{
   const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
   const seeded=get.call(localStorage,'rook-stability-probe-seeded')==='yes';
   if(!seeded){set.call(localStorage,key,raw);set.call(localStorage,'rook-stability-probe-seeded','yes');}
   window.__stability={events:[],snapshot:()=>get.call(localStorage,key)};
   let injected=false,stateReads=0;
   Storage.prototype.getItem=function(k){
    if(k===key){
     stateReads++;
     // First read is index.html's noncritical appearance bootstrap. The second
     // is loadState(), which hydrates the actual app state in this production build.
     if(fault&&!seeded&&!injected&&stateReads===2){injected=true;window.__stability.events.push({event:'read-threw',readNumber:stateReads,storedBytes:get.call(this,k)?.length,stack:new Error().stack});throw new DOMException('Synthetic transient read failure','SecurityError');}
     window.__stability.events.push({event:'read-returned',present:get.call(this,k)!==null});
    }
    return get.call(this,k);
   };
   Storage.prototype.removeItem=function(k){if(k===key)window.__stability.events.push({event:'removeItem',storedBytes:get.call(this,k)?.length,stack:new Error().stack});return remove.call(this,k);};
   Storage.prototype.setItem=function(k,v){if(k===key)window.__stability.events.push({event:'setItem',bytes:String(v).length});return set.call(this,k,v);};
  },{raw,key:STORAGE_KEY,fault});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({available:false})}));
  await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173',{waitUntil:'networkidle'});
  const inspect=()=>page.evaluate(()=>({stored:window.__stability.snapshot(),events:window.__stability.events,landing:!!document.querySelector('.entry-screen'),headings:[...document.querySelectorAll('h1')].map(e=>e.textContent)}));
  const snapshot=await inspect(),stored=snapshot.stored?JSON.parse(snapshot.stored):null;
  const record={faultInjected:fault,landing:snapshot.landing,storedPresent:!!stored,remainingWorkouts:stored?.workouts?.length??0,planPresent:!!stored?.program,events:snapshot.events,errors};
  await page.screenshot({path:`${root}/screenshots/${fault?'p1-after-transient-read':'p1-normal-reopen'}.png`});
  if(!fault){assert.equal(record.landing,false);assert.equal(record.remainingWorkouts,source.workouts.length);assert.equal(record.planPresent,true);}
  else {
   assert.ok(snapshot.events.some(e=>e.event==='read-threw'),'fault must reach state read');
   await page.reload({waitUntil:'networkidle'});const after=await inspect();
   record.afterHealthyReload={storedPresent:after.stored!==null,landing:after.landing,events:after.events};
   await page.screenshot({path:`${root}/screenshots/p1-after-healthy-reload.png`});
  }
  results.cases.push(record);await context.close();
  if(fault&&(!record.storedPresent||record.landing)){results.stopCondition='P1: startup read error becomes empty state and deletes the persisted state key';process.exitCode=1;break;}
 }
}finally{await browser.close();await writeFile(`${root}/landing-diagnostic.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));
