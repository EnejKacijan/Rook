import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { isoDay, weekday } from '../src/domain.js';
const output = 'artifacts/coach-entry'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const [width, appearance, style, firstUse] of [[320,'light','standard',true],[390,'light','standard',true],[390,'dark','standard',true],[320,'dark','standard',true],[390,'light','premium',true],[390,'dark','premium',true],[390,'light','standard',false]]) {
    const state = createReturningUserFixture(2); state.activeWorkout = null; state.conversations = []; state.activeCoachConversationId = null;
    state.selectedDay = weekday(); state.selectedDate = isoDay();
    if(firstUse)state.workouts=[];
    Object.assign(state.profile, { appearancePreference: appearance, themePreference: style==='premium'?'premium':appearance, stylePreference: style });
    const prefix=`${width}-${style}-${appearance}-${firstUse?'first':'returning'}`;
    const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: appearance, serviceWorkers: 'block' });
    await context.addInitScript(s => localStorage.setItem('lift-v2-state', JSON.stringify(s)), state);
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/ai/status', r => r.fulfill({ json: { available: true } }));
    await page.route('**/api/ai', r => {
      const body = r.request().postDataJSON();
      const exercises = body.payload?.context?.today?.exercises || [];
      return r.fulfill({ json: { data: { text: 'Here is a 35-minute option for review. Your workout has not changed.', action: { type: 'adapt-today', minutes: 35, exerciseIds: exercises.slice(0, 4).map(e => e.exerciseId) } } } });
    });
    await page.goto(process.env.ROOK_QA_URL||'http://127.0.0.1:4173'); await page.getByRole('button', { name: 'COACH', exact: true }).click();
    const first = page.getByRole('button', { name: 'Shorten today’s workout', exact: true }); await first.waitFor();
    assert.equal(await page.locator('.prompt-list button').count(),3);
    await page.getByRole('button',{name:'Move a workout this week',exact:true}).waitFor();
    await page.getByText('Review proposed changes before you apply them.',{exact:true}).waitFor();
    assert.ok((await page.locator('.prompt-list button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height))).every(height=>height>=44));
    await page.getByText('WHAT COACH KNOWS', { exact: true }).waitFor();
    await page.getByRole('button', { name: /HISTORY/i }).waitFor();
    assert.equal(await page.getByLabel('Ask Coach').getAttribute('placeholder'), 'Ask about your training…');
    await page.waitForTimeout(300); await page.screenshot({ path: `${output}/${prefix}-entry.png` });
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
    await first.click();
    assert.equal(await page.getByLabel('Ask Coach').inputValue(), 'Shorten today’s workout');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByRole('button', { name: 'REVIEW CHANGES', exact: true }).waitFor();
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
    assert.deepEqual(after.program, before.program); assert.deepEqual(after.todayAdaptation, before.todayAdaptation);
    assert.ok(after.conversations.at(-1).reply.action.exerciseIds.length > 0);
    await page.waitForTimeout(300); await page.screenshot({ path: `${output}/${prefix}-proposal.png` });
    await page.getByRole('button', { name: 'REVIEW CHANGES', exact: true }).click();
    await page.getByRole('button', { name: 'APPLY CHANGES', exact: true }).waitFor();
    await page.waitForTimeout(300); await page.screenshot({ path: `${output}/${prefix}-review.png` });
    await page.getByRole('button', { name: 'CANCEL', exact: true }).click();
    assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')))).todayAdaptation, before.todayAdaptation);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); assert.deepEqual(errors, []);
    await context.close(); console.log(`PASS ${prefix}: contextual entry, proposal, review and zero-mutation cancel`);
  }
} finally { await browser.close(); }
