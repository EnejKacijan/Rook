import { mkdir, writeFile } from 'node:fs/promises';
import { WEEKDAYS, buildProgram, estimateExerciseMinutes, estimateSessionMinutes, exerciseCatalog, isExerciseAllowed, validateProgram, weeklyFractionalVolume } from '../src/domain.js';

const label = process.argv.find(value => value.startsWith('--label='))?.split('=')[1] || 'current';
const base = { exercisePreference: 'No preference', followUpAnswers: [], units: 'kg', rirEnabled: false };
const profiles = [
  { id: 'A', description: 'Beginner muscle, 2d, 30m, home dumbbells', ...base, goal: 'Build muscle', experience: 'Beginner', daysPerWeek: 2, availableDays: ['Tue', 'Sat'], sessionMinutes: 30, environment: 'Home gym', equipment: ['dumbbells', 'bodyweight only'], priorities: ['Balanced'], avoid: '' },
  { id: 'B', description: 'Beginner general fitness, 3d, 60m, commercial', ...base, goal: 'General fitness', experience: 'Beginner', daysPerWeek: 3, availableDays: ['Mon', 'Wed', 'Fri'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], avoid: '' },
  { id: 'C', description: 'Intermediate muscle, 4d, 60m, chest/back', ...base, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 4, availableDays: ['Mon', 'Tue', 'Thu', 'Sat'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Chest', 'Back'], avoid: '' },
  { id: 'D', description: 'Advanced strength, 5d, 90m, full gym', ...base, goal: 'Get stronger', experience: 'Advanced', daysPerWeek: 5, availableDays: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'], sessionMinutes: 90, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], avoid: '', exercisePreference: 'Prefer free weights' },
  { id: 'E', description: 'Intermediate muscle, 4d, leg priority, no barbell squat', ...base, goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 4, availableDays: ['Tue', 'Wed', 'Fri', 'Sun'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Quads', 'Hamstrings / glutes'], avoid: 'I cannot barbell squat.' },
  { id: 'F', description: 'Intermediate fat loss, 3d, 60m, commercial', ...base, goal: 'Lose fat', experience: 'Intermediate', ageRange: '30–39', daysPerWeek: 3, availableDays: ['Mon', 'Wed', 'Fri'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], avoid: '', effortStyle: 'Balanced workload · usually 3 sets · 1–2 RIR' }
];

const reports = profiles.map(profile => {
  const program = buildProgram(profile); const validation = validateProgram(program, profile);
  const days = program.days.map(day => ({ weekday: day.weekday, name: day.name, declaredMinutes: day.estimatedMinutes, calculatedMinutes: estimateSessionMinutes(day.exercises), exercises: day.exercises.map(item => ({ id: item.exerciseId, name: exerciseCatalog[item.exerciseId].name, muscles: exerciseCatalog[item.exerciseId].muscles, estimatedMinutes: estimateExerciseMinutes(item), sets: item.sets.length, reps: `${item.repMin}-${item.repMax}`, restSeconds: item.restSeconds, incrementKg: item.defaultIncrement })) }));
  const all = days.flatMap(day => day.exercises); const prioritySetCount = all.filter(item => profile.priorities.some(priority => item.muscles.includes(priority))).reduce((sum, item) => sum + item.sets, 0);
  return { profile, program: { id: program.id, source: program.source, split: program.name, conditioning: program.conditioning || null, validation, workoutDays: days.length, weeklyExercises: all.length, weeklySets: all.reduce((sum, item) => sum + item.sets, 0), prioritySetCount, days } };
});

const lines = [`# Personalization audit: ${label}`, '', `Generated independently at ${new Date().toISOString()}. No plan state was reused.`, ''];
for (const report of reports) {
  const { profile, program } = report; lines.push(`## Profile ${profile.id}`, '', `${profile.description}.`, '', `Split: **${program.split}** · ${program.workoutDays} days · ${program.weeklyExercises} exercise slots · ${program.weeklySets} sets · priority-muscle sets: ${program.prioritySetCount} · validation: **${program.validation.valid ? 'PASS' : 'FAIL'}**`, '');
  if (program.conditioning) lines.push(`Conditioning: **${program.conditioning.sessionsPerWeek} × ${program.conditioning.durationMinutes} min** · ${program.conditioning.intensity} · ${program.conditioning.placement}`, '');
  for (const day of program.days) { lines.push(`- ${day.weekday} — ${day.name}: declared ${day.declaredMinutes} min, calculated ~${day.calculatedMinutes} min`); for (const exercise of day.exercises) lines.push(`  - ${exercise.name} (${exercise.id}): ${exercise.sets} × ${exercise.reps}, rest ${exercise.restSeconds}s, +${exercise.incrementKg} kg`); }
  lines.push('');
}
const auditBase = { ...base, goal: 'Build muscle', experience: 'Intermediate', ageRange: '30–39', sex: 'Prefer not to say', daysPerWeek: 4, availableDays: WEEKDAYS, sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], avoid: '', effortStyle: 'Balanced workload · usually 3 sets · 1–2 RIR', trainingPreferences: '' };
const programFor = overrides => { const profile = { ...auditBase, ...overrides }; return { profile, program: buildProgram(profile) }; };
const exercisesFor = program => program.days.flatMap(day => day.exercises);
const checks = []; const check = (id, expectation, passed, evidence) => checks.push({ id, expectation, passed: Boolean(passed), evidence });
const hard = programFor({ effortStyle: 'Fewer hard sets · 2 sets · 0–1 RIR' }); const moderate = programFor({ effortStyle: 'More moderate sets · 3–4 sets · 2–3 RIR' });
check('effort-fewer-hard', 'Every exercise uses two hard sets without required failure.', exercisesFor(hard.program).every(exercise => exercise.sets.length === 2 && exercise.targetRir === 1), { setCounts: [...new Set(exercisesFor(hard.program).map(exercise => exercise.sets.length))], rir: [...new Set(exercisesFor(hard.program).map(exercise => exercise.targetRir))] });
check('effort-more-moderate', 'Every exercise preserves three to four moderate sets at 2–3 RIR.', exercisesFor(moderate.program).every(exercise => exercise.sets.length >= 3 && exercise.sets.length <= 4 && exercise.targetRir >= 2 && exercise.targetRir <= 3), { setCounts: [...new Set(exercisesFor(moderate.program).map(exercise => exercise.sets.length))], rir: [...new Set(exercisesFor(moderate.program).map(exercise => exercise.targetRir))] });
const younger = programFor({ ageRange: '30–39' }); const older = programFor({ ageRange: '60+' }); const olderCompounds = exercisesFor(older.program).filter(exercise => exerciseCatalog[exercise.exerciseId].kind === 'compound'); const highFatigue = value => exercisesFor(value.program).filter(exercise => exerciseCatalog[exercise.exerciseId].fatigueCost === 'high').length;
check('age-60-secondary-context', 'A 60+ starting profile uses a conservative compound RIR floor and no more high-fatigue choices.', Math.min(...olderCompounds.map(exercise => exercise.targetRir)) >= 3 && highFatigue(older) <= highFatigue(younger), { compoundMinimumRir: Math.min(...olderCompounds.map(exercise => exercise.targetRir)), youngerHighFatigue: highFatigue(younger), olderHighFatigue: highFatigue(older) });
const muscle = programFor({ goal: 'Build muscle' }); const strength = programFor({ goal: 'Get stronger' }); const athletic = programFor({ goal: 'Athletic performance' }); const strengthMain = exercisesFor(strength.program).find(exercise => exercise.programmingRole === 'main' && exerciseCatalog[exercise.exerciseId].kind === 'compound');
check('goal-prescription', 'Strength uses a 3–6 main-lift range and athletic plans include quality-first power.', strengthMain?.repMin === 3 && strengthMain?.repMax === 6 && athletic.program.days.some(day => exerciseCatalog[day.exercises[0]?.exerciseId]?.kind === 'power'), { strengthMain: strengthMain && [strengthMain.repMin, strengthMain.repMax, strengthMain.targetRir], athleticFirstKinds: athletic.program.days.map(day => exerciseCatalog[day.exercises[0]?.exerciseId]?.kind) });
const fatLoss = programFor({ goal: 'Lose fat', daysPerWeek: 3, sessionMinutes: 60 });
check('fat-loss-conditioning', 'Fat-loss plans preserve resistance training and add recoverable conditioning outside the exercise list.', fatLoss.program.days.every(day => day.exercises.length >= 2) && fatLoss.program.conditioning?.sessionsPerWeek === 2 && fatLoss.program.conditioning?.durationMinutes === 30, { strengthDays: fatLoss.program.days.length, conditioning: fatLoss.program.conditioning });
const beginner = programFor({ experience: 'Beginner', effortStyle: null }); const advanced = programFor({ experience: 'Advanced', effortStyle: null });
check('experience', 'Beginner programming starts with less volume and excludes the highest technical demand.', exercisesFor(beginner.program).reduce((sum, exercise) => sum + exercise.sets.length, 0) < exercisesFor(advanced.program).reduce((sum, exercise) => sum + exercise.sets.length, 0) && exercisesFor(beginner.program).every(exercise => exerciseCatalog[exercise.exerciseId].technicalDifficulty <= 2), { beginnerSets: exercisesFor(beginner.program).reduce((sum, exercise) => sum + exercise.sets.length, 0), advancedSets: exercisesFor(advanced.program).reduce((sum, exercise) => sum + exercise.sets.length, 0) });
const short = programFor({ sessionMinutes: 30 }); const long = programFor({ sessionMinutes: 90 });
check('session-duration', 'Short plans fit the time cap and contain no more work than long plans.', short.program.days.every(day => day.estimatedMinutes <= 35) && exercisesFor(short.program).length <= exercisesFor(long.program).length, { shortMinutes: short.program.days.map(day => day.estimatedMinutes), shortSlots: exercisesFor(short.program).length, longSlots: exercisesFor(long.program).length });
const home = programFor({ daysPerWeek: 3, environment: 'Home gym', equipment: ['dumbbells', 'bodyweight only'] });
check('equipment', 'Every home exercise fits the selected equipment.', exercisesFor(home.program).every(exercise => isExerciseAllowed(exerciseCatalog[exercise.exerciseId], home.profile)), { exerciseIds: exercisesFor(home.program).map(exercise => exercise.exerciseId) });
const balancedPriority = programFor({ priorities: ['Balanced'] }); const chestPriority = programFor({ priorities: ['Chest'] });
check('priority-volume', 'A selected muscle priority receives more bounded weekly work.', (weeklyFractionalVolume(chestPriority.program).Chest || 0) > (weeklyFractionalVolume(balancedPriority.program).Chest || 0), { balancedChest: weeklyFractionalVolume(balancedPriority.program).Chest, priorityChest: weeklyFractionalVolume(chestPriority.program).Chest });
const free = programFor({ exercisePreference: 'Prefer free weights' }); const machines = programFor({ exercisePreference: 'Prefer machines' }); const countEquipment = (value, accepted) => exercisesFor(value.program).filter(exercise => exerciseCatalog[exercise.exerciseId].equipment.some(item => accepted.includes(item))).length;
check('exercise-preference', 'Free-weight and machine preferences materially change equivalent exercise selection.', countEquipment(free, ['barbell', 'dumbbells']) > countEquipment(machines, ['barbell', 'dumbbells']) && countEquipment(machines, ['machines', 'cables']) > countEquipment(free, ['machines', 'cables']), { freeWeightSelections: countEquipment(free, ['barbell', 'dumbbells']), machineSelections: countEquipment(machines, ['machines', 'cables']) });
const restricted = programFor({ avoid: 'No back squat.' }); check('restrictions', 'Explicitly avoided exercises never enter the plan.', !exercisesFor(restricted.program).some(exercise => exercise.exerciseId === 'back-squat'), { exerciseIds: exercisesFor(restricted.program).map(exercise => exercise.exerciseId) });
const splitMatrix = [
  ['Upper / Lower', { 2: 'T2-UL', 3: 'T3-UL', 4: 'T4-UL', 5: 'T5-UL', 6: 'T6-UL3' }],
  ['PPL', { 3: 'T3-PPL', 4: 'T4-PPL', 5: 'T5-ULPPL', 6: 'T6-PPL2' }],
  ['Full Body', { 2: 'T2-FB', 3: 'T3-FB', 4: 'T4-FB', 5: 'T5-FB', 6: 'T6-FB' }],
  ['Arnold split', { 2: 'T2-ARNOLD', 3: 'T3-ARNOLD', 4: 'T4-ARNOLD', 5: 'T5-ARNOLD', 6: 'T6-ARNOLD' }],
  ['Push / Pull split', { 2: 'T2-PP', 3: 'T3-PP', 4: 'T4-PP', 5: 'T5-PP', 6: 'T6-PP' }],
  ['Torso / Limbs', { 2: 'T2-TL', 3: 'T3-TL', 4: 'T4-TL', 5: 'T5-TL', 6: 'T6-TL' }],
  ['Body-part split', { 2: 'T2-BP', 3: 'T3-BP', 4: 'T4-BP', 5: 'T5-BP', 6: 'T6-BP' }],
  ['PPLUL', { 5: 'T5-PPLUL' }]
];
const splitResults = splitMatrix.flatMap(([preference, frequencies]) => Object.entries(frequencies).map(([daysPerWeek, expected]) => {
  const result = programFor({ daysPerWeek: Number(daysPerWeek), availableDays: WEEKDAYS, trainingPreferences: `I prefer ${preference}.` });
  return { preference, daysPerWeek: Number(daysPerWeek), expected, actual: result.program.templateId, valid: validateProgram(result.program, result.profile, { requireProgramQuality: true }).valid };
}));
const boundedFallbacks = [
  { preference: 'PPL', daysPerWeek: 2, expected: 'T2-FB' },
  { preference: 'PPLUL', daysPerWeek: 4, expected: 'T4-UL' },
  { preference: 'PPLUL', daysPerWeek: 6, expected: 'T6-PPL2' }
].map(item => ({ ...item, actual: programFor({ daysPerWeek: item.daysPerWeek, availableDays: WEEKDAYS, trainingPreferences: `I prefer ${item.preference}.` }).program.templateId }));
check('split-preference', 'Recognized split preferences control every safe supported frequency; only structurally unsuitable frequencies use the recovery-safe baseline.', splitResults.every(item => item.actual === item.expected && item.valid) && boundedFallbacks.every(item => item.actual === item.expected), { supported: splitResults, boundedFallbacks });
const signature = value => JSON.stringify(value.program.days.map(day => ({ name: day.name, exercises: day.exercises.map(exercise => [exercise.exerciseId, exercise.sets.length, exercise.repMin, exercise.repMax, exercise.targetRir]) })));
const female = programFor({ name: 'A', sex: 'Female' }); const male = programFor({ name: 'B', sex: 'Male' }); check('neutral-demographics', 'Name and sex do not stereotype exercise or workload selection.', signature(female) === signature(male), { identicalProgramming: signature(female) === signature(male) });
lines.push('## Personalization contract checks', ''); for (const item of checks) lines.push(`- **${item.passed ? 'PASS' : 'FAIL'}** ${item.id}: ${item.expectation} Evidence: ${JSON.stringify(item.evidence)}`); lines.push('');
await mkdir(new URL('../artifacts/audit/', import.meta.url), { recursive: true });
await writeFile(new URL(`../artifacts/audit/${label}-personalization.json`, import.meta.url), `${JSON.stringify(reports, null, 2)}\n`);
await writeFile(new URL(`../artifacts/audit/${label}-personalization-checks.json`, import.meta.url), `${JSON.stringify(checks, null, 2)}\n`);
await writeFile(new URL(`../artifacts/audit/${label}-personalization.md`, import.meta.url), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
if (checks.some(item => !item.passed)) process.exitCode = 1;
