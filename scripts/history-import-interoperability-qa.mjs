import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {openProfileArea} from './qa-current-navigation.mjs';
import {hevyRow,hevyCsv,strongCsv,genericRow,genericHeaders,genericCsv,largeCsv,xlsxFixture} from './history-import-fixtures.mjs';
const root='artifacts/ROOK-HISTORY-IMPORT-AUDIT',results=[];
await mkdir(`${root}/screenshots`,{recursive:true});await mkdir(`${root}/fixtures`,{recursive:true});
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const selected=process.env.ROOK_HISTORY_CASE;
const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173';
const payload=(name,data)=>({name,mimeType:name.endsWith('.xlsx')?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv',buffer:Buffer.from(data)});
async function run(name,fn) {if(selected&&!name.includes(selected))return;let ctx;try{ctx=await fn();results.push({name,passed:true});console.log(`PASS ${name}`);}catch(error){results.push({name,passed:false,error:error.message});throw error;}finally{await ctx?.close();await writeFile(`${root}/browser-results${selected?'-'+selected:''}.json`,JSON.stringify(results,null,2));}}
async function open(width=390,appearance='light',style='standard') {
 const s=createReturningUserFixture(1);s.workouts=[];s.profile.appearancePreference=appearance;s.profile.stylePreference=style;s.profile.themePreference=style==='premium'?'premium':appearance;s.ai.planUpgradeDismissed=true;
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',colorScheme:appearance});
 await context.addInitScript(state=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));},s);
 const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],uploads=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>{if(r.method()!=='GET'&&r.method()!=='HEAD')uploads.push({url:r.url(),method:r.method()});});
 await page.route('**/api/**',r=>r.abort('internetdisconnected'));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 return {context,page,errors,uploads,stored:()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')))};
}
async function importer(r,source='Hevy'){
 await r.page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(r.page,'data');await r.page.getByRole('button',{name:/Import workout history/}).click();
 await r.page.getByRole('button',{name:new RegExp('^'+source)}).click();
}
async function upload(r,name,data){await writeFile(`${root}/fixtures/${name}`,data);await r.page.locator('input[type=file]').setInputFiles(payload(name,data));
 await r.page.getByRole('heading',{name:/^(Check columns & units|Review import|Choose history file)$/}).or(r.page.getByRole('alert')).waitFor();
 // Selecting a file is asynchronous; wait for setup/review or a specific error.
 await r.page.waitForFunction(()=>!!document.querySelector('[role=alert]')||[...document.querySelectorAll('h1')].some(e=>['Check columns & units','Review import'].includes(e.textContent)));
}
async function review(r){await r.page.getByRole('button',{name:'REVIEW IMPORT',exact:true}).click();await r.page.getByRole('heading',{name:'Review import',exact:true}).waitFor();}
async function save(r,count){await r.page.getByRole('button',{name:`IMPORT ${count.toLocaleString('en')} ${count===1?'WORKOUT':'WORKOUTS'}`,exact:true}).click();await r.page.getByRole('heading',{name:`${count.toLocaleString('en')} ${count===1?'workout':'workouts'} imported`,exact:true}).waitFor({timeout:30000});}
async function shot(r,name){assert.equal(await r.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page overflow');await r.page.screenshot({path:`${root}/screenshots/${name}.png`});}
async function clean(r){assert.deepEqual(r.errors,[]);assert.deepEqual(r.uploads,[],'no history file sent anywhere');}

try {
 for(const [width,appearance,style,unit] of [[320,'dark','standard','lb'],[390,'light','standard','kg'],[390,'light','premium','kg'],[390,'dark','premium','lb']])await run(`hevy-${width}-${style}-${appearance}`,async()=>{
  const r=await open(width,appearance,style),name=`hevy-${width}-${style}-${appearance}`;
  const rows=['normal','warmup','failure','dropset'].map((set_type,set_index)=>hevyRow({set_type,set_index,superset_id:'A'}));
  rows.push(hevyRow({exercise_title:'Cable Row',superset_id:'A'}),hevyRow({exercise_title:'Walking',reps:'',weight_kg:'',weight_lbs:'',distance_km:2,distance_miles:1.25,duration_seconds:900,rpe:''}),hevyRow({exercise_title:'Plank',reps:'',weight_kg:'',weight_lbs:'',duration_seconds:30,rpe:''}));
  const data=hevyCsv(rows,unit);await importer(r);await upload(r,`SYNTHETIC-${name}.csv`,data);
  await r.page.getByRole('heading',{name:'Review import',exact:true}).waitFor();assert.equal((await r.stored()).workouts.length,0);
  await shot(r,`${name}-review`);await r.page.getByText('Preview factual history (first 3 workouts)',{exact:true}).click();
  const factHeading=r.page.locator('.history-import-format h3').first();await factHeading.waitFor({state:'visible'});await factHeading.scrollIntoViewIfNeeded();
  await r.page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.target?.closest?.('.history-import-screen')).map(a=>a.finished.catch(()=>{})));});
  await shot(r,`${name}-facts`);
  await save(r,1);await shot(r,`${name}-success`);const imported=(await r.stored()).workouts[0];
  assert.equal(imported.exercises.flatMap(e=>e.sets).length,7);assert.equal(imported.exercises[0].supersetId,imported.exercises[1].supersetId);assert.equal(imported.exercises[2].sets[0].reps,null);assert.equal(imported.exercises[2].sets[0].distanceUnit,unit==='kg'?'km':'mi');
  await r.page.reload();assert.equal((await r.stored()).workouts.length,1);await r.page.getByRole('button',{name:'PROGRESS',exact:true}).click();
  await r.page.getByRole('button',{name:/View all logged exercises/}).waitFor();await shot(r,`${name}-progress`);
  const bench=r.page.locator('.logged-exercises-preview button').filter({hasText:'Bench Press'}).first();await bench.click();await shot(r,`${name}-exercise-history`);
  assert.doesNotMatch(await r.page.locator('.detail-screen').last().innerText(),/NaN|Infinity|0 drop segments/);
  await r.page.reload();await importer(r);await upload(r,`SYNTHETIC-${name}.csv`,data);await r.page.getByText('1 already in ROOK',{exact:true}).waitFor();await save(r,0);assert.equal((await r.stored()).workouts.length,1);
  await clean(r);return r.context;
 });
 await run('strong-units-and-missing-values',async()=>{
  const r=await open(320,'dark');await importer(r,'Strong');await upload(r,'SYNTHETIC-strong.csv',strongCsv());
  await r.page.getByRole('button',{name:'REVIEW IMPORT',exact:true}).click();await r.page.getByRole('alert').waitFor();assert.match(await r.page.getByRole('alert').innerText(),/weight unit/);assert.equal((await r.stored()).workouts.length,0);
  await r.page.getByLabel('Weight unit when absent from file').selectOption('kg');await r.page.getByLabel('Distance unit when absent from file').selectOption('km');await shot(r,'strong-unit-choice-320');await review(r);await save(r,2);
  const imported=(await r.stored()).workouts;assert.equal(imported.length,2);assert.equal(imported[0].durationSeconds,4560);assert.equal(imported[1].exercises[1].sets[0].reps,null);await r.page.reload();assert.equal((await r.stored()).workouts.length,2);await clean(r);return r.context;
 });
 await run('generic-mapping-and-xlsx',async()=>{
  const r=await open();await importer(r,'Generic CSV');
  const rows=[['When','Movement','Kilograms','Done reps','Opaque'],['2025-04-05','Bench Press',62.5,8,'Opomba 🏋️']],bytes=xlsxFixture([{name:'History',rows},{name:'Second sheet',rows}]);
  await upload(r,'SYNTHETIC-mapping.xlsx',bytes);await r.page.getByLabel('Column: Workout date / start',{exact:true}).selectOption('0');await r.page.getByLabel('Column: Exercise name',{exact:true}).selectOption('1');await r.page.getByLabel('Column: Weight',{exact:true}).selectOption('2');await r.page.getByLabel('Column: Reps',{exact:true}).selectOption('3');await r.page.getByLabel('Weight unit when absent from file').selectOption('kg');await shot(r,'generic-xlsx-mapping-390');await review(r);await save(r,1);
  const s=await r.stored();assert.equal(s.workouts[0].exercises[0].sets[0].weight,62.5);assert.equal(s.workouts[0].exercises[0].sets[0].rawImport.sourceValues.Opaque,'Opomba 🏋️');await clean(r);return r.context;
 });
 await run('unknown-exercise-and-load-review',async()=>{
  const r=await open(320,'light','premium');await importer(r);await upload(r,'SYNTHETIC-custom-hevy.csv',hevyCsv([hevyRow({exercise_title:'Čučanj na posebni napravi'})]));
  assert.equal(await r.page.getByRole('button',{name:'IMPORT 1 WORKOUT',exact:true}).isEnabled(),true);
  assert.equal((await r.stored()).customExercises.length,0);await r.page.getByText('Source load meanings (optional)',{exact:true}).click();await r.page.getByLabel(/Source load meaning/).selectOption('external');await shot(r,'custom-load-review-320');await save(r,1);const s=await r.stored();assert.equal(s.customExercises[0].name,'Čučanj na posebni napravi');await clean(r);return r.context;
 });
 await run('corrupt-row-and-storage-failure-atomicity',async()=>{
  const r=await open();await importer(r,'Generic CSV');const data=genericCsv([genericRow(),genericRow({set_order:2,weight:-5})]);await upload(r,'SYNTHETIC-invalid-row.csv',data);await review(r);
  assert.equal(await r.page.getByRole('button',{name:'IMPORT 1 WORKOUT',exact:true}).isDisabled(),true);await r.page.getByText('1 invalid row',{exact:true}).click();await shot(r,'invalid-row-blocked');assert.equal((await r.stored()).workouts.length,0);
  await r.page.getByRole('button',{name:'Close Import workout history',exact:true}).click();await openProfileArea(r.page,'data');await r.page.getByRole('button',{name:/Import workout history/}).click();await r.page.getByRole('button',{name:/^Hevy/}).click();await upload(r,'SYNTHETIC-valid-for-retry.csv',hevyCsv());
  await r.page.evaluate(()=>{window.__originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')throw new DOMException('QA quota','QuotaExceededError');return window.__originalSetItem.call(this,k,v);};});
  await r.page.getByRole('button',{name:'IMPORT 1 WORKOUT',exact:true}).click();await r.page.getByRole('alert').waitFor();assert.match(await r.page.getByRole('alert').innerText(),/Existing history is unchanged/);assert.equal((await r.stored()).workouts.length,0);await shot(r,'storage-failure-recoverable');
  await r.page.evaluate(()=>{Storage.prototype.setItem=window.__originalSetItem;});await save(r,1);await clean(r);return r.context;
 });
 await run('date-only-grouping-confirmation',async()=>{
  const r=await open(320,'dark');await importer(r,'Generic CSV');
  await upload(r,'SYNTHETIC-date-only-grouping.csv',genericCsv([genericRow({workout_date:'2025-04-05',set_order:1}),genericRow({workout_date:'2025-04-05',set_order:2})]));await review(r);
  const apply=r.page.getByRole('button',{name:'IMPORT 1 WORKOUT',exact:true});assert.equal(await apply.isDisabled(),true);
  await r.page.getByLabel(/Confirm date-only session grouping/).check();await shot(r,'date-only-explicit-group-review-320');await save(r,1);
  const workout=(await r.stored()).workouts[0];assert.equal(workout.historicalImport.dateOnlyGroupingConfirmed,true);assert.equal(workout.startedAt,null);assert.equal(workout.exercises[0].sets.length,2);
  await clean(r);return r.context;
 });
 await run('stale-storage-and-cancel-safety',async()=>{
  const r=await open();await importer(r);await upload(r,'SYNTHETIC-stale-state.csv',hevyCsv());
  const original=await r.page.evaluate(()=>localStorage.getItem('lift-v2-state'));
  await r.page.evaluate(()=>{const state=JSON.parse(localStorage.getItem('lift-v2-state'));state.profile.name='Changed in another tab';localStorage.setItem('lift-v2-state',JSON.stringify(state));});
  await r.page.getByRole('button',{name:'IMPORT 1 WORKOUT',exact:true}).click();await r.page.getByRole('alert').waitFor();
  assert.match(await r.page.getByRole('alert').innerText(),/changed in another tab/);assert.equal((await r.stored()).workouts.length,0);assert.equal((await r.stored()).profile.name,'Changed in another tab');await shot(r,'stale-state-protected');
  await r.page.getByRole('button',{name:'Close Import workout history',exact:true}).click();
  await r.page.evaluate(value=>localStorage.setItem('lift-v2-state',value),original);await r.page.reload();await importer(r,'Generic CSV');await upload(r,'SYNTHETIC-cancel-before-save.csv',largeCsv(1000));
  await r.page.getByRole('button',{name:'REVIEW IMPORT',exact:true}).click();await r.page.getByRole('button',{name:'Close Import workout history',exact:true}).click();
  await r.page.reload();assert.equal((await r.stored()).workouts.length,0);await clean(r);return r.context;
 });
 for(const count of [100,1000,5000])await run(`large-${count}`,async()=>{
  const r=await open(390,'dark','premium');await importer(r,'Generic CSV');const text=largeCsv(count);await upload(r,`SYNTHETIC-${count}-workouts.csv`,text);
  await r.page.evaluate(()=>{window.__ticks=0;window.__longTasks=[];window.__ticker=setInterval(()=>window.__ticks++,16);window.__observer=new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));window.__observer.observe({type:'longtask'});});
  const start=Date.now();await review(r);const parseMs=Date.now()-start;
  const metrics=await r.page.evaluate(()=>{clearInterval(window.__ticker);window.__observer.disconnect();return {ticks:window.__ticks,longTasks:window.__longTasks};});
  assert.ok(metrics.ticks>0,'main thread continues to tick while worker parses');assert.equal((await r.stored()).workouts.length,0);await shot(r,`large-${count}-review`);
  await r.page.evaluate(()=>{window.__saveTicks=0;window.__saveTasks=[];window.__saveTicker=setInterval(()=>window.__saveTicks++,16);window.__saveObserver=new PerformanceObserver(list=>window.__saveTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));window.__saveObserver.observe({type:'longtask'});});
  const saveStart=Date.now();await r.page.getByRole('button',{name:`IMPORT ${count.toLocaleString('en')} WORKOUTS`,exact:true}).click();
  await r.page.getByRole('heading',{name:`${count.toLocaleString('en')} workouts imported`,exact:true}).or(r.page.getByRole('alert')).waitFor({timeout:45000});
  const s=await r.stored(),saved=s.workouts.length===count,saveMs=Date.now()-saveStart;
  const saveMetrics=await r.page.evaluate(()=>{clearInterval(window.__saveTicker);window.__saveObserver.disconnect();return {saveTicks:window.__saveTicks,saveTasks:window.__saveTasks};});
  if(!saved){assert.equal(s.workouts.length,0);assert.match(await r.page.getByRole('alert').innerText(),/storage|save/i);}else{assert.equal(s.workouts.flatMap(w=>w.exercises.flatMap(e=>e.sets)).length,count*3);await r.page.reload();assert.equal((await r.stored()).workouts.length,count);}
  results.push({measurement:`large-${count}`,rows:count*3,parseMs,saveMs,saved,...metrics,...saveMetrics});await shot(r,`large-${count}-result`);await clean(r);return r.context;
 });
} finally {await browser.close();await writeFile(`${root}/browser-results${selected?'-'+selected:''}.json`,JSON.stringify(results,null,2));}
