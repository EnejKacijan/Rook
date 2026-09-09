import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { blankState } from '../src/domain.js';
import { createReturningUserFixture } from '../src/demoFixture.js';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const flow of ['import','freestyle']) for (const width of [320,390]) {
    const appearance = width === 320 ? 'dark' : 'light';
    const state = flow === 'import' ? blankState() : createReturningUserFixture(3); state.activeWorkout = null;
    state.profile.avoid = ''; state.profile.trainingSafety = null;
    Object.assign(state.profile, { appearancePreference: appearance, stylePreference: 'standard', themePreference: appearance });
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addInitScript(s => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(s)); }, state);
    const page = await context.newPage(), errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.route('**/api/**', r=>r.fulfill({json:{available:false}}));
    await page.goto('http://127.0.0.1:4173', {waitUntil:'networkidle'});
    let search, results;
    if (flow === 'import') {
      await page.getByRole('button',{name:/Already have a plan/}).click();
      await page.getByPlaceholder(/Paste your workout notes/).fill('MONDAY — UPPER\nMystery movement 3 x 8');
      await page.getByRole('button',{name:'CREATE PREVIEW',exact:true}).click();
      await page.getByRole('heading',{name:'Match this exercise',exact:true}).waitFor();
      search=page.locator('.import-decision-content[data-active="true"] input[type="search"]');
      results=page.locator('.import-decision-content[data-active="true"] .import-resolution-options button');
    } else {
      await page.getByRole('button',{name:'Start freestyle workout',exact:true}).click();
      await page.getByRole('button',{name:'+ ADD EXERCISE',exact:true}).click();
      search=page.getByRole('searchbox',{name:'Search exercises',exact:true});
      results=page.locator('.freestyle-picker .list-row');
    }
    await search.fill('pull ups'); await results.first().waitFor();
    assert.match(await results.first().innerText(), /^Pull-up(?:\s|$)/);
    await search.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    await page.screenshot({path:`artifacts/exercise-search/${width}-standard-${appearance}-${flow}.png`});
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'null'));
    await results.first().click();
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'null'));
    if(flow==='freestyle') assert.equal(after.activeWorkout.exercises[0].exerciseId,'pull-up');
    else assert.equal(after?.program ?? null,null,'matching does not accept/import the plan');
    assert.deepEqual(after?.workouts,before?.workouts,'search and selection do not write history');
    assert.deepEqual(errors,[]); console.log(`PASS ${flow} ${width}`); await context.close();
  }
} finally {await browser.close();}
