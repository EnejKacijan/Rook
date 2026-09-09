import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {isoDay,weekday,startWorkout,completeWorkout,currentWeekSchedule,buildProgram} from '../src/domain.js';
const output='artifacts/ROOK-BASELINE-CORRECTION-REVIEW';
await mkdir(`${output}/screenshots`,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
const results=[];
try {
for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']) {
 for(const status of ['none','planned','completed','active']) {
  const state=createReturningUserFixture(3),today=isoDay();
  state.selectedDate=today;state.selectedDay=weekday(today);state.activeWorkout=null;
  state.flexibleWeek=null;state.weekScheduleOverrides={};
  state.program.days=state.program.days.filter(day=>day.weekday!==weekday(today));
  if(status!=='none')state.program.days[0].weekday=weekday(today);
  const order=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  state.program.days.sort((a,b)=>order.indexOf(a.weekday)-order.indexOf(b.weekday));
  state.profile.availableDays=state.program.days.map(d=>d.weekday);
  state.program=buildProgram(state.profile);
  const todayTemplate=currentWeekSchedule(state).find(d=>d.scheduledDate===today)?.workout;
  state.workouts=state.workouts.filter(w=>(w.canonicalPlanDate||w.workoutDateKey||isoDay(w.startedAt))!==today);
  if(status==='active')state.activeWorkout=startWorkout(state,todayTemplate);
  if(status==='completed'){
   state.activeWorkout=startWorkout(state,todayTemplate);
   state.activeWorkout.exercises.forEach(e=>e.sets.forEach(s=>{s.completed=true;}));
   Object.assign(state,completeWorkout(state));
  }
  Object.assign(state.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
  const context=await browser.newContext({viewport:{width,height:844},timezoneId:'Europe/Ljubljana',serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
  const page=await context.newPage();
  await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
  await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173');
  const trigger=page.getByRole('button',{name:/^Open calendar,/});
  const dialog=page.getByRole('dialog',{name:'Workout calendar',exact:true});
  await trigger.click();await dialog.waitFor();
  for(const selected of [true,false]) {
   if(!selected){await dialog.locator('button[data-date]:not(:disabled):not(.is-today):not(.is-other-month)').first().click();await dialog.waitFor({state:'detached'});await trigger.click();await dialog.waitFor();}
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   const cell=dialog.locator(`[data-date="${today}"]`);
   assert.equal(await cell.getAttribute('aria-pressed'),String(selected));
   assert.equal(await cell.getAttribute('aria-current'),'date');
   assert.equal(await cell.locator('.month-calendar-mark').getAttribute('class'),`month-calendar-mark ${status==='none'?'':`is-${status}`}`);
   const metrics=await cell.locator('.month-calendar-number').evaluate(e=>{
    const s=getComputedStyle(e),p=getComputedStyle(e,'::before');
    return {color:s.color,before:p.content,after:getComputedStyle(e,'::after').content,border:s.borderTopWidth,bg:s.backgroundColor,weight:s.fontWeight};
   });
   assert.equal(metrics.before,'none');assert.equal(metrics.after,'none');assert.equal(metrics.border,'0px');assert.equal(metrics.bg,'rgba(0, 0, 0, 0)');assert.equal(metrics.weight,'700');
   if(!selected)assert.equal(await dialog.locator('.is-selected .month-calendar-number').evaluate(e=>getComputedStyle(e).fontWeight),'550');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const action=dialog.getByRole('button',{name:'TODAY',exact:true});assert.equal(await action.count(),selected?0:1);
   if(!selected){const cta=await action.boundingBox();assert.ok(cta.y+cta.height<=844);}
   assert.equal(await dialog.locator('.month-calendar-range').count(),0);
   assert.equal(await dialog.locator('.month-calendar-legend > span').count(),3);
   await page.screenshot({path:`${output}/screenshots/calendar-clean-${width}-${style}-${appearance}-${status}-${selected?'selected':'other-selected'}.png`,animations:'disabled'});
   results.push({width,style,appearance,status,selected,metrics});
  }
  if(status==='none'){
   await dialog.getByRole('button',{name:'Previous month',exact:true}).click();
   await dialog.locator('button[data-date]:not(:disabled):not(.is-other-month)').last().click();await dialog.waitFor({state:'detached'});await trigger.click();await dialog.waitFor();
   await page.screenshot({path:`${output}/screenshots/calendar-clean-${width}-${style}-${appearance}-other-month.png`,animations:'disabled'});
   await dialog.getByRole('button',{name:'TODAY',exact:true}).click();await dialog.waitFor({state:'detached'});await trigger.click();await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:'TODAY',exact:true}).count(),0);
  }
  console.log(`PASS ${width} ${style} ${appearance} ${status}: selected and unselected`);
  await context.close();
 }
}
} finally {await browser.close();}
await writeFile(`${output}/calendar-clean-results.json`,JSON.stringify(results,null,2));
console.log(`${results.length} scenarios passed`);
