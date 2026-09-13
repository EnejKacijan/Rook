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
import { historySetDescriptor, loggingModeOf, setTypeLabel, hasOpenRepTarget, openRepTargetLabel, hasUnspecifiedRepTarget, loggingUnit } from "./advancedLogging.js";
import { warmupPrescriptionLabel } from './warmupPrescription.js';
import { supersetMeta } from './supersets.js';
const customWarmupLines = workout => workout?.warmupPlan?.mode === 'custom' && workout.warmupPlan.items?.length
  ? ['Warm-up', ...workout.warmupPlan.items.map(item => `${item.label}${warmupPrescriptionLabel(item) ? ` · ${warmupPrescriptionLabel(item)}` : ''}`), 'Workout'] : [];

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

function planSetDescriptor(exercise, set, timed) {
  const method=setTypeLabel(set),perSide=loggingModeOf(exercise)==='per_side';
  const open=hasOpenRepTarget(exercise);
  const min=exercise.repMin,max=exercise.repMax;
  const ranged=Number.isFinite(min)&&min>0&&Number.isFinite(max)&&max>min;
  const value=Number(perSide||method ? min : set?.reps);
  const target=open?openRepTargetLabel(exercise):hasUnspecifiedRepTarget(exercise)?'Reps not specified':ranged?`${min}–${max}${timed?' sec':' reps'}`:
    Number.isFinite(value)&&value>0?`${value}${timed?' sec':' reps'}`:'Target unspecified';
  return `${method&&method!==target?`${method} · `:''}${target}${perSide?' / side':''}`;
}

export function formatExportSet(
  exercise,
  set,
  { units = "kg", completed = false } = {},
) {
  const value = Number(set?.reps);
  const timed = exerciseMeasure(exercise) === "seconds";
  const rawLoad = exportLoadLabel(exercise, set?.weight, units);
  const load = !completed&&rawLoad==='Load not logged'?'Load not specified':rawLoad;
  const advanced = loggingModeOf(exercise) === "per_side" || Boolean(setTypeLabel(set));
  let result = !completed
    ? planSetDescriptor(exercise,set,timed)
    : advanced
    ? historySetDescriptor(exercise, set)
    : Number.isFinite(value) && value > 0
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
  const rawRir = completed ? set?.rir : exercise?.targetRir;
  const rir = rawRir === null || rawRir === undefined || rawRir === ""
    ? null
    : Number(rawRir);
  if (!timed && Number.isFinite(rir)) result += ` - RIR ${rir}`;
  if (!completed) return result;
  return `${set?.completed ? "✓" : "○"} ${result}${set?.completed ? "" : " - Not completed"}`;
}

