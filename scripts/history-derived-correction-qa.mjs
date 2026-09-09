import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,buildProgram,startWorkout,completeWorkout,isoDay,weekday} from '../src/domain.js';
import {exercisePerformance,weeklyPerformanceReview,prEventsForWorkouts} from '../src/performanceInsights.js';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/screenshots';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel: 'chrome',headless:true});
try {
for(const [name,initial,changes,expected] of [
 ['A',[15,12],[[0,'KG','157']],209],
 ['B',[15,12],[[1,'KG','157']],220],
 ['C',[15,12],[[0,'KG','157'],[1,'KG','157']],220],
 ['eligible',[13,15],[[0,'Reps','12']],209],
 ['ineligible',[12,15],[[0,'Reps','13']],null],
]) {
 let s=blankState();const today=weekday();
 Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:[...new Set([today,'Mon','Thu','Sat'])].slice(0,3),sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true});
 s.program=buildProgram(s.profile);s.selectedDate=isoDay();s.selectedDay=today;
 s.activeWorkout=startWorkout(s,s.program.days.find(d=>d.weekday===today));
 const e=s.activeWorkout.exercises[0];e.exerciseId='leg-press-calf-raise';e.importedName='Calf Raises na Leg Press mašini';
 e.sets=initial.map((reps,i)=>({id:`test-${i}`,weight:149,reps,rir:1,completed:true,planned:true}));
 s.activeWorkout.exercises=[e];s=completeWorkout(s);
 const old=structuredClone(s.workouts[0]);old.id='unaffected';old.canonicalPlanDate='2026-08-01';old.workoutDateKey='2026-08-01';old.completedAt='2026-08-01T12:00:00Z';old.exercises[0].exerciseId='barbell-bench-press';s.workouts.unshift(old);
 old.exercises[0].importedName='Unrelated Bench Press';
 const context=await browser.newContext({viewport:{width:name==='A'?320:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(seed=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(seed));},s);
 const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
 await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'WORKOUT COMPLETE · VIEW HISTORY'}).click();
 await page.getByRole('button',{name:'EDIT',exact:true}).click();
 const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
 const before=await read();
 for(const [i,label,value] of changes)await page.locator('.history-edit-set').nth(i).getByRole('spinbutton',{name:label,exact:true}).fill(value);
 await page.getByRole('button',{name:'REVIEW CHANGES',exact:true}).click();assert.deepEqual((await read()).workouts,before.workouts);
 await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await page.locator('.completed-workout-detail').waitFor();
 const after=await read();assert.deepEqual(after.program,before.program);assert.deepEqual(after.workouts[0],before.workouts[0]);
 const corrected=after.workouts.at(-1);assert.equal(corrected.id,before.workouts.at(-1).id);assert.equal(corrected.completedAt,before.workouts.at(-1).completedAt);
 const perf=exercisePerformance(after.workouts,e.exerciseId,{e1rmEligible:true});
 assert.equal(perf.estimatedOneRepMax===null?null:Math.round(perf.estimatedOneRepMax),expected);
 assert.equal(perf.bestWeight,['A','B','C'].includes(name)?157:149);
 assert.equal(weeklyPerformanceReview(after).completedSets,weeklyPerformanceReview(before).completedSets);
 assert.ok(Array.isArray(prEventsForWorkouts(after.workouts)));
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'PROGRESS',exact:true}).click();
 const check=async()=>{
   await page.getByRole('button',{name:/Calf Raises|Leg Press Calf Raise/}).last().click();
   await page.locator('.exercise-performance-insights').waitFor();
   assert.equal((await page.locator('.exercise-performance-metrics dd').nth(2).innerText()).trim(),expected===null?'—':`${expected} kg`);
   const graph=page.locator('.exercise-e1rm-trend');
   assert.equal(await graph.locator('.e1rm-point').count(),expected===null?0:1);
   if(expected!==null)assert.ok((await graph.innerText()).includes(String(expected)));
   assert.equal(await page.locator('.exercise-performance-metrics dd').first().innerText(),`${perf.bestWeight} kg`);
   assert.equal(await page.locator('.exercise-performance-metrics dd').nth(1).innerText(),String(perf.bestReps));
   const history=await page.locator('.exercise-performance-history').innerText();
   for(const set of corrected.exercises[0].sets)assert.ok(history.includes(`${set.weight} kg`),`${name}: ${history}`);
   if(name==='A'||name==='B')assert.ok(history.includes('×'), 'mixed loads paired with repetitions');
   await page.locator('.exercise-performance-history').scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 };
 await check();await page.screenshot({path:`${out}/history-derived-${name}.png`});
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'TODAY',exact:true}).click();
 await page.reload({waitUntil:'networkidle'});assert.deepEqual((await read()).workouts,after.workouts);
 await page.getByRole('button',{name:'PROGRESS',exact:true}).click();await check();
 await context.close();console.log(`PASS ${name}: Review/Save, metrics, mixed history, reload, unchanged plan/session identity/other history`);
}
} finally {await browser.close();}
