import { trainingBlockDefinition } from "./trainingBlocks.js";

export const PLAN_HISTORY_SCHEMA_VERSION = 1;
export const PLAN_HISTORY_RECENT_LIMIT = 40;

const clone = (value) => structuredClone(value);
const iso = (value, fallback = Date.now()) => {
  const date = new Date(value ?? fallback);
  return Number.isNaN(date.getTime()) ? new Date(fallback).toISOString() : date.toISOString();
};
const versionId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `plan-version-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function planStructure(program) {
  if (!program?.days?.length) return null;
  return {
    id: program.id || null,
    name: program.name || null,
    goal: program.goal || null,
    goalAtCreation: program.goalAtCreation ?? null,
    templateId: program.templateId || null,
    splitPreference: program.splitPreference || null,
    trainingStyle: program.trainingStyle || null,
    trainingStructure: program.trainingStructure || null,
    conditioning: program.conditioning || null,
    priorities: program.profileSnapshot?.priorities || [],
    trainingBlock: trainingBlockDefinition(program.trainingBlock),
    days: program.days.map((day) => ({
      id: day.id,
      weekday: day.weekday,
      name: day.name || null,
      workoutName: day.workoutName || null,
      workoutDescriptor: day.workoutDescriptor || null,
      location: day.location || null,
      type: day.type || null,
      exercises: (day.exercises || []).map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        supersetId: exercise.supersetId || null,
        sets: (exercise.sets || []).map((set) => ({
          weight: set.weight ?? null,
          reps: set.reps ?? null,
        })),
        repMin: exercise.repMin ?? null,
        repMax: exercise.repMax ?? null,
        targetRir: exercise.targetRir ?? null,
        restSeconds: exercise.restSeconds ?? null,
      })),
    })),
  };
}

export const planFingerprint = (program) => JSON.stringify(planStructure(program));
export const programMeaningfullyChanged = (before, after) =>
  planFingerprint(before) !== planFingerprint(after);

const repLabel = (exercise) => {
  if (exercise?.repMin != null || exercise?.repMax != null)
    return exercise.repMin === exercise.repMax
      ? String(exercise.repMin)
      : `${exercise.repMin ?? "?"}–${exercise.repMax ?? "?"}`;
  const values = [...new Set((exercise?.sets || []).map((set) => set.reps).filter((value) => value != null))];
  return values.join("/") || "—";
};

export function diffPlanPrograms(fromProgram, toProgram) {
  if (!toProgram?.days?.length) return [];
  if (!fromProgram?.days?.length)
    return [{ kind: "initial", title: "Starting plan", detail: `${toProgram.days.length} workout days` }];
  const changes = [];
  const beforeBlock = trainingBlockDefinition(fromProgram.trainingBlock);
  const afterBlock = trainingBlockDefinition(toProgram.trainingBlock);
  if (!beforeBlock && afterBlock)
    changes.push({ kind: "training-block", title: "Training block added", detail: `${afterBlock.totalWeeks} weeks${afterBlock.plannedDeloadWeek ? ` · deload Week ${afterBlock.plannedDeloadWeek}` : ""}` });
  else if (beforeBlock && afterBlock) {
    if (beforeBlock.id !== afterBlock.id)
      changes.push({ kind: "training-block", title: "New training block", detail: `${afterBlock.name} · ${afterBlock.totalWeeks} weeks` });
    else {
      if (beforeBlock.name !== afterBlock.name)
        changes.push({ kind: "training-block", title: "Block renamed", detail: `${beforeBlock.name} → ${afterBlock.name}` });
      if (beforeBlock.totalWeeks !== afterBlock.totalWeeks)
        changes.push({ kind: "training-block", title: "Block length changed", detail: `${beforeBlock.totalWeeks} → ${afterBlock.totalWeeks} weeks` });
      if (beforeBlock.plannedDeloadWeek !== afterBlock.plannedDeloadWeek)
        changes.push({ kind: "training-block", title: "Deload changed", detail: afterBlock.plannedDeloadWeek ? `Planned for Week ${afterBlock.plannedDeloadWeek}` : "No planned deload" });
    }
  }
  const beforeDays = new Map(fromProgram.days.map((day) => [day.id, day]));
  const afterDays = new Map(toProgram.days.map((day) => [day.id, day]));
  for (const day of fromProgram.days)
    if (!afterDays.has(day.id))
      changes.push({ kind: "workout-removed", workoutId: day.id, title: `Removed ${day.name || day.weekday}`, detail: day.weekday });
  for (const day of toProgram.days) {
    const before = beforeDays.get(day.id);
    if (!before) {
      changes.push({ kind: "workout-added", workoutId: day.id, title: `Added ${day.name || day.weekday}`, detail: `${day.weekday} · ${(day.exercises || []).length} exercises` });
      continue;
    }
    if (before.weekday !== day.weekday)
      changes.push({ kind: "schedule", workoutId: day.id, title: `${day.name || before.name || "Workout"} moved`, detail: `${before.weekday} → ${day.weekday}` });
    if ((before.name || "") !== (day.name || ""))
      changes.push({ kind: "workout-name", workoutId: day.id, title: "Workout renamed", detail: `${before.name || before.weekday} → ${day.name || day.weekday}` });
    const beforeExercises = new Map((before.exercises || []).map((item) => [item.id, item]));
    const afterExercises = new Map((day.exercises || []).map((item) => [item.id, item]));
    for (const exercise of before.exercises || [])
      if (!afterExercises.has(exercise.id))
        changes.push({ kind: "exercise-removed", workoutId: day.id, exerciseId: exercise.exerciseId, title: "Exercise removed", detail: day.name || day.weekday });
    for (const exercise of day.exercises || []) {
      const old = beforeExercises.get(exercise.id);
      if (!old) {
        changes.push({ kind: "exercise-added", workoutId: day.id, exerciseId: exercise.exerciseId, title: "Exercise added", detail: day.name || day.weekday });
        continue;
      }
      if (old.exerciseId !== exercise.exerciseId)
        changes.push({ kind: "exercise-replaced", workoutId: day.id, fromExerciseId: old.exerciseId, exerciseId: exercise.exerciseId, title: "Exercise replaced", detail: day.name || day.weekday });
      if ((old.sets || []).length !== (exercise.sets || []).length)
        changes.push({ kind: "sets", workoutId: day.id, exerciseId: exercise.exerciseId, title: "Sets changed", detail: `${(old.sets || []).length} → ${(exercise.sets || []).length}` });
      const oldReps = repLabel(old);
      const newReps = repLabel(exercise);
      if (oldReps !== newReps)
        changes.push({ kind: "reps", workoutId: day.id, exerciseId: exercise.exerciseId, title: "Reps changed", detail: `${oldReps} → ${newReps}` });
      if ((old.targetRir ?? null) !== (exercise.targetRir ?? null))
        changes.push({ kind: "rir", workoutId: day.id, exerciseId: exercise.exerciseId, title: "RIR changed", detail: `${old.targetRir ?? "—"} → ${exercise.targetRir ?? "—"}` });
    }
  }
  const beforePriorities = fromProgram.profileSnapshot?.priorities || [];
  const afterPriorities = toProgram.profileSnapshot?.priorities || [];
  if (JSON.stringify(beforePriorities) !== JSON.stringify(afterPriorities))
    changes.push({ kind: "priority", title: "Training priority changed", detail: afterPriorities.join(", ") || "Balanced" });
  return changes;
}

export function summarizePlanChange(before, after, changes = diffPlanPrograms(before, after)) {
  if (!before) return "Initial training plan";
  if (before.id !== after?.id)
    return `${after?.days?.length || 0}-day plan replaced`;
  if (!changes.length) return "Plan details updated";
  if (changes.length === 1) return changes[0].title;
  const workouts = new Set(changes.map((item) => item.workoutId).filter(Boolean));
  if (workouts.size === 1) {
    const day = after.days.find((item) => item.id === [...workouts][0]);
    if (day) return `Changed ${day.name || day.weekday}`;
  }
  return `${changes.length} plan changes`;
}

function retainVersions(versions) {
  if (versions.length <= PLAN_HISTORY_RECENT_LIMIT + 1) return versions;
  const initial = versions.find((item) => item.source === "Initial plan") || versions[0];
  const recent = versions.slice(-PLAN_HISTORY_RECENT_LIMIT);
  const retained = recent.some((item) => item.id === initial.id) ? recent : [initial, ...recent];
  const retainedIds = new Set(retained.map((item) => item.id));
  return retained.map((item, index) =>
    index > 0 && item.parentVersionId && !retainedIds.has(item.parentVersionId)
      ? { ...item, parentVersionId: retained[index - 1].id }
      : item,
  );
}

export function addPlanVersion(state, {
  source = "Manual edit",
  reason = null,
  summary = null,
  previousProgram = null,
  timestamp = Date.now(),
  id = versionId(),
} = {}) {
  if (!state?.program?.days?.length) return state;
  const versions = Array.isArray(state.planVersions) ? state.planVersions : [];
  const parent = versions.at(-1) || null;
  const changes = diffPlanPrograms(previousProgram || parent?.program || null, state.program);
  versions.push({
    schemaVersion: PLAN_HISTORY_SCHEMA_VERSION,
    id,
    timestamp: iso(timestamp),
    source,
    reason: reason ? String(reason).slice(0, 160) : null,
    summary: String(summary || summarizePlanChange(previousProgram || parent?.program || null, state.program, changes)).slice(0, 120),
    parentVersionId: parent?.id || null,
    program: clone(state.program),
  });
  state.planVersions = retainVersions(versions);
  return state;
}

export function normalizePlanHistoryState(state, timestamp = Date.now()) {
  if (!state || typeof state !== "object") return state;
  const seen = new Set();
  state.planVersions = (Array.isArray(state.planVersions) ? state.planVersions : [])
    .filter((item) => item?.id && item?.program?.days?.length && !seen.has(item.id) && seen.add(item.id))
    .map((item) => ({
      schemaVersion: PLAN_HISTORY_SCHEMA_VERSION,
      id: String(item.id),
      timestamp: iso(item.timestamp, timestamp),
      source: String(item.source || "Plan change").slice(0, 60),
      reason: item.reason ? String(item.reason).slice(0, 160) : null,
      summary: String(item.summary || "Plan updated").slice(0, 120),
      parentVersionId: item.parentVersionId ? String(item.parentVersionId) : null,
      program: clone(item.program),
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  state.planVersions = retainVersions(state.planVersions);
  if (state.program?.days?.length && !state.planVersions.length)
    addPlanVersion(state, {
      source: "Initial plan",
      summary: "Initial training plan",
      timestamp: state.program.createdAt || state.program.updatedAt || timestamp,
    });
  return state;
}

export function restorePlanVersion(state, targetVersionId, timestamp = Date.now()) {
  const target = (state.planVersions || []).find((item) => item.id === targetVersionId);
  if (!target?.program?.days?.length)
    return { status: "missing", state, reconciliation: null };
  const restored = clone(target.program);
  restored.version = Number(state.program?.version || restored.version || 1) + 1;
  restored.updatedAt = iso(timestamp);
  restored.restoredFromVersionId = target.id;
  const validDays = new Map(restored.days.map((day) => [day.id, new Set((day.exercises || []).map((item) => item.id))]));
  const reconciliation = {
    activeWorkoutPreserved: Boolean(state.activeWorkout),
    todayAdjustmentRemoved: Boolean(state.todayAdaptation),
    flexibleWeekReferencesRemoved: 0,
    flexibleWeekNeedsReview: Object.keys(state.flexibleWeek?.sessions || {}).length,
    occurrenceReferencesRemoved: 0,
  };
  const weekScheduleOverrides = {};
  for (const [week, overrides] of Object.entries(state.weekScheduleOverrides || {})) {
    const kept = Object.fromEntries(Object.entries(overrides || {}).filter(([workoutId]) => {
      const valid = validDays.has(workoutId);
      if (!valid) reconciliation.flexibleWeekReferencesRemoved += 1;
      return valid;
    }));
    if (Object.keys(kept).length) weekScheduleOverrides[week] = kept;
  }
  const workoutOccurrenceOverrides = {};
  for (const [date, overrides] of Object.entries(state.workoutOccurrenceOverrides || {})) {
    const kept = {};
    for (const [workoutId, override] of Object.entries(overrides || {})) {
      const validEntries = validDays.get(workoutId);
      if (!validEntries) {
        reconciliation.occurrenceReferencesRemoved += 1;
        continue;
      }
      kept[workoutId] = {
        ...clone(override),
        excludedEntryIds: (override.excludedEntryIds || []).filter((id) => validEntries.has(id)),
        orderedEntryIds: (override.orderedEntryIds || []).filter((id) => validEntries.has(id)),
      };
    }
    if (Object.keys(kept).length) workoutOccurrenceOverrides[date] = kept;
  }
  state.program = restored;
  state.profile.availableDays = restored.days.map((day) => day.weekday);
  state.profile.daysPerWeek = restored.days.length;
  state.todayAdaptation = null;
  state.weekScheduleOverrides = weekScheduleOverrides;
  state.workoutOccurrenceOverrides = workoutOccurrenceOverrides;
  return { status: "restored", state, target, reconciliation };
}

export function planRestoreImpact(state, targetVersionId) {
  const copy = clone(state);
  const result = restorePlanVersion(copy, targetVersionId, Date.now());
  return result.status === "restored" ? result.reconciliation : null;
}
