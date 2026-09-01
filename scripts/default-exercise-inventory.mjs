import { mkdir, writeFile } from 'node:fs/promises';
import { buildProgram, defaultProfile, exerciseCatalog, validateProgram, WEEKDAYS } from '../src/domain.js';

const goals = ['Build muscle', 'Get stronger', 'General fitness', 'Lose fat', 'Athletic performance'];
const experiences = ['Beginner', 'Intermediate', 'Advanced'];
const frequencies = [2, 3, 4, 5, 6];
const environments = [
  { label: 'commercial', environment: 'Commercial gym', equipment: ['full gym'] },
  { label: 'home-full', environment: 'Home gym', equipment: ['barbell/rack/bench', 'dumbbells', 'pull-up bar', 'resistance bands', 'bodyweight only'] },
  { label: 'home-dumbbells', environment: 'Home gym', equipment: ['dumbbells', 'bodyweight only'] },
  { label: 'home-bands', environment: 'Home gym', equipment: ['resistance bands', 'bodyweight only'] },
  { label: 'bodyweight-only', environment: 'Home gym', equipment: ['bodyweight only'] }
];
const styles = ['No preference', 'Prefer machines', 'Prefer free weights'];
const priorities = [['Balanced'], ['Chest'], ['Back'], ['Shoulders'], ['Arms'], ['Quads'], ['Hamstrings / glutes']];
const splitPreferences = ['', 'Upper / Lower', 'PPL', 'Full Body', 'Arnold split', 'Push / Pull split', 'Torso / Limbs', 'Body-part split', 'PPLUL'];
const efforts = [null, 'Fewer hard sets · 2 sets · 0–1 RIR', 'More moderate sets · 3–4 sets · 2–3 RIR'];

const contexts = new Map();
let programs = 0;
let invalid = 0;
let supportedInvalid = 0;
const invalidReasons = new Map();
const supportedInvalidContexts = [];
function record(overrides, axis) {
  const frequency = Number(overrides.daysPerWeek || 4);
  const profile = { ...defaultProfile(), goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: frequency, availableDays: WEEKDAYS, sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], exercisePreference: 'No preference', effortStyle: null, trainingPreferences: '', ...overrides };
  const program = buildProgram(profile); programs += 1;
  const validation = validateProgram(program, profile, { requireProgramQuality: true });
  if (!validation.valid) {
    invalid += 1;
    supportedInvalid += 1; supportedInvalidContexts.push({ axis, profile, errors: validation.errors });
    for (const error of validation.errors) invalidReasons.set(error, (invalidReasons.get(error) || 0) + 1);
  }
  for (const day of program.days) for (const exercise of day.exercises) {
    const item = exerciseCatalog[exercise.exerciseId];
    if (!contexts.has(exercise.exerciseId)) contexts.set(exercise.exerciseId, { count: 0, axes: new Set(), goals: new Set(), environments: new Set(), preferences: new Set(), roles: new Set(), sessions: new Set() });
    const row = contexts.get(exercise.exerciseId); row.count += 1; row.axes.add(axis); row.goals.add(profile.goal); row.environments.add(profile.environment === 'Commercial gym' ? 'commercial' : profile.equipment.join(' + ')); row.preferences.add(profile.exercisePreference); row.roles.add(exercise.programmingRole); row.sessions.add(day.name.replace(/ ·.*$/, ''));
  }
}

for (const environment of environments) for (const style of styles) for (const goal of goals) for (const daysPerWeek of frequencies) for (const priority of priorities) record({ ...environment, goal, daysPerWeek, priorities: priority, exercisePreference: style }, 'equipment-goal-frequency-priority');
for (const trainingPreferences of splitPreferences) for (const daysPerWeek of frequencies) for (const environment of environments) record({ ...environment, daysPerWeek, trainingPreferences }, 'split');
for (const experience of experiences) for (const goal of goals) for (const daysPerWeek of frequencies) record({ experience, goal, daysPerWeek }, 'experience');
for (const effortStyle of efforts) for (const daysPerWeek of frequencies) record({ effortStyle, daysPerWeek }, 'effort');

const rows = [...contexts.entries()].map(([id, context]) => ({
  id, name: exerciseCatalog[id].name, pattern: exerciseCatalog[id].pattern, muscles: exerciseCatalog[id].muscles, equipment: exerciseCatalog[id].equipment,
  kind: exerciseCatalog[id].kind, bodyweight: Boolean(exerciseCatalog[id].bodyweight), progressionQuality: exerciseCatalog[id].progressionQuality,
  stability: exerciseCatalog[id].stability, fatigueCost: exerciseCatalog[id].fatigueCost, technicalDifficulty: exerciseCatalog[id].technicalDifficulty,
  count: context.count, axes: [...context.axes], goals: [...context.goals], environments: [...context.environments], preferences: [...context.preferences], roles: [...context.roles], sessions: [...context.sessions].sort()
})).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

const outputDir = new URL('../artifacts/exercise-audit/', import.meta.url); await mkdir(outputDir, { recursive: true });
await writeFile(new URL('default-exercise-inventory.json', outputDir), JSON.stringify({ generatedAt: new Date().toISOString(), programs, invalid, supportedInvalid, supportedInvalidContexts, invalidReasons: [...invalidReasons.entries()].sort((a, b) => b[1] - a[1]), exerciseCount: rows.length, rows }, null, 2));
const table = rows.map(row => `| ${row.name} | ${row.pattern} | ${row.equipment.join(', ')} | ${row.progressionQuality} | ${row.stability} | ${row.fatigueCost} | ${row.count} |`).join('\n');
await writeFile(new URL('default-exercise-inventory.md', outputDir), `# Rook default exercise inventory\n\n${programs} generated program attempts; ${supportedInvalid} invalid contexts; ${rows.length} exercises selected at least once.\n\n| Exercise | Pattern | Equipment | Progression | Stability | Fatigue | Uses |\n|---|---|---|---|---|---|---:|\n${table}\n`);
console.log(`Default exercise inventory: ${rows.length} exercises across ${programs} generated-program attempts (${supportedInvalid} invalid contexts).`);
if (invalid) console.log(`Invalid reasons:\n${[...invalidReasons.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => `${count}\t${reason}`).join('\n')}`);
console.log(rows.map(row => `${row.name}\t${row.pattern}\t${row.equipment.join('/')}\t${row.count}`).join('\n'));
