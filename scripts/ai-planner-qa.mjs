import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { WEEKDAYS, blankState, buildProgram, exerciseCatalog, validateProgram } from '../src/domain.js';

const testProfile = { ...blankState().profile, goal: 'Build muscle', experience: 'Beginner', daysPerWeek: 3, availableDays: WEEKDAYS, sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Chest', 'Back'], trainingPreferences: 'I enjoy Upper/Lower, but use whatever structure best fits my goal.' };
const fixture = buildProgram(testProfile);
const authoredWeekdays = ['Tue', 'Thu', 'Sun'];
const authoredNames = ['Hybrid A', 'Hybrid B', 'Hybrid C'];
const authoredPlan = {
  name: 'Goal-led Hybrid',
  days: fixture.days.map((day, index) => ({
    weekday: authoredWeekdays[index],
    location: 'Commercial gym',
    name: authoredNames[index],
    estimatedMinutes: day.estimatedMinutes,
    exercises: day.exercises.map(exercise => ({ exerciseId: exercise.exerciseId, sets: exercise.sets.length, repMin: exercise.repMin, repMax: exercise.repMax, targetRir: exercise.targetRir, restSeconds: exercise.restSeconds }))
  }))
};

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage(); const planRequests = [];
await page.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, provider: 'local-test' }) }));
await page.route('**/api/ai', async route => {
  const body = route.request().postDataJSON();
  if (body.operation === 'plan') planRequests.push(body.payload);
  const data = body.operation === 'follow-ups' ? { questions: [] } : body.operation === 'plan' ? authoredPlan : { text: 'Test reply.', action: null };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
});

