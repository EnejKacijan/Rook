import React,{useRef,useState,useLayoutEffect} from 'react';
import {missedFlexibleSessions} from './flexibleWeek.js';
import {dismissMissedReminder,missedReminderKey} from './missedWorkoutActions.js';
import {ExerciseNavigationButton} from './ExerciseNavigationButton.jsx';
const dateLabel=date=>new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00`));
export function MissedWorkoutSummary({state,onSelect,update}) {
 const missed=missedFlexibleSessions(state),[error,setError]=useState(''),busy=useRef(false);
 useLayoutEffect(()=>{busy.current=false;},[state]);
 const first=missed[0];
 const single=missed.length===1;
 const dismiss=()=>{if(busy.current)return;busy.current=true;setError('');try{const next=dismissMissedReminder(state);update(()=>next,{planVersion:false,persistedState:next});}catch(e){setError(e.message);busy.current=false;}};
 if(!first || state.dismissedMissedReminderKey===missedReminderKey(state))return null;
 return <>
  <aside className={`today-missed-row${single?' is-single':''}`} aria-label="Missed-workout reminder">
   {single && <span className="eyebrow today-missed-label">MISSED WORKOUT</span>}
   <ExerciseNavigationButton type="button" className="today-missed-open"
    aria-label={single?`Options for missed ${first.workout.name} on ${dateLabel(first.scheduledDate)}`:`Choose from ${missed.length} missed workouts`}
    onClick={()=>onSelect(single?{sessionId:first.logicalSessionId}:{missed:true})}>
    <span><strong>{single?first.workout.name:`${missed.length} missed workouts`}</strong>{single && <time dateTime={first.scheduledDate}>{dateLabel(first.scheduledDate)}</time>}</span>
    <span className="today-missed-chevron" aria-hidden="true">›</span>
   </ExerciseNavigationButton>
   {update&&<button type="button" className="missed-reminder-dismiss" aria-label="Dismiss missed-workout reminder" title="Hide reminder" onClick={dismiss}>×</button>}
  </aside>
  {error&&<p role="alert" className="sheet-footnote">{error}</p>}
 </>;
}
