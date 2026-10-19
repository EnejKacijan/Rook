import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {blankState,isoDay} from '../src/domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from '../src/freestyleWorkout.js';
import {saveWorkoutTemplate,templateDraft} from '../src/savedWorkouts.js';
import {createReturningUserFixture} from '../src/demoFixture.js';

const url=process.env.ROOK_QA_URL||'http://127.0.0.1:4198';
const browser=await chromium.launch({channel:'chrome',headless:true});
function base(){const state=blankState();Object.assign(state.profile,{onboardingComplete:true,preferredTrainingStyle:'own-workouts',noPlanReceipt:{kind:'first-run'},goal:'Build muscle',experience:'Intermediate',equipment:['full gym'],environment:'Commercial gym'});state.selectedDate=isoDay();return state;}
function saved(){let state=addFreestyleExercise(startFreestyleWorkout(base()),'plank');state=saveWorkoutTemplate(state,{...templateDraft(state.activeWorkout,state),name:'Full Body'},{id:'saved-a'});state.activeWorkout=null;return state;}
async function open(state){const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});await context.addInitScript(value=>localStorage.setItem('lift-v2-state',JSON.stringify(value)),state);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/ai/status',route=>route.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('.no-plan-today').waitFor();return {context,page,errors};}
try {
  {
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/ai/status',route=>route.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.locator('.entry-training-style').waitFor();
    await page.screenshot({path:'artifacts/no-plan-training/390-landing.png',fullPage:true});
    await page.getByRole('button',{name:/Use my own workouts/}).click();
    await page.locator('.no-plan-today').waitFor();
    const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
    assert.equal(initial.program,null);
    assert.equal(initial.profile.onboardingComplete,true);
    assert.equal(initial.profile.preferredTrainingStyle,'own-workouts');
    assert.deepEqual(errors,[]);
    await context.close();
  }
  {
    const {context,page,errors}=await open(saved());
    await page.locator('.no-plan-workout-list .list-row').tap();
    await page.locator('.saved-workout-preview').waitFor();
    assert.equal(await page.getByRole('button',{name:'Start workout',exact:true}).count(),1);
    await page.getByRole('button',{name:'Start workout',exact:true}).tap();
    await page.locator('.workout-header').waitFor();
    const active=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout);
    assert.equal(active.savedWorkoutTemplateId,'saved-a');
    assert.equal(active.exercises.length,1);
    assert.deepEqual(errors,[]);
    await context.close();
  }
  {
    const {context,page,errors}=await open(base());
    await page.getByRole('button',{name:/CREATE WORKOUT/}).tap();
    await page.locator('.saved-workouts.edit-plan-screen').waitFor();
    const add=page.locator('.plan-workout-add').first();
    await add.tap();
    const plank=page.getByText('Plank',{exact:true}).first();
    await plank.locator('xpath=ancestor::button').tap();
    await page.getByRole('button',{name:'REVIEW TEMPLATE',exact:true}).tap();
    await page.getByRole('button',{name:'Save template',exact:true}).tap();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')).savedWorkoutTemplates.length===1);
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
    assert.equal(after.savedWorkoutTemplates[0].exercises[0].exerciseId,'plank');
    assert.equal(after.program,null);
    assert.deepEqual(errors,[]);
    await context.close();
  }
  {
    const {context,page,errors}=await open(saved());
    await page.getByRole('button',{name:'Browse workout dates'}).tap();
    await page.getByRole('dialog',{name:'Workout calendar'}).waitFor();
    assert.equal(await page.getByLabel('Calendar legend').getByText('Planned').count(),0);
    assert.equal(await page.getByLabel('Calendar legend').getByText('Completed').count(),1);
    assert.deepEqual(errors,[]);
    await context.close();
  }
  {
    const {context,page,errors}=await open(saved());
    const nav=page.getByRole('navigation',{name:'Main navigation'});
    await nav.getByRole('button',{name:'Progress'}).tap();
    assert.equal(await page.getByText('Adjusted / moved').count(),0);
    await nav.getByRole('button',{name:'Profile'}).tap();
    await page.locator('[data-profile-area="preferences"]').tap();
    await page.getByRole('button',{name:'Freestyle',exact:true}).tap();
    await nav.getByRole('button',{name:'Today'}).tap();
    await page.locator('.no-plan-today').waitFor();
    assert.equal(await page.locator('.freestyle-entry .button.primary').count(),1);
    assert.equal(await page.locator('.no-plan-workout-list .list-row').count(),1);
    assert.deepEqual(errors,[]);
    await context.close();
  }
  {
    const plan=createReturningUserFixture(0);
    plan.savedWorkoutTemplates=saved().savedWorkoutTemplates;
    const {context,page,errors}=await openPlan(plan);
    await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Profile'}).tap();
    await page.locator('[data-profile-area="program"]').tap();
    await page.getByRole('button',{name:/Stop following this plan/}).tap();
    await page.getByRole('button',{name:'STOP FOLLOWING PLAN',exact:true}).tap();
    await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Today'}).tap();
    await page.locator('.no-plan-today').waitFor();
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
    assert.equal(after.program,null);
    assert.equal(after.profile.onboardingComplete,true);
    assert.equal(after.savedWorkoutTemplates.length,1);
    assert.equal(after.planVersions.at(-1).program.id,plan.program.id);
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log('PASS: first-run choice, saved-workout start/create, calendar, preferences/Progress, and plan-to-no-plan transition');
} finally {await browser.close();}

async function openPlan(state){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await context.addInitScript(value=>localStorage.setItem('lift-v2-state',JSON.stringify(value)),state);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/ai/status',route=>route.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('.today-screen:not(.no-plan-today)').waitFor();
  return {context,page,errors};
}
