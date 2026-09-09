import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, startWorkout, weekday, isoDay, WEEKDAYS } from '../src/domain.js';
const before=process.argv.includes('--before');
const output='artifacts/workout-logging-affordance';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
for(const width of before?[390]:[320,390,430]) for(const style of ['standard','premium']) for(const appearance of ['light','dark']) {
 const state=blankState(),today=weekday();
 Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:[today,WEEKDAYS[(WEEKDAYS.indexOf(today)+3)%7]],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',onboardingComplete:true,appearancePreference:appearance,stylePreference:style,rirEnabled:true});
 state.program=buildProgram(state.profile);
 state.profile.themePreference=style==='premium'?'premium':appearance;
 state.profile.restTimerEnabled=true;state.profile.restTimerAutoStart=true;state.profile.restTimerSeconds=90;
 const day=state.program.days.find(d=>d.weekday===today);
 day.exercises[0].exerciseId='pull-up';
 day.exercises[0].sets.forEach(set=>{set.weight=null;set.reps=6;set.rir=null;set.completed=false;});
 state.selectedDay=today;state.selectedDate=isoDay();state.ai.planUpgradeDismissed=true;state.activeWorkout=startWorkout(state,day);
 const context=await browser.newContext({viewport:{width,height:844},colorScheme:appearance,isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',route=>route.fulfill({json:{available:false}}));
 await page.goto('http://127.0.0.1:4173');await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
 await page.waitForTimeout(350);
 assert.equal(await page.locator('html').getAttribute('data-appearance'),appearance);
 assert.equal(await page.locator('html').getAttribute('data-style'),style);
 const row=page.locator('.set-row').first();
 console.log(width,style,appearance,await row.locator('select').evaluate(el=>({font:getComputedStyle(el).fontSize,height:el.getBoundingClientRect().height})));
 await page.screenshot({path:`${output}/${before?'before':'after'}-${width}-${style}-${appearance}.png`});
 if(!before){
   assert.equal(await row.getByRole('button',{name:'Log set 1',exact:true}).innerText(),'✓');
   assert.equal(await page.locator('.set-done-heading').innerText(),'DONE');
   assert.equal(await page.locator('.check-log').count(),0);
   const check=row.locator('.check'), future=page.locator('.set-row').nth(1).locator('.check');
   assert.equal(await future.isDisabled(),true);assert.equal(await future.getAttribute('aria-label'),'Log set 2');assert.equal(await future.innerText(),'✓');
   const geometry=()=>row.locator('.stepper, .rir-native, .check').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,width:r.width,height:r.height};}));
   const beforeGeometry=await geometry();const checkBox=await check.boundingBox(),headingBox=await page.locator('.set-done-heading').boundingBox();
   assert.ok(Math.abs(checkBox.x+checkBox.width/2-headingBox.x-headingBox.width/2)<2);
   assert.ok(headingBox.width>=await page.locator('.set-done-heading').evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);return r.getBoundingClientRect().width;}));
   assert.equal(await row.locator('.rir-value').innerText(),'RIR');
   await row.locator('select').selectOption('2');
   assert.equal(await row.locator('.rir-value').innerText(),'2 RIR');
   assert.ok(await row.locator('select').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
   const label=row.locator('.stepper-empty-label');
   assert.equal(await label.innerText(),'Bodyweight');
   assert.ok(await label.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return Math.abs(a.y+a.height/2-b.y-b.height/2)<1;}));
   await check.evaluate(button=>{button.click();button.click();});
   assert.equal(await row.getByRole('button',{name:'Undo logged set 1'}).getAttribute('aria-pressed'),'true');
   const logged=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout);
   assert.equal(logged.exercises[0].sets.filter(s=>s.completed).length,1);
   assert.equal(logged.rest.seconds,90);assert.equal(logged.rest.endsAt-logged.exercises[0].sets[0].completedAt,90000);
   assert.equal(await future.isDisabled(),false);assert.ok((await page.locator('.set-row').nth(1).getAttribute('class')).includes('set-active'));
   await page.waitForTimeout(350);
   assert.deepEqual(await geometry(),beforeGeometry,'Inputs and completion control retain their x/width/height');
   await page.screenshot({path:`${output}/logged-${width}-${style}-${appearance}.png`});
   await page.waitForTimeout(750); // Existing double-tap guard, not a UI delay regression.
   await row.getByRole('button',{name:'Undo logged set 1'}).click();
   assert.equal(await row.getByRole('button',{name:'Log set 1'}).innerText(),'✓');
   await check.focus();await check.press('Space');
   assert.equal(await row.locator('.check').getAttribute('aria-label'),'Undo logged set 1');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 assert.deepEqual(errors,[]);await context.close();
}
}finally{await browser.close();}
