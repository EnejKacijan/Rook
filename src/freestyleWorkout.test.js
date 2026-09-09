import { describe, it, expect } from 'vitest';
import { blankState, buildProgram, startWorkout, completeWorkout, previousExercise, deserializeState, consistencyForCurrentWeek, exerciseName, exerciseMeasure, exerciseLoadRequirement, exerciseCatalog, isoDay, weekday } from './domain.js';
import { createCustomExercise } from './customExercises.js';
import { buildBackupArchive, parseBackupArchive } from './backup.js';
import { calendarDayStates } from './workoutCalendar.js';
import { weeklyPerformanceReview } from './performanceInsights.js';
import { startFreestyleWorkout, addFreestyleExercise, removeFreestyleExercise, copyFreestylePrevious, freestyleCatalog, cancelUnloggedFreestyle } from './freestyleWorkout.js';

function fixture() {
  const state = blankState();
  Object.assign(state.profile, { goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 3, availableDays: [weekday(), 'Wed', 'Fri'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true });
  state.program = buildProgram(state.profile);
  state.selectedDate = isoDay();
  return state;
}
const add = state => addFreestyleExercise(state, 'barbell-bench-press');
describe('freestyle sessions', () => {
  it('removes the current unlogged exercise without changing other work or history', () => {
    let state = add(startFreestyleWorkout(fixture()));
    state = addFreestyleExercise(state, 'dumbbell-bench-press');
    state.activeWorkout.exerciseIndex = 1;
    const before = structuredClone(state);
    const next = removeFreestyleExercise(state, state.activeWorkout.exercises[1].id);
    expect(next.activeWorkout.exerciseIndex).toBe(0);
    expect(next.activeWorkout.exercises).toEqual([before.activeWorkout.exercises[0]]);
    expect(next.activeWorkout.id).toBe(before.activeWorkout.id);
    expect(next.workouts).toEqual(before.workouts);
    expect(next.program).toEqual(before.program);
    const empty = removeFreestyleExercise(next, next.activeWorkout.exercises[0].id);
    expect(empty.activeWorkout.exercises).toEqual([]);
    expect(empty.activeWorkout.exerciseIndex).toBe(0);
    expect(empty.activeWorkout.id).toBe(before.activeWorkout.id);
  });
  it('starts empty on actual today with no schedule ownership and survives reload', () => {
    const source = fixture(); source.selectedDate = '2020-01-01';
    const state = startFreestyleWorkout(source);
    expect(state.program).toEqual(source.program);
    expect(state.activeWorkout.exercises).toEqual([]);
    expect(state.activeWorkout.workoutDateKey).toBe(isoDay());
    expect(state.activeWorkout.programDayId).toBeNull();
    expect(state.activeWorkout.trainingBlock).toBeUndefined();
    expect(deserializeState(JSON.stringify(state)).activeWorkout).toEqual(state.activeWorkout);
  });
  it('prevents concurrent strength and optional sessions', () => {
    expect(() => startFreestyleWorkout(startFreestyleWorkout(fixture()))).toThrow();
    expect(() => startFreestyleWorkout({ ...fixture(), activeOptionalSession: {} })).toThrow();
  });
  it('starts with one blank set; duplicate adds are idempotent and plan unchanged', () => {
    const source = startFreestyleWorkout(fixture()); const state = add(source);
    expect(state.activeWorkout.exercises).toHaveLength(1);
    expect(state.activeWorkout.exercises[0].sets[0]).toMatchObject({ weight: null, reps: null, rir: null, completed: false });
    expect(add(state)).toBe(state);
    expect(state.program).toEqual(source.program);
  });
  it('appends without changing any existing exercise, timer, start or rest', () => {
    const state = add(startFreestyleWorkout(fixture()));
    const active = state.activeWorkout;
    active.rest = { endsAt: Date.now() + 90000, seconds: 90 };
    Object.assign(active.exercises[0].sets[0], { weight: 80, reps: 8, completed: true, setType: 'drop', segments: [{ reps: 5, weight: 60 }] });
    const next = addFreestyleExercise(state, 'dumbbell-bench-press');
    expect(next.activeWorkout.exercises[0]).toEqual(active.exercises[0]);
    expect(next.activeWorkout.rest).toEqual(active.rest);
    expect(next.activeWorkout.startedAt).toBe(active.startedAt);
    expect(next.activeWorkout.exerciseIndex).toBe(0);
    expect(removeFreestyleExercise(state, active.exercises[0].id)).toBe(state);
  });
  it('removes only unlogged work and cancels without history or plan mutation', () => {
    const state = add(startFreestyleWorkout(fixture()));
    const next = removeFreestyleExercise(state, state.activeWorkout.exercises[0].id);
    expect(next.activeWorkout.exercises).toEqual([]);
    expect(cancelUnloggedFreestyle(next).activeWorkout).toBeNull();
    expect(next.workouts).toEqual([]);
    expect(next.program).toEqual(state.program);
    expect(completeWorkout(state)).toBe(state);
  });
  it('uses global previous values only on explicit copy, RIR remains actual/unset', () => {
    let state = add(startFreestyleWorkout(fixture()));
    const exercise = state.activeWorkout.exercises[0];
    state.workouts.push({ id: 'previous', completedAt: new Date().toISOString(), exercises: [{ ...structuredClone(exercise), sets: [{ weight: 80, reps: 8, rir: 1, completed: true }] }] });
    expect(exercise.sets[0].weight).toBeNull();
    state = copyFreestylePrevious(state, exercise.id, exercise.sets[0].id, 0);
    expect(state.activeWorkout.exercises[0].sets[0]).toMatchObject({ weight: 80, reps: 8, rir: null, completed: false });
  });
  it('finishes into global history but does not advance blocks or scheduled consistency', () => {
    let state = add(startFreestyleWorkout(fixture()));
    state = addFreestyleExercise(state, 'dumbbell-bench-press');
    Object.assign(state.activeWorkout.exercises[0].sets[0], { weight: 80, reps: 8, completed: true });
    const before = structuredClone(state);
    state = completeWorkout(state);
    expect(state.program).toEqual(before.program);
    expect(state.flexibleWeek).toEqual(before.flexibleWeek);
    expect(state.workouts.at(-1).exercises).toHaveLength(1);
    expect(state.workouts.at(-1).source).toBe('freestyle');
    expect(previousExercise(state.workouts, 'barbell-bench-press').sets[0].weight).toBe(80);
    expect(consistencyForCurrentWeek(state).completed).toBe(0);
    expect(weeklyPerformanceReview(state)).toMatchObject({ completed: 0, freestyleCompleted: 1, completedSets: 1, empty: false });
    const scheduled = startWorkout(state, { ...state.program.days[0], exercises: [before.activeWorkout.exercises[0]] });
    expect(scheduled.exercises[0].sets[0].weight).toBe(80);
    expect(scheduled.exercises[0].sets[0].completed).toBe(false);
  });
  it('enforces current equipment at both picker and append boundaries', () => {
    const state = startFreestyleWorkout(fixture());
    state.profile.equipment = ['bodyweight']; state.profile.environment = 'Home gym';
    state.gymProfiles = []; state.defaultGymProfileId = null;
    expect(freestyleCatalog(state).some(e => e.id === 'barbell-bench-press')).toBe(false);
    expect(() => add(state)).toThrow();
  });
  it('blocks unresolved safety and excludes an avoided exercise', () => {
    const state = fixture(); state.profile.avoid = 'My knee hurts';
    expect(() => startFreestyleWorkout(state)).toThrow();
    const safe = startFreestyleWorkout(fixture()); safe.profile.avoid = 'Avoid bench press';
    expect(freestyleCatalog(safe).some(e => e.id === 'barbell-bench-press')).toBe(false);
    expect(() => add(safe)).toThrow();
  });
  it('preserves blank timed input and user-entered short durations across reload', () => {
    let state = startFreestyleWorkout(fixture());
    const timed = freestyleCatalog(state).find(e => e.measure === 'seconds');
    state = addFreestyleExercise(state, timed.id);
    expect(exerciseMeasure(state.activeWorkout.exercises[0])).toBe('seconds');
    expect(deserializeState(JSON.stringify(state)).activeWorkout.exercises[0].sets[0].reps).toBeNull();
    state.activeWorkout.exercises[0].sets[0].reps = 8;
    expect(deserializeState(JSON.stringify(state)).activeWorkout.exercises[0].sets[0].reps).toBe(8);
  });
  it('keeps bodyweight and optional-load contracts instead of requiring invented weight', () => {
    const state = startFreestyleWorkout(fixture());
    const optional = freestyleCatalog(state).find(e => e.bodyweight && exerciseLoadRequirement(e) === 'optional');
    const next = addFreestyleExercise(state, optional.id);
    expect(exerciseLoadRequirement(next.activeWorkout.exercises[0])).toBe('optional');
    expect(next.activeWorkout.exercises[0].sets[0].weight).toBeNull();
  });
  it('supports existing custom identity and per-side history without losing semantics', () => {
    let state = fixture();
    const result = createCustomExercise(state, { name: 'My single arm press', equipment: ['dumbbells'], primaryMuscle: 'chest', pattern: 'horizontal-push', loggingType: 'weight_reps', loggingMode: 'per_side' });
    state = addFreestyleExercise(startFreestyleWorkout(state), result.exercise.id);
    const e = state.activeWorkout.exercises[0];
    expect(exerciseName(e)).toBe('My single arm press');
    expect(e.loggingMode).toBe('per_side');
    state.workouts.push({ completedAt: new Date().toISOString(), exercises: [{ ...structuredClone(e), sets: [{ completed: true, weight: 10, reps: 7, sides: { left: { reps: 7 }, right: { reps: 9 } } }] }] });
    const next = copyFreestylePrevious(state, e.id, e.sets[0].id, 0);
    expect(next.activeWorkout.exercises[0].sets[0].sides).toEqual({ left: { reps: 7 }, right: { reps: 9 } });
  });
  it('does not flatten advanced previous data or overwrite completed sets', () => {
    const state = add(startFreestyleWorkout(fixture())); const e = state.activeWorkout.exercises[0];
    state.workouts.push({ completedAt: new Date().toISOString(), exercises: [{ ...structuredClone(e), sets: [{ completed: true, setType: 'drop', weight: 80, reps: 8, segments: [{ weight: 60, reps: 5 }] }] }] });
    expect(copyFreestylePrevious(state, e.id, e.sets[0].id, 0)).toBe(state);
    delete state.workouts[0].exercises[0].sets[0].setType; delete state.workouts[0].exercises[0].sets[0].segments;
    e.sets[0].completed = true;
    expect(copyFreestylePrevious(state, e.id, e.sets[0].id, 0)).toBe(state);
    expect(cancelUnloggedFreestyle(state)).toBe(state);
  });
  it('never marks the scheduled calendar slot complete, even after multiple freestyles', () => {
    let state = fixture();
    for (let i = 0; i < 2; i++) {
      state = add(startFreestyleWorkout(state)); Object.assign(state.activeWorkout.exercises[0].sets[0], { weight: 80, reps: 8, completed: true }); state = completeWorkout(state);
    }
    expect(state.workouts).toHaveLength(2);
    expect(calendarDayStates(state, [isoDay()])[isoDay()]).toMatchObject({ planned: true, complete: false });
  });
  it('round-trips freestyle history through the unchanged backup format', async () => {
    let state = add(startFreestyleWorkout(fixture()));
    Object.assign(state.activeWorkout.exercises[0].sets[0], { weight: 80, reps: 8, completed: true });
    state = completeWorkout(state);
    const archive = await buildBackupArchive(state, []);
    const restored = await parseBackupArchive(archive.bytes);
    expect(restored.state.workouts[0].source).toBe('freestyle');
    expect(restored.state.workouts[0].exercises[0].sets[0].weight).toBe(80);
  });
});
