import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {openProfileArea} from './qa-current-navigation.mjs';

const out='artifacts/ROOK-SWIPE-BACK-AUDIT/boundaries';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const width of [320,390]){
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
 await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 const p=await context.newPage();p.setDefaultTimeout(12000);await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await p.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');
 const cdp=await context.newCDPSession(p);await cdp.send('Page.resetNavigationHistory');
 const b=name=>p.getByRole('button',{name,exact:true});
 const step=n=>p.waitForFunction(n=>document.querySelector('.step-count')?.textContent===`STEP ${n}/8`,n);
 async function swipe(selector){
  await p.evaluate(()=>{document.activeElement?.blur();getSelection()?.removeAllRanges();});
  const box=await p.locator(selector).boundingBox(),x=box.x+3,y=box.y+180;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+box.width*.60*i/5,y:y+1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await p.waitForFunction(()=>!document.documentElement.dataset.edgeBackActive);
 }
 await b('BUILD MY PLAN').click();await p.getByRole('combobox',{name:'Age range'}).click();await p.getByRole('option',{name:'18–29'}).click();await b('CONTINUE').click();await b('Build muscle').click();await step(3);
 // Wait for the existing cross-choice double-tap guard, not navigation readiness.
 await p.waitForTimeout(360);await p.getByRole('button',{name:/^Beginner/}).click();await step(4);
 await b('3 days').click();await p.getByLabel('Any day works').check();await b('60 min').click();await b('CONTINUE').click();await step(5);await b('Commercial gym').click();await b('CONTINUE').click();await step(6);
 await b('Balanced').click();await p.locator('.physique-review-entry').click();
 for(const heading of ['Possible areas you may want to prioritize.','Add your photos']){
  await p.getByRole('heading',{name:heading,exact:true}).waitFor();
  assert.equal(await p.locator('.physique-review-screen button[aria-label^="Back"]').count(),0);
  await swipe('.physique-review-screen');assert.ok(await p.getByRole('heading',{name:heading,exact:true}).isVisible());
  if(heading.startsWith('Possible'))await b('CONTINUE').click();
 }
 await b('SKIP').click();await step(6);assert.match(await b('Balanced').getAttribute('class'),/selected-option/);
 results.push({width,flow:'optional physique intro/upload',result:'PASS: no existing Back, no invented gesture; Skip preserves priorities; no photo sent'});
 await context.close();

 const state=createReturningUserFixture(1);state.activeWorkout=null;
 const returning=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
 await returning.addInitScript(state=>{localStorage.setItem('lift-v2-state',JSON.stringify(state));Object.defineProperty(navigator,'standalone',{value:true});},state);
 const page=await returning.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');
 await openProfileArea(page,'data');await page.getByRole('button',{name:/Import workout history/}).click();
 await page.getByRole('heading',{name:'Choose source',exact:true}).waitFor();assert.equal(await page.locator('.history-import-screen button[aria-label^="Back"]').count(),0);
 await page.getByRole('button',{name:/^Hevy/}).click();await page.getByRole('heading',{name:'Choose history file',exact:true}).waitFor();
 const before=await page.evaluate(()=>localStorage.getItem('lift-v2-state'));
 const historyCdp=await returning.newCDPSession(page);const box=await page.locator('.history-import-screen').boundingBox();
 await historyCdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+3,y:box.y+180}]});
 for(let i=1;i<=5;i++)await historyCdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+3+box.width*.60*i/5,y:box.y+181}]});
 await historyCdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.getByRole('heading',{name:'Choose source',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('lift-v2-state')),before);
 await page.getByRole('button',{name:/^Hevy/}).click();await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('heading',{name:'Choose source',exact:true}).waitFor();
 results.push({width,flow:'historical import',result:'PASS: existing file → source Back parity, no persistence, native picker untouched'});
 await returning.close();console.log(`PASS ${width}: physique exclusion and existing history-import boundary`);
}}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
