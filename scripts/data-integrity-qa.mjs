import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
import {dataReliabilityFixture} from '../src/dataReliability.fixture.js';
import {blankState,serializeState,hydrateStoredState,readStartupState} from '../src/domain.js';
import {saveWorkoutTemplate,templateDraft} from '../src/savedWorkouts.js';
import {createCustomExerciseRecord} from '../src/customExercises.js';
import {persistLocalState,readRecovery,PRIMARY_KEY as P,INSTALL_META_KEY as M,RECOVERY_KEY as R} from '../src/localStateStorage.js';

const out='artifacts/data-loss-incident',base=process.env.ROOK_QA_URL||'http://127.0.0.1:4175';await mkdir(out,{recursive:true});
let seed=dataReliabilityFixture();seed.profile.avoid='No jumping';seed.ai={available:false,provider:null,planUpgradeDismissed:true};
seed.gymProfiles=[{schemaVersion:1,id:'audit-gym',name:'Synthetic gym',equipment:['full gym'],createdAt:'2026-09-01T12:00:00Z',updatedAt:'2026-09-01T12:00:00Z'}];seed.defaultGymProfileId='audit-gym';
seed.customExercises=[createCustomExerciseRecord({name:'Synthetic custom press',equipment:['cables'],loggingType:'weight_reps'})];
seed=saveWorkoutTemplate(seed,{...templateDraft(seed.activeWorkout,seed),name:'Synthetic saved session'},{id:'audit-template'});
seed=hydrateStoredState(seed);const raw=serializeState(seed),results=[];
const canonical=state=>Object.fromEntries(Object.entries(JSON.parse(serializeState(state))).filter(([key])=>!['selectedDate','selectedDay','ai','activeCoachConversationId','coachConversationMeta','coachDraft'].includes(key)));
const read=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
const boot=async(page)=>{await page.getByRole('button',{name:'TODAY',exact:true}).waitFor();};
class MemoryStorage{values=new Map();getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}}
const recoveryStore=new MemoryStorage();recoveryStore.setItem(P,raw);readStartupState(recoveryStore);const newer=structuredClone(seed);newer.profile.name+=' newer';assert.equal(persistLocalState(serializeState(newer),{storage:recoveryStore,hydrate:hydrateStoredState}),true);

