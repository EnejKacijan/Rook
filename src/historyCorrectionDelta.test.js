import { expect, it } from 'vitest';
import { historyCorrectionDelta } from './historyCorrectionDelta.js';

const set = { weight: 60, reps: 8, rir: 2, completed: true, setType: 'standard' };
it('shows only changed standard fields, preserving zero and unknown', () => {
  expect(historyCorrectionDelta(set, { ...set, weight: 65, rir: 0 })).toEqual(['Weight: 60 kg → 65 kg', 'RIR: 2 → 0']);
  expect(historyCorrectionDelta(set, { ...set, reps: null })).toEqual(['Reps: 8 → —']);
  expect(historyCorrectionDelta(set, set)).toEqual([]);
});
it('uses display pounds and timed labels', () => {
  expect(historyCorrectionDelta({ ...set, weight: 0 }, { ...set, weight: 1 }, { units: 'lb' })[0]).toBe('Weight: 0 lb → 2.2 lb');
  expect(historyCorrectionDelta(set, { ...set, reps: 10 }, { measure: 'seconds' })).toEqual(['Seconds: 8 → 10']);
});
it('makes the changed unilateral side explicit without duplicating reps', () => {
  const before = { ...set, sides: { left: { reps: 8 }, right: { reps: 7 } } };
  expect(historyCorrectionDelta(before, { ...before, reps: 6, sides: { left: { reps: 8 }, right: { reps: 6 } } })).toEqual(['Right reps: 7 → 6']);
});
for (const setType of ['drop', 'rest_pause']) it(`isolates ${setType} segment deltas`, () => {
  const segment = { id: 'a', weight: 40, reps: 5, rir: 1, completed: true };
  const before = { ...set, setType, segments: [segment] };
  expect(historyCorrectionDelta(before, { ...before, segments: [{ ...segment, reps: 6 }] })).toEqual(['Segment 1 reps: 5 → 6']);
  expect(historyCorrectionDelta(before, { ...before, segments: [{ ...segment, completed: false }] })).toEqual(['Segment 1 status: Logged → Not logged']);
  expect(historyCorrectionDelta(before, { ...before, segments: [] })).toEqual(['Segment 1 removed: 40 kg · 5 reps · 1 RIR · Logged']);
  expect(historyCorrectionDelta({ ...before, segments: [] }, before)).toEqual(['Segment 1 added: 40 kg · 5 reps · 1 RIR · Logged']);
});
it('keeps logging and set-type corrections explicit', () => {
  expect(historyCorrectionDelta(set, { ...set, completed: false })).toEqual(['Status: Logged → Not logged']);
  expect(historyCorrectionDelta(set, { ...set, setType: 'amrap' })[0]).toContain('AMRAP');
});
