import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PlanConflictResolution, conflictReplacementCandidates, planEditorExerciseAllowed, createPlanEditorExerciseFilter } from './PlanConflictResolution.jsx';
import { blankState, exerciseCatalog, isExerciseAllowed } from './domain.js';

let host, root;
const exercise = { id: 'slot', exerciseId: 'leg-press', repMin: 8, repMax: 12, sets: [{id:'s'}] };
const day = { exercises: [exercise, {id:'other', exerciseId:'leg-curl'}] };
const profile = { ...blankState().profile, equipment: 'gym', avoid: 'Avoid leg press' };
const conflict = { reason: 'movement', context: 'explicit-limit' };
for (const avoid of ['', 'Avoid leg press', 'Avoid squats', 'My knee hurts']) {
  it(`batch filtering preserves every existing restriction decision: ${avoid || 'none'}`, () => {
    const current = { ...profile, equipment:['full gym'], avoid };
    const items = [...Object.values(exerciseCatalog),
      { ...exerciseCatalog['cable-fly'], id:'custom-complete', custom:true },
      { ...exerciseCatalog['cable-fly'], id:'custom-incomplete', custom:true, pattern:'', muscles:['Full body'] }];
    expect(items.filter(createPlanEditorExerciseFilter(current)).map(item=>item.id))
      .toEqual(items.filter(item=>planEditorExerciseAllowed(item,current)).map(item=>item.id));
  });
}
it('a new profile gets a fresh filter rather than cached restriction decisions', () => {
  const free = createPlanEditorExerciseFilter({ ...profile, equipment:['full gym'], avoid:'' });
  const restricted = createPlanEditorExerciseFilter({ ...profile, equipment:['full gym'] });
  expect(free(exerciseCatalog['leg-press'])).toBe(true);
  expect(restricted(exerciseCatalog['leg-press'])).toBe(false);
});
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const render = async (props = {}) => act(async () => root.render(<PlanConflictResolution exercise={exercise} day={day} profile={profile} conflict={conflict} {...props} />));
const click = async text => act(async () => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text)).click());

it('only offers compatible allowed replacements, excluding self and existing exercises', () => {
  const choices = conflictReplacementCandidates(exercise, day, profile, conflict);
  expect(choices.length).toBeGreaterThan(0);
  expect(choices.every(item => isExerciseAllowed(item, profile))).toBe(true);
  expect(choices.some(item => ['leg-press','leg-curl','ab-wheel'].includes(item.id))).toBe(false);
});
it('never recommends an equivalent movement for symptom context or effort-only conflicts', () => {
  expect(conflictReplacementCandidates(exercise, day, profile, {...conflict, context:'pain'})).toEqual([]);
  expect(conflictReplacementCandidates(exercise, day, profile, {reason:'effort'})).toEqual([]);
});
it('starts focused on replacement without opening the picker or prescription fields', async () => {
  await render();
  expect(host.textContent).toContain('Choose a replacement');
  expect(host.querySelector('[role="listbox"]')).toBeNull();
  expect(host.querySelector('input')).toBeNull();
  expect(host.textContent).not.toContain('CREATE SUPERSET');
});
it('only changes a draft through explicit selection', async () => {
  const onReplace = vi.fn(); await render({onReplace});
  await click('CHOOSE REPLACEMENT'); expect(onReplace).not.toHaveBeenCalled();
  await act(async () => host.querySelector('[role="option"]').click());
  expect(onReplace).toHaveBeenCalledOnce();
  expect(onReplace.mock.calls[0][0]).not.toBe(exercise.exerciseId);
});
it('shows an honest empty state without falling back to the catalog', async () => {
  await render({ exercise:{...exercise,exerciseId:'unknown-no-metadata'} });
  await click('CHOOSE REPLACEMENT');
  expect(host.textContent).toContain('No matching replacement found');
  expect(host.querySelector('[role="option"]')).toBeNull();
});
it('does not allow removal of the last exercise', async () => {
  await render({day:{exercises:[exercise]}});
  expect([...host.querySelectorAll('button')].find(b=>b.textContent==='REMOVE EXERCISE').disabled).toBe(true);
});
it('effort correction is explicit, constrained, and does not replace the exercise', async () => {
  const onEffort=vi.fn(),onReplace=vi.fn(); await render({conflict:{reason:'effort'},minimumRir:3,onEffort,onReplace});
  expect(host.textContent).toContain('EFFORT CONFLICT');
  expect([...host.querySelectorAll('option')].map(o=>o.value)).toEqual(['','3','4']);
  expect(onEffort).not.toHaveBeenCalled();
  const select=host.querySelector('select');
  expect(select.value).toBe('');
  await act(async()=>{select.value='3';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(onEffort).toHaveBeenCalledTimes(1); expect(onEffort).toHaveBeenCalledWith(3); expect(onReplace).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('APPLY EFFORT');
  expect(exerciseCatalog[exercise.exerciseId]).toBeDefined();
});

it('opens broader search only by explicit choice, without implying equivalence', async () => {
  await render({allExercises:Object.values(exerciseCatalog)});
  await click('CHOOSE REPLACEMENT');
  expect(host.textContent).not.toContain('Ab Wheel');
  await click('SEARCH OTHER EXERCISES');
  expect(host.querySelector('input').placeholder).toBe('Search exercises');
  expect(host.textContent).toContain('not equivalent replacements');
  expect(host.querySelector('[aria-label="Other exercises"]')).not.toBeNull();
  const offered=[...host.querySelectorAll('[role="option"]')].map(el=>el.textContent);
  expect(offered).not.toContain(exerciseCatalog['leg-press'].name);
  expect(offered).not.toContain(exerciseCatalog['leg-curl'].name);
  await click('SHOW SIMILAR EXERCISES');
  expect(host.querySelector('input').placeholder).toBe('Search similar exercises');
});
it('opens the canonical custom editor only through its explicit action', async () => {
  const onCreateCustom=vi.fn();await render({onCreateCustom});
  await click('CHOOSE REPLACEMENT');
  expect(onCreateCustom).not.toHaveBeenCalled();
  await click('CREATE CUSTOM EXERCISE');
  expect(onCreateCustom).toHaveBeenCalledWith('');
});
it('keeps custom exercises without sufficient metadata out of restricted plans', () => {
  const custom={...exerciseCatalog['leg-press'],id:'custom-machine',name:'My machine',custom:true,pattern:null};
  expect(planEditorExerciseAllowed(custom, profile)).toBe(false);
  expect(planEditorExerciseAllowed(custom, {...blankState().profile,equipment:['full gym'],avoid:''})).toBe(true);
});
