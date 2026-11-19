// Presentation order for a reviewed block. Reads only the review summary, so
// archived summaries tell the same story they told when the block ended.
// Nothing here creates evidence: every item points at one measured change.

const measured = row => row.status === 'progressed' && row.fromWeight != null && row.currentWeight != null;
export const improvementOf = row => {
  if (!measured(row)) return null;
  const loadGain = Number(row.currentWeight) - Number(row.fromWeight);
  const repGain = Number(row.repGain) || 0;
  if (loadGain > 0) return { kind: 'load', loadGain, repGain: repGain > 0 ? repGain : 0, ratio: loadGain / Number(row.fromWeight) };
  if (loadGain === 0 && repGain > 0) return { kind: 'reps', loadGain: 0, repGain, ratio: 0 };
  return null;
};

// Up to `limit` items, one per exercise. Measured improvements first (relative
// load gain, then extra reps), then records that have no comparable pair.
export function blockHighlights(review, limit = 3) {
  if (!review) return [];
  const prs = new Map((review.prBests || []).map(best => [best.exerciseId, best]));
  const improved = (review.rows || []).map(row => ({ row, change: improvementOf(row) })).filter(item => item.change)
    .sort((a, b) => (b.change.kind === 'load') - (a.change.kind === 'load') || b.change.ratio - a.change.ratio ||
      b.change.repGain - a.change.repGain || prs.has(b.row.exerciseId) - prs.has(a.row.exerciseId));
  const seen = new Set(), items = [];
  for (const { row, change } of improved) {
    if (seen.has(row.exerciseId)) continue;
    seen.add(row.exerciseId);
    items.push({ kind: change.kind, id: row.id, exerciseId: row.exerciseId, name: row.name, row, change, pr: prs.get(row.exerciseId) || null });
  }
  for (const best of prs.values()) {
    if (seen.has(best.exerciseId)) continue;
    const row = (review.rows || []).find(item => item.exerciseId === best.exerciseId);
    if (!row) continue;
    seen.add(best.exerciseId);
    items.push({ kind: 'record', id: row.id, exerciseId: best.exerciseId, name: row.name, row, change: null, pr: best });
  }
  return items.slice(0, limit);
}

// Counts program entries, like the exercise results list it summarizes.
export function improvedExerciseCount(review) {
  return (review?.rows || []).filter(improvementOf).length;
}

// One calm lead. The kind decides the wording; counts come from the review.
export function blockHeadline(review) {
  const improved = improvedExerciseCount(review);
  const records = review?.prExercises ?? 0;
  if (!review?.completedSessions) return { kind: review?.plannedRestSessions ? 'rest-only' : 'empty', count: 0 };
  if (improved) return { kind: 'improved', count: improved };
  if (records) return { kind: 'records', count: records };
  if (review.held) return { kind: 'steady', count: review.held };
  return { kind: 'start', count: review.completedSessions };
}
