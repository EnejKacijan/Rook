import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,weekday,isoDay,WEEKDAYS} from '../src/domain.js';
const out='artifacts/release-regression';await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const imported of [false,true]){
 const s=blankState(),today=weekday();Object.assign(s.profile,{onboardingComplete:true,goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:[today,WEEKDAYS[(WEEKDAYS.indexOf(today)+3)%7]],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],warmupEnabled:false});
 s.program=buildProgram(s.profile);s.program.source=imported?'ai-import':'generated';s.selectedDate=isoDay();s.selectedDay=today;s.ai.planUpgradeDismissed=true;
 const day=s.program.days.find(d=>d.weekday===today);const pair=day.exercises.slice(0,2);pair.forEach(e=>{e.supersetId='qa-pair';e.supersetRestSeconds=60;});
 const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});await c.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},s);
 const p=await c.newPage();p.setDefaultTimeout(10000);await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4190');
 const read=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 async function open(){await p.getByRole('button',{name:'PROFILE',exact:true}).click();await p.locator('[data-profile-area="program"]').click();await openProfileArea(p, 'program'); await p.getByRole('button',{name:/^Edit plan/}).click();await p.locator('.plan-editor-exercise').first().locator('.plan-editor-summary').click();}
 await open();const input=p.getByRole('textbox',{name:/^Sets for/}).first(),limit=imported?20:6;
 await input.fill(String(limit));await input.press('Tab');assert.equal(await input.inputValue(),String(limit));await input.fill(String(limit+1));await input.press('Tab');assert.equal(await input.inputValue(),String(limit));
 await p.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await p.locator('.edit-plan-screen').waitFor({state:'detached'});await p.reload();await open();assert.equal(await input.inputValue(),String(limit));results.push({imported,accepted:limit,rejected:limit+1,persisted:true});
 await input.fill('2');await input.press('Tab');await p.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await p.locator('.edit-plan-screen').waitFor({state:'detached'});await p.reload();
 await p.getByRole('button',{name:'START WORKOUT',exact:true}).click();await p.locator('.workout-screen').waitFor();
 let active=(await read()).activeWorkout;assert.equal(active.exercises[0].supersetId,active.exercises[1].supersetId);assert.equal(active.exercises[0].sets.length,2);assert.equal(active.exercises[1].sets.length,2);
 for(const expected of [1,0]){
  const row=p.locator('.set-row').filter({has:p.getByRole('button',{name:/^Log set/})}).first();
  const weights=row.locator('input');for(let i=0;i<await weights.count();i++){if(!(await weights.nth(i).inputValue()))await weights.nth(i).fill('8');}
  await row.getByRole('button',{name:/^Log set/}).click();
  await p.waitForFunction(index=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exerciseIndex===index,expected);
 }
 results.push({imported,liveOrder:'A1 → A2 → A1',pairedSets:2});await c.close();
}}finally{await browser.close();await writeFile(`${out}/set-boundaries.json`,JSON.stringify(results,null,2));}
console.log('Set boundaries and live superset passed');
