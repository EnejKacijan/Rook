import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
import {openProfileArea} from './qa-current-navigation.mjs';
import {importConsistencyCorpus} from './fixtures/import-consistency-corpus.mjs';
const out='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT/location-fix';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390]){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 const state=blankState();state.profile.environment='Commercial gym';state.profile.recommendedWarmupsEnabled=false;
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-09-07T12:00:00Z'));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(importConsistencyCorpus.find(c=>c.id==='12').source);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();assert.equal(await page.locator('.import-resolution').count(),0);await page.screenshot({path:`${out}/${width}-review.png`});
 await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.locator('.bottom-nav').waitFor();await page.reload();
 const locations=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program.days.map(d=>[d.weekday,d.location]));assert.deepEqual(await locations(),[['Mon','Home'],['Fri','Commercial gym']]);
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page,'program');await page.getByRole('button',{name:/Edit plan/}).click();await page.getByRole('heading',{name:'Edit your plan'}).waitFor();await page.screenshot({path:`${out}/${width}-edit.png`});await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await page.locator('.edit-plan-screen').waitFor({state:'detached'});assert.deepEqual(await locations(),[['Mon','Home'],['Fri','Commercial gym']]);
 await page.getByRole('button',{name:'TODAY',exact:true}).click();await page.getByRole('button',{name:'START WORKOUT',exact:true}).click();await page.locator('.workout-screen').waitFor();assert.deepEqual(await locations(),[['Mon','Home'],['Fri','Commercial gym']]);
 const active=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout);assert.equal(active.exercises[0].sets[0].reps,12);assert.equal(active.exercises[1].sets[0].reps,null);await page.screenshot({path:`${out}/${width}-active.png`});console.log(`PASS ${width}: Review/apply/reload/Edit save/active preserve Home + Commercial gym`);await context.close();
}}finally{await browser.close();}
