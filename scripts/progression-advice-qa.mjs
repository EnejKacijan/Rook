import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { startWorkout, completeWorkout } from '../src/domain.js';

const output='artifacts/progression-advice';await mkdir(output,{recursive:true});
const cases=[
  {id:'build-reps',reps:[[8,7],[8,7]],title:'Build reps first'},
  {id:'confirm',reps:[[8,7],[8,8]],title:'Repeat to confirm'},
  {id:'effort',reps:[[8,8],[8,8]],rir:0,title:'Hold the load'},
  {id:'review',reps:[[6,6],[6,6]],title:'Review the load'},
  {id:'increase',reps:[[8,8],[8,8]],title:'Ready to progress'},
  {id:'missing-effort',reps:[[8,8],[8,8]],rir:null,title:'Consider a small increase'},
];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['dark','light'])for(const scenario of cases){
  let state=createReturningUserFixture(1);state.workouts=[];state.activeWorkout=null;
  const e={...state.program.days[0].exercises[0],exerciseId:'barbell-bench-press',repMin:8,repMax:8,targetRir:1,defaultIncrement:1};
  e.sets=e.sets.slice(0,2);state.program.days[0].exercises=[e];
  state.program.source='manual';state.program.userEdited=true;
  for(const [index,reps] of scenario.reps.entries()){
    state.activeWorkout=startWorkout(state,state.program.days[0]);
    state.activeWorkout.exercises[0].sets.forEach((s,i)=>Object.assign(s,{reps:reps[i],weight:40,rir:Object.hasOwn(scenario,'rir')?scenario.rir:1,completed:true}));
    state=completeWorkout(state);state.workouts.at(-1).completedAt=`2026-09-0${index+1}T12:00:00Z`;
    Object.assign(state.workouts.at(-1),{endedAt:Date.parse(state.workouts.at(-1).completedAt),workoutDateKey:`2026-09-0${index+1}`,canonicalPlanDate:`2026-09-0${index+1}`});
  }
  if(scenario.id==='missing-effort')state.activeWorkout=startWorkout(state,state.program.days[0]);
  Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  if(!await page.getByRole('button',{name:'PROGRESS',exact:true}).count()) throw new Error(`${errors.join('\n')}\n${await page.locator('body').innerText()}`);
  const original=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));return {program:s.program,workouts:s.workouts};});
  await page.getByRole('button',{name:'PROGRESS',exact:true}).click();
  const row=page.locator('.progression-row').filter({hasText:scenario.title});await row.click();
  await page.locator('.exercise-progression').getByText(scenario.title,{exact:true}).waitFor();
  const panel=page.locator('.exercise-progression');await panel.scrollIntoViewIfNeeded();await page.waitForTimeout(250);
  const rect=await panel.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width+1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`${output}/${width}-${style}-${appearance}-${scenario.id}.png`});
  await page.getByRole('button',{name:/^Close .* details$/}).click();
  if(scenario.id==='missing-effort'){
    await page.getByRole('button',{name:'TODAY',exact:true}).click();
    await page.getByRole('button',{name:'RESUME WORKOUT',exact:true}).click();
    const recommendation=page.locator('.recommendation');
    assert.match(await recommendation.innerText(),/Effort wasn't fully logged/);
    assert.equal(await recommendation.getByRole('button',{name:'USE',exact:true}).count(),1);
    const weights=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises[0].sets.map(s=>s.weight));
    assert.deepEqual(weights,[40,40],'advice does not automatically apply a load');
    await recommendation.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${width}-${style}-${appearance}-active-conditional.png`});
  }
  assert.deepEqual(await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lift-v2-state'));return {program:s.program,workouts:s.workouts};}),original);
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}-${style}-${appearance}-${scenario.id}`);
}
}finally{await browser.close();}
