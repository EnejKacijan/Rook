import {
  exerciseCatalog,
  exerciseName,
  matchImportedExerciseName,
  rankExerciseSearch,
  storedWeight,
  workoutPlanDate,
} from "./domain.js";
import {
  createCustomExerciseRecord,
  customExerciseSnapshot,
  normalizeExerciseAlias,
  registerCustomExerciseRecord,
  rememberExerciseAlias,
  resolveRememberedExercise,
} from "./customExercises.js";

export const HISTORICAL_IMPORT_SOURCES = {
  hevy: {
    label: "Hevy",
    detail: "Current Hevy workout CSV export",
  },
  strong: {
    label: "Strong",
    detail: "English Strong workout CSV export",
  },
  generic: {
    label: "Generic CSV",
    detail: "ROOK’s documented set-level format",
  },
};

export const GENERIC_HISTORY_CSV_HEADER = [
  "workout_date",
  "workout_name",
  "exercise_name",
  "set_order",
  "weight",
  "weight_unit",
  "reps",
  "duration_seconds",
  "notes",
  "workout_notes",
].join(",");

const HEVY_HEADERS = [
  "title", "start_time", "end_time", "description", "exercise_title",
  "superset_id", "exercise_notes", "set_index", "set_type", "weight_lbs",
  "reps", "distance_miles", "duration_seconds", "rpe",
];
const STRONG_REQUIRED = [
  "Date", "Workout Name", "Exercise Name", "Set Order", "Weight", "Reps",
];
const GENERIC_REQUIRED = [
  "workout_date", "workout_name", "exercise_name", "set_order", "weight_unit",
];

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function clean(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text ?? "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => clean(value))) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => clean(value))) rows.push(row);
  if (!rows.length) throw new Error("This CSV is empty.");
  return rows;
}

function headerMap(headers) {
  return new Map(headers.map((value, index) => [clean(value), index]));
}

function assertHeaders(source, headers) {
  const available = new Set(headers.map(clean));
  const required = source === "hevy" ? HEVY_HEADERS : source === "strong" ? STRONG_REQUIRED : GENERIC_REQUIRED;
  const missing = required.filter((header) => !available.has(header));
  if (missing.length)
    throw new Error(
      `This doesn’t match the current ${HISTORICAL_IMPORT_SOURCES[source]?.label || "selected"} workout export. No data was read.`,
    );
}

function cell(row, map, name) {
  const index = map.get(name);
  return index === undefined ? "" : clean(row[index]);
}

