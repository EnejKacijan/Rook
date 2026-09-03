import {
  blankState,
  buildProgram,
  completeWorkout,
  exerciseCatalog,
  isoDay,
  startWorkout,
  weekDate,
} from "./domain.js";

// Explicit QA-only fixture. Production startup never imports or seeds this state.
export function createReturningUserFixture(weeks = 6) {
  let state = blankState();
  state.profile = {
    ...state.profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 4,
    availableDays: ["Mon", "Tue", "Thu", "Sat"],
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Chest", "Back"],
    onboardingComplete: true,
  };
  state.program = buildProgram(state.profile);
  state.selectedDay = state.program.days[0].weekday;
  const now = new Date();
  for (let week = weeks; week > 0; week -= 1) {
    for (const day of state.program.days) {
      const date = weekDate(day.weekday, now);
      date.setDate(date.getDate() - week * 7);
      const active = startWorkout(state, day);
      active.startedAt = date.getTime() - 45 * 60 * 1000;
      const planDate = isoDay(date);
      active.workoutDateKey = planDate;
      active.canonicalPlanDate = planDate;
      active.sourcePlanSlotId = `${day.id}:${planDate}`;
      active.exercises.forEach((exercise, exerciseIndex) =>
        exercise.sets.forEach((set, setIndex) => {
          set.weight = exerciseCatalog[exercise.exerciseId]?.bodyweight
            ? null
            : 10 + exerciseIndex * 5 + (weeks - week) * exercise.defaultIncrement;
          set.reps = Math.min(
            exercise.repMax,
            exercise.repMin + (setIndex === 0 ? 2 : 1),
          );
          set.completed = true;
        }),
      );
      state.activeWorkout = active;
      state = completeWorkout(state);
      state.workouts.at(-1).completedAt = date.toISOString();
    }
  }
  return state;
}
