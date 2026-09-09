import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
import {importConsistencyCorpus} from './fixtures/import-consistency-corpus.mjs';
const out='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT/rounds-fix';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try {for(const width of [320,390])for(const only of [false,true]){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce',serviceWorkers:'block'});await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},blankState());
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');const storedProgram=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.program??null);const original=await storedProgram();
 const source=only?'Monday: Circuit\n3 rounds\nPlank 30 sec\nPush Up 10 reps':importConsistencyCorpus.find(c=>c.id==='15').source;
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(source);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await page.getByRole('heading',{name:'Review circuit structure',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).count(),0);assert.equal(await page.locator('.import-decision-content').count(),1);assert.ok((await page.locator('.import-resolution blockquote').innerText()).includes('3 rounds'));
 assert.deepEqual(await storedProgram(),original);await page.screenshot({path:`${out}/${width}-${only?'only':'mixed'}-blocked.png`});
 await page.getByRole('button',{name:'EDIT NOTES',exact:true}).click();assert.equal(await page.getByPlaceholder(/Paste your workout notes/).inputValue(),source);assert.deepEqual(await storedProgram(),original);
 console.log(`PASS ${width}/${only?'only':'mixed'}: one mandatory group blocker; no apply; source editable; original plan unchanged`);await context.close();
}}finally{await browser.close();}
