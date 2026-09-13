import { generateWarmup } from './warmups.js';

export const DURATION_PLANNING_VERSION = 1;
const KNOWN_CONSTRAINTS = new Set(['beginner-weekly-volume-limit', 'weekly-volume-limit',
  'per-session-volume-limit', 'split-coverage', 'adjacent-day-recovery',
  'next-useful-increment-exceeds-time', 'eight-exercise-complexity-limit',
  'no-missing-compatible-template-role', 'experience-or-effort-set-limit']);

// A discrete exercise/set need not land exactly on a clock target. Retain the
// existing validation ceiling; aim within 20%, with a tighter compact minimum.
export function durationTargetBand(minutes) {
  const target = Number(minutes) || 45;
  return { target, lower: Math.max(25, Math.ceil(target * 0.8)), upper: Math.max(target + 5, Math.ceil(target * 1.15)) };
}

// Used only by newly generated plans. Imported/manual plans retain their
// existing estimator and prescriptions. These are time assumptions, not targets
// written into any logged set, load, reps, or rest field.
export function generatedSessionTiming(exercises = [], profile = {}, catalog = {}) {
  if (!exercises.length) return { minutes: 0, workSeconds: 0, restSeconds: 0, setupSeconds: 0, warmupMinutes: 0, assumptions: [] };
  let workSeconds = 0;
  let restSeconds = 0;
  const assumptions = new Set(['45 sec per rep-based set', '2 min between exercise setups']);
  const paired = new Set();
  for (const exercise of exercises) {
    const item = catalog[exercise.exerciseId] || exercise.importedExercise || {};
    const count = exercise.sets?.length || 0;
    const sides = exercise.loggingMode === 'per_side' || item.unilateral ? 2 : 1;
    const timed = (exercise.measure || item.measure) === 'seconds';
    const low = Number(exercise.repMin);
    const high = Number(exercise.repMax ?? exercise.repMin);
    const seconds = timed && low > 0 && high >= low ? (low + high) / 2 : 45;
    if (sides === 2) assumptions.add('both sides counted for unilateral work');
    if (timed) assumptions.add('timed target or midpoint of its range');
    if (['distance', 'meters'].includes(exercise.measure || item.measure) || exercise.failureTarget)
      assumptions.add('open/untimed target uses a 45 sec estimate, not an invented prescription');
    workSeconds += count * seconds * sides;
    const rest = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 90;
    const members = exercise.supersetId ? exercises.filter(row => row.supersetId === exercise.supersetId) : [];
    if (members.length === 2) {
      if (!paired.has(exercise.supersetId)) {
        // The existing logger rests once after A2, using the larger pair rest.
        restSeconds += Math.max(0, Math.max(...members.map(row => row.sets.length)) - 1) * Math.max(...members.map(row => rest(row.restSeconds)));
        paired.add(exercise.supersetId);
      }
    } else restSeconds += Math.max(0, count - 1) * rest(exercise.restSeconds);
  }
  const warmup = generateWarmup({ exercises }, profile, catalog);
  const warmupMinutes = warmup?.estimatedMinutes || 0;
  const setupSeconds = Math.max(0, exercises.length - 1) * 120;
  return { minutes: Math.ceil((workSeconds + restSeconds + setupSeconds) / 60 + warmupMinutes),
    workSeconds, restSeconds, setupSeconds, warmupMinutes, assumptions: [...assumptions] };
}

export function durationFidelityResult(minutes, target, constraints = []) {
  const band = durationTargetBand(target);
  const reasons = [...new Set(constraints)];
  const status = minutes > band.upper ? 'too-long' : minutes >= band.lower ? 'within-target'
    : reasons.length ? 'short-justified' : 'too-short';
  return { version: DURATION_PLANNING_VERSION, requestedMinutes: band.target, lower: band.lower,
    upper: band.upper, estimatedMinutes: minutes, status, reasons: status === 'short-justified' ? reasons : [] };
}

export function validateDurationFidelity(program) {
  const errors = [];
  for (const day of program.days || []) {
    const result = day.durationFidelity;
    const expected = durationFidelityResult(day.estimatedMinutes,
      program.durationFidelity?.requestedMinutes, result?.reasons);
    if (!result || result.estimatedMinutes !== day.estimatedMinutes ||
        result.requestedMinutes !== expected.requestedMinutes ||
        result.status !== expected.status || result.lower !== expected.lower || result.upper !== expected.upper ||
        ['too-short', 'too-long'].includes(result.status) ||
        result.status === 'short-justified' && (!result.reasons?.length || result.reasons.some(reason => !KNOWN_CONSTRAINTS.has(reason))))
      errors.push(`${day.name}: unexplained duration deviation.`);
  }
  return { valid: errors.length === 0, errors };
}
