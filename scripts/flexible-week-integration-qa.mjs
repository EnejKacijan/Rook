import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, deserializeState, isoDay, weekday, WEEKDAYS, plannedWorkoutForDate, startWorkout, completeWorkout } from '../src/domain.js';
import { addCalendarDays, flexibleSessions, proposeFlexibleWeek, applyFlexibleWeek } from '../src/flexibleWeek.js';
const out = new URL('../artifacts/flexible-week/', import.meta.url); await mkdir(out,{recursive:true});
const today=isoDay(), previous=addCalendarDays(today,-1), tomorrow=addCalendarDays(today,1);
let state=blankState(); Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:[weekday(new Date(`${previous}T12:00:00`)),WEEKDAYS[(WEEKDAYS.indexOf(weekday())+3)%7]],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true});
state.program=buildProgram(state.profile);state.program.trainingBlock.startDate=addCalendarDays(today,-7);state=deserializeState(state);
const source=flexibleSessions(state).find(s=>s.scheduledDate===previous);
state=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:today})).state;
state.selectedDate=today;state.selectedDay=weekday();
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
async function open(seed) {
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},seed);
  const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  return {context,page};
}
const shot=async(page,name)=>{await page.waitForTimeout(350);await page.screenshot({path:fileURLToPath(new URL(`390-integration-${name}.png`,out))});};
{
  const {page,context}=await open(state);
  await page.getByRole('button',{name:'ADJUST TODAY',exact:true}).click();await shot(page,'adjust-today');await page.getByRole('button',{name:/Close Adjust today/i}).click();
  await page.getByRole('button',{name:'START WORKOUT',exact:true}).click();await shot(page,'started');
  const active=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout);assert.equal(active.logicalSessionId,source.logicalSessionId);
  await page.reload({waitUntil:'networkidle'});assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout),active);await context.close();
}
{
  const active=structuredClone(state);active.activeWorkout=startWorkout(active,plannedWorkoutForDate(active,today));active.activeWorkout.exercises.forEach(e=>e.sets.forEach(s=>{s.completed=true;s.weight=30;}));
  const done=completeWorkout(active);const {page,context}=await open(done);await shot(page,'completed');
  await page.getByRole('button',{name:/WORKOUT COMPLETE.*VIEW HISTORY/i}).click();await shot(page,'history');assert.match(await page.locator('body').innerText(),/Originally planned for/);await context.close();
  const progress=await open(done);await progress.page.getByRole('button',{name:'PROGRESS',exact:true}).click();await shot(progress.page,'weekly-review');await progress.context.close();
}
{
  const adjusted=structuredClone(state);adjusted.todayAdaptation={programDayId:source.workoutId,date:today};
  const {page,context}=await open(adjusted);await page.getByRole('button',{name:'ADJUST WEEK',exact:true}).click();await page.getByRole('button',{name:/Move a workout Choose/}).click();await page.locator('.flexible-week-sheet .choice-row').filter({hasText:source.workout.name}).first().click();
  const label=new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric'}).format(new Date(`${tomorrow}T12:00:00`));await page.getByRole('button',{name:label,exact:true}).click();
  assert.equal(await page.getByRole('radio',{name:'Restore original workout',exact:true}).isChecked(),true);
  for (const style of ['standard','premium']) for (const appearance of ['light','dark']) {
    await page.evaluate(({style,appearance})=>{document.documentElement.dataset.style=style;document.documentElement.dataset.appearance=appearance;},{style,appearance});
    await shot(page,`adjustment-choice-${style}-${appearance}`);
  }
  await context.close();
}
await browser.close();console.log('Flexible Week: moved Adjust Today entry, start/reload identity, completed History, Weekly Review and adjustment-choice screenshots passed.');
