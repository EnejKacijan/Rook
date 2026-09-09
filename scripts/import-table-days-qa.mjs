import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
import {importConsistencyCorpus} from './fixtures/import-consistency-corpus.mjs';
const out='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT/day-column-fix';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try {for(const width of [320,390]) {
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},blankState());
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(importConsistencyCorpus.find(c=>c.id==='06').source);
 await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
 assert.equal(await page.locator('.import-resolution').count(),0);await page.screenshot({path:`${out}/${width}-review.png`});
 await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await page.locator('.bottom-nav').waitFor();await page.reload();
 const days=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program.days);
 assert.deepEqual(days.map(d=>d.weekday),['Mon','Thu']);assert.deepEqual(days.map(d=>d.exercises.length),[1,1]);assert.equal(days[0].exercises[0].sets[0].weight,60);assert.equal(days[1].exercises[0].sets[0].weight,132.5);
 await page.screenshot({path:`${out}/${width}-today-reloaded.png`});console.log(`PASS ${width}: table → Review → apply → reload/Today; Monday and Thursday intact`);await context.close();
}}finally{await browser.close();}
