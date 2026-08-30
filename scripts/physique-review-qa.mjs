import { strict as assert } from 'node:assert';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { blankState, buildProgram, combinedTrainingPriorities } from '../src/domain.js';

const root = new URL('../artifacts/physique-review/', import.meta.url); await mkdir(root, { recursive: true });
const output = name => fileURLToPath(new URL(name, root));
const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
const suggestionData = { status: 'success', summary: 'These are optional training ideas, not objective conclusions.', suggestions: [
  { priorityId: 'upper_chest', label: 'Upper chest', priorityLevel: 'high', reason: 'Upper chest may be an area you could emphasize if it matches your goals.' },
  { priorityId: 'lateral_delts', label: 'Lateral delts', priorityLevel: 'moderate', reason: 'Lateral delts could be a useful optional priority.' },
  { priorityId: 'back_width', label: 'Back width', priorityLevel: 'moderate', reason: 'Back width may benefit from additional focus if you want it.' }
], retryMessage: null };
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

async function routes(page, result = suggestionData, delay = 700) {
  await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, provider: 'qa', model: 'vision-qa' }) }));
  await page.route('**/api/ai', async route => { const body = route.request().postDataJSON(); if (body.operation !== 'physique-review') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Not part of Physique Review QA.' }) }); assert.ok(body.payload.photos[0].dataUrl.startsWith('data:image/jpeg')); await new Promise(resolve => setTimeout(resolve, delay)); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: result }) }); });
}
async function reachPriorities(page) {
  await page.getByRole('button', { name: 'BUILD MY PLAN' }).click();
  await page.getByLabel('Age range').selectOption('18–29'); await page.getByRole('button', { name: 'CONTINUE' }).click();
  for (const choice of ['Build muscle', 'Intermediate', '4 days']) { await page.getByRole('button', { name: choice, exact: false }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click(); }
  for (const day of ['Mon', 'Tue', 'Thu', 'Sat']) await page.getByRole('button', { name: day, exact: true }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByRole('button', { name: '60 min' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click(); await page.getByRole('button', { name: 'Commercial gym' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.getByText('What would you like to emphasize?').waitFor();
}

for (const width of [375, 390, 430, 500]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } }); const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message)); await routes(page); await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' }); await reachPriorities(page);
  await page.screenshot({ path: output(`${width}-a-priority-entry.png`) }); await page.getByRole('button', { name: /Not sure what to prioritize/i }).click(); await page.screenshot({ path: output(`${width}-b-intro.png`) }); await page.getByRole('button', { name: 'CONTINUE' }).click(); await page.screenshot({ path: output(`${width}-c-upload.png`) });
  await page.locator('.photo-inputs input').first().setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: pixel }); await page.getByText(/ready/).waitFor(); const pending = page.getByRole('button', { name: 'REVIEW PHOTOS' }).click(); await page.getByText('Reviewing your photos…').waitFor(); await page.screenshot({ path: output(`${width}-d-loading.png`) }); await pending; await page.getByText('Possible areas to emphasize').waitFor(); await page.screenshot({ path: output(`${width}-e-review.png`) });
  await page.getByRole('button', { name: /Back width/i }).click(); await page.screenshot({ path: output(`${width}-f-partial-selection.png`) }); await page.getByRole('button', { name: 'USE THESE PRIORITIES' }).click(); await page.getByText('What would you like to emphasize?').waitFor(); await page.screenshot({ path: output(`${width}-h-return-onboarding.png`) }); assert.deepEqual(errors, []); await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } }); const page = await context.newPage(); await routes(page, { status: 'insufficient', summary: 'Not enough context.', suggestions: [], retryMessage: 'Try clearer photos with more of the body visible.' }, 10); await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' }); await reachPriorities(page); await page.getByRole('button', { name: /Not sure what to prioritize/i }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click(); await page.locator('.photo-inputs input').first().setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: pixel }); await page.getByRole('button', { name: 'REVIEW PHOTOS' }).click(); await page.getByText("We couldn't get a useful physique review from these photos.").waitFor(); await page.screenshot({ path: output('390-g-insufficient.png') }); await context.close();
}

for (const width of [375, 390, 430, 500]) {
  const confirmed = suggestionData.suggestions.slice(0, 2); const state = blankState(); state.profile = { ...state.profile, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 4, availableDays: ['Mon', 'Tue', 'Thu', 'Sat'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], prioritySources: { manual: [], physiqueSuggested: suggestionData.suggestions, physiqueConfirmed: confirmed }, priorities: combinedTrainingPriorities([], confirmed), onboardingComplete: true }; state.program = buildProgram(state.profile);
  const context = await browser.newContext({ viewport: { width, height: 900 } }); await context.addInitScript(value => localStorage.setItem('lift-v2-state', JSON.stringify(value)), state); const page = await context.newPage(); await routes(page); await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'PROFILE', exact: true }).click(); await page.getByText('TRAINING PRIORITIES').waitFor(); await page.screenshot({ path: output(`${width}-i-profile.png`) }); await context.close();
}

await browser.close(); console.log('Physique Review QA passed: onboarding, upload, loading, confirmation, failure, return, profile, and 4 widths.');
