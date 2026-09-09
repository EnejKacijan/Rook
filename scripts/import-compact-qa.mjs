import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
import {importResolutionNotes} from '../src/importResolutionFixture.js';
const out='artifacts/import-compact';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['dark','light']){
 const context=await browser.newContext({viewport:{width,height:700},serviceWorkers:'block'}),state=blankState();Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');await page.locator('.existing-plan-action').click();await page.getByPlaceholder(/Paste your workout notes/).fill(importResolutionNotes);await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
 const active=page.locator('.import-decision-content:visible'),scroll=page.locator('.import-decision-scroll'),footer=page.locator('.import-resolution .sheet-action-footer');await active.waitFor();await page.waitForTimeout(250);
 const bounds=await footer.boundingBox(),last=await active.locator('.choice-row').last().boundingBox();assert.ok(last.y+last.height<=bounds.y-12,JSON.stringify({width,last,bounds}));assert.equal(await scroll.evaluate(e=>e.scrollTop),0);assert.ok(await scroll.evaluate(e=>e.scrollHeight<=e.clientHeight+1),'common decision must fit without scrolling');
 const alignment=await active.locator('.choice-row').evaluateAll(buttons=>buttons.map(button=>{const range=document.createRange();range.selectNodeContents(button);const text=range.getBoundingClientRect(),box=button.getBoundingClientRect();return {offset:Math.abs((text.top+text.bottom-box.top-box.bottom)/2),height:box.height,justify:getComputedStyle(button).justifyContent};}));
 assert.ok(alignment.every(item=>item.offset<=2&&item.justify==='center'),JSON.stringify(alignment));
 await page.screenshot({path:`${out}/${width}-${style}-${appearance}.png`});
 await active.locator('.choice-row').first().click();await footer.getByRole('button').click();await active.getByLabel('Reviewed Min reps',{exact:true}).fill('8');await active.getByLabel('Reviewed Max reps',{exact:true}).fill('10');assert.equal(await footer.getByRole('button').isEnabled(),true);
 await page.setViewportSize({width,height:400});await page.waitForTimeout(250);assert.ok(await scroll.evaluate(e=>e.scrollHeight>e.clientHeight));await scroll.evaluate(e=>e.scrollTop=e.scrollHeight);const input=await active.getByLabel('Reviewed Max reps',{exact:true}).boundingBox();assert.ok(input.y+input.height<=(await footer.boundingBox()).y);assert.ok(await active.getByLabel('Reviewed Max reps',{exact:true}).evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
 await page.setViewportSize({width,height:700});await scroll.evaluate(e=>e.scrollTop=0);
 for(let step=2;step<=5;step++){
  await page.waitForTimeout(400);await page.screenshot({path:`${out}/${width}-${style}-${appearance}-step-${step}.png`});assert.ok(await scroll.evaluate(e=>e.scrollHeight<=e.clientHeight+1),`step ${step} should fit: ${JSON.stringify(await scroll.evaluate(e=>({height:e.clientHeight,content:e.scrollHeight})))}`);
  if(step===2)await footer.getByRole('button').click();
  if(step===3){await active.getByLabel('Reviewed Min reps',{exact:true}).fill('10');await active.getByLabel('Reviewed Max reps',{exact:true}).fill('12');await footer.getByRole('button').click();}
  if(step>=4)await active.getByRole('button',{name:'KEEP AS CUSTOM',exact:true}).click();
 }
 await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
 console.log(`PASS ${width} ${style} ${appearance}: 700px no scroll, 400px fields reachable`);await context.close();
}}finally{await browser.close();}
