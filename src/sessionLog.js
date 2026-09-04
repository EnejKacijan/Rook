import {
  displayWeight,
  exerciseCatalog,
  exerciseLoadRequirement,
  exerciseMeasure,
  weightUnit,
} from "./domain.js";

export function sessionLogSetParts(exercise, set, index, units) {
  const number = String(index + 1);
  if (!set.completed) return [number, "Not logged"];

  const timed = exerciseMeasure(exercise) === "seconds";
  const reps = Number(set.reps);
  const parts = [
    number,
    Number.isFinite(reps)
      ? timed
        ? `${reps} sec`
        : `${reps} ${reps === 1 ? "rep" : "reps"}`
      : timed
        ? "Time not logged"
        : "Reps not logged",
  ];
  const catalogExercise = exerciseCatalog[exercise.exerciseId] || {};
  const loadRequirement = exerciseLoadRequirement(exercise);
  const isBodyweight = Boolean(catalogExercise.bodyweight);
  const usesBand = (catalogExercise.equipment || []).some((value) =>
    String(value).toLowerCase().includes("band"),
  );
  const hasWeight =
    set.weight !== null &&
    set.weight !== undefined &&
    set.weight !== "" &&
    Number.isFinite(Number(set.weight));
  const weight = hasWeight ? Number(set.weight) : null;

  if (isBodyweight) {
    parts.push(
      weight > 0
        ? `+${displayWeight(weight, units)} ${weightUnit(units)}`
        : "Bodyweight",
    );
  } else if (usesBand && loadRequirement !== "required") {
    parts.push("Band");
  } else if (loadRequirement === "none") {
    parts.push("No load");
  } else {
    parts.push(
      weight !== null && weight > 0
        ? `${displayWeight(weight, units)} ${weightUnit(units)}`
        : "Weight not logged",
    );
  }

  const rir = Number(set.rir);
  if (
    !timed &&
    set.rir !== null &&
    set.rir !== undefined &&
    set.rir !== "" &&
    Number.isFinite(rir)
  ) {
    parts.push(`${rir} RIR`);
  }
  return parts;
}
