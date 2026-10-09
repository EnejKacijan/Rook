import {createContext,useContext,useState} from 'react';
import {useExerciseRemoveUndo} from './SwipeActionRow.jsx';
import {useDurableAction} from './useDurableAction.js';
import {missedFlexibleSessions} from './flexibleWeek.js';
import {canUndoMissedRecovery,canUndoMissedReminderHide,dismissMissedReminder,undoMissedRecovery,undoMissedReminderHide} from './missedWorkoutActions.js';
import {scheduleRevisionUndo,undoScheduleRevision,STALE_SCHEDULE_UNDO} from './scheduleTransactions.js';

const FeedbackContext=createContext(null);
export const useMissedWorkoutFeedback=()=>useContext(FeedbackContext);
const alreadyPersisted=()=>true;

// Owned above Today and its recovery sheet so closing the sheet does not destroy
// the five-second notice. Hide and schedule actions replace the same notice.
export function MissedWorkoutFeedbackProvider({state,update,children,onViewSchedule}) {
 const notice=useExerciseRemoveUndo();
 const {commit,latest}=useDurableAction(state,update);
 const [error,setError]=useState('');
 const reverse=operation=>{
  setError('');
  try {commit(operation);return true;}
  catch {setError('Couldn’t save Undo. Your data is unchanged. Try again.');return false;}
 };
 const hide=()=>{
  const current=latest.current,count=missedFlexibleSessions(current).length;
  if(!count)return;
  setError('');
  try {
   const {state:next,changed}=commit(value=>{
    const hidden=dismissMissedReminder(value,{persist:alreadyPersisted});
    return hidden.dismissedMissedReminderKey===value.dismissedMissedReminderKey?value:hidden;
   });
   if(!changed)return;
   const key=next.dismissedMissedReminderKey;
   notice.show({message:count===1?'Missed workout reminder hidden':'Missed workouts hidden',
    valid:()=>canUndoMissedReminderHide(latest.current,key),
    undo:()=>reverse(value=>undoMissedReminderHide(value,key,{persist:alreadyPersisted}))});
  } catch {setError('Couldn’t save this preference. The reminder is still visible. Try again.');}
 };
 const applied=({message,undo})=>{
  setError('');
  notice.show({message,valid:()=>canUndoMissedRecovery(latest.current,undo),
   undo:()=>reverse(value=>undoMissedRecovery(value,undo,{persist:alreadyPersisted}))});
 };
 const scheduleApplied=(before,after)=>{
  if(before===after)return;
  setError('');const inverse=scheduleRevisionUndo(before,after);
  notice.show({message:'Schedule updated',undo:()=>{
   try{commit(value=>undoScheduleRevision(value,inverse));setError('');return true;}
   catch(error){
    setError(error.message===STALE_SCHEDULE_UNDO?STALE_SCHEDULE_UNDO:'Couldn’t save Undo. Your schedule is unchanged. Try again.');
    if(error.message===STALE_SCHEDULE_UNDO){notice.clear();return true;}
    return false;
   }
  }});
 };
 return <FeedbackContext.Provider value={{hide,applied,scheduleApplied}}>
  {children}
  <div className="missed-workout-feedback">{notice.surface}
   {error&&<aside className="today-undo missed-feedback-error" role="alert"><span>{error}</span>{error===STALE_SCHEDULE_UNDO&&onViewSchedule&&<button type="button" onClick={()=>{setError('');onViewSchedule();}}>View schedule</button>}<button type="button" onClick={()=>setError('')}>Dismiss</button></aside>}
  </div>
 </FeedbackContext.Provider>;
}
