import { describe, it, expect } from 'vitest';
import { durationTargetBand, durationFidelityResult, validateDurationFidelity, generatedSessionTiming } from './durationPlanning.js';
import { defaultProfile, blankState, buildProgram, buildReplacementProgram, validateProgram, exerciseCatalog,
  estimateSessionMinutes, estimateWorkoutMinutes, estimateGeneratedSessionMinutes, WEEKDAYS,
  serializeState, deserializeState, currentWeekSchedule, startWorkout } from './domain.js';
import { generateWarmup } from './warmups.js';

const times = [30, 45, 60, 75, 90, 120];
const goals = ['Build muscle', 'Get stronger', 'Lose fat', 'General fitness', 'Athletic performance'];
const profile = overrides => ({ ...defaultProfile(), experience: 'Intermediate', goal: 'Build muscle',
  daysPerWeek: 4, availableDays: WEEKDAYS, environment: 'Commercial gym', equipment: ['full gym'],
  priorities: ['Balanced'], ...overrides });
const row = overrides => ({ exerciseId: 'barbell-bench-press', repMin: 8, repMax: 10, restSeconds: 90,
  sets: Array.from({ length: 3 }, () => ({ reps: 8, weight: null, completed: false })), ...overrides });
const noWarmup = profile({ recommendedWarmupsEnabled: false, rampUpSetsEnabled: false });

