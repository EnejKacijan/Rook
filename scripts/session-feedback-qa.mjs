import assert from 'node:assert/strict';
import { configureNewFeatureReview } from './new-feature-review-capture.mjs';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,isoDay,startWorkout,weekday} from '../src/domain.js';
import {buildBackupArchive} from '../src/backup.js';
import {prescribeTrainingBlockWorkout,advanceTrainingBlockAfterWorkout} from '../src/trainingBlocks.js';
const out='artifacts/session-feedback';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
configureNewFeatureReview(browser, '04-post-workout-feedback');
function fixture(appearance='light',style='standard',long=false){
 const s=blankState(),today=weekday();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:[...new Set([today,'Tue','Sat','Mon'])].slice(0,3),sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,rirEnabled:true,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 s.program=buildProgram(s.profile);s.selectedDate=isoDay();s.selectedDay=today;s.ai.planUpgradeDismissed=true;s.activeWorkout=startWorkout(s,s.program.days.find(d=>d.weekday===today));s.activeWorkout.startedAt=Date.now()-3600000;
 for(const e of s.activeWorkout.exercises)for(const set of e.sets)Object.assign(set,{weight:70,reps:8,rir:1,completed:true});
 if(long){s.activeWorkout.sessionNote='A long synthetic session note with useful training context. '.repeat(7);s.activeWorkout.exercises.push(...structuredClone(s.activeWorkout.exercises).map((e,i)=>({...e,id:`long${i}`,importedName:'Long gym-specific exercise name with independent handles and adjustable seat'})));}
 return s;
}
async function open(width,appearance,style,long=false){
 const context=await browser.newContext({viewport:{width,height:844},colorScheme:appearance,serviceWorkers:'block'});
 await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},fixture(appearance,style,long));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();await page.getByRole('button',{name:'Finish',exact:true}).click();await page.locator('.complete-screen').waitFor();
 return {page,context,errors};
}
async function shot(page,name,fullPage=false){await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/${name}.png`,fullPage});}
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
const options=[['easier','Easier than expected'],['about_right','About right'],['harder','Harder than expected']];
let restoreState;
try{
 for(const width of process.env.ROOK_FEEDBACK_BLOCK_ONLY||process.env.ROOK_FEEDBACK_EXTRAS_ONLY?[]:[320,390,430])for(const appearance of ['light','dark'])for(const style of ['standard','premium']){
  const {page,context,errors}=await open(width,appearance,style),key=`${width}-${style}-${appearance}`;
  await shot(page,`${key}-completion-top`);await page.locator('.session-feedback').scrollIntoViewIfNeeded();await shot(page,`${key}-unset`);assert.equal(await page.getByRole('button',{name:'Skip',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Remove feedback',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'DONE',exact:true}).isEnabled(),true);
  const doneBefore=await page.getByRole('button',{name:'DONE',exact:true}).boundingBox();
  await page.evaluate(()=>{const original=Storage.prototype.setItem;window.restoreFeedbackStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')throw new DOMException('Quota','QuotaExceededError');return original.call(this,k,v);};});
  await page.getByRole('button',{name:'About right',exact:true}).click();await page.waitForTimeout(200);
  const errorBounds=await page.locator('.session-feedback [role="alert"]').boundingBox(),footerBounds=await page.locator('.complete-done-dock').boundingBox();assert.ok(errorBounds.y>=0&&errorBounds.y+errorBounds.height<=footerBounds.y-16,'entire failure clears fixed footer');assert.deepEqual(await page.getByRole('button',{name:'DONE',exact:true}).boundingBox(),doneBefore,'Done geometry unchanged');await shot(page,`${key}-failure`);await page.evaluate(()=>window.restoreFeedbackStorage());
  for(const [value,label] of options){
   await page.getByRole('button',{name:label,exact:true}).click();assert.equal((await saved(page)).workouts.at(-1).sessionFeedback,value);await shot(page,`${key}-${value}`);
   await page.locator('.session-feedback-change').click();assert.equal(await page.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true');
   assert.equal(await page.getByRole('button',{name:label,exact:true}).evaluate(b=>getComputedStyle(b).color!==getComputedStyle(b).backgroundColor),true);
  }
  await page.getByRole('button',{name:'Remove feedback',exact:true}).click();assert.equal((await saved(page)).workouts.at(-1).sessionFeedback,'skipped');await shot(page,`${key}-skipped`);
  await page.getByRole('button',{name:'About right',exact:true}).click();
  await page.getByRole('button',{name:'DONE',exact:true}).click();await page.getByRole('button',{name:'WORKOUT COMPLETE · VIEW HISTORY'}).click();await page.locator('.session-feedback-history').scrollIntoViewIfNeeded();await shot(page,`${key}-history`);
  await page.getByRole('button',{name:'EDIT',exact:true}).click();await page.locator('.session-feedback-choices').scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Harder than expected',exact:true}).click();await shot(page,`${key}-correction`);await page.getByRole('button',{name:'REVIEW CHANGES',exact:true}).click();await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await page.locator('.completed-workout-detail').waitFor();assert.match(await page.locator('.session-feedback-history').innerText(),/Harder than expected/);
  restoreState=await saved(page);await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'WORKOUT COMPLETE · VIEW HISTORY'}).click();assert.match(await page.locator('.session-feedback-history').innerText(),/Harder than expected/);assert.deepEqual(errors,[]);await context.close();console.log(`${key}: completion, options/skip, History correction, reload passed`);
 }
 for(const scenario of process.env.ROOK_FEEDBACK_BLOCK_ONLY?[]:['ignored','offline','failure','long']){
  const {page,context}=await open(320,'light','standard',scenario==='long');await page.locator('.session-feedback').scrollIntoViewIfNeeded();
  if(scenario==='offline')await context.setOffline(true);
  if(scenario==='failure')await page.evaluate(()=>{const original=Storage.prototype.setItem;window.restoreFeedbackStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k==='lift-v2-state')throw new DOMException('Quota','QuotaExceededError');return original.call(this,k,v);};});
  if(scenario!=='ignored')await page.getByRole('button',{name:'About right',exact:true}).click();
  if(scenario==='failure'){await page.getByRole('alert').filter({hasText:'Couldn’t save feedback'}).waitFor();assert.equal((await saved(page)).workouts.at(-1).sessionFeedback,undefined);await shot(page,'320-failure');}
  await shot(page,`320-${scenario}`);
  if(scenario==='long'){await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await shot(page,'320-long-bottom');}
  await page.getByRole('button',{name:'DONE',exact:true}).click();assert.equal(await page.locator('.today-screen').count(),1);if(['ignored','failure'].includes(scenario)){assert.equal((await saved(page)).workouts.at(-1).sessionFeedback,undefined);await page.getByRole('button',{name:'WORKOUT COMPLETE · VIEW HISTORY'}).click();assert.equal(await page.locator('.session-feedback-history').count(),0);}await context.close();console.log(`${scenario}: non-blocking completion passed`);
 }
 if(restoreState){const archive=await buildBackupArchive(restoreState,[]),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});await page.locator('.restore-backup-action').click();await page.getByLabel('Choose ROOK backup file').setInputFiles({name:'feedback.zip',mimeType:'application/zip',buffer:Buffer.from(archive.bytes)});await page.getByRole('button',{name:'RESTORE & REPLACE',exact:true}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'{}').workouts?.some(w=>w.sessionFeedback==='harder'));await shot(page,'390-clean-restore');await context.close();console.log('feedback clean-profile Backup Restore: passed');}
 for(const appearance of process.env.ROOK_FEEDBACK_EXTRAS_ONLY?[]:['light','dark'])for(const style of ['standard','premium']){
  const s=fixture(appearance,style),b=s.program.trainingBlock;s.activeWorkout=null;b.startDate='2026-07-27';
  for(const week of b.weeks){b.currentWeek=week.weekNumber;for(const [i,day] of s.program.days.entries()){const w=prescribeTrainingBlockWorkout(s,day);s.workouts.push({...w,id:`feedback-block-${week.weekNumber}-${i}`,programDayId:day.id,completedAt:`2026-08-${String(week.weekNumber*3+i).padStart(2,'0')}T12:00:00Z`,sessionFeedback:'about_right',exercises:w.exercises.map(e=>({...e,sets:e.sets.map(set=>({...set,weight:60,reps:e.repMax,rir:e.targetRir,completed:true}))}))});}}
  advanceTrainingBlockAfterWorkout(s,s.workouts.at(-1));
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:appearance,serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});await page.getByRole('button',{name:'REVIEW BLOCK',exact:true}).click();await page.locator('.session-feedback-block').scrollIntoViewIfNeeded();await shot(page,`390-${style}-${appearance}-block`);assert.match(await page.locator('.session-feedback-block').innerText(),/rated sessions felt about right/);await context.close();console.log(`${style}-${appearance}: Block Review session-only context passed`);
 }
}finally{await browser.close();}
