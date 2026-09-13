// Optional extension of todayAdaptation v1. Reservations live with their owner,
// not in a second store; resolutions live with the one real history record.
export const isCombinedAdjustment = value => value?.schemaVersion === 1 && value.mode === 'combine';
export const combinedAdjustment = state => isCombinedAdjustment(state.activeWorkout?.adjustment)
  ? state.activeWorkout.adjustment : isCombinedAdjustment(state.todayAdaptation) ? state.todayAdaptation : null;
// Bounded stale-state tokens, not nested snapshots of prior histories/proposals.
export function combinedStateToken(value) {
  const text=JSON.stringify(value);let first=2166136261,second=5381;
  for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);first=Math.imul(first^code,16777619);second=Math.imul(second,33)^code;}
  return `${text.length}:${first>>>0}:${second>>>0}`;
}
export const combinedPlanIdentity = state => combinedStateToken([state.program?.id, state.program?.version, state.program?.days]);
export function validateCombinedState(state) {
  for (const value of [state.todayAdaptation,state.activeWorkout?.adjustment,...(state.workouts || []).map(w=>w.adjustment)]) {
    if (!isCombinedAdjustment(value)) continue;
    const sources=value.sourceSessions;
    if (!value.id || !Array.isArray(sources) || !sources.length || sources.length>2 ||
      new Set(sources.map(s=>s.logicalSessionId)).size!==sources.length ||
      sources.some(s=>!s.programId || !s.workoutId || !s.logicalSessionId || s.reservedBy!==value.id ||
        !/^\d{4}-\d{2}-\d{2}$/.test(s.originalDate) || !/^\d{4}-\d{2}-\d{2}$/.test(s.scheduledDate)))
      throw new Error('The saved combined workout needs recovery. Source reservations were not cleared.');
  }
  return state;
}
export function combinedOccurrenceState(state, occurrence) {
  const id=occurrence.logicalSessionId || occurrence.id || `${occurrence.workoutId}:${occurrence.originalDate}`;
  const matches=a=>a?.sourceSessions?.some(s=>s.programId===state.program?.id && s.logicalSessionId===id);
  if (matches(combinedAdjustment(state))) return 'reserved';
  if ((state.workouts || []).some(w=>w.completedAt && w.combinedSourcesResolved===true && isCombinedAdjustment(w.adjustment) && matches(w.adjustment))) return 'combined';
  return null;
}
export function combinedTemplate(state,date) {
  const a=combinedAdjustment(state);
  if (!a || a.date!==date || a.planIdentity!==combinedPlanIdentity(state)) return null;
  return {...structuredClone(a.workout),id:a.id,weekday:a.workout.weekday,adapted:true,
    todayOnlyAdjustment:structuredClone(a),trainingBlock:undefined};
}
export function cancelCombinedWorkout(state) {
  const a=combinedAdjustment(state);
  if (!a) return state;
  if (state.activeWorkout?.adjustment?.id===a.id && state.activeWorkout.exercises.some(e=>e.sets.some(s=>s.completed)))
    throw new Error('This workout has logged sets. Finish it early to preserve your results and release the source sessions.');
  const next=structuredClone(state);
  if(next.activeWorkout?.adjustment?.id===a.id)next.activeWorkout=null;
  if(next.todayAdaptation?.id===a.id)next.todayAdaptation=null;
  return next;
}
export function reconcileCombinedTermination(previous,next) {
  const active=previous.activeWorkout?.adjustment;
  if(isCombinedAdjustment(active) && next.activeWorkout?.adjustment?.id!==active.id && next.todayAdaptation?.id===active.id)
    next.todayAdaptation=null;
  return next;
}
export const combinedTransition = (before,after) => Boolean(combinedAdjustment(before) || combinedAdjustment(after));
export function persistCombinedState(before,next,persist) {
  validateCombinedState(next);
  // localStorage's one state write contains history, both links and their owner.
  // A failed setItem leaves the previous serialized state intact.
  if(!persist(next))throw new Error('Could not save the combined workout. Your saved workout and both source sessions are unchanged. Try again.');
  return next;
}