describe('shared generated duration fidelity', () => {
  it.each(times)('%i minutes has a soft band, not exact equality', minutes => {
    const band = durationTargetBand(minutes);
    expect(band.lower).toBeLessThan(minutes);
    expect(band.upper).toBeGreaterThan(minutes);
    expect(durationFidelityResult(band.lower, minutes).status).toBe('within-target');
    expect(durationFidelityResult(band.lower - 1, minutes).status).toBe('too-short');
  });
  it('rejects unexplained under-use, falsified status, and excessive duration', () => {
    const check = (minutes, reasons = []) => {
      const day = { name: 'Upper', estimatedMinutes: minutes, durationFidelity: durationFidelityResult(minutes, 120, reasons) };
      return { days: [day], durationFidelity: { requestedMinutes: 120 } };
    };
    expect(validateDurationFidelity(check(62)).valid).toBe(false);
    expect(validateDurationFidelity(check(62, ['weekly-volume-limit'])).valid).toBe(true);
    expect(validateDurationFidelity(check(62, ['some-generic-excuse'])).valid).toBe(false);
    expect(validateDurationFidelity(check(145, ['weekly-volume-limit'])).valid).toBe(false);
    const falsified = check(62); falsified.days[0].durationFidelity.status = 'within-target';
    expect(validateDurationFidelity(falsified).valid).toBe(false);
  });
  it('counts actual working sets, rest, timed targets, and both sides without changing targets', () => {
    const exercises = [row(), row({ exerciseId: 'plank', measure: 'seconds', repMin: 30, repMax: 60,
      loggingMode: 'per_side', restSeconds: 0 })];
    const original = structuredClone(exercises);
    const timing = generatedSessionTiming(exercises, noWarmup, exerciseCatalog);
    expect(timing.workSeconds).toBe(405);
    expect(timing.restSeconds).toBe(180);
    expect(timing.setupSeconds).toBe(120);
    expect(timing.warmupMinutes).toBe(0);
    expect(timing.minutes).toBe(12);
    expect(exercises).toEqual(original);
  });
  it('counts superset rests once per pair round rather than twice', () => {
    const timing = generatedSessionTiming([row({ supersetId: 'pair' }), row({ supersetId: 'pair', restSeconds: 120 })], noWarmup, exerciseCatalog);
    expect(timing.restSeconds).toBe(240);
    expect(timing.workSeconds).toBe(270);
  });
  it('uses existing generated warm-ups, including independent ramp preference', () => {
    const p = profile({ sessionMinutes: 120 });
    const exercises = [row(), row({ exerciseId: 'barbell-squat' })];
    expect(generatedSessionTiming(exercises, p, exerciseCatalog).warmupMinutes)
      .toBe(generateWarmup({ exercises }, p, exerciseCatalog).estimatedMinutes);
    const plan = buildProgram(p), day = plan.days[0];
    expect(estimateWorkoutMinutes(day, p, { ...plan, includeRecommendedWarmups: false }))
      .toBeLessThan(estimateWorkoutMinutes(day, p, plan));
    expect(estimateWorkoutMinutes({ ...day, warmupPlan: { mode: 'none' } }, p, plan))
      .toBeLessThan(day.estimatedMinutes);
  });
  it('does not change the legacy Import/Scratch/Freestyle estimator', () => {
    const workout = { exercises: [row()] };
    expect(estimateWorkoutMinutes(workout, profile({ sessionMinutes: 120 })))
      .toBe(estimateSessionMinutes(workout.exercises));
  });
  it('estimate cache follows changed set count, rest and profile', () => {
    const p = { ...noWarmup }, exercises = [row()];
    const first = estimateGeneratedSessionMinutes(exercises, p);
    exercises[0].sets.push({ reps: 8, weight: null });
    expect(estimateGeneratedSessionMinutes(exercises, p)).toBeGreaterThan(first);
    exercises[0].restSeconds = 180;
    expect(estimateGeneratedSessionMinutes(exercises, p)).toBe(generatedSessionTiming(exercises, p, exerciseCatalog).minutes);
    p.recommendedWarmupsEnabled = true; p.rampUpSetsEnabled = true;
    expect(estimateGeneratedSessionMinutes(exercises, p)).toBe(generatedSessionTiming(exercises, p, exerciseCatalog).minutes);
  });
  it.each(goals)('%s: all six choices use the same bounded scaling and guard', goal => {
    const plans = times.map(sessionMinutes => {
      const p = profile({ goal, sessionMinutes });
      const program = buildProgram(p);
      expect(validateDurationFidelity(program).valid).toBe(true);
      expect(validateProgram(program, p).valid).toBe(true);
      for (const day of program.days) {
        expect(day.estimatedMinutes).toBe(estimateWorkoutMinutes(day, p, program));
        expect(day.exercises.length).toBeLessThanOrEqual(8);
        if (day.estimatedMinutes < durationTargetBand(sessionMinutes).lower) {
          expect(day.durationFidelity.status).toBe('short-justified');
          expect(Object.keys(day.durationFidelity.constraintCounts)).toEqual(day.durationFidelity.reasons);
        }
        for (const exercise of day.exercises) for (const set of exercise.sets) {
          expect(set.weight).toBeNull(); expect(set.completed).toBe(false);
        }
      }
      return program;
    });
    const minutes = program => program.days.reduce((sum, day) => sum + day.estimatedMinutes, 0);
    for (let i = 1; i < plans.length; i++) expect(minutes(plans[i])).toBeGreaterThanOrEqual(minutes(plans[i - 1]) - 4);
    expect(minutes(plans.at(-1))).toBeGreaterThan(minutes(plans[0]));
  });
  it('120-minute owner regression is representative, not an Athletic-only branch', () => {
    for (const experience of ['Beginner', 'Intermediate', 'Advanced']) for (const daysPerWeek of [2, 3, 4, 5, 6]) {
      const p = profile({ experience, daysPerWeek, goal: 'Athletic performance', sessionMinutes: 120 });
      const plan = buildProgram(p);
      expect(validateDurationFidelity(plan).valid).toBe(true);
      for (const day of plan.days) if (day.estimatedMinutes < 96) expect(day.durationFidelity.reasons.length).toBeGreaterThan(0);
    }
  });
  it('preserves generated estimates through save/reload, weekly prescription and active targets', () => {
    const state = blankState(); state.profile = profile({ sessionMinutes: 120, onboardingComplete: true });
    state.program = buildProgram(state.profile);
    const restored = deserializeState(serializeState(state));
    expect(restored.profile.sessionMinutes).toBe(120);
    expect(restored.program.days.map(day => day.estimatedMinutes)).toEqual(state.program.days.map(day => day.estimatedMinutes));
    const scheduled = currentWeekSchedule(restored);
    expect(scheduled.length).toBe(4);
    for (const { workout } of scheduled) expect(workout.estimatedMinutes).toBe(estimateWorkoutMinutes(workout, restored.profile, restored.program));
    const active = startWorkout(restored, scheduled[0].workout);
    expect(active.exercises.map(exercise => exercise.sets.length))
      .toEqual(scheduled[0].workout.exercises.map(exercise => exercise.sets.length));
  });
  it('replacement generation recalculates after changing exercise/rest', () => {
    const p = profile({ sessionMinutes: 60 });
    const replacement = buildReplacementProgram(p, buildProgram(p));
    expect(validateProgram(replacement, p).valid).toBe(true);
    expect(validateDurationFidelity(replacement).valid).toBe(true);
    for (const day of replacement.days) expect(day.estimatedMinutes).toBe(estimateWorkoutMinutes(day, p, replacement));
  });
});
