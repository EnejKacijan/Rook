import { describe, expect, it } from 'vitest';
import { WEEKDAYS, buildProgram, defaultProfile, exerciseCatalog, weeklyStimulusVolume } from './domain.js';
import { buildProgrammingContext, plannerCatalog, rawPlanStimulusVolume, summarizeTrainingHistory, validateRawPlan, verifiedRawCoverageConstraintReason } from './planQuality.js';

const catalog = plannerCatalog(Object.values(exerciseCatalog));
function profile(overrides = {}) {
  return { ...defaultProfile(), goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 3, availableDays: ['Mon', 'Wed', 'Fri'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], ...overrides };
}
function raw(program, user = {}) {
  return { name: program.name, coverageConstrained: structuredClone(program.coverageConstrained || {}), days: program.days.map(day => ({ weekday: day.weekday, location: day.location || (user.environment === 'Home gym' ? 'Home' : 'Commercial gym'), name: day.name, estimatedMinutes: day.estimatedMinutes, exercises: day.exercises.map(exercise => ({ exerciseId: exercise.exerciseId, programmingRole: exercise.programmingRole, requiredRole: exercise.requiredRole, slotPatterns: exercise.slotPatterns, sets: exercise.sets.length, repMin: exercise.repMin, repMax: exercise.repMax, targetRir: exercise.targetRir ?? 0, restSeconds: exercise.restSeconds })) })) };
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

  it('passes explicit session order to the planner and rejects a reordered hybrid', () => {
    const user = profile({
      daysPerWeek: 5,
      availableDays: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'],
      trainingPreferences: 'Upper Lower Push Pull Legs'
    });
    const context = buildProgrammingContext(user, catalog);
    expect(context.structuralTemplate).toMatchObject({
      structureFamily: 'ppl-upper-lower-hybrid',
      userRequestedSequence: ['upper', 'lower', 'push', 'pull', 'legs']
    });
    const plan = raw(buildProgram(user), user);
    expect(validateRawPlan(plan, user, catalog, context).issues.some(issue => issue.code === 'session_sequence')).toBe(false);
    [plan.days[0].weekday, plan.days[2].weekday] = [plan.days[2].weekday, plan.days[0].weekday];
    expect(validateRawPlan(plan, user, catalog, context).issues.some(issue => issue.code === 'session_sequence')).toBe(true);
  });

  it('drops a requested sequence when a confirmed safety scope takes precedence', () => {
    const user = profile({
      daysPerWeek: 5,
      availableDays: WEEKDAYS,
      trainingPreferences: 'Upper Lower Push Pull Legs',
      compiledTrainingSafety: {
        status: 'ready',
        constraints: {
          allowedBodyRegions: ['upper_body'],
          minRirByExerciseId: {},
        },
      },
    });
    expect(buildProgrammingContext(user, catalog).structuralTemplate).toMatchObject({
      templateId: 'SAFETY-UPPER',
      role: 'literal confirmed clinician scope',
      userRequestedSequence: null,
    });
  });

  it('makes the selected set-and-effort style an enforceable generation contract', () => {
    const user = profile({ effortStyle: 'More moderate sets · 3–4 sets · 2–3 RIR' }); const context = buildProgrammingContext(user, catalog); const plan = raw(buildProgram(user), user);
    expect(context.effortPolicy).toMatchObject({ mode: 'more-moderate', setRange: [3, 4], neverRequiresFailure: true }); expect(validateRawPlan(plan, user, catalog, context).issues.filter(issue => issue.code.startsWith('effort_'))).toEqual([]);
    plan.days[0].exercises[0].sets = 2; plan.days[0].exercises[0].targetRir = 1;
    const issues = validateRawPlan(plan, user, catalog, context).issues; expect(issues.some(issue => issue.code === 'effort_set_count')).toBe(true); expect(issues.some(issue => issue.code === 'effort_intensity')).toBe(true);
  });

  it('rejects broad fewer-hard rep ranges before AI plan normalization', () => {
    const user = profile({ effortStyle: 'Fewer hard sets · 2 sets · 0–1 RIR' });
    const context = buildProgrammingContext(user, catalog);
    const plan = raw(buildProgram(user), user);
    expect(context.effortPolicy).toMatchObject({
      mode: 'fewer-hard',
      repPolicy: { standardMaximum: 12, hypertrophyCompound: [6, 8], isolation: [8, 12] },
    });
    expect(validateRawPlan(plan, user, catalog, context).issues.filter(issue => issue.code.startsWith('effort_'))).toEqual([]);
    const isolation = plan.days.flatMap(day => day.exercises).find(exercise => exerciseCatalog[exercise.exerciseId].kind === 'isolation');
    isolation.repMin = 10;
    isolation.repMax = 15;
    expect(validateRawPlan(plan, user, catalog, context).issues).toContainEqual(expect.objectContaining({ code: 'effort_rep_range', exerciseId: isolation.exerciseId }));
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

  it('rejects Single-Arm Cable Row as the main back exercise when a stable bilateral row is available', () => {
    const user = profile({ daysPerWeek: 4, availableDays: ['Mon', 'Tue', 'Thu', 'Sat'] });
    const context = buildProgrammingContext(user, catalog);
    const plan = raw(buildProgram(user), user);
    const upper = plan.days.find(day => day.name.startsWith('Upper'));
    const mainRowIndex = upper.exercises.findIndex(exercise =>
      exercise.programmingRole === 'main' && exerciseCatalog[exercise.exerciseId]?.pattern === 'horizontal-pull'
    );
    expect(mainRowIndex).toBeGreaterThanOrEqual(0);
    upper.exercises[mainRowIndex].exerciseId = 'single-arm-cable-row';
    expect(validateRawPlan(plan, user, catalog, context).issues).toContainEqual(
      expect.objectContaining({ code: 'suboptimal_main_row', exerciseId: 'single-arm-cable-row' }),
    );
  });

  it('uses the exact same anatomical stimulus engine for deterministic and raw plans', () => {
    const user = profile({ daysPerWeek: 4, availableDays: ['Mon', 'Tue', 'Thu', 'Fri'] });
    const program = buildProgram(user);
    expect(rawPlanStimulusVolume(raw(program, user), catalog)).toEqual(weeklyStimulusVolume(program));
    const straightArm = { days: [{ exercises: [{ exerciseId: 'straight-arm-cable-pulldown', sets: 3 }] }] };
    expect(rawPlanStimulusVolume(straightArm, catalog)).toEqual({ Back: 3 });
  });

  it('requires truthful floor constraints and rejects a forged time excuse when coverage is feasible', () => {
    const user = profile({ experience: 'Advanced', daysPerWeek: 5, availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], sessionMinutes: 60 });
    const context = buildProgrammingContext(user, catalog);
    const plan = raw(buildProgram(user), user);
    const chest = plan.days.flatMap(day => day.exercises).filter(exercise => (catalog.find(item => item.id === exercise.exerciseId)?.stimulusProfile?.Chest || 0) === 1);
    let remaining = 6;
    for (const exercise of chest) { exercise.sets = Math.max(1, Math.min(exercise.sets, remaining - Math.max(0, chest.length - chest.indexOf(exercise) - 1))); remaining -= exercise.sets; }
    plan.coverageConstrained = {};
    let result = validateRawPlan(plan, user, catalog, context);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'weekly_volume_floor' }));
    plan.coverageConstrained.Chest = { actual: 6, floor: 8, reason: 'time' };
    result = validateRawPlan(plan, user, catalog, context);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'coverage_constraint_reason' }));
    plan.coverageConstrained.Chest.actual = 5;
    expect(validateRawPlan(plan, user, catalog, context).issues).toContainEqual(expect.objectContaining({ code: 'coverage_constraint_mismatch' }));
  });

  it('accepts recomputed constraints for a genuinely compressed plan', () => {
    const user = profile({ experience: 'Advanced', daysPerWeek: 5, availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], sessionMinutes: 30 });
    const plan = raw(buildProgram(user), user);
    const issues = validateRawPlan(plan, user, catalog, buildProgrammingContext(user, catalog)).issues;
    expect(issues.filter(issue => ['weekly_volume_floor', 'coverage_constraint_mismatch', 'coverage_constraint_reason'].includes(issue.code))).toEqual([]);
  });

  it('verifies equipment constraints inside supported sessions rather than unrelated locations', () => {
    const user = profile({ environment: 'Both', equipment: ['dumbbells'], daysPerWeek: 2, availableDays: ['Mon', 'Thu'] });
    const exercise = (exerciseId, sets = 3) => ({ exerciseId, sets, repMin: 8, repMax: 12, targetRir: 2, restSeconds: 90 });
    const plan = {
      name: 'Location constraint',
      coverageConstrained: {},
      days: [
        { weekday: 'Mon', location: 'Home', name: 'Push', estimatedMinutes: 30, exercises: [exercise('dumbbell-shoulder-press'), exercise('lateral-raise')] },
        { weekday: 'Thu', location: 'Commercial gym', name: 'Lower', estimatedMinutes: 30, exercises: [exercise('leg-press'), exercise('seated-leg-curl')] },
      ],
    };
    const context = buildProgrammingContext(user, catalog);
    const homeEquipment = new Set(['bodyweight', 'dumbbells']);
    context.restrictedExerciseIds = catalog.filter(item =>
      item.stimulusProfile?.Chest === 1 && (item.equipment || []).every(value => homeEquipment.has(value))).map(item => item.id);
    const floor = context.volumePolicy.muscleTargets.Chest.floor;
    plan.coverageConstrained.Chest = { actual: 0, floor, reason: 'equipment-or-restriction' };
    const issues = validateRawPlan(plan, user, catalog, context).issues;
    expect(issues.filter(issue => issue.code === 'coverage_constraint_reason' && issue.message.startsWith('Chest'))).toEqual([]);
  });

  it('rejects forged time when a full session can fund the deficit with a donor-set transfer', () => {
    const exercise = (exerciseId, sets, restSeconds = 90) => ({ exerciseId, sets, repMin: 8, repMax: 12, targetRir: 2, restSeconds });
    const day = {
      weekday: 'Mon', location: 'Commercial gym', name: 'Push', exercises: [
        exercise('machine-chest-press', 3),
        exercise('lateral-raise', 4),
        exercise('cable-lateral-raise', 3),
        exercise('cable-overhead-triceps-extension', 2),
        exercise('machine-shoulder-press', 2),
        exercise('cable-fly', 1),
        exercise('rope-triceps-pushdown', 1),
        exercise('front-raise', 1),
      ],
    };
    const byId = new Map(catalog.map(item => [item.id, item]));
    const minutes = 5 + (day.exercises.length - 1) * 2 + day.exercises.reduce((sum, item) => {
      const setup = byId.get(item.exerciseId)?.kind === 'compound' ? 3 : 1;
      return sum + Math.max(3, Math.ceil((item.sets * 45 + Math.max(0, item.sets - 1) * item.restSeconds) / 60 + setup));
    }, 0);
    day.estimatedMinutes = minutes;
    const user = profile({ daysPerWeek: 2, availableDays: ['Mon', 'Thu'], sessionMinutes: minutes });
    const plan = { name: 'Transfer proof', days: [day] };
    const context = buildProgrammingContext(user, catalog);
    const volume = rawPlanStimulusVolume(plan, catalog);
    expect(verifiedRawCoverageConstraintReason(plan, user, catalog, context, 'Chest', volume, context.volumePolicy.muscleTargets)).toBeNull();
  });

  it('does not treat removal of the only horizontal pull as a legal way to fund coverage', () => {
    const exercise = (exerciseId, sets = 2, requiredRole = true) => ({ exerciseId, sets, requiredRole, repMin: 8, repMax: 12, targetRir: 2, restSeconds: 90 });
    const day = { weekday: 'Mon', location: 'Commercial gym', name: 'Pull', exercises: [
      exercise('lat-pulldown'), exercise('neutral-grip-lat-pulldown'), exercise('assisted-pull-up'),
      exercise('machine-row', 2, false), exercise('barbell-curl'), exercise('cable-rear-delt-fly'),
      exercise('cable-crunch'), exercise('reverse-crunch'),
    ] };
    const byId = new Map(catalog.map(item => [item.id, item]));
    day.estimatedMinutes = 5 + (day.exercises.length - 1) * 2 + day.exercises.reduce((sum, item) => sum + Math.max(3, Math.ceil((item.sets * 45 + Math.max(0, item.sets - 1) * item.restSeconds) / 60 + (byId.get(item.exerciseId)?.kind === 'compound' ? 3 : 1))), 0);
    const user = profile({ experience: 'Advanced', daysPerWeek: 2, availableDays: ['Mon', 'Thu'], sessionMinutes: day.estimatedMinutes });
    const plan = { name: 'Pull structure proof', days: [day] };
    const context = buildProgrammingContext(user, catalog);
    const volume = rawPlanStimulusVolume(plan, catalog);
    expect(verifiedRawCoverageConstraintReason(plan, user, catalog, context, 'RearDelts', volume, context.volumePolicy.muscleTargets)).toBe('time');
  });

  it('uses the shared 30-minute accessory minimum when checking donor transfers', () => {
    const day = { weekday: 'Mon', location: 'Commercial gym', name: 'Push', exercises: [
      { exerciseId: 'machine-chest-press', sets: 2, programmingRole: 'main', requiredRole: true, repMin: 8, repMax: 12, targetRir: 2, restSeconds: 90 },
      { exerciseId: 'machine-shoulder-press', sets: 1, programmingRole: 'main', requiredRole: true, repMin: 8, repMax: 12, targetRir: 2, restSeconds: 90 },
      { exerciseId: 'cable-overhead-triceps-extension', sets: 2, programmingRole: 'accessory', repMin: 8, repMax: 12, targetRir: 2, restSeconds: 180 },
      { exerciseId: 'rope-triceps-pushdown', sets: 1, programmingRole: 'accessory', repMin: 8, repMax: 12, targetRir: 2, restSeconds: 90 },
    ], estimatedMinutes: 29 };
    const user = profile({ experience: 'Beginner', daysPerWeek: 2, availableDays: ['Mon', 'Thu'], sessionMinutes: 30 });
    const plan = { name: 'Short transfer proof', days: [day] };
    const context = buildProgrammingContext(user, catalog);
    const volume = rawPlanStimulusVolume(plan, catalog);
    expect(verifiedRawCoverageConstraintReason(plan, user, catalog, context, 'Chest', volume, context.volumePolicy.muscleTargets)).toBeNull();
  });

  it('does not reject volume merely for exceeding a soft cap while remaining under the hard cap', () => {
    const user = profile({ experience: 'Advanced', daysPerWeek: 5, availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], sessionMinutes: 90 });
    const plan = raw(buildProgram(user), user);
    const chest = plan.days.flatMap(day => day.exercises).filter(exercise => (catalog.find(item => item.id === exercise.exerciseId)?.stimulusProfile?.Chest || 0) === 1);
    for (const exercise of chest) exercise.sets = 6;
    const chestVolume = rawPlanStimulusVolume(plan, catalog).Chest;
    expect(chestVolume).toBeGreaterThan(14);
    expect(chestVolume).toBeLessThanOrEqual(20);
    expect(validateRawPlan(plan, user, catalog, buildProgrammingContext(user, catalog)).issues.filter(issue => issue.code === 'weekly_volume_cap')).toEqual([]);
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
