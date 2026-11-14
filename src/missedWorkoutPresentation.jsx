import {useMemo} from 'react';
import {isoDay} from './domain.js';
import {NavigationChevron} from './NavigationChevron.jsx';
import {missedFlexibleSessions} from './flexibleWeek.js';
import {isMissedReminderHidden,missedReminderKey} from './missedWorkoutActions.js';
import {ExerciseNavigationButton} from './ExerciseNavigationButton.jsx';
import {Disclosure} from './Disclosure.jsx';
import {MissedWorkoutFeedbackProvider,useMissedWorkoutFeedback} from './MissedWorkoutFeedback.jsx';
const dateLabel=(date,long=false)=>new Intl.DateTimeFormat('en',{weekday:long?'long':'short',month:long?'long':'short',day:'numeric'}).format(new Date(`${date}T12:00:00`));
export function MissedWorkoutSummary({state,onSelect,onHide,update,today=isoDay(),sessions}) {
 const feedback=useMissedWorkoutFeedback();
 const ownsSummary=Boolean(feedback || !update);
 const missed=useMemo(()=>sessions ?? (ownsSummary ? missedFlexibleSessions(state,today) : []),[state,today,ownsSummary,sessions]);
 // Also support the standalone Today summary in previews and tests.
 if(!feedback && update)return <MissedWorkoutFeedbackProvider state={state} update={update}><MissedWorkoutSummary state={state} onSelect={onSelect} onHide={onHide} update={update} today={today} sessions={sessions}/></MissedWorkoutFeedbackProvider>;
 const first=missed[0],single=missed.length===1;
 if(!first)return null;
 // Keep the disclosure mounted through Hide and Undo for its height animation.
 return <Disclosure key={missedReminderKey(state,missed)} className="today-missed-disclosure" open={!isMissedReminderHidden(state,missed)}>
 <aside className={`today-missed-row${single?' is-single':''}`} aria-label="Missed-workout reminder">
  <ExerciseNavigationButton type="button" className="today-missed-open"
   aria-label={single?`Recover ${first.workout.name}, missed ${dateLabel(first.scheduledDate,true).replaceAll(',','')}`:`Review missed sessions, ${missed.length} missed workouts`}
   onClick={()=>{
    onSelect(single?{sessionId:first.logicalSessionId}:{missed:true});
    feedback?.review();
   }}>
   <span>
    <span className="today-missed-label">{single?'Missed workout':`${missed.length} missed workouts`}</span>
    <span className="today-missed-workout"><strong>{single?first.workout.name:'Review missed sessions'}</strong>
     {single&&<><span aria-hidden="true"> · </span><time dateTime={first.scheduledDate}>{dateLabel(first.scheduledDate)}</time></>}
    </span>
   </span>
   <NavigationChevron className="today-missed-chevron"/>
  </ExerciseNavigationButton>
  {feedback&&<button type="button" className="text-button missed-reminder-hide" aria-label={single?'Hide missed workout reminder':'Hide missed workouts reminder'} onClick={()=>{if(feedback.hide())onHide?.();}}>Hide</button>}
 </aside></Disclosure>;
}
