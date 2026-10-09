import React from 'react';
import { activeExercisePrDetails, E1RM_FORMULA } from './performanceInsights.js';
import { displayWeight, displayEstimatedOneRepMax, estimatedOneRepMaxChangeLabel, exerciseName, weightUnit } from './domain.js';
import { ExerciseNavigationButton } from './ExerciseNavigationButton.jsx';
import { NavigationChevron } from './NavigationChevron.jsx';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import './exercisePr.css';

export function ExercisePrSheet({ exercise, workouts, units, e1rmEligible, Header, close, onHistory }) {
  const details = activeExercisePrDetails(workouts, exercise, { e1rmEligible });
  const unit = weightUnit(units);
  const { record, previous } = details || {};
  const estimate = record?.e1rmPr;
  const weightPr = record?.weightPr;
  const title = estimate ? 'ESTIMATED 1RM' : weightPr ? 'WEIGHT PR' : 'REP PR';
  const value = !record ? null : estimate
    ? displayEstimatedOneRepMax(record.estimatedOneRepMax, units)
    : weightPr ? displayWeight(record.weight, units) : record.reps;
  const prior = !record ? null : estimate
    ? `${displayEstimatedOneRepMax(previous.estimatedOneRepMax, units)} ${unit}`
    : weightPr ? `${displayWeight(previous.weight, units)} ${unit}` : `${previous.repsAtWeight} reps`;
  return <main className="sheet exercise-pr-sheet">
    <Header title="Personal record" onClose={close}/>
    <div className="sheet-scroll">
      {!record ? <p>This record is no longer present in the current logged sets.</p> : <>
        <p className="eyebrow">{title}</p>
        <h1 className="exercise-pr-value">{value} <small>{estimate || weightPr ? unit : 'reps'}</small></h1>
        <p className="exercise-pr-name">{exerciseName(exercise)}</p>
        <dl className="exercise-pr-evidence">
          <div><dt>Logged set</dt><dd>{displayWeight(record.weight, units)} {unit} × {record.reps} reps</dd></div>
          <div><dt>{!estimate && !weightPr ? `Previous best at ${displayWeight(record.weight, units)} ${unit}` : 'Previous best'}</dt><dd>{prior}</dd></div>
        </dl>
        {estimate && <p className="exercise-pr-change">{estimatedOneRepMaxChangeLabel(record.estimatedOneRepMax - previous.estimatedOneRepMax, units)}</p>}
        {estimate && <p className="exercise-pr-explanation rook-selectable">Estimated from your logged set, not a tested maximum. {E1RM_FORMULA}; sets of 1–12 reps only, without RIR adjustment.</p>}
        <p className="exercise-pr-explanation rook-selectable">A personal record and progression are separate. Follow the workout’s progression guidance; this record does not change today’s targets.</p>
        {onHistory && <ExerciseNavigationButton className="exercise-pr-history" onClick={() => onHistory(exercise)}><span>View recorded history</span><NavigationChevron/></ExerciseNavigationButton>}
      </>}
    </div>
    <SheetActionFooter separate containViewport>
      <button type="button" className="button secondary" onClick={close}>{record ? 'CONTINUE TRAINING' : 'CLOSE'}</button>
    </SheetActionFooter>
  </main>;
}