function finite(value) {
  if (clean(value) === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function setOrder(value) {
  const direct = finite(value);
  if (direct !== null) return direct;
  const marked = clean(value).match(/^[a-z]+\s*(\d+)$/i);
  return marked ? Number(marked[1]) : null;
}

function parseDate(value) {
  const input = clean(value);
  if (!input) return null;
  let normalized = input;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) normalized = `${input}T12:00:00`;
  else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(input))
    normalized = input.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedUnit(value) {
  const unit = clean(value).toLowerCase();
  if (["kg", "kgs", "kilogram", "kilograms"].includes(unit)) return "kg";
  if (["lb", "lbs", "pound", "pounds"].includes(unit)) return "lb";
  return null;
}

function durationFrom(value) {
  const numeric = finite(value);
  if (numeric !== null && numeric >= 0) return Math.round(numeric);
  const input = clean(value).toLowerCase();
  if (!input) return null;
  const hours = Number(input.match(/(\d+(?:\.\d+)?)\s*h/)?.[1] || 0);
  const minutes = Number(input.match(/(\d+(?:\.\d+)?)\s*m/)?.[1] || 0);
  const seconds = Number(input.match(/(\d+(?:\.\d+)?)\s*s/)?.[1] || 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? Math.round(total) : null;
}

function rowFrom(source, row, map, strongUnit) {
  if (source === "hevy") {
    const started = parseDate(cell(row, map, "start_time"));
    const ended = parseDate(cell(row, map, "end_time"));
    return {
      started, ended,
      workoutName: cell(row, map, "title"),
      workoutNotes: cell(row, map, "description"),
      exerciseName: cell(row, map, "exercise_title"),
      setOrder: finite(cell(row, map, "set_index")),
      setType: cell(row, map, "set_type") || "normal",
      weight: finite(cell(row, map, "weight_lbs")),
      unit: "lb",
      reps: finite(cell(row, map, "reps")),
      seconds: finite(cell(row, map, "duration_seconds")),
      notes: cell(row, map, "exercise_notes"),
      rpe: finite(cell(row, map, "rpe")),
      supersetId: cell(row, map, "superset_id") || null,
      rawUnit: "weight_lbs",
    };
  }
  if (source === "strong") {
    const started = parseDate(cell(row, map, "Date"));
    const explicitUnit = normalizedUnit(cell(row, map, "Weight Unit"));
    return {
      started,
      ended: null,
      duration: durationFrom(cell(row, map, "Workout Duration") || cell(row, map, "Duration")),
      workoutName: cell(row, map, "Workout Name"),
      workoutNotes: cell(row, map, "Workout Notes"),
      exerciseName: cell(row, map, "Exercise Name"),
      setOrder: setOrder(cell(row, map, "Set Order")),
      setType: /^w/i.test(cell(row, map, "Set Order")) ? "warmup" : "normal",
      weight: finite(cell(row, map, "Weight")),
      unit: explicitUnit || normalizedUnit(strongUnit),
      reps: finite(cell(row, map, "Reps")),
      seconds: finite(cell(row, map, "Seconds")),
      notes: cell(row, map, "Notes"),
      rpe: finite(cell(row, map, "RPE")),
      rawUnit: explicitUnit ? cell(row, map, "Weight Unit") : "user-selected",
    };
  }
  const started = parseDate(cell(row, map, "workout_date"));
  return {
    started,
    ended: null,
    duration: durationFrom(cell(row, map, "workout_duration_seconds")),
    workoutName: cell(row, map, "workout_name"),
    workoutNotes: cell(row, map, "workout_notes"),
    exerciseName: cell(row, map, "exercise_name"),
    setOrder: finite(cell(row, map, "set_order")),
    setType: cell(row, map, "set_type") || "normal",
    weight: finite(cell(row, map, "weight")),
    unit: normalizedUnit(cell(row, map, "weight_unit")),
    reps: finite(cell(row, map, "reps")),
    seconds: finite(cell(row, map, "duration_seconds")),
    notes: cell(row, map, "notes"),
    rpe: finite(cell(row, map, "rpe")),
    rawUnit: cell(row, map, "weight_unit"),
  };
}

function validateRow(value, line) {
  if (!value.started) return `Row ${line}: invalid workout date.`;
  if (!value.workoutName) return `Row ${line}: workout name is missing.`;
  if (!value.exerciseName) return `Row ${line}: exercise name is missing.`;
  if (value.setOrder === null || value.setOrder < 0) return `Row ${line}: set order is invalid.`;
  if (value.weight !== null && !value.unit) return `Row ${line}: weight unit is unknown.`;
  if (value.weight !== null && value.weight < 0) return `Row ${line}: weight cannot be negative.`;
  if (value.reps !== null && (!Number.isInteger(value.reps) || value.reps < 0)) return `Row ${line}: reps are invalid.`;
  if (value.seconds !== null && value.seconds < 0) return `Row ${line}: duration is invalid.`;
  if (value.reps === null && value.seconds === null) return `Row ${line}: reps or duration is required.`;
  return null;
}

function exerciseResolution(state, name) {
  const remembered = resolveRememberedExercise(state, name, exerciseCatalog);
  if (remembered) return remembered;
  return matchImportedExerciseName(name);
}

function setIdentity(set) {
  return [set.weight ?? "?", set.reps ?? "?", set.seconds ?? "?", set.setType || "normal"].join(":");
}

function exerciseIdentity(exercise) {
  const identity = exercise.exerciseId || normalizeExerciseAlias(exercise.sourceName);
  return `${identity}[${exercise.sets.map(setIdentity).join("|")}]`;
}

export function historicalWorkoutFingerprint(workout) {
  const date = String(workout.completedAt || workout.startedAt || workoutPlanDate(workout) || "").slice(0, 19);
  const name = normalizeExerciseAlias(workout.name);
  const exercises = (workout.exercises || []).map(exerciseIdentity).join(";");
  return hash(`${date}|${name}|${exercises}`);
}

function existingIdentity(workout) {
  return {
    fingerprint: workout.historicalImport?.fingerprint || historicalWorkoutFingerprint(workout),
    day: String(workoutPlanDate(workout) || workout.completedAt || "").slice(0, 10),
    name: normalizeExerciseAlias(workout.name),
  };
}

function classifyDuplicates(workouts, existingWorkouts) {
  const existing = (existingWorkouts || []).map(existingIdentity);
  const seen = new Set(existing.map((item) => item.fingerprint));
  const sessions = [];
  for (const workout of workouts) {
    const fingerprint = historicalWorkoutFingerprint(workout);
    const day = workout.completedAt.slice(0, 10);
    const name = normalizeExerciseAlias(workout.name);
    let duplicate = seen.has(fingerprint) ? "exact" : null;
    if (!duplicate && existing.some((item) => item.day === day && item.name === name)) duplicate = "ambiguous";
    if (!duplicate && sessions.some((item) => item.fingerprint === fingerprint)) duplicate = "exact";
    seen.add(fingerprint);
    sessions.push({ ...workout, fingerprint, duplicate });
  }
  return sessions;
}

function buildPreview(source, parsedRows, invalidRows, state, fileName) {
  const byWorkout = new Map();
  for (const row of parsedRows) {
    const key = `${row.started.toISOString()}|${row.workoutName}`;
    if (!byWorkout.has(key)) byWorkout.set(key, { key, rows: [] });
    byWorkout.get(key).rows.push(row);
  }
  const workouts = [...byWorkout.values()].map(({ key, rows }) => {
    const byExercise = new Map();
    for (const row of rows) {
      const exerciseKey = normalizeExerciseAlias(row.exerciseName);
      if (!byExercise.has(exerciseKey)) byExercise.set(exerciseKey, { sourceName: row.exerciseName, rows: [] });
      byExercise.get(exerciseKey).rows.push(row);
    }
    const started = rows[0].started;
    const ended = rows.find((row) => row.ended)?.ended || null;
    const duration = rows.find((row) => row.duration)?.duration || (ended ? Math.max(0, Math.round((ended - started) / 1000)) : null);
    const exercises = [...byExercise.values()].map(({ sourceName, rows: exerciseRows }, exerciseIndex) => {
      const resolution = exerciseResolution(state, sourceName);
      const exerciseId = resolution?.exerciseId || null;
      return {
        id: `import-exercise-${hash(`${key}|${exerciseIndex}|${sourceName}`)}`,
        sourceName,
        exerciseId,
        matchStatus: resolution?.status || "unresolved",
        rememberMatch: false,
        ignored: false,
        customRecord: null,
        notes: exerciseRows.find((row) => row.notes)?.notes || null,
        supersetId: exerciseRows.find((row) => row.supersetId)?.supersetId || null,
        sets: exerciseRows
          .sort((left, right) => left.setOrder - right.setOrder)
          .map((row, setIndex) => ({
            id: `import-set-${hash(`${key}|${exerciseIndex}|${setIndex}|${setIdentity(row)}`)}`,
            completed: true,
            planned: true,
            weight: row.weight === null ? null : storedWeight(row.weight, row.unit),
            reps: row.reps ?? row.seconds,
            seconds: row.seconds,
            setType: row.setType,
            rir: null,
            rawImport: {
              weight: row.weight,
              weightUnit: row.unit,
              unitSource: row.rawUnit,
              rpe: row.rpe,
              setOrder: row.setOrder,
            },
          })),
      };
    });
    const setCount = exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
    return {
      id: `import-workout-${hash(key)}`,
      name: rows[0].workoutName,
      startedAt: started.getTime(),
      endedAt: ended?.getTime() || started.getTime() + (duration || 0) * 1000,
      completedAt: (ended || started).toISOString(),
      durationSeconds: duration,
      status: "completed",
      endedEarly: false,
      plannedSetCount: setCount,
      completedPlannedSetCount: setCount,
      completedSetCount: setCount,
      sessionNote: rows.find((row) => row.workoutNotes)?.workoutNotes || null,
      exercises,
    };
  });
  const classified = classifyDuplicates(workouts, state.workouts || []);
  const dates = classified.map((workout) => workout.completedAt).sort();
  const exerciseNames = new Map();
  for (const workout of classified)
    for (const exercise of workout.exercises)
      if (!exerciseNames.has(normalizeExerciseAlias(exercise.sourceName))) exerciseNames.set(normalizeExerciseAlias(exercise.sourceName), exercise);
  return summarizePreview({
    id: `history-import-${hash(`${source}|${fileName}|${parsedRows.length}|${dates[0] || ""}`)}`,
    source,
    sourceLabel: HISTORICAL_IMPORT_SOURCES[source].label,
    fileName,
    workouts: classified,
    invalidRows,
    exerciseMappings: [...exerciseNames.values()].map((exercise) => ({
      sourceName: exercise.sourceName,
      exerciseId: exercise.exerciseId,
      matchStatus: exercise.matchStatus,
      ignored: false,
      rememberMatch: false,
      customRecord: null,
    })),
    dateRange: dates.length ? [dates[0], dates.at(-1)] : [],
  });
}

function summarizePreview(preview) {
  const mappings = preview.exerciseMappings || [];
  const summary = {
    workouts: preview.workouts.length,
    sets: preview.workouts.reduce((total, workout) => total + workout.exercises.reduce((subtotal, exercise) => subtotal + exercise.sets.length, 0), 0),
    matchedExercises: mappings.filter((item) => item.exerciseId && !item.ignored).length,
    reviewExercises: mappings.filter((item) => !item.exerciseId && !item.ignored).length,
    ignoredExercises: mappings.filter((item) => item.ignored).length,
    exactDuplicates: preview.workouts.filter((item) => item.duplicate === "exact").length,
    ambiguousDuplicates: preview.workouts.filter((item) => item.duplicate === "ambiguous").length,
    invalidRows: preview.invalidRows.length,
  };
  return { ...preview, summary };
}

export function parseHistoricalWorkoutCsv({ source, text, strongUnit = null, state, fileName = "workouts.csv" }) {
  if (!HISTORICAL_IMPORT_SOURCES[source]) throw new Error("Choose a supported workout source.");
  if (source === "strong" && !normalizedUnit(strongUnit))
    throw new Error("Choose the weight unit used in this Strong export.");
  const rows = parseCsv(text);
  const headers = rows[0].map(clean);
  assertHeaders(source, headers);
  const map = headerMap(headers);
  const parsedRows = [];
  const invalidRows = [];
  rows.slice(1).forEach((row, index) => {
    const value = rowFrom(source, row, map, strongUnit);
    const error = validateRow(value, index + 2);
    if (error) invalidRows.push({ line: index + 2, reason: error, raw: row.slice(0, 4) });
    else parsedRows.push(value);
  });
  if (!parsedRows.length) throw new Error(invalidRows[0]?.reason || "No importable workout sets were found.");
  return buildPreview(source, parsedRows, invalidRows, state, fileName);
}

export function resolveHistoricalExercise(preview, state, sourceName, resolution) {
  const next = structuredClone(preview);
  const mapping = next.exerciseMappings.find((item) => item.sourceName === sourceName);
  if (!mapping) return next;
  mapping.ignored = resolution.type === "ignore";
  mapping.rememberMatch = Boolean(resolution.rememberMatch);
  mapping.customRecord = null;
  if (resolution.type === "custom") {
    mapping.customRecord = createCustomExerciseRecord({
      id: `custom-import-${hash(normalizeExerciseAlias(sourceName))}`,
      name: sourceName,
      equipment: ["other"],
      primaryMuscle: "Full body",
      loggingType: "weight_reps",
    });
    mapping.exerciseId = mapping.customRecord.id;
    mapping.matchStatus = "custom-new";
  } else if (resolution.type === "match") {
    const exists = exerciseCatalog[resolution.exerciseId] || state.customExercises?.some((item) => item.id === resolution.exerciseId && !item.deletedAt);
    if (!exists) throw new Error("Choose an available exercise.");
    mapping.exerciseId = resolution.exerciseId;
    mapping.matchStatus = "manual";
  } else if (resolution.type === "ignore") {
    mapping.exerciseId = null;
    mapping.matchStatus = "ignored";
  }
  for (const workout of next.workouts)
    for (const exercise of workout.exercises)
      if (exercise.sourceName === sourceName) Object.assign(exercise, {
        exerciseId: mapping.exerciseId,
        matchStatus: mapping.matchStatus,
        ignored: mapping.ignored,
        rememberMatch: mapping.rememberMatch,
        customRecord: mapping.customRecord,
      });
  next.workouts = classifyDuplicates(next.workouts.map(({ fingerprint, duplicate, ...workout }) => workout), state.workouts || []);
  return summarizePreview(next);
}

function materializeExercise(state, exercise) {
  if (exercise.ignored) return null;
  if (!exercise.exerciseId) throw new Error(`${exercise.sourceName} still needs review.`);
  let custom = state.customExercises?.find((item) => item.id === exercise.exerciseId) || exercise.customRecord;
  const catalog = exerciseCatalog[exercise.exerciseId];
  const definition = catalog || (custom ? customExerciseSnapshot(custom, "historical-import") : null);
  if (!definition) throw new Error(`${exercise.sourceName} no longer maps to an available exercise.`);
  const reps = exercise.sets.map((set) => Number(set.reps)).filter(Number.isFinite);
  return {
    ...exercise,
    importedName: exercise.sourceName,
    originalImportedName: exercise.sourceName,
    importedExercise: catalog ? undefined : definition,
    repMin: reps.length ? Math.min(...reps) : 1,
    repMax: reps.length ? Math.max(...reps) : 1,
    targetRir: null,
    restSeconds: null,
    defaultIncrement: definition.increment || 1,
    sets: exercise.sets.map(({ seconds, setType, rawImport, ...set }) => ({
      ...set,
      ...(seconds !== null ? { durationSeconds: seconds } : {}),
      importSetType: setType,
      rawImport,
    })),
  };
}

export function applyHistoricalWorkoutImport(state, preview, { ambiguousAction = null, now = new Date().toISOString() } = {}) {
  if (preview.summary.reviewExercises) throw new Error("Review every unmatched exercise before importing.");
  if (preview.summary.ambiguousDuplicates && !["skip", "import"].includes(ambiguousAction))
    throw new Error("Choose how to handle possible duplicates.");
  const next = structuredClone(state);
  const newCustom = new Map();
  for (const mapping of preview.exerciseMappings)
    if (mapping.customRecord) newCustom.set(mapping.customRecord.id, mapping.customRecord);
  for (const record of newCustom.values()) registerCustomExerciseRecord(next, record, now);
  for (const mapping of preview.exerciseMappings)
    if (mapping.rememberMatch && mapping.exerciseId && !mapping.ignored)
      rememberExerciseAlias(next, mapping.sourceName, mapping.exerciseId, { builtInCatalog: exerciseCatalog, now });
  const imported = [];
  for (const workout of preview.workouts) {
    if (workout.duplicate === "exact") continue;
    if (workout.duplicate === "ambiguous" && ambiguousAction === "skip") continue;
    const exercises = workout.exercises.map((exercise) => materializeExercise(next, exercise)).filter(Boolean);
    if (!exercises.length) continue;
    const setCount = exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
    imported.push({
      ...workout,
      id: `${workout.id}-${workout.fingerprint}`,
      exercises,
      plannedSetCount: setCount,
      completedPlannedSetCount: setCount,
      completedSetCount: setCount,
      historicalImport: {
        source: preview.source,
        sourceLabel: preview.sourceLabel,
        importedAt: now,
        importId: preview.id,
        fingerprint: workout.fingerprint,
      },
    });
  }
  next.workouts = [...(next.workouts || []), ...imported].sort(
    (left, right) => new Date(left.completedAt || 0) - new Date(right.completedAt || 0),
  );
  return {
    state: next,
    result: {
      imported: imported.length,
      sets: imported.reduce((total, workout) => total + workout.completedSetCount, 0),
      skippedDuplicates: preview.summary.exactDuplicates + (ambiguousAction === "skip" ? preview.summary.ambiguousDuplicates : 0),
      skippedRows: preview.summary.invalidRows,
      ignoredExercises: preview.summary.ignoredExercises,
    },
  };
}

export function historicalExerciseChoices(state, query = "") {
  const normalized = normalizeExerciseAlias(query);
  const builtIn = Object.values(exerciseCatalog)
    .filter((item) => !item.id.startsWith("wg-"))
    .map((item) => ({ id: item.id, name: item.name, custom: false }));
  const custom = (state.customExercises || [])
    .filter((item) => !item.deletedAt)
    .map((item) => ({ id: item.id, name: item.name, custom: true }));
  return rankExerciseSearch([...builtIn, ...custom]
    .filter((item, index, values) => values.findIndex((value) => value.id === item.id) === index)
    .filter((item) => !normalized || normalizeExerciseAlias(item.name).includes(normalized))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 30), query);
}

export function historicalExerciseLabel(state, exerciseId) {
  const custom = state.customExercises?.find((item) => item.id === exerciseId);
  return custom?.name || (exerciseCatalog[exerciseId] ? exerciseName({ exerciseId }) : "Unmatched");
}
