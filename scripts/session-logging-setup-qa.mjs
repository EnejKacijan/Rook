import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright-core';
import {createReturningUserFixture} from '../src/demoFixture.js';
import {addFreestyleExercise,startFreestyleWorkout} from '../src/freestyleWorkout.js';
const engine=process.env.ROOK_QA_BROWSER||'chrome',origin=process.env.ROOK_QA_URL||'http://127.0.0.1:4273';
const out='artifacts/session-logging-setup';await mkdir(out,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
const results=[];
try{
 for(const width of [320,390,430])for(const style of ['standard','premium'])for(const appearance of ['light','dark'])for(const id of ['bodyweight-split-squat','one-arm-dumbbell-row']){
  let state=createReturningUserFixture(0);Object.assign(state.profile,{stylePreference:style,appearancePreference:appearance,themePreference:style==='premium'?'premium':appearance,showExerciseImages:false});
  state=addFreestyleExercise(addFreestyleExercise(startFreestyleWorkout(state),id),'seated-cable-row');
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:width===320?'reduce':'no-preference',serviceWorkers:'block'});
  try{
   await context.addInitScript(state=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(state));},state);
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',r=>r.fulfill({json:{available:false}}));
   await page.goto(origin);const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
   const resume=async()=>{await page.getByRole('button',{name:/resume workout/i}).first().click();await page.locator('.set-row').first().waitFor();};
   const open=async()=>{await page.getByRole('button',{name:'Exercise options',exact:true}).click();await page.getByRole('button',{name:/^Edit logging setup/}).click();await page.locator('.active-logging-setup-sheet').waitFor();
    await page.waitForFunction(()=>{const el=document.querySelector('.active-logging-setup-sheet');return el&&Math.abs(new DOMMatrix(getComputedStyle(el).transform).m42)<1;});};
   await resume();assert.equal(await page.locator('html').getAttribute('data-style'),style);assert.equal(await page.locator('html').getAttribute('data-appearance'),appearance);
   const before=await read(),target=before.activeWorkout.exercises[0];
   await open();await page.getByRole('button',{name:/^Reps per side/}).click();await page.locator('.active-logging-setup-sheet').waitFor({state:'detached'});await page.locator('.set-row.per-side').first().waitFor();
   await open();await page.getByRole('button',{name:/^Total reps/}).click();await page.locator('.active-logging-setup-sheet').waitFor({state:'detached'});
   assert.equal(await page.locator('.set-row.per-side').count(),0);
   await page.reload();await resume();assert.equal(await page.locator('.set-row.per-side').count(),0);
   await open();await page.getByRole('button',{name:/^Reps per side/}).click();await page.locator('.active-logging-setup-sheet').waitFor({state:'detached'});
   await page.reload();await resume();await page.locator('.set-row.per-side').first().waitFor();
   await page.getByRole('button',{name:/Increase left reps for set 1/}).click();
   await open();const total=page.getByRole('button',{name:/^Total reps/});assert.equal(await total.isDisabled(),true);
   assert.match(await page.locator('#logging-setup-locked').innerText(),/will not be reinterpreted/);
   if(width===390)await page.screenshot({path:`${out}/${engine}-${id}-${style}-${appearance}.png`});
   await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.active-logging-setup-sheet').waitFor({state:'detached'});
   await page.reload();await resume();await open();assert.equal(await page.getByRole('button',{name:/^Total reps/}).isDisabled(),true);
   const after=await read(),ex=after.activeWorkout.exercises[0];
   assert.equal(ex.id,target.id);assert.equal(ex.loggingMode,'per_side');assert.equal(ex.sets[0].sides.left.reps,1);
   for(const key of ['program','workouts','savedWorkoutTemplates'])assert.deepEqual(after[key],before[key],key);
   assert.deepEqual(after.activeWorkout.exercises.slice(1),before.activeWorkout.exercises.slice(1));
   for(const key of ['repMin','repMax','targetRir'])assert.equal(ex[key],target[key],key);
   assert.equal(ex.sets[0].weight,target.sets[0].weight);assert.equal(after.activeWorkout.id,before.activeWorkout.id);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   results.push({width,style,appearance,id,pass:true});console.log('PASS',engine,width,style,appearance,id);
  }finally{await context.close();}
 }
}finally{await browser.close();await writeFile(`${out}/${engine}.json`,JSON.stringify(results,null,2));}
