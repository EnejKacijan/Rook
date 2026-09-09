import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,startWorkout,completeWorkout,weekday,isoDay,WEEKDAYS} from '../src/domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from '../src/freestyleWorkout.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try{for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const count of [0,1,2,3,4]){
 let s=blankState();const today=weekday();Object.assign(s.profile,{onboardingComplete:true,goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:[today,WEEKDAYS[(WEEKDAYS.indexOf(today)+3)%7]],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});s.program=buildProgram(s.profile);s.selectedDate=isoDay();s.selectedDay=today;s.ai.planUpgradeDismissed=true;
 for(let i=0;i<count;i++){if(i===0)s.activeWorkout=startWorkout(s,s.program.days.find(d=>d.weekday===today));else s=addFreestyleExercise(startFreestyleWorkout(s),'push-up');Object.assign(s.activeWorkout.exercises[0].sets[0],{reps:8,completed:true});s=completeWorkout(s);s.workouts.at(-1).completedAt=new Date(Date.now()-(count-i)*60000).toISOString();}
 if(count===3)s=startFreestyleWorkout(s);
 if(count===2)s.workouts[1].name=s.workouts[0].name; // Identity, never name-based exclusion.
 const expected=s.workouts.filter(w=>count===3||w.id!==s.workouts[0]?.id).reverse();
 const c=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});await c.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),s);const p=await c.newPage();await p.route('**/api/**',r=>r.fulfill({json:{available:false}}));await p.goto('http://127.0.0.1:4173');await p.locator('.today-screen').waitFor();const list=p.locator('.today-completed-workouts');
 assert.equal(await list.count(),expected.length?1:0);assert.equal(await list.locator('button').count(),expected.length);assert.equal(await list.locator('.eyebrow').count(),expected.length>1?1:0);
 if(expected.length){if(expected.length>1)assert.equal(await list.locator('.eyebrow').innerText(),`COMPLETED WORKOUTS · ${expected.length}`);assert.deepEqual(await list.locator('button').evaluateAll(es=>es.map(e=>e.dataset.workoutId)),expected.map(w=>w.id));assert.equal(await list.getByText(/Planned · Finished/).count(),count===3?1:0);assert.equal(await list.getByText(/Freestyle · Finished/).count(),count-1);await list.scrollIntoViewIfNeeded();}
 if(count===3)assert.equal(await p.getByRole('button',{name:'RESUME WORKOUT',exact:true}).count(),1);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:`${out}/today-completed-label-${width}-${style}-${appearance}-${count}.png`});
 if(count){const before=await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts);if(count!==3)await p.getByRole('button',{name:'WORKOUT COMPLETE · VIEW HISTORY',exact:true}).click();else await list.locator('button').first().click();await p.locator('.completed-workout-detail').waitFor();assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).workouts),before);}
 console.log(`PASS ${width} ${style} ${appearance} count=${count}`);await c.close();
}}finally{await browser.close();}
