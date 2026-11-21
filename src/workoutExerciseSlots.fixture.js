import {completeWorkout, estimateWorkoutMinutes, exerciseCatalog, makeProgramExercise, startWorkout} from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';

export function benchWorkoutFixture() {
  const state = createReturningUserFixture(0);
  Object.assign(state.profile, {
    availableDays:['Mon','Thu'], daysPerWeek:2, restTimerEnabled:false,
    rampUpSetsEnabled:false, recommendedWarmupsEnabled:false, rirEnabled:true,
    appearancePreference:'dark', themePreference:'dark', showProgressionTips:true,
  });
  Object.assign(state.program, {source:'manual', userEdited:true, scheduleOrderEdited:true, includeRecommendedWarmups:false});
  delete state.program.trainingBlock;
  delete state.program.rotationStartDate;
  const bench = exerciseCatalog['barbell-bench-press'];
  state.program.days = [
    {weekday:'Mon', name:'Upper A', sets:3, weight:80},
    {weekday:'Thu', name:'Upper B', sets:2, weight:65},
  ].map(({weekday, name, sets, weight}, index) => {
    const exercise = makeProgramExercise(bench, state.profile);
    exercise.id = `bench-upper-${index}`;
    Object.assign(exercise, {repMin:5, repMax:6, targetRir:2});
    exercise.sets = Array.from({length:sets}, (_, setIndex) => ({
      id:`${exercise.id}-set-${setIndex}`, reps:5, weight, weightProvenance:'explicit-plan', rir:null, completed:false,
    }));
    return {
      id:`bench-day-${index}`, weekday, type:'workout', name, nameEdited:true,
      workoutName:name, location:'Commercial gym', exercises:[exercise], warmupPlan:{mode:'none'},
    };
  });
  for (const day of state.program.days)
    day.estimatedMinutes = estimateWorkoutMinutes(day, state.profile, state.program);
  state.ai.planUpgradeDismissed = true;
  return state;
}

export function logBenchWorkout(state, dayIndex, date, weight, reps, {deload = false, ...metadata} = {}) {
  const day = state.program.days[dayIndex];
  const activeWorkout = startWorkout({...state, selectedDay:day.weekday, selectedDate:date}, day);
  const endedAt = new Date(`${date}T12:00:00`).getTime();
  Object.assign(activeWorkout, {
    startedAt:endedAt - 25 * 60000,
    workoutDateKey:date, canonicalPlanDate:date,
    logicalSessionId:`${day.id}:${date}`, sourcePlanSlotId:`${day.id}:${date}`,
    ...(deload ? {trainingBlock:{phase:'deload', plannedDeload:true}} : {}),
  });
  for (const [index, set] of activeWorkout.exercises[0].sets.entries()) {
    Object.assign(set, {weight, reps:reps[index], rir:2, completed:true, completedAt:endedAt});
  }
  const next = completeWorkout({...state, activeWorkout});
  Object.assign(next.workouts.at(-1), {completedAt:new Date(endedAt).toISOString(), endedAt, durationSeconds:1500, ...metadata});
  return next;
}

export function benchWorkoutHistory(state = benchWorkoutFixture()) {
  state = logBenchWorkout(state, 0, '2026-11-09', 80, [6, 6, 6]);
  state = logBenchWorkout(state, 1, '2026-11-12', 65, [5, 5]);
  state = logBenchWorkout(state, 0, '2026-11-16', 80, [6, 6, 6]);
  return logBenchWorkout(state, 1, '2026-11-19', 65, [6, 5]);
}
