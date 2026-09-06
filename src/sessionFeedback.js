export const SESSION_FEEDBACK = Object.freeze({
  easier: 'Easier than expected',
  about_right: 'About right',
  harder: 'Harder than expected',
});
export const validSessionFeedback = value => value == null || value === 'skipped' || typeof value === 'string' && Object.hasOwn(SESSION_FEEDBACK, value);
export const sessionFeedbackLabel = value => typeof value === 'string' && Object.hasOwn(SESSION_FEEDBACK,value) ? SESSION_FEEDBACK[value] : null;

export function saveSessionFeedback(state, workoutId, value, {persist} = {}) {
  const workout = state.workouts?.find(w=>w.id === workoutId && w.completedAt);
  if (!workout || !validSessionFeedback(value)) return {status:'invalid',state};
  const next=structuredClone(state),record=next.workouts.find(w=>w.id===workoutId);
  if(value == null) delete record.sessionFeedback; else record.sessionFeedback=value;
  if(persist){try{if(!persist(next))return {status:'persistence-failed',state};}catch{return {status:'persistence-failed',state};}}
  return {status:'saved',state:next};
}

// Session-level context only. Never attribute a whole-session rating to an exercise
// or feed it into progression/replacement/load/volume decisions.
export function summarizeSessionFeedback(workouts) {
  const eligible=workouts.filter(w=>w.completedAt && !w.endedEarly && !w.adjustment && !w.optionalSessionId && !w.trainingBlock?.plannedDeload &&
    w.exercises?.some(e=>e.sets?.some(s=>s.completed)));
  const rated=eligible.filter(w=>sessionFeedbackLabel(w.sessionFeedback));
  if(rated.length<4 || rated.length<eligible.length/2)return null;
  const counts=Object.keys(SESSION_FEEDBACK).map(value=>({value,count:rated.filter(w=>w.sessionFeedback===value).length})).sort((a,b)=>b.count-a.count);
  if(counts[0].count/rated.length<.6)return null;
  const {value,count}=counts[0];
  return {rated: rated.length, eligible:eligible.length, value, count,
    text:`${count} of ${rated.length} rated sessions felt ${SESSION_FEEDBACK[value].toLowerCase()}.`};
}
