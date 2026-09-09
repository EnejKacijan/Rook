import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState} from '../src/domain.js';
import {openProfileArea} from './qa-current-navigation.mjs';
const out='artifacts/ROOK-IMPORT-CONSISTENCY-AUDIT/amrap-fix';await mkdir(out,{recursive:true});
const b=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390]){
 const s=blankState();s.profile.recommendedWarmupsEnabled=false;s.profile.rirEnabled=false;
 const c=await b.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},s);
 const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');
 await p.locator('.existing-plan-action').click();await p.getByPlaceholder(/Paste your workout notes/).fill(`${new Intl.DateTimeFormat('en',{weekday:'long'}).format(new Date())}\nPull Up 3xAMRAP`);await p.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();await p.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
 assert.equal(await p.locator('.import-resolution').count(),0);assert.ok((await p.locator('.plan-editor').innerText()).includes('3 × AMRAP'));await p.screenshot({path:`${out}/${width}-review.png`});
 await p.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();await p.locator('.bottom-nav').waitFor();await p.reload();await p.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(p,'program');await p.getByRole('button',{name:/Edit plan/}).click();await p.getByRole('heading',{name:'Edit your plan'}).waitFor();await p.locator('.plan-editor-summary').first().click();assert.equal(await p.getByRole('textbox',{name:/Minimum reps/}).inputValue(),'');await p.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await p.locator('.edit-plan-screen').waitFor({state:'detached'});
 const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program.days[0].exercises[0]);assert.equal(saved.repMin,null);assert.deepEqual(saved.sets.map(s=>s.reps),[null,null,null]);
 await p.getByRole('button',{name:'TODAY',exact:true}).click();await p.getByRole('button',{name:'START WORKOUT',exact:true}).click();assert.ok((await p.locator('.workout-screen').innerText()).includes('3 × AMRAP'));
 const reps=p.getByRole('spinbutton',{name:'Reps for set 1',exact:true});await reps.waitFor();assert.equal(await reps.inputValue(),'');await p.screenshot({path:`${out}/${width}-active-empty.png`});await reps.fill('10');await reps.press('Tab');await p.getByRole('button',{name:'Log set 1',exact:true}).click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises[0].sets[0].completed);
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises[0].sets[0].reps),10);await p.screenshot({path:`${out}/${width}-logged.png`});console.log(`PASS ${width}: real import/review/apply/reload/edit/save/start/actual reps`);await c.close();
}}finally{await b.close();}
