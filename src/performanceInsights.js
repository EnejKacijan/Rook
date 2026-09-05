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

function workoutDate(workout) {
  const explicit = workout?.canonicalPlanDate || workout?.workoutDateKey;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(explicit || ""))) return explicit;
  const value = workout?.completedAt ?? workout?.endedAt ?? workout?.startedAt;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  return (exercise?.sets || [])
    .filter(
      (set) =>
        set.completed &&
        finitePositive(set.weight) &&
        prComparableSet(exercise, set) &&
        Number.isInteger(Number(effectiveSetReps(exercise, set))) &&
        Number(effectiveSetReps(exercise, set)) > 0,
    )
    .map((set) => ({
      ...set,
      weight: Number(set.weight),
      reps: Number(effectiveSetReps(exercise, set)),
    }));
}

export function analyzeSetPr(set, priorSets = [], { e1rmEligible = true } = {}) {
  if (
    !set?.completed ||
    !finitePositive(set.weight) ||
    !Number.isInteger(Number(set.reps)) ||
    Number(set.reps) <= 0
  )
    return null;
  const weight = Number(set.weight);
  const reps = Number(set.reps);
  const prior = priorSets.filter(
    (item) =>
      item?.completed !== false &&
      finitePositive(item.weight) &&
      Number.isInteger(Number(item.reps)) &&
      Number(item.reps) > 0,
  );
  // A first exposure establishes a baseline; it is not presented as a PR.
  if (!prior.length) return null;
  const bestWeight = Math.max(...prior.map((item) => Number(item.weight)));
  const sameLoad = prior.filter((item) => Number(item.weight) === weight);
  const weightPr = weight > bestWeight;
  const repPr =
    !weightPr &&
    sameLoad.length > 0 &&
    reps > Math.max(...sameLoad.map((item) => Number(item.reps)));
  const e1rm = e1rmEligible ? estimatedOneRepMax(weight, reps) : null;
  const priorE1rms = e1rmEligible
    ? prior
        .map((item) => estimatedOneRepMax(item.weight, item.reps))
        .filter((value) => value !== null)
    : [];
  const e1rmPr =
    e1rm !== null &&
    priorE1rms.length > 0 &&
    e1rm > Math.max(...priorE1rms) + 0.01;
  if (!weightPr && !repPr && !e1rmPr) return null;
  return {
    weight,
    reps,
    estimatedOneRepMax: e1rm,
    weightPr,
    repPr,
    e1rmPr,
    label: e1rmPr ? "e1RM PR" : weightPr ? "WEIGHT PR" : "REP PR",
  };
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
    if (result) latest = { ...result, setId: set.id };
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
                    ? "e1RM PR"
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
  const moved = new Set(Object.keys(scheduleMoves)).size;
  let skipped = 0;
  for (let cursor = range.start; cursor <= range.end; cursor = addDays(cursor, 1))
    skipped += Object.values(state?.workoutOccurrenceOverrides?.[cursor] || {})
      .filter((override) => override?.skipWorkout).length;
  const adjusted = inWeek.filter((workout) => workout.adjustment).length;
  const progress = exerciseProgressCounts(previous, inWeek);
  const blockWorkout = inWeek.find((workout) => workout.trainingBlock);
  const activeBlock = state?.program?.trainingBlock;
  const block = blockWorkout?.trainingBlock || activeBlock || null;
  const blockContext = block
    ? {
        name: block.blockName || block.name,
        week: Number(block.blockWeekNumber || block.currentWeek) || 1,
        totalWeeks: Number(block.totalWeeks) || null,
        plannedDeload: Boolean(
          block.plannedDeload ||
            block.weeks?.[Math.max(0, Number(block.currentWeek || 1) - 1)]
              ?.deload,
        ),
      }
    : null;
  const planned = Number(state?.program?.days?.length) || 0;
  const completed = inWeek.length;
  const completedSets = inWeek.reduce(
    (total, workout) => total + completedWorkingSets(workout),
    0,
  );
  const summary = [];
  if (!planned && !completed) summary.push("No sessions planned this week.");
  else summary.push(`${completed} of ${planned} sessions completed.`);
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
  return {
    ...range,
    planned,
    completed,
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
    empty: completed === 0 && events.length === 0,
    partial: completed > 0 && planned > completed,
  };
}
