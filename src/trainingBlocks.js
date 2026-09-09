import { hasOpenRepTarget } from './advancedLogging.js';
export const TRAINING_BLOCK_SCHEMA_VERSION = 1;
export const DEFAULT_TRAINING_BLOCK_WEEKS = 6;

const clone = (value) => structuredClone(value);
const uid = (prefix) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`}`;
const clamp = (value, minimum, maximum) => {
  const numeric = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(numeric) ? numeric : minimum));
};
const isoDate = (value = Date.now()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
};

function targetsForWeek(weekNumber, totalWeeks, deloadWeek) {
  if (weekNumber === deloadWeek)
    return {
      phase: "deload",
      label: "Planned deload",
      reason: "Planned lower-volume week before the block ends.",
      repOffset: 0,
      rirDelta: 2,
      mainSetDelta: 0,
      setMultiplier: 0.6,
      progressionExpectation: "Keep technique crisp; no load increase is required.",
      changes: [
        { variable: "working sets", reason: "Reduce accumulated training volume." },
        { variable: "RIR", reason: "Keep more repetitions in reserve." },
      ],
    };
  if (weekNumber === 1)
    return {
      phase: "base",
      label: "Base week",
      reason: "Establish repeatable working weights and clean technique.",
      repOffset: 0,
      rirDelta: 0,
      mainSetDelta: 0,
      setMultiplier: 1,
      progressionExpectation: "Use existing performance-based progression guidance.",
      changes: [],
    };
  if (weekNumber === 2)
    return {
      phase: "build",
      label: "Build repetitions",
      reason: "Add a small repetition target before increasing load.",
      repOffset: 1,
      rirDelta: 0,
      mainSetDelta: 0,
      setMultiplier: 1,
      progressionExpectation: "Add load only when the existing progression rule supports it.",
      changes: [{ variable: "reps", reason: "Build work within the current load." }],
    };
  if (weekNumber === 3)
    return {
      phase: "build",
      label: "Build effort",
      reason: "Keep the repetition target and move slightly closer to the planned effort.",
      repOffset: 1,
      rirDelta: -1,
      mainSetDelta: 0,
      setMultiplier: 1,
      progressionExpectation: "Use the same achievable loads unless performance supports more.",
      changes: [{ variable: "RIR", reason: "Progress effort without forcing a weight jump." }],
    };
  const finalWorkingWeek = deloadWeek ? deloadWeek - 1 : totalWeeks;
  if (weekNumber >= 4 && weekNumber < finalWorkingWeek)
    return {
      phase: "build",
      label: "Build volume",
      reason: "Add one working set to main movements while other targets stay stable.",
      repOffset: 1,
      rirDelta: -1,
      mainSetDelta: 1,
      setMultiplier: 1,
      progressionExpectation: "Keep loads achievable; the added set is the planned progression.",
      changes: [{ variable: "working sets", reason: "Progress main-movement volume only." }],
    };
  return {
    phase: "final",
    label: "Consolidate",
    reason: "Repeat the block’s strongest sustainable prescription before review.",
    repOffset: 1,
    rirDelta: -1,
    mainSetDelta: totalWeeks >= 5 ? 1 : 0,
    setMultiplier: 1,
    progressionExpectation: "Do not force a load increase; existing performance guidance still decides.",
    changes: [],
  };
}

function blockWeeks(program, blockId, totalWeeks, deloadWeek, existingWeeks = []) {
  const existing = new Map(existingWeeks.map((week) => [week.weekNumber, week]));
  return Array.from({ length: totalWeeks }, (_, index) => {
    const weekNumber = index + 1;
    const prior = existing.get(weekNumber);
    const defaults = targetsForWeek(weekNumber, totalWeeks, deloadWeek);
    const targets = prior
      ? {
          ...defaults,
          phase: ["base", "build", "final", "deload"].includes(prior.phase) ? prior.phase : defaults.phase,
          label: String(prior.label || defaults.label).slice(0, 60),
          reason: String(prior.reason || defaults.reason).slice(0, 180),
          repOffset: clamp(prior.repOffset ?? defaults.repOffset, -3, 5),
          rirDelta: clamp(prior.rirDelta ?? defaults.rirDelta, -3, 4),
          mainSetDelta: clamp(prior.mainSetDelta ?? defaults.mainSetDelta, -2, 2),
          setMultiplier: Math.min(1, Math.max(0.25, Number(prior.setMultiplier) || defaults.setMultiplier)),
          progressionExpectation: String(prior.progressionExpectation || defaults.progressionExpectation).slice(0, 180),
          changes: Array.isArray(prior.changes) ? clone(prior.changes).slice(0, 4) : defaults.changes,
        }
      : defaults;
    return {
      id: prior?.id || `${blockId}:week:${weekNumber}`,
      weekNumber,
      ...targets,
      workouts: (program.days || []).map((day) => ({
        id:
          prior?.workouts?.find((item) => item.programDayId === day.id)?.id ||
          `${blockId}:week:${weekNumber}:workout:${day.id}`,
        programDayId: day.id,
        weekday: day.weekday,
      })),
    };
  });
}

