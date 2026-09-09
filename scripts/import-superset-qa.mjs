import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
import {openProfileArea} from './qa-current-navigation.mjs';
import {importConsistencyCorpus} from './fixtures/import-consistency-corpus.mjs';
const out='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT/superset-fix';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390]){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'});const s=blankState();s.profile.recommendedWarmupsEnabled=false;s.profile.rirEnabled=false;await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},s);
 const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-09-07T12:00:00Z'));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(importConsistencyCorpus.find(c=>c.id==='17').source);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();assert.equal(await page.locator('.import-resolution').count(),0);await page.screenshot({path:`${out}/${width}-review.png`});await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.locator('.bottom-nav').waitFor();await page.reload();
 let days=(await read()).program.days;const pair=days[0].exercises[0].supersetId;assert.ok(pair);assert.equal(days[0].exercises[1].supersetId,pair);
 for(const count of [2,3]){
  await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page,'program');await page.getByRole('button',{name:/^Edit plan/}).click();await page.locator('.plan-editor-summary').first().click();const input=page.getByRole('textbox',{name:/^Sets for/}).first();await input.fill(String(count));await input.press('Tab');await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await page.locator('.edit-plan-screen').waitFor({state:'detached'});await page.reload();days=(await read()).program.days;assert.deepEqual(days[0].exercises.map(e=>e.sets.length),[count,count]);assert.equal(days[0].exercises[0].supersetId,days[0].exercises[1].supersetId);
 }
 await page.getByRole('button',{name:'TODAY',exact:true}).click();await page.getByRole('button',{name:'START WORKOUT',exact:true}).click();await page.locator('.workout-screen').waitFor();
 for(const [i,expected] of [0,1,0,1,0,1].entries()){
  await page.waitForFunction(index=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exerciseIndex===index,expected);
  const row=page.locator('.set-row').filter({has:page.getByRole('button',{name:/^Log set/})}).first();const inputs=row.locator('input');for(let j=0;j<await inputs.count();j++)if(!await inputs.nth(j).inputValue())await inputs.nth(j).fill('8');await row.getByRole('button',{name:/^Log set/}).click();await page.waitForFunction(count=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises.flatMap(e=>e.sets).filter(s=>s.completed).length===count,i+1);
 }
 await page.screenshot({path:`${out}/${width}-logged.png`});assert.equal((await read()).workouts.length,0);console.log(`PASS ${width}: import/reload/edit 3→2→3/reload/live A1 A2 A1 A2 A1 A2`);await context.close();
}}finally{await browser.close();}
