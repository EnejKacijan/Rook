import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {openProfileArea} from './qa-current-navigation.mjs';
const phase='interactive-'+(process.env.ROOK_SWIPE_STYLE||'standard');
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW';
await mkdir(`${out}/traces`,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
const results=[];
try {
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
 const state=createReturningUserFixture(3);state.activeWorkout=null;
 Object.assign(state.profile,{appearancePreference:'dark',stylePreference:process.env.ROOK_SWIPE_STYLE||'standard',themePreference:process.env.ROOK_SWIPE_STYLE==='premium'?'premium':'dark'});
 await context.addInitScript(()=>{window.__swipeCommits=0;window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(r){this.renderers.set(1,r);return 1;},onCommitFiberRoot(){window.__swipeCommits++;},onCommitFiberUnmount(){}};});
 await context.addInitScript(state=>{localStorage.setItem('lift-v2-state',JSON.stringify(state));Object.defineProperty(navigator,'standalone',{value:true});},state);
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();
 for(const name of ['preferences','training','editor','nested']){
  if(name==='preferences')await openProfileArea(page,'preferences');
  if(name==='training')await openProfileArea(page,'training');
  if(name==='editor'){await openProfileArea(page,'program');await page.getByRole('button',{name:/^Edit plan/}).click();await page.getByRole('button',{name:'Expand Edit plan to full screen'}).click();}
  if(name==='nested'){await page.getByRole('button',{name:'TODAY',exact:true}).click();await page.getByRole('button',{name:'ADJUST TODAY',exact:true}).click();await page.getByRole('button',{name:/Less time Shorten/}).click();}
  const target=page.locator(['preferences','training'].includes(name)?'.profile-screen':name==='editor'?'.edit-plan-screen':'.adjust-today-sheet');
  await page.waitForFunction(()=>{const now=performance.now();if(window.__quietCommit!==window.__swipeCommits){window.__quietCommit=window.__swipeCommits;window.__quietAt=now;}return now-window.__quietAt>250;});
  const measured=await target.evaluate(async el=>{
   await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));document.activeElement?.blur();getSelection()?.removeAllRanges();
   const r=el.getBoundingClientRect(),before=localStorage.getItem('lift-v2-state');
   const observed=[];const observer=new MutationObserver(records=>observed.push(...records));observer.observe(el,{subtree:true,attributes:true,childList:true});
   const fire=(type,x)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchcancel'?[]:[new Touch({identifier:1,target:el,clientX:x,clientY:r.top+180})]}));
   const commits=window.__swipeCommits;const start=performance.now();fire('touchstart',r.left+4);
   for(let i=1;i<=120;i++)fire('touchmove',r.left+4+i);
   const elapsed=performance.now()-start;
   await new Promise(requestAnimationFrame);
   const held=el.style.transform;await new Promise(resolve=>setTimeout(resolve,220));
   const records=[...observed,...observer.takeRecords()];observer.disconnect();
   const result={moves:120,handlerBurstMs:elapsed,styleMutations:records.filter(r=>r.attributeName==='style').length,treeMutations:records.filter(r=>r.type==='childList').length,transform:el.style.transform,persistenceUnchanged:before===localStorage.getItem('lift-v2-state')};
   Object.assign(result,{heldTransform:held,stationary:held===el.style.transform,reactCommits:window.__swipeCommits-commits});
   fire('touchcancel',r.left+124);return result;
  });
  await page.waitForFunction(()=>!document.documentElement.dataset.edgeBackActive);
  assert.equal(measured.treeMutations,0);assert.equal(measured.reactCommits,0);assert.ok(measured.stationary);assert.ok(measured.persistenceUnchanged);assert.ok(measured.styleMutations<20,'moves coalesced, not per-event style writes');if(name!=='nested')assert.equal(measured.heldTransform,'translate3d(120px, 0px, 0px)');
  results.push({name,...measured});
  if(['preferences','training'].includes(name))await page.getByRole('button',{name:'Back to Profile'}).click();
  if(name==='editor')await page.getByRole('button',{name:'Back to Program'}).click();
 }
 console.log(JSON.stringify({phase,results},null,2));
}finally{await writeFile(`${out}/traces/swipe-back-${phase}.json`,JSON.stringify(results,null,2));await browser.close();}
