import { describe, expect, it, vi } from 'vitest';
import { runPlanQualityPipeline } from './planPipeline.js';

describe('plan quality orchestration', () => {
  it('reviews the whole candidate and performs a targeted repair before final validation', async () => {
    const invalid = { name: 'Candidate', days: [] }; const repaired = { name: 'Candidate', days: [{ weekday: 'Mon' }] };
    const generateCandidate = vi.fn(async () => invalid); const repairCandidate = vi.fn(async input => { expect(input.candidatePlan).toBe(invalid); expect(input.issues.some(issue => issue.code === 'day_count')).toBe(true); return repaired; });
    const reviewCandidate = vi.fn(async input => input.candidatePlan.days.length ? { verdict: 'pass', overallScore: 92, issues: [] } : { verdict: 'repair', overallScore: 40, issues: [{ code: 'weekly_structure', severity: 'major', workoutDay: null, exerciseId: null, explanation: 'No usable week.', repairInstruction: 'Add the requested sessions.' }] });
    const stages = []; const result = await runPlanQualityPipeline({ payload: { profile: { daysPerWeek: 1 } }, generateCandidate, repairCandidate, reviewCandidate, validateCandidate: plan => plan.days.length ? { valid: true, issues: [] } : { valid: false, issues: [{ code: 'day_count', day: null, exerciseId: null, message: 'Wrong day count.' }] }, onStage: stage => stages.push(stage) });
    expect(result.plan).toBe(repaired); expect(generateCandidate).toHaveBeenCalledOnce(); expect(repairCandidate).toHaveBeenCalledOnce(); expect(reviewCandidate).toHaveBeenCalledOnce(); expect(stages).toEqual(['candidate', 'validation', 'repair', 'validation', 'review', 'final']);
  });

  it('fails clearly after the bounded repair attempts instead of returning a broken plan', async () => {
    const broken = { days: [] }; let repairs = 0;
    await expect(runPlanQualityPipeline({ payload: {}, generateCandidate: async () => broken, repairCandidate: async () => { repairs++; return broken; }, reviewCandidate: async () => ({ verdict: 'repair', overallScore: 10, issues: [] }), validateCandidate: () => ({ valid: false, issues: [{ code: 'missing_days', message: 'Program is missing days.' }] }), maxRepairAttempts: 2 })).rejects.toThrow(/could not produce a valid coherent plan/i);
    expect(repairs).toBe(2);
  });

  it('repairs a reviewer hard defect even if the reviewer mistakenly labels the verdict pass', async () => {
    let reviews = 0; let repairs = 0;
    const result = await runPlanQualityPipeline({ payload: {}, generateCandidate: async () => ({ version: 1 }), repairCandidate: async () => { repairs++; return { version: 2 }; }, validateCandidate: () => ({ valid: true, issues: [] }), reviewCandidate: async () => ++reviews === 1 ? { verdict: 'pass', overallScore: 70, issues: [{ code: 'recovery', severity: 'hard', explanation: 'Boundary conflict.', repairInstruction: 'Separate the sessions.' }] } : { verdict: 'pass', overallScore: 95, issues: [] } });
    expect(repairs).toBe(1); expect(result.plan.version).toBe(2);
  });
});
