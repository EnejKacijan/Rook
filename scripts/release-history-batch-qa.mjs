// Real external files remain unmodified and never enter AI/network requests.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {readHistoryCsv} from '../src/historyImportTable.js';
import {openProfileArea} from './qa-current-navigation.mjs';
const paths=process.argv.slice(2);assert.equal(paths.length,2,'Supply original workout and measurement CSV paths');
const original=await Promise.all(paths.map(p=>readFile(p))),counts=original.map(b=>readHistoryCsv(b.toString('utf8')).rows.length-1);
assert.deepEqual(counts,[1139,5]);
const out='artifacts/release-2026-09-13',results=[];await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),base=process.env.ROOK_QA_URL||'http://127.0.0.1:4177';
const btn=(p,name)=>p.getByRole('button',{name,exact:true});
const stored=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
async function enter(p){await btn(p,'PROFILE').click();await openProfileArea(p,'data');await p.getByRole('button',{name:/Import workout history/}).click();await p.getByRole('button',{name:/^Hevy/}).click();}
async function open({fallback=false,hold=false}={}){
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'}),state=createReturningUserFixture(1);
 state.workouts=[];state.weightCheckins=[];state.customExercises=[];state.exerciseAliases=[];state.ai.planUpgradeDismissed=true;
 await context.addInitScript(({state,hold})=>{
  if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));
  const WorkerBase=Worker;window.__importWorkers=[];window.__holdImport=hold;
  window.Worker=class extends WorkerBase{
   constructor(...args){super(...args);this.qa={calls:[],terminated:false};window.__importWorkers.push(this.qa);this.addEventListener('message',e=>{if(e.data.result?.timing)this.qa.timing=e.data.result.timing;});}
   postMessage(data,...rest){this.qa.calls.push(data.type);if(data.type==='parse'&&window.__holdImport)return;return super.postMessage(data,...rest);}
   terminate(){this.qa.terminated=true;return super.terminate();}
  };
 },{state,hold});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 if(fallback)await page.route('**/assets/historyImport.worker-*.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:"Object.defineProperty(globalThis,'crypto',{value:{},configurable:true});\n"+await response.text()});});
 await page.goto(base);await enter(page);return {context,page,errors};
}
try{
 for(const mode of ['measurements','both-native','both-no-subtle','failed-write']){
  const r=await open({fallback:mode==='both-no-subtle'}),p=r.page;
  try{
   const start=performance.now();await p.locator('input[type=file]').setInputFiles(mode==='measurements'?[paths[1]]:paths);
   await p.getByRole('heading',{name:'Review import',exact:true}).waitFor();const visiblePreviewMs=performance.now()-start;
   const diagnostics=await p.evaluate(()=>__importWorkers.at(-1));
   assert.equal(diagnostics.timing.stages.matching?.calls||0,mode==='measurements'?0:127);
   assert.equal(diagnostics.timing.stages['optional advanced matching'],undefined);assert.ok(!diagnostics.calls.includes('matches'));
   if(mode==='failed-write'){
    const before=await p.evaluate(()=>localStorage.getItem('lift-v2-state'));
    await p.evaluate(()=>{const set=Storage.prototype.setItem;window.__restoreStorage=()=>Storage.prototype.setItem=set;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')throw new DOMException('Synthetic quota','QuotaExceededError');return set.call(this,k,v);};});
    await btn(p,'IMPORT DATA').click();await p.getByRole('alert').filter({hasText:/couldn’t save/}).waitFor();
    assert.equal(await p.evaluate(()=>localStorage.getItem('lift-v2-state')),before);await p.evaluate(()=>__restoreStorage());
   }
   await btn(p,'IMPORT DATA').click();await p.getByRole('heading',{name:/imported/}).waitFor();
   const accepted=await stored(p);assert.equal(accepted.importedMeasurementSources.length,counts[1]);
   assert.equal(accepted.workouts.flatMap(w=>w.exercises.flatMap(e=>e.sets)).length,mode==='measurements'?0:counts[0]);
   await p.reload();await btn(p,'TODAY').waitFor();assert.deepEqual((await stored(p)).importedMeasurementSources,accepted.importedMeasurementSources);
   await enter(p);await p.locator('input[type=file]').setInputFiles(mode==='measurements'?[paths[1]]:paths);await p.getByRole('heading',{name:'Review import',exact:true}).waitFor();
   await btn(p,'IMPORT DATA').click();await p.getByRole('heading',{name:/imported/}).waitFor();
   const repeated=await stored(p);assert.equal(repeated.workouts.length,accepted.workouts.length);assert.deepEqual(repeated.importedMeasurementSources,accepted.importedMeasurementSources);assert.deepEqual(r.errors,[]);
   results.push({mode,passed:true,visiblePreviewMs,timing:diagnostics.timing,workouts:accepted.workouts.length,sets:mode==='measurements'?0:counts[0],measurements:counts[1],reload:true,reimport:true});
  }finally{await r.context.close();}
 }
 const r=await open({hold:true}),p=r.page;
 try{
  await p.locator('input[type=file]').setInputFiles(paths[0]);await p.waitForFunction(()=>__importWorkers.at(-1).calls.includes('parse'));
  await btn(p,'CANCEL').click();assert.equal(await p.evaluate(()=>__importWorkers.at(-1).terminated),true);
  await p.evaluate(()=>__holdImport=false);await p.locator('input[type=file]').setInputFiles(paths[1]);await p.getByRole('heading',{name:'Review import',exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>__importWorkers.length),2);assert.equal((await stored(p)).workouts.length,0);
  await btn(p,'IMPORT DATA').click();await p.getByRole('heading',{name:/imported/}).waitFor();assert.equal((await stored(p)).importedMeasurementSources.length,5);assert.equal((await stored(p)).workouts.length,0);
  assert.deepEqual(r.errors,[]);results.push({mode:'cancel held parse → new measurement job',passed:true});
 }finally{await r.context.close();}
}catch(error){results.push({passed:false,error:error.message});process.exitCode=1;}
finally{await browser.close();for(let i=0;i<paths.length;i++)assert.ok(original[i].equals(await readFile(paths[i])));await writeFile(`${out}/history-batch-browser.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));}
