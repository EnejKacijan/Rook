import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {startWorkout,isoDay} from '../src/domain.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const reducedMotion of ['reduce','no-preference']){
 const s=createReturningUserFixture(1);s.selectedDate=isoDay();s.profile.rirEnabled=true;s.activeWorkout=startWorkout(s,s.program.days[0]);s.activeWorkout.exercises[0].importedName='Single-Arm Behind-the-Body Cable Lateral Raise';
 const c=await browser.newContext({viewport:{width,height:600},hasTouch:true,serviceWorkers:'block',reducedMotion});await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');await p.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
 await p.locator('.workout-warmup-toggle').click();await p.locator('.workout-warmup.open').waitFor();
 const trigger=p.getByRole('button',{name:'What is RIR?',exact:true});await trigger.scrollIntoViewIfNeeded();
 const before=await p.evaluate(()=>localStorage.getItem('lift-v2-state'));
 // Touch compatibility clicks retain contact coordinates while expanded content
 // may still move. Reproduce that transition deterministically, without sleeps.
 await trigger.evaluate(e=>{const r=e.getBoundingClientRect();const init={bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2};e.dispatchEvent(new PointerEvent('pointerdown',{...init,pointerType:'touch'}));window.scrollBy(0,24);e.dispatchEvent(new MouseEvent('click',{...init,detail:1}));});
 assert.equal(await trigger.getAttribute('aria-expanded'),'true','RIR opens with warm-up expanded');
 await p.getByRole('tooltip').waitFor();await p.screenshot({path:`${out}/rir-warmup-${width}-${reducedMotion}.png`});await p.keyboard.press('Escape');await p.getByRole('tooltip').waitFor({state:'detached'});
 for(const action of ['tap','click']){await trigger[action]();await p.getByRole('tooltip').waitFor();await p.keyboard.press('Escape');await p.getByRole('tooltip').waitFor({state:'detached'});}
 await trigger.focus();await p.keyboard.press('Enter');await p.getByRole('tooltip').waitFor();await p.keyboard.press('Escape');
 await trigger.evaluate(e=>{const r=e.getBoundingClientRect(),init={bubbles:true,clientX:r.left+1,clientY:r.top+1};e.dispatchEvent(new PointerEvent('pointerdown',init));e.dispatchEvent(new MouseEvent('click',{...init,detail:1}));});assert.equal(await trigger.getAttribute('aria-expanded'),'false','outside circle remains noninteractive');
 await trigger.evaluate(e=>{const r=e.getBoundingClientRect(),init={bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2};e.dispatchEvent(new PointerEvent('pointerdown',init));e.dispatchEvent(new PointerEvent('pointercancel',init));e.dispatchEvent(new MouseEvent('click',{...init,detail:1}));});assert.equal(await trigger.getAttribute('aria-expanded'),'false','cancelled gesture does not open help');
 assert.equal(await p.evaluate(()=>localStorage.getItem('lift-v2-state')),before,'help does not change workout data');
 assert.equal(await p.locator('.workout-warmup.open').count(),1);await c.close();console.log(`PASS ${width} ${reducedMotion}`);
}}finally{await browser.close();}
