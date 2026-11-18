import { workoutPerformedDate as workoutDate } from './workoutDates.js';
export const E1RM_FORMULA = "Epley: weight × (1 + reps ÷ 30)";
export const E1RM_MIN_REPS = 1;
export const E1RM_MAX_REPS = 12;

import { effectiveSetReps, prComparableSet } from "./advancedLogging.js";

const finitePositive = (value) =>
  Number.isFinite(Number(value)) && Number(value) > 0;

export function estimatedOneRepMax(weight, reps) {
  const load = Number(weight);
  const repetitions = Number(reps);
  if (
    !finitePositive(load) ||
    !Number.isInteger(repetitions) ||
    repetitions < E1RM_MIN_REPS ||
    repetitions > E1RM_MAX_REPS
  )
    return null;
  return Number((load * (1 + repetitions / 30)).toFixed(2));
}


function chronologicalWorkouts(workouts = []) {
  return [...workouts]
    .filter((workout) => workout?.completedAt)
    .sort((left, right) => {
      const dateDifference = String(workoutDate(left) || "").localeCompare(
        String(workoutDate(right) || ""),
      );
      if (dateDifference) return dateDifference;
      return (
        new Date(left.completedAt || left.endedAt || 0) -
        new Date(right.completedAt || right.endedAt || 0)
      );
    });
}

function completedWeightedSets(exercise) {
  return (exercise?.sets || []).flatMap((set, setIndex) => {
    if (!set.completed || !finitePositive(set.weight) || !prComparableSet(exercise, set)) return [];
    const reps = Number(effectiveSetReps(exercise, set));
    return Number.isInteger(reps) && reps > 0
      ? [{ ...set, setIndex, weight: Number(set.weight), reps }]
      : [];
  });
}

function setBests(sets, e1rmEligible) {
  let heaviest = null, bestEstimate = null;
  const repsAtWeight = new Map();
  for (const set of sets) {
    const weight = Number(set.weight), reps = Number(set.reps);
    if (!heaviest || weight > heaviest.weight || (weight === heaviest.weight && reps > heaviest.reps))
      heaviest = { weight, reps };
    repsAtWeight.set(weight, Math.max(repsAtWeight.get(weight) ?? 0, reps));
    if (e1rmEligible) {
      const estimate = estimatedOneRepMax(weight, reps);
      if (estimate !== null && (bestEstimate === null || estimate > bestEstimate)) bestEstimate = estimate;
    }
  }
  return { heaviest, repsAtWeight, bestEstimate };
}

function compareSetPr(weight, reps, prior, e1rmEligible) {
  // A first exposure establishes a baseline; it is not presented as a PR.
  if (!prior.heaviest) return null;
  const weightPr = weight > prior.heaviest.weight;
  const previousReps = prior.repsAtWeight.get(weight);
  const repPr = previousReps !== undefined && reps > previousReps;
  const e1rm = e1rmEligible ? estimatedOneRepMax(weight, reps) : null;
  const e1rmPr =
    e1rm !== null &&
    prior.bestEstimate !== null &&
    e1rm > prior.bestEstimate + 0.01;
  if (!weightPr && !repPr && !e1rmPr) return null;
  return {
    weight,
    reps,
    estimatedOneRepMax: e1rm,
    weightPr,
    repPr,
    e1rmPr,
    label: e1rmPr ? "Est. 1RM PR" : weightPr ? "WEIGHT PR" : "REP PR",
  };
}

export function analyzeSetPr(set, priorSets = [], { e1rmEligible = true } = {}) {
  if (
    !set?.completed ||
    !finitePositive(set.weight) ||
    !Number.isInteger(Number(set.reps)) ||
    Number(set.reps) <= 0
  )
    return null;
  const prior = priorSets.filter(
    (item) =>
      item?.completed !== false &&
      finitePositive(item.weight) &&
      Number.isInteger(Number(item.reps)) &&
      Number(item.reps) > 0,
  );
  return compareSetPr(Number(set.weight), Number(set.reps), setBests(prior, e1rmEligible), e1rmEligible);
}

