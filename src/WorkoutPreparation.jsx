import React,{useRef,useState} from 'react';
import {applyTodayAdjustment,createManualTodayPreparation} from './adjustToday.js';
import {saveState,isoDay} from './domain.js';
import {registerCustomExerciseRecord,rememberExerciseAlias} from './customExercises.js';
import {useSheetBack} from './useSheetBack.js';
import {effectiveGymContext} from './gymProfiles.js';

export function WorkoutPreparation({state,update,close,back,Header,Editor,date,exerciseEntryId}) {
  const isToday = !date || date === isoDay();
  const [draft]=useState(()=>{try{return {proposal:createManualTodayPreparation(state,date)};}catch(e){return {error:e.message};}});
  const [error,setError]=useState(''),latest=useRef(state);latest.current=state;
  const screen=useRef(null);useSheetBack(screen,'manual-preparation','adjust-today',back||close);
  const save=program=>{
    const proposal={...draft.proposal,workout:program.days[0],changes:[{kind:'manual',label:isToday?'Exercises and prescriptions prepared for today.':'Exercises and targets updated.'}]};
    const result=applyTodayAdjustment(latest.current,proposal);
    if(result.status!=='applied'){setError('This workout changed or the preparation is incomplete. Review it again.');return;}
    if(!saveState(result.state)){setError('Could not save your preparation. The previous workout is unchanged. Try again.');return;}
    update(()=>result.state,{planVersion:false,persistedState:result.state});close();
  };
  return <main ref={screen} className="screen detail-screen edit-plan-screen workout-preparation">
    <Header title={isToday?"Edit today's exercises":"Edit workout exercises"} onClose={close} onBack={back}/>
    {draft.error?<p role="alert">{draft.error}</p>:<Editor mode="edit" workoutOnly todayPreparation
      reviewExerciseIds={exerciseEntryId ? [exerciseEntryId] : undefined}
      copyOverride={{eyebrow:isToday?'TODAY ONLY':'THIS WORKOUT ONLY',title:'Prepare your workout',body:'Edit exercises and targets before you start.',action:isToday?'SAVE FOR TODAY':'SAVE FOR THIS WORKOUT'}}
      source={{...state.program,importMetadata:undefined,name:draft.proposal.workout.name,days:[draft.proposal.workout]}}
      profile={effectiveGymContext(state,{adjustment:draft.proposal}).profile} exerciseState={state} onSave={save} onCancel={back||close} saveError={error}
      onRegisterCustomExercise={record=>update(current=>{registerCustomExerciseRecord(current,record);return current;})}
      onRememberExerciseAlias={(alias,id)=>update(current=>{rememberExerciseAlias(current,alias,id,{builtInCatalog:exerciseCatalog});return current;})}/ >}
  </main>;
}
