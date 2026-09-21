// Synthetic regression/review state only; never used by production startup.
import {blankState, buildProgram, isoDay, weekday, startWorkout, completeWorkout, deserializeState} from './domain.js';
import {flexibleSessions, proposeFlexibleWeek, applyFlexibleWeek} from './flexibleWeek.js';
import {startFreestyleWorkout, addFreestyleExercise} from './freestyleWorkout.js';

export function moveToTodayFixture(kind = 'freestyle') {
  let state = blankState();
  Object.assign(state.profile, {goal:'Build muscle', experience:'Intermediate', daysPerWeek:3,
    availableDays:['Mon','Wed','Fri'], sessionMinutes:60, equipment:['full gym'], environment:'Commercial gym',
    priorities:['Balanced'], onboardingComplete:true, showExerciseImages:false, restTimerEnabled:false});
  state.program = buildProgram(state.profile);
  state.program.trainingBlock.startDate = '2026-09-14'; state.program.createdAt = '2026-09-14T12:00:00';
  state.program.days.forEach(day => {day.name = day.weekday === 'Wed' ? 'FUNKCIONALNI DAN' : day.weekday === 'Mon' ? 'NOGE A (MOČ)' : 'UPPER B'; day.workoutName = day.name;});
  state.selectedDate = isoDay(); state.selectedDay = weekday(); state.ai.planUpgradeDismissed = true;
  state = deserializeState(state);
  if (['active-planned','completed-planned','planned'].includes(kind)) {
    const monday = flexibleSessions(state).find(item => item.originalDate === '2026-09-21');
    const result = applyFlexibleWeek(state, proposeFlexibleWeek(state, {mode:'move', sessionId:monday.logicalSessionId, toDate:isoDay()}));
    if (result.status !== 'applied') throw Error(result.error);
    state = result.state;
    if (kind !== 'planned') {
      const today = flexibleSessions(state).find(item => item.scheduledDate === isoDay());
      state.activeWorkout = startWorkout(state, today.workout);
      state.activeWorkout.exercises[0].sets[0].completed = true;
      if (kind === 'completed-planned') state = completeWorkout(state);
    }
  }
  if (kind === 'completed-freestyle') {
    state = addFreestyleExercise(startFreestyleWorkout(state), 'plank');
    Object.assign(state.activeWorkout.exercises[0].sets[0], {reps:30, completed:true});
    state = completeWorkout(state);
  }
  if (!['none','active-planned','planned'].includes(kind)) {
    state = addFreestyleExercise(addFreestyleExercise(startFreestyleWorkout(state), 'barbell-bench-press'), 'plank');
    state.activeWorkout.startedAt = Date.now() - 3420000;
    state.activeWorkout.exerciseIndex = 1;
    Object.assign(state.activeWorkout.exercises[0].sets[0], {weight:52.5, reps:12, rir:2, completed:true});
    Object.assign(state.activeWorkout.exercises[1].sets[0], {reps:45, rir:3});
    state.activeWorkout.sessionNote = 'Keep this freestyle session';
    state.activeWorkout.rest = {endsAt:Date.now()+90000, seconds:90};
  }
  return deserializeState(state);
}
export const moveToTodaySource = state => flexibleSessions(state).find(item => item.originalDate === '2026-09-23');