function improvementsBySet(sets, prior) {
  let heaviest = null, bestEstimate = null;
  const repBests = new Map();
  for (const set of sets) {
    const result = compareSetPr(set.weight, set.reps, prior, true);
    if (!result) continue;
    const record = { ...result, exercise: set.exercise, setIndex: set.setIndex };
    if (record.weightPr && (!heaviest || record.weight > heaviest.weight ||
        (record.weight === heaviest.weight && record.reps > heaviest.reps))) heaviest = record;
    if (record.repPr && record.reps > (repBests.get(record.weight)?.reps ?? 0))
      repBests.set(record.weight, record);
    if (record.e1rmPr && (!bestEstimate || record.estimatedOneRepMax > bestEstimate.estimatedOneRepMax))
      bestEstimate = record;
  }

  // Category winners share the same record only when they came from the same set.
  const rows = new Map();
  const rowFor = record => {
    if (!rows.has(record)) {
      const { weight, reps, exercise, setIndex } = record;
      rows.set(record, { weight, reps, exercise, setIndex });
    }
    return rows.get(record);
  };
  if (heaviest) rowFor(heaviest).previousHeaviest = prior.heaviest;
  for (const record of repBests.values())
    rowFor(record).previousReps = prior.repsAtWeight.get(record.weight);
  if (bestEstimate) rowFor(bestEstimate).estimate = {
    current: bestEstimate.estimatedOneRepMax,
    previous: prior.bestEstimate,
  };
  return [...rows.values()];
}

export function workoutPersonalBests(workout, history, eligible) {
  const exercises = new Map();
  for (const exercise of workout.exercises || []) {
    if (!exercise.exerciseId || !eligible(exercise)) continue;
    const sets = completedWeightedSets(exercise);
    if (!sets.length) continue;
    if (!exercises.has(exercise.exerciseId))
      exercises.set(exercise.exerciseId, { sets: [], prior: [] });
    exercises.get(exercise.exerciseId).sets.push(...sets.map(set => ({ ...set, exercise })));
  }
  const byExercise = new Map();
  if (!exercises.size) return byExercise;

  for (const previous of history) {
    for (const exercise of previous.exercises || []) {
      const entry = exercises.get(exercise.exerciseId);
      if (!entry || !eligible(exercise)) continue;
      entry.prior.push(...completedWeightedSets(exercise));
    }
  }
  for (const { sets, prior } of exercises.values()) {
    if (!prior.length) continue;
    // An exercise can appear in multiple log rows. Attribute each best to the
    // entry that contains the winning set, even when names are identical.
    for (const { exercise, ...best } of improvementsBySet(sets, setBests(prior, true))) {
      if (!byExercise.has(exercise)) byExercise.set(exercise, []);
      byExercise.get(exercise).push(best);
    }
  }
  return byExercise;
}

export function exercisePerformance(
  workouts = [],
  exerciseId,
  { e1rmEligible = true } = {},
) {
  const sessions = [];
  const allSets = [];
  for (const workout of chronologicalWorkouts(workouts)) {
    for (const exercise of workout.exercises || []) {
      if (exercise.exerciseId !== exerciseId) continue;
      const sets = completedWeightedSets(exercise);
      if (!sets.length) continue;
      allSets.push(...sets);
      const estimates = e1rmEligible
        ? sets
            .map((set) => ({
              ...set,
              value: estimatedOneRepMax(set.weight, set.reps),
            }))
            .filter((set) => set.value !== null)
        : [];
      sessions.push({
        date: workoutDate(workout),
        workoutId: workout.id,
        bestWeight: Math.max(...sets.map((set) => set.weight)),
        bestReps: Math.max(...sets.map((set) => set.reps)),
        estimatedOneRepMax: estimates.length
          ? Math.max(...estimates.map((set) => set.value))
          : null,
      });
    }
  }
  const estimates = e1rmEligible
    ? allSets
        .map((set) => estimatedOneRepMax(set.weight, set.reps))
        .filter((value) => value !== null)
    : [];
  const bestWeight = allSets.length
    ? Math.max(...allSets.map((set) => set.weight))
    : null;
  const bestWeightSets =
    bestWeight === null
      ? []
      : allSets.filter((set) => set.weight === bestWeight);
  return {
    bestWeight,
    bestReps: allSets.length
      ? Math.max(...allSets.map((set) => set.reps))
      : null,
    bestRepsAtBestWeight: bestWeightSets.length
      ? Math.max(...bestWeightSets.map((set) => set.reps))
      : null,
    estimatedOneRepMax: estimates.length ? Math.max(...estimates) : null,
    sessions,
    setCount: allSets.length,
  };
}

