export const LIGHT_CARDIO_TYPES = ['Walking', 'Cycling', 'Elliptical', 'Easy run', 'Other'];
export const LIGHT_CARDIO_INTENSITIES = ['Easy', 'Moderate'];
export const CONDITIONING_TYPES = ['Running', 'Bike', 'Rower', 'SkiErg', 'Assault / Air Bike', 'Jump rope', 'Sled', 'Stair machine', 'Other'];
export const CONDITIONING_INTENSITIES = ['Moderate', 'Hard'];
export const CONDITIONING_FORMATS = ['Steady', 'Intervals'];
export const isConditioning = activity => activity?.kind === 'Conditioning' && activity?.intent === 'conditioning';
export const optionalActivityIntentLabel = activity => isConditioning(activity) ? 'Conditioning' : activity?.kind === 'Cardio' ? 'Light cardio' : 'Mobility / recovery';
export const INTERVAL_LIMITS = { rounds: [1, 30], workSeconds: [5, 600], restSeconds: [0, 600] };

export function conditioningConfiguration(draft) {
  if (!CONDITIONING_TYPES.includes(draft.activity)) throw new Error('Choose a conditioning type.');
  if (!CONDITIONING_INTENSITIES.includes(draft.intensity)) throw new Error('Choose Moderate or Hard intensity.');
  if (!['steady', 'intervals'].includes(draft.format)) throw new Error('Choose Steady or Intervals.');
  if (draft.format === 'steady') {
    const seconds = Number(draft.durationSeconds);
    if (!Number.isFinite(seconds) || seconds < 60 || seconds > 10800) throw new Error('Choose a duration from 1 to 180 minutes.');
    return { format: 'steady', duration: seconds / 60 };
  }
  const intervals = {};
  for (const [key, [min, max]] of Object.entries(INTERVAL_LIMITS)) {
    const number = Number(draft.intervals?.[key]);
    if (!Number.isInteger(number) || number < min || number > max) throw new Error('Choose valid rounds, work and rest durations.');
    intervals[key] = number;
  }
  // No trailing rest after the final work round.
  const { rounds, workSeconds, restSeconds } = intervals;
  return { format: 'intervals', intervals, duration: (rounds * workSeconds + (rounds - 1) * restSeconds) / 60 };
}

export function intervalProgress(intervals, elapsedSeconds) {
  const { rounds, workSeconds, restSeconds } = intervals;
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0), cycle = workSeconds + restSeconds;
  const totalSeconds = rounds * workSeconds + (rounds - 1) * restSeconds;
  const completedRounds = Math.min(rounds, Math.floor((elapsed + restSeconds) / cycle));
  if (elapsed >= totalSeconds) return { round: rounds, phase: 'Complete', remainingSeconds: 0, completedRounds, totalSeconds };
  const index = Math.floor(elapsed / cycle), within = elapsed - index * cycle, work = within < workSeconds;
  return { round: index + 1, phase: work ? 'Work' : 'Rest', remainingSeconds: Math.ceil((work ? workSeconds : cycle) - within), completedRounds, totalSeconds };
}

export function optionalActivitySummary(activity) {
  if (isConditioning(activity) && activity.format === 'intervals') {
    const done = activity.completedRounds ?? intervalProgress(activity.intervals, optionalActivitySeconds(activity)).completedRounds;
    return `${done === activity.intervals.rounds ? done : `${done} of ${activity.intervals.rounds}`} rounds · ${activity.intensity}`;
  }
  return `${optionalActivityDurationLabel(optionalActivitySeconds(activity))}${activity.kind !== 'Mobility' ? ` · ${activity.intensity}` : ''}`;
}

export function completedOptionalActivity(state, id) {
  return (state.optionalSessions || []).find(item => item.id === id && item.status === 'completed' && (['Cardio', 'Mobility'].includes(item.kind) || isConditioning(item))) || null;
}

export const optionalActivitySeconds = activity => Math.max(0, Math.round(Number(activity?.elapsedSeconds) || 0));
export function optionalActivityDurationLabel(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0)), minutes = Math.floor(total / 60), remainder = total % 60;
  return minutes ? `${minutes} min${remainder ? ` ${remainder} sec` : ''}` : `${remainder} sec`;
}

function assertUnchanged(current, expected) {
  if (expected && JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('This activity changed. Reopen it before making changes.');
}

export function editCompletedOptionalActivity(state, id, draft, expected) {
  const current = completedOptionalActivity(state, id);
  if (!current) throw new Error('This activity is no longer available.');
  assertUnchanged(current, expected);
  const seconds = Number(draft.durationSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Choose a valid duration.');
  const conditioning = isConditioning(current);
  const activity = current.kind === 'Cardio' || conditioning ? String(draft.activity || '').trim() : current.activity;
  if (!activity || activity.length > 60) throw new Error('Choose an activity type.');
  const intensity = current.kind === 'Cardio' || conditioning ? draft.intensity : 'Easy';
  if (!(conditioning ? CONDITIONING_INTENSITIES : LIGHT_CARDIO_INTENSITIES).includes(intensity)) throw new Error(conditioning ? 'Choose Moderate or Hard intensity.' : 'Choose Easy or Moderate intensity.');
  const configuration = conditioning ? conditioningConfiguration({ ...draft, durationSeconds: draft.targetSeconds ?? current.duration * 60 }) : {};
  const replacement = { ...current, ...configuration, activity, intensity, elapsedSeconds: Math.round(seconds) };
  if (conditioning) {
    if (configuration.format === 'intervals') replacement.completedRounds = seconds === current.elapsedSeconds && JSON.stringify(configuration.intervals) === JSON.stringify(current.intervals) ? current.completedRounds ?? intervalProgress(configuration.intervals, seconds).completedRounds : intervalProgress(configuration.intervals, seconds).completedRounds;
    else { delete replacement.intervals; delete replacement.completedRounds; }
  }
  if (JSON.stringify(replacement) === JSON.stringify(current)) return state;
  // Recovery duration keeps its original target. Interval targets follow the
  // edited specification; elapsedSeconds is always the actual logged duration.
  // Preserve ID, date, start/completion timestamps and timer provenance.
  return { ...state, optionalSessions: state.optionalSessions.map(item => item.id === id ? replacement : item) };
}

export function deleteCompletedOptionalActivity(state, id, expected) {
  const current = completedOptionalActivity(state, id);
  if (!current) {
    if (state.optionalSessions?.some(item => item.id === id)) throw new Error('Only completed optional activities can be deleted here.');
    return state;
  }
  assertUnchanged(current, expected);
  return { ...state, optionalSessions: state.optionalSessions.filter(item => item.id !== id) };
}
