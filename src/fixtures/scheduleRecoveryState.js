import { blankState, buildProgram, deserializeState } from '../domain.js';
import { flexiblePlanFingerprint } from '../flexibleWeek.js';

// Synthetic occurrence provenance for the physical report. No user data.
export function scheduleRecoveryState({ future = false, stale = true } = {}) {
  let state = blankState();
  Object.assign(state.profile, {
    goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 3,
    availableDays: ['Mon', 'Wed', 'Fri'], sessionMinutes: 60,
    equipment: ['full gym'], environment: 'Commercial gym', priorities: ['Balanced'],
    onboardingComplete: true, showExerciseImages: false,
  });
  state.program = buildProgram(state.profile);
  state.program.createdAt = '2026-10-05T10:00:00.000Z';
  state.program.trainingBlock.startDate = '2026-10-05';
  state.program.days.at(-1).name = 'NOGE B (FUNKCIJA)';
  state.selectedDate = '2026-10-14';
  state.selectedDay = 'Wed';
  state = deserializeState(state);
  const day = state.program.days.at(-1);
  const originalDate = future ? '2026-10-16' : '2026-10-09';
  const scheduledDate = future ? '2026-10-15' : '2026-10-06';
  const id = `${day.id}:${originalDate}`;
  state.flexibleWeek = { schemaVersion: 1, revision: 1, generation: 'synthetic-move', sessions: {
    [id]: { id, workoutId: day.id, name: day.name, originalDate, scheduledDate,
      skipped: false, blockId: state.program.trainingBlock.id, blockWeekNumber: future ? 2 : 1,
      planFingerprint: flexiblePlanFingerprint(state), updatedAt: '2026-10-05T11:00:00.000Z' },
  } };
  if (stale) state.program.days[0].name = 'Updated workout';
  return state;
}
