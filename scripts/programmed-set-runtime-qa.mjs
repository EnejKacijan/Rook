import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
const out='artifacts/accepted-priority-runtime';await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const paired of [false,true]){
 const state=createReturningUserFixture(2);state.activeWorkout=null;state.ai.planUpgradeDismissed=true;state.profile.avoid='';state.profile.trainingSafety=null;
 const day=state.program.days[0];for(const e of day.exercises.slice(0,2)){e.sets=Array.from({length:3},(_,i)=>({...e.sets[0],id:`qa-${e.id}-${i}`,completed:false}));if(paired){e.supersetId='qa-pair';e.supersetRestSeconds=90;}}
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
 const p=await context.newPage();p.setDefaultTimeout(10000);await p.goto('http://127.0.0.1:4190');
 const stored=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 const initial=await stored();
 async function open(){await p.getByRole('button',{name:'PROFILE',exact:true}).click();await p.locator('[data-profile-area="program"]').click();await openProfileArea(p, 'program'); await p.getByRole('button',{name:/^Edit plan/}).click();await p.locator('.plan-editor-exercise').first().locator('.plan-editor-summary').click();}
 await open();const input=p.getByRole('textbox',{name:/^Sets for/}).first();
 async function save(){const review=p.getByRole('button',{name:'REVIEW CHANGES',exact:true});if(await review.count())await review.click();await p.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await p.locator('.edit-plan-screen').waitFor({state:'detached'});}
 for(const count of [2,4,1]){
  const beforeDraft=(await stored()).program;
  await input.fill(String(count));await input.press('Tab');assert.deepEqual((await stored()).program,beforeDraft,'draft does not persist before Save');
  await save();let s=await stored();assert.equal(s.program.days[0].exercises[0].sets.length,count);assert.deepEqual(s.workouts,initial.workouts,'completed history unchanged');
  if(paired){assert.equal(s.program.days[0].exercises[1].sets.length,count);assert.equal(s.program.days[0].exercises[0].supersetId,s.program.days[0].exercises[1].supersetId);assert.deepEqual(s.program.days[0].exercises.slice(0,2).map(e=>e.id),day.exercises.slice(0,2).map(e=>e.id));assert.equal(s.program.days[0].exercises[1].supersetRestSeconds,90);}
  await p.reload();await open();assert.equal(await input.inputValue(),String(count));results.push({paired,count,persisted:true,historyUnchanged:true});
 }
 for(const invalid of ['','0','-1','abc','1.5','999']){await input.fill(invalid);await input.press('Tab');assert.equal(await input.inputValue(),'1');results.push({paired,invalid,restored:1});}
 const min=p.getByRole('textbox',{name:/^Minimum reps for/}).first(),max=p.getByRole('textbox',{name:/^Maximum reps for/}).first();await min.fill('15');await min.press('Tab');assert.equal(await max.inputValue(),'15');
 await p.screenshot({path:`${out}/sets-${paired?'superset':'normal'}.png`,animations:'disabled'});await save();assert.deepEqual((await stored()).workouts,initial.workouts);assert.equal((await stored()).program.days[0].exercises[0].sets.length,1,'invalid counts never persist');
 results.push({paired,minGreaterThanMax:'max follows min',historyUnchanged:true});await context.close();
}}finally{await browser.close();await writeFile(`${out}/set-count-results.json`,JSON.stringify(results,null,2));}
console.log('Programmed set runtime QA passed');
