// The owner's unmodified files are read locally; no raw rows/state are written
// into artifacts and every browser request is restricted to localhost.
import assert from 'node:assert/strict';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { readHistoryCsv,historyDate } from '../src/historyImportTable.js';
import { openProfileArea } from './qa-current-navigation.mjs';
import { buildBackupArchive,parseBackupArchive } from '../src/backup.js';
import { createWorkoutHistoryExport } from '../src/workoutHistoryExport.js';
import { HistoryImportBatch } from '../src/historyImportBatch.js';
import { importedSetComparable } from '../src/historicalSetSemantics.js';
import { hevyCsv,hevyRow,genericCsv,genericRow,largeCsv } from './history-import-fixtures.mjs';
import { blankState,serializeState,deserializeState } from '../src/domain.js';

const root='artifacts/ROOK-HISTORICAL-IMPORT-REAL-HEVY';await mkdir(root,{recursive:true});
const paths=['C:/Users/enejk/Downloads/workout_data.csv','C:/Users/enejk/Downloads/measurement_data.csv'];
const buffers=await Promise.all(paths.map(p=>readFile(p))),hash=b=>createHash('sha256').update(b).digest('hex');
const hashes=buffers.map(hash),tables=buffers.map(b=>readHistoryCsv(b.toString('utf8')));
const records=table=>table.rows.slice(1).map(r=>Object.fromEntries(table.rows[0].map((h,i)=>[h,r[i]])));
const source=records(tables[0]),measurements=records(tables[1]);
const results=[],timing={};let finalState;
const facts=workouts=>workouts.map(w=>({id:w.id,name:w.name,startedAt:w.startedAt,endedAt:w.endedAt,canonicalPlanDate:w.canonicalPlanDate,sessionNote:w.sessionNote,sourceDate:w.sourceDate,sourceEnd:w.sourceEnd,
  exercises:w.exercises.map(e=>({id:e.id,exerciseId:e.exerciseId,sourceName:e.sourceName,notes:e.notes,sourceSupersetId:e.sourceSupersetId,supersetId:e.supersetId,supersetOrder:e.supersetOrder,
    sets:e.sets.map(s=>Object.fromEntries(['id','weight','reps','durationSeconds','distance','distanceUnit','rpe','rir','rawImport','importSetType','completed'].map(k=>[k,s[k]])))}))}));
