import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createReturningUserFixture } from '../src/demoFixture.js';
import { adaptTodayProposal, isoDay, startWorkout, weekday } from '../src/domain.js';

const root = new URL('../artifacts/coach-stale-proposal/', import.meta.url); await mkdir(root, { recursive: true });
const output = name => fileURLToPath(new URL(name, root));
const state = createReturningUserFixture(1); const day = state.program.days.find(item => item.weekday === weekday()) || state.program.days[0];
state.selectedDay = day.weekday; state.selectedDate = isoDay(); state.activeWorkout = startWorkout(state, day);
const proposal = adaptTodayProposal(state, 35); const conversationId = 'stale-thread'; state.activeCoachConversationId = conversationId;
state.conversations = [{ id: 'stale-entry', conversationId, user: 'Adapt today to 35 minutes.', reply: { text: 'Review the shorter workout below.', action: proposal, source: 'deterministic' }, createdAt: Date.now() }];
state.activeWorkout.exercises[0].sets[0].weight = 47.5; state.activeWorkout.updatedAt += 1; const newerRevision = state.activeWorkout.updatedAt;

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state);
const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'COACH' }).click(); await page.getByRole('button', { name: 'APPLY TO TODAY' }).click();
await page.getByRole('status').filter({ hasText: 'Today’s workout changed' }).waitFor(); await page.screenshot({ path: output('390-stale-conflict.png'), fullPage: false });
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); assert.equal(stored.activeWorkout.updatedAt, newerRevision); assert.equal(stored.activeWorkout.exercises[0].sets[0].weight, 47.5); assert.equal(stored.conversations[0].actionResult.status, 'conflict'); assert.deepEqual(errors, []);
await context.close(); await browser.close(); console.log('Stale Coach proposal QA passed: Apply is rejected and the newer workout revision remains intact.');
