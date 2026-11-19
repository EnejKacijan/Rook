// "Your year in Rook": a read-only story built from saved records. Nothing
// here writes state; every number is recomputed from history on each open, so
// a corrected or deleted workout changes the review the next time it opens.
import { workoutPerformedDate } from './workoutDates.js';
import { progressionHistory, isDeloadWorkout } from './progressionHistory.js';
import { prEventsForWorkouts } from './performanceInsights.js';
import { effectiveSetReps, loggingModeOf, prComparableSet, segmentKindForSet } from './advancedLogging.js';
import { exerciseCatalog, exerciseLoadRequirement, exerciseMeasure, exerciseName, calendarDate, weekKey, isoDay } from './domain.js';
import { isImportedHistorySet } from './historicalSetSemantics.js';
import { isConditioning } from './optionalActivity.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = index => MONTHS[index];

const finitePositive = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
const yearOf = day => (typeof day === 'string' ? Number(day.slice(0, 4)) : NaN);
const completedSets = exercise => (exercise?.sets || []).filter(set => set.completed);
const loggedWork = workout => (workout.exercises || []).some(exercise => completedSets(exercise).length);

// Date-only and timezone-free imports do not establish an elapsed-time bound.
const recordedInstant = value => typeof value === 'number' ? value : typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? Date.parse(value) : NaN;
export function reliableDurationSeconds(seconds, session) {
  if (!['number', 'string'].includes(typeof seconds) || !finitePositive(seconds)) return null;
  const duration = Math.round(Number(seconds));
  if (!Number.isSafeInteger(duration) || duration < 1) return null;
  const start = recordedInstant(session?.startedAt);
  const end = [session?.endedAt, session?.completedAt].map(recordedInstant).find(Number.isFinite);
  // Trust saved training time, including reviewed long sessions and pauses.
  // Reject contradictions in precise timestamps instead of imposing a cap.
  if (Number.isFinite(start) && Number.isFinite(end) && (end < start || duration * 1000 > end - start + 1000)) return null;
  return duration;
}

// One record per real session. progressionHistory resolves corrections
// (superseded completions, duplicated ids). A native session saved twice under
// new ids keeps its start and finish, and one imported source workout keeps its
// fingerprint; separate sessions on the same day keep their own start times.
const NOT_PERFORMED = new Set(['skipped', 'planned', 'active', 'cancelled', 'discarded']);
export function authoritativeWorkouts(workouts = []) {
  const byIdentity = new Map();
  for (const workout of progressionHistory(workouts)) {
    if (!loggedWork(workout) || NOT_PERFORMED.has(workout.status)) continue;
    const imported = workout.historicalImport;
    const key = imported
      ? `import:${imported.fingerprint || imported.sourceIdentity || workout.id}`
      : workout.startedAt != null ? `native:${workout.startedAt}:${workout.completedAt}` : `id:${workout.id}`;
    byIdentity.set(key, workout);
  }
  return [...byIdentity.values()];
}

const activityDay = session => {
  const value = [session.startedAt, session.completedAt].find(item => item != null && Number.isFinite(new Date(item).getTime()));
  return value != null ? isoDay(new Date(value)) : (typeof session.date === 'string' ? session.date : null);
};
const isActivity = session => ['Cardio', 'Mobility', 'Conditioning'].includes(session?.kind);
function completedActivities(state) {
  const seen = new Map();
  for (const session of state.optionalSessions || []) if (isActivity(session) && session.status === 'completed' && session.completedAt) seen.set(session.id, session);
  return [...seen.values()];
}

// Records and improvements use the same lifts as workout-complete records.
export const recordEligible = exercise => Boolean(exercise && exerciseMeasure(exercise) !== 'seconds' &&
  exerciseLoadRequirement(exercise) === 'required' && !exerciseCatalog[exercise.exerciseId]?.bodyweight &&
  !/assist/i.test(`${exercise.exerciseId} ${exerciseName(exercise)}`));

