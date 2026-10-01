import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createTodayScheduleReader} from './todayScheduleReader.js';
import {adjustWeekState} from './fixtures/adjustWeekState.js';
import {plannedWorkoutForDate,startWorkout} from './domain.js';
import {addCalendarDays,proposeFlexibleWeek,applyFlexibleWeek} from './flexibleWeek.js';
import {canUseWorkoutToday} from './useWorkoutToday.js';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-29T12:00:00'));});
afterEach(()=>vi.useRealTimers());
it('reuses canonical date reads without persisting or mutating state, with a bounded cache',()=>{
 const state=adjustWeekState(),before=structuredClone(state),reader=createTodayScheduleReader(state);
 const first=reader.read('2026-09-29');
 expect(first.template).toEqual(plannedWorkoutForDate(state,'2026-09-29'));
 expect(first.occurrence.originalDate).toBe('2026-09-28');
 expect(reader.read('2026-09-29')).toBe(first);
 expect(reader.next('2026-10-04')).toBe(reader.next('2026-10-04'));
 for(let i=1;i<66;i++)reader.read(addCalendarDays('2026-09-29',i));
 expect(reader.read('2026-09-29')).not.toBe(first);expect(state).toEqual(before);
});
it('a new schedule revision replaces the projection and resolves fresh source/destination ownership',()=>{
 const state=adjustWeekState(),reader=createTodayScheduleReader(state);
 const before=reader.read('2026-09-29');
 const proposal=proposeFlexibleWeek(state,{mode:'available',availableDates:[1,2,3,4,5].map(i=>addCalendarDays('2026-09-29',i))});
 const next=applyFlexibleWeek(state,proposal).state,fresh=createTodayScheduleReader(next);
 expect(fresh.read('2026-09-29').template).toBeNull();
 expect(fresh.read('2026-09-30').template.logicalSessionId).toBe(before.template.logicalSessionId);
 expect(reader.read('2026-09-29')).toBe(before);
});
it('new active/completed identities invalidate occurrence presentation without rewriting the plan',()=>{
 const state=adjustWeekState(),first=createTodayScheduleReader(state).read('2026-09-29');
 const active={...state,activeWorkout:startWorkout(state,first.template)};
 expect(createTodayScheduleReader(active).read('2026-09-29').occurrence.status).toBe('active');
 const done={...active,activeWorkout:null,workouts:[{...active.activeWorkout,completedAt:Date.now()}]};
 expect(createTodayScheduleReader(done).read('2026-09-29').occurrence.status).toBe('completed');
 expect(done.program).toBe(state.program);
});
it('caches only menu eligibility and recomputes it when active ownership changes',()=>{
 const state=adjustWeekState(),reader=createTodayScheduleReader(state);
 const request={sessionId:reader.read('2026-09-30').template.logicalSessionId};
 expect(reader.canUseToday(request)).toBe(canUseWorkoutToday(state,request));
 const clone=vi.spyOn(globalThis,'structuredClone');
 reader.canUseToday({...request});expect(clone).not.toHaveBeenCalled();clone.mockRestore();
 const active={...state,activeWorkout:startWorkout(state,reader.read('2026-09-29').template)};
 expect(createTodayScheduleReader(active).canUseToday(request)).toBe(false);
});
it('caches the full canonical date projection for moved-away rest presentation without another scheduling authority',()=>{
 const state=adjustWeekState(),before=structuredClone(state),reader=createTodayScheduleReader(state);
 const occurrences=reader.occurrences('2026-09-29');expect(reader.occurrences('2026-09-29')).toBe(occurrences);
 expect(occurrences.some(item=>item.scheduledDate==='2026-09-29')).toBe(true);expect(state).toEqual(before);
 const source=reader.read('2026-09-29').occurrence.logicalSessionId;
 const next=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:source,toDate:'2026-10-04'})).state;
 const fresh=createTodayScheduleReader(next).occurrences('2026-09-29');
 expect(fresh).not.toBe(occurrences);expect(fresh.some(item=>item.logicalSessionId===source)).toBe(false);
 expect(createTodayScheduleReader(next).occurrences('2026-10-04').some(item=>item.logicalSessionId===source)).toBe(true);
});
