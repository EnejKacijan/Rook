import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {readHistoryCsv,historyDate} from '../src/historyImportTable.js';
import {openProfileArea} from './qa-current-navigation.mjs';
import {hevyCsv,hevyRow,strongCsv,genericCsv,genericRow,xlsxFixture} from './history-import-fixtures.mjs';
import {reviewedAutomaticMappings} from './historical-matching-reviewed-names.mjs';
const out='artifacts/LOW-FRICTION-HISTORY';await mkdir(`${out}/screenshots`,{recursive:true});
const path=process.argv[2];if(!path)throw new Error('Supply the original file path');
const original=await readFile(path),table=readHistoryCsv(original.toString('utf8'));
const promoted=[['Single Leg Standing Calf Raise','wg-single-leg-calf-raise'],['Standing Military Press (Barbell)','barbell-overhead-press'],['Seated Incline Curl (Dumbbell)','incline-dumbbell-curl'],['Seated Shoulder Press (Machine)','machine-shoulder-press']];
const source=table.rows.slice(1).map(row=>Object.fromEntries(table.rows[0].map((h,i)=>[h,row[i]])));
const sourceWorkouts=new Set(source.map(row=>JSON.stringify([row.title,row.start_time,row.end_time]))).size;
assert.equal(sourceWorkouts,95);assert.equal(source.length,1139);
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4177';
async function open(width=390,appearance='dark',style='standard'){
  const state=createReturningUserFixture(1);state.workouts=[];state.customExercises=[];state.exerciseAliases=[];state.ai.planUpgradeDismissed=true;
  Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',colorScheme:appearance});
  await context.addInitScript(state=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));},state);
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Unexpected external request');return route.continue();});
  await page.goto(base);return {context,page,errors,stored:()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')))};
}
const btn=(p,name)=>p.getByRole('button',{name,exact:true});
const factualHistory=workouts=>workouts.map(w=>({id:w.id,name:w.name,startedAt:w.startedAt,endedAt:w.endedAt,sessionNote:w.sessionNote,historicalImport:w.historicalImport,
  exercises:w.exercises.map(e=>({id:e.id,exerciseId:e.exerciseId,sourceName:e.sourceName,matchProvenance:e.matchProvenance,notes:e.notes,sourceSupersetId:e.sourceSupersetId,supersetId:e.supersetId,supersetOrder:e.supersetOrder,
    // Startup's existing optional-load migration makes absent weight provenance
    // explicit null. Compare its meaning, not missing-key versus null shape;
    // every actual value, raw source field and identity remains compared.
    repMin:e.repMin,repMax:e.repMax,targetRir:e.targetRir,restSeconds:e.restSeconds,sets:e.sets.map(s=>({...s,weightProvenance:s.weightProvenance??null}))}))}));
