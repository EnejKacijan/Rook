// Synthetic audit fixture only; never imported by production startup.
import { createReturningUserFixture } from './demoFixture.js';
import { deserializeState, startWorkout, isoDay } from './domain.js';

export function dataReliabilityFixture() {
  const state = createReturningUserFixture(2);
  Object.assign(state.profile, { name: 'Synthetic reliability fixture', units: 'lb', rirEnabled: true, appearancePreference: 'dark', themePreference: 'dark' });
  state.activeWorkout = startWorkout(state, state.program.days[0]);
  state.activeWorkout.exercises[0].sets[0] = { ...state.activeWorkout.exercises[0].sets[0], weight: 42.5, reps: 8, rir: 2, completed: true };
  state.activeWorkout.exercises[0].sets[1].weight = 45;
  state.activeWorkout.exercises[0].sets[1].reps = 9;
  state.activeWorkout.sessionNote = 'Synthetic pending session';
  state.conversations = [{ id: 'audit-message', conversationId: 'audit-day', date: isoDay(), createdAt: Date.now(), user: 'Synthetic Coach message', reply: { text: 'Synthetic response', action: null } }];
  state.activeCoachConversationId = 'audit-day';
  state.workouts[0].source = 'historical-import';
  state.workouts[0].sessionNote = 'Synthetic imported workout';
  state.workoutOccurrenceOverrides[`${state.program.days[0].id}:2026-09-14`] = { status: 'skipped', reason: 'Synthetic missed occurrence' };
  state.weekScheduleOverrides['2026-09-14'] = { [state.program.days[1].id]: '2026-09-16' };
  return deserializeState(state, { strict: true });
}
