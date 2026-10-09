import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { PersonalThemesProvider, usePersonalThemes } from './PersonalThemesContext.jsx';
import { Profile } from './App.jsx';
import { SavedWorkouts } from './SavedWorkouts.jsx';
import { createReturningUserFixture } from './demoFixture.js';
import { saveWorkoutTemplate, templateDraft } from './savedWorkouts.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); root = null; vi.unstubAllGlobals(); });
it('exposes appearance, without fabricating Pro access or a purchase authority', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  let value;
  function Probe() { value = usePersonalThemes(); return <main className="app-shell">Training</main>; }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<PersonalThemesProvider Modal={() => null} Header={() => null}><Probe /></PersonalThemesProvider>));
  expect(value.openThemes).toBeTypeOf('function');
  for (const name of ['active', 'gate', 'purchase', 'restore', 'billingState', 'coachUsed']) expect(value).not.toHaveProperty(name);
});
it('shows temporary plans to an ordinary user and contains no subscription utility', () => {
  const state = createReturningUserFixture(0);
  const html = renderToStaticMarkup(<Profile state={state} update={() => {}} setDetail={() => {}} setPage={() => {}} />);
  expect(html).not.toContain('ROOK Pro'); expect(html).not.toContain('Subscription and restore purchases');
  // Program is the existing owner of the temporary-plan action.
  expect(readFileSync('src/App.jsx', 'utf8')).toContain('<strong>Temporary plan</strong>');
});
it('allows creating another saved workout after the former four-workout threshold', async () => {
  let state = createReturningUserFixture(0);
  for (let index = 0; index < 6; index++) state = saveWorkoutTemplate(state,
    { ...templateDraft(state.program.days[0], state), name: `Workout ${index + 1}` }, { id: `free-access-${index}` });
  const editor = vi.fn(() => <div>Workout editor</div>);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<SavedWorkouts state={state} update={() => {}} close={() => {}}
    Header={() => null} Editor={editor} />));
  const create = [...host.querySelectorAll('button')].find(button => button.textContent === '+ CREATE WORKOUT');
  await act(async () => create.click());
  expect(editor).toHaveBeenCalled(); expect(host.textContent).toContain('Workout editor');
  expect(document.querySelector('.rook-pro-paywall')).toBeNull();
});
it('cannot opt into checkout or offline Pro preview through an environment setting', () => {
  const releaseSources = ['App.jsx', 'main.jsx', 'aiService.js', 'useCoachAvailability.js', 'SavedWorkouts.jsx', 'TemporaryPlanSheet.jsx', 'PersonalThemesContext.jsx'];
  for (const file of releaseSources) expect(readFileSync(`src/${file}`, 'utf8'))
    .not.toMatch(/VITE_ROOK_PRO_ROLLOUT|LOCAL_PRO_REVIEW|ProReviewContext|proFreeExperience|subscriptionBilling|\.gate\(/);
  for (const file of ['RookProPaywall.jsx', 'subscriptionBilling.js', 'subscriptionPolicy.js', 'storeProducts.js', 'proReviewMode.js'])
    expect(existsSync(`src/${file}`)).toBe(false);
  expect(JSON.parse(readFileSync('package.json', 'utf8')).dependencies).not.toHaveProperty('@revenuecat/purchases-capacitor');
});