export function createTrainingBlock(program, options = {}) {
  if (!program?.days?.length) return null;
  const totalWeeks = clamp(options.totalWeeks || DEFAULT_TRAINING_BLOCK_WEEKS, 2, 12);
  const id = options.id || uid("training-block");
  const includeDeload = options.includeDeload !== false;
  const plannedDeloadWeek = includeDeload
    ? clamp(options.plannedDeloadWeek || totalWeeks, 2, totalWeeks)
    : null;
  return {
    schemaVersion: TRAINING_BLOCK_SCHEMA_VERSION,
    id,
    name: String(options.name || program.name || "Training block").trim().slice(0, 80),
    startDate: isoDate(options.startDate || Date.now()),
    totalWeeks,
    plannedDeloadWeek,
    currentWeek: clamp(options.currentWeek || 1, 1, totalWeeks),
    completed: Boolean(options.completed),
    completedAt: options.completedAt || null,
    resolvedSkips: Array.isArray(options.resolvedSkips) ? clone(options.resolvedSkips).filter(item => item?.blockWorkoutId && item?.blockWeekId) : [],
    weeks: blockWeeks(program, id, totalWeeks, plannedDeloadWeek, options.weeks),
  };
}

export function normalizeTrainingBlock(program) {
  if (!program?.days?.length) return null;
  const current = program.trainingBlock;
  if (!current?.id)
    return createTrainingBlock(program, {
      id: program.id ? `training-block:${program.id}` : undefined,
      name: program.name || "Training block",
      startDate: program.createdAt || Date.now(),
    });
  return createTrainingBlock(program, {
    ...current,
    includeDeload: current.plannedDeloadWeek != null,
    weeks: current.weeks,
  });
}

export function normalizeTrainingBlocksState(state) {
  if (!state || typeof state !== "object") return state;
  if (state.program?.days?.length)
    state.program.trainingBlock = normalizeTrainingBlock(state.program);
  state.completedTrainingBlocks = (Array.isArray(state.completedTrainingBlocks)
    ? state.completedTrainingBlocks
    : [])
    .filter((block) => block?.id && Array.isArray(block.weeks))
    .slice(-24)
    .map(clone);
  return state;
}

export const currentTrainingBlock = (state) => state?.program?.trainingBlock || null;
export const currentTrainingBlockWeek = (state) => {
  const block = currentTrainingBlock(state);
  return block?.weeks?.find((week) => week.weekNumber === block.currentWeek) || null;
};

export function prescribeTrainingBlockWorkout(state, template) {
  const block = currentTrainingBlock(state);
  const week = currentTrainingBlockWeek(state);
  if (!block || !week || !template?.exercises?.length) return template;
  const workoutRef = week.workouts.find((item) => item.programDayId === template.id);
  if (!workoutRef) return template;
  const workout = clone(template);
  workout.trainingBlock = {
    blockId: block.id,
    blockName: block.name,
    blockWeekId: week.id,
    blockWeekNumber: week.weekNumber,
    totalWeeks: block.totalWeeks,
    blockWorkoutId: workoutRef.id,
    phase: week.phase,
    label: week.label,
    reason: week.reason,
    progressionExpectation: week.progressionExpectation,
    plannedDeload: week.phase === "deload",
  };
  workout.exercises = workout.exercises.map((exercise) => {
    const next = clone(exercise);
    const baseSetCount = next.sets.length;
    const setDelta = next.programmingRole === "main" ? week.mainSetDelta : 0;
    const targetSetCount = Math.max(
      1,
      week.phase === "deload"
        ? Math.round(baseSetCount * week.setMultiplier)
        : baseSetCount + setDelta,
    );
    if (!hasOpenRepTarget(next)) {
      next.repMin = Math.max(1, Number(next.repMin || 1) + week.repOffset);
      next.repMax = Math.max(next.repMin, Number(next.repMax || next.repMin) + week.repOffset);
    }
    if (next.targetRir !== null && next.targetRir !== undefined && next.targetRir !== "" && Number.isFinite(Number(next.targetRir)))
      next.targetRir = clamp(Number(next.targetRir) + week.rirDelta, 0, 4);
    if (targetSetCount < next.sets.length) next.sets = next.sets.slice(0, targetSetCount);
    while (next.sets.length < targetSetCount) {
      const source = clone(next.sets.at(-1) || { weight: null, completed: false, rir: null });
      next.sets.push({
        ...source,
        id: `${exercise.id}:block-week-${week.weekNumber}:set-${next.sets.length + 1}`,
        reps: next.repMin,
        completed: false,
      });
    }
    next.sets = next.sets.map((set) => ({ ...set, reps: next.repMin }));
    if (week.changes.length) next.blockTargetReasons = clone(week.changes);
    return next;
  });
  return workout;
}

