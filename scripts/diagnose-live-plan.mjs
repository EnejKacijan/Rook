import { blankState, exerciseCatalog, normalizeGeneratedProgram } from '../src/domain.js';
import { plannerCatalog } from '../src/planQuality.js';

const baseUrl = process.env.LIFT_DIAGNOSTIC_URL || 'http://127.0.0.1:4173';
const largeProfile = process.argv.includes('--large');
const expertReview = process.argv.includes('--expert');
const catalog = plannerCatalog(Object.values(exerciseCatalog));
const profile = {
  ...blankState().profile,
  name: 'Diagnostic',
  ageRange: '18–29',
  sex: 'Prefer not to say',
  goal: largeProfile ? 'Get stronger' : 'Build muscle',
  experience: largeProfile ? 'Advanced' : 'Intermediate',
  daysPerWeek: largeProfile ? 6 : 4,
  availableDays: largeProfile ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Mon', 'Tue', 'Thu', 'Sat'],
  sessionMinutes: largeProfile ? 90 : 60,
  environment: 'Commercial gym',
  equipment: ['full gym'],
  priorities: ['Balanced'],
  effortStyle: 'Balanced workload · usually 3 sets · 1–2 RIR',
  trainingPreferences: '',
  avoid: '',
  onboardingComplete: false
};

let previousValidationError = null;
for (let attempt = 1; attempt <= (expertReview ? 1 : 3); attempt += 1) {
  const started = Date.now();
  console.log(JSON.stringify({ event: 'attempt-start', attempt }));
  try {
    const response = await fetch(`${baseUrl}/api/ai`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'plan', payload: { catalog, profile, previousValidationError, expertReviewMode: expertReview } }),
      signal: AbortSignal.timeout(240_000)
    });
    const body = await response.json();
    console.log(JSON.stringify({ event: 'provider-response', attempt, status: response.status, seconds: Math.round((Date.now() - started) / 1000), error: response.ok ? null : body.error }));
    if (!response.ok) throw new Error(body.error || 'Provider request failed.');
    try {
      const normalized = normalizeGeneratedProgram(body.data, profile, { expertReview, repairInterchangeableCompounds: !expertReview });
      console.log(JSON.stringify({ event: 'success', attempt, name: normalized.name, days: normalized.days.length }));
      process.exitCode = 0;
      break;
    } catch (error) {
      previousValidationError = error.message;
      console.log(JSON.stringify({ event: 'validation-failed', attempt, error: error.message }));
      process.exitCode = 1;
    }
  } catch (error) {
    console.log(JSON.stringify({ event: 'request-failed', attempt, seconds: Math.round((Date.now() - started) / 1000), error: error.message }));
    process.exitCode = 1;
    break;
  }
}
