// Supply only missing dimensions; source values are not editable defaults.
export function resolvePartialPrescription(exercise, value) {
  const partial = exercise.partialPrescription;
  const count = partial.missing.includes('sets') ? Number(value.sets) : exercise.sets.length;
  const min = partial.missing.includes('reps') ? Number(value.repMin) : exercise.repMin;
  const max = partial.missing.includes('reps') ? Number(value.repMax) : exercise.repMax;
  if (!Number.isInteger(count) || count < 1 || count > 20 ||
      (partial.missing.includes('reps') && (!Number.isInteger(min) || min < 1 || !Number.isInteger(max) || max < min))) return false;
  exercise.repMin = min; exercise.repMax = max;
  exercise.sets = Array.from({length:count}, (_, index) => ({
    weight:partial.weight ?? null, setType:partial.setType,
    ...exercise.sets[Math.min(index, exercise.sets.length - 1)],
    id:exercise.sets[index]?.id || `${exercise.id}-review-set-${index}`,
    reps:min, completed:false,
  }));
  delete exercise.partialPrescription;
  return true;
}
