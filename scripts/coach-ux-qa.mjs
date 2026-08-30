import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, weekday, WEEKDAYS } from '../src/domain.js';
import { createReturningUserFixture } from '../src/demoFixture.js';

const outputRoot = new URL('../artifacts/coach-ux/', import.meta.url); await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const today = weekday(); const otherDay = WEEKDAYS[(WEEKDAYS.indexOf(today) + 3) % 7];

function freshFixture() {
  const state = blankState(); state.profile = { ...state.profile, name: 'Alex', goal: 'Build muscle', experience: 'Beginner', daysPerWeek: 2, availableDays: [today, otherDay], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true }; state.program = buildProgram(state.profile); state.program.source = 'ai'; state.selectedDay = today; return state;
}
async function setup(state, width = 390, requests = []) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' }); await context.addInitScript(value => { if (!localStorage.getItem('lift-v2-state')) localStorage.setItem('lift-v2-state', JSON.stringify(value)); }, state); const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, provider: 'qa' }) }));
  await page.route('**/api/ai', async route => {
    if (route.request().url().endsWith('/status')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, provider: 'qa' }) });
    const body = JSON.parse(route.request().postData()); requests.push(body);
    if (body.operation !== 'coach') return route.continue();
    const exercises = body.payload?.context?.today?.exercises || [];
    const adapt = /adapt/i.test(body.payload?.message || '');
    const data = adapt
      ? { text: `I'd keep the highest-value exercises and remove the accessories. This fits the requested time without changing your permanent program.`, action: { type: 'adapt-today', exerciseIds: exercises.slice(0, Math.min(4, exercises.length)).map(item => item.exerciseId), minutes: 35 } }
      : { text: 'Use the latest completed sets as the signal. Keep the current load unless all completed sets reached the top of the programmed range.', action: null };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' }); return { context, page, errors };
}
async function snap(page, name, width = 390) { await page.setViewportSize({ width, height: 844 }); await page.screenshot({ path: output(`${width}-${name}.png`), fullPage: false }); }

// Fresh Coach home, active chat, action lifecycle, history, navigation, and reload persistence.
{
  const { context, page, errors } = await setup(freshFixture()); await page.getByRole('button', { name: 'COACH' }).click();
  assert.equal(await page.getByText('SHORTCUTS', { exact: true }).count(), 1); assert.equal(await page.getByRole('button', { name: 'Adapt today to 35 minutes.' }).count(), 1); assert.equal(await page.getByRole('button', { name: 'Am I ready to increase a lift?' }).count(), 0); assert.equal(await page.getByRole('button', { name: 'Help me understand my recent progress.' }).count(), 0);
  for (const width of [375, 390, 430, 500]) await snap(page, 'new-conversation', width); await page.setViewportSize({ width: 390, height: 844 });
  const permanentCount = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).program.days.find(day => day.weekday === ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]).exercises.length);
  await page.getByRole('button', { name: 'Adapt today to 35 minutes.' }).click(); await page.getByRole('button', { name: 'APPLY TO TODAY' }).waitFor();
  assert.equal(await page.getByText('SHORTCUTS', { exact: true }).count(), 0); assert.equal(await page.getByRole('heading', { name: 'Your plan and real training data, in context.' }).count(), 0); assert.equal(await page.getByText('Conversation', { exact: true }).count(), 1); await snap(page, 'active-proposal');
  for (const width of [375, 390, 430, 500]) { await page.setViewportSize({ width, height: 844 }); const trigger = page.getByRole('button', { name: 'Conversation history' }); const collapsedTrigger = await trigger.boundingBox(); await trigger.click(); await page.waitForTimeout(180); const surface = await page.locator('.coach-history-surface').boundingBox(); assert.ok(Math.abs(surface.width - width) < 1, `history fills the mobile viewport at ${width}px`); await page.getByRole('button', { name: 'Back to Coach' }).click(); await page.waitForTimeout(180); assert.deepEqual(await trigger.boundingBox(), collapsedTrigger, `history trigger remains pixel-stable at ${width}px`); }
  await page.setViewportSize({ width: 390, height: 844 });
  const composer = await page.locator('.coach-input').boundingBox(); const nav = await page.locator('.bottom-nav').boundingBox(); assert.ok(Math.abs(composer.y + composer.height - nav.y) < 2, 'compact composer remains directly above navigation'); assert.ok(composer.height <= 70, 'composer footprint stays compact');
  await page.getByRole('button', { name: 'APPLY TO TODAY' }).click(); await page.getByRole('status').filter({ hasText: 'Today updated' }).waitFor(); assert.equal(await page.getByRole('button', { name: 'APPLY TO TODAY' }).count(), 0); await page.waitForTimeout(50); const confirmation = await page.locator('.today-update-confirmation').boundingBox(); const viewToday = await page.getByRole('button', { name: 'View workout →' }).boundingBox(); const appliedComposer = await page.locator('.coach-input').boundingBox(); assert.ok(confirmation.height <= 110, `applied confirmation stays compact, got ${confirmation.height}px`); assert.ok(viewToday.y + viewToday.height <= appliedComposer.y, 'applied action remains visible above the composer'); await snap(page, 'applied-to-today');
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); const adaptedCount = stored.todayAdaptation.exerciseIds.length; assert.ok(adaptedCount < permanentCount); assert.equal(stored.program.days.find(day => day.weekday === today).exercises.length, permanentCount, 'base program stays unchanged'); assert.equal(stored.conversations[0].actionResult.status, 'applied');
  const conversationBeforeMenu = await page.locator('.conversation').boundingBox(); await page.getByRole('button', { name: 'Conversation history' }).click(); assert.equal(await page.locator('.coach-history-surface').count(), 1, 'conversation history opens as a dedicated surface'); const conversationBehindMenu = await page.locator('.conversation').boundingBox(); assert.equal(conversationBehindMenu.y, conversationBeforeMenu.y, 'opening history does not move the conversation'); await page.waitForTimeout(220); await snap(page, 'history-overlay'); const messageCount = stored.conversations.length; await page.getByRole('button', { name: 'NEW', exact: true }).click(); assert.equal(await page.getByText('SHORTCUTS', { exact: true }).count(), 1); assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).conversations.length), messageCount, 'opening a new conversation creates no fake record'); await snap(page, 'new-after-history', 375);
  await page.getByRole('button', { name: 'Conversation history' }).click(); assert.equal(await page.getByRole('heading', { name: 'Conversation history' }).count(), 1); await page.locator('.coach-history-group button').first().click(); await page.getByRole('status').filter({ hasText: 'Today updated' }).waitFor();
  await page.getByRole('button', { name: 'TODAY', exact: true }).click(); await page.getByRole('button', { name: 'COACH', exact: true }).click(); assert.equal(await page.getByRole('status').filter({ hasText: 'Today updated' }).count(), 1, 'applied state survives leave and return');
  await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'COACH' }).click(); assert.equal(await page.getByRole('status').filter({ hasText: 'Today updated' }).count(), 1, 'applied state survives reload'); stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); assert.equal(stored.todayAdaptation.exerciseIds.length, adaptedCount);
  await page.getByRole('button', { name: 'View workout →' }).click(); const todayMeta = await page.locator('.today-hero > p').textContent(); assert.match(todayMeta, new RegExp(`^${adaptedCount} exercises`)); assert.match(todayMeta, new RegExp(`~${Math.round(stored.todayAdaptation.estimatedMinutes / 5) * 5} min`), 'Today shows the persisted honest estimate, not the requested duration'); await page.getByRole('button', { name: 'START WORKOUT' }).click(); assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.exercises.length), adaptedCount); assert.deepEqual(errors, [], `fresh Coach console errors: ${errors.join('; ')}`); await context.close();
}

