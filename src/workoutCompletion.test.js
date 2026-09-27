import {beforeEach, afterEach, expect, it, vi} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout, completeWorkout, plannedWorkoutForDate, serializeState, deserializeState, progressionFor, previousExercise, saveState, STORAGE_KEY} from './domain.js';
import {addFreestyleExercise, startFreestyleWorkout} from './freestyleWorkout.js';
import {completeWorkoutReversibly, canContinueWorkout, continueWorkout} from './workoutCompletion.js';
import {calendarDayPresentation} from './workoutCalendar.js';
import {completionRecognition} from './completionRecognition.js';
import {createHistoryCorrection, saveHistoryCorrection} from './historyCorrection.js';
import {prescribeTrainingBlockWorkout} from './trainingBlocks.js';
import {flexibleOccurrenceForDate, flexibleSessionLifecycle} from './flexibleWeek.js';
import {forgetStorageSession} from './localStateStorage.js';

beforeEach(() => {vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T12:00:00'));});
afterEach(() => vi.useRealTimers());
function fixture(kind = 'planned', partial = false) {
  let state = createReturningUserFixture(0);
  state.selectedDate = '2026-09-21';
  if (kind === 'freestyle') {
    state = addFreestyleExercise(startFreestyleWorkout(state), 'barbell-bench-press');
    state = addFreestyleExercise(state, 'pull-up');
  } else state.activeWorkout = startWorkout(state, plannedWorkoutForDate(state, state.selectedDate));
  const active = state.activeWorkout;
  active.startedAt -= 600000;
  active.exerciseIndex = 1;
  active.sessionNote = 'Same session';
  active.exercises.forEach((exercise, i) => exercise.sets.forEach((set, j) =>
    Object.assign(set, {weight: exercise.loadRequirement === 'none' ? null : 52.5, reps: 8, rir: 2, completed: !partial || i === 0 && j === 0})));
  return state;
}

it.each(['planned', 'freestyle'])('atomically restores the exact %s session, incomplete work and restart baseline', kind => {
  const before = fixture(kind, true), untouched = structuredClone(before);
  const {state, reversal} = completeWorkoutReversibly(before);
  expect(before).toEqual(untouched);
  expect(state.activeWorkout).toBeNull(); expect(state.workouts).toHaveLength(1);
  expect(state.workouts[0].restartSnapshot).toBeUndefined();
  if (kind === 'freestyle') expect(state.workouts[0].exercises.length).toBeLessThan(before.activeWorkout.exercises.length);
  const restored = continueWorkout(state, reversal);
  expect(restored.activeWorkout).toEqual(before.activeWorkout);
  expect(restored.workouts).toEqual(before.workouts); expect(restored.program).toEqual(before.program);
  expect(continueWorkout(restored, reversal)).toBe(restored);
  expect(calendarDayPresentation(restored, ['2026-09-21'])['2026-09-21'].markers).toContain('active');
  expect(calendarDayPresentation(restored, ['2026-09-21'])['2026-09-21'].markers).not.toContain('completed');
});

it('preserves per-side, timed, bodyweight, unlogged values, notes, queue and duplicate-instance identity', () => {
  const before = fixture('freestyle', true);
  before.activeWorkout.exercises[1].loggingMode = 'per_side';
  Object.assign(before.activeWorkout.exercises[1].sets[0], {sides: {left: {reps: 7}, right: {reps: 6}}, weight: null, reps: null});
  before.activeWorkout.exercises.push({...structuredClone(before.activeWorkout.exercises[0]), id: 'timed-added-instance', measure: 'seconds', sets: [{id: 'timed-draft', reps: 42.5, weight: null, completed: false, added: true}]});
  before.activeWorkout.handledSupersetRestRounds = ['round-1'];
  before.activeWorkout.removedUpNextExercises = [{id: 'removed-instance'}];
  const {state, reversal} = completeWorkoutReversibly(before);
  expect(continueWorkout(state, reversal).activeWorkout).toEqual(before.activeWorkout);
});

it('finish / continue cycles accept new logged work and keep exactly one final record', () => {
  let current = fixture('freestyle', true);
  const id = current.activeWorkout.id, start = current.activeWorkout.startedAt;
  for (let i = 0; i < 3; i++) {
    const {state, reversal} = completeWorkoutReversibly(current);
    expect(state.workouts).toHaveLength(1);
    current = continueWorkout(state, reversal);
    expect(current.activeWorkout.id).toBe(id); expect(current.activeWorkout.startedAt).toBe(start);
    current.activeWorkout.exercises[0].sets.push({id: `extra-${i}`, added: true, completed: true, reps: 9, weight: 55, rir: 1});
  }
  const final = completeWorkoutReversibly(current).state;
  expect(final.workouts).toHaveLength(1);
  expect(final.workouts[0].exercises[0].sets.filter(set => set.completed)).toHaveLength(4);
});

it('removes by exact identity while other completed workouts on the same date remain untouched', () => {
  const a = completeWorkout(fixture());
  const before = fixture('freestyle', true); before.workouts = a.workouts;
  const {state, reversal} = completeWorkoutReversibly(before);
  expect(state.workouts).toHaveLength(2);
  expect(continueWorkout(state, reversal).workouts).toEqual(a.workouts);
});

it('keeps both early-start source occurrence and actual performed date', () => {
  const before = fixture();
  before.selectedDate = '2026-09-22';
  before.activeWorkout = startWorkout({...before, activeWorkout: null}, plannedWorkoutForDate(before, before.selectedDate));
  before.activeWorkout.exercises[0].sets[0].completed = true;
  const {state, reversal} = completeWorkoutReversibly(before), restored = continueWorkout(state, reversal);
  expect(restored.activeWorkout).toEqual(before.activeWorkout);
  expect(restored.activeWorkout.canonicalPlanDate).toBe('2026-09-22');
  expect(restored.activeWorkout.workoutDateKey).toBe('2026-09-21');
  expect(flexibleSessionLifecycle(restored,flexibleOccurrenceForDate(restored,'2026-09-22')).status).toBe('active');
  expect(restored.selectedDate).toBe('2026-09-21');
  const presentation = calendarDayPresentation(restored, ['2026-09-21','2026-09-22']);
  expect(presentation['2026-09-21'].markers).toContain('active');
  expect(presentation['2026-09-22'].markers).not.toContain('completed');
});

it.each(['running', 'expired', 'pending'])('preserves truthful elapsed time and handles %s rest without restarting it', kind => {
  const before = fixture();
  before.activeWorkout.rest = kind === 'pending' ? {pending: true, seconds: 90} : {endsAt: Date.now() + 60000, seconds: 90};
  const {state, reversal} = completeWorkoutReversibly(before);
  vi.advanceTimersByTime(kind === 'expired' ? 90000 : 20000);
  const restored = continueWorkout(state, reversal);
  expect(restored.activeWorkout.startedAt).toBe(before.activeWorkout.startedAt);
  expect(Date.now() - restored.activeWorkout.startedAt).toBe(kind === 'expired' ? 690000 : 620000);
  expect(restored.activeWorkout.rest).toEqual(kind === 'expired' ? null : before.activeWorkout.rest);
});

it('carries completion note and feedback back without invalidating eligibility', () => {
  const {state, reversal} = completeWorkoutReversibly(fixture());
  Object.assign(state.workouts[0], {sessionNote: 'New note', sessionFeedback: 'about_right'});
  state.ai.available = true; state.selectedDate = '2026-09-22';
  expect(canContinueWorkout(state, reversal)).toBe(true);
  expect(continueWorkout(state, reversal).activeWorkout).toMatchObject({sessionNote: 'New note', sessionFeedback: 'about_right'});
});

it.each(['active', 'optional-active', 'deleted', 'corrected', 'photo', 'plan', 'schedule', 'history-added'])('refuses stale/conflicting %s state without changing it', kind => {
  const {state, reversal} = completeWorkoutReversibly(fixture());
  if (kind === 'active') state.activeWorkout = {...reversal.activeWorkout, id: 'newer-session'};
  if (kind === 'optional-active') state.activeOptionalSession = {id: 'newer-cardio'};
  if (kind === 'deleted') state.workouts = [];
  if (kind === 'photo') state.workouts[0].photoId = 'completion-owned-photo';
  if (kind === 'corrected') {const draft = createHistoryCorrection(state.workouts[0]); draft.workout.exercises[0].sets[0].reps++; Object.assign(state, saveHistoryCorrection(state, draft).state);}
  if (kind === 'plan') state.program.days[0].name = 'Changed plan';
  if (kind === 'schedule') state.workoutOccurrenceOverrides = {changed: true};
  if (kind === 'history-added') state.workouts.push({...structuredClone(state.workouts[0]), id: 'another-completion'});
  expect(canContinueWorkout(state, reversal)).toBe(false);
  expect(continueWorkout(state, reversal)).toBe(state);
});

it('reload persists truthful completion only, never a permanent reopening capability', () => {
  const {state,reversal} = completeWorkoutReversibly(fixture());
  const reloaded = deserializeState(serializeState(state));
  expect(reloaded.activeWorkout).toBeNull(); expect(reloaded.workouts).toHaveLength(1);
  expect(serializeState(state)).not.toContain('"reversal"');
  expect(canContinueWorkout(reloaded, null)).toBe(false);
  const continued=continueWorkout(state,reversal),resumed=deserializeState(serializeState(continued));
  expect(resumed.workouts).toHaveLength(0);
  expect(resumed.activeWorkout.id).toBe(continued.activeWorkout.id);
  expect(resumed.activeWorkout.startedAt).toBe(continued.activeWorkout.startedAt);
  expect(resumed.activeWorkout.exerciseIndex).toBe(continued.activeWorkout.exerciseIndex);
  expect(resumed.activeWorkout.exercises).toEqual(continued.activeWorkout.exercises);
});

it('the shared durable writer refuses a newer active session saved by another tab',()=>{
  localStorage.clear();forgetStorageSession(localStorage);
  try {
    const {state,reversal}=completeWorkoutReversibly(fixture());
    expect(saveState(state)).toBe(true);
    const other={...structuredClone(state),activeWorkout:{...fixture().activeWorkout,id:'other-tab-session'}};
    localStorage.setItem(STORAGE_KEY,serializeState(other));
    expect(saveState(continueWorkout(state,reversal))).toBe(false);
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(saved.activeWorkout.id).toBe('other-tab-session');expect(saved.workouts).toHaveLength(1);
  }finally{localStorage.clear();forgetStorageSession(localStorage);}
});

it('reverses block advancement and the completed-block archive without changing its prescriptions', () => {
  let before = createReturningUserFixture(0);
  const block = before.program.trainingBlock;
  block.currentWeek = block.totalWeeks;
  for (const day of before.program.days.slice(0,-1)) {
    before.activeWorkout = startWorkout(before, prescribeTrainingBlockWorkout(before, day));
    before.activeWorkout.exercises.forEach(e => e.sets.forEach(s => s.completed = true));
    before = completeWorkout(before);
  }
  before.activeWorkout = startWorkout(before, prescribeTrainingBlockWorkout(before, before.program.days.at(-1)));
  before.activeWorkout.exercises.forEach(e => e.sets.forEach(s => s.completed = true));
  const snapshot = structuredClone(before);
  const {state, reversal} = completeWorkoutReversibly(before);
  expect(state.program.trainingBlock.completed).toBe(true); expect(state.completedTrainingBlocks).toHaveLength(1);
  const restored = continueWorkout(state, reversal);
  expect(restored.program).toEqual(snapshot.program); expect(restored.completedTrainingBlocks).toEqual(snapshot.completedTrainingBlocks);
  const final = completeWorkoutReversibly(restored).state;
  expect(final.completedTrainingBlocks).toHaveLength(1); expect(final.workouts).toHaveLength(before.workouts.length + 1);
});

it('reverses optional-session completion and repeat/combined adaptation cleanup', () => {
  for (const mode of ['repeat','combine']) {
    const before = fixture();
    before.todayAdaptation = {id:'adaptation', schemaVersion:1, mode}; before.activeWorkout.adjustment = structuredClone(before.todayAdaptation);
    before.activeWorkout.optionalSessionId = 'optional-1'; before.optionalSessions = [{id:'optional-1', status:'active', completedAt:null}];
    const {state, reversal} = completeWorkoutReversibly(before);
    expect(state.optionalSessions[0].status).toBe('completed');
    expect(state.todayAdaptation).toBeNull();
    const restored = continueWorkout(state, reversal);
    expect(restored.optionalSessions).toEqual(before.optionalSessions); expect(restored.todayAdaptation).toEqual(before.todayAdaptation);
  }
});

it('history-derived progression, working weights, PRs and milestone counts revert and award only one final credit', () => {
  const before = fixture();
  const exercise = before.activeWorkout.exercises[0];
  before.workouts = Array.from({length:9}, (_,i) => ({id:`prior-${i}`, completedAt:'2026-09-20T10:00:00Z', workoutDateKey:'2026-09-20', exercises:[{...structuredClone(exercise), sets:exercise.sets.map(s => ({...s, weight:20}))}]}));
  const progression = progressionFor(exercise, before.workouts, before.profile), previous = previousExercise(before.workouts, exercise.exerciseId);
  const {state, reversal} = completeWorkoutReversibly(before);
  expect(completionRecognition(state.workouts.at(-1),before.workouts)).toMatchObject({type:'milestone', count:10});
  expect(completionRecognition(state.workouts.at(-1),before.workouts,{eligible:()=>true})).toMatchObject({type:'pr'});
  const restored = continueWorkout(state, reversal);
  expect(restored.workouts).toHaveLength(9);
  expect(progressionFor(exercise,restored.workouts,restored.profile)).toEqual(progression);
  expect(previousExercise(restored.workouts,exercise.exerciseId)).toEqual(previous);
  const final = completeWorkoutReversibly(restored).state;
  expect(final.workouts).toHaveLength(10);
  expect(completionRecognition(final.workouts.at(-1),restored.workouts)).toMatchObject({type:'milestone',count:10});
});
