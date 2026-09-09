import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
const out='artifacts/backup-handoff'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
for(const [width,appearance] of [[390,'light'],[320,'dark']]) {
 const state=createReturningUserFixture(2);state.activeWorkout=null;
 Object.assign(state.profile,{appearancePreference:appearance,stylePreference:'standard',themePreference:appearance});
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',acceptDownloads:true,reducedMotion:'reduce'});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await page.goto('http://127.0.0.1:4173');await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page, 'data'); await page.getByRole('button',{name:/Back up ROOK/}).click();
 const sheet=page.locator('.data-backup-screen');
 async function shot(name,action){
   if(action)await action.scrollIntoViewIfNeeded();
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
   await page.screenshot({path:`${out}/${width}-standard-${appearance}-${name}.png`,animations:'disabled'});
   // The shared header background intentionally bleeds into the sheet gutter.
   // Check actual copy/actions, not its clipped decorative background extent.
   const overflow=await sheet.evaluate(e=>[...e.querySelectorAll('p,li,h1,.button,.sheet-close')].filter(n=>{const r=n.getBoundingClientRect();return r.right>innerWidth+1||r.left<0;}).map(n=>n.textContent));
   assert.deepEqual(overflow,[]);
   assert.equal(await page.getByRole('button',{name:'Close Back up ROOK'}).isVisible(),true);
   if(action){const box=await action.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=844);}
   await page.screenshot({path:`${out}/${width}-standard-${appearance}-${name}.png`,animations:'disabled'});
 }
 const create=page.getByRole('button',{name:'CREATE BACKUP',exact:true});assert.match(await create.getAttribute('class'),/primary/);
 if(width===390)await shot('initial',create);
 let downloads=0;page.on('download',()=>downloads++);
 await create.click();const save=page.getByRole('button',{name:'SAVE BACKUP',exact:true});await save.waitFor();assert.equal(downloads,0);
 assert.match(await save.getAttribute('class'),/primary/);assert.match(await page.getByRole('button',{name:'CREATE A NEW BACKUP'}).getAttribute('class'),/secondary/);
 await shot('ready',page.getByRole('button',{name:'CREATE A NEW BACKUP'}));
 // Exercise native cancellation and fallback failure without replacing app components or generator.
 await page.evaluate(()=>{window.__saveUrl=URL.createObjectURL;window.__mode='cancel';window.__shares=0;Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{window.__shares++;throw new DOMException('QA handoff',window.__mode==='cancel'?'AbortError':'NotAllowedError');}});});
 await save.click();await save.waitFor();assert.equal(await sheet.locator('[role="alert"]').count(),0);assert.equal(await page.evaluate(()=>window.__shares),1);
 if(width===320){
   await page.evaluate(()=>{window.__mode='error';URL.createObjectURL=()=>{throw new Error('QA download handoff failure');};});
   await save.click();const retry=page.getByRole('button',{name:'TRY AGAIN',exact:true});await retry.waitFor();
   await page.waitForTimeout(350);assert.match(await sheet.locator('[role="alert"]').innerText(),/prepared file is still available/);await shot('handoff-error',page.getByRole('button',{name:'CREATE A NEW BACKUP'}));
   await page.evaluate(()=>{URL.createObjectURL=window.__saveUrl;Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});});
   const downloadPromise=page.waitForEvent('download');await retry.click();await downloadPromise;await page.getByText(/Download started\./).waitFor();assert.equal(downloads,1);
 }
 await page.getByRole('button',{name:'Close Back up ROOK'}).click();await openProfileArea(page, 'data'); await page.getByRole('button',{name:/Back up ROOK/}).click();
 assert.equal(await page.getByRole('button',{name:'SAVE BACKUP',exact:true}).count(),0);await page.getByText(/Preparation does not confirm a saved copy/).waitFor();
 await context.close();
}
console.log('Backup handoff browser QA passed: explicit prepare/save, cancellation, persistent error/retry, real download and reopen. Four actual-app screenshots captured.');
} finally {await browser.close();}