await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
assert.equal(await page.getByRole('button', { name: 'BUILD MY PLAN' }).count(), 1, 'landing leads with personalized plan creation'); assert.equal(await page.getByRole('button', { name: /Already have a plan/i }).count(), 1, 'landing exposes existing-plan import'); await page.getByRole('button', { name: /Already have a plan/i }).click(); assert.equal(await page.getByRole('heading', { name: 'Bring your existing workout into Rook.' }).count(), 1); await page.getByRole('button', { name: 'Back to start' }).click(); await page.getByRole('button', { name: 'BUILD MY PLAN' }).click();
await page.getByRole('combobox', { name: 'Age range' }).click(); await page.getByRole('option', { name: '30–39' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
await page.getByRole('button', { name: 'Build muscle' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
const beginnerOption = page.getByRole('button', { name: /Beginner/ }); assert.equal(await beginnerOption.getByText('New to structured training', { exact: true }).count(), 1, 'experience option includes concise guidance'); const beginnerBox = await beginnerOption.boundingBox(); assert.ok(beginnerBox.height >= 58 && beginnerBox.height <= 76, 'experience guidance keeps a comfortable compact touch target'); await beginnerOption.click(); assert.equal((await beginnerOption.getAttribute('class')).includes('selected-option'), true, 'selected state applies to the whole experience option'); await page.getByRole('button', { name: 'CONTINUE' }).click();
await page.getByRole('button', { name: '3 days' }).click();
await page.getByRole('checkbox', { name: 'Make any day available' }).check();
await page.getByRole('button', { name: '60 min' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
assert.equal(await page.locator('.step-count').textContent(), 'STEP 5/8', 'schedule choices share one consolidated step');
await page.getByRole('button', { name: 'Commercial gym' }).click(); assert.equal(await page.getByText('Full gym access', { exact: true }).count(), 1, 'commercial selection confirms implicit equipment');
await page.getByRole('button', { name: 'Home gym' }).click(); assert.equal(await page.getByText('Available equipment', { exact: true }).count(), 1, 'home equipment appears inline'); assert.equal(await page.getByRole('button', { name: 'CONTINUE' }).isDisabled(), true, 'home setup requires at least one equipment choice'); await page.getByRole('button', { name: 'Dumbbells' }).click();
await page.getByRole('button', { name: 'Both' }).click(); assert.equal(await page.getByText('Equipment available at home', { exact: true }).count(), 1, 'Both asks only for home equipment inline'); assert.equal(await page.getByRole('button', { name: 'full gym' }).count(), 0, 'full commercial gym is implicit for Both'); await page.getByRole('button', { name: 'Dumbbells' }).click();
await page.getByRole('button', { name: 'Commercial gym' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click(); assert.equal(await page.getByText('TRAINING PRIORITIES', { exact: true }).count(), 1); assert.equal(await page.locator('.step-count').textContent(), 'STEP 6/8');
await page.locator('.onboarding-content').getByRole('button', { name: 'Chest' }).click(); await page.locator('.onboarding-content').getByRole('button', { name: 'Back' }).click(); await page.getByRole('button', { name: 'CONTINUE' }).click();
assert.equal(await page.getByRole('button', { name: /Balanced starting point/ }).getAttribute('aria-pressed'), 'true', 'balanced effort is selected by default'); await page.getByRole('button', { name: 'CONTINUE' }).click();
await page.getByRole('button', { name: /I have a specific split/ }).click(); await page.getByRole('button', { name: 'Other', exact: true }).click(); await page.getByRole('textbox', { name: 'Other preferred split' }).fill(testProfile.trainingPreferences);
await page.getByRole('button', { name: 'BUILD MY PLAN' }).click();
await page.getByRole('heading', { name: 'Your week is ready.' }).waitFor();
assert.equal(await page.evaluate(() => Boolean(JSON.parse(localStorage.getItem('lift-v2-state'))?.profile?.onboardingComplete)), false, 'generated onboarding plan remains a preview before confirmation');
await page.getByRole('button', { name: 'USE THIS PLAN' }).click();
await page.waitForFunction(() => Boolean(JSON.parse(localStorage.getItem('lift-v2-state'))?.profile?.onboardingComplete));

const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')));
assert.equal(planRequests.length, 0, 'onboarding uses the deterministic personalized generator without external data transfer'); assert.equal(saved.profile.trainingPreferences, testProfile.trainingPreferences, 'soft split preference reaches the personalized generator'); assert.deepEqual(saved.profile.equipment, ['full gym'], 'Commercial setup supplies implicit full-gym access');
assert.equal(saved.ai.lastPlanSource, 'personalized-template'); assert.equal(saved.program.templateId, fixture.templateId, 'the selected split preference produces the expected stable template');
assert.deepEqual(saved.program.days.map(day => day.name), fixture.days.map(day => day.name), 'the local generator preserves the preference-shaped session structure');
assert.equal(validateProgram(saved.program, saved.profile, { requireProgramQuality: true }).valid, true, 'the accepted local plan passes the full quality contract');
await page.reload({ waitUntil: 'networkidle' }); const reloaded = await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); assert.equal(reloaded.profile.environment, 'Commercial gym'); assert.deepEqual(reloaded.profile.equipment, ['full gym'], 'conditional equipment semantics persist after reload');
const importContext = await browser.newContext({ viewport: { width: 390, height: 844 } }); const importPage = await importContext.newPage();
const importedFixture = structuredClone(authoredPlan); importedFixture.days.forEach(day => day.exercises.forEach(exercise => { exercise.sourceName = exerciseCatalog[exercise.exerciseId].name; exercise.targetRir = null; exercise.restSeconds = null; exercise.notes = null; })); importedFixture.days[0].exercises[0].sourceName = 'Rotating Iso Cable Sweep'; importedFixture.days[0].exercises[0].exerciseId = 'seated-cable-row';
await importPage.route('**/api/ai/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, provider: 'local-test' }) }));
await importPage.route('**/api/ai', async route => { const body = route.request().postDataJSON(); const data = body.operation === 'import-plan' ? importedFixture : body.operation === 'follow-ups' ? { questions: [] } : { text: 'Test reply.', action: null }; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) }); });
const importSourceText = importedFixture.days.flatMap(day => [`${day.weekday} · ${day.name}`, ...day.exercises.map(exercise => `${exercise.sourceName} — ${exercise.sets} × ${exercise.repMin}–${exercise.repMax}`)]).join('\n');
await importPage.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' }); await importPage.getByRole('button', { name: /Already have a plan/i }).click(); await importPage.getByPlaceholder(/Paste your workout notes/).fill(importSourceText); await importPage.getByRole('button', { name: 'CREATE PREVIEW' }).click(); await importPage.getByRole('button', { name: 'USE THIS PLAN' }).waitFor(); assert.equal(await importPage.locator('.import-exercise').filter({ hasText: 'Rotating Iso Cable Sweep' }).count(), 1, 'preview preserves an exact custom source name'); assert.equal(await importPage.getByText('Check exercise name', { exact: true }).count(), 0, 'an exact custom source name does not use obsolete error wording'); assert.equal(await importPage.getByText(/0 RIR/).count(), 0, 'missing RIR is not invented in preview'); assert.equal(await importPage.getByRole('button', { name: 'KEEP ALL AS CUSTOM' }).count(), 1, 'an unmatched source name has one explicit bulk custom-resolution action'); await importPage.getByRole('button', { name: 'KEEP ALL AS CUSTOM' }).click(); await importPage.getByRole('button', { name: 'USE THIS PLAN' }).click(); await importPage.waitForFunction(() => Boolean(JSON.parse(localStorage.getItem('lift-v2-state'))?.profile?.onboardingComplete)); let imported = await importPage.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); assert.equal(imported.program.source, 'ai-import'); assert.equal(imported.program.days[0].exercises[0].importedName, 'Rotating Iso Cable Sweep'); assert.match(imported.program.days[0].exercises[0].exerciseId, /^imported-custom-/); assert.equal(imported.profile.environment, 'Commercial gym'); assert.deepEqual(imported.profile.equipment, ['full gym']); await importPage.reload({ waitUntil: 'networkidle' }); imported = await importPage.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state'))); assert.equal(imported.program.source, 'ai-import', 'landing import persists after reload'); assert.equal(imported.program.days[0].exercises[0].importedName, 'Rotating Iso Cable Sweep', 'custom identity persists after reload');
await importContext.close(); await browser.close();
console.log('AI planner QA passed: landing routes, personalized plan preservation, conditional equipment, Notes import, and persistence verified without external data transfer.');
