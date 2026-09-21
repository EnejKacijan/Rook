import {afterEach,expect,it,vi} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {currentWeekSchedule,workoutPerformedDate} from './domain.js';
import {completedWorkoutForOccurrence} from './flexibleWeek.js';
afterEach(()=>vi.useRealTimers());
it('historical QA workouts own their historical occurrences and truthful elapsed durations',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-23T12:00:00'));
 const state=createReturningUserFixture(3);
 expect(state.workouts).toHaveLength(12);
 for(const workout of state.workouts){
  const date=workoutPerformedDate(workout);
  expect(date<'2026-09-21').toBe(true);
  expect(workout.canonicalPlanDate).toBe(date);
  expect(workout.originalScheduledDate).toBe(date);
  expect(workout.logicalSessionId).toBe(`${workout.programDayId}:${date}`);
  expect(workout.sourcePlanSlotId).toBe(workout.logicalSessionId);
  expect(workout.endedAt-workout.startedAt).toBe(45*60*1000);
  expect(workout.durationSeconds).toBe(45*60);
 }
 expect(currentWeekSchedule(state).every(item=>!completedWorkoutForOccurrence(state,item))).toBe(true);
 for(const item of currentWeekSchedule(state,'2026-09-14'))expect(completedWorkoutForOccurrence(state,item)).not.toBeNull();
});
