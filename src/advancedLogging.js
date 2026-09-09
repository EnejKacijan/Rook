export const SET_TYPES = Object.freeze({
  standard: { label: "Standard", shortLabel: null },
  amrap: { label: "AMRAP", shortLabel: "AMRAP" },
  drop: { label: "Drop set", shortLabel: "DROP" },
  rest_pause: { label: "Rest-pause", shortLabel: "REST-PAUSE" },
});

export const LOGGING_MODES = Object.freeze({
  normal: "Normal",
  per_side: "Per side",
});

// Open targets are prescriptions; achieved reps belong to completed set results.
export function hasOpenRepTarget(exercise) {
  return Boolean(exercise?.failureTarget && exercise.repMin == null && exercise.repMax == null);
}

export function openRepTargetLabel(exercise) {
  return exercise?.sets?.some(set => setTypeOf(set) === 'amrap') ? 'AMRAP' : 'failure';
}

export function setTypeOf(set) {
  return Object.hasOwn(SET_TYPES, set?.setType) ? set.setType : "standard";
}

export function loggingModeOf(exercise) {
  return exercise?.loggingMode === "per_side" ||
    exercise?.importedExercise?.loggingMode === "per_side"
    ? "per_side"
    : "normal";
}

export function setTypeLabel(set) {
  return SET_TYPES[setTypeOf(set)].shortLabel;
}

function finitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export function unilateralSetReps(set) {
  const left = Number(set?.sides?.left?.reps);
  const right = Number(set?.sides?.right?.reps);
  if (!finitePositive(left) || !finitePositive(right)) return null;
  return Math.min(left, right);
}

export function effectiveSetReps(exercise, set) {
  return loggingModeOf(exercise) === "per_side"
    ? unilateralSetReps(set)
    : finitePositive(set?.reps)
      ? Number(set.reps)
      : null;
}

export function sideAsymmetry(set) {
  const left = Number(set?.sides?.left?.reps);
  const right = Number(set?.sides?.right?.reps);
  if (!finitePositive(left) || !finitePositive(right)) return null;
  return { left, right, difference: Math.abs(left - right) };
}

export function progressionComparableSet(set) {
  return setTypeOf(set) === "standard";
}

export function prComparableSet(exercise, set) {
  if (!progressionComparableSet(set)) return false;
  if (loggingModeOf(exercise) === "per_side")
    return unilateralSetReps(set) !== null;
  return finitePositive(set?.reps);
}

export function segmentKindForSet(set) {
  const type = setTypeOf(set);
  return type === "drop" || type === "rest_pause" ? type : null;
}

export function normalizeSetLogging(set, exercise = {}) {
  if (!set || typeof set !== "object") return set;
  const type = setTypeOf(set);
  if (type === "standard") delete set.setType;
  else set.setType = type;
  const segmentKind = segmentKindForSet(set);
  if (segmentKind) {
    set.segments = (Array.isArray(set.segments) ? set.segments : [])
      .filter((segment) => segment && typeof segment === "object")
      .map((segment, index) => ({
        id: String(segment.id || `${set.id || "set"}-${segmentKind}-${index + 1}`),
        kind: segmentKind,
        order: index + 1,
        weight: segment.weight ?? null,
        reps: segment.reps ?? null,
        rir: segment.rir ?? null,
        completed: Boolean(segment.completed),
      }));
  } else delete set.segments;
  if (loggingModeOf(exercise) === "per_side") {
    set.sides = {
      left: { reps: set.sides?.left?.reps ?? null },
      right: { reps: set.sides?.right?.reps ?? null },
    };
    // Legacy representative reps stay available as a fallback until both
    // sides have been logged, then the weaker side becomes canonical.
    const effective = unilateralSetReps(set);
    if (effective !== null) set.reps = effective;
  } else delete set.sides;
  return set;
}

export function normalizeAdvancedLoggingState(state) {
  if (!state || typeof state !== "object") return state;
  const normalizeExercise = (exercise) => {
    if (!exercise || typeof exercise !== "object") return;
    exercise.loggingMode = loggingModeOf(exercise);
    for (const set of exercise.sets || []) normalizeSetLogging(set, exercise);
  };
  for (const day of state.program?.days || [])
    for (const exercise of day.exercises || []) normalizeExercise(exercise);
  for (const exercise of state.activeWorkout?.exercises || []) normalizeExercise(exercise);
  for (const workout of state.workouts || [])
    for (const exercise of workout.exercises || []) normalizeExercise(exercise);
  return state;
}

export function advancedSetCanComplete(exercise, set, loadRequirement = "required") {
  const reps = effectiveSetReps(exercise, set);
  const anySideLogged =
    loggingModeOf(exercise) === "per_side" &&
    (finitePositive(set?.sides?.left?.reps) || finitePositive(set?.sides?.right?.reps));
  if (!finitePositive(reps) && !anySideLogged) return false;
  if (loadRequirement === "required" && !finitePositive(set?.weight)) return false;
  if (
    loadRequirement === "optional" &&
    set?.weight !== null &&
    set?.weight !== undefined &&
    set?.weight !== "" &&
    (!Number.isFinite(Number(set.weight)) || Number(set.weight) < 0)
  ) return false;
  const segments = segmentKindForSet(set) ? set.segments || [] : [];
  return segments.every((segment) => {
    if (!finitePositive(segment.reps)) return false;
    return loadRequirement !== "required" || finitePositive(segment.weight);
  });
}

export function setEffortCount(set) {
  if (!set?.completed) return 0;
  return 1 + (segmentKindForSet(set)
    ? (set.segments || []).filter((segment) => segment.completed).length
    : 0);
}

export function historySetDescriptor(exercise, set) {
  const type = setTypeLabel(set);
  const asymmetry = sideAsymmetry(set);
  const perSide = loggingModeOf(exercise) === "per_side";
  const reps = perSide
    ? `L ${finitePositive(set?.sides?.left?.reps) ? Number(set.sides.left.reps) : "—"} · R ${finitePositive(set?.sides?.right?.reps) ? Number(set.sides.right.reps) : "—"}`
    : asymmetry
      ? `L ${asymmetry.left} · R ${asymmetry.right}`
    : `${Number(set?.reps) || 0} reps`;
  const segments = segmentKindForSet(set)
    ? ` · ${(set.segments || []).filter((segment) => segment.completed).length} ${setTypeOf(set) === "drop" ? "drop" : "rest-pause"} segment${(set.segments || []).filter((segment) => segment.completed).length === 1 ? "" : "s"}`
    : "";
  return `${type ? `${type} · ` : ""}${reps}${segments}`;
}
