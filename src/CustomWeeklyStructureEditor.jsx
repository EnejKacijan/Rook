import React, { useId, useState } from 'react';
import { Disclosure } from './Disclosure.jsx';
import { NavigationChevron } from './NavigationChevron.jsx';
import { allMuscleFullBody, CUSTOM_FOCUSES } from './customTrainingStructure.js';
import { CUSTOM_WORKOUT_MUSCLES, customWorkoutConcepts, customWorkoutMuscles, replaceSavedWorkoutFocus, toggleCustomWorkoutFocus } from './customWeeklyWorkouts.js';
import './customWeeklyStructure.css';

export function CustomWeeklyStructureEditor({ workouts, frequency, onChange, error }) {
  const id = useId();
  const [expanded, setExpanded] = useState(() => Math.max(0, workouts.slice(0, frequency).findIndex(row => !row.focus.trim())));
  return (
    <fieldset className="custom-weekly-structure" aria-describedby={`${id}-hint${error ? ' custom-split-error' : ''}`}>
      <legend>Your {frequency} workouts</legend>
      <p id={`${id}-hint`}>{workouts.slice(0,frequency).some(row => allMuscleFullBody(customWorkoutConcepts(row.focus)))
        ? 'Full-body workouts use compound moves, with extra exercises spread across the week.'
        : 'Select one or more muscle groups for each workout.'}</p>
      <div className="custom-workout-blocks">
        {workouts.slice(0, frequency).map((workout, index) => {
          const selected = customWorkoutConcepts(workout.focus);
          const muscles = customWorkoutMuscles(workout.focus);
          const savedFocus = muscles === null;
          const selectedKeys = muscles || [];
          const summary = savedFocus ? selected?.map(key => CUSTOM_FOCUSES[key].label).join(' · ') || workout.focus
            : allMuscleFullBody(selectedKeys) ? 'Full Body · all muscle groups'
              : selectedKeys.length ? selectedKeys.map(key => CUSTOM_FOCUSES[key].label).join(' · ') : 'Choose muscle groups';
          const open = expanded === index;
          const blockId = `${id}-workout-${index}`;
          const toggle = key => onChange(index, toggleCustomWorkoutFocus(workout.focus, key));
          const choice = key => (
            <button type="button" className="custom-muscle-choice" key={key} data-focus={key}
              aria-pressed={selectedKeys.includes(key)} onClick={() => toggle(key)}>
              <span className="custom-muscle-check" aria-hidden="true">{selectedKeys.includes(key) ? '✓' : ''}</span>
              <span>{CUSTOM_FOCUSES[key].label}</span>
            </button>
          );
          return (
            <div className="custom-workout-block" role="group" aria-label={`Workout ${index + 1}`} key={index}>
              <button type="button" className="custom-workout-toggle" aria-expanded={open}
                aria-controls={`${blockId}-muscles`} onClick={() => setExpanded(open ? null : index)}>
                <span className="custom-workout-number" aria-hidden="true">{index + 1}</span>
                <span className="custom-workout-copy">
                  <strong>Workout {index + 1}{workout.weekday && <small>{workout.weekday}</small>}</strong>
                  <span title={summary}>{summary}</span>
                </span>
                <NavigationChevron className="custom-workout-chevron" />
              </button>
              <Disclosure open={open} id={`${blockId}-muscles`} revealOnOpen>
                <div className="custom-workout-picker" role="group" aria-label={`Muscle groups for workout ${index + 1}`}>
                  {savedFocus ? (
                    <div className="custom-workout-legacy">
                      <strong>Saved focus</strong>
                      <p>Already selected muscles are kept.</p>
                      <div className="custom-workout-legacy-actions">
                        <button type="button" className="custom-switch-focus" onClick={() => onChange(index, replaceSavedWorkoutFocus(workout.focus))}>Choose muscle groups</button>
                        <button type="button" className="custom-keep-focus" onClick={() => setExpanded(null)}>Keep saved focus</button>
                      </div>
                    </div>
                  ) : <div className="custom-muscle-choices">{CUSTOM_WORKOUT_MUSCLES.map(choice)}</div>}
                </div>
              </Disclosure>
            </div>
          );
        })}
      </div>
      {error && <p id="custom-split-error" className="custom-split-error" role="alert">{error}</p>}
    </fieldset>
  );
}
