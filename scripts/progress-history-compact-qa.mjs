import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {loggedExercises} from '../src/loggedExercises.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const count of [2,4,7]){
 const s=createReturningUserFixture(2),examples=loggedExercises(s.workouts).slice(0,count).map(r=>structuredClone(r.exercise));
 examples[0].importedName='Single-Arm Behind-the-Body Cable Lateral Raise';examples[0].sets.forEach(x=>Object.assign(x,{weight:140,reps:8,completed:true}));
 examples[1].exerciseId='pull-up';examples[1].importedName=null;examples[1].sets.forEach(x=>Object.assign(x,{weight:null,reps:8,completed:true}));
 s.workouts=[{...s.workouts[0],exercises:examples}];s.activeWorkout=null;
 Object.assign(s.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
 const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');await p.getByRole('button',{name:'PROGRESS',exact:true}).click();
 const preview=p.locator('.logged-exercises-preview'),rows=preview.locator('.logged-exercise-row');await preview.scrollIntoViewIfNeeded();assert.equal(await rows.count(),Math.min(6,count));
 assert.match(await rows.nth(0).locator('small').innerText(),/ · Highest load 140 kg$/);assert.match(await rows.nth(1).locator('small').innerText(),/ · Bodyweight$/);
 for(const row of await rows.all()){assert.equal(await row.locator('small').count(),1);assert.equal(await row.locator('small').evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);return r.getClientRects().length;}),1);}
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const names=await rows.locator('strong').allTextContents();const before=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts);
 await p.screenshot({path:`${out}/progress-history-${width}-${style}-${appearance}-${count}.png`});
 await preview.getByRole('button',{name:`View all logged exercises (${count})`}).click();const all=p.locator('.logged-exercises-sheet');await all.waitFor();assert.equal(await all.locator('.logged-exercise-row').count(),count);assert.deepEqual((await all.locator('.logged-exercise-row strong').allTextContents()).slice(0,6),names);
 assert.match(await all.locator('.logged-exercise-row').first().innerText(),/Latest logged session/);await all.locator('.logged-exercise-row').first().click();await p.getByRole('button',{name:'Back',exact:true}).click();await all.waitFor();assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts),before);
 console.log(`PASS ${width} ${style} ${appearance} count=${count}`);await c.close();
}}finally{await browser.close();}
