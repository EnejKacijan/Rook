import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {createCoachDayContext,resolveCoachDayContext,coachActionMatchesDay,coachDayStarter} from './coachDayContext.js';
import {startWorkout,plannedWorkoutForDate} from './domain.js';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T12:00:00'));});
afterEach(()=>vi.useRealTimers());
it('retrieves the selected future date and exact occurrence rather than substituting today',()=>{
  const state=createReturningUserFixture(0),context=createCoachDayContext(state,'2026-10-24'),resolved=resolveCoachDayContext(state,context);
  expect(resolved.date).toBe('2026-10-24');expect(resolved.workout.id).toBe(state.program.days[3].id);
  expect(resolved.workout.exercises[0].exerciseId).toBe(state.program.days[3].exercises[0].exerciseId);
  expect(coachDayStarter(context)).toContain('24 October 2026');expect(context.originalDate).toBe('2026-10-24');
});
it('does not bind context to another profile or a similarly named replacement plan',()=>{
  const state=createReturningUserFixture(0),context=createCoachDayContext(state,'2026-10-24');
  expect(()=>resolveCoachDayContext({...state,profile:{...state.profile,id:'other'}},context)).toThrow('another profile');
  state.program.id='other-plan';expect(resolveCoachDayContext(state,context)).toMatchObject({changed:true,unresolved:true,workout:null});
});
it('a newly started or moved occurrence invalidates the old attached scope, even across midnight',()=>{
  const state=createReturningUserFixture(0),context=createCoachDayContext(state,'2026-10-24');
  vi.setSystemTime(new Date('2026-10-24T12:00:00'));expect(resolveCoachDayContext(state,context).date).toBe('2026-10-24');
  expect(resolveCoachDayContext(state,context).changed).toBe(false);
  state.selectedDate='2026-10-24';state.activeWorkout=startWorkout(state,plannedWorkoutForDate(state,'2026-10-24'));
  expect(resolveCoachDayContext(state,context)).toMatchObject({changed:true,workout:null});
});
it('keeps stale move identity as unconfirmed evidence, never a current prescription',()=>{
  const state=createReturningUserFixture(0),day=state.program.days[3],id=`${day.id}:2026-10-23`;
  state.flexibleWeek={schemaVersion:1,revision:1,sessions:{[id]:{id,workoutId:day.id,originalDate:'2026-10-23',scheduledDate:'2026-10-24',name:'Old name',planFingerprint:'stale',skipped:false}}};
  const context=createCoachDayContext(state,'2026-10-24'),resolved=resolveCoachDayContext(state,context);
  expect(context.workoutName).toBe('');expect(context.unresolved).toBe(true);expect(resolved.workout).toBeNull();expect(resolved.staleOccurrences[0].id).toBe(id);
});
it('rejects actions for another date/template and all mutations against unresolved context',()=>{
  const state=createReturningUserFixture(0),resolved=resolveCoachDayContext(state,createCoachDayContext(state,'2026-10-24'));
  const action={type:'adapt-today',programDayId:resolved.workout.id,targetDate:'2026-10-24'};
  expect(coachActionMatchesDay(action,resolved)).toBe(true);
  expect(coachActionMatchesDay({...action,targetDate:'2026-10-23'},resolved)).toBe(false);
  expect(coachActionMatchesDay({...action,programDayId:'other'},resolved)).toBe(false);
  expect(coachActionMatchesDay(action,{...resolved,unresolved:true})).toBe(false);
});
