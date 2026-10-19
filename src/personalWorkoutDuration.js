const median = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Learn a pace, never a prescription. The caller freezes this calibration for
// the whole review so removing an exercise cannot change the underlying pace.
export function personalDurationCalibration(workout, history, estimate, fixedMinutes, now = Date.now()) {
  const ids = new Set((workout?.exercises || []).map(row => row.exerciseId));
  if (!ids.size) return { scale: 1, sampleCount: 0 };
  const superseded = new Set((history || []).map(row => row.supersedesCompletionId).filter(Boolean));
  const samples = (history || []).filter(row => !superseded.has(row.id)).map(row => {
    const age = now - new Date(row.completedAt || row.endedAt).getTime();
    const actual = Number(row.durationSeconds) / 60;
    if (!Number.isFinite(age) || age < 0 || age > 180 * 86400000 || row.endedEarly ||
        row.status === 'ended-early' || !Number.isFinite(actual) || actual < 5 || actual > 180) return null;
    const exercises = (row.exercises || []).map(exercise => ({ ...exercise,
      sets: (exercise.sets || []).filter(set => set.completed && !set.warmup && set.setType !== 'warmup') })).filter(exercise => exercise.sets.length);
    const planned = (row.exercises || []).reduce((sum, exercise) => sum + (exercise.sets?.length || 0), 0);
    const logged = exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    if (!planned || logged / planned < 0.8) return null;
    const pastIds = new Set(exercises.map(exercise => exercise.exerciseId));
    const overlap = [...ids].filter(id => pastIds.has(id)).length;
    const counts = rows => rows.reduce((result,exercise) => result.set(exercise.exerciseId,(result.get(exercise.exerciseId)||0)+(exercise.sets?.length||0)),new Map());
    const currentCounts = counts(workout.exercises || []), pastCounts = counts(exercises);
    const allIds = new Set([...ids,...pastIds]);
    const intersect = [...allIds].reduce((sum,id) => sum + Math.min(currentCounts.get(id)||0,pastCounts.get(id)||0),0);
    const union = [...allIds].reduce((sum,id) => sum + Math.max(currentCounts.get(id)||0,pastCounts.get(id)||0),0);
    const jaccard = union ? intersect / union : 0;
    const averageRest = rows => rows.reduce((sum,exercise) => sum + (exercise.restSeconds ?? 90),0) / Math.max(1,rows.length);
    const restNow = averageRest(workout.exercises || []), restPast = averageRest(exercises);
    const restSimilarity = Math.max(restNow,restPast) ? Math.min(restNow,restPast)/Math.max(restNow,restPast) : 1;
    const sameDay = Boolean(row.programDayId && row.programDayId === (workout.programDayId || workout.id));
    const similarity = 0.7*jaccard + 0.2*restSimilarity + 0.1*Number(sameDay);
    // A recycled programDayId alone is insufficient after a plan edit.
    if (!overlap || jaccard < 0.5) return null;
    const model = { ...workout, ...row, durationPlanningVersion: workout.durationPlanningVersion, exercises };
    const base = estimate(model), fixed = fixedMinutes(model, base);
    if (actual < base * 0.4 || actual > base * 2 + 10 || actual <= fixed || base <= fixed) return null;
    const ratio = (actual - fixed) / (base - fixed);
    if (ratio < 0.35 || ratio > 2) return null;
    return { ratio, weight: similarity**2 * 2**(-age / (60 * 86400000)) * (logged < 4 ? 0.25 : 1), date: new Date(row.completedAt || row.endedAt).getTime() };
  }).filter(Boolean).sort((a, b) => b.date - a.date).slice(0, 8);
  if (!samples.length) return { scale: 1, sampleCount: 0 };
  const center = median(samples.map(sample => sample.ratio));
  const mad = median(samples.map(sample => Math.abs(sample.ratio - center)));
  const reliable = samples.filter(sample => Math.abs(sample.ratio - center) <= Math.max(0.25, 3 * mad));
  const evidence = reliable.reduce((sum,sample) => sum+sample.weight,0);
  let cumulative = 0, pace = center;
  for (const sample of [...reliable].sort((a,b)=>a.ratio-b.ratio)) {
    cumulative += sample.weight;
    if (cumulative >= evidence/2) {pace=sample.ratio;break;}
  }
  const confidence = evidence / (evidence + 8);
  return { scale: Math.exp(confidence * Math.log(clamp(pace, 0.7, 1.5))), sampleCount: reliable.length };
}
