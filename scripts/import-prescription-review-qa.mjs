import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out='artifacts/import-prescription-review';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390]){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',colorScheme:width===320?'dark':'light'});
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill('MONDAY - FUNCTIONAL\nY Balance Reach - 2 kroga\nMonster Walk - 3 krogi');
 await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await page.getByRole('heading',{name:'Review your plan'}).waitFor();
 const accept=page.getByRole('button',{name:'USE THESE SETS & REPS',exact:true});assert.equal(await accept.count(),0);
 await page.getByLabel('Reviewed Min reps',{exact:true}).first().scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-before.png`});
 for(const choice of await page.locator('.plan-import-choice').all()){
   await choice.getByLabel('Reviewed Min reps',{exact:true}).fill('8');
   await choice.getByLabel('Reviewed Max reps',{exact:true}).fill('10');
 }
 assert.equal(await accept.count(),0);
 assert.equal(await page.getByText('Choice resolved · You can change it before using the plan.',{exact:true}).count(),2);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.program??null),null);
 await page.screenshot({path:`${out}/${width}-resolved.png`});await context.close();console.log(`${width}: unspecified round reps require real input, direct resolution and no plan write`);
}}finally{await browser.close();}
