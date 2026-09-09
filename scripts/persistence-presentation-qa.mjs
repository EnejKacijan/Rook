import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, startWorkout, completeWorkout, weekday, isoDay, WEEKDAYS } from '../src/domain.js';

const out='artifacts/persistence-presentation';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
function fixture(theme,kind){
 const s=blankState(),today=weekday();
 Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:4,availableDays:[today,...WEEKDAYS.filter(d=>d!==today).slice(0,3)],sessionMinutes:90,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true,appearancePreference:theme,stylePreference:'standard',themePreference:theme});
 s.program=buildProgram(s.profile);s.selectedDay=today;s.selectedDate=isoDay();s.ai.planUpgradeDismissed=true;
 if(kind!=='adjust'){
  s.activeWorkout=startWorkout(s,s.program.days.find(d=>d.weekday===today));
  for(const e of s.activeWorkout.exercises)for(const set of e.sets)Object.assign(set,{completed:true,weight:50,reps:8,rir:1});
  if(kind==='history')return completeWorkout(s);
 }
 return s;
}
const saved=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
const fail=p=>p.evaluate(()=>{const original=Storage.prototype.setItem;window.restoreStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')throw new DOMException('QA quota','QuotaExceededError');return original.call(this,k,v);};});
try{
 for(const [width,theme] of [[320,'dark'],[390,'light']])for(const kind of ['feedback','history','adjust'])for(const outcome of ['retry','cancel']){
  const context=await browser.newContext({viewport:{width,height:844},colorScheme:theme,serviceWorkers:'block'});
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},fixture(theme,kind));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173',{waitUntil:'networkidle'});
  if(kind==='feedback'){
   await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();await page.getByRole('button',{name:'Finish',exact:true}).click();await page.locator('.session-feedback').waitFor();
  }else if(kind==='history'){
   await page.getByRole('button',{name:'WORKOUT COMPLETE · VIEW HISTORY'}).click();await page.getByRole('button',{name:'EDIT',exact:true}).click();await page.getByRole('textbox',{name:'Session note',exact:true}).fill('Retry test note');
  }else{
   await page.getByRole('button',{name:'ADJUST TODAY',exact:true}).click();await page.getByRole('button',{name:/^Low energy/}).click();await page.getByRole('button',{name:'REVIEW LOWER-FATIGUE WORKOUT',exact:true}).click();await page.getByRole('button',{name:'USE THIS WORKOUT',exact:true}).waitFor();
  }
  const before=await saved(page);await fail(page);
  await page.getByRole('button',{name:kind==='feedback'?'About right':kind==='history'?'SAVE CHANGES':'USE THIS WORKOUT',exact:true}).click();
  const retry=page.getByRole('button',{name:'TRY AGAIN',exact:true});await retry.waitFor();assert.ok(await retry.isEnabled());assert.deepEqual(await saved(page),before);
  const alert=page.getByRole('alert').filter({hasText:/unchanged/});assert.equal(await alert.count(),1);
  if(kind==='feedback')assert.ok(await page.getByRole('button',{name:'DONE',exact:true}).isEnabled());
  await retry.scrollIntoViewIfNeeded();await page.waitForTimeout(250);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const box=await retry.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=844,'retry reachable');
  if(outcome==='retry')await page.screenshot({path:`${out}/${width}-${theme}-${kind}-error.png`});
  if(outcome==='retry'){
   await page.evaluate(()=>window.restoreStorage());await retry.click();await retry.waitFor({state:'detached'});
   const after=await saved(page);assert.notDeepEqual(after,before);
   if(kind==='feedback')assert.equal(after.workouts.at(-1).sessionFeedback,'about_right');
   if(kind==='history')assert.equal(after.workouts.at(-1).sessionNote,'Retry test note');
  }else{
   await page.getByRole('button',{name:kind==='feedback'?'DONE':'CANCEL',exact:true}).click();
   if(kind==='history')await page.getByRole('button',{name:'DISCARD CHANGES',exact:true}).click();
   assert.deepEqual(await saved(page),before);
  }
  assert.deepEqual(errors,[]);await context.close();console.log(`${width} ${theme} ${kind}: failure → ${outcome} passed`);
 }
}finally{await browser.close();}
