import {useMemo} from 'react';
import {isoDay} from './domain.js';
import {NavigationChevron} from './NavigationChevron.jsx';
import {missedFlexibleSessions} from './flexibleWeek.js';
import {missedReminderKey} from './missedWorkoutActions.js';
import {ExerciseNavigationButton} from './ExerciseNavigationButton.jsx';
import {Disclosure} from './Disclosure.jsx';
import {MissedWorkoutFeedbackProvider,useMissedWorkoutFeedback} from './MissedWorkoutFeedback.jsx';
const dateLabel=(date,long=false)=>new Intl.DateTimeFormat('en',{weekday:long?'long':'short',month:long?'long':'short',day:'numeric'}).format(new Date(`${date}T12:00:00`));
export function MissedWorkoutSummary({state,onSelect,update,today=isoDay()}) {
 const feedback=useMissedWorkoutFeedback();
 const ownsSummary=Boolean(feedback || !update);
 const missed=useMemo(()=>ownsSummary ? missedFlexibleSessions(state,today) : [],[state,today,ownsSummary]);
 // Also support the standalone Today summary in previews and tests.
 if(!feedback && update)return <MissedWorkoutFeedbackProvider state={state} update={update}><MissedWorkoutSummary state={state} onSelect={onSelect} update={update} today={today}/></MissedWorkoutFeedbackProvider>;
 const first=missed[0],single=missed.length===1;
 if(!first)return null;
 const reminderKey=missedReminderKey(state,missed);
 // Keep the same occurrence group mounted through Hide/Undo. A different
 // group (or leaving Today) releases its animation instead of reviving old UI.
 return <Disclosure key={reminderKey} className="today-missed-disclosure" open={state.dismissedMissedReminderKey!==reminderKey}>
 <aside className={`today-missed-row${single?' is-single':''}`} aria-label="Missed-workout reminder">
  <ExerciseNavigationButton type="button" className="today-missed-open"
   aria-label={single?`Recover ${first.workout.name}, missed ${dateLabel(first.scheduledDate,true).replaceAll(',','')}`:`View ${missed.length} missed workouts`}
   onClick={()=>onSelect(single?{sessionId:first.logicalSessionId}:{missed:true})}>
   <span>
    <span className="today-missed-label">{single?'Missed workout':`${missed.length} missed workouts`}</span>
    <span className="today-missed-workout"><strong>{single?first.workout.name:'Review missed sessions'}</strong>
     {single&&<><span aria-hidden="true"> · </span><time dateTime={first.scheduledDate}>{dateLabel(first.scheduledDate)}</time></>}
    </span>
   </span>
   <NavigationChevron className="today-missed-chevron"/>
  </ExerciseNavigationButton>
  {feedback&&<button type="button" className="text-button missed-reminder-hide" aria-label={single?'Hide missed workout reminder':'Hide missed workouts reminder'} onClick={feedback.hide}>Hide</button>}
 </aside></Disclosure>;
}
