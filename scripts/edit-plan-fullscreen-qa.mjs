import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {buildProgram} from '../src/domain.js';
import {openProfileArea} from './qa-current-navigation.mjs';

const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW';
await mkdir(`${out}/screenshots`,{recursive:true});
await mkdir(`${out}/traces`,{recursive:true});
const results=[];
const browser=await chromium.launch({channel: 'chrome',headless:true});
try {
for(const width of [320,390]) for(const style of ['standard','premium']) for(const appearance of ['light','dark']) {
 const key=`${width}-${style}-${appearance}`;
 const s=createReturningUserFixture(3);s.activeWorkout=null;
 Object.assign(s.profile,{daysPerWeek:5,availableDays:['Mon','Tue','Wed','Thu','Fri'],stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});s.program=buildProgram(s.profile);
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:appearance==='dark'?'reduce':'no-preference'});
 await context.addInitScript(s=>{
  if(!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state',JSON.stringify(s));
  window.editorQA={initializations:0,writes:0};
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')window.editorQA.writes++;return original.call(this,k,v);};
 },s);
 const p=await context.newPage();
 await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await p.route('**/src/App.jsx*',async r=>{const response=await r.fetch();const body=(await response.text()).replace('const withWarmupPreference = (value) => {','const withWarmupPreference = (value) => { window.editorQA.initializations++;').replace('suppressReorderClickUntil.current = performance.now() + 500;', 'suppressReorderClickUntil.current = performance.now() + 500; window.editorQA.clickReadyAt = suppressReorderClickUntil.current;');await r.fulfill({response,body});});
 const settle=()=>p.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
 const open=async()=>{await p.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(p,'program');await p.getByRole('button',{name:/Edit plan/}).click();await p.getByRole('heading',{name:'Edit your plan'}).waitFor();await settle();};
 const snap=state=>p.screenshot({path:`${out}/screenshots/edit-plan-fullscreen-${key}-${state}.png`});
 await p.goto('http://127.0.0.1:4173');await open();
 const screen=p.locator('.edit-plan-screen'),days=p.locator('[data-reorder-workout-section]'),day=days.first();
 await snap('sheet');
 const sheetHeight=(await screen.boundingBox()).height;
 await day.getByRole('textbox',{name:/workout name/}).fill('Edited full-screen workout');
 await day.locator('.plan-editor-summary').first().click();
 const sets=day.getByRole('textbox',{name:/^Sets for/});await sets.fill('4');await sets.press('Tab');
 await p.evaluate(()=>{window.editorQA.writes=0;window.editorQA.node=document.querySelector('.plan-editor');window.editorQA.exercise=document.querySelector('.plan-editor-exercise');window.editorQA.scroll=document.querySelector('.edit-plan-screen').scrollTop;});
 const init=await p.evaluate(()=>window.editorQA.initializations);assert.ok(init>0); // Dev StrictMode may initialize twice.
 // Keyboard activation of the sticky header must not scroll the draft to the top.
 await p.getByRole('button',{name:'Expand Edit plan to full screen'}).evaluate(e=>e.focus({preventScroll:true}));await p.keyboard.press('Enter');
 await p.locator('.edit-plan-page-layer').waitFor();
 assert.equal(await sets.inputValue(),'4');assert.equal(await day.getByRole('textbox',{name:/workout name/}).inputValue(),'Edited full-screen workout');
 const preserved=await p.evaluate(()=>({sameEditor:window.editorQA.node===document.querySelector('.plan-editor'),sameExercise:window.editorQA.exercise===document.querySelector('.plan-editor-exercise'),scrollDelta:document.querySelector('.edit-plan-screen').scrollTop-window.editorQA.scroll,initializations:window.editorQA.initializations,writes:window.editorQA.writes}));
 assert.ok(preserved.sameEditor&&preserved.sameExercise);assert.equal(preserved.initializations,init);assert.equal(preserved.writes,0);assert.ok(Math.abs(preserved.scrollDelta)<4);
 assert.equal(await p.locator('.modal-drag-handle').count(),0);assert.equal(await p.getByRole('button',{name:'Close edit plan',exact:true}).count(),0);assert.equal(await p.getByRole('button',{name:'Back',exact:true}).count(),0);
 assert.equal(await p.getByRole('button',{name:'Back to Program'}).evaluate(e=>e===document.activeElement),true);
 const fullHeight=(await screen.boundingBox()).height;assert.equal(fullHeight,844);assert.ok(fullHeight>sheetHeight);
 const footer=p.getByRole('button',{name:'SAVE CHANGES',exact:true});
 const checkFrame=async()=>{const h=await p.locator('.edit-plan-screen>.detail-header').boundingBox(),b=await footer.boundingBox();assert.ok(h.y>=0&&h.y<2);assert.ok(b.y>=h.y+h.height&&b.y+b.height<=p.viewportSize().height+1);assert.equal(await screen.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);};
 await snap('expanded');await checkFrame();await screen.evaluate(e=>e.scrollTop=0);await snap('top');
 await day.locator('.plan-warmup-card-header button').click();await day.getByLabel('Warm-up movement 1',{exact:true}).fill('Full-screen preparation');
 await day.locator('.plan-editor-summary').first().click(); // collapse before exercise drag
 const ids=()=>day.locator('.plan-editor-exercise').evaluateAll(es=>es.map(e=>e.id));const before=await ids();
 const source=day.locator('.plan-exercise-drag-handle').first();await source.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));const r=await source.boundingBox();
 await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2,r.y+r.height/2+6);await p.locator('.plan-reorder-preview').waitFor();await p.mouse.move(r.x+r.width/2,Math.min(680,r.y+240),{steps:12});await snap('reorder');await p.mouse.up();await p.locator('.plan-reorder-preview').waitFor({state:'detached'});
 assert.deepEqual((await ids()).slice().sort(),before.slice().sort());
 await p.waitForFunction(()=>performance.now()>=(window.editorQA.clickReadyAt||0));
 // Deterministic keyboard movement complements the actual pointer drag.
 const movedFirst=(await ids())[0];await day.locator('.exercise-reorder-a11y').first().getByRole('button',{name:'MOVE LAST',exact:true}).focus();await p.keyboard.press('Enter');
 await p.waitForFunction(id=>[...document.querySelector('[data-reorder-workout-section]').querySelectorAll('.plan-editor-exercise')].at(-1).id===id,movedFirst);
 const expected=await ids();
 const firstSummary=day.locator('.plan-editor-summary').first();if(await firstSummary.getAttribute('aria-expanded')!=='true')await firstSummary.click();await settle();await snap('middle');await checkFrame();
 const picker=day.locator('.plan-editor-picker-trigger');await picker.click();await day.getByRole('searchbox').fill('Press');assert.ok(await day.getByRole('listbox',{name:'Available exercises'}).isVisible());await picker.click();
 // Reduced viewport is a browser layout proxy, not an iOS keyboard certification.
 await p.setViewportSize({width,height:480});const input=day.getByRole('textbox',{name:/^Sets for/});await input.focus();await checkFrame();
 await p.waitForFunction(()=>{const r=document.activeElement.getBoundingClientRect(),h=document.querySelector('.edit-plan-screen>.detail-header').getBoundingClientRect(),f=document.querySelector('.edit-plan-screen .sheet-action-footer').getBoundingClientRect();return r.top>=h.bottom&&r.bottom<=f.top;});
 await p.setViewportSize({width,height:844});
 assert.equal(await p.evaluate(()=>window.editorQA.writes),0);
 await screen.evaluate(e=>e.scrollTop=e.scrollHeight);await snap('footer');await checkFrame();
 await footer.click();await screen.waitFor({state:'detached'});
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program.days[0].workoutName==='Edited full-screen workout');
 await p.reload();await open();
 assert.deepEqual(await ids(),expected);assert.equal(await day.getByRole('textbox',{name:/workout name/}).inputValue(),'Edited full-screen workout');
 const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 assert.deepEqual(saved.workouts,JSON.parse(JSON.stringify(s.workouts)));
 assert.equal(saved.program.days[0].exercises.find(e=>`import-exercise-${e.id}`===before[0]).sets.length,4);
 await day.locator('.plan-warmup-card-header button').click();assert.equal(await day.getByLabel('Warm-up movement 1',{exact:true}).inputValue(),'Full-screen preparation');
 await day.getByRole('textbox',{name:/workout name/}).fill('Discard me');await p.getByRole('button',{name:'Expand Edit plan to full screen'}).click();await p.getByRole('button',{name:'Back to Program'}).click();await screen.waitFor({state:'detached'});
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program.days[0].workoutName),'Edited full-screen workout');
 await p.waitForFunction(()=>document.activeElement?.textContent.includes('Edit plan'));
 await open();await p.getByRole('button',{name:'Expand Edit plan to full screen'}).click();await p.keyboard.press('Escape');await screen.waitFor({state:'detached'});
 results.push({key,passed:true,sheetHeight,fullHeight,...preserved});console.log(`PASS ${key}`);await context.close();
}
} finally {await browser.close();await writeFile(`${out}/traces/edit-plan-fullscreen-results.json`,JSON.stringify(results,null,2));}
