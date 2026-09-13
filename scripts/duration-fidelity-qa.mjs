import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { estimateWorkoutMinutes, roundedEstimate } from '../src/domain.js';
import { validateDurationFidelity } from '../src/durationPlanning.js';
import { openProfileArea } from './qa-current-navigation.mjs';

const base = process.env.ROOK_QA_URL || 'http://127.0.0.1:4177';
const dir = 'artifacts/ROOK-DURATION-FIDELITY';
await mkdir(`${dir}/screenshots`, { recursive: true });
const results = [], goals = ['Build muscle','Get stronger','Lose fat','General fitness','Athletic performance'];
const cases = [30,45,60,75,90,120,120,120].map((minutes,i)=>({ minutes,
  width:i%2?390:320, appearance:i%4<2?'light':'dark', style:i<4?'standard':'premium',
  goal:goals[i%5], experience:i===6?'Beginner':'Intermediate', days:i===7?2:4 }));
const browser = await chromium.launch({channel:'chrome',headless:true});
let page;
try { for (const [i,test] of cases.entries()) {
  const context = await browser.newContext({viewport:{width:test.width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/ai/status',r=>r.fulfill({json:{available:false}}));
  await page.goto(base,{waitUntil:'networkidle'});
  const button = name => page.getByRole('button',{name,exact:true});
  await button('BUILD MY PLAN').click();
  await page.getByRole('combobox',{name:'Age range'}).click();
  await page.getByRole('option',{name:'18–29',exact:true}).click();await button('CONTINUE').click();
  await button(test.goal).click();
  // Respect the existing 350ms protection across auto-advancing choice steps.
  const selectedAt=await page.evaluate(()=>performance.now());
  await page.waitForFunction(start=>performance.now()-start>=350,selectedAt);
  await page.getByRole('button',{name:new RegExp(`^${test.experience}`)}).click();
  await button(`${test.days} days`).click();await page.getByLabel('Any day works').check();
  for(const minutes of [30,45,60,75,90,120])assert.equal(await button(`${minutes} min`).count(),1);
  await button(`${test.minutes} min`).click();await button('CONTINUE').click();
  await button('Commercial gym').click();await button('CONTINUE').click();
  await button('Balanced').click();await button('CONTINUE').click();
  await page.getByRole('button',{name:/Balanced (workload|starting point)/}).click();await button('CONTINUE').click();
  await page.evaluate(({appearance,style})=>{document.documentElement.dataset.appearance=appearance;document.documentElement.dataset.style=style;},test);
  await button('BUILD MY PLAN').click();
  await page.getByRole('heading',{name:'Your week is ready.',exact:true}).waitFor();
  await page.getByText(`${test.minutes} min target`,{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if (i>=4) await page.screenshot({path:`${dir}/screenshots/${i}-review.png`});
  await button('USE THIS PLAN').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lift-v2-state')||'null')?.profile.onboardingComplete);
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lift-v2-state')));
  const accepted = await stored();
  assert.equal(accepted.profile.sessionMinutes,test.minutes);
  assert.equal(validateDurationFidelity(accepted.program).valid,true);
  const expected=accepted.program.days.map(day=>estimateWorkoutMinutes(day,accepted.profile,accepted.program));
  assert.deepEqual(accepted.program.days.map(day=>day.estimatedMinutes),expected);
  await page.reload({waitUntil:'networkidle'});
  assert.deepEqual((await stored()).program.days.map(day=>day.estimatedMinutes),expected);
  await openProfileArea(page,'program');await page.getByRole('button',{name:/^Edit plan/}).click();
  await page.locator('.plan-workout-compact-summary').first().waitFor({state:'attached'});
  const summaries=await page.locator('.plan-workout-compact-summary').allTextContents();
  for(const [j,text]of summaries.entries())assert.ok(text.includes(`~${roundedEstimate(expected[j])} min`),text);
  // Enter a new set count and save through the real editor; the estimate must
  // track that edit, not fall back to the legacy flat-time calculation.
  const card=page.locator('.plan-editor-exercise').first();
  if(!await card.isVisible())await page.getByRole('button',{name:/Expand .* workout/i}).first().click();
  const summary=card.locator('.plan-editor-summary');
  if(await summary.getAttribute('aria-expanded')!=='true')await summary.click();
  const edit=card.getByRole('button',{name:'EDIT PRESCRIPTION',exact:true});if(await edit.count())await edit.click();
  const sets=card.getByRole('textbox',{name:/^Sets for/});
  const previous=Number(await sets.inputValue());await sets.fill(String(previous===5?4:previous+1));await sets.press('Tab');
  await button('SAVE CHANGES').click();
  await page.reload({waitUntil:'networkidle'});
  const edited=await stored();
  for(const day of edited.program.days)assert.equal(day.estimatedMinutes,estimateWorkoutMinutes(day,edited.profile,edited.program));
  assert.deepEqual(errors,[]);
  results.push({...test,passed:true,preview:true,persistence:true,edit:true,estimatedMinutes:expected});
  console.log(`PASS ${i}: ${test.width} ${test.style} ${test.appearance}, ${test.minutes} min, ${test.goal}: ${expected}`);
  await context.close();
} } catch(error) {
  await page?.screenshot({path:`${dir}/screenshots/browser-failure.png`}).catch(()=>{});
  console.error(await page?.locator('body').innerText().catch(()=>''));throw error;
} finally {
  await browser.close();await writeFile(`${dir}/browser-results.json`,JSON.stringify(results,null,2));
}
