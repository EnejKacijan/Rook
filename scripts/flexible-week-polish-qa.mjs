import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, isoDay, weekday, WEEKDAYS } from '../src/domain.js';
import { addCalendarDays } from '../src/flexibleWeek.js';
const before=process.argv.includes('--before'), phase=before?'before':'after';
const out=new URL('../artifacts/flexible-week-polish/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const measurements=[];
for(const width of [320,390,430]) for(const appearance of ['light','dark']) for(const style of ['standard','premium']) for(const rest of [false,true]) {
  const state=blankState(),today=isoDay(),day=weekday();
  const days=rest?WEEKDAYS.filter(d=>d!==day).slice(0,4):[day,...WEEKDAYS.filter(d=>d!==day).slice(0,3)];
  Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:4,availableDays:days,sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true,appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  state.program=buildProgram(state.profile);state.program.trainingBlock.startDate=today;state.selectedDate=today;state.selectedDay=day;
  state.program.days[0].name='Upper strength with a deliberately long workout name';
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
  const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  const prefix=`${phase}-${width}-${style}-${appearance}-${rest?'rest':'workout'}`;
  const shot=async name=>{await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:fileURLToPath(new URL(`${prefix}-${name}.png`,out))});};
  await shot('today');measurements.push({prefix,titleY:(await page.locator('.today-hero h1,.rest-day-state h1').first().boundingBox()).y});
  if(!before){const row=page.locator('.today-day-header');const a=await row.locator('.eyebrow').boundingBox(),b=await row.getByRole('button',{name:'ADJUST WEEK'}).boundingBox();assert.ok(a.x+a.width<=b.x);assert.ok(Math.abs(a.y+a.height/2-b.y-b.height/2)<1);assert.ok(b.height>=44);}
  if(rest){const action=page.getByRole('button',{name:'Train today instead',exact:true});if(!before){assert.equal(await action.evaluate(e=>getComputedStyle(e).textDecorationLine),'none');assert.ok((await action.boundingBox()).height>=44);}await action.click();await page.getByRole('heading',{name:"Choose today's activity"}).waitFor();await page.getByRole('button',{name:/Close/}).click();}
  await page.getByRole('button',{name:'ADJUST WEEK',exact:true}).click();await shot('root-no-missed');
  const missed=page.getByRole('button',{name:/I missed a workout/});if(!before){assert.equal(await missed.isDisabled(),true);await missed.evaluate(e=>e.click());assert.equal(await page.getByRole('heading',{name:'What changed?'}).count(),1);}
  await page.getByRole('button',{name:/Move a workout Choose/}).click();const rows=page.locator('.flexible-week-sheet .choice-row');assert.ok(await rows.count()>=6);await shot('choose');
  const firstName=await rows.first().locator('strong').innerText();await rows.first().click();await page.getByRole('heading',{name:`Move ${firstName}`,exact:true}).waitFor();await shot('dates');await page.getByRole('button',{name:'Close Adjust week',exact:true}).click();
  await page.getByRole('button',{name:'ADJUST WEEK',exact:true}).click();await page.getByRole('button',{name:/My available days changed/}).click();await shot('available');await context.close();
  if(width===390&&!rest){
    state.program.trainingBlock.startDate=addCalendarDays(today,-6);
    const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);const p=await c.newPage();await p.route('**/api/ai/status',r=>r.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));await p.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});await p.getByRole('button',{name:'ADJUST WEEK',exact:true}).click();assert.equal(await p.getByRole('button',{name:/I missed a workout/}).isEnabled(),true);await p.waitForTimeout(350);await p.screenshot({path:fileURLToPath(new URL(`${prefix}-root-missed.png`,out))});await c.close();
  }
}
await writeFile(new URL(`${phase}-measurements.json`,out),JSON.stringify(measurements,null,2));await browser.close();console.log(`${phase}: 24 width/theme/day flows passed.`);
