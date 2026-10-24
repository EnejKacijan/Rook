import { expect, it } from 'vitest';
import { CUSTOM_FOCUSES, parseCustomWeeklyStructure } from './customTrainingStructure.js';
import { customWorkoutDraft, customWorkoutText, customWorkoutsComplete, customWorkoutFocusError, customWorkoutConcepts, customWorkoutMuscles, replaceSavedWorkoutFocus, toggleCustomWorkoutFocus, CUSTOM_WORKOUT_MUSCLES } from './customWeeklyWorkouts.js';

it.each([2, 3, 4, 5, 6])('serializes exactly %i workout blocks without accepting empty rows', frequency => {
  const rows = customWorkoutDraft();
  expect(customWorkoutsComplete(rows, frequency)).toBe(false);
  expect(parseCustomWeeklyStructure(customWorkoutText(rows, frequency), frequency)).toBeNull();
  rows.forEach(row => { row.focus = 'Full body'; });
  expect(customWorkoutsComplete(rows, frequency)).toBe(true);
  expect(parseCustomWeeklyStructure(customWorkoutText(rows, frequency), frequency)).toHaveLength(frequency);
});
it('retains the position of a blank middle workout and invalid text', () => {
  const rows = customWorkoutDraft('Day 1: Push\nDay 2: \nDay 3: Heavy magic');
  expect(rows.slice(0, 3).map(row => row.focus)).toEqual(['Push', '', 'Heavy magic']);
  expect(customWorkoutText(rows, 3)).toBe('Day 1: Push\nDay 2: \nDay 3: Heavy magic');
});
it.each([
  ['chest back / shoulders arms / legs', 3, ['Chest & Back', 'Shoulders & Arms', 'Legs']],
  ['push pull legs', 3, ['Push', 'Pull', 'Legs']],
  ['PPL + Upper body / Lower body', 5, ['Push', 'Pull', 'Legs', 'Upper', 'Lower']],
  ['PPLUL', 5, ['Push', 'Pull', 'Legs', 'Upper', 'Lower']],
  ['Upper / Lower split', 3, ['Upper', 'Lower', 'Full Body']],
  ['Total-body', 2, ['Full Body', 'Full Body']],
])('prefills existing structures as individual workouts: %s', (text, frequency, focuses) => {
  expect(customWorkoutDraft(text, frequency).slice(0, frequency).map(row => row.focus)).toEqual(focuses);
});
it('preserves explicitly dated legacy workouts', () => {
  const text = 'Mon: Chest & Back\nWed: Shoulders & Arms\nFri: Legs';
  expect(customWorkoutText(customWorkoutDraft(text), 3)).toBe(text);
});
it.each(['Push / Pull', 'Day 1: Push', 'Mon: Push', 'heavy push', 'unrecognized', 'Push, Pull'])('rejects multiple workouts or unsupported qualifiers in one block: %s', value => {
  expect(customWorkoutFocusError(value)).toBeTruthy();
});
it.each(['Chest + Back', 'Full body', 'Upper', 'Biceps & Triceps', 'Legs'])('accepts a single supported compound or movement focus: %s', value => {
  expect(customWorkoutFocusError(value)).toBeNull();
});
it('adds and removes muscle groups independently in a single workout', () => {
  const two=toggleCustomWorkoutFocus(toggleCustomWorkoutFocus('', 'chest'), 'back');
  expect(two).toBe('Chest & Back');
  expect(customWorkoutConcepts(two)).toEqual(['chest','back']);
  expect(toggleCustomWorkoutFocus(two,'chest')).toBe('Back');
  expect(toggleCustomWorkoutFocus('Back','back')).toBe('');
});
it.each(CUSTOM_WORKOUT_MUSCLES)('muscle choice %s round-trips through the actual generation grammar', key => {
  expect(customWorkoutConcepts(toggleCustomWorkoutFocus('',key))).toEqual([key]);
});
it.each(Object.keys(CUSTOM_FOCUSES))('retains parsing compatibility for saved focus %s', key => {
  expect(customWorkoutConcepts(CUSTOM_FOCUSES[key].label)).toEqual([key]);
});
it('requires an explicit replacement before editing legacy or unrecognized focuses', () => {
  const original='Chest & Back & Push & Pull & Legs & Upper & Lower & Full Body';
  expect(customWorkoutMuscles(original)).toBeNull();
  expect(toggleCustomWorkoutFocus(original,'biceps')).toBe(original);
  expect(replaceSavedWorkoutFocus(original)).toBe('Chest & Back');
  expect(replaceSavedWorkoutFocus('Push')).toBe('');
  expect(customWorkoutConcepts('Heavy quantum')).toBeNull();
  expect(toggleCustomWorkoutFocus('Heavy quantum','chest')).toBe('Heavy quantum');
  expect(toggleCustomWorkoutFocus(replaceSavedWorkoutFocus('Heavy quantum'),'chest')).toBe('Chest');
});
it.each(['push','pull','legs','lower','upper','full-body','torso','limbs','arms','rear-delts','squat'])('does not add %s to a new muscle selection', key => {
  expect(toggleCustomWorkoutFocus('Chest & Back',key)).toBe('Chest & Back');
});
it('uses stable muscle ordering without an arbitrary selection count limit', () => {
  let value='';for(const key of [...CUSTOM_WORKOUT_MUSCLES].reverse())value=toggleCustomWorkoutFocus(value,key);
  expect(customWorkoutMuscles(value)).toEqual(CUSTOM_WORKOUT_MUSCLES);
  expect(customWorkoutConcepts(value)).toEqual(CUSTOM_WORKOUT_MUSCLES);
});
