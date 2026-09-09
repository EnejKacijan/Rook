import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {buildProgram} from '../src/domain.js';
import {openProfileArea} from './qa-current-navigation.mjs';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW',results=[];
await mkdir(`${out}/screenshots`,{recursive:true});await mkdir(`${out}/traces`,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']){
 const key=`${width}-${style}-${appearance}`,s=createReturningUserFixture(3);s.activeWorkout=null;Object.assign(s.profile,{daysPerWeek:5,availableDays:['Mon','Tue','Wed','Thu','Fri'],stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});s.program=buildProgram(s.profile);s.program.days[0].exercises[0].importedName='Single-Arm Behind-the-Body Cable Lateral Raise';
 const c=await browser.newContext({viewport:{width,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:appearance==='dark'?'reduce':'no-preference'});
 await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));Object.defineProperty(navigator,'standalone',{value:true});window.handleQA={ready:0};},s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await p.route('**/src/App.jsx*',async r=>{const response=await r.fetch();const body=(await response.text()).replace('suppressReorderClickUntil.current = performance.now() + 500;','suppressReorderClickUntil.current = performance.now() + 500; window.handleQA.ready=suppressReorderClickUntil.current;');await r.fulfill({response,body});});
 await p.goto('http://127.0.0.1:4173');await p.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(p,'program');await p.getByRole('button',{name:/Edit plan/}).click();await p.getByRole('heading',{name:'Edit your plan'}).waitFor();await p.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
 const screen=p.locator('.edit-plan-screen'),day=p.locator('[data-reorder-workout-section]').first(),cards=day.locator('.plan-editor-exercise'),ids=()=>cards.evaluateAll(es=>es.map(e=>e.id)),ready=()=>p.waitForFunction(()=>performance.now()>=window.handleQA.ready);
 const snap=async name=>{await p.evaluate(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});await p.screenshot({path:`${out}/screenshots/exercise-handle-${key}-${name}.png`});};
 const original=await ids(),originalState=await p.evaluate(()=>localStorage.getItem('lift-v2-state'));
 assert.equal(await day.locator('.plan-exercise-drag-handle').count(),original.length);
 assert.equal(await day.locator('.plan-editor-summary[data-reorder-kind]').count(),0);
 for(const handle of await day.locator('.plan-exercise-drag-handle').all()){const r=await handle.boundingBox();assert.ok(r.width>=44&&r.height>=44);assert.match(await handle.getAttribute('aria-label'),/^Move .+/);}
 await cards.first().scrollIntoViewIfNeeded();await snap('sheet');await p.getByRole('button',{name:'Expand Edit plan to full screen'}).click();
 // Tapping EDIT opens, rather than reorders, including a long exercise name.
 await cards.first().locator('.plan-editor-summary').tap();assert.equal(await cards.first().locator('.plan-editor-summary').getAttribute('aria-expanded'),'true');assert.equal(await p.locator('.plan-reorder-preview').count(),0);
 await day.getByRole('textbox',{name:/^Sets for/}).fill('4');await p.keyboard.press('Tab');await snap('expanded');
 const cdp=await c.newCDPSession(p);
 // The dedicated touch handle activates without the old long-press timer.
 const handle=cards.first().locator('.plan-exercise-drag-handle');await handle.scrollIntoViewIfNeeded();let r=await handle.boundingBox();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+22,y:r.y+22}]});await p.locator('.plan-reorder-preview').waitFor();await snap('touch-active');await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await p.locator('.plan-reorder-preview').waitFor({state:'detached'});await ready();assert.deepEqual(await ids(),original);
 // Native vertical touch scrolling on the card body must not activate reorder.
 await cards.first().evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));r=await cards.first().locator('.plan-editor-summary').boundingBox();const beforeScroll=await screen.evaluate(e=>{window.handleQA.scrollEnded=false;e.addEventListener('scrollend',()=>{window.handleQA.scrollEnded=true;},{once:true});return e.scrollTop;});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+70,y:r.y+30}]});for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+70,y:r.y+30-step*15}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await p.locator('.plan-reorder-preview').count(),0);await p.waitForFunction(before=>document.querySelector('.edit-plan-screen').scrollTop>before+10,beforeScroll);
 const movements=[];
 await p.waitForFunction(()=>window.handleQA.scrollEnded);
 for(const [from,to] of [[0,2],[2,5],[5,0],[0,3]]){
  // Position the six-card fixture in the usable scroll area; no timer-based waits.
  await screen.evaluate(e=>{e.scrollTop+=e.querySelector('.plan-editor-exercise').getBoundingClientRect().top-130;});
  const before=await ids(),grip=cards.nth(from).locator('.plan-exercise-drag-handle');r=await grip.boundingBox();const start=r.y+r.height/2;
  await p.mouse.move(r.x+22,start);await p.mouse.down();await p.mouse.move(r.x+22,start+6);await p.locator('.plan-reorder-preview').waitFor();
  const target=await cards.evaluateAll((es,{from,to,start})=>{
   const boxes=es.map(e=>{const r=e.getBoundingClientRect(),m=new DOMMatrixReadOnly(getComputedStyle(e).transform);return {top:r.top-m.m42,height:r.height};});
   const source=boxes[from],remaining=boxes.filter((_,i)=>i!==from).map(b=>b.top+b.height/2-(b.top>source.top?source.height:0));
   const center=to===0?remaining[0]-20:to===remaining.length?remaining.at(-1)+20:(remaining[to-1]+remaining[to])/2;
   return start+center-source.top-source.height/2;
  },{from,to,start});
  await p.mouse.move(r.x+22,target,{steps:12});await snap(`drag-${from}-${to}`);await p.mouse.up();await p.locator('.plan-reorder-preview').waitFor({state:'detached'});await ready();
  const expected=[...before];expected.splice(to,0,expected.splice(from,1)[0]);assert.deepEqual(await ids(),expected);movements.push({from,to});assert.equal(await screen.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
 }
 // Keyboard support is now discoverable on the handle as well as retained controls.
 const beforeKeys=await ids();await cards.nth(1).locator('.plan-exercise-drag-handle').focus();await p.keyboard.press('Alt+ArrowUp');await p.waitForFunction(id=>document.querySelector('.plan-editor-exercise').id===id,beforeKeys[1]);
 const expected=await ids();assert.equal(await p.evaluate(()=>localStorage.getItem('lift-v2-state')),originalState);
 await screen.evaluate(e=>e.scrollTop+=e.querySelector('.plan-editor-exercise').getBoundingClientRect().top-140);await snap('restored');
 await p.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await screen.waitFor({state:'detached'});await p.waitForFunction(expected=>JSON.stringify(JSON.parse(localStorage.getItem('lift-v2-state')).program.days[0].exercises.map(e=>`import-exercise-${e.id}`))===JSON.stringify(expected),expected);await p.reload();
 const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.deepEqual(saved.program.days[0].exercises.map(e=>`import-exercise-${e.id}`),expected);assert.equal(saved.program.days[0].exercises.find(e=>`import-exercise-${e.id}`===original[0]).sets.length,4);assert.deepEqual(saved.workouts,JSON.parse(JSON.stringify(s.workouts)));
 results.push({key,passed:true,movements,touchActivation:true,bodyScroll:true,keyboard:true,saveReload:true});console.log(`PASS ${key}`);await c.close();
}}finally{await browser.close();await writeFile(`${out}/traces/exercise-handle-results.json`,JSON.stringify(results,null,2));}
