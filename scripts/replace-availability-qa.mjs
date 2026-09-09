import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { startWorkout, isoDay, weekday } from '../src/domain.js';

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 for(const [logged,rest] of [[0,false],[0,true],[1,true],[1,false],[3,false]]){
  const state=createReturningUserFixture(2),day=state.program.days.find(day=>day.weekday===weekday())||state.program.days[0];
  Object.assign(state.profile,{restTimerEnabled:true,restTimerAutoStart:true,restTimerSeconds:120});
  state.selectedDate=isoDay();state.selectedDay=day.weekday;state.activeWorkout=startWorkout(state,day);state.activeWorkout.warmup=null;
  const exercise=state.activeWorkout.exercises[0];delete exercise.supersetId;
  exercise.sets=Array.from({length:3},(_,index)=>({...exercise.sets[0],id:`qa-set-${index}`,weight:50,reps:8,rir:1,completed:index<logged,...(index<logged?{completedAt:Date.now()-5000}:{})}));
  state.activeWorkout.rest=rest?{seconds:120,endsAt:Date.now()+120000}:null;
  const context=await browser.newContext({viewport:{width:320,height:844},serviceWorkers:'block'});
  await context.addInitScript(value=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(value));},state);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/ai/status',route=>route.fulfill({json:{available:false}}));
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});await page.getByRole('button',{name:'RESUME WORKOUT'}).click();
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  const original=await stored(),replace=page.getByRole('button',{name:'Replace',exact:true});
  assert.equal(await replace.isDisabled(),logged>0,`${logged}/3, rest=${rest}: lock depends on logged sets only`);
  if(logged===0){await replace.click();await page.getByRole('dialog',{name:/Replace /}).waitFor();await page.locator('.replace-sheet .sheet-close').click();assert.deepEqual((await stored()).activeWorkout.exercises,original.activeWorkout.exercises);}
  if(rest){await page.locator('.rest-timer').getByRole('button',{name:'SKIP',exact:true}).click();assert.equal((await stored()).activeWorkout.rest,null);assert.equal(await replace.isDisabled(),logged>0,'skipping rest does not change replacement eligibility');}
  if(logged===0&&!rest){await page.getByRole('button',{name:'Log set 1',exact:true}).click();assert.equal(await replace.isDisabled(),true);assert.ok((await stored()).activeWorkout.rest.endsAt>Date.now(),'real logging starts rest');}
  const beforeNavigation=await stored();
  await page.locator('.up-next button').first().click();await page.getByRole('button',{name:'← PREVIOUS EXERCISE',exact:true}).click();
  assert.deepEqual((await stored()).activeWorkout.exercises,beforeNavigation.activeWorkout.exercises,'return preserves exercise identities and every set');
  assert.deepEqual((await stored()).workouts,original.workouts,'existing History is unchanged');
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'RESUME WORKOUT'}).click();
  assert.deepEqual((await stored()).activeWorkout.exercises,beforeNavigation.activeWorkout.exercises,'reload preserves original exercise ownership');
  assert.deepEqual(errors,[]);await context.close();console.log(`${logged}/3 logged, rest=${rest}: replacement gate, rest skip, navigation and history integrity passed`);
 }
} finally {await browser.close();}