export function advanceTrainingBlockAfterWorkout(state, session) {
  const block = currentTrainingBlock(state);
  const context = session?.trainingBlock;
  if (!block || !context || context.blockId !== block.id || block.completed)
    return state;
  if (context.blockWeekNumber !== block.currentWeek) return state;
  const week = currentTrainingBlockWeek(state);
  const completedWorkoutIds = new Set(
    (state.workouts || [])
      .filter(
        (workout) =>
          workout.trainingBlock?.blockId === block.id &&
          workout.trainingBlock?.blockWeekId === week.id &&
          workout.completedAt && !workout.optionalSessionId,
      )
      .map((workout) => workout.trainingBlock.blockWorkoutId),
  );
  const skippedIds = new Set((block.resolvedSkips || []).filter(item => item.blockWeekId === week.id).map(item => item.blockWorkoutId));
  if (state.activeWorkout?.trainingBlock?.blockId === block.id) return state;
  if (!week.workouts.filter(workout => !state.program.days.find(day => day.id === workout.programDayId)?.optional).every((workout) => completedWorkoutIds.has(workout.id) || skippedIds.has(workout.id)))
    return state;
  if (block.currentWeek < block.totalWeeks) {
    block.currentWeek += 1;
    return state;
  }
  block.completed = true;
  block.completedAt = session.completedAt || new Date().toISOString();
  if (!(state.completedTrainingBlocks || []).some((item) => item.id === block.id))
    (state.completedTrainingBlocks ||= []).push({ ...clone(block), program: clone(state.program) });
  state.completedTrainingBlocks = state.completedTrainingBlocks.slice(-24);
  return state;
}

export function reconfigureTrainingBlock(program, options = {}) {
  const current = normalizeTrainingBlock(program);
  return createTrainingBlock(program, {
    id: current.id,
    name: options.name ?? current.name,
    startDate: options.startDate ?? current.startDate,
    totalWeeks: options.totalWeeks ?? current.totalWeeks,
    includeDeload:
      options.includeDeload ?? current.plannedDeloadWeek != null,
    plannedDeloadWeek: options.includeDeload === false
      ? null
      : options.plannedDeloadWeek ?? options.totalWeeks ?? current.plannedDeloadWeek,
    currentWeek: Math.min(current.currentWeek, options.totalWeeks || current.totalWeeks),
    completed: false,
    completedAt: null,
    weeks: [],
  });
}

// An explicit skip resolves a logical obligation, never a completed workout.
// Call only with records checked against the current permanent-plan fingerprint.
export function resolveTrainingBlockSkips(state, records, timestamp = new Date().toISOString()) {
  const block = currentTrainingBlock(state);
  if (!block || block.completed) return state;
  block.resolvedSkips ||= [];
  const priorIds = new Set(block.resolvedSkips.map(item => item.blockWorkoutId));
  for (const record of records) {
    if (!record.skipped || record.blockId && record.blockId !== block.id) continue;
    const week = block.weeks.find(item => item.weekNumber === record.blockWeekNumber);
    const ref = week?.workouts.find(item => item.programDayId === record.workoutId);
    if (!ref || block.resolvedSkips.some(item => item.blockWorkoutId === ref.id)) continue;
    block.resolvedSkips.push({ blockWorkoutId: ref.id, blockWeekId: week.id, blockWeekNumber: week.weekNumber, logicalSessionId: record.id, date: record.originalDate, skippedAt: record.updatedAt || timestamp });
  }
  // All required work in a week must be resolved before the sequence advances.
  // A resolution trigger carries identity only; it is never inserted in History.
  for (let i = 0; i < block.totalWeeks && !block.completed; i++) {
    const before = block.currentWeek;
    advanceTrainingBlockAfterWorkout(state, { trainingBlock: { blockId: block.id, blockWeekNumber: before }, completedAt: timestamp });
    if (block.currentWeek === before) break;
  }
  // Until the week resolves, skips remain reversible date-only state in
  // Flexible Week. Archive only skips that actually advanced the sequence.
  block.resolvedSkips = block.resolvedSkips.filter(item => block.completed || item.blockWeekNumber < block.currentWeek || priorIds.has(item.blockWorkoutId));
  return state;
}

export function createFollowUpTrainingBlock(program, { repeat = false, startDate = Date.now() } = {}) {
  const current = normalizeTrainingBlock(program);
  return createTrainingBlock(program, {
    name: repeat ? current.name : `${current.name.replace(/\s+\d+$/u, "")} · Next`,
    startDate,
    totalWeeks: current.totalWeeks,
    includeDeload: current.plannedDeloadWeek != null,
    plannedDeloadWeek: current.plannedDeloadWeek,
  });
}

export function trainingBlockDefinition(block) {
  if (!block) return null;
  return {
    schemaVersion: block.schemaVersion,
    id: block.id,
    name: block.name,
    startDate: block.startDate,
    totalWeeks: block.totalWeeks,
    plannedDeloadWeek: block.plannedDeloadWeek,
    weeks: (block.weeks || []).map((week) => ({
      id: week.id,
      weekNumber: week.weekNumber,
      phase: week.phase,
      repOffset: week.repOffset,
      rirDelta: week.rirDelta,
      mainSetDelta: week.mainSetDelta,
      setMultiplier: week.setMultiplier,
      changes: clone(week.changes || []),
      workouts: clone(week.workouts || []),
    })),
  };
}
