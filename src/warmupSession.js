// Session checklist state only; prescription generation and working sets stay separate.
export function warmupSteps(stage) {
  if (!stage) return [];
  return [
    ...['general', 'movementPreparation'].flatMap(collection =>
      (stage[collection] || []).map(item => ({key: `${collection}:${item.id}`, item}))),
    ...(stage.rampUpSets || []).flatMap(entry => (entry.sets || []).map(item => ({
      key: `ramp:${entry.exerciseInstanceId || entry.exerciseId}:${item.id}`, item,
    }))),
  ];
}

export function warmupProgress(stage) {
  const steps = warmupSteps(stage), done = steps.filter(step => step.item.completed).length;
  const all = steps.length > 0 && done === steps.length;
  // Older FINISH actions could set completed with unchecked steps. Never call
  // those complete or invent a skip the owner did not explicitly request.
  const outcome = all && stage?.completed ? 'complete'
    : !all && stage?.skipped ? done ? 'partial' : 'skipped' : 'pending';
  return {steps, done, total: steps.length, all, outcome,
    action: all ? 'Continue to workout' : done ? 'Skip remaining' : 'Skip warm-up'};
}

export function changeWarmup(state, {sessionId, stageId, stepKey, exit = false}, now = Date.now()) {
  const active = state.activeWorkout, exercise = active?.exercises?.[active.exerciseIndex];
  const original = active?.warmup?.stages?.find(stage => stage.id === stageId);
  if (!active || active.id !== sessionId || !original || original.exerciseIndex !== active.exerciseIndex ||
      original.exerciseId !== exercise?.exerciseId ||
      original.exerciseInstanceId && original.exerciseInstanceId !== exercise?.id || !warmupSteps(original).length) return state;
  const warmup = structuredClone(active.warmup), stage = warmup.stages.find(item => item.id === stageId);
  if (exit) {
    const {all} = warmupProgress(stage);
    if (stage.completed === all && stage.skipped === !all) return state;
    stage.completed = all;
    stage.skipped = !all;
  } else {
    const step = warmupSteps(stage).find(item => item.key === stepKey);
    if (!step) return state;
    step.item.completed = !step.item.completed;
    // Corrections reopen completed preparation; the last check still requires
    // an explicit Continue. Partial skips keep their remaining-step semantics.
    stage.completed = false;
    if (warmupProgress(stage).all) stage.skipped = false;
  }
  // JSON round-trips break the original shared references. Keep the legacy
  // history-level collections consistent with the canonical staged checklist.
  for (const collection of ['general', 'movementPreparation']) {
    const checks = new Map((stage[collection] || []).map(item => [item.id, item.completed]));
    for (const item of warmup[collection] || []) if (checks.has(item.id)) item.completed = checks.get(item.id);
  }
  for (const entry of stage.rampUpSets || []) {
    const checks = new Map((entry.sets || []).map(item => [item.id, item.completed]));
    for (const copy of warmup.rampUpSets || []) {
      if (copy.exerciseId !== entry.exerciseId || copy.exerciseInstanceId !== entry.exerciseInstanceId) continue;
      for (const item of copy.sets || []) if (checks.has(item.id)) item.completed = checks.get(item.id);
    }
  }
  return {...state, activeWorkout: {...active, warmup, updatedAt: now}};
}
