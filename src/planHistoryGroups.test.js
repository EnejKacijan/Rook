import { describe, it, expect } from 'vitest';
import { groupPlanVersions } from './planHistoryGroups.js';

export function groupingFixture() {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `v${i}`, parentVersionId: i ? `v${i - 1}` : null,
    timestamp: `2026-09-07T10:0${i}:00Z`, source: i ? 'ROOK plan update' : 'Initial plan', reason: null,
    summary: 'Plan details updated', program: { id: 'plan', days: [{ id: 'day', exercises: [{ id: 'exercise', sets: [{ weight: 100 + i * .5, reps: 8 }] }] }] },
  })).reverse();
}
describe('presentation-only version grouping', () => {
  it('keeps Current separate and preserves every original reference in order', () => {
    const versions = groupingFixture(), saved = structuredClone(versions);
    const groups = groupPlanVersions(versions);
    expect(groups.map(g => g.versions.length)).toEqual([1, 6, 1]);
    expect(groups.flatMap(g => g.versions)).toEqual(versions);
    expect(groups[1].versions[0]).toBe(versions[1]);
    expect(versions).toEqual(saved);
  });
  it('leaves a normal three-version list alone', () => {
    expect(groupPlanVersions(groupingFixture().slice(-3)).every(g => g.versions.length === 1)).toBe(true);
  });
  for (const [name, change] of [
    ['manual edits', v => { v.source = 'Manual edit'; }],
    ['different days', (v, i) => { v.timestamp = `2026-09-${String(10 + i).padStart(2, '0')}T10:00:00Z`; }],
    ['different reasons', (v, i) => { v.reason = String(i); }],
    ['replacement plans', (v, i) => { v.program.id = `plan-${i}`; }],
    ['block changes', (v, i) => { v.program.trainingBlock = { id: String(i) }; }],
    ['unknown semantic changes', (v, i) => { v.program.newField = i; }],
    ['large target changes', (v, i) => { v.program.days[0].exercises[0].sets[0].weight = 20 + i * 20; }],
    ['missing parents', v => { v.parentVersionId = 'missing'; }],
    ['session gaps', (v, i) => { v.timestamp = `2026-09-07T${String(10 + i).padStart(2, '0')}:00:00Z`; }],
  ]) it(`does not hide ${name}`, () => {
    const versions = groupingFixture(); versions.forEach(change);
    expect(groupPlanVersions(versions).every(g => g.versions.length === 1)).toBe(true);
  });
});
