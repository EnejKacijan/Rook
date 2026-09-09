import {
  adaptTodayProposal,
  compatibleReplacementCandidates,
  estimateSessionMinutes,
  exerciseCatalog,
  exerciseLoadRequirement,
  exerciseName,
  rankExerciseSearch,
  isExerciseAllowed,
  isoDay,
  plannedWorkoutForDate,
  userSelectableReplacementCandidates,
  uid,
} from "./domain.js";
import { validateSupersetExercises } from "./supersets.js";

export const TODAY_ADJUSTMENT_VERSION = 1;

export const ADJUST_TODAY_MODES = Object.freeze({
  lessTime: "less-time",
  equipment: "different-equipment",
  lowEnergy: "low-energy",
  unavailable: "unavailable",
});

const clone = (value) => structuredClone(value);

function stableExerciseShape(exercise) {
  return {
    id: exercise.id,
    exerciseId: exercise.exerciseId,
    sets: (exercise.sets || []).map((set) => ({
      id: set.id,
      reps: set.reps ?? null,
      weight: set.weight ?? null,
    })),
    repMin: exercise.repMin ?? null,
    repMax: exercise.repMax ?? null,
    targetRir: exercise.targetRir ?? null,
    restSeconds: exercise.restSeconds ?? null,
    programmingRole: exercise.programmingRole ?? null,
    requiredRole: exercise.requiredRole ?? null,
    protectedPrioritySets: exercise.protectedPrioritySets ?? null,
    supersetId: exercise.supersetId ?? null,
    importedName: exercise.importedName ?? null,
    originalImportedName: exercise.originalImportedName ?? null,
    importedExercise: exercise.importedExercise ?? null,
  };
}

export function todayWorkoutFingerprint(workout, programVersion = null) {
  if (!workout) return null;
  return JSON.stringify({
    programVersion: Number(programVersion || 1),
    id: workout.id,
    weekday: workout.weekday,
    warmupPlan: workout.warmupPlan || null,
    exercises: (workout.exercises || []).map(stableExerciseShape),
  });
}

function normalizeEquipmentProfile(profile, equipment) {
  const selected = [...new Set(equipment || [])];
  return {
    ...profile,
    environment: selected.includes("full gym") ? "Commercial gym" : "Home gym",
    equipment: selected.includes("full gym") ? ["full gym"] : selected,
  };
}

function replacementExercise(source, replacement) {
  const next = clone(source);
  next.exerciseId = replacement.id;
  next.exerciseSource = "catalog";
  next.loadRequirement = exerciseLoadRequirement(replacement);
  next.defaultIncrement = replacement.increment;
  next.restSeconds = replacement.restSeconds;
  next.sets = next.sets.map((set) => ({
    ...set,
    weight: null,
    completed: false,
    rir: null,
  }));
  delete next.importedName;
  delete next.originalImportedName;
  delete next.importedExercise;
  delete next.matchStatus;
  return next;
}

function sanitizeWarmups(workout, replacedEntryIds = new Set()) {
  if (!workout.warmupPlan || workout.warmupPlan.mode !== "custom") return;
  workout.warmupPlan = clone(workout.warmupPlan);
  workout.warmupPlan.rampUpSets = (workout.warmupPlan.rampUpSets || []).filter(
    (entry) => !replacedEntryIds.has(entry.targetExerciseEntryId),
  );
}

function sanitizeSupersets(exercises) {
  const groups = new Map();
  exercises.forEach((exercise, index) => {
    if (!exercise.supersetId) return;
    const group = groups.get(exercise.supersetId) || [];
    group.push({ exercise, index });
    groups.set(exercise.supersetId, group);
  });
  for (const group of groups.values()) {
    if (group.length !== 2 || group[1].index !== group[0].index + 1) {
      group.forEach(({ exercise }) => delete exercise.supersetId);
      continue;
    }
    const sets = Math.max(
      1,
      Math.min(group[0].exercise.sets.length, group[1].exercise.sets.length),
    );
    group.forEach(({ exercise }) => {
      exercise.sets = exercise.sets.slice(0, sets);
    });
  }
  return exercises;
}

