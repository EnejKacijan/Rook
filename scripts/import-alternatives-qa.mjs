import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
const out='artifacts/import-alternatives';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const cases=[
 {id:'ali',line:'Leg Press 3x9 155kg @ 1 RIR ali Hack Squat 2x6 70kg @ 2 RIR',name:'Hack Squat',sets:2,reps:6,weight:70,rir:2},
 {id:'or-shared',line:'Bench Press or Push-ups 3x8',name:'Push-ups',sets:3,reps:8,weight:null,rir:null},
 {id:'oder-lb',line:'Bench Press 3x8 80kg oder Incline Dumbbell Press 2x10 25 lb',name:'Incline Dumbbell Press',sets:2,reps:10,weight:25*.45359237,rir:null},
 {id:'ou',line:'Bench Press 3x8 80kg ou Push-ups 2x12',name:'Push-ups',sets:2,reps:12,weight:null,rir:null},
];
try{for(const [width,appearance,style] of [[390,'light','standard'],[320,'dark','standard'],[390,'light','premium'],[390,'dark','premium']])for(const test of cases){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),state=blankState();Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(`MONDAY\n${test.line}`);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await page.locator('.import-resolution').waitFor();
 const choices=page.locator('.plan-import-choice .choice-row');assert.equal(await choices.count(),2);assert.equal(await page.locator('.import-resolution .sheet-action-footer button').isDisabled(),true);
 const key=`${out}/${width}-${style}-${appearance}-${test.id}`;await page.screenshot({path:`${key}-choices.png`});
 await choices.filter({hasText:test.name}).click();await page.locator('.import-resolution .sheet-action-footer button').click();await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
 assert.equal(await page.locator('.import-resolution').count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.program??null),null);
 await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.locator('.bottom-nav').waitFor();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))),exercise=saved.program.days[0].exercises[0];
 assert.equal(saved.program.days[0].exercises.length,1);assert.equal(exercise.importedName,test.name);assert.equal(exercise.sets.length,test.sets);assert.equal(exercise.repMin,test.reps);assert.equal(exercise.targetRir,test.rir);
 if(test.weight===null)assert.equal(exercise.sets[0].weight,null);else assert.ok(Math.abs(exercise.sets[0].weight-test.weight)<.011);
 assert.ok(saved.program.importMetadata.sourceNotes.some(note=>note.text.includes(test.line)));assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await context.close();console.log(`${key}: selected branch only, correct prescription/units/effort, final persistence passed`);
}
 for(const line of ['Bench Press 3x8 or Push-ups','Bench Press (or Push-ups) 3x8','Bench Press 3x8 50 or Push-ups 3x8','Bench Press 3x8\nor Push-ups 3x10']){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(`MONDAY\n${line}`);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await page.locator('.import-resolution').waitFor();
  assert.equal(await page.locator('.import-resolution .sheet-action-footer button').isDisabled(),true);assert.equal(await page.getByRole('button',{name:'USE PREVIEWED EXERCISE ONLY',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).count(),0);await page.screenshot({path:`${out}/uncertain-source.png`});await page.getByRole('button',{name:'Back',exact:true}).click();assert.ok((await page.getByPlaceholder(/Paste your workout notes/).inputValue()).includes(line));await context.close();console.log(`Uncertain source stays blocked and editable: ${line}`);
 }
}finally{await browser.close();}
