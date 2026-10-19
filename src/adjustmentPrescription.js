export function validAdjustmentPrescription(target) {
  const repsValid = target.repMin == null && target.repMax == null ||
    Number.isInteger(target.repMin) && target.repMin >= 1 && target.repMin <= 3600 &&
    Number.isInteger(target.repMax) && target.repMax >= target.repMin && target.repMax <= 3600;
  return Number.isInteger(target.sets) && target.sets >= 1 && target.sets <= 20 &&
    repsValid &&
    Number.isInteger(target.restSeconds) && target.restSeconds >= 0 && target.restSeconds <= 600 &&
    (target.targetRir == null || Number.isFinite(target.targetRir) && target.targetRir >= 0 && target.targetRir <= 10);
}

export function applyAdjustmentPrescription(exercise, target) {
  if (!target || !validAdjustmentPrescription(target)) return structuredClone(exercise);
  const next = structuredClone(exercise);
  const lastCompleted = next.sets.reduce((last, set, index) => set.completed ? index : last, -1);
  const count = Math.max(target.sets, lastCompleted + 1);
  next.sets = Array.from({length: count}, (_, index) => {
    const existing = next.sets[index];
    if (existing?.completed) return existing;
    const set = { ...(existing || next.sets.at(-1)), id: existing?.id || `${exercise.id}:review-set-${index}`,
      reps: existing && target.repMin === exercise.repMin ? existing.reps : target.repMin ?? existing?.reps ?? null,
      completed: false, rir: null };
    delete set.completedAt;
    return set;
  });
  for (const key of ['repMin','repMax','restSeconds','targetRir']) next[key] = target[key];
  return next;
}

export function cleanAdjustmentSupersets(exercises) {
  for (const row of exercises) {
    if (!row.supersetId) continue;
    const members = exercises.filter(item => item.supersetId === row.supersetId);
    if (members.length !== 2 || members[0].sets.length !== members[1].sets.length ||
        exercises.indexOf(members[1]) !== exercises.indexOf(members[0]) + 1)
      members.forEach(member => { delete member.supersetId; });
  }
  return exercises;
}
