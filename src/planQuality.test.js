import { describe, expect, it } from 'vitest';
import { WEEKDAYS, buildProgram, defaultProfile, exerciseCatalog } from './domain.js';
import { buildProgrammingContext, plannerCatalog, summarizeTrainingHistory, validateRawPlan } from './planQuality.js';

const catalog = plannerCatalog(Object.values(exerciseCatalog));
function profile(overrides = {}) {
  return { ...defaultProfile(), goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 3, availableDays: ['Mon', 'Wed', 'Fri'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], ...overrides };
}
function raw(program, user = {}) {
  return { name: program.name, days: program.days.map(day => ({ weekday: day.weekday, location: day.location || (user.environment === 'Home gym' ? 'Home' : 'Commercial gym'), name: day.name, estimatedMinutes: day.estimatedMinutes, exercises: day.exercises.map(exercise => ({ exerciseId: exercise.exerciseId, sets: exercise.sets.length, repMin: exercise.repMin, repMax: exercise.repMax, targetRir: exercise.targetRir ?? 0, restSeconds: exercise.restSeconds })) })) };
}

describe('deterministic programming context and plan validation', () => {
  const cases = [
    ['beginner two-day full gym', { experience: 'Beginner', daysPerWeek: 2, availableDays: ['Tue', 'Sat'] }],
    ['intermediate three-day', {}],
    ['four-day chest/back priority', { daysPerWeek: 4, availableDays: ['Mon', 'Tue', 'Thu', 'Sat'], priorities: ['Chest', 'Back'] }],
    ['advanced five-day', { experience: 'Advanced', daysPerWeek: 5, availableDays: WEEKDAYS, sessionMinutes: 90 }],
    ['home gym limited equipment', { environment: 'Home gym', equipment: ['dumbbells', 'bodyweight only'], daysPerWeek: 3, availableDays: ['Tue', 'Thu', 'Sun'] }],
    ['both training locations', { environment: 'Both', equipment: ['full gym', 'dumbbells', 'bodyweight only'], daysPerWeek: 4, availableDays: ['Mon', 'Wed', 'Fri', 'Sun'] }],
    ['short sessions', { daysPerWeek: 2, availableDays: ['Mon', 'Thu'], sessionMinutes: 30 }],
    ['long sessions', { daysPerWeek: 4, availableDays: ['Tue', 'Thu', 'Sat', 'Sun'], sessionMinutes: 90 }],
    ['unusual available days', { daysPerWeek: 3, availableDays: ['Mon', 'Tue', 'Sun'] }]
  ];
  it.each(cases)('keeps hard constraints for %s', (_label, overrides) => {
    const user = profile(overrides); const context = buildProgrammingContext(user, catalog); const plan = raw(buildProgram(user), user);
    const result = validateRawPlan(plan, user, catalog, context);
    const constraintCodes = new Set(['day_count', 'invalid_weekday', 'invalid_session_size', 'invalid_location', 'unknown_exercise', 'equipment', 'restriction', 'duplicate_exercise', 'invalid_prescription', 'duration']);
    expect(plan.days).toHaveLength(user.daysPerWeek); expect(plan.days.every(day => user.availableDays.includes(day.weekday))).toBe(true); expect(result.issues.filter(issue => constraintCodes.has(issue.code)), result.issues.map(issue => issue.message).join(' ')).toEqual([]);
  });

  it('turns explicit restrictions into IDs and rejects a restricted exercise', () => {
    const user = profile({ avoid: 'Never include Back Squat.' }); const context = buildProgrammingContext(user, catalog); const plan = raw(buildProgram(user), user);
    plan.days[0].exercises[0] = { exerciseId: 'back-squat', sets: 3, repMin: 6, repMax: 8, targetRir: 2, restSeconds: 180 };
    expect(context.restrictedExerciseIds).toContain('back-squat'); expect(validateRawPlan(plan, user, catalog, context).issues.some(issue => issue.code === 'restriction')).toBe(true);
  });

  it('checks the repeating Sunday-to-Monday recovery boundary', () => {
    const user = profile({ daysPerWeek: 2, availableDays: ['Mon', 'Sun'], sessionMinutes: 90 });
    const exercise = (exerciseId, sets = 3, repMin = 8, repMax = 10, targetRir = 2, restSeconds = 120) => ({ exerciseId, sets, repMin, repMax, targetRir, restSeconds });
    const upper = { weekday: 'Mon', location: 'Commercial gym', name: 'Upper A', estimatedMinutes: 55, exercises: [exercise('barbell-bench-press', 3, 6, 8, 2, 150), exercise('barbell-row', 3, 8, 10, 2, 150), exercise('barbell-overhead-press', 3, 6, 8, 2, 150), exercise('pull-up', 3, 6, 10, 2, 150)] };
    const repeated = { weekday: 'Sun', location: 'Commercial gym', name: 'Upper B', estimatedMinutes: 50, exercises: [exercise('incline-dumbbell-press'), exercise('lat-pulldown'), exercise('machine-shoulder-press'), exercise('seated-cable-row')] };
    const result = validateRawPlan({ name: 'Boundary', days: [upper, repeated] }, user, catalog, buildProgrammingContext(user, catalog));
    expect(result.issues.some(issue => issue.code === 'recovery_conflict')).toBe(true);
  });

  it('unlocks the baseline for a feasible Arnold preference and rejects an unchanged Upper/Lower response', () => {
    const user = profile({ daysPerWeek: 4, availableDays: ['Mon', 'Tue', 'Thu', 'Sat'], trainingPreferences: 'I prefer the Arnold split.' }); const context = buildProgrammingContext(user, catalog);
    expect(context.structuralTemplate).toMatchObject({ templateId: 'T4-ARNOLD', role: 'preference-shaped evidence-informed baseline', lockedByFrequency: false }); expect(context.preferredSplit).toMatchObject({ id: 'arnold', requiresMaterialAdaptation: true });
    const arnold = raw(buildProgram(user), user); expect(validateRawPlan(arnold, user, catalog, context).issues.some(issue => issue.code === 'split_preference')).toBe(false);
    const unchanged = raw(buildProgram({ ...user, trainingPreferences: 'Upper lower split' }), user); expect(validateRawPlan(unchanged, user, catalog, context).issues.some(issue => issue.code === 'split_preference')).toBe(true);
  });

  it('makes the selected set-and-effort style an enforceable generation contract', () => {
    const user = profile({ effortStyle: 'More moderate sets · 3–4 sets · 2–3 RIR' }); const context = buildProgrammingContext(user, catalog); const plan = raw(buildProgram(user), user);
    expect(context.effortPolicy).toMatchObject({ mode: 'more-moderate', setRange: [3, 4], neverRequiresFailure: true }); expect(validateRawPlan(plan, user, catalog, context).issues.filter(issue => issue.code.startsWith('effort_'))).toEqual([]);
    plan.days[0].exercises[0].sets = 2; plan.days[0].exercises[0].targetRir = 1;
    const issues = validateRawPlan(plan, user, catalog, context).issues; expect(issues.some(issue => issue.code === 'effort_set_count')).toBe(true); expect(issues.some(issue => issue.code === 'effort_intensity')).toBe(true);
  });

  it('rejects an unnecessarily intense compound prescription for a 60+ starting profile', () => {
    const user = profile({ ageRange: '60+', effortStyle: 'Balanced workload · usually 3 sets · 1–2 RIR' }); const context = buildProgrammingContext(user, catalog); const plan = raw(buildProgram(user), user);
    const compound = plan.days.flatMap(day => day.exercises).find(exercise => exerciseCatalog[exercise.exerciseId].kind === 'compound'); compound.targetRir = 2;
    expect(context.effortPolicy).toMatchObject({ olderAdultConservativeStart: true, compoundMinimumRir: 3 }); expect(validateRawPlan(plan, user, catalog, context).issues.some(issue => issue.code === 'effort_intensity')).toBe(true);
  });

  it('rejects avoidable bodyweight substitutions when a compatible loadable exercise is available', () => {
    const user = profile({ daysPerWeek: 3, availableDays: ['Mon', 'Wed', 'Fri'] }); const context = buildProgrammingContext(user, catalog); const plan = raw(buildProgram(user), user);
    const pressDay = plan.days.find(day => day.exercises.some(exercise => exerciseCatalog[exercise.exerciseId]?.pattern === 'horizontal-push'));
    const pressIndex = pressDay.exercises.findIndex(exercise => exerciseCatalog[exercise.exerciseId]?.pattern === 'horizontal-push');
    pressDay.exercises[pressIndex] = { exerciseId: 'push-up', sets: 3, repMin: 8, repMax: 15, targetRir: 2, restSeconds: 90 };
    expect(validateRawPlan(plan, user, catalog, context).issues.some(issue => issue.code === 'avoidable_bodyweight' && issue.exerciseId === 'push-up')).toBe(true);
    const bodyweightUser = profile({ environment: 'Home gym', equipment: ['bodyweight only'], daysPerWeek: 3, availableDays: ['Mon', 'Wed', 'Fri'] }); const bodyweightPlan = raw(buildProgram(bodyweightUser), bodyweightUser);
    expect(validateRawPlan(bodyweightPlan, bodyweightUser, catalog, buildProgrammingContext(bodyweightUser, catalog)).issues.some(issue => issue.code === 'avoidable_bodyweight')).toBe(false);
  });
});

