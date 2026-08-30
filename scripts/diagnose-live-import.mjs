import { AIService } from '../src/aiService.js';
import { blankState } from '../src/domain.js';

const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, options) => nativeFetch(new URL(url, 'http://127.0.0.1:4173'), options);

const notes = `Monday - Upper
Dumbbell Bench Press - 3x8
Lat Pulldown - 3x10

Wednesday - Rest

Friday - Lower
Leg Press - 3x10
Romanian Deadlift - 3x8`;

const started = Date.now();
const result = await AIService.importTrainingPlan(blankState().profile, notes);
console.log(JSON.stringify({
  seconds: Math.round((Date.now() - started) / 1000),
  days: result.program.days.map(day => ({ weekday: day.weekday, name: day.name, exercises: day.exercises.length })),
  restImportedAsWorkout: result.program.days.some(day => day.weekday === 'Wed' || /rest/i.test(day.name))
}, null, 2));
