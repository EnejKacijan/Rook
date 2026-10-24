import React from 'react';
import { activeExercisePrDetails } from './performanceInsights.js';
import { exerciseRecordPresentation } from './exerciseRecords.js';
import { exerciseName } from './domain.js';
import { ExerciseNavigationButton } from './ExerciseNavigationButton.jsx';
import { NavigationChevron } from './NavigationChevron.jsx';
import { SheetActionFooter } from './SheetActionFooter.jsx';
import './exercisePr.css';

export function ExercisePrSheet({ exercise, workouts, units, e1rmEligible, Header, close, onHistory }) {
  const presentation = exerciseRecordPresentation(activeExercisePrDetails(workouts, exercise, { e1rmEligible }), units);
  return <main className="sheet exercise-pr-sheet">
    <Header title="Personal record" onClose={close}/>
    <div className="sheet-scroll">
      {!presentation ? <p>This record is no longer present in the current logged sets.</p> : <>
        <p className="eyebrow">{presentation.label}</p>
        <p className="exercise-pr-name">{exerciseName(exercise)}</p>
        <p className="exercise-pr-value-label">{presentation.valueLabel}</p>
        <h1 className="exercise-pr-value">{presentation.value}</h1>
        <p className="exercise-pr-change">{presentation.gain}</p>
        <dl className="exercise-pr-evidence">
          {presentation.kind === 'estimate' && <div><dt>Logged set</dt><dd>{presentation.setLabel}</dd></div>}
          <div><dt>{presentation.previousLabel}</dt><dd>{presentation.previousValue}</dd></div>
        </dl>
        {presentation.kind === 'estimate' && <p className="exercise-pr-explanation rook-selectable">Estimated from weight and reps using the Epley formula, not a tested maximum. Uses sets of 1–12 reps; RIR is not included.</p>}
        <p className="exercise-pr-explanation rook-selectable">Your workout targets stay the same.</p>
        {onHistory && <ExerciseNavigationButton className="exercise-pr-history" onClick={() => onHistory(exercise)}><span>View recorded history</span><NavigationChevron/></ExerciseNavigationButton>}
      </>}
    </div>
    <SheetActionFooter separate containViewport>
      <button type="button" className="button secondary" onClick={close}>{presentation ? 'CONTINUE TRAINING' : 'CLOSE'}</button>
    </SheetActionFooter>
  </main>;
}