function changedPaths(before,after,path='history'){
  if(Object.is(before,after))return [];
  if(!before||!after||typeof before!=='object'||typeof after!=='object')return [path];
  return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>changedPaths(before[key],after[key],`${path}.${key}`));
}
async function enter(r,provider='Hevy'){await btn(r.page,'PROFILE').click();await openProfileArea(r.page,'data');await r.page.getByRole('button',{name:/Import workout history/}).click();await r.page.getByRole('button',{name:new RegExp('^'+provider)}).click();}
async function upload(r,real=true){await r.page.locator('input[type=file]').setInputFiles(real?path:{name:'qa-matching.csv',mimeType:'text/csv',buffer:Buffer.from(hevyCsv(['Lateral Raise (Machine)','Side Bend','Unknown QA movement'].map(exercise_title=>hevyRow({exercise_title,weight_kg:''}))))});await r.page.getByRole('heading',{name:'Review import',exact:true}).waitFor();}
const count=(p,label)=>p.locator('.history-import-summary-grid>div').filter({has:p.getByText(label,{exact:true})}).locator('dd');
async function expand(r,selector){const d=r.page.locator(selector);if(await d.getAttribute('open')===null)await d.locator('summary').click();}
async function clean(r){assert.deepEqual(r.errors,[]);assert.ok(await r.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');}
async function shot(r,name,locator){if(locator)await locator.scrollIntoViewIfNeeded();await r.page.screenshot({path:`${out}/screenshots/${name}.png`});}
async function editSessionNote(r,workout){
  const p=r.page;await btn(p,'TODAY').click();await p.getByRole('button',{name:/^Open calendar,/}).click();
  for(let n=0;await p.locator(`[data-date="${workout.canonicalPlanDate}"]`).count()===0;n++){
    assert.ok(n<24);const first=await p.locator('.month-calendar-grid [data-date]').first().getAttribute('data-date');
    await btn(p,first>workout.canonicalPlanDate?'Previous month':'Next month').click();
  }
  await p.locator(`[data-date="${workout.canonicalPlanDate}"]`).click();await p.locator('.month-calendar-screen').waitFor({state:'hidden'});
  const row=p.locator(`[data-workout-id="${workout.id}"]`);if(await row.count())await row.click();else await p.getByRole('button',{name:/VIEW HISTORY/}).click();
  await p.locator('.completed-workout-detail').waitFor();await btn(p,'Edit').click();await p.getByRole('textbox',{name:'Session note',exact:true}).fill('QA locally corrected note');
  await btn(p,'REVIEW CHANGES').click();await btn(p,'SAVE CHANGES').click();await p.locator('.completed-workout-detail').waitFor();
  assert.ok((await r.stored()).workouts.find(w=>w.id===workout.id).sessionNote==='QA locally corrected note','UI correction saved');
  await p.reload();assert.ok((await r.stored()).workouts.find(w=>w.id===workout.id).sessionNote==='QA locally corrected note','UI correction survives reload');
}
async function run(name,fn){console.log('RUN '+name);try{await fn();results.push({name,passed:true});console.log('PASS '+name);}catch(e){results.push({name,passed:false,error:e.message.split('\n')[0]});throw e;}finally{await writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2));}}
try{
 await run('original Hevy — real file input, worker review, Apply, reload, reimport, local edit protection',async()=>{
  const r=await open();try{
   await enter(r);await upload(r);assert.equal(await count(r.page,'Workouts').innerText(),'95');assert.equal(await count(r.page,'Sets').innerText(),'1,139');
   assert.equal(await count(r.page,'Matched').innerText(),'80');assert.equal(await count(r.page,'Original names').innerText(),'47');assert.equal(await r.page.locator('.history-import-suggestions').count(),0);
   assert.equal(await r.page.locator('.history-import-resolved').getAttribute('open'),null);
   await shot(r,'real-summary-390',r.page.locator('.history-import-summary-grid'));
   assert.equal((await r.stored()).workouts.length,0);
   assert.ok(await btn(r.page,'IMPORT 95 WORKOUTS').isEnabled());
   await btn(r.page,'IMPORT 95 WORKOUTS').click();await r.page.getByRole('heading',{name:'95 workouts imported',exact:true}).waitFor();
   const imported=await r.stored(),byRow=new Map();assert.equal(imported.workouts.length,95);
   for(const w of imported.workouts)for(const e of w.exercises)for(const s of e.sets){assert.ok(!byRow.has(s.rawImport.sourceIndex));byRow.set(s.rawImport.sourceIndex,{w,e,s});}
   assert.equal(byRow.size,1139);const number=v=>v===''||v==null?null:Number(v),approved=new Map([...reviewedAutomaticMappings,...promoted]);
   for(const [i,row]of source.entries()){
    const {w,e,s}=byRow.get(i);assert.equal(e.sourceName,row.exercise_title);assert.equal(w.name,row.title);assert.equal(w.startedAt,historyDate(row.start_time).value);assert.equal(w.endedAt,historyDate(row.end_time).value);
    for(const [field,column]of Object.entries({weight:'weight_kg',reps:'reps',durationSeconds:'duration_seconds',distance:'distance_km',rpe:'rpe'}))assert.equal(s[field],number(row[column]),'result/absence preserved');
    assert.equal(s.rir,null);assert.equal(s.rawImport.setOrder,Number(row.set_index));assert.equal(s.importSetType,row.set_type);assert.equal(e.sourceSupersetId,row.superset_id||null);
    if(s.weight!=null)assert.equal(s.rawImport.weightUnit,'kg');if(s.distance!=null)assert.equal(s.distanceUnit,'km');
    if(row.description)assert.ok(w.sessionNote.includes(row.description));if(row.exercise_notes)assert.ok(e.notes.includes(row.exercise_notes));
    if(approved.has(e.sourceName))assert.equal(e.exerciseId,approved.get(e.sourceName));else assert.ok(e.exerciseId.startsWith('custom-import-'));
   }
   const storedBefore=factualHistory(imported.workouts);await r.page.reload();await btn(r.page,'TODAY').waitFor();const differences=changedPaths(storedBefore,factualHistory((await r.stored()).workouts));assert.deepEqual(differences,[],'Reload preserves canonical identity, provenance and all source facts (changed paths only; no private values)');
   // Imported identities remain first-class factual history, including timed
   // results without fabricated catalog/logging metadata or illustrations.
   for(const name of ['Recumbent Bike','Ring Dips','Leg Extension (Machine)']){
    await btn(r.page,'PROGRESS').click();await r.page.getByRole('button',{name:/View all logged exercises/}).click();
    await r.page.getByRole('searchbox',{name:'Search logged exercises'}).fill(name==='Leg Extension (Machine)'?'Leg Extension':name);
    const row=r.page.locator('.logged-exercises-sheet .logged-exercise-row').filter({hasText:name==='Leg Extension (Machine)'?'Leg Extension':name}).first();await row.click();
    await r.page.locator('.exercise-performance-history .list-row').first().waitFor();
    assert.doesNotMatch(await r.page.locator('.detail-screen').last().innerText(),/NaN|Infinity|undefined|No history/);
    assert.equal(await r.page.locator('.exercise-detail-target').count(),0,'performed import never impersonates a planned target');
    if(name!=='Leg Extension (Machine)')assert.ok(await r.page.getByText('Original imported results. ROOK catalog guidance is unavailable until mapped.',{exact:true}).count());
    if(name==='Recumbent Bike')assert.match(await r.page.locator('.exercise-performance-history').innerText(),/sec|min/);
    await shot(r,'history-'+name.replace(/[^a-z0-9]/gi,'-').toLowerCase(),r.page.locator('.exercise-performance-history'));
    await r.page.reload();await btn(r.page,'TODAY').waitFor();
   }
   const edited=imported.workouts.at(-1);await editSessionNote(r,edited);
   await enter(r);await upload(r);assert.equal(await count(r.page,'Exact duplicates').innerText(),'95');assert.equal(await r.page.locator('.history-import-suggestions').count(),0);
   await btn(r.page,'IMPORT 0 WORKOUTS').click();await r.page.getByRole('heading',{name:'0 workouts imported',exact:true}).waitFor();
   const repeated=await r.stored();assert.equal(repeated.workouts.length,95);assert.equal(repeated.workouts.flatMap(w=>w.exercises.flatMap(e=>e.sets)).length,1139);assert.ok(repeated.workouts.find(w=>w.id===edited.id).sessionNote==='QA locally corrected note','Reimport preserves real UI correction');
   assert.equal(repeated.customExercises.length,47);await clean(r);await shot(r,'real-reimport-success-390');
   results.push({integrity:{workouts:95,sets:1139,droppedRows:0,inventedResults:0,unitErrors:0,dateErrors:0,duplicateWorkouts:0,duplicateSets:0,customMappings:47}});
  }finally{await r.context.close();}
 });

 for(const width of [320,390])for(const appearance of ['light','dark'])for(const style of ['standard','premium'])await run(`${width} ${style} ${appearance} — real file summary, optional review then leave, import`,async()=>{
  const r=await open(width,appearance,style);try{
   await enter(r);await upload(r);assert.equal(await count(r.page,'Matched').innerText(),'80');assert.equal(await count(r.page,'Original names').innerText(),'47');
   assert.ok(await btn(r.page,'IMPORT 95 WORKOUTS').isEnabled());
   await shot(r,`${width}-${style}-${appearance}-summary`,r.page.locator('.history-import-summary-grid'));
   await btn(r.page,'Review exercise matches · Optional').click();await r.page.locator('.history-import-mapping').waitFor();
   assert.equal(await btn(r.page,'KEEP ORIGINAL').count(),1);await shot(r,`${width}-${style}-${appearance}-decision`);
   await btn(r.page,'KEEP ORIGINAL').click();await r.page.waitForFunction(()=>!document.body.textContent.includes('Updating match…'));
   // Leave the remaining optional queue by the same visible semantic Back.
   await r.page.getByRole('button',{name:'Back',exact:true}).click();await r.page.getByRole('heading',{name:'Review import',exact:true}).waitFor();
   assert.equal(await count(r.page,'Matched').innerText(),'80');assert.equal(await count(r.page,'Original names').innerText(),'47');
   await expand(r,'.history-import-custom');await shot(r,`${width}-${style}-${appearance}-custom`,r.page.locator('.history-import-custom'));
   assert.equal((await r.stored()).workouts.length,0);
   await btn(r.page,'IMPORT 95 WORKOUTS').click();await r.page.getByRole('heading',{name:'95 workouts imported',exact:true}).waitFor();
   const saved=await r.stored();assert.equal(saved.workouts.length,95);assert.equal(saved.customExercises.length,47);
   assert.equal(saved.workouts.flatMap(w=>w.exercises.flatMap(e=>e.sets)).length,1139);await clean(r);
   await r.page.reload();await btn(r.page,'PROGRESS').click();await r.page.getByRole('button',{name:/View all logged exercises/}).waitFor();
   await shot(r,`${width}-${style}-${appearance}-progress`);await clean(r);
  }finally{await r.context.close();}
 });
 await run('optional individual match, change search, later reimport remap, explicit Keep original reuse',async()=>{
  const r=await open();try{
   await enter(r);await upload(r,false);await btn(r.page,'Review exercise matches · Optional').click();
   await btn(r.page,'CHOOSE ANOTHER').click();await r.page.getByRole('searchbox',{name:'Search exercises'}).fill('Dumbbell Side');
   assert.ok(await r.page.locator('.history-import-match-list').getByText('Dumbbell Side Bend',{exact:true}).count()>0);
   await r.page.getByRole('button',{name:'Back',exact:true}).click();
   await btn(r.page,'Review exercise matches · Optional').click();await btn(r.page,'USE MATCH').click();
   await r.page.getByRole('heading',{name:'Unknown QA movement',exact:true}).waitFor();await r.page.getByRole('button',{name:'Back',exact:true}).click();
   assert.equal(await count(r.page,'Matched').innerText(),'2');assert.equal(await count(r.page,'Original names').innerText(),'1');
   await btn(r.page,'IMPORT 1 WORKOUT').click();await r.page.getByRole('heading',{name:'1 workout imported',exact:true}).waitFor();
   const imported=await r.stored(),workout=imported.workouts[0];await r.page.reload();await enter(r);await upload(r,false);
   await expand(r,'.history-import-custom');await r.page.locator('.history-import-custom .history-import-mapping-row').filter({hasText:'Unknown QA movement'}).getByRole('button',{name:'CHANGE',exact:true}).click();
   await r.page.getByRole('searchbox',{name:'Search exercises'}).fill('Cable Curl');await r.page.locator('.history-import-match-list').getByRole('button',{name:'Cable Curl ›',exact:true}).click();
   await r.page.getByRole('heading',{name:'Review import',exact:true}).waitFor();await btn(r.page,'IMPORT 0 WORKOUTS').click();await r.page.getByRole('heading',{name:'0 workouts imported',exact:true}).waitFor();
   const repeated=await r.stored();assert.equal(repeated.workouts.length,1);const changed=repeated.workouts[0].exercises.find(e=>e.sourceName==='Unknown QA movement');
   assert.equal(changed.exerciseId,'cable-curl');assert.deepEqual(changed.sets,workout.exercises.find(e=>e.sourceName==='Unknown QA movement').sets);
   await r.page.reload();await enter(r);await upload(r,false);assert.equal(await count(r.page,'Matched').innerText(),'3');
   await expand(r,'.history-import-resolved');await r.page.locator('.history-import-resolved .history-import-mapping-row').filter({hasText:'Side Bend'}).getByRole('button',{name:'CHANGE',exact:true}).click();
   await btn(r.page,'KEEP ORIGINAL').click();await r.page.getByRole('heading',{name:'Review import',exact:true}).waitFor();await btn(r.page,'IMPORT 0 WORKOUTS').click();await r.page.getByRole('heading',{name:'0 workouts imported',exact:true}).waitFor();
   await r.page.reload();await enter(r);await upload(r,false);assert.equal(await count(r.page,'Original names').innerText(),'1');await clean(r);
  }finally{await r.context.close();}
 });
 for(const format of ['Strong','Generic CSV','Generic XLSX'])await run(`${format} unknown exercise: actual worker file/review/apply/reload`,async()=>{
  const r=await open(320);try{
   await enter(r,format==='Strong'?'Strong':'Generic CSV / XLSX');
   const generic=genericCsv([genericRow({exercise_name:'Unknown QA movement'})]);
   const file=format==='Strong'?{name:'strong.csv',buffer:Buffer.from(strongCsv().replaceAll('Bench Press','Unknown QA movement'))}:
    format==='Generic CSV'?{name:'generic.csv',buffer:Buffer.from(generic)}:{name:'generic.xlsx',buffer:Buffer.from(xlsxFixture([{name:'History',rows:readHistoryCsv(generic).rows}]))};
   await r.page.locator('input[type=file]').setInputFiles(file);await r.page.getByRole('heading',{name:'Check columns & units',exact:true}).waitFor();
   if(format==='Strong'){await r.page.getByLabel('Weight unit when absent from file').selectOption('kg');await r.page.getByLabel('Distance unit when absent from file').selectOption('km');}
   await btn(r.page,'REVIEW IMPORT').click();await r.page.getByRole('heading',{name:'Review import',exact:true}).waitFor();
   assert.equal(await count(r.page,'Original names').innerText(),'1');
   await r.page.locator('.sheet-action-footer button').filter({hasText:/IMPORT/}).click();await r.page.getByRole('heading',{name:/workouts? imported/}).waitFor();
   const before=(await r.stored()).workouts;await r.page.reload();await btn(r.page,'TODAY').waitFor();assert.equal((await r.stored()).workouts.length,before.length);await clean(r);
  }finally{await r.context.close();}
 });
}finally{assert.equal(Buffer.compare(original,await readFile(path)),0,'original unchanged');await browser.close();}