for(const [engine,type] of Object.entries({chromium,webkit}).filter(([name])=>!process.env.ROOK_QA_ENGINE||name===process.env.ROOK_QA_ENGINE)){
 const browser=await type.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  for(const mode of ['normal','delayed-hydration','read-error','optional-malformed','migration-error','default-primary']){
   console.log('START',engine,mode);
   const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,timezoneId:'Europe/Ljubljana',serviceWorkers:mode==='normal'?'allow':'block'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(12000);
   await context.route('**/api/**',route=>route.fulfill({json:{available:false,provider:null}}));
   await context.addInitScript(({raw,mode,backup,meta})=>{
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    if(!get.call(localStorage,'incident-isolated-seeded')){
     const state=JSON.parse(raw);if(mode==='optional-malformed')state.conversations=[null];if(mode==='migration-error')state.program.days=[];
     set.call(localStorage,'lift-v2-state',mode==='default-primary'?JSON.stringify({schemaVersion:3,profile:{id:'default',onboardingComplete:false},program:null,workouts:[]}):JSON.stringify(state));
     if(mode==='default-primary'){set.call(localStorage,'rook-recovery-v1',backup);set.call(localStorage,'rook-install-meta-v1',meta);}
     set.call(localStorage,'incident-isolated-seeded','yes');
    }
    window.incidentProbe={events:[],readFailure:mode==='read-error',raw:()=>get.call(localStorage,'lift-v2-state')};
    Storage.prototype.getItem=function(key){if(key==='lift-v2-state'&&incidentProbe.readFailure)throw new DOMException('Synthetic read failure','SecurityError');return get.call(this,key);};
    Storage.prototype.setItem=function(key,value){if(['lift-v2-state','rook-recovery-v1','rook-install-meta-v1'].includes(key))incidentProbe.events.push({key,initialized:key==='lift-v2-state'?JSON.parse(value).profile?.onboardingComplete:null});return set.call(this,key,value);};
    if(mode==='delayed-hydration'&&navigator.locks){const request=navigator.locks.request.bind(navigator.locks);let first=true;navigator.locks.request=(...args)=>{if(!first)return request(...args);first=false;return new Promise((resolve,reject)=>{incidentProbe.release=()=>request(...args).then(resolve,reject);});};}
   },{raw,mode,backup:recoveryStore.getItem(R),meta:recoveryStore.getItem(M)});
   await page.goto(base);let switches=0;
   if(mode==='normal'||mode==='delayed-hydration'){
    if(mode==='delayed-hydration'){
     await page.waitForFunction(()=>incidentProbe.release);assert.equal(await page.locator('.startup-recovery[aria-busy=true]').count(),1);assert.equal(await page.locator('.bottom-nav').count(),0);assert.deepEqual(await page.evaluate(()=>incidentProbe.events),[]);
     await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));incidentProbe.release();});
    }
    await boot(page);const expected=canonical(await read(page));assert.deepEqual(expected,canonical(seed));
    const check=async(label)=>{const value=await read(page);assert.deepEqual(canonical(value),expected,`${engine}/${mode}/${label}: complete durable domains`);assert.equal(await page.locator('.entry-screen').count(),0);assert.equal(await page.locator('.persistence-warning').count(),0);};
    const tabs=['COACH','PROGRESS','PROFILE','TODAY'];
    for(let i=0;i<(mode==='normal'?128:16);i++){await page.getByRole('button',{name:tabs[i%4],exact:true}).tap();switches++;await check(`tap-${i}`);if(i%32===31)console.log('taps',engine,switches);}
    if(mode==='normal'){
     // Rapid native pointer contacts, with no animation wait between requests.
     for(let i=0;i<128;i++){const box=await page.getByRole('button',{name:tabs[i%4],exact:true}).boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);switches++;await check(`rapid-${i}`);if(i%32===31)console.log('rapid',engine,switches);}
     for(const tab of tabs){await page.getByRole('button',{name:tab,exact:true}).tap();await page.reload();await boot(page);await check(`reload-${tab}`);}
     await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await check('pagehide-pageshow');
     if(engine==='chromium'){
      console.log('lifecycle',engine);
      console.log('service-worker',engine);await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration())?.active));console.log('service-worker active',engine);
      await Promise.race([page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();}),new Promise((_,reject)=>setTimeout(()=>reject(Error('service worker update exceeded 15s')),15000))]);console.log('service-worker updated',engine);await page.reload();await boot(page);assert.ok(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)));await check('sw-update-reload');
      await context.setOffline(true);await page.reload();await boot(page);await check('offline-pwa-reload');
      for(const tab of tabs){await page.getByRole('button',{name:tab,exact:true}).tap();await check(`offline-${tab}`);}await context.setOffline(false);
      const cdp=await context.newCDPSession(page);await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await cdp.send('Page.setWebLifecycleState',{state:'active'});await check('background-foreground');
     }else{await context.setOffline(true);for(const tab of tabs){await page.getByRole('button',{name:tab,exact:true}).tap();await check(`offline-${tab}`);}await context.setOffline(false);}
     const second=await context.newPage();await page.close();await second.goto(base);await boot(second);assert.deepEqual(canonical(await read(second)),expected);await second.close();
    }
   }else{
    await page.locator('.startup-recovery[role=alert]').waitFor();assert.equal(await page.locator('.entry-screen').count(),0);assert.deepEqual(await page.evaluate(()=>incidentProbe.events),[]);
    const source=await page.evaluate(()=>incidentProbe.raw());
    for(let i=0;i<3;i++){await page.getByRole('button',{name:'TRY AGAIN',exact:true}).click();await page.locator('.startup-recovery[role=alert]').waitFor();assert.equal(await page.evaluate(()=>incidentProbe.raw()),source);assert.deepEqual(await page.evaluate(()=>incidentProbe.events),[]);}
    if(mode==='read-error'){await page.evaluate(()=>incidentProbe.readFailure=false);await page.getByRole('button',{name:'TRY AGAIN',exact:true}).click();await boot(page);assert.deepEqual(canonical(await read(page)),canonical(seed));}
    if(mode==='default-primary'){
     const checkpoint=await page.evaluate(()=>localStorage.getItem('rook-recovery-v1'));await page.getByRole('button',{name:'RESTORE LOCAL BACKUP',exact:true}).click();await page.getByRole('button',{name:'RESTORE LOCAL BACKUP',exact:true}).click();await boot(page);
     assert.deepEqual(canonical(await read(page)),canonical(seed));
     // The explicit restore preserves the envelope (unit-tested). Subsequent
     // legitimate startup/Coach metadata saves may rotate it; every durable
     // training domain in the retained checkpoint must still be identical.
     const retained=new MemoryStorage();retained.setItem(R,await page.evaluate(()=>localStorage.getItem('rook-recovery-v1')));const original=new MemoryStorage();original.setItem(R,checkpoint);
     assert.deepEqual(canonical(readRecovery(retained,hydrateStoredState).state),canonical(readRecovery(original,hydrateStoredState).state));
    }
   }
   assert.deepEqual(errors,[]);results.push({engine,mode,switches,passed:true});await writeFile(`${out}/browser-results${process.env.ROOK_QA_ENGINE?`-${engine}`:''}.json`,JSON.stringify(results,null,2));console.log('PASS',engine,mode,switches);await context.close();
  }
 }finally{await browser.close();}
}
console.log(`PASS ${results.length} scenarios; ${results.reduce((n,r)=>n+r.switches,0)} tab switches; physical iPhone not tested.`);
