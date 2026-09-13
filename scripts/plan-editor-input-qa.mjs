import { openProfileArea } from './qa-current-navigation.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
const output = 'artifacts/plan-editor-input';
await mkdir(output,{recursive:true});
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
for (const width of [320,390]) for (const style of ['standard','premium']) for (const appearance of ['light','dark']) {
  const state=createReturningUserFixture(3); state.activeWorkout=null;
  Object.assign(state.profile,{appearancePreference:appearance,stylePreference:style,themePreference:style==='premium'?'premium':appearance});
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  await context.addInitScript(s=>{if(!localStorage.getItem('lift-v2-state'))localStorage.setItem('lift-v2-state',JSON.stringify(s));},state);
  const page=await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
  page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:4173');
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  let original;
  const shot=async name=>{
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
    await page.waitForTimeout(350);
    await page.screenshot({path:`${output}/${width}-${style}-${appearance}-${name}.png`,animations:'disabled'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  };
  const editNumbers=async(name)=>{
    const card=page.locator('.plan-editor-exercise').first();
    if(await card.locator('.plan-editor-summary').getAttribute('aria-expanded')!=='true')await card.locator('.plan-editor-summary').click();
    await page.waitForTimeout(300);
    const prescription=card.getByRole('button',{name:'EDIT PRESCRIPTION',exact:true});
    if(await prescription.count())await prescription.click();
    const sets=card.getByRole('textbox',{name:/^Sets for/}), before=await sets.inputValue();
    await sets.fill(''); assert.equal(await sets.inputValue(),'');
    assert.ok(Number.parseFloat(await sets.evaluate(e=>getComputedStyle(e).fontSize))>=16);
    await shot(`${name}-empty`);
    await sets.press('Tab'); assert.equal(await sets.inputValue(),before,'empty blur restores prior count');
    await sets.fill('1'); await sets.press('Enter'); assert.equal(await sets.inputValue(),'1');
    await sets.focus(); await sets.press('Backspace'); assert.equal(await sets.inputValue(),'');
    await sets.type('2'); await sets.press('Tab'); assert.equal(await sets.inputValue(),'2');
    const min=card.getByRole('textbox',{name:/^Minimum /}); await min.fill(''); assert.equal(await min.inputValue(),''); await min.fill('8'); await min.press('Tab');
    await shot(`${name}-two-sets`);
    const focusGeometry=await page.evaluate(()=>({bottom:document.activeElement.getBoundingClientRect().bottom,footer:document.querySelector('.sheet-action-footer').getBoundingClientRect().top}));
    assert.ok(focusGeometry.bottom<=focusGeometry.footer-8,`${name}: focused field clears footer ${JSON.stringify(focusGeometry)}`);
    assert.equal(JSON.stringify((await stored()).program),original,'numeric changes are draft only');
  };
  const testReorder=async(name)=>{
    const day=page.locator('.import-day').first(), cards=day.locator('.plan-editor-exercise');
    const before=await cards.evaluateAll(es=>es.map(e=>e.id));
    const handle=cards.first().locator('.plan-editor-summary');
    if(await handle.getAttribute('aria-expanded')==='true')await handle.click();
    await page.waitForTimeout(250); await handle.scrollIntoViewIfNeeded();
    const a=await handle.boundingBox(), b=await cards.nth(1).locator('.plan-editor-summary').boundingBox();
    await page.mouse.move(a.x+24,a.y+a.height/2); await page.mouse.down(); await page.mouse.move(a.x+24,a.y+a.height/2+8,{steps:2});
    assert.equal(await page.locator('.plan-reorder-preview').count(),1,`${name}: real drag listeners attached`);
    await page.mouse.move(b.x+24,b.y+b.height-2,{steps:8}); await page.mouse.up();
    await page.waitForTimeout(600);
    const after=await cards.evaluateAll(es=>es.map(e=>e.id)); assert.notDeepEqual(after,before); assert.deepEqual([...after].sort(),[...before].sort());
    assert.equal(JSON.stringify((await stored()).program),original,'reorder is draft only');
    await shot(`${name}-reordered`);
  };
  const add=async(name)=>{
    const day=page.locator('.import-day').first(); const count=await day.locator('.plan-editor-exercise').count();
    await day.getByRole('button',{name:'+ Add exercise',exact:true}).click(); await shot(`${name}-add`);
    await day.locator('.scratch-exercise-results [role=option]').first().click();
    await page.waitForFunction(n=>document.querySelector('.import-day').querySelectorAll('.plan-editor-exercise').length===n,count+1);
    assert.equal(JSON.stringify((await stored()).program),original,'add is draft only');
  };
  await page.getByRole('button',{name:'PROFILE',exact:true}).click();
  await openProfileArea(page, 'program'); await page.getByRole('button',{name:/^Edit plan/}).click();
  original=JSON.stringify((await stored()).program);
  await shot('profile-edit'); await editNumbers('edit'); await testReorder('edit'); await add('edit');
  await page.getByRole('button',{name:'Close edit plan',exact:true}).click();
  assert.equal(JSON.stringify((await stored()).program),original,'cancel edit preserves original');

  await openProfileArea(page, 'program'); await page.getByRole('button',{name:/Replace plan/}).click();
  await page.getByRole('button',{name:/Import from Notes|Import a different plan/}).click();
  await page.getByPlaceholder(/Paste your workout notes/).fill('Monday - Upper\nBench Press 3x8 or Incline Dumbbell Press 3x10\nCable Fly 2x12');
  await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
  await page.locator('.import-decision-content:visible').getByRole('button',{name:/Bench Press ·/}).click();
  await page.getByRole('button',{name:'REVIEW PLAN',exact:true}).click();
  await page.getByRole('heading',{name:'Review your plan',exact:true}).waitFor();
  await shot('import-review'); await testReorder('import'); await editNumbers('import'); await add('import');
  await page.getByRole('button',{name:'EDIT NOTES',exact:true}).click();
  assert.equal(JSON.stringify((await stored()).program),original,'cancel import preserves original');
  await page.reload();

  await page.getByRole('button',{name:'PROFILE',exact:true}).click();
  await openProfileArea(page, 'program'); await page.getByRole('button',{name:/Replace plan/}).click();
  await page.getByRole('button',{name:/Build a personalized plan/}).click();
  await page.getByRole('button',{name:'BUILD NEW PLAN',exact:true}).click();
  await page.getByRole('heading',{name:'Your week is ready.',exact:true}).waitFor({timeout:60000});
  await shot('generated-review'); await testReorder('generated'); await editNumbers('generated'); await add('generated');
  // No extra Tab: Save must see the value committed by the click's blur.
  const card=page.locator('.plan-editor-exercise').first();
  if(await card.locator('.plan-editor-summary').getAttribute('aria-expanded')!=='true')await card.locator('.plan-editor-summary').click();
  const input=card.getByRole('textbox',{name:/^Sets for/}); await input.fill('4');
  const id=await card.getAttribute('id');
  await page.getByRole('button',{name:'USE THIS PLAN',exact:true}).click();
  await page.waitForFunction(({id})=>JSON.parse(localStorage.getItem('lift-v2-state')).program.days.some(d=>d.exercises.some(e=>`import-exercise-${e.id}`===id&&e.sets.length===4)),{id});
  assert.deepEqual((await stored()).workouts,JSON.parse(JSON.stringify(state.workouts)),'accept preserves workout history');
  assert.deepEqual(errors,[]); await context.close(); console.log(`PASS ${width} ${style} ${appearance}: edit/import/generated, numeric drafts, drag, add, cancel, direct save`);
}
} finally {await browser.close();}