const exerciseLines = (exercise, options) => {
  const lines = [`${options.pair ? `${options.pair.role} ` : ''}${exerciseName(exercise)}`];
  const rounds=loggingUnit(exercise)==='round';
  if (!options.completed && rounds) lines.push(`  ${exercise.sets.length} rounds`);
  else if (!options.completed && hasOpenRepTarget(exercise)) lines.push(`  ${exercise.sets.length} × ${openRepTargetLabel(exercise)}`);
  (exercise.sets || []).forEach((set, index) => {
    lines.push(`  ${rounds?'Round ':''}${index + 1}. ${formatExportSet(exercise, set, options)}`);
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
  if(!completed&&workout.exercises.some(exercise=>exercise.partialPrescription))throw new Error('Resolve the imported workout structure before exporting.');
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
  if (!completed && typeof workout.location === 'string' && workout.location.trim()) lines.push(`Location: ${workout.location.trim()}`);
  lines.push(...customWarmupLines(workout));
  workout.exercises.forEach((exercise, index) => {
    if (index) lines.push("");
    const pair=supersetMeta(workout.exercises,index);
    if(pair?.memberIndex===0)lines.push(`Superset · ${pair.roundCount} rounds · A1 → A2`);
    lines.push(...exerciseLines(exercise, { units, completed, includeNotes, pair }));
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
  if (state.program.days.some(day=>day.exercises.some(exercise=>exercise.partialPrescription))) throw new Error('Resolve missing prescriptions before exporting.');
  if (state.program.importMetadata?.unresolvedRoundGroups?.length)
    throw new Error('Resolve the imported circuit structure before exporting this plan.');
  const byDate = new Map(
    currentWeekSchedule(state, monday).map((entry) => [entry.scheduledDate, entry.workout]),
  );
  const lines = [
    `ROOK - ${state.program.name || "Weekly plan"}`,
    `Week of ${displayDate(monday)}`,
  ];
  // Persisted imports retain whole source blocks, not inferred exercise notes.
  // Keep them explicitly non-executable and use only stored scope/identity.
  const sourceNotes = includeNotes ? state.program.importMetadata?.sourceNotes || [] : [];
  const emittedNotes = new Set();
  const canonicalNotes = new Set(state.program.days.flatMap(day=>day.exercises.flatMap(exercise=>
    exercise.notes ? [String(exercise.notes).trim(), ...String(exercise.notes).split(/\r?\n/).map(line=>line.trim())] : [])));
  const appendSourceNotes = notes => {
    const retained=[];
    for(const note of notes){
      const original=String(note.text || '').trim();
      if(!original || emittedNotes.has(original))continue;
      emittedNotes.add(original);
      if(canonicalNotes.has(original))continue;
      const text=original.split(/\r?\n/).filter(line=>!canonicalNotes.has(line.trim())).join('\n').trim();
      if(text)retained.push(`${note.title && text.split('\n')[0].trim()!==String(note.title).trim() ? `${note.title}\n` : ''}${text}`);
    }
    if(retained.length)lines.push('', 'IMPORTED NOTES — original source, not the executable prescription', ...retained);
  };
  const exportedDayIds=new Set();
  WEEKDAYS.forEach((day) => {
    const dayDate = weekDate(day, monday);
    const workout = byDate.get(isoDay(dayDate));
    lines.push("", `${day.toUpperCase()} - ${workout?.name || "Rest"}`);
    if (typeof workout?.location === 'string' && workout.location.trim()) lines.push(`Location: ${workout.location.trim()}`);
    lines.push(...customWarmupLines(workout));
    workout?.exercises?.forEach((exercise,exerciseIndex) => {
      const pair=supersetMeta(workout.exercises,exerciseIndex);
      if(pair?.memberIndex===0)lines.push(`  Superset · ${pair.roundCount} rounds · A1 → A2`);
      lines.push(`  ${pair ? `${pair.role} ` : ''}${exerciseName(exercise)}`);
      if(exercise.importRole)lines.push(`    ${exercise.importRole}`);
      const rounds=loggingUnit(exercise)==='round';
      if (rounds) lines.push(`    ${exercise.sets.length} rounds`);
      else if (hasOpenRepTarget(exercise)) lines.push(`    ${exercise.sets.length} × ${openRepTargetLabel(exercise)}`);
      (exercise.sets || []).forEach((set, index) =>
        lines.push(`    ${rounds?'Round ':''}${index + 1}. ${formatExportSet(exercise, set, { units })}`),
      );
      if (includeNotes && exercise.notes)
        lines.push(`    Note: ${String(exercise.notes).trim()}`);
    });
    if(workout){
      exportedDayIds.add(workout.id);
      appendSourceNotes(sourceNotes.filter(note=>note.scope==='workout'&&note.dayId===workout.id));
    }
  });
  appendSourceNotes(sourceNotes.filter(note=>note.scope!=='workout'||!exportedDayIds.has(note.dayId)));
  return {
    title: state.program.name || "ROOK",
    text: lines.join("\n"),
    filename: `rook-weekly-plan-${isoDay(monday)}.txt`,
  };
}