describe('compact training history summary', () => {
  it('returns null for a new user and observed adherence/progression for an established user', () => {
    expect(summarizeTrainingHistory([], null, { catalog: Object.values(exerciseCatalog) })).toBeNull();
    const user = profile({ daysPerWeek: 3 }); const program = buildProgram(user); const template = program.days[0];
    const session = (date, weight, endedEarly = false) => ({ programDayId: template.id, completedAt: date, durationSeconds: 3300, endedEarly, status: endedEarly ? 'ended-early' : 'completed', exercises: template.exercises.slice(0, 2).map(exercise => ({ exerciseId: exercise.exerciseId, sets: exercise.sets.slice(0, 2).map((_, index) => ({ completed: true, weight, reps: 8 + index, rir: 2 })) })) });
    const workouts = [session('2026-08-03T18:00:00Z', 40), session('2026-08-10T18:00:00Z', 42.5), session('2026-08-17T18:00:00Z', 45, true)];
    const summary = summarizeTrainingHistory(workouts, program, { now: new Date('2026-08-23T12:00:00Z'), catalog: Object.values(exerciseCatalog) });
    expect(summary).toMatchObject({ observedSessions: 3, completedSessions: 3, endedEarlySessions: 1, typicalSessionMinutes: 55 });
    expect(summary.recentWeeklyFrequency).toMatchObject({ averageCompleted: 1, requested: 3 });
    expect(summary.exerciseEvidence[0].progressionTrend).toBe('increasing'); expect(summary.recentWeeklyVolumeExposure).toHaveLength(3);
  });
});
