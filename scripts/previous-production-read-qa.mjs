// Isolated browser contexts only. Never attach to an owner's browser storage.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
import {readRecovery} from '../src/localStateStorage.js';
import {hydrateStoredState} from '../src/domain.js';
const latest=JSON.parse(await readFile('src/fixtures/previousProductionState.json','utf8'));
const older=JSON.parse(await readFile('src/fixtures/previousProductionState-80765c6.json','utf8'));
const commit=[latest.commit,older.commit];
const fixtures=[...latest.fixtures,...older.fixtures.map(f=>({...f,name:`80765c6-${f.name}`}))];
const origin=process.env.ROOK_QA_URL||'http://127.0.0.1:4273';
const engine=process.env.ROOK_QA_BROWSER||'chrome';
const out='artifacts/final-nonmon-release-2026-09-29';
await mkdir(out,{recursive:true});
const results=[];
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
const P='lift-v2-state',M='rook-install-meta-v1',B='rook-recovery-v1';
async function open(fixture,{raw=fixture.raw,width=390,transient=false}={}){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await context.addInitScript(({raw,metadata,backup,transient})=>{
    if(!sessionStorage.getItem('compat-seeded')){
      localStorage.setItem('lift-v2-state',raw);localStorage.setItem('rook-install-meta-v1',metadata);
      localStorage.setItem('rook-recovery-v1',backup);sessionStorage.setItem('compat-seeded','yes');
      // index.html first reads only theme hints; inject at the following real
      // startup read, not the deliberately optional theme bootstrap read.
      if(transient){const get=Storage.prototype.getItem;let reads=0;Storage.prototype.getItem=function(key){if(this===localStorage&&key==='lift-v2-state'&&++reads===2)throw new DOMException('Synthetic transient read','SecurityError');return get.call(this,key);};}
    }
  },{raw,metadata:fixture.metadata,backup:fixture.backup,transient});
  const page=await context.newPage();page.setDefaultTimeout(12000);
  await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto(origin);return {context,page};
}
const persisted=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
function identities(s){return {
  profile:s.profile.id,program:s.program,versions:s.planVersions,history:s.workouts,
  active:s.activeWorkout,saved:s.savedWorkoutTemplates,schedule:s.flexibleWeek,
  overrides:s.weekScheduleOverrides,occurrences:s.workoutOccurrenceOverrides,
};}
try{
  for(const [index,fixture] of fixtures.entries()){
    const width=[320,390,430][index%3],{context,page}=await open(fixture,{width});
    try{
      await page.locator('.bottom-nav').waitFor();
      assert.equal(await page.locator('.startup-recovery').count(),0);
      assert.deepEqual(identities(await persisted(page)),identities(fixture.expected));
      await page.reload();await page.locator('.bottom-nav').waitFor();
      assert.deepEqual(identities(await persisted(page)),identities(fixture.expected));
      await page.screenshot({path:`${out}/compat-${engine}-${fixture.name}-${width}.png`});
      results.push({case:fixture.name,width,result:'pass'});console.log('PASS',engine,fixture.name,width);
    }finally{await context.close();}
  }
  const fixture=fixtures.find(f=>f.name==='active-and-history');
  for(const [name,raw] of [['malformed','{bad'],['future',JSON.stringify({...fixture.expected,schemaVersion:999})],['invalid-plan',JSON.stringify({...fixture.expected,program:{...fixture.expected.program,days:[]}})]]){
    const {context,page}=await open(fixture,{raw});
    try{
      await page.locator('.startup-recovery[aria-busy="false"]').waitFor();
      assert.equal(await page.locator('.entry-v2,.bottom-nav').count(),0);
      const bytes=()=>page.evaluate(keys=>keys.map(key=>localStorage.getItem(key)),[P,M,B]);
      const before=await bytes();assert.deepEqual(before,[raw,fixture.metadata,fixture.backup]);
      await page.getByRole('button',{name:'TRY AGAIN',exact:true}).click();await page.locator('.startup-recovery[aria-busy="false"]').waitFor();assert.deepEqual(await bytes(),before);
      await page.getByRole('button',{name:'START OVER',exact:true}).click();
      await page.getByRole('button',{name:'DELETE DATA & START OVER',exact:true}).waitFor();
      assert.deepEqual(await bytes(),before);await page.getByRole('button',{name:'CANCEL',exact:true}).click();
      await page.getByRole('button',{name:'RESTORE LOCAL BACKUP',exact:true}).click();
      await page.getByRole('heading',{name:'Restore this local backup?'}).waitFor();assert.deepEqual(await bytes(),before);
      await page.getByRole('button',{name:'RESTORE LOCAL BACKUP',exact:true}).click();
      await page.locator('.bottom-nav').waitFor();const after=await persisted(page);
      assert.equal(after.profile.id,fixture.expected.profile.id);
      assert.deepEqual(after.workouts,fixture.expected.workouts);assert.equal(after.activeWorkout.id,fixture.expected.activeWorkout.id);
      // The explicit restore keeps the checkpoint byte-for-byte (unit covered).
      // Once a verified UI state is read, normal autosave may checkpoint that
      // restored state again; compare factual contents, not envelope timestamp.
      const checkpoint=await page.evaluate(key=>localStorage.getItem(key),B);
      const recovered=readRecovery({getItem:key=>key===B?checkpoint:null},hydrateStoredState).state;
      assert.equal(recovered.profile.id,fixture.expected.profile.id);
      assert.deepEqual(recovered.workouts,fixture.expected.workouts);
      assert.equal(recovered.activeWorkout.id,fixture.expected.activeWorkout.id);
      await page.reload();await page.locator('.bottom-nav').waitFor();
      results.push({case:name+' / retry / confirmed restore / reload',result:'pass'});console.log('PASS',engine,name);
    }finally{await context.close();}
  }
  const {context,page}=await open(fixture,{transient:true});
  try{
    await page.locator('.startup-recovery[aria-busy="false"]').waitFor();
    const beforeRetry=await page.evaluate(key=>localStorage.getItem(key),P);
    assert.ok(beforeRetry===fixture.raw,`Transient failure must preserve raw state; changed fields: ${Object.keys(JSON.parse(beforeRetry)).filter(key=>JSON.stringify(JSON.parse(beforeRetry)[key])!==JSON.stringify(JSON.parse(fixture.raw)[key])).join(', ')}`);
    await page.getByRole('button',{name:'TRY AGAIN',exact:true}).click();await page.locator('.bottom-nav').waitFor();
    assert.deepEqual(identities(await persisted(page)),identities(fixture.expected));
    results.push({case:'transient error / retry',result:'pass'});console.log('PASS',engine,'transient retry');
  }finally{await context.close();}
}catch(error){results.push({result:'failed',message:error.message});throw error;}
finally{await writeFile(`${out}/compat-${engine}.json`,JSON.stringify({commit,engine,results},null,2));await browser.close();}
