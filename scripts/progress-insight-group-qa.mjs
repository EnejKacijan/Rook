import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {loggedExercises} from '../src/loggedExercises.js';
import {recentExerciseProgress,exerciseName} from '../src/domain.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
let passed=0;
try {for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const amount of [0,1,3]) {
 const s=createReturningUserFixture(2),count=amount===1?2:7;
 const exercises=loggedExercises(s.workouts).slice(0,count).map(r=>structuredClone(r.exercise));
 exercises.forEach(e=>{e.loggingMode='standard';e.sets.forEach(x=>Object.assign(x,{weight:90,reps:8,completed:true,setType:'standard'}));});
 const prior={...s.workouts[0],id:'insight-prior',completedAt:'2026-09-07T10:00:00Z',date:'2026-09-07',exercises};
 const latest=structuredClone(prior);Object.assign(latest,{id:'insight-latest',completedAt:'2026-09-08T10:00:00Z',date:'2026-09-08'});
 latest.exercises.slice(0,amount).forEach((e,i)=>e.sets.forEach(x=>Object.assign(x,i===1?{reps:10}:{weight:100})));
 s.workouts=[prior,latest];s.activeWorkout=null;
 Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const improvements=recentExerciseProgress(s.workouts);assert.equal(improvements.length,amount);
 const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');
 await p.getByRole('button',{name:'PROGRESS',exact:true}).click();
 const group=p.locator('.recent-improvements-group'),history=p.locator('.logged-exercises-preview');
 await history.waitFor();assert.equal(await group.count(),amount?1:0);
 assert.equal(await history.locator('.logged-exercise-row').count(),Math.min(6,count));
 if(amount){
  assert.deepEqual(await group.locator('strong').allTextContents(),improvements.slice(0,3).map(i=>exerciseName(i.exercise)));
  const colors=await group.evaluate(e=>{const root=getComputedStyle(document.documentElement);return {surface:getComputedStyle(e).backgroundColor,token:root.getPropertyValue('--rook-surface').trim(),accent:getComputedStyle(e.querySelector('.improvement-delta')).color,name:getComputedStyle(e.querySelector('strong')).color,secondary:getComputedStyle(e.querySelector('small')).color};});
  assert.notEqual(colors.accent,colors.name);assert.notEqual(colors.accent,colors.secondary);
  assert.equal(await history.evaluate(e=>getComputedStyle(e).marginTop),'32px');
 }
 await p.locator(amount?'.recent-improvements-section':'.progress-lower').evaluate(e=>e.scrollIntoView({block:'start'}));
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.screenshot({path:`${out}/progress-insights-${width}-${style}-${appearance}-${amount}.png`});
 const before=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts);
 if(amount){await group.locator('button').first().click();await p.locator('.exercise-performance-insights').waitFor();await p.waitForFunction(()=>document.querySelector('.modal-layer')?.contains(document.activeElement));await p.keyboard.press('Escape');await p.locator('.exercise-performance-insights').waitFor({state:'detached'});}
 await history.getByRole('button',{name:`View all logged exercises (${count})`}).click();
 await p.locator('.logged-exercises-sheet').waitFor();assert.equal(await p.locator('.logged-exercises-sheet .logged-exercise-row').count(),count);
 assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts),before);
 await c.close();passed++;console.log(`PASS ${width} ${style} ${appearance} improvements=${amount} history=${count}`);
}}finally{await browser.close();}
console.log(`${passed} passed / 0 failed`);
