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

export function skipMissedOccurrence(state,sessionId,{persist=saveState}={}) {
 if(!missedFlexibleSessions(state).some(item=>item.logicalSessionId===sessionId))throw Error('This occurrence is no longer an actionable missed workout.');
 const proposal=proposeFlexibleWeek(state,{mode:'skip',sessionId});
 const result=applyFlexibleWeek(state,proposal,{adaptationChoice:'restore'});
 if(result.status!=='applied')throw Error(result.error||'This session changed. Review it again.');
 if(!persist(result.state))throw Error('Couldn’t save the skip. This session is still missed. Try Skip this session again.');
 return {state:result.state,undo:{sessionId,today:isoDay(),fingerprint:flexibleReviewFingerprint(result.state),before:structuredClone({program:state.program,flexibleWeek:state.flexibleWeek,weekScheduleOverrides:state.weekScheduleOverrides,workoutOccurrenceOverrides:state.workoutOccurrenceOverrides,todayAdaptation:state.todayAdaptation})}};
}
export function undoMissedSkip(state,undo,{persist=saveState}={}) {
 if(!undo||undo.today!==isoDay()||undo.fingerprint!==flexibleReviewFingerprint(state))throw Error('The schedule or workouts changed. This skip can no longer be undone here.');
 const next={...state,...structuredClone(undo.before)};
 if(!missedFlexibleSessions(next).some(item=>item.logicalSessionId===undo.sessionId))throw Error('This occurrence is no longer missed.');
 if(!persist(next))throw Error('Couldn’t save Undo. The workout remains skipped. Try again.');
 return next;
}
