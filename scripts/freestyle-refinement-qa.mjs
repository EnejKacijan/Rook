import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,isoDay,buildProgram,weekday,startWorkout} from '../src/domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from '../src/freestyleWorkout.js';
const out='artifacts/freestyle-refinement';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try { for(const width of [320,390]) for(const appearance of ['light','dark']) for(const style of ['standard','premium']) for(const mode of ['first','history','long','logged','planned']) {
 let state=blankState();Object.assign(state.profile,{onboardingComplete:true,environment:'Commercial gym',equipment:['full gym'],appearancePreference:'dark',stylePreference:'standard'});
 Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:[weekday(),'Wed','Fri'],sessionMinutes:60,priorities:['Balanced']});state.program=buildProgram(state.profile);
 Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance,rirEnabled:true});
 state=startFreestyleWorkout(state);state=addFreestyleExercise(state,'barbell-bench-press');state.selectedDate=isoDay();
 if(mode==='long')state.activeWorkout.exercises[0].importedName='Single-Arm Behind-the-Body Cable Lateral Raise';
 if(mode==='planned')state.activeWorkout=startWorkout({...state,activeWorkout:null},state.program.days[0]);
 if(mode==='history'){const previous=structuredClone(state.activeWorkout);previous.id='prior';previous.completedAt=new Date().toISOString();Object.assign(previous.exercises[0].sets[0],{weight:40,reps:8,completed:true});state.workouts.push(previous);}
 if(mode==='logged')state.activeWorkout.exercises[0].sets[0].completed=true;
 if(mode==='history')state=addFreestyleExercise(state,'dumbbell-bench-press');
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4175');await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();await page.locator('.sets').waitFor();
 const prefix=`${out}/${width}-${style}-${appearance}-${mode}`;
 if(mode==='history'){
 assert.equal(await page.locator('.freestyle-history-aid').getByRole('button',{name:'View exercise history',exact:true}).count(),1);
 assert.match(await page.locator('.freestyle-copy').innerText(),/Previous workout · set 1/);
 assert.match(await page.locator('.freestyle-copy').innerText(),/USE VALUES/);
 }
 if(mode==='planned'){
 assert.equal(await page.locator('.freestyle-previous').count(),0);
 assert.equal(await page.locator('.workout-screen').evaluate(e=>e.classList.contains('freestyle-workout')),false);
 assert.equal(await page.locator('.sets').evaluate(e=>getComputedStyle(e).paddingTop),await page.locator('.recommendation').count()?'16px':'10px');
 await page.getByRole('button',{name:'Exercise options',exact:true}).click();await page.locator('.active-exercise-options-sheet').waitFor();assert.equal(await page.getByRole('button',{name:'Remove exercise',exact:true}).count(),0);
 console.log(`PASS ${width} ${style} ${appearance} planned`);await context.close();continue;
 }
 assert.equal(await page.getByRole('button',{name:'Remove exercise',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Replace',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:'Cancel workout',exact:true}).count(),mode==='logged'?0:1);
 const gap=await page.evaluate(()=>document.querySelector('.sets').getBoundingClientRect().top-document.querySelector('.freestyle-previous').getBoundingClientRect().bottom);
 assert.ok(gap>=0&&gap<=1,`unexpected extra gap ${gap}`);
 assert.equal(await page.locator('.sets').evaluate(e=>getComputedStyle(e).paddingTop),'10px');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(mode==='long')assert.equal(await page.locator('.exercise-heading h1').textContent(),'Single-Arm Behind-the-Body Cable Lateral Raise');
 await page.waitForTimeout(300);await page.screenshot({path:`${prefix}.png`,fullPage:true});
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 await page.getByRole('button',{name:'Exercise options',exact:true}).click();await page.locator('.active-exercise-options-sheet').waitFor();
 assert.equal(await page.getByRole('button',{name:'Remove exercise',exact:true}).count(),mode==='logged'?0:1);
 await page.waitForTimeout(300);await page.screenshot({path:`${prefix}-overflow.png`});
 await page.keyboard.press('Escape');await page.locator('.active-exercise-options-sheet').waitFor({state:'hidden'});
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout),before.activeWorkout);
 if(mode!=='logged'){
 await page.getByRole('button',{name:'Exercise options',exact:true}).click();await page.getByRole('button',{name:'Remove exercise',exact:true}).click();
 await page.locator('.active-exercise-options-sheet').waitFor({state:'hidden'});
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 assert.equal(after.activeWorkout.exercises.length,mode==='history'?1:0);assert.deepEqual(after.workouts,before.workouts);assert.deepEqual(after.program,before.program);
 if(mode!=='history')await page.getByText('No exercises yet',{exact:true}).waitFor();
 }
 console.log(`PASS ${width} ${style} ${appearance} ${mode}`);await context.close();
}}finally{await browser.close();}
