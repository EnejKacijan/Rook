import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {startWorkout,isoDay} from '../src/domain.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const long of [false,true]){
 const s=createReturningUserFixture(1);s.selectedDate=isoDay();s.activeWorkout=startWorkout(s,s.program.days[0]);
 if(long)s.activeWorkout.exercises[0].importedName='Single-Arm Behind-the-Body Cable Lateral Raise';
 Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');
 await p.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();await p.locator('.exercise-heading h1').waitFor();
 const header=p.locator('.exercise-heading');
 assert.match(await header.locator('.eyebrow').innerText(),/^EXERCISE 1 OF \d+$/);
 assert.equal(await header.locator('.exercise-note-button svg').count(),0);
 assert.equal(await header.locator('.exercise-note-button').count(),0);
 const geometry=await header.evaluate(e=>{const a=e.querySelector('.eyebrow'),r=document.createRange();r.selectNodeContents(a);const lines=[...r.getClientRects()];return {lines:lines.length,overflow:document.documentElement.scrollWidth>innerWidth,titleTop:e.querySelector('h1').getBoundingClientRect().top,topBottom:e.querySelector('.exercise-heading-topline').getBoundingClientRect().bottom,buttons:[...e.querySelectorAll('.workout-exercise-actions button')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,right:r.right,w:r.width,h:r.height};})};});
 assert.equal(geometry.lines,1);assert.equal(geometry.overflow,false);assert.ok(geometry.titleTop>=geometry.topBottom);assert.ok(geometry.buttons.every(b=>b.x>=0&&b.right<=width&&b.w>=28&&b.h>=28));
 await p.screenshot({path:`${out}/active-header-${width}-${style}-${appearance}-${long?'long':'normal'}.png`});
 for(const selector of ['.exercise-options-button','.workout-exercise-actions .text-button']){
  await header.locator(selector).click();await p.locator('.modal-layer').waitFor();await p.keyboard.press('Escape');await p.locator('.modal-layer').waitFor({state:'detached'});
 }
 console.log(`PASS ${width} ${style} ${appearance} long=${long}`);await c.close();
}}finally{await browser.close();}
