import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, weekday, WEEKDAYS } from '../src/domain.js';

const outputRoot = new URL('../artifacts/coach-history/', import.meta.url); await mkdir(outputRoot, { recursive: true });
const output = name => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const now = Date.now(); const today = weekday(); const otherDay = WEEKDAYS[(WEEKDAYS.indexOf(today) + 3) % 7];

function fixture(threadCount, { activeIndex = 0, longTitle = false } = {}) {
  const state = blankState(); state.profile = { ...state.profile, name: 'Alex', goal: 'Build muscle', experience: 'Beginner', daysPerWeek: 2, availableDays: [today, otherDay], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true }; state.program = buildProgram(state.profile); state.program.source = 'ai'; state.selectedDay = today;
  state.conversations = [];
  for (let threadIndex = 0; threadIndex < threadCount; threadIndex += 1) {
    const conversationId = `thread-${threadIndex}`; const count = threadIndex % 4 + 1; const age = threadIndex < 3 ? 0 : threadIndex < 7 ? 1 : threadIndex - 5; const baseTime = now - age * 86400000 - threadIndex * 900000;
    for (let messageIndex = 0; messageIndex < count; messageIndex += 1) state.conversations.push({ id: `${conversationId}-${messageIndex}`, conversationId, user: messageIndex === 0 ? longTitle && threadIndex === 0 ? 'Move Upper A to Tuesday and adjust every exercise so the complete session fits into the unusually short window I have available' : ['Adapt today to 35 minutes.', 'Move Upper A to Tuesday', 'Add light training on Tuesday', 'Review my recent bench progress'][threadIndex % 4] : `Follow-up ${messageIndex}`, reply: { text: 'Coach response', action: messageIndex === 0 && threadIndex === 1 ? { type: 'adapt-today', exerciseIds: [], minutes: 35 } : null }, actionResult: messageIndex === 0 && threadIndex === 1 ? { status: 'applied', appliedAt: baseTime, scope: 'current-week' } : undefined, createdAt: baseTime + messageIndex * 1000 });
  }
  state.activeCoachConversationId = threadCount ? `thread-${Math.min(activeIndex, threadCount - 1)}` : null; return state;
}

async function openHistory(state, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' }); await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state); const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, provider: 'qa' }) }));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'COACH', exact: true }).click(); await page.getByRole('button', { name: 'Conversation history' }).click(); await page.locator('.coach-history-surface').waitFor(); await page.waitForTimeout(220); return { context, page, errors };
}

for (const scenario of [{ name: '0-conversations', count: 0 }, { name: '1-conversation', count: 1 }, { name: '5-conversations', count: 5, activeIndex: 2 }, { name: 'long-title', count: 5, longTitle: true }]) {
  const { context, page, errors } = await openHistory(fixture(scenario.count, scenario));
  assert.equal(await page.locator('.coach-history-group button').count(), scenario.count);
  assert.equal(await page.locator('.coach-history-group button[aria-current="true"]').count(), scenario.count ? 1 : 0);
  assert.equal(await page.locator('.coach-history-group button > i').count(), 0, 'current conversation does not use a redundant status dot');
  assert.equal(await page.locator('.coach-history-chevron').count(), scenario.count, 'conversation navigation rows use one subtle trailing chevron');
  const header = await page.locator('.coach-history-header').boundingBox(); assert.ok(header.y >= 0 && header.y < 2, `history header stays fixed at the top: ${JSON.stringify(header)}`);
  if (!scenario.count) { assert.equal(await page.getByRole('heading', { name: 'No conversations yet' }).count(), 1); assert.equal(await page.getByText('Your Coach conversations will appear here.', { exact: true }).count(), 1); }
  if (scenario.count) {
    assert.match(await page.locator('.coach-history-group small').first().textContent(), /^\d+ messages? · \d{1,2}:\d{2} [AP]M$/, 'recent conversations show message count and time');
    const row = page.locator('.coach-history-group button').first(); const box = await row.boundingBox(); assert.ok(box.height >= 48, `row has an adequate mobile hit area: ${box.height}`);
  }
  if (scenario.longTitle) assert.equal(await page.locator('.coach-history-group strong').first().evaluate(node => node.scrollWidth > node.clientWidth), true, 'long title truncates');
  await page.screenshot({ path: output(`390-${scenario.name}.png`), fullPage: false }); assert.deepEqual(errors, []); await context.close();
}

{
  const original = fixture(18, { activeIndex: 8 }); const appliedResult = original.conversations.find(entry => entry.actionResult)?.actionResult; const { context, page, errors } = await openHistory(original);
  const scroller = page.locator('.coach-history-scroll'); const geometry = await scroller.evaluate(node => ({ height: node.clientHeight, scrollHeight: node.scrollHeight })); assert.ok(geometry.scrollHeight > geometry.height, '15+ conversations scroll independently');
  assert.match(await page.locator('.coach-history-group small').last().textContent(), /^\d+ messages? · [A-Z][a-z]{2} \d{1,2}$/, 'older conversations show message count and date');
  const coachTopBefore = await page.locator('.coach-scroll').evaluate(node => node.scrollTop); await scroller.evaluate(node => { node.scrollTop = 360; }); const savedTop = await scroller.evaluate(node => node.scrollTop); assert.ok(savedTop > 100);
  await page.screenshot({ path: output('390-18-conversations-scrolled.png'), fullPage: false }); await page.getByRole('button', { name: 'Back to Coach' }).click(); assert.equal(await page.locator('.coach-scroll').evaluate(node => node.scrollTop), coachTopBefore, 'history does not scroll the conversation'); await page.getByRole('button', { name: 'Conversation history' }).click(); await page.waitForTimeout(50); assert.ok(Math.abs(await scroller.evaluate(node => node.scrollTop) - savedTop) < 2, 'history scroll position is restored after the opening frame');
  await page.locator('.coach-history-group button').last().click(); assert.equal(await page.locator('.coach-history-surface').count(), 0); const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); assert.equal(stored.activeCoachConversationId, 'thread-17'); assert.deepEqual(stored.conversations.find(entry => entry.actionResult)?.actionResult, appliedResult, 'action result history remains intact'); assert.deepEqual(errors, []); await context.close();
}

{
  const { context, page, errors } = await openHistory(fixture(18, { activeIndex: 4 }), 320); const surface = await page.locator('.coach-history-surface').boundingBox(); assert.ok(Math.abs(surface.x) < 1 && Math.abs(surface.y) < 1, `history starts at viewport origin: ${JSON.stringify(surface)}`); assert.ok(Math.abs(surface.width - 320) < 1); assert.ok((await page.locator('.coach-history-header h2').boundingBox()).width > 120); await page.screenshot({ path: output('320-18-conversations.png'), fullPage: false }); assert.deepEqual(errors, []); await context.close();
}

await browser.close(); console.log('Coach history QA passed: empty, single, many, long-title, active, independent-scroll, persistence, and narrow mobile states are correct.');