// External load only. Bodyweight, assistance, timed and unknown loads are
// never converted into kilograms. Drop/rest-pause segments count once each.
function setVolume(exercise, set) {
  if (exerciseMeasure(exercise) === 'seconds' || exerciseLoadRequirement(exercise) === 'none') return null;
  if (/assist/i.test(`${exercise.exerciseId} ${exerciseName(exercise)}`)) return null;
  if (isImportedHistorySet(set) && ['assisted', 'none', 'bodyweight', 'unknown'].includes(set.rawImport?.loadKind)) return null;
  const reps = setReps(exercise, set);
  let total = finitePositive(set.weight) && reps ? Number(set.weight) * reps : 0;
  if (segmentKindForSet(set)) for (const segment of set.segments || [])
    if (segment.completed && finitePositive(segment.weight) && finitePositive(segment.reps)) total += Number(segment.weight) * Number(segment.reps);
  return total || null;
}
// Repetitions actually performed: both sides of a per-side set, plus segments.
function setReps(exercise, set) {
  if (exerciseMeasure(exercise) === 'seconds') return 0;
  if (loggingModeOf(exercise) === 'per_side') {
    const left = Number(set.sides?.left?.reps), right = Number(set.sides?.right?.reps);
    if (finitePositive(left) || finitePositive(right)) return (finitePositive(left) ? left : 0) + (finitePositive(right) ? right : 0);
  }
  return finitePositive(set.reps) ? Number(set.reps) : 0;
}
const segmentReps = set => segmentKindForSet(set) ? (set.segments || []).filter(s => s.completed && finitePositive(s.reps)).reduce((n, s) => n + Number(s.reps), 0) : 0;
const timedSeconds = (exercise, set) => exerciseMeasure(exercise) === 'seconds'
  ? (finitePositive(set.durationSeconds) ? Number(set.durationSeconds) : finitePositive(set.reps) ? Number(set.reps) : 0) : 0;

// The heaviest real set of a session (most reps breaks a tie). Weight and reps
// always come from the same logged set.
function topSet(exercise) {
  let best = null;
  for (const set of exercise.sets || []) {
    if (!set.completed || !prComparableSet(exercise, set) || !finitePositive(set.weight)) continue;
    const weight = Number(set.weight), reps = Number(effectiveSetReps(exercise, set));
    if (!Number.isInteger(reps) || reps <= 0) continue;
    if (!best || weight > best.weight || weight === best.weight && reps > best.reps) best = { weight, reps };
  }
  return best;
}

