import { describe, expect, it } from 'vitest';
import { blankState, buildProgram, candidateScore, exerciseCatalog, isExerciseAllowed, validateProgram } from './domain.js';

const profile = (overrides = {}) => ({
  ...blankState().profile, goal: 'Build muscle', experience: 'Intermediate',
  ageRange: '30–39', daysPerWeek: 4, availableDays: ['Mon', 'Tue', 'Thu', 'Sat'],
  sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'],
  priorities: ['Balanced'], avoid: '', exercisePreference: 'Prefer free weights',
  ...overrides,
});
const items = plan => plan.days.flatMap(day => day.exercises.map(e => exerciseCatalog[e.exerciseId]));
const free = item => item.equipment.some(e => ['barbell', 'dumbbells'].includes(e));
const machine = item => item.equipment.some(e => ['machines', 'cables'].includes(e));

describe('explicit free-weight preference in generated plans', () => {
  it.each(['Beginner', 'Intermediate', 'Advanced'])('is visible throughout the week for %s, not just the first workout', experience => {
    const p = profile({ experience });
    const plan = buildProgram(p);
    const all = items(plan);
    expect(all.filter(free).length / all.length).toBeGreaterThanOrEqual(0.65);
    for (const day of plan.days) {
      expect(day.exercises.map(e => exerciseCatalog[e.exerciseId]).filter(free).length).toBeGreaterThanOrEqual(2);
      expect(new Set(day.exercises.map(e => e.exerciseId)).size).toBe(day.exercises.length);
    }
    // A preference is not a blanket machine ban: retain suitable pull/curl work.
    expect(all.some(machine)).toBe(true);
    expect(validateProgram(plan, p, { requireProgramQuality: true }).valid).toBe(true);
    expect(all.every(e => isExerciseAllowed(e, p))).toBe(true);
    if (experience === 'Beginner') expect(all.every(e => e.technicalDifficulty <= 2)).toBe(true);
    const machinePlan = buildProgram(profile({ experience, exercisePreference: 'Prefer machines' }));
    expect(items(machinePlan).filter(machine).length).toBeGreaterThan(all.filter(machine).length);
  });

  it('never overrides available equipment', () => {
    const p = profile({ equipment: ['machines', 'cables'] });
    const plan = buildProgram(p);
    expect(items(plan).some(free)).toBe(false);
    expect(items(plan).every(e => isExerciseAllowed(e, p))).toBe(true);
    expect(validateProgram(plan, p, { requireProgramQuality: true }).valid).toBe(true);
  });

  it('does not override explicit movement restrictions', () => {
    const p = profile({ avoid: 'No barbell back squat.' });
    const plan = buildProgram(p);
    expect(items(plan).some(e => e.id === 'back-squat')).toBe(false);
    expect(items(plan).every(e => isExerciseAllowed(e, p))).toBe(true);
    expect(validateProgram(plan, p, { requireProgramQuality: true }).valid).toBe(true);
  });

  it('retains a meaningful fatigue/repetition penalty rather than forcing free weights', () => {
    const p = profile();
    const squat = exerciseCatalog['back-squat'];
    const hack = exerciseCatalog['hack-squat'];
    expect(candidateScore(squat, p, new Map(), 'squat', 0, 'main')).toBeGreaterThan(candidateScore(hack, p, new Map(), 'squat', 0, 'main'));
    expect(candidateScore(squat, p, new Map([['back-squat', 3]]), 'squat', 0, 'main')).toBeLessThan(candidateScore(hack, p, new Map(), 'squat', 0, 'main'));
  });
});
