import {useLayoutEffect,useEffect,useRef,useState} from 'react';
import {activeExercisePrDetails} from './performanceInsights.js';
import {createExerciseRecordFeedback,recordSignature} from './exerciseRecords.js';

export function useExerciseRecordFeedback(state,eligible) {
  const scope=`${state.profile.id}:${state.activeWorkout?.id}`, tracker=useRef(null), timer=useRef(null);
  const [pulse,setPulse]=useState(null);
  if(tracker.current?.scope!==scope)tracker.current={scope,receipt:createExerciseRecordFeedback(state,{eligible})};
  const currentId=state.activeWorkout?.exercises[state.activeWorkout.exerciseIndex]?.id;
  useLayoutEffect(()=>{setPulse(null);clearTimeout(timer.current);},[scope,currentId]);
  useLayoutEffect(()=>{
    if(!pulse)return;
    const exercise=state.activeWorkout?.exercises.find(e=>e.id===pulse.exerciseId);
    const record=activeExercisePrDetails(state.workouts,exercise,{e1rmEligible:eligible(exercise)})?.record;
    if(!record||recordSignature(record)!==pulse.signature)setPulse(null);
  },[state,pulse,eligible]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  return {pulse,logged(before,after,exerciseId,setId){
    const presentation=tracker.current.receipt.claim(before,after,exerciseId,setId);
    const set=after.activeWorkout.exercises.find(e=>e.id===exerciseId)?.sets.find(s=>s.id===setId);
    if(!set?.completed)setPulse(null);
    if(!presentation)return;
    clearTimeout(timer.current);
    setPulse({exerciseId,signature:presentation.signature,key:`${scope}:${exerciseId}`});
    timer.current=setTimeout(()=>setPulse(null),600);
  }};
}
