import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';

const base=process.env.ROOK_QA_URL||'http://127.0.0.1:4173';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/build-plan-swipe-back/traces';
await mkdir(out,{recursive:true});
// No native-history flags: these two cases deliberately exercise browser-owned
// edge navigation, in contrast with standalone policy emulation in the flow QA.
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const width of [320,390]){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  const page=await context.newPage();let backClicks=0;
  await page.exposeFunction('recordAppBack',()=>backClicks++);
  await context.addInitScript(()=>document.addEventListener('click',event=>{if(/^Back/.test(event.target.closest?.('button')?.getAttribute('aria-label')||''))window.recordAppBack();},true));
  await page.route('**/api/ai/status',route=>route.fulfill({json:{available:false}}));
  await page.goto(`${base}/?native-edge=parent`);await page.goto(`${base}/?native-edge=questionnaire`);
  const b=name=>page.getByRole('button',{name,exact:true});
  await b('BUILD MY PLAN').click();await page.getByRole('combobox',{name:'Age range'}).click();
  await page.getByRole('option',{name:'18–29'}).click();await b('CONTINUE').click();await b('Build muscle').click();
  await page.waitForFunction(()=>document.querySelector('.step-count')?.textContent==='STEP 3/8');
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:3,y:215}]});
  for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:3+width*.7*i/5,y:216}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForURL('**/?native-edge=parent');
  assert.equal(backClicks,0,'native browser history must not also invoke ROOK Back');
  results.push({name:'native-browser',width,backClicks,destination:page.url(),passed:true});await context.close();
 }
 // Regression on the other live-content consumers of the SAME renderer.
 for(const reduced of [false,true]){
  const state=createReturningUserFixture(1);state.activeWorkout=null;state.coachDraft='Unsent draft';
  state.conversations=[{id:'swipe-message',conversationId:'swipe-conversation',user:'Explain my program',reply:{text:'Your program overview.',action:null},createdAt:Date.now()}];
  state.activeCoachConversationId='swipe-conversation';
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
  await context.addInitScript(state=>{localStorage.setItem('lift-v2-state',JSON.stringify(state));Object.defineProperty(navigator,'standalone',{value:true});},state);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>route.fulfill({json:{available:false}}));await page.goto(base);
  await page.getByRole('button',{name:'COACH',exact:true}).click();await page.getByRole('button',{name:'Conversation history'}).click();
  const cdp=await context.newCDPSession(page);
  async function swipe(selector,cancel){
   const target=page.locator(selector);await target.evaluate(async el=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));window.liveSwipeNode=el;window.liveSwipeStyle=el.getAttribute('style');});
   const nav=await page.locator('.bottom-nav').boundingBox(),rect=await target.boundingBox();
   const x=rect.x+3,y=rect.y+180;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let i=1;i<=4;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+180*i/4,y:y+1}]});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const held=await target.evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m41);
   assert.equal(held,reduced?0:180);assert.deepEqual(await page.locator('.bottom-nav').boundingBox(),nav);
   assert.equal(await page.locator('[data-swipe-parent]').count(),0);
   await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
   await page.waitForFunction(()=>!document.documentElement.dataset.edgeBackActive);
   if(cancel)assert.ok(await target.evaluate(e=>e===window.liveSwipeNode&&e.getAttribute('style')===window.liveSwipeStyle),'cancel preserves live node/styles');
   assert.equal(await page.locator('.coach-input textarea').inputValue(),'Unsent draft');
   results.push({name:selector,cancel,reduced,held,passed:true});
  }
  await swipe('.coach-history-surface',true);await swipe('.coach-history-surface',false);
  await page.getByRole('button',{name:'Conversation history'}).click();await page.locator('.coach-history-group button').first().click();
  await page.getByRole('button',{name:'Back to conversation history'}).waitFor();
  await swipe('.coach-content-surface',true);await swipe('.coach-content-surface',false);
  await page.getByRole('button',{name:'Back to Coach'}).waitFor();assert.deepEqual(errors,[]);await context.close();
 }
}finally{await browser.close();await writeFile(`${out}/browser-and-coach-safety.json`,JSON.stringify(results,null,2));}
console.log(`PASS ${results.length} native-browser/Coach shared-renderer checks`);
