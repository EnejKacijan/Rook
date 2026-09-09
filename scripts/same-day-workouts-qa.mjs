import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,startWorkout,completeWorkout,weekday,isoDay,WEEKDAYS} from '../src/domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from '../src/freestyleWorkout.js';
const out='artifacts/same-day-workouts';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try { for(const [width,appearance,style] of [[320,'dark','standard'],[390,'light','standard'],[320,'dark','premium'],[390,'light','premium'],[390,'dark','premium']]) {
 for(const mode of ['two-freestyle','planned-and-freestyle','active','active-nonempty','rest']) {
 let state=blankState();const today=weekday(),other=WEEKDAYS[(WEEKDAYS.indexOf(today)+3)%7];
 Object.assign(state.profile,{onboardingComplete:true,goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:mode==='rest'?[other]:[today,other],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 state.program=buildProgram(state.profile);state.selectedDate=isoDay();state.selectedDay=today;state.ai.planUpgradeDismissed=true;
 for(let i=0;i<2;i++) {
 if((mode==='planned-and-freestyle'||mode.startsWith('active'))&&i===0)state.activeWorkout=startWorkout(state,state.program.days.find(d=>d.weekday===today));
 else state=addFreestyleExercise(startFreestyleWorkout(state),'push-up');
 Object.assign(state.activeWorkout.exercises[0].sets[0],{reps:8,completed:true});state=completeWorkout(state);
 state.workouts.at(-1).completedAt=new Date(Date.now()-(2-i)*3600000).toISOString();
 }
 if(mode.startsWith('active')){
 state=startFreestyleWorkout(state);state.activeWorkout.startedAt=Date.now()-35*60*1000;
 if(mode==='active-nonempty')state=addFreestyleExercise(state,'push-up');
 }
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await page.goto('http://127.0.0.1:4175');await page.locator('.today-screen').waitFor();
 const list=page.locator('.today-completed-workouts');await list.waitFor();
 assert.equal(await list.getByText('Completed workouts · 2',{exact:true}).count(),1);
 assert.deepEqual(await list.locator('button').evaluateAll(es=>es.map(e=>e.dataset.workoutId)),state.workouts.map(w=>w.id).reverse());
 if(mode==='two-freestyle')assert.equal(await page.getByRole('button',{name:'START WORKOUT',exact:true}).count(),1);
 if(mode.startsWith('active')){
 const hero=page.locator('.active-workout-hero');
 assert.equal(await page.getByRole('button',{name:'Edit exercises',exact:true}).count(),0);
 assert.equal(await page.getByText('Finish the active workout to edit exercises.',{exact:true}).count(),0);
 if(mode==='active-nonempty')assert.equal(await page.locator('.exercise-preview').evaluate(e=>Boolean(e.compareDocumentPosition(document.querySelector('.today-completed-workouts'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
 assert.equal(await hero.locator('p').textContent(),`${mode==='active'?'No exercises yet':'0 / 1 set'} · 35 min`);
 assert.equal(await hero.getByRole('button',{name:'RESUME WORKOUT',exact:true}).count(),1);
 assert.equal(await hero.getByText(/Your scheduled workout|Resume to add/).count(),0);
 assert.equal(await hero.locator('button').last().evaluate(e=>e===e.parentElement.lastElementChild),true);
 if(mode==='active')assert.equal(await page.getByRole('button',{name:'Edit exercises',exact:true}).count(),0);
 assert.equal(await list.getByText(/Planned · Finished/).count(),1);assert.equal(await list.getByText(/Freestyle · Finished/).count(),1);
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:`${out}/${width}-${style}-${appearance}-${mode}.png`,fullPage:true});
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 await list.locator('button').last().click();await page.locator('.completed-workout-detail').waitFor({timeout:5000});
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 assert.deepEqual(after.workouts,before.workouts);assert.deepEqual(after.program,before.program);assert.deepEqual(after.activeWorkout,before.activeWorkout);
 await page.reload();await page.locator('.today-completed-workouts').waitFor();assert.equal(await page.locator('.today-completed-workouts button').count(),2);
 if(mode.startsWith('active')){
 const reloaded=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 assert.deepEqual(reloaded.activeWorkout,before.activeWorkout);
 assert.equal(await page.locator('.active-workout-hero p').textContent(),`${mode==='active'?'No exercises yet':'0 / 1 set'} · 35 min`);
 await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();await page.locator('.freestyle-workout').waitFor();
 if(mode==='active')await page.getByText('No exercises yet',{exact:true}).waitFor();
 else await page.locator('.sets').waitFor();
 assert.deepEqual((await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')))).activeWorkout,before.activeWorkout);
 }
 console.log(`PASS ${width} ${style} ${appearance} ${mode}`);await context.close();
 }
}}finally{await browser.close();}
