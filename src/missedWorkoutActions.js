import {isoDay,saveState,weekKey} from './domain.js';
import {missedFlexibleSessions,proposeFlexibleWeek,applyFlexibleWeek,flexibleReviewFingerprint} from './flexibleWeek.js';

// The stored format also includes dates for existing backups and cloud clients.
export function missedReminderKey(state, missed = missedFlexibleSessions(state)) {
 return JSON.stringify(missed.map(s=>JSON.stringify([s.logicalSessionId,s.scheduledDate,s.originalDate])).sort());
}

function readMissedReminder(key) {
 try {
  const receipt=JSON.parse(key);
  if(!Array.isArray(receipt))return [];
  return receipt.map(entry=>JSON.parse(entry)).filter(entry=>Array.isArray(entry)&&entry.length===3&&entry.every(value=>typeof value==='string'));
 } catch { return []; }
}

export function isMissedReminderHidden(state, missed = missedFlexibleSessions(state)) {
 if(!missed.length || !state.dismissedMissedReminderKey)return false;
 const hiddenDates=new Map(readMissedReminder(state.dismissedMissedReminderKey).map(([id,date])=>[id,date]));
 return missed.every(session=>hiddenDates.get(session.logicalSessionId)===session.scheduledDate);
}

export function dismissMissedReminder(state,{persist=saveState,missed=missedFlexibleSessions(state)}={}) {
 const start=weekKey(isoDay());
 const byId=new Map(readMissedReminder(state.dismissedMissedReminderKey)
  .filter(([id,date])=>date>=start || state.flexibleWeek?.sessions?.[id]?.scheduledDate>=start)
  .map(entry=>[entry[0],entry]));
 for(const session of missed)byId.set(session.logicalSessionId,[session.logicalSessionId,session.scheduledDate,session.originalDate]);
 const next={...state,dismissedMissedReminderKey:JSON.stringify([...byId.values()].map(entry=>JSON.stringify(entry)).sort())};
 if(!persist(next))throw Error('Couldn’t save this preference. The reminder is still visible. Try again.');
 return next;
}
export function canUndoMissedReminderHide(state,key) {
 return state.dismissedMissedReminderKey===key && isMissedReminderHidden(state);
}
export function undoMissedReminderHide(state,key,{persist=saveState,previousKey=null}={}) {
 if(!canUndoMissedReminderHide(state,key))throw Error('The missed-workout reminder changed.');
 const next={...state,dismissedMissedReminderKey:previousKey};
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
