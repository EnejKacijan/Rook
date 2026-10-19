import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {blankState,isoDay,completeWorkout} from '../src/domain.js';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {startFreestyleWorkout,addFreestyleExercise} from '../src/freestyleWorkout.js';
import {saveWorkoutTemplate,templateDraft,useSavedWorkout} from '../src/savedWorkouts.js';

const url=process.env.ROOK_QA_URL||'http://127.0.0.1:4198';
const out='artifacts/no-plan-training';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const themes=[['standard','light'],['standard','dark'],['premium','light'],['premium','dark']];
const states=['empty','one','multiple','active-freestyle','active-saved','completed','previous'];
const results=[];
function base(){const state=blankState();Object.assign(state.profile,{onboardingComplete:true,preferredTrainingStyle:'freestyle',noPlanReceipt:{kind:'first-run'},goal:'Build muscle',experience:'Intermediate',equipment:['full gym'],environment:'Commercial gym'});state.selectedDate=isoDay();return state;}
function template(state,id,name,exerciseId){let work=addFreestyleExercise(startFreestyleWorkout(state),exerciseId);work=saveWorkoutTemplate(work,{...templateDraft(work.activeWorkout,work),name},{id});work.activeWorkout=null;return work;}
function fixture(kind){let state=base();
  if(['one','multiple','active-saved'].includes(kind)){state.profile.preferredTrainingStyle='own-workouts';state=template(state,'saved-a','Full Body','plank');}
  if(kind==='multiple')state=template(state,'saved-b','Push','push-up');
  if(kind==='active-freestyle')state=startFreestyleWorkout(state);
  if(kind==='active-saved')state=useSavedWorkout(state,{templateId:'saved-a',revision:1,requestId:'start-saved'});
  if(['completed','previous'].includes(kind)){
    state=addFreestyleExercise(startFreestyleWorkout(state),'plank');
    state.activeWorkout.exercises[0].sets[0].completed=true;
    state.activeWorkout.exercises[0].sets[0].reps=30;
    state=completeWorkout(state);
    if(kind==='previous'){
      const previous=new Date();previous.setDate(previous.getDate()-1);const date=isoDay(previous);
      state.workouts.at(-1).workoutDateKey=date;
      state.workouts.at(-1).startedAt=previous.getTime()-45*60*1000;
      state.workouts.at(-1).endedAt=previous.getTime();
      state.workouts.at(-1).completedAt=previous.toISOString();
    }
  }
  return state;
}
try {
for(const width of [320,390,430]) for(const [style,appearance] of themes) for(const kind of states){
  const state=kind==='plan'?createReturningUserFixture(0):fixture(kind);
  Object.assign(state.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance});
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',colorScheme:appearance});
  await context.addInitScript(value=>localStorage.setItem('lift-v2-state',JSON.stringify(value)),state);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/ai/status',route=>route.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));
  await page.goto(`${url}/?no-plan-qa=${width}-${style}-${appearance}-${kind}`,{waitUntil:'domcontentloaded'});
  await page.locator('.no-plan-today').waitFor();
  if(kind==='previous'){
    await page.getByRole('button',{name:'Browse workout dates'}).tap();
    const previous=new Date();previous.setDate(previous.getDate()-1);
    await page.locator(`[data-date="${isoDay(previous)}"]`).tap();
    await page.locator('.month-calendar-screen').waitFor({state:'hidden'});
    assert.equal(await page.locator('.no-plan-today h1').textContent(),'Workouts logged');
  }
  assert.equal(await page.locator('html').getAttribute('data-style'),style);
  assert.equal(await page.locator('html').getAttribute('data-appearance'),appearance);
  assert.equal(await page.locator('.week-strip, .missed-workout-summary, .today-program-name').count(),0);
  const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,calendar:(()=>{const r=document.querySelector('.no-plan-calendar-action').getBoundingClientRect();return {width:r.width,height:r.height}})(),create:(()=>{const r=document.querySelector('.no-plan-create-action')?.getBoundingClientRect();return r?{width:r.width,height:r.height}:null})()}));
  assert.ok(geometry.overflow<=1,`${width}/${style}/${appearance}/${kind}: horizontal overflow ${geometry.overflow}`);
  assert.ok(geometry.calendar.height>=44);
  if(geometry.create)assert.ok(geometry.create.height>=44);
  if(kind==='empty')assert.equal(await page.locator('.freestyle-entry .button.primary').count(),1);
  if(kind==='one'||kind==='multiple'){
    assert.equal(await page.locator('.no-plan-workout-list .list-row').count(),kind==='one'?1:2);
    assert.equal(await page.locator('.freestyle-entry .button.secondary').count(),1);
  }
  if(kind.startsWith('active'))assert.equal(await page.locator('.active-workout-notice button').count(),1);
  if(kind==='completed'||kind==='previous')assert.equal(await page.locator('.today-completed-workouts .list-row').count(),1);
  assert.deepEqual(errors,[],`${width}/${style}/${appearance}/${kind}: page errors`);
  if(width===390&&['empty','multiple','active-saved','previous'].includes(kind))await page.screenshot({path:`${out}/${width}-${style}-${appearance}-${kind}.png`});
  results.push(`${width}/${style}/${appearance}/${kind}`);
  await context.close();
}
console.log(`PASS: ${results.length} no-plan responsive/theme/state cases`);
} finally {await browser.close();}
