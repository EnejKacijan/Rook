import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {importResolutionNotes} from '../src/importResolutionFixture.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/build-plan-swipe-forward';
await mkdir(out,{recursive:true});
const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173';
// Native browser gestures enabled. No standalone override or history flags.
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const width of [320,390])for(const flow of ['questionnaire','import']){
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
 const page=await context.newPage();let advanced=0;
 await page.exposeFunction('unexpectedQuestionAdvance',()=>advanced++);
 await context.addInitScript(()=>new MutationObserver(()=>{
  if(window.watchNativeForward&&/^STEP 2\//.test(document.querySelector('.step-count')?.textContent||''))window.unexpectedQuestionAdvance();
 }).observe(document,{subtree:true,childList:true,characterData:true}));
 await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await page.goto(`${base}/?native-forward=questionnaire`);await page.goto(`${base}/?native-forward=destination`);await page.goBack();
 if(flow==='questionnaire'){
  await page.getByRole('button',{name:'BUILD MY PLAN',exact:true}).click();
  await page.getByRole('combobox',{name:'Age range'}).click();await page.getByRole('option',{name:'18–29'}).click();
 }else{
  await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(importResolutionNotes);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
  await page.getByRole('button',{name:/Leg Press · 3 × 9 · 155 kg/}).click();await page.getByRole('button',{name:'CONTINUE',exact:true}).click();await page.getByRole('button',{name:'Back',exact:true}).click();
 }
 assert.equal(await page.getByRole('button',{name:'CONTINUE',exact:true}).isEnabled(),true);
 await page.evaluate(()=>{document.activeElement.blur();window.watchNativeForward=true;});
 const cdp=await context.newCDPSession(page),touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
 await touch('touchStart',width-3,215);for(let i=1;i<=5;i++)await touch('touchMove',width-3-width*.7*i/5,216);await touch('touchEnd');
 await page.waitForURL('**/?native-forward=destination');assert.equal(advanced,0,'native Forward must not also advance ROOK');
 results.push({width,flow,passed:true,nativeForwardDestination:page.url(),rookQuestionAdvances:advanced});await context.close();
 }}finally{await browser.close();await writeFile(`${out}/native-forward-results.json`,JSON.stringify(results,null,2));}
console.log(`PASS ${results.length} native browser Forward checks`);