export function activeExercisePr(
  workouts = [],
  exercise,
  { e1rmEligible = true } = {},
) {
  return activeExercisePrDetails(workouts, exercise, { e1rmEligible })?.record ?? null;
}

// Presentation evidence from the exact same comparison used by the live badge.
// Earlier comparable sets in this workout can also establish the previous best.
export function activeExercisePrDetails(
  workouts = [],
  exercise,
  { e1rmEligible = true } = {},
) {
  if (!exercise?.exerciseId) return null;
  const priorSets = chronologicalWorkouts(workouts).flatMap((workout) =>
    (workout.exercises || [])
      .filter((item) => item.exerciseId === exercise.exerciseId)
      .flatMap(completedWeightedSets),
  );
  if (!priorSets.length) return null;
  let latest = null;
  const comparison = [...priorSets];
  for (const set of completedWeightedSets(exercise)) {
    const result = analyzeSetPr(set, comparison, { e1rmEligible });
    if (result) {
      const estimates = e1rmEligible
        ? comparison.map(item => estimatedOneRepMax(item.weight, item.reps)).filter(value => value !== null)
        : [];
      const sameLoad = comparison.filter(item => item.weight === result.weight);
      latest = {
        record: { ...result, setId: set.id },
        previous: {
          estimatedOneRepMax: estimates.length ? Math.max(...estimates) : null,
          weight: Math.max(...comparison.map(item => item.weight)),
          repsAtWeight: sameLoad.length ? Math.max(...sameLoad.map(item => item.reps)) : null,
        },
      };
    }
    comparison.push(set);
  }
  return latest;
}

export function prEventsForWorkouts(
  workouts = [],
  { e1rmEligible = () => true } = {},
) {
  const priorByExercise = new Map();
  const events = [];
  for (const workout of chronologicalWorkouts(workouts)) {
    for (const exercise of workout.exercises || []) {
      const exerciseId = exercise.exerciseId;
      if (!exerciseId) continue;
      const prior = priorByExercise.get(exerciseId) || [];
      const sessionByType = new Map();
      for (const set of completedWeightedSets(exercise)) {
        const result = analyzeSetPr(set, prior, {
          e1rmEligible: e1rmEligible(exercise),
        });
        if (result) {
          for (const [type, active] of [
            ["weight", result.weightPr],
            ["reps", result.repPr],
            ["e1rm", result.e1rmPr],
          ])
            if (active)
              sessionByType.set(type, {
                id: `${workout.id}:${exerciseId}:${type}`,
                type,
                label:
                  type === "e1rm"
                    ? "Est. 1RM PR"
                    : type === "weight"
                      ? "Weight PR"
                      : "Rep PR",
                exerciseId,
                exercise,
                workoutId: workout.id,
                date: workoutDate(workout),
                weight: result.weight,
                reps: result.reps,
                estimatedOneRepMax: result.estimatedOneRepMax,
              });
        }
        prior.push(set);
      }
      priorByExercise.set(exerciseId, prior);
      events.push(...sessionByType.values());
    }
  }
  return events;
}

function parseLocalDate(value) {
  return new Date(`${value}T12:00:00`);
}

function isoLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value, count) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + count);
  return isoLocal(date);
}