function improvementsFor(workouts) {
  const byExercise = new Map();
  for (const workout of workouts) {
    if (isDeloadWorkout(workout)) continue;
    const day = workoutPerformedDate(workout);
    for (const exercise of workout.exercises || []) {
      if (!exercise.exerciseId || !recordEligible(exercise)) continue;
      const set = topSet(exercise);
      if (!set) continue;
      if (!byExercise.has(exercise.exerciseId)) byExercise.set(exercise.exerciseId, { exercise, sessions: [] });
      byExercise.get(exercise.exerciseId).sessions.push({ ...set, day, workoutId: workout.id });
    }
  }
  const rows = [];
  for (const { exercise, sessions } of byExercise.values()) {
    if (sessions.length < 2) continue;
    const first = sessions[0];
    let best = null;
    for (const item of sessions.slice(1))
      if (!best || item.weight > best.weight || item.weight === best.weight && item.reps > best.reps) best = item;
    const loadGain = best.weight - first.weight, repGain = best.reps - first.reps;
    if (loadGain < 0 || loadGain === 0 && repGain <= 0) continue;
    // Ranking only: the estimated-1RM change orders results; it is never shown
    // as the result itself.
    const strength = item => item.weight * (1 + Math.min(item.reps, 12) / 30);
    rows.push({ exerciseId: exercise.exerciseId, exercise, name: exerciseName(exercise), from: first, to: best, loadGain, repGain,
      rank: strength(best) - strength(first), sessions: sessions.length });
  }
  return rows.sort((a, b) => b.rank - a.rank || b.loadGain - a.loadGain || b.repGain - a.repGain || b.sessions - a.sessions);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
function weeksInYear(year) {
  const keys = new Set();
  for (let date = new Date(year, 0, 1, 12); date.getFullYear() === year; date.setDate(date.getDate() + 1)) keys.add(weekKey(date));
  return keys.size;
}
const blockDay = block => (block?.completedAt ? isoDay(new Date(block.completedAt)) : null);

// Years whose review has unlocked: calendar years that ended before today's
// local date and contain at least one completed session.
export function yearReviewYears(state, today = isoDay()) {
  const current = yearOf(today), years = new Set();
  for (const workout of authoritativeWorkouts(state.workouts)) years.add(yearOf(workoutPerformedDate(workout)));
  for (const session of completedActivities(state)) years.add(yearOf(activityDay(session)));
  return [...years].filter(year => Number.isInteger(year) && year < current).sort((a, b) => b - a);
}
export const yearReviewUnlocked = (year, today = isoDay()) => Number.isInteger(year) && year < yearOf(today);

// Last year's totals for a neutral comparison with the user's own history.
// Time is compared only when both years have a duration on every workout.
function previousYear(all, activities, year) {
  const workouts = all.filter(workout => yearOf(workoutPerformedDate(workout)) === year);
  if (!workouts.length) return null;
  const days = [...workouts.map(workoutPerformedDate), ...activities.filter(session => yearOf(activityDay(session)) === year).map(activityDay)];
  const timed = workouts.map(workout => reliableDurationSeconds(workout.durationSeconds, workout)).filter(value => value != null);
  return { year, workouts: workouts.length, activeWeeks: new Set(days.map(day => weekKey(calendarDate(day)))).size,
    sets: workouts.reduce((sum, workout) => sum + (workout.exercises || []).reduce((n, exercise) => n + completedSets(exercise).length, 0), 0),
    time: { totalSeconds: timed.reduce((a, b) => a + b, 0), counted: timed.length, of: workouts.length } };
}

export function yearInReview(state, year) {
  const all = authoritativeWorkouts(state.workouts);
  const workouts = all.filter(workout => yearOf(workoutPerformedDate(workout)) === year)
    .sort((a, b) => String(workoutPerformedDate(a)).localeCompare(String(workoutPerformedDate(b))) || new Date(a.startedAt || a.completedAt) - new Date(b.startedAt || b.completedAt));
  const activities = completedActivities(state).filter(session => yearOf(activityDay(session)) === year);
  const days = new Set(workouts.map(workoutPerformedDate)), activityDays = new Set(activities.map(activityDay));
  const allDays = new Set([...days, ...activityDays]);
  const weeks = new Set([...allDays].map(day => weekKey(calendarDate(day))));
  const months = MONTHS.map((label, index) => ({ label, index, workouts: 0, activities: 0 }));
  for (const workout of workouts) months[Number(workoutPerformedDate(workout).slice(5, 7)) - 1].workouts++;
  for (const session of activities) months[Number(activityDay(session).slice(5, 7)) - 1].activities++;
  const topMonth = workouts.length ? months.reduce((best, month) => month.workouts > best.workouts ? month : best, months[0]) : null;

  // Saved durations have no upper time limit. Missing or contradictory ones
  // are reported as coverage, never filled in from wall-clock time.
  const timed = workouts.map(workout => ({ workout, seconds: reliableDurationSeconds(workout.durationSeconds, workout) })).filter(item => item.seconds != null);
  const longest = timed.reduce((best, item) => !best || item.seconds > best.seconds ? item : best, null);
  const totalSeconds = timed.reduce((sum, item) => sum + item.seconds, 0);

  let sets = 0, reps = 0, holdSeconds = 0, volumeKg = 0, volumeSets = 0;
  const exerciseUse = new Map(), muscleSets = new Map();
  for (const workout of workouts) {
    const seenInWorkout = new Set();
    for (const exercise of workout.exercises || []) {
      const done = completedSets(exercise);
      if (!done.length) continue;
      sets += done.length;
      for (const set of done) {
        reps += setReps(exercise, set) + segmentReps(set);
        holdSeconds += timedSeconds(exercise, set);
        const volume = setVolume(exercise, set);
        if (volume) { volumeKg += volume; volumeSets++; }
      }
      const id = exercise.exerciseId || exerciseName(exercise);
      const use = exerciseUse.get(id) || { exerciseId: exercise.exerciseId, exercise, name: exerciseName(exercise), sessions: 0, sets: 0 };
      use.sets += done.length;
      if (!seenInWorkout.has(id)) { use.sessions++; seenInWorkout.add(id); }
      exerciseUse.set(id, use);
      const muscle = exerciseCatalog[exercise.exerciseId]?.muscles?.[0];
      if (muscle) muscleSets.set(muscle, (muscleSets.get(muscle) || 0) + done.length);
    }
  }
  const muscleTotal = [...muscleSets.values()].reduce((a, b) => a + b, 0);
  const focus = [...muscleSets.entries()].map(([muscle, count]) => ({ muscle, sets: count, share: count / muscleTotal }))
    .sort((a, b) => b.sets - a.sets).slice(0, 3);

  // Records compare against all earlier history, including earlier years, so
  // the first January session is not a record by calendar alone.
  const ids = new Set(workouts.map(workout => workout.id));
  const events = prEventsForWorkouts(all, { e1rmEligible: recordEligible }).filter(event => ids.has(event.workoutId) && recordEligible(event.exercise));
  const prSessions = new Set(events.map(event => `${event.workoutId}:${event.exerciseId}`));
  const prExercises = new Map();
  for (const event of events) {
    const best = prExercises.get(event.exerciseId);
    if (!best || event.weight > best.weight || event.weight === best.weight && event.reps > best.reps)
      prExercises.set(event.exerciseId, { exerciseId: event.exerciseId, exercise: event.exercise, name: exerciseName(event.exercise), weight: event.weight, reps: event.reps, date: event.date, type: event.type });
  }
  const recordCounts = new Map();
  for (const key of prSessions) { const id = key.slice(key.indexOf(':') + 1); recordCounts.set(id, (recordCounts.get(id) || 0) + 1); }

  const blockMap = new Map();
  for (const block of [...(state.completedTrainingBlocks || []), state.program?.trainingBlock].filter(Boolean))
    if (block.completed !== false && blockDay(block) && yearOf(blockDay(block)) === year) blockMap.set(block.id, { id: block.id, name: block.name, totalWeeks: block.totalWeeks, completedAt: blockDay(block) });

  const conditioning = activities.filter(isConditioning), otherActivities = activities.filter(session => !isConditioning(session));
  const activityTime = list => {
    const valid = list.map(session => reliableDurationSeconds(session.elapsedSeconds, session)).filter(value => value != null);
    return { seconds: valid.reduce((a, b) => a + b, 0), counted: valid.length };
  };

  return {
    previous: previousYear(all, completedActivities(state), year - 1),
    year, workouts: workouts.length, trainingDays: allDays.size, strengthDays: days.size,
    firstDay: workouts[0] ? workoutPerformedDate(workouts[0]) : null, lastDay: workouts.at(-1) ? workoutPerformedDate(workouts.at(-1)) : null,
    activeWeeks: weeks.size, weeksInYear: weeksInYear(year), months, topMonth,
    time: { totalSeconds, counted: timed.length, of: workouts.length, typicalSeconds: median(timed.map(item => item.seconds)),
      longest: longest ? { seconds: longest.seconds, name: longest.workout.name || 'Workout', day: workoutPerformedDate(longest.workout) } : null },
    sets, reps, holdSeconds, volumeKg: Math.round(volumeKg), volumeSets,
    records: { sessions: prSessions.size, exercises: prExercises.size,
      top: [...prExercises.values()].sort((a, b) => (recordCounts.get(b.exerciseId) || 0) - (recordCounts.get(a.exerciseId) || 0) || b.weight - a.weight).slice(0, 3)
        .map(item => ({ ...item, count: recordCounts.get(item.exerciseId) || 0 })) },
    improvements: improvementsFor(workouts).slice(0, 3),
    topExercises: [...exerciseUse.values()].sort((a, b) => b.sessions - a.sessions || b.sets - a.sets || a.name.localeCompare(b.name)).slice(0, 3),
    distinctExercises: exerciseUse.size, focus,
    blocks: [...blockMap.values()].sort((a, b) => a.completedAt.localeCompare(b.completedAt)),
    conditioning: { sessions: conditioning.length, ...activityTime(conditioning) },
    otherActivities: { sessions: otherActivities.length, ...activityTime(otherActivities) },
    deloadWorkouts: workouts.filter(isDeloadWorkout).length,
    importedWorkouts: workouts.filter(workout => workout.historicalImport).length,
    movedWorkouts: workouts.filter(workout => workout.flexibleWeekMoved).length,
  };
}

// Pages are chosen from what the year can support; a thin year gets a short,
// complete story rather than empty slides. Each fact appears on one page only;
// the finale is the one deliberate recap.
export function yearReviewPages(stats) {
  if (!stats.workouts && !stats.conditioning.sessions && !stats.otherActivities.sessions) return [{ kind: 'empty' }];
  const pages = [{ kind: 'intro' }];
  // A short year folds sets into the finale and records into improvements.
  const full = stats.workouts >= 6;
  if (stats.workouts) pages.push({ kind: 'workouts' });
  if (stats.workouts >= 8 && stats.activeWeeks >= 3) pages.push({ kind: 'rhythm' });
  if (stats.time.counted) pages.push({ kind: 'time' });
  if (full && stats.sets) pages.push({ kind: 'work' });
  if (stats.records.sessions && (full || !stats.improvements.length)) pages.push({ kind: 'records' });
  if (stats.improvements.length) pages.push({ kind: 'improvements' });
  if (full && stats.distinctExercises >= 2) pages.push({ kind: 'favorites' });
  if (stats.blocks.length || stats.conditioning.sessions || stats.otherActivities.sessions) pages.push({ kind: 'beyond' });
  pages.push({ kind: 'finale' });
  return pages;
}

// The intro teases the strongest real result without revealing its numbers.
export function yearHeadline(stats) {
  const top = stats.improvements[0];
  if (top && top.loadGain > 0) return { kind: 'improvement', name: top.name };
  if (stats.records.exercises) return { kind: 'records', count: stats.records.exercises };
  if (top) return { kind: 'reps', name: top.name };
  if (stats.blocks.length) return { kind: 'blocks', count: stats.blocks.length };
  return { kind: 'start', count: stats.workouts };
}
