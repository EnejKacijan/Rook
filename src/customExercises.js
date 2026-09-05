export const CUSTOM_EXERCISE_SCHEMA_VERSION = 1;

export const CUSTOM_EXERCISE_EQUIPMENT = [
  ["machines", "Machine"],
  ["cables", "Cable"],
  ["barbell", "Barbell"],
  ["dumbbells", "Dumbbells"],
  ["bodyweight", "Bodyweight"],
  ["resistance bands", "Resistance bands"],
  ["kettlebells", "Kettlebell"],
  ["other", "Other"],
];

export const CUSTOM_EXERCISE_MUSCLES = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Quads",
  "Hamstrings / glutes",
  "Calves",
  "Core",
  "Adductors",
  "Full body",
];

export const CUSTOM_EXERCISE_PATTERNS = [
  ["", "Not specified"],
  ["horizontal-push", "Horizontal push"],
  ["vertical-push", "Vertical push"],
  ["horizontal-pull", "Horizontal pull"],
  ["vertical-pull", "Vertical pull"],
  ["squat", "Squat"],
  ["hinge", "Hinge"],
  ["lunge", "Lunge"],
  ["carry", "Carry"],
  ["isolation", "Isolation"],
  ["core", "Core"],
  ["conditioning", "Conditioning"],
];

export const CUSTOM_EXERCISE_LOGGING_TYPES = [
  ["weight_reps", "Weight & reps"],
  ["reps", "Reps only"],
  ["duration", "Duration"],
  ["distance_duration", "Distance & duration"],
];

export const CUSTOM_EXERCISE_LOGGING_MODES = [
  ["normal", "Normal"],
  ["per_side", "Per side"],
];

