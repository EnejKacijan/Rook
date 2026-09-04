import {
  WEEKDAYS,
  currentWeekSchedule,
  displayDate,
  displayWeight,
  exerciseCatalog,
  exerciseLoadRequirement,
  exerciseMeasure,
  exerciseName,
  isoDay,
  weekDate,
  weightUnit,
  workoutPlanDate,
  workoutSetSummary,
} from "./domain.js";

const isoDate = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }
  return new Date(value || Date.now());
};

const positiveLoad = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const loadContext = (exercise) => {
  const item = exerciseCatalog[exercise?.exerciseId] || exercise || {};
  const equipment = (item.equipment || exercise?.equipment || []).map((value) =>
    String(value).toLowerCase(),
  );
  if (equipment.some((value) => value.includes("band"))) return "Band";
  if (
    item.bodyweight ||
    equipment.includes("bodyweight") ||
    equipment.includes("pull-up bar")
  )
    return "Bodyweight";
  return null;
};

export function exportLoadLabel(exercise, value, units = "kg") {
  const requirement = exerciseLoadRequirement(exercise);
  const load = positiveLoad(value);
  const context = loadContext(exercise);
  if (requirement === "none") return context;
  if (!load)
    return requirement === "required" ? "Load not logged" : context;
  const numeric = `${displayWeight(load, units)} ${weightUnit(units)}`;
  if (requirement === "optional" && context === "Bodyweight")
    return `Bodyweight +${numeric}`;
  return numeric;
}

export function formatExportSet(
  exercise,
  set,
  { units = "kg", completed = false } = {},
) {
  const value = Number(set?.reps);
  const timed = exerciseMeasure(exercise) === "seconds";
  const load = exportLoadLabel(exercise, set?.weight, units);
  let result = Number.isFinite(value) && value > 0
    ? timed
      ? `${value} sec`
      : `${value} reps`
    : timed
      ? "Time not logged"
      : "Reps not logged";
  const numericLoad = positiveLoad(set?.weight);
  if (load) {
    const useAt = timed && numericLoad && !load.startsWith("Bodyweight");
    result += useAt ? ` @ ${load}` : ` - ${load}`;
  }
  const rawRir = set?.rir ?? exercise?.targetRir;
  const rir = rawRir === null || rawRir === undefined || rawRir === ""
    ? null
    : Number(rawRir);
  if (!timed && Number.isFinite(rir)) result += ` - RIR ${rir}`;
  if (!completed) return result;
  return `${set?.completed ? "✓" : "○"} ${result}${set?.completed ? "" : " - Not completed"}`;
}

const exerciseLines = (exercise, options) => {
  const lines = [exerciseName(exercise)];
  (exercise.sets || []).forEach((set, index) => {
    lines.push(`  ${index + 1}. ${formatExportSet(exercise, set, options)}`);
  });
  if (options.includeNotes && exercise.notes)
    lines.push(`  Note: ${String(exercise.notes).trim()}`);
  return lines;
};

export const hasWorkoutExportNotes = (workout) =>
  Boolean(
    String(workout?.sessionNote || "").trim() ||
      workout?.exercises?.some((exercise) => String(exercise.notes || "").trim()),
  );

export function exportFilename(name, date, completed = false) {
  const slug = String(name || "workout")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "workout";
  return `rook-${slug}-${isoDay(isoDate(date))}${completed ? "-completed" : ""}.txt`;
}

export function buildWorkoutExport({
  workout,
  date,
  units = "kg",
  completed = false,
  includeNotes = false,
}) {
  const planDate = date || workoutPlanDate(workout) || isoDay();
  const summary = workoutSetSummary(workout);
  const lines = [
    `ROOK - ${workout.name}`,
    displayDate(isoDate(planDate)),
    completed
      ? `Completed ${summary.completed} / ${summary.total} sets`
      : `${workout.exercises.length} exercises`,
    "",
  ];
  workout.exercises.forEach((exercise, index) => {
    if (index) lines.push("");
    lines.push(...exerciseLines(exercise, { units, completed, includeNotes }));
  });
  if (includeNotes && String(workout.sessionNote || "").trim())
    lines.push("", "Session note", String(workout.sessionNote).trim());
  return {
    title: `${workout.name}${completed ? " - completed" : ""}`,
    text: lines.join("\n"),
    filename: exportFilename(workout.name, planDate, completed),
  };
}

export function buildWeeklyPlanExport({
  state,
  date = new Date(),
  units = "kg",
  includeNotes = false,
}) {
  const monday = weekDate("Mon", isoDate(date));
  const byDate = new Map(
    currentWeekSchedule(state, monday).map((entry) => [entry.scheduledDate, entry.workout]),
  );
  const lines = [
    `ROOK - ${state.program.name || "Weekly plan"}`,
    `Week of ${displayDate(monday)}`,
  ];
  WEEKDAYS.forEach((day) => {
    const dayDate = weekDate(day, monday);
    const workout = byDate.get(isoDay(dayDate));
    lines.push("", `${day.toUpperCase()} - ${workout?.name || "Rest"}`);
    workout?.exercises?.forEach((exercise) => {
      lines.push(`  ${exerciseName(exercise)}`);
      (exercise.sets || []).forEach((set, index) =>
        lines.push(`    ${index + 1}. ${formatExportSet(exercise, set, { units })}`),
      );
      if (includeNotes && exercise.notes)
        lines.push(`    Note: ${String(exercise.notes).trim()}`);
    });
  });
  return {
    title: state.program.name || "ROOK",
    text: lines.join("\n"),
    filename: `rook-weekly-plan-${isoDay(monday)}.txt`,
  };
}
