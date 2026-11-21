import {expect, it} from 'vitest';
import {deserializeState, serializeState, startWorkout} from './domain.js';
import {freestylePreviousSets} from './freestyleWorkout.js';
import {nextWorkoutAdvice} from './nextWorkoutAdvice.js';
import {selectProgressionRows} from './progressionOverview.js';
import {benchWorkoutFixture, benchWorkoutHistory, logBenchWorkout} from './workoutExerciseSlots.fixture.js';

const start = (state, index) => {
  const workout = startWorkout(state, state.program.days[index]);
  const exercise = workout.exercises[0];
  const current = {...state, activeWorkout:workout};
  return {
    exercise,
    previous:freestylePreviousSets(current, exercise),
    advice:nextWorkoutAdvice(exercise, state.workouts, state.profile, current),
  };
};
const loads = sets => sets.map(set => set.weight);

it('uses the first planned prescription for Upper B even when Upper A already logged the lift', () => {
  const state = logBenchWorkout(benchWorkoutFixture(), 0, '2026-11-09', 82.5, [6, 6, 6]);
  const {exercise, previous, advice} = start(state, 1);
  expect(loads(exercise.sets)).toEqual([65, 65]);
  expect(exercise.sets.map(set => set.reps)).toEqual([5, 5]);
  expect(previous).toEqual([]);
  expect(advice).toBeNull();
});

it('restores separate loads, sets and progression from alternating Bench Press sessions', () => {
  const state = deserializeState(serializeState(benchWorkoutHistory()), {strict:true});
  const upperA = start(state, 0);
  const upperB = start(state, 1);
  expect(loads(upperA.exercise.sets)).toEqual([80, 80, 80]);
  expect(loads(upperB.exercise.sets)).toEqual([65, 65]);
  expect(loads(upperA.previous)).toEqual([80, 80, 80]);
  expect(upperB.previous.map(set => set.reps)).toEqual([6, 5]);
  expect(upperA.advice).toMatchObject({type:'progress', weight:82.5, fromWeight:80});
  expect(upperB.advice).toMatchObject({type:'hold', title:'Build reps first'});
  const rows = selectProgressionRows(state);
  expect(rows.map(row => [row.exercise.exerciseId,row.slot.day.name,row.result.title])).toEqual([
    ['barbell-bench-press','Upper A','Ready to progress'],
    ['barbell-bench-press','Upper B','Build reps first'],
  ]);
});

it('uses the last actual load for the same workout rather than its initial planned weight or another workout', () => {
  let state = logBenchWorkout(benchWorkoutHistory(), 1, '2026-11-26', 67.5, [6, 5]);
  state = logBenchWorkout(state, 0, '2026-11-30', 82.5, [5, 5, 5]);
  const upperB = start(state, 1);
  expect(loads(upperB.exercise.sets)).toEqual([67.5, 67.5]);
  expect(loads(state.program.days[1].exercises[0].sets)).toEqual([65, 65]);
  expect(upperB.advice).toMatchObject({title:'Build reps first'});
});

it('follows a renamed and moved slot, keeps deload out of normal progression, and honors an edited starting load', () => {
  const state = logBenchWorkout(benchWorkoutHistory(), 1, '2026-11-26', 40, [6, 6], {deload:true});
  const day = state.program.days[1];
  day.weekday = 'Fri';
  day.name = day.workoutName = 'Upper recovery';
  expect(loads(start(state, 1).exercise.sets)).toEqual([65, 65]);
  expect(start(state, 1).advice).toMatchObject({title:'Build reps first'});
  day.exercises[0].sets.forEach(set => { set.weight = 60; });
  expect(loads(start(state, 1).exercise.sets)).toEqual([60, 60]);
  expect(start(state, 1).advice).toBeNull();
  expect(start(state, 0).advice).toMatchObject({weight:82.5});
});
