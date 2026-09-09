import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {isoDay,weekday,WEEKDAYS} from '../src/domain.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW';await mkdir(`${out}/traces`,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true}),results=[];
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const s=createReturningUserFixture(3);s.activeWorkout=null;Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const c=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});
 await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));Object.defineProperty(navigator,'standalone',{value:true});},s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');
 for(const scenario of ['history-1','history-2','no-history']){
  if(scenario==='no-history'){
   await p.evaluate(({date,day,days})=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));s.workouts=[];s.program.days.forEach((d,i)=>d.weekday=days[(days.indexOf(day)+i)%7]);s.profile.availableDays=s.program.days.map(d=>d.weekday);s.profile.onboardingComplete=true;s.ai.planUpgradeDismissed=true;s.selectedDate=date;s.selectedDay=day;localStorage.setItem('lift-v2-state',JSON.stringify(s));},{date:isoDay(),day:weekday(),days:WEEKDAYS});await p.reload();await p.getByRole('button',{name:'TODAY',exact:true}).click();await p.locator('.exercise-row-main').first().click();
  }else{await p.getByRole('button',{name:'PROGRESS',exact:true}).click();await p.locator('.logged-exercise-row').nth(scenario==='history-1'?0:1).click();}
  const art=p.locator('.exercise-detail-art-button'),sheet=art.locator('xpath=ancestor::main[1]');await art.waitFor();
  await p.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  for(const action of ['x','x','escape','browser']){
   const before=await art.evaluate(el=>{const sheet=el.closest('main');el.focus({preventScroll:true});sheet.scrollTop=Math.min(80,sheet.scrollHeight-sheet.clientHeight);window.overlayParent=sheet;window.overlayStarts=0;sheet.addEventListener('animationstart',e=>{if(e.target===sheet)window.overlayStarts++;});const r=sheet.getBoundingClientRect();return {scroll:sheet.scrollTop,y:r.y,height:r.height,state:localStorage.getItem('lift-v2-state')};});
   await art.evaluate(el=>el.click());await p.locator('.exercise-visual-viewer').waitFor();assert.ok(await p.evaluate(()=>window.overlayParent.isConnected),'parent remains mounted under viewer');
   if(action==='x')await p.getByRole('button',{name:'Close visual viewer'}).evaluate(el=>el.click());
   else if(action==='escape')await p.keyboard.press('Escape');else await p.goBack();
   await p.locator('.exercise-visual-viewer').waitFor({state:'detached'});
   await p.waitForFunction(()=>document.activeElement?.classList.contains('exercise-detail-art-button'));
   const after=await sheet.evaluate(el=>{const r=el.getBoundingClientRect();return {same:el===window.overlayParent,scroll:el.scrollTop,y:r.y,height:r.height,starts:window.overlayStarts,inert:el.inert,state:localStorage.getItem('lift-v2-state')};});
   assert.ok(after.same);assert.equal(after.scroll,before.scroll);assert.equal(after.y,before.y);assert.equal(after.height,before.height);assert.equal(after.starts,0);assert.equal(after.inert,false);assert.equal(after.state,before.state);
   results.push({width,style,appearance,scenario,action,scroll:after.scroll,result:'PASS'});
  }
  await p.keyboard.press('Escape');await art.waitFor({state:'detached'});
 }
 console.log(`PASS ${width} ${style} ${appearance}: 3 exercises, X/repeat/Escape/browser Back, identity/scroll/geometry/focus`);await c.close();
}}finally{await writeFile(`${out}/traces/illustration-overlay-stability.json`,JSON.stringify(results,null,2));await browser.close();}