const sameFacts=(a,b,label)=>assert.ok(JSON.stringify(facts(a))===JSON.stringify(facts(b)),label);
const browser=await chromium.launch({channel:'chrome',headless:true});
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const count=(p,label)=>p.locator('.history-import-summary-grid>div').filter({has:p.getByText(label,{exact:true})}).locator('dd');
async function open(width=390,appearance='dark',style='standard') {
  const state=createReturningUserFixture(1);state.workouts=[];state.weightCheckins=[];state.customExercises=[];state.exerciseAliases=[];delete state.importedMeasurementSources;
  state.ai.planUpgradeDismissed=true;Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',isMobile:true,hasTouch:true,acceptDownloads:true,colorScheme:appearance});
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
  const page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)){external.push(u.origin);return route.abort();}return route.continue();});
  await page.goto('http://127.0.0.1:4173');page.setDefaultTimeout(15000);
  return {page,context,errors,external,stored:()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')))};
}
async function importer(r,source='Hevy') {
  await button(r.page,'PROFILE').click();await openProfileArea(r.page,'data');await r.page.getByRole('button',{name:/Import workout history/}).click();
  await r.page.getByRole('button',{name:new RegExp('^'+source)}).click();
}
async function upload(r,files) {
  if(files.some(f=>typeof f!=='string'))files=await Promise.all(files.map(async f=>typeof f==='string'?{name:f.split('/').at(-1),mimeType:'text/csv',buffer:await readFile(f)}:f));
  const t=performance.now();await r.page.locator('input[type=file]').setInputFiles(files);
  await r.page.waitForFunction(()=>document.querySelector('[role=alert]')||[...document.querySelectorAll('h1')].some(e=>['Check columns & units','Review import'].includes(e.textContent)));
  return performance.now()-t;
}
async function resolveConservatively(r) {
  const p=r.page;
  if(await button(p,'MATCH').count()) {
    await button(p,'MATCH').first().click();let n=0;
    while(await p.getByRole('heading',{name:'Review import',exact:true}).count()===0) {
      assert.ok(n++<150,'bounded custom exercise resolution');
      await p.getByRole('button',{name:/Create custom exercise/}).click();
      await p.waitForFunction(()=>!document.body.textContent.includes('Updating match…'));
    }
  }
  // Unknown source load is retained, never declared added/assisted/external by
  // the QA author. These result values are excluded from load/PR metrics.
  const selects=p.locator('.history-import-load-choice select');
  for(let i=0;i<await selects.count();i++) {
    if(!await selects.nth(i).inputValue()) {await selects.nth(i).selectOption('unknown');await p.waitForFunction(()=>![...document.querySelectorAll('.history-import-load-choice select')].some(s=>s.disabled));}
  }
}
async function apply(r,combined=true) {
  const t=performance.now();await button(r.page,combined?'IMPORT REVIEWED DATA':/IMPORT .* WORKOUT/).click();
  await r.page.getByRole('heading',{name:/(workouts?|measurement entr(?:y|ies)) imported/}).waitFor({timeout:30000});return performance.now()-t;
}
async function verifyClean(r) {assert.deepEqual(r.errors,[]);assert.deepEqual(r.external,[]);assert.ok(await r.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');}
async function inspectSession(r,workout) {
  const p=r.page,day=workout.canonicalPlanDate;
  await button(p,'TODAY').click();await p.getByRole('button',{name:/^Open calendar,/}).click();
  for(let n=0;await p.locator(`[data-date="${day}"]`).count()===0;n++) {
    assert.ok(n<24,'bounded calendar navigation');
    const first=await p.locator('.month-calendar-grid [data-date]').first().getAttribute('data-date');
    await button(p,first>day?'Previous month':'Next month').click();
  }
  await p.locator(`[data-date="${day}"]`).click();await p.locator('.month-calendar-screen').waitFor({state:'hidden'});
  // An imported session can be the date's main object or an additional row,
  // depending on the current program. Both are normal History entry points.
  await p.locator(`[data-workout-id="${workout.id}"]`).or(p.getByRole('button',{name:/VIEW HISTORY/})).first().click();
  const sheet=p.locator('.completed-workout-detail');await sheet.waitFor();
  assert.ok(await sheet.locator('h1').innerText()===workout.name,'selected historical session title');
  assert.equal(await sheet.locator('.session-log-item').count(),workout.exercises.length);
  await sheet.locator('.session-log-trigger').first().click();
  assert.equal(await sheet.locator('.session-log-item').first().locator('.session-log-set').count(),workout.exercises[0].sets.length);
  assert.doesNotMatch(await sheet.innerText(),/NaN|Infinity/);
  await button(p,'Close workout details').click();await sheet.waitFor({state:'hidden'});
}
async function run(name,fn){if(process.env.ROOK_REAL_CASE&&!name.includes(process.env.ROOK_REAL_CASE))return;console.log('RUN '+name);try{await fn();results.push({name,passed:true});console.log('PASS '+name);}catch(e){results.push({name,passed:false,error:e.message});throw e;}finally{await writeFile(root+`/browser-results${process.env.ROOK_REAL_CASE?'-'+process.env.ROOK_REAL_CASE:''}.json`,JSON.stringify(results,null,2));}}

try {
 await run('real original pair: UI review, all rows, atomic apply, reload, history, progress, export, backup, reimport',async()=>{
  const r=await open();try {
   await importer(r);timing.fileToReviewMs=await upload(r,paths);
   assert.equal(await count(r.page,'Workouts').innerText(),'95');assert.equal(await count(r.page,'Sets').innerText(),'1,139');assert.equal(await count(r.page,'Invalid rows').innerText(),'0');
   assert.equal((await r.stored()).workouts.length,0);
   await resolveConservatively(r);timing.applyMs=await apply(r);
   finalState=await r.stored();const w=finalState.workouts;
   assert.equal(w.length,95);assert.equal(finalState.importedMeasurementSources.length,5);assert.equal(finalState.weightCheckins.length,5);
   const sets=w.flatMap(w=>w.exercises.flatMap(e=>e.sets));assert.equal(sets.length,1139);
   const byRow=new Map();for(const workout of w)for(const ex of workout.exercises)for(const set of ex.sets){assert.ok(!byRow.has(set.rawImport.sourceIndex),'no duplicate source row');byRow.set(set.rawImport.sourceIndex,{workout,ex,set});}
   const nonempty=v=>v===''?null:Number(v);
   for(const [i,row] of source.entries()) {
    const entry=byRow.get(i);assert.ok(entry,'every source row exists');const {workout,ex,set}=entry;
    assert.ok(workout.name===row.title,'workout title fidelity');assert.ok(ex.sourceName===row.exercise_title,'exercise name fidelity');
    assert.equal(workout.startedAt,historyDate(row.start_time).value);assert.equal(workout.endedAt,historyDate(row.end_time).value);
    assert.equal(set.weight,nonempty(row.weight_kg));assert.equal(set.reps,nonempty(row.reps));assert.equal(set.durationSeconds,nonempty(row.duration_seconds));assert.equal(set.distance,nonempty(row.distance_km));assert.equal(set.rpe,nonempty(row.rpe));assert.equal(set.rir,null);
    assert.equal(set.rawImport.setOrder,Number(row.set_index));assert.equal(set.importSetType,row.set_type);assert.equal(ex.sourceSupersetId,row.superset_id||null);
    assert.ok(!row.description||workout.sessionNote?.includes(row.description),'workout notes preserved');assert.ok(!row.exercise_notes||ex.notes?.includes(row.exercise_notes),'exercise notes preserved');
    if(set.rawImport.loadKind==='unknown')assert.equal(importedSetComparable(set),false);
   }
   for(const workout of w){const starts=workout.exercises.map(e=>e.sets[0].rawImport.sourceIndex);assert.deepEqual(starts,[...starts].sort((a,b)=>a-b));}
   for(const row of measurements){const record=finalState.importedMeasurementSources.find(r=>r.localDate===historyDate(row.date).day);assert.ok(record);assert.equal(record.weightKg,Number(row.weight_kg));assert.equal(record.values.fat_percent.value,nonempty(row.fat_percent));for(const site of ['neck','shoulder','chest','left_bicep','right_bicep','left_forearm','right_forearm','abdomen','waist','hips','left_thigh','right_thigh','left_calf','right_calf'])assert.equal(record.values[site].value,nonempty(row[site+'_cm']));}
   timing.durableBytes=Buffer.byteLength(serializeState(finalState));
   const before=serializeState(finalState);let t=performance.now();await r.page.reload();await button(r.page,'PROGRESS').waitFor();timing.reloadMs=performance.now()-t;
   sameFacts((await r.stored()).workouts,finalState.workouts,'reload preserves every source result');
   for(const index of [0,Math.floor(w.length/2),w.length-1])await inspectSession(r,w[index]);
   for(let index=0;index<3;index++) {
    await r.page.reload();await button(r.page,'PROGRESS').click();await r.page.locator('.logged-exercises-preview button').nth(index).click();await r.page.locator('.detail-screen').last().waitFor();
    assert.doesNotMatch(await r.page.locator('.detail-screen').last().innerText(),/NaN|Infinity/);
   }
   await r.page.reload();await button(r.page,'PROFILE').click();await openProfileArea(r.page,'data');
   // Actual user-owned export flow; read download locally, not a parser-only test.
   await r.page.getByRole('button',{name:/Export workout history/}).click();
   await r.page.getByRole('radio',{name:'JSON',exact:true}).click();await button(r.page,'PREPARE EXPORT').click();
   await r.page.getByText('File ready',{exact:false}).waitFor();const downloading=r.page.waitForEvent('download');await button(r.page,'SHARE / DOWNLOAD').click();const download=await downloading;
   const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(exported.workouts.length,95);assert.equal(exported.imported_measurement_sources.length,5);
   const backup=await buildBackupArchive(finalState,[]);const restored=(await parseBackupArchive(backup.bytes)).state;
   sameFacts(restored.workouts,finalState.workouts,'backup preserves every source result');assert.ok(JSON.stringify(restored.importedMeasurementSources)===JSON.stringify(finalState.importedMeasurementSources),'backup measurement provenance');assert.ok(JSON.stringify(restored.weightCheckins)===JSON.stringify(finalState.weightCheckins),'backup body weights');
   await r.page.reload();await button(r.page,'PROFILE').click();await openProfileArea(r.page,'data');await r.page.getByRole('button',{name:/Back up ROOK/}).click();
   await button(r.page,'CREATE BACKUP').click();await button(r.page,'SAVE BACKUP').waitFor();
   const saving=r.page.waitForEvent('download');await button(r.page,'SAVE BACKUP').click();const savedBackup=await saving;
   const backupPath=await savedBackup.path();
   // Clear only this disposable test context; never touch the owner's browser.
   await r.page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));s.workouts=[];s.weightCheckins=[];delete s.importedMeasurementSources;localStorage.setItem('lift-v2-state',JSON.stringify(s));});
   await r.page.reload();assert.equal((await r.stored()).workouts.length,0);
   await button(r.page,'PROFILE').click();await openProfileArea(r.page,'data');await r.page.getByRole('button',{name:/Restore backup/}).click();
   await r.page.getByLabel('Choose ROOK backup file').setInputFiles(backupPath);await r.page.getByRole('heading',{name:'ROOK backup',exact:true}).waitFor();
   await button(r.page,'RESTORE & REPLACE').click();await r.page.getByRole('heading',{name:'ROOK has been restored.'}).waitFor();
   const uiRestored=await r.stored();sameFacts(uiRestored.workouts,finalState.workouts,'UI restore preserves all source results');assert.ok(JSON.stringify(uiRestored.importedMeasurementSources)===JSON.stringify(finalState.importedMeasurementSources),'UI restore preserves measurements');
   await r.page.reload();await importer(r);await upload(r,paths);await resolveConservatively(r);await apply(r);
   const repeated=await r.stored();assert.equal(repeated.workouts.length,95);assert.equal(repeated.workouts.flatMap(w=>w.exercises.flatMap(e=>e.sets)).length,1139);assert.equal(repeated.importedMeasurementSources.length,5);assert.equal(repeated.weightCheckins.length,5);
   await verifyClean(r);
   await writeFile(root+'/reconciliation.json',JSON.stringify({sourceHashes:hashes,sourceRows:source.length,acceptedRows:sets.length,rejectedRows:0,workouts:w.length,sets:sets.length,dateRange:[w[0].canonicalPlanDate,w.at(-1).canonicalPlanDate],matchedExercises:127-finalState.customExercises.length,customExercises:finalState.customExercises.length,measurementCount:5,mappedMeasurementValues:{weight:5},unsupportedPreservedFields:{fat_percent:2},nullCircumferenceCells:70,duplicateReimport:{workoutsAdded:0,setsAdded:0,measurementsAdded:0},droppedValidSourceResults:0,inventedResultValues:0,unitErrors:0,dateTimeErrors:0,allRowsCompared:true,backupRestore:true,jsonExport:true,unknownLoadSetsExcludedFromMetrics:sets.filter(s=>s.rawImport.loadKind==='unknown').length,timing,physicalIPhoneTested:false},null,2));
  }finally{await r.context.close();}
 });
 for(const [width,appearance,style] of [[320,'light','standard'],[320,'dark','standard'],[390,'light','premium'],[390,'dark','premium']])await run(`real measurements only ${width} ${style} ${appearance}`,async()=>{
  const r=await open(width,appearance,style);try{await importer(r);await upload(r,[paths[1]]);await apply(r);const s=await r.stored();assert.equal(s.workouts.length,0);assert.equal(s.importedMeasurementSources.length,5);await r.page.reload();assert.equal((await r.stored()).weightCheckins.length,5);await verifyClean(r);}finally{await r.context.close();}
 });
 await run('real workouts only without measurement side effects',async()=>{
  const r=await open();try{
   await importer(r);await upload(r,[paths[0]]);await resolveConservatively(r);await apply(r,false);
   const s=await r.stored();assert.equal(s.workouts.length,95);assert.equal(s.workouts.flatMap(w=>w.exercises.flatMap(e=>e.sets)).length,1139);assert.equal(s.weightCheckins.length,0);assert.equal(s.importedMeasurementSources,undefined);await verifyClean(r);
  }finally{await r.context.close();}
 });
 await run('real pair quota failure and retry preserves old state',async()=>{
  const r=await open(320);try{await importer(r);await upload(r,paths);await resolveConservatively(r);const before=serializeState(await r.stored());
   await r.page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')throw new DOMException('Quota','QuotaExceededError');return window.originalSetItem.call(this,k,v);};});
   await button(r.page,'IMPORT REVIEWED DATA').click();await r.page.getByRole('alert').waitFor();assert.match(await r.page.getByRole('alert').innerText(),/Existing history is unchanged/);assert.equal(serializeState(await r.stored()),before);
   await r.page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;});await apply(r);assert.equal((await r.stored()).workouts.length,95);await verifyClean(r);
  }finally{await r.context.close();}
 });
 await run('malformed second file and cancelled mapping leave storage unchanged',async()=>{
  const r=await open();try{await importer(r);const before=serializeState(await r.stored());await upload(r,[paths[0],{name:'broken.csv',mimeType:'text/csv',buffer:Buffer.from('a,b\n"unclosed')}]);assert.equal(serializeState(await r.stored()),before);assert.match(await r.page.getByRole('alert').innerText(),/unclosed/);await upload(r,paths);await button(r.page,'MATCH').first().click();await button(r.page,'Close Map exercise').click();await r.page.reload();assert.equal((await r.stored()).workouts.length,0);await verifyClean(r);}finally{await r.context.close();}
 });
 await run('generic measurement column/unit mapping',async()=>{
  const r=await open(320);try{await importer(r,'Generic CSV');await upload(r,[{name:'generic.csv',mimeType:'text/csv',buffer:Buffer.from('When,Scale,Left,Right\n2025-01-02,80,30,31')}]);
   await r.page.getByLabel('Data category').selectOption('measurements');await r.page.getByLabel('Column: Measurement date',{exact:true}).selectOption('0');await r.page.getByLabel('Column: Body weight',{exact:true}).selectOption('1');await r.page.getByLabel('Column: left bicep · source only',{exact:true}).selectOption('2');await r.page.getByLabel('Column: right bicep · source only',{exact:true}).selectOption('3');await r.page.getByLabel('Weight unit when absent from file').selectOption('kg');await r.page.getByLabel('Circumference unit when absent from file').selectOption('cm');await button(r.page,'REVIEW IMPORT').click();await r.page.getByRole('heading',{name:'Review import'}).waitFor();await apply(r);assert.equal((await r.stored()).weightCheckins[0].weightKg,80);await verifyClean(r);
  }finally{await r.context.close();}
 });
 await run('measurement local edit and updated source require explicit keep-existing review',async()=>{
  const r=await open(320);try{
   await importer(r);await upload(r,[paths[1]]);await apply(r);
   const old=await r.stored(),entry=old.weightCheckins[0],edited=entry.weightKg+0.5;
   await r.page.evaluate(({id,weight})=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));s.weightCheckins.find(x=>x.id===id).weightKg=weight;localStorage.setItem('lift-v2-state',JSON.stringify(s));},{id:entry.id,weight:edited});
   await r.page.reload();await importer(r);await upload(r,[paths[1]]);await apply(r);assert.equal((await r.stored()).weightCheckins.find(x=>x.id===entry.id).weightKg,edited);
   await r.page.reload();await importer(r,'Generic CSV');
   await upload(r,[{name:'synthetic-updated-measurement.csv',mimeType:'text/csv',buffer:Buffer.from(`date,weight_kg\n${entry.localDate},${edited+0.5}`)}]);
   await r.page.getByLabel('Data category').selectOption('measurements');await button(r.page,'REVIEW IMPORT').click();await r.page.getByRole('heading',{name:'Review import',exact:true}).waitFor();
   assert.equal(await button(r.page,'IMPORT REVIEWED DATA').isDisabled(),true);
   await r.page.getByRole('checkbox',{name:/Keep existing body-weight check-ins/}).check();await apply(r);
   const s=await r.stored();assert.equal(s.weightCheckins.find(x=>x.id===entry.id).weightKg,edited);assert.equal(s.importedMeasurementSources.length,6);assert.equal(s.importedMeasurementSources.at(-1).weightProjection,'kept-existing');await verifyClean(r);
  }finally{await r.context.close();}
 });
 assert.deepEqual(await Promise.all(paths.map(async path=>hash(await readFile(path)))),hashes,'Original CSV bytes unchanged');
} finally {await browser.close();}
