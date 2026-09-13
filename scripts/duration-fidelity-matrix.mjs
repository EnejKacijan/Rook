import { mkdir, writeFile } from 'node:fs/promises';
import { defaultProfile, buildProgram, validateProgram, WEEKDAYS, exerciseCatalog, weeklyStimulusVolume } from '../src/domain.js';
import { generateWarmup } from '../src/warmups.js';

const phase = process.argv.includes('--before') ? 'before' : 'after';
const out = 'artifacts/ROOK-DURATION-FIDELITY';
await mkdir(out, { recursive: true });
const results = [];
const goals = ['Build muscle', 'Get stronger', 'Lose fat', 'General fitness', 'Athletic performance'];
const explicit = { 2: 'Full Body', 3: 'Push / Pull / Legs', 4: 'Upper / Lower', 5: 'Push / Pull / Legs + Upper / Lower', 6: 'Push / Pull / Legs' };
for (const daysPerWeek of [2, 3, 4, 5, 6]) {
  for (const experience of ['Beginner', 'Intermediate', 'Advanced']) for (const [goalIndex, goal] of goals.entries()) {
    for (const mode of ['auto-gym', 'explicit-minimal']) for (const warmups of [true, false]) for (const sessionMinutes of [30, 45, 60, 75, 90, 120]) {
      const profile = { ...defaultProfile(), goal, experience, daysPerWeek, availableDays: [...WEEKDAYS], sessionMinutes,
        environment: mode === 'auto-gym' ? 'Commercial gym' : 'Home gym',
        equipment: mode === 'auto-gym' ? ['full gym'] : goalIndex % 2 ? ['dumbbells', 'bodyweight'] : ['bodyweight'],
        trainingPreferences: mode === 'auto-gym' ? '' : explicit[daysPerWeek],
        priorities: ['Balanced'], recommendedWarmupsEnabled: warmups, rampUpSetsEnabled: warmups };
      const key = `${daysPerWeek}-${experience}-${goal}-${mode}-${warmups}`;
      try {
        const program = buildProgram(profile);
        const validation = validateProgram(program, profile);
        results.push({ key, profile, template: program.templateId, valid: validation.valid, errors: validation.errors,
          volume: weeklyStimulusVolume(program), durationFidelity: program.durationFidelity,
          days: program.days.map(day => {
            const warmup = generateWarmup(day, profile, exerciseCatalog);
            return { name: day.name, weekday: day.weekday, minutes: day.estimatedMinutes,
              exercises: day.exercises.length, workingSets: day.exercises.reduce((sum, item) => sum + item.sets.length, 0),
              warmupMinutes: warmup?.estimatedMinutes || 0, warmupSets: (warmup?.rampUpSets || []).reduce((sum, group) => sum + group.sets.length, 0),
              restSeconds: day.exercises.map(item => item.restSeconds), recoveryAdjustment: day.recoveryAdjustment,
              durationFidelity: day.durationFidelity,
              prescription: day.exercises.map(item => ({ exerciseId: item.exerciseId, sets: item.sets.length, repMin: item.repMin, repMax: item.repMax, restSeconds: item.restSeconds })) };
          }) });
      } catch (error) { results.push({ key, profile, blocked: error.message }); }
    }
  }
  console.log(`${phase}: ${daysPerWeek} days completed; ${results.length} profiles`);
}
await writeFile(`${out}/${phase}.json`, JSON.stringify(results, null, 2));
for (const minutes of [30, 45, 60, 75, 90, 120]) {
  const subset = results.filter(row => row.profile.sessionMinutes === minutes);
  const days = subset.flatMap(row => row.days || []);
  console.log(JSON.stringify({ minutes, plans: subset.length, blocked: subset.filter(row => row.blocked).length,
    invalid: subset.filter(row => row.valid === false).length, mean: +(days.reduce((sum, day) => sum + day.minutes, 0) / days.length).toFixed(1),
    min: Math.min(...days.map(day => day.minutes)), max: Math.max(...days.map(day => day.minutes)) }));
}
