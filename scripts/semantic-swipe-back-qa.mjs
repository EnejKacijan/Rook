import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,weekday,isoDay,WEEKDAYS} from '../src/domain.js';
import {openProfileArea,openAdjustWeek} from './qa-current-navigation.mjs';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW';await mkdir(`${out}/screenshots`,{recursive:true});const results=[];
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const state=blankState(),day=weekday();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:[day,WEEKDAYS[(WEEKDAYS.indexOf(day)+2)%7],WEEKDAYS[(WEEKDAYS.indexOf(day)+4)%7]],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});state.program=buildProgram(state.profile);state.selectedDate=isoDay();state.selectedDay=day;
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:appearance==='dark'?'reduce':'no-preference'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));Object.defineProperty(navigator,'standalone',{value:true,configurable:true});},state);
 await context.addInitScript(()=>{window.__swipeCommits=0;window.__swipeRenderers=0;window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,renderers:new Map(),inject(renderer){const id=++window.__swipeRenderers;this.renderers.set(id,renderer);return id;},onCommitFiberRoot(){window.__swipeCommits++;},onCommitFiberUnmount(){}};});
 const page=await context.newPage();page.setDefaultTimeout(8000);await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');const cdp=await context.newCDPSession(page);const key=`${width}-${style}-${appearance}`;
 const swipe=async(surface,{dx=width*.55,dy=0,shot=false}={})=>{
  const r=await surface.boundingBox();const x=r.x+5,y=r.y+Math.min(180,r.height/2);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/6,y:y+dy*i/6}]});await page.waitForTimeout(20);}
  if(shot)await page.screenshot({path:`${out}/screenshots/swipe-${key}-drag.png`});
  await page.waitForTimeout(120);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>!document.documentElement.dataset.edgeBackActive);
 };
 await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page,'preferences');
 await page.evaluate(()=>history.pushState({swipeQA:true},'', '?swipe-back-qa'));
 const historyLength=await page.evaluate(()=>history.length);
 const profile=page.getByRole('button',{name:'Back to Profile'}).locator('xpath=ancestor::main[1]');
 await profile.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
 const heldBounds=await profile.boundingBox();const hx=heldBounds.x+5,hy=heldBounds.y+180;
 const commitsBefore=await page.evaluate(()=>window.__swipeCommits);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:hx,y:hy}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:hx+width*.5,y:hy}]});
 await page.waitForTimeout(80);
 const held=await profile.evaluate(el=>getComputedStyle(el).transform);
 await page.waitForTimeout(220);
 assert.equal(await profile.evaluate(el=>getComputedStyle(el).transform),held,'stationary finger never drifts or auto-commits');
 assert.equal(await page.evaluate(()=>window.__swipeCommits),commitsBefore,'zero React commits during held drag');
 assert.ok(await page.evaluate(()=>window.__swipeRenderers>0),'React commit probe attached');
 if(appearance==='light'){assert.ok(held.includes(String(width*.5)),'page follows half-width drag');assert.equal(await page.locator('[data-swipe-parent]').count(),1);}else assert.equal(held,'none');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await page.waitForFunction(()=>!document.documentElement.dataset.edgeBackActive);
 assert.equal(await page.locator('[data-swipe-parent]').count(),0);
 assert.ok(await page.getByRole('button',{name:'Back to Profile'}).isVisible());
 await swipe(profile,{dx:25});assert.ok(await page.getByRole('button',{name:'Back to Profile'}).isVisible());
 await swipe(profile,{dx:15,dy:100});assert.ok(await page.getByRole('button',{name:'Back to Profile'}).isVisible());
 await page.evaluate(()=>Object.defineProperty(navigator,'standalone',{value:false,configurable:true}));await swipe(profile);assert.ok(await page.getByRole('button',{name:'Back to Profile'}).isVisible());await page.evaluate(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
 const nav=await page.locator('.bottom-nav').boundingBox();await swipe(profile,{shot:true});await page.locator('[data-profile-area="preferences"]').waitFor();assert.deepEqual(await page.locator('.bottom-nav').boundingBox(),nav);
 assert.equal(await page.evaluate(()=>history.length),historyLength,'swipe adds no history entries');
 await page.goBack();assert.ok(await page.locator('[data-profile-area="preferences"]').isVisible(),'browser Back does not repeat app Back');
 for(const [area,child,close] of [['preferences','Logging & increments','Close Logging'],['training','Training priorities','Close training priorities']]){
  await openProfileArea(page,area);await page.getByRole('button',{name:new RegExp(child,'i')}).click();
  const sheet=page.locator('.modal-layer > main');await sheet.waitFor();await swipe(sheet);assert.ok(await page.getByRole('button',{name:close,exact:true}).isVisible(),'close-only child is not swipe dismissible');await page.getByRole('button',{name:close,exact:true}).click();
  await swipe(page.getByRole('button',{name:'Back to Profile'}).locator('xpath=ancestor::main[1]'));await page.locator(`[data-profile-area="${area}"]`).waitFor();
 }
 await openProfileArea(page,'program');await page.getByRole('button',{name:/^Edit plan/}).click();await page.getByRole('button',{name:'Expand Edit plan to full screen'}).click();await page.locator('.plan-editor-summary').first().click();const sets=page.getByRole('textbox',{name:/^Sets for/}).first();await sets.fill('2');await sets.press('Tab');
 await sets.evaluate(()=>{document.activeElement.blur();getSelection()?.removeAllRanges();});
 let prompted=false;page.once('dialog',async d=>{prompted=true;await d.dismiss();});await swipe(page.locator('.edit-plan-screen'));assert.ok(prompted,'dirty Back guard');assert.equal(await sets.inputValue(),'2');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Back to Program'}).click();await page.locator('.edit-plan-screen').waitFor({state:'detached'});
 await page.getByRole('button',{name:'TODAY',exact:true}).click();await openAdjustWeek(page);await page.getByRole('button',{name:/My available days changed/}).click();await swipe(page.locator('.flexible-week-sheet'));assert.equal(await page.locator('.flexible-week-sheet h1').innerText(),'What changed?');await page.getByRole('button',{name:'Close Adjust week',exact:true}).click();
 await page.getByRole('button',{name:'ADJUST TODAY',exact:true}).click();await page.getByRole('button',{name:/Less time Shorten/}).click();await swipe(page.locator('.adjust-today-sheet'));assert.equal(await page.locator('.adjust-today-sheet h1').innerText(),'What changed today?');
 results.push({key,result:'PASS'});console.log('PASS',key);await context.close();
}}finally{await writeFile(`${out}/swipe-back-results.json`,JSON.stringify(results,null,2));await browser.close();}
