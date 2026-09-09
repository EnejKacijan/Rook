import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { validateSupersetExercises } from '../src/supersets.js';
const out='artifacts/plan-removal-warmup';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {for(const width of [320,390])for(const style of ['standard','premium'])for(const appearance of ['light','dark']) {
  const state=createReturningUserFixture(3);state.activeWorkout=null;Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  const day=state.program.days[0];day.exercises[0].supersetId='qa-pair';day.exercises[1].supersetId='qa-pair';day.exercises[1].sets=structuredClone(day.exercises[0].sets).map((s,i)=>({...s,id:`qa-partner-${i}`}));
  if(width===320)day.exercises[2].importedName='Long custom incline chest press with independent handles and adjustable seat';
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'});await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
  const page=await context.newPage();await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));await page.goto('http://127.0.0.1:4173');
  await page.waitForTimeout(300);if(!await page.getByRole('button',{name:'PROFILE',exact:true}).count())throw Error(await page.locator('body').innerText());
  const open=async()=>{await page.getByRole('button',{name:'PROFILE',exact:true}).click();await openProfileArea(page, 'program'); await page.getByRole('button',{name:/^Edit plan/}).click();};await open();
  const sheet=page.locator('.edit-plan-screen');const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  const before=await stored();const card=id=>page.locator(`[id="import-exercise-${id}"]`);
  const shot=async name=>{await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});await page.screenshot({path:`${out}/${width}-${style}-${appearance}-${name}.png`,animations:'disabled'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));};
  await shot('normal');const warmup=sheet.locator('.plan-warmup-card').first();await warmup.scrollIntoViewIfNeeded();await shot('warmup');
  const label=await warmup.locator('.plan-warmup-eyebrow').boundingBox(),primary=await warmup.locator('strong').first().boundingBox();assert.ok(Math.abs(label.x-primary.x)<2,'warm-up label left aligned');
  const remove=async id=>{const row=card(id);if(await row.getAttribute('class').then(c=>!c.includes('is-expanded')))await row.locator('.plan-editor-summary').click();await row.getByRole('button',{name:'REMOVE',exact:true}).click();};
  await card(day.exercises[0].id).locator('.plan-editor-summary').click();await shot('expanded');await remove(day.exercises[0].id);await sheet.locator('.plan-removed-exercise').first().scrollIntoViewIfNeeded();await shot('superset-removed');
  await remove(day.exercises[2].id);await sheet.locator('.plan-removed-exercise').last().scrollIntoViewIfNeeded();await shot('multiple-removed');assert.equal(await sheet.locator('.plan-removed-exercise').count(),2);
  await sheet.locator('.plan-removed-exercise').first().getByRole('button',{name:'UNDO'}).click();await card(day.exercises[0].id).scrollIntoViewIfNeeded();await shot('undo');assert.equal(await sheet.locator('.plan-removed-exercise').count(),1);
  assert.deepEqual((await stored()).program,before.program);await page.getByRole('button',{name:'Close edit plan',exact:true}).click();assert.deepEqual((await stored()).program,before.program);
  await open();await remove(day.exercises[0].id);await sheet.getByRole('button',{name:'SAVE CHANGES',exact:true}).scrollIntoViewIfNeeded();await shot('bottom-save');await sheet.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await sheet.waitFor({state:'detached'});
  const after=await stored();assert.ok(!after.program.days[0].exercises.some(e=>e.id===day.exercises[0].id));assert.deepEqual(validateSupersetExercises(after.program.days[0].exercises),[]);assert.equal(after.planVersions.length,before.planVersions.length+1);
  await page.reload();assert.deepEqual((await stored()).program,after.program);
  if(width===390&&style==='standard'&&appearance==='light'){
    await open();await remove(after.program.days[0].exercises[0].id);
    await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('QA quota','QuotaExceededError');};});
    await sheet.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();await page.getByRole('alert').first().waitFor();
    assert.deepEqual((await stored()).program,after.program,'failed storage does not overwrite the saved plan');await shot('persistence-failure');
  }
  await context.close();console.log(`PASS ${width} ${style} ${appearance}: remove/undo/cancel/save/history/reload`);
}}finally{await browser.close();}