function describeChanges(original, adjusted, mode) {
  const afterByEntry = new Map(adjusted.exercises.map((item) => [item.id, item]));
  const changes = [];
  for (const before of original.exercises) {
    const after = afterByEntry.get(before.id);
    if (!after) {
      changes.push({
        kind: "removed",
        entryId: before.id,
        fromExerciseId: before.exerciseId,
        label: exerciseName(before),
        reason:
          mode === ADJUST_TODAY_MODES.lessTime
            ? "Removed to protect the session’s main work within the available time."
            : "Removed to reduce fatigue while keeping the session’s main work.",
      });
      continue;
    }
    if (before.exerciseId !== after.exerciseId)
      changes.push({
        kind: "replaced",
        entryId: before.id,
        fromExerciseId: before.exerciseId,
        toExerciseId: after.exerciseId,
        label: exerciseName(before),
        nextLabel: exerciseName(after),
        reason:
          mode === ADJUST_TODAY_MODES.equipment
            ? "Replaced to match the equipment available today."
            : "Replaced because this exercise is unavailable today.",
      });
    if (before.sets.length !== after.sets.length)
      changes.push({
        kind: "sets",
        entryId: before.id,
        exerciseId: after.exerciseId,
        label: exerciseName(after),
        from: before.sets.length,
        to: after.sets.length,
        reason:
          mode === ADJUST_TODAY_MODES.lowEnergy
            ? "One set removed to reduce fatigue while keeping the movement."
            : "Volume reduced to prioritize the most important work.",
      });
    if (Number(after.targetRir) > Number(before.targetRir))
      changes.push({
        kind: "rir",
        entryId: before.id,
        exerciseId: after.exerciseId,
        label: exerciseName(after),
        from: before.targetRir,
        to: after.targetRir,
        reason: "More reps in reserve to keep today’s work conservative.",
      });
  }
  return changes;
}

function selectReplacement(
  source,
  profile,
  occupiedIds,
  preferredId = null,
  rankingContext = {},
) {
  const compatible = compatibleReplacementCandidates(
    source,
    profile,
    [...occupiedIds],
    rankingContext,
  ).filter((candidate) => !occupiedIds.has(candidate.id));
  if (preferredId)
    return compatible.find((candidate) => candidate.id === preferredId) || null;
  return compatible[0] || null;
}

function adaptForEquipment(
  workout,
  profile,
  affectedEntryIds,
  manual = {},
  rankingContext = {},
) {
  const adjusted = clone(workout);
  const unresolved = [];
  const replacedEntryIds = new Set();
  const occupiedIds = new Set(adjusted.exercises.map((item) => item.exerciseId));
  adjusted.exercises = adjusted.exercises.map((exercise) => {
    const catalog = exerciseCatalog[exercise.exerciseId];
    const affected = affectedEntryIds
      ? affectedEntryIds.has(exercise.id)
      : !catalog || !isExerciseAllowed(catalog, profile);
    if (!affected) return exercise;
    occupiedIds.delete(exercise.exerciseId);
    const replacement = selectReplacement(
      exercise,
      profile,
      occupiedIds,
      manual[exercise.id],
      rankingContext,
    );
    if (!replacement) {
      unresolved.push({
        entryId: exercise.id,
        exerciseId: exercise.exerciseId,
        label: exerciseName(exercise),
        reason: catalog
          ? "No trustworthy compatible replacement was found."
          : "This custom exercise does not have enough metadata for an automatic replacement.",
      });
      occupiedIds.add(exercise.exerciseId);
      return exercise;
    }
    occupiedIds.add(replacement.id);
    replacedEntryIds.add(exercise.id);
    return replacementExercise(exercise, replacement);
  });
  sanitizeWarmups(adjusted, replacedEntryIds);
  sanitizeSupersets(adjusted.exercises);
  return { adjusted, unresolved };
}

function adaptForLowEnergy(workout) {
  const adjusted = clone(workout);
  const removable = [...adjusted.exercises]
    .reverse()
    .find(
      (exercise) =>
        adjusted.exercises.length > 2 &&
        exercise.programmingRole !== "main" &&
        exercise.requiredRole === false &&
        !exercise.protectedPrioritySets,
    );
  if (removable)
    adjusted.exercises = adjusted.exercises.filter((item) => item.id !== removable.id);
  for (const exercise of [...adjusted.exercises].reverse()) {
    if (exercise.programmingRole === "main" || exercise.sets.length <= 1) continue;
    exercise.sets = exercise.sets.slice(0, exercise.sets.length - 1);
  }
  adjusted.exercises.forEach((exercise) => {
    if (Number.isFinite(Number(exercise.targetRir)))
      exercise.targetRir = Math.max(
        Number(exercise.targetRir),
        Math.min(4, Number(exercise.targetRir) + 1),
      );
  });
  sanitizeSupersets(adjusted.exercises);
  return adjusted;
}

