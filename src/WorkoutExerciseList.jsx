import React from 'react';
import {exerciseName,targetLabel} from './domain.js';
import {ExercisePickerIdentity} from './ExercisePickerIdentity.jsx';
import {ReviewDetails} from './ReviewDetails.jsx';
import {reviewSetTarget} from './reviewPrescription.js';
import {exportLoadLabel} from './workoutExport.js';
import {loggingModeOf,loggingUnit} from './advancedLogging.js';
import {supersetMeta} from './supersets.js';
import './workoutExerciseList.css';

// A read-only workout has one presentation, whether it is opened from the
// plan, a saved workout, an adjustment or a Coach proposal.
export function WorkoutExerciseList({exercises,profile={},className=''}) {
  return <ol className={`workout-exercise-list ${className}`.trim()} aria-label="Workout exercises">
    {exercises.map((exercise,index)=>{
      const name=exerciseName(exercise),sets=exercise.sets||[];
      const prescribed=profile.rirEnabled===false?{...exercise,targetRir:null}:exercise;
      const options={units:profile.units};
      const targets=sets.map(set=>reviewSetTarget(prescribed,set,options));
      const loads=sets.map(set=>exportLoadLabel(exercise,set.weight,profile.units));
      const commonLoad=loads.length&&new Set(loads).size===1&&loads[0]!=='Load not logged'?loads[0]:null;
      const varied=new Set(targets).size>1||sets.some(set=>set.setType||set.segments?.length);
      const pair=supersetMeta(exercises,index);
      const summary=[targetLabel(exercise,profile.rirEnabled!==false),loggingModeOf(exercise)==='per_side'?'per side':null,commonLoad,
        Number.isFinite(exercise.restSeconds)?`${exercise.restSeconds} sec rest`:null].filter(Boolean).join(' · ');
      return <li className="workout-exercise-row" key={exercise.id||`${exercise.exerciseId}-${index}`} data-workout-entry-id={exercise.id}>
        <ExercisePickerIdentity item={{...exercise,name}} enabled={profile.showExerciseImages!==false}>
          <strong className="workout-exercise-name">{name}</strong>
          <small className="workout-exercise-target">{summary}</small>
          {pair&&<small className="workout-exercise-pair">{pair.role} · Superset</small>}
        </ExercisePickerIdentity>
        {varied&&<ReviewDetails className="workout-exercise-targets" title={<>Set targets<span className="visually-hidden"> for {name}</span></>}>
          {targets.map((target,setIndex)=><p key={sets[setIndex].id||setIndex}>{loggingUnit(exercise)==='round'?'Round':'Set'} {setIndex+1} · {target}</p>)}
        </ReviewDetails>}
      </li>;
    })}
  </ol>;
}
