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

export const historicalSourceKey = (source, name) => JSON.stringify([source || 'generic', normalizeExerciseAlias(name)]);
// Reversible identity, not a short collision-prone name hash. Equipment and
// muscle metadata are deliberately absent for unmapped historical exercises.
export function importedHistoricalExercise(source, name, state = {}) {
  const key=historicalSourceKey(source,name);
  const existing=(state.customExercises||[]).find(e=>!e.deletedAt&&e.historicalIdentity?.key===key);
  return existing || createCustomExerciseRecord({id:`custom-import-${encodeURIComponent(key)}`,name,
    historicalIdentity:{key,source:source||'generic',sourceName:name},equipment:[],primaryMuscle:null});
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
  const historical=value?.historicalIdentity;
  const id = String(value?.id || "").trim();
  const name = String(value?.name || "").trim().replace(/\s+/g, " ").slice(0, 100);
  const equipment = cleanArray(value?.equipment).slice(0, 4);
  const primaryMuscle = canonicalMuscle(value?.primaryMuscle || value?.muscles?.[0]);
  const secondaryMuscles = cleanArray(value?.secondaryMuscles || value?.muscles?.slice(1)).map(canonicalMuscle)
    .filter((muscle) => muscle !== primaryMuscle)
    .slice(0, 5);
  const loggingType = CUSTOM_EXERCISE_LOGGING_TYPES.some(([key]) => key === value?.loggingType)
    ? value.loggingType
    : historical ? null : "weight_reps";
  const loggingMode = value?.loggingMode === "per_side" ? "per_side" : "normal";
  return {
    schemaVersion: CUSTOM_EXERCISE_SCHEMA_VERSION,
    id,
    name:historical?String(value.name||historical.sourceName):name,
    ...(historical?{historicalIdentity:{...historical,key:historicalSourceKey(historical.source,historical.sourceName)}}:{}),
    equipment: historical?equipment:equipment.length ? equipment : ["machines"],
    primaryMuscle:historical&&!value.primaryMuscle?null:primaryMuscle,
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
  const alias = String(value?.alias || "").trim().replace(/\s+/g, " ").slice(0,value?.scope==='historical-import'?Infinity:100);
  return {
    schemaVersion: CUSTOM_EXERCISE_SCHEMA_VERSION,
    id: String(value?.id || "").trim(),
    alias,
    normalizedAlias: normalizeExerciseAlias(alias),
    ...(['historical-import','plan-import'].includes(value?.scope) ? { scope: value.scope } : {}),
    ...(value?.scope==='plan-import'?{keepOriginal:Boolean(value.keepOriginal)}:{}),
    ...(value?.scope === 'historical-import'&&value.source?{source:value.source}:{}),
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
    const key = `${record.scope || 'global'}:${record.source||''}:${record.normalizedAlias}`;
    const previous = aliases.get(key);
    if (!previous || String(record.updatedAt) >= String(previous.updatedAt)) aliases.set(key, record);
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
    if (alias.exerciseId === exerciseId && !alias.deletedAt && alias.scope !== 'historical-import') {
      alias.deletedAt = now;
      alias.updatedAt = now;
    }
  }
  return { status: "deleted", exercise };
}

export function customExerciseCatalogItem(record) {
  if (!record) return null;
  const loggingType = record.loggingType || (record.historicalIdentity ? null : "weight_reps");
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
    kind: record.historicalIdentity&&!record.pattern?null:record.pattern === "conditioning" ? "conditioning" : "isolation",
    measure: loggingType == null ? null : duration ? "seconds" : "reps",
    exerciseType: loggingType,
    bodyweight: repsOnly && equipment.includes("bodyweight"),
    loadRequirement: record.historicalIdentity?'unknown':loggingType === "weight_reps" ? "required" : "none",
    increment: record.historicalIdentity?null:1,
    restSeconds: record.historicalIdentity?null:90,
    trackingSupport: record.historicalIdentity?'history-only':loggingType === "weight_reps" ? "reps-and-load" : duration ? "duration" : loggingType,
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
  const existing = state.exerciseAliases.find((item) => !item.scope && item.normalizedAlias === normalizedAlias && !item.deletedAt);
  if (existing?.exerciseId === exerciseId) return { status: "unchanged", alias: existing };
  if (existing) return { status: "conflict", exerciseId: existing.exerciseId };
  const record = normalizeAliasRecord({ id: stableId("exercise-alias"), alias, exerciseId, createdAt: now, updatedAt: now }, now);
  state.exerciseAliases.push(record);
  return { status: "created", alias: record };
}

export function saveCustomExerciseDetails(state, exerciseId, details, { added = [], removed = [], builtInCatalog = {}, persist } = {}) {
  const next = structuredClone(state);
  const result = updateCustomExercise(next, exerciseId, details);
  if (result.status !== 'updated') return { ...result, state };
  for (const id of removed) {
    if (next.exerciseAliases.some(alias => alias.id === id && alias.exerciseId === exerciseId)) removeExerciseAlias(next, id);
  }
  for (const alias of added) {
    const outcome = rememberExerciseAlias(next, alias, exerciseId, { builtInCatalog });
    if (!['created', 'unchanged'].includes(outcome.status)) return { ...outcome, state };
  }
  const snapshot = customExerciseSnapshot(result.exercise);
  for (const day of next.program?.days || []) for (const exercise of day.exercises || []) {
    if (exercise.exerciseId !== exerciseId) continue;
    Object.assign(exercise, { importedName: result.exercise.name, originalImportedName: result.exercise.name,
      importedExercise: snapshot, measure: snapshot.measure, loadRequirement: snapshot.loadRequirement });
  }
  if (persist) {
    try { if (!persist(next)) return { status: 'persistence-failed', state }; }
    catch { return { status: 'persistence-failed', state }; }
  }
  return { status: 'saved', state: next, exercise: result.exercise };
}

export function removeExerciseAlias(state, aliasId, now = new Date().toISOString()) {
  normalizeCustomExercisesState(state, now);
  const alias = state.exerciseAliases.find((item) => item.id === aliasId && !item.deletedAt);
  if (!alias) return { status: "missing" };
  alias.deletedAt = now;
  alias.updatedAt = now;
  return { status: "deleted", alias };
}

// An explicit historical mapping may override a catalog alias without changing
// PLAN parsing or the canonical library. Reuse durable alias records/backup.
export function rememberHistoricalExerciseAlias(state, aliasValue, exerciseId, { builtInCatalog = {}, now = new Date().toISOString(), source } = {}) {
  normalizeCustomExercisesState(state, now);
  const target = exerciseDefinition(state, exerciseId, builtInCatalog);
  if (!target || target.deleted) throw new Error('The chosen exercise is no longer available. Review this match again.');
  const normalizedAlias = normalizeExerciseAlias(aliasValue);
  const existing = state.exerciseAliases.find(item => item.scope === 'historical-import' && (item.source||null)===(source||null) && item.normalizedAlias === normalizedAlias);
  const record = normalizeAliasRecord({ ...existing, id: existing?.id || stableId('exercise-alias'), alias: aliasValue, exerciseId,
    scope: 'historical-import', ...(source?{source}:{}), createdAt: existing?.createdAt || now, updatedAt: now, deletedAt: null }, now);
  if (existing) Object.assign(existing, record); else state.exerciseAliases.push(record);
  return record;
}

export function resolveRememberedExercise(state, value, builtInCatalog = {}) {
  const normalized = normalizeExerciseAlias(value);
  if (!normalized) return null;
  const custom = (state?.customExercises || []).filter((item) => !item.deletedAt && normalizeExerciseAlias(item.name) === normalized);
  if (custom.length === 1) return { exerciseId: custom[0].id, status: "custom" };
  const alias = (state?.exerciseAliases || []).filter((item) => !item.scope && !item.deletedAt && item.normalizedAlias === normalized);
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
