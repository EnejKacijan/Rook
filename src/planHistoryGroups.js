// Presentation only: never rewrite snapshots or their parent links.
const dayKey = value => {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};
const eligible = version => version.source === 'ROOK plan update'
  && !/replac|compatib|restor|block|generat/i.test(`${version.reason || ''} ${version.summary || ''}`);

function smallTargetChange(before, after) {
  if (!before?.days?.length || !after?.days?.length) return false;
  const left = structuredClone(before), right = structuredClone(after);
  let changed = false;
  // Compare the entire snapshot, not only the abbreviated human-readable diff.
  // Unknown fields therefore prevent grouping rather than hiding a change.
  for (const plan of [left, right]) {
    delete plan.updatedAt;
    delete plan.version;
  }
  for (let d = 0; d < left.days.length; d++) {
    for (let e = 0; e < (left.days[d].exercises || []).length; e++) {
      const a = left.days[d].exercises[e], b = right.days[d]?.exercises?.[e];
      if (!b || a.sets?.length !== b.sets?.length) return false;
      for (let s = 0; s < (a.sets || []).length; s++) {
        for (const key of ['weight', 'reps']) {
          const x = a.sets[s][key], y = b.sets[s][key];
          if (x === y) continue;
          if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0
            || Math.abs(x - y) > (key === 'reps' ? 1 : Math.min(x, y) * .05)) return false;
          changed = true;
          b.sets[s][key] = x;
        }
      }
    }
  }
  return changed && JSON.stringify(left) === JSON.stringify(right);
}

export function groupPlanVersions(versions) {
  const byId = new Map(versions.map(version => [version.id, version]));
  const micro = version => eligible(version)
    && smallTargetChange(byId.get(version.parentVersionId)?.program, version.program);
  const result = [];
  for (let index = 0; index < versions.length;) {
    const first = versions[index], run = [first];
    // Current stays visible. No inferred group crosses a 30-minute session window.
    if (index > 0 && micro(first)) {
      while (index + run.length < versions.length) {
        const next = versions[index + run.length], previous = run.at(-1);
        if (!micro(next) || previous.parentVersionId !== next.id
          || next.source !== first.source || next.reason !== first.reason
          || dayKey(next.timestamp) !== dayKey(first.timestamp)
          || Math.abs(Date.parse(first.timestamp) - Date.parse(next.timestamp)) > 30 * 60 * 1000
          || !smallTargetChange(byId.get(next.parentVersionId)?.program, first.program)) break;
        run.push(next);
      }
    }
    if (run.length >= 4) result.push({ id: first.id, versions: run });
    else result.push(...run.map(version => ({ id: version.id, versions: [version] })));
    index += run.length;
  }
  return result;
}