// Long active chat keeps the latest content and composer accessible.
{
  const state = freshFixture(); state.activeCoachConversationId = 'thread-long'; state.conversations = Array.from({ length: 9 }, (_, index) => ({ id: `long-${index}`, conversationId: 'thread-long', user: `Question ${index + 1} about today’s plan`, reply: { text: 'Keep the current prescription for now. Use completed sets and form quality as the next decision signal.', action: null }, createdAt: index + 1 }));
  const { context, page, errors } = await setup(state, 430); await page.getByRole('button', { name: 'COACH' }).click(); await page.waitForTimeout(100); const scroll = await page.locator('.coach-scroll').evaluate(node => ({ top: node.scrollTop, max: node.scrollHeight - node.clientHeight })); assert.ok(scroll.max - scroll.top < 4, 'long conversation opens at latest message'); await snap(page, 'long-conversation', 430); assert.equal(await page.getByText('SHORTCUTS', { exact: true }).count(), 0); assert.deepEqual(errors, []); await context.close();
}

// Returning user gets history-aware shortcuts and sends actual workout history to Coach.
{
  const requests = []; const returning = createReturningUserFixture(3); returning.activeCoachConversationId = null; const { context, page, errors } = await setup(returning, 500, requests); await page.getByRole('button', { name: 'COACH' }).click(); assert.equal(await page.getByRole('button', { name: 'Am I ready to increase a lift?' }).count(), 1); assert.equal(await page.getByRole('button', { name: 'Help me understand my recent progress.' }).count(), 1); await snap(page, 'returning-home', 500); await page.getByRole('button', { name: 'Am I ready to increase a lift?' }).click(); await page.getByText(/Use the latest completed sets/).waitFor({ timeout: 8000 }).catch(async () => { throw new Error(`Returning Coach reply missing. UI: ${await page.locator('body').innerText()} Requests: ${JSON.stringify(requests)}`); }); const coachRequest = requests.find(body => body.operation === 'coach'); assert.ok(coachRequest.payload.context.recentWorkouts.length > 0, 'returning Coach request contains real history'); await snap(page, 'returning-active', 500); assert.deepEqual(errors, []); await context.close();
}

await browser.close(); console.log('Coach UX QA passed: contextual home, compact chat, history/new conversation, applied persistence, real Today adaptation, reload, long scroll, and returning history.');
