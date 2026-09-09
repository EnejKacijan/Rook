import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
import {buildWeeklyPlanExport} from '../src/workoutExport.js';
import {openProfileArea} from './qa-current-navigation.mjs';
import {importConsistencyCorpus as corpus} from './fixtures/import-consistency-corpus.mjs';
const out='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT/rir-final-roundtrips';await mkdir(out,{recursive:true});
const cases=[['partial','26',320],['amrap',null,390],['table','06',390],['inline','07',390],['locations','12',390],['superset','17',390],['circuit','15',390],['warmup','20',390],['alternative','19',390],['custom','23',390],['ordinary',null,390],['rir-zero',null,320]];
const results=[];
const browser=await chromium.launch({channel: 'chrome',headless:true});
const semantic=program=>program.days.map(d=>({weekday:d.weekday,location:d.location,warmup:d.warmupPlan,exercises:d.exercises.map(e=>({name:e.importedName,sets:e.sets.map(s=>({reps:s.reps,weight:s.weight,setType:s.setType})),min:e.repMin,max:e.repMax,pair:e.supersetId,rir:e.targetRir}))}));
let currentPage;
try{for(const [name,id,width] of cases.filter(c=>!process.argv[2]||c[0]===process.argv[2])){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 const state=blankState();state.profile.recommendedWarmupsEnabled=false;
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage();currentPage=page;page.setDefaultTimeout(12000);await page.clock.setFixedTime(new Date('2026-09-07T12:00:00Z'));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 const original=(await stored())?.program ?? undefined;
 const source=id?corpus.find(c=>c.id===id).source:`Monday: Upper\n${name==='amrap'?'Pull Up 3xAMRAP':`Bench Press 3x8${name==='rir-zero'?' RIR 0':''}`}\nThursday: Lower\nSquat 3x8`;
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(source);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
 await page.locator('.import-resolution, .plan-editor').first().waitFor().catch(async()=>{await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();});
 if(name==='circuit'){
  await page.getByRole('heading',{name:'Review circuit structure'}).waitFor();assert.equal(await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).count(),0);assert.deepEqual((await stored())?.program,original);
  await page.screenshot({path:`${out}/${name}-blocked.png`});await page.getByRole('button',{name:'EDIT NOTES',exact:true}).click();assert.equal(await page.getByPlaceholder(/Paste your workout notes/).inputValue(),source);
  results.push({name,result:'PASS: source-preserving mandatory blocker; apply prohibited'});await context.close();continue;
 }
 for(let decision=0;await page.locator('.import-resolution').count();decision++){
  assert.ok(decision<12,'bounded decisions');const active=page.locator('.import-decision-content[data-active="true"]');const title=await active.locator('h1').innerText();
  if(title==='Set the prescription'){
   const inputs=active.locator('input');for(let i=0;i<await inputs.count();i++){const input=inputs.nth(i);if(await input.getAttribute('readonly')!==null){assert.equal(await input.inputValue(),'3');continue;}const label=await input.getAttribute('aria-label');await input.fill(label.includes('Sets')?'3':(await active.innerText()).includes('Cable Row')?'10':'8');}
   await page.screenshot({path:`${out}/${name}-decision-${decision}.png`});await page.getByRole('button',{name:/^(CONTINUE|REVIEW PLAN)$/}).click();
  }else if(title==='Choose a prescription'){await active.getByRole('button').first().click();await page.getByRole('button',{name:/^(CONTINUE|REVIEW PLAN)$/}).click();}
  else if(title==='Match this exercise'){await page.getByRole('button',{name:'KEEP AS CUSTOM',exact:true}).click();}
  else throw Error(`Unexpected decision ${name}: ${title}`);
 }
 await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();assert.deepEqual((await stored())?.program,original);await page.screenshot({path:`${out}/${name}-review.png`});
 // The deterministic Date clock must advance beyond the existing double-tap guard.
 await page.clock.setFixedTime(new Date('2026-09-07T12:00:01Z'));
 await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.locator('.bottom-nav').waitFor();const before=semantic((await stored()).program);await page.reload();assert.deepEqual(semantic((await stored()).program),before);
 if(name==='partial'){const ex=(await stored()).program.days[0].exercises;assert.equal(ex[0].sets[0].weight,60);assert.equal(ex[1].sets.length,3);assert.equal(ex[1].repMin,10);}
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page,'program');await page.getByRole('button',{name:/^Edit plan/}).click();await page.getByRole('heading',{name:'Edit your plan'}).waitFor();await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await page.locator('.edit-plan-screen').waitFor({state:'detached'});assert.deepEqual(semantic((await stored()).program),before);await page.reload();assert.deepEqual(semantic((await stored()).program),before);
 const exportText=buildWeeklyPlanExport({state:await stored(),includeNotes:true,date:new Date('2026-09-07T12:00:00Z')}).text;await writeFile(`${out}/${name}-export.txt`,exportText);
 if(name==='rir-zero')assert.ok(exportText.includes('RIR 0'));else assert.ok(!exportText.includes('RIR'),`${name}: no invented RIR in export`);
 if(name==='amrap')assert.ok(exportText.includes('3 × AMRAP'));if(name==='superset')assert.ok(exportText.includes('A1 → A2'));
 await page.getByRole('button',{name:'TODAY',exact:true}).click();await page.getByRole('button',{name:'START WORKOUT',exact:true}).click();await page.locator('.workout-screen').waitFor();const saved=await stored();assert.deepEqual(semantic(saved.program),before);
 assert.equal(saved.activeWorkout.exercises.length,saved.program.days[0].exercises.length);
 for(const [index,e] of saved.activeWorkout.exercises.entries())assert.equal(e.targetRir,name==='rir-zero'&&index===0?0:null);
 const target=page.locator('.workout-screen').getByText(/^Target /).first();
 if(name==='rir-zero')assert.ok((await target.innerText()).includes('0 RIR'));else assert.ok(!(await target.innerText()).includes('RIR'));
 for(let i=0;i<saved.activeWorkout.exercises.length;i++){assert.equal(saved.activeWorkout.exercises[i].sets.length,saved.program.days[0].exercises[i].sets.length);assert.equal(saved.activeWorkout.exercises[i].sets[0].reps,saved.program.days[0].exercises[i].repMin);}
 await page.screenshot({path:`${out}/${name}-active.png`});results.push({name,result:'PASS: decisions/review/apply/reload/Edit save/reload/active/export'});await context.close();console.log('PASS',name);
}}catch(error){results.push({result:'FAIL',error:error.stack});if(currentPage&&!currentPage.isClosed()){console.log(await currentPage.locator('body').innerText());await currentPage.screenshot({path:`${out}/failure.png`});}throw error;}finally{await writeFile(`${out}/results${process.argv[2]?`-${process.argv[2]}`:''}.json`,JSON.stringify(results,null,2));await browser.close();}
