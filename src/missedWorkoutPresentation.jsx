import {missedFlexibleSessions} from './flexibleWeek.js';
import {missedReminderKey} from './missedWorkoutActions.js';
import {ExerciseNavigationButton} from './ExerciseNavigationButton.jsx';
import {MissedWorkoutFeedbackProvider,useMissedWorkoutFeedback} from './MissedWorkoutFeedback.jsx';
const dateLabel=(date,long=false)=>new Intl.DateTimeFormat('en',{weekday:long?'long':'short',month:long?'long':'short',day:'numeric'}).format(new Date(`${date}T12:00:00`));
export function MissedWorkoutSummary({state,onSelect,update}) {
 const feedback=useMissedWorkoutFeedback();
 // Also support the standalone Today summary in previews and tests.
 if(!feedback && update)return <MissedWorkoutFeedbackProvider state={state} update={update}><MissedWorkoutSummary state={state} onSelect={onSelect} update={update}/></MissedWorkoutFeedbackProvider>;
 const missed=missedFlexibleSessions(state),first=missed[0],single=missed.length===1;
 if(!first || state.dismissedMissedReminderKey===missedReminderKey(state))return null;
 return <aside className={`today-missed-row${single?' is-single':''}`} aria-label="Missed-workout reminder">
  <div className="today-missed-header">
   <span className="eyebrow today-missed-label">{single?'MISSED WORKOUT':'MISSED WORKOUTS'}</span>
   {feedback&&<button type="button" className="text-button missed-reminder-hide" aria-label={single?'Hide missed workout reminder':'Hide missed workouts reminder'} onClick={feedback.hide}>Hide</button>}
  </div>
  <ExerciseNavigationButton type="button" className="today-missed-open"
   aria-label={single?`Recover ${first.workout.name}, missed ${dateLabel(first.scheduledDate,true).replaceAll(',','')}`:`View ${missed.length} missed workouts`}
   onClick={()=>onSelect(single?{sessionId:first.logicalSessionId}:{missed:true})}>
   <span><strong>{single?first.workout.name:`${missed.length} missed workouts`}</strong>
    {single&&<time dateTime={first.scheduledDate}>Missed · {dateLabel(first.scheduledDate)}</time>}</span>
   <span className="today-missed-chevron" aria-hidden="true">›</span>
  </ExerciseNavigationButton>
 </aside>;
}