export function performanceWeekRange(date = new Date()) {
  const value = date instanceof Date ? new Date(date) : parseLocalDate(date);
  value.setHours(12, 0, 0, 0);
  const mondayOffset = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - mondayOffset);
  const start = isoLocal(value);
  return { start, end: addDays(start, 6) };
}

function completedWorkingSets(workout) {
  return (workout.exercises || []).reduce(
    (total, exercise) =>
      total +
      (exercise.sets || []).filter(
        (set) => set.completed && set.planned !== false && !set.added,
      ).length,
    0,
  );
}

function uniqueCompletedWorkouts(workouts) {
  const superseded = new Set(
    workouts.map((workout) => workout.supersedesCompletionId).filter(Boolean),
  );
  const byOccurrence = new Map();
  for (const workout of workouts) {
    if (superseded.has(workout.id) || completedWorkingSets(workout) === 0)
      continue;
    const key = workout.sourcePlanSlotId || workout.id;
    byOccurrence.set(key, workout);
  }
  return [...byOccurrence.values()];
}

function observationForExercises(workouts) {
  const result = new Map();
  for (const workout of chronologicalWorkouts(workouts)) {
    for (const exercise of workout.exercises || []) {
      const sets = completedWeightedSets(exercise);
      if (!sets.length) continue;
      const current = result.get(exercise.exerciseId) || {
        bestWeight: null,
        repsByWeight: new Map(),
        bestE1rm: null,
      };
      for (const set of sets) {
        current.bestWeight = Math.max(current.bestWeight ?? 0, set.weight);
        current.repsByWeight.set(
          set.weight,
          Math.max(current.repsByWeight.get(set.weight) || 0, set.reps),
        );
        const estimate = estimatedOneRepMax(set.weight, set.reps);
        if (estimate !== null)
          current.bestE1rm = Math.max(current.bestE1rm ?? 0, estimate);
      }
      result.set(exercise.exerciseId, current);
    }
  }
  return result;
}

function exerciseProgressCounts(previousWorkouts, weekWorkouts) {
  const previous = observationForExercises(previousWorkouts);
  const current = observationForExercises(weekWorkouts);
  let progressed = 0;
  let held = 0;
  for (const [exerciseId, latest] of current) {
    const prior = previous.get(exerciseId);
    if (!prior) continue;
    const heavier = (latest.bestWeight || 0) > (prior.bestWeight || 0);
    const moreReps = [...latest.repsByWeight].some(
      ([weight, reps]) =>
        prior.repsByWeight.has(weight) && reps > prior.repsByWeight.get(weight),
    );
    const strongerEstimate =
      latest.bestE1rm !== null &&
      prior.bestE1rm !== null &&
      latest.bestE1rm > prior.bestE1rm + 0.01;
    if (heavier || moreReps || strongerEstimate) progressed += 1;
    else held += 1;
  }
  return { progressed, held };
}

