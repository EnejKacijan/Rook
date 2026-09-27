import {isoDay,saveState} from './domain.js';
import {missedFlexibleSessions,proposeFlexibleWeek,applyFlexibleWeek,flexibleReviewFingerprint} from './flexibleWeek.js';

// Occurrence identity and placement, not render order, labels or today's clock.
export function missedReminderKey(state) {
 return JSON.stringify(missedFlexibleSessions(state).map(s=>JSON.stringify([s.logicalSessionId,s.scheduledDate,s.originalDate])).sort());
}
export function dismissMissedReminder(state,{persist=saveState}={}) {
 const next={...state,dismissedMissedReminderKey:missedReminderKey(state)};
 if(!persist(next))throw Error('Couldn’t save this preference. The reminder is still visible. Try again.');
 return next;
}
export function canUndoMissedReminderHide(state,key) {
 return state.dismissedMissedReminderKey===key && missedReminderKey(state)===key;
}
export function undoMissedReminderHide(state,key,{persist=saveState}={}) {
 if(!canUndoMissedReminderHide(state,key))throw Error('The missed-workout reminder changed.');
 const next={...state,dismissedMissedReminderKey:null};
 if(!persist(next))throw Error('Couldn’t save Undo. The reminder is still hidden. Try again.');
 return next;
}
// Same guarded schedule snapshot for Move and Skip. Visibility is deliberately
// excluded: undoing a schedule action must never undo a reminder preference.
export function missedRecoveryUndo(before,after,sessionId) {
 const keys=['program','flexibleWeek','weekScheduleOverrides','workoutOccurrenceOverrides','todayAdaptation']
  .filter(key=>JSON.stringify(before[key])!==JSON.stringify(after[key]));
 return {sessionId,today:isoDay(),fingerprint:flexibleReviewFingerprint(after),
  changedFingerprint:JSON.stringify(keys.map(key=>after[key])),
  before:structuredClone(Object.fromEntries(keys.map(key=>[key,before[key]])))};
}
export function canUndoMissedRecovery(state,undo) {
 return Boolean(undo && undo.today===isoDay() && undo.fingerprint===flexibleReviewFingerprint(state) &&
  (!undo.changedFingerprint || undo.changedFingerprint===JSON.stringify(Object.keys(undo.before).map(key=>state[key]))));
}
export function undoMissedRecovery(state,undo,{persist=saveState}={}) {
 if(!canUndoMissedRecovery(state,undo))throw Error('The schedule or workouts changed. This action can no longer be undone here.');
 const next={...state,...structuredClone(undo.before)};
 if(!missedFlexibleSessions(next).some(item=>item.logicalSessionId===undo.sessionId))throw Error('This occurrence is no longer missed.');
 if(!persist(next))throw Error('Couldn’t save Undo. The schedule is unchanged. Try again.');
 return next;
}

export function skipMissedOccurrence(state,sessionId,{persist=saveState}={}) {
 if(!missedFlexibleSessions(state).some(item=>item.logicalSessionId===sessionId))throw Error('This occurrence is no longer an actionable missed workout.');
 const proposal=proposeFlexibleWeek(state,{mode:'skip',sessionId});
 const result=applyFlexibleWeek(state,proposal,{adaptationChoice:'restore'});
 if(result.status!=='applied')throw Error(result.error||'This session changed. Review it again.');
 if(!persist(result.state))throw Error('Couldn’t save the skip. This session is still missed. Try Skip this session again.');
 return {state:result.state,undo:missedRecoveryUndo(state,result.state,sessionId)};
}
export function undoMissedSkip(state,undo,{persist=saveState}={}) {
 if(!canUndoMissedRecovery(state,undo))throw Error('The schedule or workouts changed. This skip can no longer be undone here.');
 const next={...state,...structuredClone(undo.before)};
 if(!missedFlexibleSessions(next).some(item=>item.logicalSessionId===undo.sessionId))throw Error('This occurrence is no longer missed.');
 if(!persist(next))throw Error('Couldn’t save Undo. The workout remains skipped. Try again.');
 return next;
}