export function normalizeExerciseAlias(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stableId(prefix, now = Date.now()) {
  const random = globalThis.crypto?.randomUUID?.() ||
    `${now}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

function cleanArray(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

const MUSCLE_ALIASES = new Map([
  ["chest", "Chest"],
  ["back", "Back"],
  ["lats", "Back"],
  ["shoulders", "Shoulders"],
  ["biceps", "Arms"],
  ["triceps", "Arms"],
  ["arms", "Arms"],
  ["quadriceps", "Quads"],
  ["quads", "Quads"],
  ["hamstrings", "Hamstrings / glutes"],
  ["glutes", "Hamstrings / glutes"],
  ["hamstrings glutes", "Hamstrings / glutes"],
  ["calves", "Calves"],
  ["core", "Core"],
  ["adductors", "Adductors"],
  ["full body", "Full body"],
]);
const canonicalMuscle = (value) => MUSCLE_ALIASES.get(normalizeExerciseAlias(value)) || "Full body";

function normalizeRecord(value, now) {
  const id = String(value?.id || "").trim();
  const name = String(value?.name || "").trim().replace(/\s+/g, " ").slice(0, 100);
  const equipment = cleanArray(value?.equipment).slice(0, 4);
  const primaryMuscle = canonicalMuscle(value?.primaryMuscle || value?.muscles?.[0]);
  const secondaryMuscles = cleanArray(value?.secondaryMuscles || value?.muscles?.slice(1)).map(canonicalMuscle)
    .filter((muscle) => muscle !== primaryMuscle)
    .slice(0, 5);
  const loggingType = CUSTOM_EXERCISE_LOGGING_TYPES.some(([key]) => key === value?.loggingType)
    ? value.loggingType
    : "weight_reps";
  const loggingMode = value?.loggingMode === "per_side" ? "per_side" : "normal";
  return {
    schemaVersion: CUSTOM_EXERCISE_SCHEMA_VERSION,
    id,
    name,
    equipment: equipment.length ? equipment : ["machines"],
    primaryMuscle,
    secondaryMuscles,
    pattern: CUSTOM_EXERCISE_PATTERNS.some(([key]) => key && key === value?.pattern)
      ? value.pattern
      : null,
    loggingType,
    loggingMode,
    notes: String(value?.notes || "").trim().slice(0, 300) || null,
    createdAt: value?.createdAt || now,
    updatedAt: value?.updatedAt || value?.createdAt || now,
    deletedAt: value?.deletedAt || null,
  };
}

function normalizeAliasRecord(value, now) {
  const alias = String(value?.alias || "").trim().replace(/\s+/g, " ").slice(0, 100);
  return {
    schemaVersion: CUSTOM_EXERCISE_SCHEMA_VERSION,
    id: String(value?.id || "").trim(),
    alias,
    normalizedAlias: normalizeExerciseAlias(alias),
    exerciseId: String(value?.exerciseId || "").trim(),
    createdAt: value?.createdAt || now,
    updatedAt: value?.updatedAt || value?.createdAt || now,
    deletedAt: value?.deletedAt || null,
  };
}

export function normalizeCustomExercisesState(state, now = new Date().toISOString()) {
  if (!state) return state;
  const records = new Map();
  for (const value of Array.isArray(state.customExercises) ? state.customExercises : []) {
    const record = normalizeRecord(value, now);
    if (!record.id || !record.name) continue;
    const previous = records.get(record.id);
    if (!previous || String(record.updatedAt) >= String(previous.updatedAt)) records.set(record.id, record);
  }
  state.customExercises = [...records.values()];
  const aliases = new Map();
  for (const value of Array.isArray(state.exerciseAliases) ? state.exerciseAliases : []) {
    const record = normalizeAliasRecord(value, now);
    if (!record.id || !record.alias || !record.normalizedAlias || !record.exerciseId) continue;
    const previous = aliases.get(record.normalizedAlias);
    if (!previous || String(record.updatedAt) >= String(previous.updatedAt)) aliases.set(record.normalizedAlias, record);
  }
  state.exerciseAliases = [...aliases.values()];
  return state;
}

export function createCustomExerciseRecord(input = {}, now = new Date().toISOString()) {
  return normalizeRecord({
    ...input,
    id: input.id || stableId("custom-exercise"),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }, now);
}

export function createCustomExercise(state, input, now = new Date().toISOString()) {
  normalizeCustomExercisesState(state, now);
  const record = createCustomExerciseRecord(input, now);
  if (!record.name) return { status: "invalid", reason: "name" };
  if (state.customExercises.some((item) => !item.deletedAt && normalizeExerciseAlias(item.name) === normalizeExerciseAlias(record.name)))
    return { status: "duplicate", exercise: null };
  state.customExercises.push(record);
  return { status: "created", exercise: record };
}

export function registerCustomExerciseRecord(state, record, now = new Date().toISOString()) {
  normalizeCustomExercisesState(state, now);
  const normalized = normalizeRecord(record, now);
  if (!normalized.id || !normalized.name) return { status: "invalid" };
  const index = state.customExercises.findIndex((item) => item.id === normalized.id);
  if (index >= 0) state.customExercises[index] = normalized;
  else state.customExercises.push(normalized);
  return { status: index >= 0 ? "updated" : "created", exercise: normalized };
}

export function updateCustomExercise(state, exerciseId, changes, now = new Date().toISOString()) {
  normalizeCustomExercisesState(state, now);
  const index = state.customExercises.findIndex((item) => item.id === exerciseId && !item.deletedAt);
  if (index < 0) return { status: "missing" };
  const next = normalizeRecord({ ...state.customExercises[index], ...changes, id: exerciseId, updatedAt: now }, now);
  if (!next.name) return { status: "invalid", reason: "name" };
  if (state.customExercises.some((item, itemIndex) => itemIndex !== index && !item.deletedAt && normalizeExerciseAlias(item.name) === normalizeExerciseAlias(next.name)))
    return { status: "duplicate" };
  state.customExercises[index] = next;
  return { status: "updated", exercise: next };
}

export function deleteCustomExercise(state, exerciseId, now = new Date().toISOString()) {
  normalizeCustomExercisesState(state, now);
  const exercise = state.customExercises.find((item) => item.id === exerciseId && !item.deletedAt);
  if (!exercise) return { status: "missing" };
  exercise.deletedAt = now;
  exercise.updatedAt = now;
  for (const alias of state.exerciseAliases) {
    if (alias.exerciseId === exerciseId && !alias.deletedAt) {
      alias.deletedAt = now;
      alias.updatedAt = now;
    }
  }
  return { status: "deleted", exercise };
}

export function customExerciseCatalogItem(record) {
  if (!record) return null;
  const loggingType = record.loggingType || "weight_reps";
  const equipment = cleanArray(record.equipment);
  const repsOnly = loggingType === "reps";
  const duration = loggingType === "duration";
  return {
    id: record.id,
    name: record.name,
    aliases: [],
    custom: true,
    deleted: Boolean(record.deletedAt),
    equipment,
    pattern: record.pattern || null,
    muscles: [record.primaryMuscle, ...(record.secondaryMuscles || [])].filter(Boolean),
    kind: record.pattern === "conditioning" ? "conditioning" : "isolation",
    measure: duration ? "seconds" : "reps",
    exerciseType: loggingType,
    bodyweight: repsOnly && equipment.includes("bodyweight"),
    loadRequirement: loggingType === "weight_reps" ? "required" : "none",
    increment: 1,
    restSeconds: 90,
    trackingSupport: loggingType === "weight_reps" ? "reps-and-load" : duration ? "duration" : loggingType,
    loggingMode: record.loggingMode === "per_side" ? "per_side" : "normal",
    notes: record.notes || null,
  };
}

export function customExerciseSnapshot(record, source = "custom") {
  const item = customExerciseCatalogItem(record);
  return item ? { ...item, source, loggingType: record.loggingType, loggingMode: record.loggingMode === "per_side" ? "per_side" : "normal", deletedAt: record.deletedAt || null } : null;
}

export function availableCustomExerciseItems(state) {
  return (state?.customExercises || []).filter((item) => !item.deletedAt).map(customExerciseCatalogItem);
}

export function exerciseDefinition(state, exerciseId, builtInCatalog = {}) {
  return builtInCatalog[exerciseId] || customExerciseCatalogItem((state?.customExercises || []).find((item) => item.id === exerciseId)) || null;
}

export function rememberExerciseAlias(state, aliasValue, exerciseId, { builtInCatalog = {}, now = new Date().toISOString() } = {}) {
  normalizeCustomExercisesState(state, now);
  const alias = String(aliasValue || "").trim().replace(/\s+/g, " ").slice(0, 100);
  const normalizedAlias = normalizeExerciseAlias(alias);
  const target = exerciseDefinition(state, exerciseId, builtInCatalog);
  if (!normalizedAlias || !target || target.deleted) return { status: "invalid" };
  const canonicalNames = [
    ...Object.values(builtInCatalog).flatMap((item) => [item.name, ...(item.aliases || [])].map((name) => [normalizeExerciseAlias(name), item.id])),
    ...(state.customExercises || []).filter((item) => !item.deletedAt).map((item) => [normalizeExerciseAlias(item.name), item.id]),
  ];
  const canonical = canonicalNames.find(([name]) => name === normalizedAlias);
  if (canonical && canonical[1] !== exerciseId) return { status: "conflict", exerciseId: canonical[1] };
  const existing = state.exerciseAliases.find((item) => item.normalizedAlias === normalizedAlias && !item.deletedAt);
  if (existing?.exerciseId === exerciseId) return { status: "unchanged", alias: existing };
  if (existing) return { status: "conflict", exerciseId: existing.exerciseId };
  const record = normalizeAliasRecord({ id: stableId("exercise-alias"), alias, exerciseId, createdAt: now, updatedAt: now }, now);
  state.exerciseAliases.push(record);
  return { status: "created", alias: record };
}

export function removeExerciseAlias(state, aliasId, now = new Date().toISOString()) {
  normalizeCustomExercisesState(state, now);
  const alias = state.exerciseAliases.find((item) => item.id === aliasId && !item.deletedAt);
  if (!alias) return { status: "missing" };
  alias.deletedAt = now;
  alias.updatedAt = now;
  return { status: "deleted", alias };
}

export function resolveRememberedExercise(state, value, builtInCatalog = {}) {
  const normalized = normalizeExerciseAlias(value);
  if (!normalized) return null;
  const custom = (state?.customExercises || []).filter((item) => !item.deletedAt && normalizeExerciseAlias(item.name) === normalized);
  if (custom.length === 1) return { exerciseId: custom[0].id, status: "custom" };
  const alias = (state?.exerciseAliases || []).filter((item) => !item.deletedAt && item.normalizedAlias === normalized);
  if (alias.length !== 1) return null;
  const target = exerciseDefinition(state, alias[0].exerciseId, builtInCatalog);
  return target && !target.deleted ? { exerciseId: target.id, status: "remembered-alias", aliasId: alias[0].id } : null;
}

export function customExerciseUsage(state, exerciseId) {
  const collections = [
    ...(state?.program?.days || []),
    state?.activeWorkout,
    ...(state?.workouts || []),
  ].filter(Boolean);
  return collections.reduce((count, workout) => count + (workout.exercises || []).filter((item) => item.exerciseId === exerciseId).length, 0);
}
