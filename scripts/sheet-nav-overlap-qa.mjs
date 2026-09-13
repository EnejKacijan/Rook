import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const browser=await chromium.launch({channel: 'chrome',headless:true});
try {
 for(const width of [320,390])for(const reducedMotion of ['reduce','no-preference']) {
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion,serviceWorkers:'block'});
  await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),createReturningUserFixture(1));
  const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');
  await page.getByRole('button',{name:'PROFILE',exact:true}).click();
  await page.locator('[data-profile-area="preferences"]').click();
  const trigger=page.getByRole('button',{name:/Logging & increments/});
  for(const method of ['escape','close']) {
   await trigger.click();const sheet=page.locator('.modal-layer');await sheet.waitFor();
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   assert.equal(await page.locator('.bottom-nav').count(),0);
   const metrics=await page.evaluate(async method=>{
    const sheet=document.querySelector('.modal-layer').firstElementChild;
    if(method==='escape')window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    else sheet.querySelector('[aria-label="Close Logging"]').click();
    await new Promise(requestAnimationFrame);
    const nav=document.querySelector('.bottom-nav');
    window.qaReturningNav=nav;
    return {overlap:!!nav&&sheet.isConnected,animation:nav&&getComputedStyle(nav).animationName,inert:nav?.closest('.app-content').inert,transition:sheet.style.transition};
   },method);
   assert.equal(metrics.overlap,true,'navigation mounts during sheet exit');
   assert.equal(metrics.inert,true,'returning nav cannot receive input until dismissal completes');
   assert.equal(metrics.animation,'none','persistent navigation restores without its own entrance motion');
   await sheet.waitFor({state:'detached'});
   assert.equal(await page.locator('.bottom-nav').evaluate(e=>e===window.qaReturningNav),true,'no second mount/animation after exit');
   assert.equal(await page.locator('.app-content').evaluate(e=>e.inert),false);
   await page.waitForFunction(el=>document.activeElement===el,await trigger.elementHandle());
  }
  console.log(`PASS ${width} ${reducedMotion}: simultaneous exit/entry, no replay, inert and focus`);await context.close();
 }
} finally {await browser.close();}