export function weeklyPerformanceReview(
  state,
  date = new Date(),
  { e1rmEligible = () => true, exerciseLabel = null } = {},
) {
  const range = performanceWeekRange(date);
  const allCompleted = chronologicalWorkouts(state?.workouts || []);
  const inWeek = uniqueCompletedWorkouts(
    allCompleted.filter((workout) => {
      const value = workoutDate(workout);
      return value && value >= range.start && value <= range.end;
    }),
  );
  const previous = allCompleted.filter(
    (workout) => String(workoutDate(workout) || "") < range.start,
  );
  const events = prEventsForWorkouts(allCompleted, { e1rmEligible }).filter(
    (event) => event.date >= range.start && event.date <= range.end,
  );
  const prExerciseCount = new Set(events.map((event) => event.exerciseId)).size;
  const scheduleMoves = state?.weekScheduleOverrides?.[range.start] || {};
  const flexible = Object.values(state?.flexibleWeek?.sessions || {});
  const moved = new Set([...Object.keys(scheduleMoves), ...flexible.filter(r => !r.skipped && r.scheduledDate !== r.originalDate && r.scheduledDate >= range.start && r.scheduledDate <= range.end).map(r => r.id)]).size;
  let skipped = flexible.filter(r => r.skipped && r.originalDate >= range.start && r.originalDate <= range.end).length;
  for (let cursor = range.start; cursor <= range.end; cursor = addDays(cursor, 1))
    skipped += Object.values(state?.workoutOccurrenceOverrides?.[cursor] || {})
      .filter((override) => override?.skipWorkout).length;
  const adjusted = inWeek.filter((workout) => workout.adjustment).length;
  const progress = exerciseProgressCounts(previous, inWeek);
  const blockWorkout = inWeek.find((workout) => workout.trainingBlock);
  const activeBlock = state?.program?.trainingBlock;
  const block = blockWorkout?.trainingBlock || activeBlock || null;
  const performedWeeks = [...new Set(inWeek.filter(workout => workout.trainingBlock).map(workout => Number(workout.trainingBlock.blockWeekNumber)).filter(Boolean))].sort((a, b) => a - b);
  const blockContext = block
    ? {
        name: block.blockName || block.name,
        week: Number(block.blockWeekNumber || block.currentWeek) || 1,
        weeks: performedWeeks,
        totalWeeks: Number(block.totalWeeks) || null,
        plannedDeload: Boolean(
          block.plannedDeload ||
            block.weeks?.[Math.max(0, Number(block.currentWeek || 1) - 1)]
              ?.deload,
        ),
      }
    : null;
  const inRange = date => date >= range.start && date <= range.end;
  const planned = Math.max(0, (Number(state?.program?.days?.length) || 0) + flexible.filter(r => !r.skipped && !inRange(r.originalDate) && inRange(r.scheduledDate)).length - flexible.filter(r => !r.skipped && inRange(r.originalDate) && !inRange(r.scheduledDate)).length);
  const freestyleCompleted = inWeek.filter(workout => workout.source === 'freestyle').length;
  const completed = inWeek.length - freestyleCompleted;
  const completedSets = inWeek.reduce(
    (total, workout) => total + completedWorkingSets(workout),
    0,
  );
  const summary = [];
  if (!planned && !completed) summary.push("No sessions planned this week.");
  else summary.push(`${completed} of ${planned} sessions completed.`);
  if (freestyleCompleted) summary.push(`${freestyleCompleted} freestyle ${freestyleCompleted === 1 ? 'workout' : 'workouts'} logged separately.`);
  if (progress.progressed)
    summary.push(
      `${progress.progressed} ${progress.progressed === 1 ? "exercise" : "exercises"} progressed.`,
    );
  if (progress.held)
    summary.push(
      `${progress.held} ${progress.held === 1 ? "exercise was" : "exercises were"} held.`,
    );
  const e1rmHighlight = events.find((event) => event.type === "e1rm");
  if (e1rmHighlight)
    summary.push(
      `${exerciseLabel?.(e1rmHighlight.exercise) || e1rmHighlight.exercise?.name || e1rmHighlight.exerciseId} reached a new estimated 1RM.`,
    );
  else if (prExerciseCount)
    summary.push(
      `${prExerciseCount} meaningful ${prExerciseCount === 1 ? "PR was" : "PRs were"} logged.`,
    );
  if (skipped)
    summary.push(
      `${skipped} ${skipped === 1 ? "session was" : "sessions were"} explicitly skipped.`,
    );
  if (blockContext?.plannedDeload)
    summary.push("Planned deload week. Lower programmed targets are expected.");
  if (performedWeeks.length > 1) summary.push(`Includes program weeks ${performedWeeks.join(' and ')}. Carried sessions retain their original targets.`);
  return {
    ...range,
    planned,
    completed,
    freestyleCompleted,
    adjusted,
    moved,
    completedSets,
    exercisesProgressed: progress.progressed,
    exercisesHeld: progress.held,
    skipped,
    prCount: prExerciseCount,
    prEvents: events,
    blockContext,
    summary,
    empty: inWeek.length === 0 && events.length === 0,
    partial: completed > 0 && planned > completed,
  };
}
