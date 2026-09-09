import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out='artifacts/import-custom-advance';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390]){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill('MONDAY - PUSH\nMystery movement alpha 2x8\nBench Press 3x8\nTUESDAY - LEGS\nMystery movement beta 2x10');
 await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
 await page.getByRole('heading',{name:'Match this exercise',exact:true}).waitFor();
 await page.getByRole('button',{name:/KEEP AS CUSTOM/}).first().scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-before.png`});
 await page.getByRole('button',{name:/KEEP AS CUSTOM/}).first().click();
 await page.waitForTimeout(700);
 const expanded=page.locator('.import-decision-content:visible');
 assert.match(await expanded.innerText(),/Mystery movement beta/i);
 const box=await expanded.boundingBox();assert.ok(box.y>=0&&box.y<700);
 await page.screenshot({path:`${out}/${width}-next-open.png`});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state'))?.program??null),null);
 await page.getByRole('button',{name:/KEEP AS CUSTOM/}).first().click();await page.waitForTimeout(300);
 await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
 assert.equal(await page.locator('.import-decision-content:visible').count(),0);
 await context.close();console.log(`${width}: next unresolved opens, scrolls and final item closes without applying plan`);
}}finally{await browser.close();}
