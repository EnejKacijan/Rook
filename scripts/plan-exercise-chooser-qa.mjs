import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';

const output='artifacts/plan-exercise-chooser';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 for(const width of [320,390,430]) for(const style of ['standard','premium']) for(const appearance of ['light','dark']) {
  const state=createReturningUserFixture(3);state.activeWorkout=null;state.profile.avoid='';state.profile.trainingSafety=null;
  Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button',{name:'PROFILE',exact:true}).click();
  await openProfileArea(page, 'program'); await page.getByRole('button',{name:/^Edit plan/}).click();
  const sheet=page.locator('.edit-plan-screen');
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  const original=JSON.stringify((await stored()).program);
  const shot=async suffix=>{
   await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
   await page.screenshot({path:`${output}/${width}-${style}-${appearance}-${suffix}.png`,animations:'disabled'});
  };
  assert.equal(await sheet.getByRole('button',{name:'+ Add exercise',exact:true}).count(),state.program.days.length);
  await sheet.getByRole('button',{name:'+ Add exercise',exact:true}).first().click();
  await shot('add');
  await sheet.getByRole('button',{name:'Create custom exercise',exact:true}).click();
  const editor=page.locator('.custom-exercise-editor');await editor.getByLabel('Exercise name').fill('My cable press');
  await editor.getByLabel('Primary target muscle').selectOption('Chest');
  await editor.getByLabel('Exercise movement').selectOption('horizontal-push');
  await shot('custom');
  const create=editor.getByRole('button',{name:'CREATE & ADD',exact:true});
  await create.evaluate(button=>{button.click();button.click();});
  await editor.waitFor({state:'detached'});
  assert.equal(JSON.stringify((await stored()).program),original,'Creating a library entry does not change the plan');
  assert.equal((await stored()).customExercises.filter(e=>e.name==='My cable press').length,1,'double activation creates one library record');
  assert.equal(await sheet.locator('.scratch-exercise-results').count(),0,'returns directly to draft');
  assert.equal(await sheet.locator('.plan-editor-exercise').filter({hasText:'My cable press'}).count(),1,'one draft insertion without selecting from chooser');
  await shot('draft');
  assert.equal(JSON.stringify((await stored()).program),original,'Adding remains a draft');
  await sheet.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await sheet.waitFor({state:'detached'});
  assert.equal((await stored()).program.days[0].exercises.length,state.program.days[0].exercises.length+1);
  await page.reload();await page.getByRole('button',{name:'PROFILE',exact:true}).click();
  await openProfileArea(page, 'program'); await page.getByRole('button',{name:/^Edit plan/}).click();
  assert.ok((await sheet.innerText()).includes('My cable press'));
  const savedPlan=JSON.stringify((await stored()).program);
  await sheet.getByRole('button',{name:'+ Add exercise',exact:true}).last().click();
  await sheet.getByRole('button',{name:'Create custom exercise',exact:true}).click();
  await editor.getByLabel('Exercise name').fill('Library only press');
  await editor.getByLabel('Primary target muscle').selectOption('Chest');
  await editor.getByRole('button',{name:'CREATE & ADD',exact:true}).click();
  await editor.waitFor({state:'detached'});
  await sheet.getByRole('button',{name:'Close edit plan',exact:true}).click();await sheet.waitFor({state:'detached'});
  assert.equal(JSON.stringify((await stored()).program),savedPlan,'Cancel preserves the plan');
  assert.ok((await stored()).customExercises.some(e=>e.name==='Library only press'),'Saved library entry survives plan cancellation');
  await openProfileArea(page, 'program'); await page.getByRole('button',{name:/^Edit plan/}).click();
  assert.equal(await sheet.locator('.plan-editor-exercise').filter({hasText:'Library only press'}).count(),0,'reopening does not replay cancelled insertion');
  assert.equal(await sheet.locator('.plan-editor-exercise').filter({hasText:'My cable press'}).count(),1,'reopening never duplicates committed insertion');
  await sheet.getByRole('button',{name:'Close edit plan',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width} ${style} ${appearance}`);
 }
} finally {await browser.close();}
