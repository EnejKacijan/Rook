import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {AIService} from '../src/aiService.js';
import {blankState} from '../src/domain.js';
import {preparePlanImport} from '../src/planImportTransaction.js';
import {hybridOwnerNotes} from '../src/hybridImportFixture.js';
const parsed=await AIService.importTrainingPlan(blankState().profile,'Friday: Original\nBench Press 3x8',{review:true});
const seed=preparePlanImport(blankState(),parsed.program,parsed.profile,{date:'2026-09-11',weekday:'Fri',initial:true});
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/hybrid-import';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];let page;
try{for(const [index,kind]of ['network','provider timeout','invalid schema','invented role','cancel and late response'].entries()){
 const context=await browser.newContext({viewport:{width:index%2?390:320,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
 await context.addInitScript(state=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));Object.defineProperty(navigator,'standalone',{value:true});},seed);
 page=await context.newPage();page.setDefaultTimeout(20000);let requests=0,held;
 await page.route('**/api/ai',async route=>{
  requests++;const payload=route.request().postDataJSON().payload;
  if(kind==='network')return route.abort();
  if(kind==='provider timeout')return route.fulfill({status:502,json:{error:'Provider request took too long.'}});
  if(kind==='invalid schema')return route.fulfill({json:{data:{text:'invent a plan'}}});
  const fragments=payload.fragments.map(f=>({id:f.id,kind:'exercise',nameQuote:'dipsi',facts:kind==='invented role'?[{kind:'role',evidence:'na koncu',value:'backoff'}]:[]}));
  if(kind==='cancel and late response'){held=()=>route.fulfill({json:{data:{fragments}}}).catch(()=>{});return;}
  return route.fulfill({json:{data:{fragments}}});
 });
 await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4177');
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await page.locator('[data-profile-area="program"]').click();
 await page.getByRole('button',{name:/Replace plan/}).click();await page.getByRole('button',{name:/Import a different plan/}).click();
 const input=page.getByPlaceholder(/Paste your workout notes/);await input.fill(hybridOwnerNotes);
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program);
 await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await page.getByRole('button',{name:'INTERPRET WITH AI',exact:true}).waitFor();assert.equal(requests,0);
 // Synchronous double click tests the existing import-in-flight guard.
 await page.getByRole('button',{name:'INTERPRET WITH AI',exact:true}).evaluate(button=>{button.click();button.click();});
 if(kind==='cancel and late response'){
  await page.getByRole('button',{name:/cancel/i}).click();await page.getByText('Import cancelled. Your notes are still here.').waitFor();await held?.();
 }else await page.getByRole('button',{name:'RETRY AI INTERPRETATION',exact:true}).waitFor();
 assert.equal(requests,1);assert.equal(await input.inputValue(),hybridOwnerNotes);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program),before);
 await page.getByRole('button',{name:'Review local draft',exact:true}).click();await page.locator('.import-resolution').waitFor();
 assert.equal(await page.locator('.import-decision-content:visible .import-source-value[aria-label="Source Sets"] strong').innerText(),'1');
 assert.equal(await page.locator('.import-decision-content:visible').getByLabel('Reviewed Min reps',{exact:true}).inputValue(),'');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('.import-resolution').getByRole('button',{name:'Back',exact:true}).click();
 await input.waitFor();assert.equal(await input.inputValue(),hybridOwnerNotes);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program),before);
 results.push({kind,result:'PASS',requests,sourcePreserved:true,localReview:true,currentPlanUnchanged:true});
 await context.close();console.log(`PASS ${kind}`);
}}catch(error){console.error((await page?.locator('body').innerText().catch(()=>''))?.slice(0,2500));throw error;}
finally{await browser.close();await writeFile(`${out}/failure-results.json`,JSON.stringify(results,null,2));}