function adaptForLessTime(state, workout, minutes, date) {
  const proposal = adaptTodayProposal(
    { ...state, todayAdaptation: null, activeWorkout: null },
    minutes,
    date,
  );
  if (!proposal) return clone(workout);
  const targets = new Map(
    proposal.setTargets.map((item) => [item.exerciseId, item.sets]),
  );
  const keep = new Set(proposal.exerciseIds);
  const adjusted = clone(workout);
  adjusted.exercises = adjusted.exercises
    .filter((exercise) => keep.has(exercise.exerciseId))
    .map((exercise) => ({
      ...exercise,
      sets: exercise.sets.slice(
        0,
        Math.max(1, Math.min(exercise.sets.length, targets.get(exercise.exerciseId) || exercise.sets.length)),
      ),
    }));
  sanitizeSupersets(adjusted.exercises);
  return adjusted;
}

export function buildTodayAdjustment(
  state,
  {
    mode,
    date = new Date(),
    minutes = null,
    equipment = null,
    gymProfileId = null,
    gymProfileName = null,
    unavailableEntryIds = [],
    manualReplacements = {},
  },
) {
  const targetDate = isoDay(date);
  if (targetDate !== isoDay())
    return { status: "unavailable", reason: "Adjust Today is available for the current day only." };
  if (state.activeWorkout || state.activeOptionalSession)
    return { status: "unavailable", reason: "Finish the active session before adjusting today’s workout." };
  const original = plannedWorkoutForDate(state, date);
  if (!original)
    return { status: "unavailable", reason: "Today does not have a planned workout to adjust." };

  let adjusted = clone(original);
  let unresolved = [];
  let temporaryEquipment = null;
  if (mode === ADJUST_TODAY_MODES.lessTime) {
    const target = Math.max(15, Math.min(180, Math.round(Number(minutes) || 0)));
    if (!target || target >= estimateSessionMinutes(original.exercises))
      return { status: "unchanged", reason: "This workout already fits within that time." };
    adjusted = adaptForLessTime(state, original, target, date);
  } else if (mode === ADJUST_TODAY_MODES.lowEnergy) {
    adjusted = adaptForLowEnergy(original);
  } else if (mode === ADJUST_TODAY_MODES.equipment) {
    temporaryEquipment = [...new Set(equipment || [])];
    if (!temporaryEquipment.length)
      return { status: "invalid", reason: "Choose the equipment available today." };
    const temporaryProfile = normalizeEquipmentProfile(state.profile, temporaryEquipment);
    ({ adjusted, unresolved } = adaptForEquipment(
      original,
      temporaryProfile,
      null,
      manualReplacements,
      {
        preferences: state.substitutionPreferences,
        gymProfileId,
      },
    ));
  } else if (mode === ADJUST_TODAY_MODES.unavailable) {
    const affected = new Set(unavailableEntryIds);
    if (!affected.size)
      return { status: "invalid", reason: "Choose at least one unavailable exercise." };
    ({ adjusted, unresolved } = adaptForEquipment(
      original,
      state.profile,
      affected,
      manualReplacements,
      {
        preferences: state.substitutionPreferences,
        gymProfileId: state.defaultGymProfileId,
      },
    ));
  } else {
    return { status: "invalid", reason: "Choose what changed today." };
  }

  adjusted.estimatedMinutes = estimateSessionMinutes(adjusted.exercises);
  const changes = describeChanges(original, adjusted, mode);
  return {
    status: "ready",
    proposal: {
      schemaVersion: TODAY_ADJUSTMENT_VERSION,
      id: uid("today-adjustment-proposal"),
      date: targetDate,
      programDayId: original.id,
      mode,
      requestedMinutes:
        mode === ADJUST_TODAY_MODES.lessTime ? Math.round(Number(minutes)) : null,
      temporaryEquipment,
      gymProfileId:
        mode === ADJUST_TODAY_MODES.equipment && gymProfileId
          ? String(gymProfileId)
          : null,
      gymProfileName:
        mode === ADJUST_TODAY_MODES.equipment && gymProfileName
          ? String(gymProfileName).trim().slice(0, 50)
          : null,
      baseProgramVersion: Number(state.program?.version || 1),
      baseWorkoutFingerprint: todayWorkoutFingerprint(
        original,
        state.program?.version,
      ),
      replacesAdaptationId: state.todayAdaptation?.id || null,
      originalWorkout: clone(original),
      workout: adjusted,
      changes,
      unresolved,
      meaningful: changes.length > 0,
    },
  };
}

export function manualReplacementChoices(
  proposal,
  entryId,
  profile,
  query = "",
  preferences = [],
) {
  const source = proposal.originalWorkout.exercises.find((item) => item.id === entryId);
  if (!source) return [];
  const temporaryProfile = proposal.temporaryEquipment
    ? normalizeEquipmentProfile(profile, proposal.temporaryEquipment)
    : profile;
  const occupied = proposal.workout.exercises
    .filter((item) => item.id !== entryId)
    .map((item) => item.exerciseId);
  const needle = String(query || "").trim().toLowerCase();
  return rankExerciseSearch(userSelectableReplacementCandidates(source, temporaryProfile, occupied, {
    preferences,
    gymProfileId: proposal.gymProfileId,
  })
    .filter((item) => !needle || item.name.toLowerCase().includes(needle))
    .slice(0, 80), query);
}

