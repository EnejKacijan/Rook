import {it,expect,vi,afterEach} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {createManualTodayPreparation,applyTodayAdjustment} from './adjustToday.js';
import {adaptedTemplateForToday,startWorkout,completeWorkout,serializeState,deserializeState} from './domain.js';
afterEach(()=>vi.useRealTimers());
const fixture=()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-21T12:00:00'));return createReturningUserFixture(0);};
it('applies only the occurrence, survives reload, and is consumed without starting a timer during preparation',()=>{
 const state=fixture(),before=structuredClone(state),draft=createManualTodayPreparation(state);
 const [a,b,...rest]=draft.workout.exercises;draft.workout.exercises=[b,a,...rest];draft.workout.exercises[0].repMin=5;
 expect(state).toEqual(before);const applied=applyTodayAdjustment(state,draft);expect(applied.status).toBe('applied');
 expect(applied.state.activeWorkout).toBeNull();expect(applied.state.program).toEqual(before.program);expect(applied.state.workouts).toEqual(before.workouts);
 const restored=deserializeState(serializeState(applied.state),{strict:true}),prepared=adaptedTemplateForToday(restored);
 expect(prepared.exercises.map(e=>e.id)).toEqual(draft.workout.exercises.map(e=>e.id));
 expect(startWorkout(restored,prepared).exercises[0].exerciseId).toBe(b.exerciseId);
 const second=createManualTodayPreparation(restored);second.workout.exercises.pop();
 expect(restored.todayAdaptation.workout.exercises).toHaveLength(draft.workout.exercises.length);
});
it('rejects stale drafts, other dates, active sessions and completed occurrences',()=>{
 const state=fixture(),draft=createManualTodayPreparation(state),applied=applyTodayAdjustment(state,draft).state;
 expect(applyTodayAdjustment(applied,draft).status).toBe('conflict');
 expect(()=>createManualTodayPreparation(state,'2026-09-22')).toThrow();
 const active={...state,activeWorkout:startWorkout(state,state.program.days[0])};expect(()=>createManualTodayPreparation(active)).toThrow();
 expect(applyTodayAdjustment(active,draft).status).toBe('conflict');
 active.activeWorkout.exercises.forEach(e=>e.sets.forEach(s=>s.completed=true));
 const completed=completeWorkout(active);expect(()=>createManualTodayPreparation(completed)).toThrow();
 expect(applyTodayAdjustment(completed,draft).status).toBe('conflict');
});
