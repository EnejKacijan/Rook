import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {hybridOwnerNotes} from '../src/hybridImportFixture.js';
const out='artifacts/ROOK-IMPORT-RESOLUTION-AUDIT';await mkdir(`${out}/screenshots`,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const mode of ['complete-local','decline-ai','running-cancel']){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();let requests=0,finish;
 await page.route('**/api/ai',r=>{requests++;finish=()=>r.fulfill({status:503,json:{error:'Unavailable'}}).catch(()=>{});});
 await page.goto('http://127.0.0.1:4177');await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(mode==='complete-local'?'Monday: Upper\nBench Press 3x8':hybridOwnerNotes);
 const before=await page.evaluate(()=>localStorage.getItem('lift-v2-state'));
 await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
 if(mode==='complete-local'){await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();assert.equal(await page.locator('.import-interpretation-offer').count(),0);assert.equal(requests,0);}
 else{
  const ai=page.getByRole('button',{name:'INTERPRET WITH AI',exact:true});await ai.waitFor();assert.equal(requests,0);
  await page.setViewportSize({width:390,height:500});
  await page.getByRole('button',{name:'Review local draft',exact:true}).scrollIntoViewIfNeeded();
  const geom=await page.evaluate(()=>{const source=document.querySelector('.import-plan-text').getBoundingClientRect(),offer=document.querySelector('.import-interpretation-offer').getBoundingClientRect();return {sourceBottom:source.bottom,offerTop:offer.top};});assert.ok(geom.offerTop>=geom.sourceBottom);
  await page.screenshot({animations:'disabled',path:`${out}/screenshots/${mode}-short-viewport.png`});
  assert.equal(await page.getByPlaceholder(/Paste your workout notes/).inputValue(),hybridOwnerNotes);
  if(mode==='decline-ai'){await page.getByRole('button',{name:'Review local draft',exact:true}).click();await page.locator('.import-resolution').waitFor();assert.equal(requests,0);}
  else{await ai.click();await page.waitForFunction(()=>document.querySelector('.import-interpretation-offer')?.getAttribute('aria-busy')==='true');assert.equal(await ai.isDisabled().catch(()=>page.getByRole('button',{name:'INTERPRETING…',exact:true}).isDisabled()),true);await page.screenshot({animations:'disabled',path:`${out}/screenshots/ai-running.png`});await page.getByRole('button',{name:/cancel/i}).click();await page.getByText('Import cancelled. Your notes are still here.').waitFor();await finish?.();assert.equal(requests,1);}
 }
 assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),before);
 results.push({mode,result:'PASS',requests,planUnchanged:true});await context.close();console.log(`PASS ${mode}`);
}}finally{await browser.close();await writeFile(`${out}/ai-offer-states.json`,JSON.stringify(results,null,2));}
