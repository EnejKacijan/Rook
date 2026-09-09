import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,isoDay,weekday,weekKey,plannedWorkoutForDate} from '../src/domain.js';
import {missedFlexibleSessions} from '../src/flexibleWeek.js';
const out='artifacts/missed-resolution';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const [width,appearance,empty] of [[390,'light',false],[320,'dark',false],[390,'light',true]]){
 const state=blankState(),days=['Mon','Tue','Wed','Thu','Fri'].filter(d=>!empty||d!==weekday());
 Object.assign(state.profile,{onboardingComplete:true,goal:'Build muscle',experience:'Intermediate',availableDays:days,daysPerWeek:days.length,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],sessionMinutes:60,appearancePreference:appearance,stylePreference:'standard',themePreference:appearance});
 state.program=buildProgram(state.profile);state.program.trainingBlock.startDate=weekKey();state.selectedDate=isoDay();state.selectedDay=weekday();state.ai.planUpgradeDismissed=true;
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4175');
 const entry=page.getByRole('button',{name:'Reschedule missed session',exact:true});await entry.waitFor();const prefix=`${out}/${width}-standard-${appearance}-${empty?'empty':'occupied'}`;
 const shot=async name=>{await page.waitForTimeout(300);await page.screenshot({path:`${prefix}-${name}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);};
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));const before=await saved(),missed=missedFlexibleSessions(before)[0];
 await shot('today');await page.getByRole('button',{name:'Today options',exact:true}).click();await page.getByText('More options',{exact:true}).waitFor();await shot('overflow');await page.keyboard.press('Escape');
 await entry.click();const sheet=page.locator('.missed-destination-sheet');await sheet.waitFor();assert.equal(await sheet.count(),1);await shot('move');
 assert.equal(await sheet.getByRole('button',{name:'Move to today',exact:true}).count(),empty?1:0);assert.equal(await sheet.locator('[data-move-date]:disabled').count(),0);
 const date=await sheet.locator('[data-move-date]').first().getAttribute('data-move-date');await sheet.locator(`[data-move-date="${date}"]`).click();await page.getByRole('button',{name:'USE THIS SCHEDULE',exact:true}).waitFor();await shot('review');
 assert.deepEqual((await saved()).flexibleWeek,before.flexibleWeek);await page.getByRole('button',{name:'CANCEL',exact:true}).click();await page.locator('.flexible-week-sheet').waitFor({state:'detached'});assert.deepEqual((await saved()).flexibleWeek,before.flexibleWeek);
 await entry.click();await sheet.locator(`[data-move-date="${date}"]`).click();await page.getByRole('button',{name:'USE THIS SCHEDULE',exact:true}).click();await page.locator('.flexible-week-sheet').waitFor({state:'detached'});await shot('resolved');
 const after=await saved(),remainingMissed=missedFlexibleSessions(after);assert.deepEqual(after.program,before.program);assert.deepEqual(after.workouts,before.workouts);assert.equal(remainingMissed.some(s=>s.logicalSessionId===missed.logicalSessionId),false);assert.equal(await entry.isVisible(),remainingMissed.length>0);assert.equal(plannedWorkoutForDate(after,date).logicalSessionId,missed.logicalSessionId);assert.deepEqual(errors,[]);console.log(`PASS ${prefix}: visible state, valid dates, review/cancel/apply, identity and plan preserved`);await context.close();
}}finally{await browser.close();}