export function resolveTodayAdjustment(
  proposal,
  entryId,
  replacementId,
  profile,
  preferences = [],
) {
  const source = proposal.originalWorkout.exercises.find((item) => item.id === entryId);
  const temporaryProfile = proposal.temporaryEquipment
    ? normalizeEquipmentProfile(profile, proposal.temporaryEquipment)
    : profile;
  const occupied = proposal.workout.exercises
    .filter((item) => item.id !== entryId)
    .map((item) => item.exerciseId);
  const choices = source
    ? userSelectableReplacementCandidates(source, temporaryProfile, occupied, {
        preferences,
        gymProfileId: proposal.gymProfileId,
      })
    : [];
  const replacement = choices.find((item) => item.id === replacementId);
  const original = source;
  if (!replacement || !original) return proposal;
  const next = clone(proposal);
  const index = next.workout.exercises.findIndex((item) => item.id === entryId);
  if (index < 0) return proposal;
  next.workout.exercises[index] = replacementExercise(original, replacement);
  sanitizeWarmups(next.workout, new Set([entryId]));
  sanitizeSupersets(next.workout.exercises);
  next.workout.estimatedMinutes = estimateSessionMinutes(next.workout.exercises);
  next.unresolved = next.unresolved.filter((item) => item.entryId !== entryId);
  next.changes = describeChanges(next.originalWorkout, next.workout, next.mode);
  next.meaningful = next.changes.length > 0;
  return next;
}

export function todayAdjustmentConflict(state, proposal) {
  if (!proposal || proposal.date !== isoDay()) return "workout-changed";
  if (state.activeWorkout || state.activeOptionalSession) return "workout-started";
  const current = plannedWorkoutForDate(state, new Date(`${proposal.date}T12:00:00`));
  if (!current || current.id !== proposal.programDayId) return "workout-changed";
  if (
    todayWorkoutFingerprint(current, state.program?.version) !==
    proposal.baseWorkoutFingerprint
  )
    return "workout-changed";
  if ((state.todayAdaptation?.id || null) !== (proposal.replacesAdaptationId || null))
    return "workout-changed";
  return null;
}

function adjustedWorkoutIsValid(proposal) {
  const exercises = proposal?.workout?.exercises;
  if (!Array.isArray(exercises) || !exercises.length || proposal.unresolved?.length)
    return false;
  const originalByEntry = new Map(
    proposal.originalWorkout.exercises.map((item) => [item.id, item]),
  );
  const seenEntries = new Set();
  const seenExercises = new Set();
  for (const exercise of exercises) {
    if (
      !exercise?.id ||
      seenEntries.has(exercise.id) ||
      seenExercises.has(exercise.exerciseId) ||
      !Array.isArray(exercise.sets) ||
      !exercise.sets.length ||
      exercise.sets.length > 20 ||
      (exercise.targetRir != null &&
        (!Number.isFinite(Number(exercise.targetRir)) ||
          Number(exercise.targetRir) < 0 ||
          Number(exercise.targetRir) > 10))
    )
      return false;
    const original = originalByEntry.get(exercise.id);
    if (!exerciseCatalog[exercise.exerciseId] && original?.exerciseId !== exercise.exerciseId)
      return false;
    seenEntries.add(exercise.id);
    seenExercises.add(exercise.exerciseId);
  }
  return validateSupersetExercises(exercises).length === 0;
}

export function applyTodayAdjustment(state, proposal, appliedAt = Date.now()) {
  const conflict = todayAdjustmentConflict(state, proposal);
  if (conflict) return { status: "conflict", reason: conflict, state };
  if (!proposal.meaningful || !adjustedWorkoutIsValid(proposal))
    return { status: "invalid", reason: "invalid-adjustment", state };
  const next = clone(state);
  next.todayAdaptation = {
    ...clone(proposal),
    id: uid("today-adjustment"),
    proposalId: proposal.id,
    appliedAt,
    originalSessionIdentity: `${proposal.programDayId}:${proposal.date}`,
  };
  return { status: "applied", state: next };
}

export function restoreOriginalTodayWorkout(state, date = new Date()) {
  if (
    state.activeWorkout ||
    !state.todayAdaptation ||
    state.todayAdaptation.date !== isoDay(date)
  )
    return { status: "unavailable", state };
  const next = clone(state);
  next.todayAdaptation = null;
  return { status: "restored", state: next };
}
