import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,startWorkout,weekday,isoDay,weekKey,WEEKDAYS} from '../src/domain.js';
const out='artifacts/today-hierarchy';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const [width,appearance,style,mode] of [
 [390,'light','standard','planned'],[390,'dark','standard','planned'],[320,'dark','standard','planned'],[390,'light','premium','planned'],[320,'dark','premium','planned'],[390,'light','standard','rest'],[390,'light','standard','missed'],[390,'light','standard','active'],[390,'light','standard','completed']]){
 const state=blankState(),today=weekday(),idx=WEEKDAYS.indexOf(today),other=WEEKDAYS[(idx+3)%7],previous=WEEKDAYS[(idx+6)%7];
 Object.assign(state.profile,{onboardingComplete:true,goal:'Build muscle',experience:'Intermediate',daysPerWeek:2,availableDays:mode==='rest'?[other,previous]:mode==='missed'?[previous,today]:[today,other],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
 state.program=buildProgram(state.profile);state.selectedDay=today;state.selectedDate=isoDay();state.ai.planUpgradeDismissed=true;
 if(mode==='missed')state.program.trainingBlock.startDate=weekKey(new Date(Date.now()-7*86400000));
 if(mode==='active'||mode==='completed'){state.activeWorkout=startWorkout(state,state.program.days.find(d=>d.weekday===today));if(mode==='completed'){state.activeWorkout.completedAt=Date.now();state.activeWorkout.exercises.forEach(e=>e.sets.forEach(s=>s.completed=true));state.workouts.push(state.activeWorkout);state.activeWorkout=null;}}
const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('lift-v2-state',JSON.stringify(s)),state);const page=await context.newPage();page.on('pageerror',e=>console.log(e.message));await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4175');await page.locator('.today-screen').waitFor();await page.waitForTimeout(300);const prefix=`${out}/${width}-${style}-${appearance}-${mode}`;await page.screenshot({path:`${prefix}.png`});
 const baseline=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).program);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(mode==='planned'||mode==='missed'){
  assert.equal(await page.getByRole('button',{name:'START WORKOUT',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'ADJUST TODAY',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Start freestyle workout',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Edit exercises',exact:true}).count(),0);
 }
 if(mode==='planned'){
  const spacing=await page.evaluate(()=>{
   const hero=document.querySelector('.today-hero').getBoundingClientRect(),exercises=document.querySelector('.exercise-preview').getBoundingClientRect();
   return {gap:exercises.top-hero.bottom,visible:exercises.width>0};
  });
  assert.ok(spacing.visible&&spacing.gap>=0&&spacing.gap<=24,JSON.stringify(spacing));
  assert.equal(await page.locator('.today-missed-row').count(),0);
  await page.getByRole('button',{name:'ADJUST TODAY',exact:true}).click();
  await page.locator('.adjust-today-sheet').waitFor();assert.equal(await page.locator('.adjust-today-sheet').count(),1);
  for(const text of ['Less time','Different equipment','Low energy','Specific exercise unavailable'])assert.equal(await page.getByText(text,{exact:true}).count(),1);
  await page.keyboard.press('Escape');await page.locator('.adjust-today-sheet').waitFor({state:'hidden'});
 }
 if(mode==='rest'){assert.equal(await page.getByRole('button',{name:'Start freestyle workout',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'ADJUST TODAY',exact:true}).count(),0);}
 if(mode==='active')assert.equal(await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).count(),1);
 if(mode==='missed'){assert.equal(await page.locator('.today-missed-open').count(),1);await page.locator('.today-missed-open').click();await page.locator('.flexible-week-sheet').waitFor();await page.keyboard.press('Escape');}
const menu=page.getByRole('button',{name:'Today options',exact:true});await menu.click();await page.locator('.today-actions-sheet').waitFor();await page.waitForTimeout(300);await page.screenshot({path:`${prefix}-menu.png`});assert.equal(await page.getByRole('button',{name:'Adjust week',exact:true}).count(),1);if(mode==='planned')assert.equal(await page.getByRole('button',{name:/^Edit in plan/}).isEnabled(),true);
 if(mode==='active')assert.equal(await page.getByRole('button',{name:'Start freestyle workout',exact:true}).count(),0);
 await page.keyboard.press('Escape');await page.locator('.today-actions-sheet').waitFor({state:'hidden'});
 assert.equal(await menu.evaluate(e=>document.activeElement===e),true);
 await page.keyboard.press('Enter');await page.locator('.today-actions-sheet').waitFor();
 await page.waitForTimeout(250);await page.mouse.click(2,2);await page.locator('.today-actions-sheet').waitFor({state:'hidden'});
 await menu.click();await page.getByRole('button',{name:'Adjust week',exact:true}).click();await page.locator('.flexible-week-sheet').waitFor();assert.equal(await page.locator('.flexible-week-sheet').count(),1);await page.keyboard.press('Escape');
 if(mode==='planned'){await menu.click();await page.getByRole('button',{name:'Start freestyle workout',exact:true}).click();await page.getByText('Choose exercises as you go. Your plan won’t change.',{exact:true}).waitFor();await page.getByRole('button',{name:'Start freestyle workout',exact:true}).click();await page.locator('.freestyle-workout').waitFor();}
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));assert.deepEqual(saved.program,baseline);console.log(`PASS ${width} ${style} ${appearance} ${mode}: hierarchy, routes, dismissal, plan unchanged`);await context.close();
}}finally{await browser.close();}
