import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {hybridOwnerNotes} from '../src/hybridImportFixture.js';
const out='artifacts/ROOK-IMPORT-RESOLUTION-AUDIT/before';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [320,390]){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
 await page.route('**/api/ai',route=>{const b=route.request().postDataJSON();return route.fulfill({json:{data:{fragments:b.payload.fragments.map(f=>({id:f.id,kind:'exercise',nameQuote:'dipsi',facts:[{kind:'optional',value:'true',evidence:'Po želji'},{kind:'failure',value:'true',evidence:'do failure'}]}))}}});});
 await page.goto('http://127.0.0.1:4177');await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(hybridOwnerNotes);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
 await page.getByRole('button',{name:'INTERPRET WITH AI',exact:true}).waitFor();
 await page.evaluate(()=>Object.assign(document.documentElement.dataset,{style:'standard',appearance:'dark'}));
 await page.screenshot({path:`${out}/${width}-fallback.png`});
 const geometry=await page.evaluate(()=>{const r=e=>{const x=e.getBoundingClientRect();return {top:x.top,bottom:x.bottom,height:x.height};};return {textarea:r(document.querySelector('.import-plan-text')),footer:r(document.querySelector('.import-compose-footer')),position:getComputedStyle(document.querySelector('.import-compose-footer')).position};});
 await page.getByRole('button',{name:'INTERPRET WITH AI',exact:true}).click();await page.locator('.import-resolution').waitFor();
 await page.screenshot({path:`${out}/${width}-prescription.png`});
 await writeFile(`${out}/${width}.json`,JSON.stringify({geometry,step:await page.locator('.step-count').innerText(),controls:await page.locator('.import-decision-content:visible input').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),value:e.value,readOnly:e.readOnly})))},null,2));
 await context.close();console.log(`BEFORE ${width}`);
}}finally{await browser.close();}
