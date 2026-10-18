import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {combineExample} from './combineWorkouts.fixture.js';
import {combineWorkoutDiscovery} from './combineWorkoutDiscovery.js';
import {coachCombineReply} from './coachCombine.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));});
afterEach(()=>vi.useRealTimers());
it('discovers a canonical missed pair without changing training state',()=>{
 const state=combineExample(),before=structuredClone(state);
 expect(combineWorkoutDiscovery(state)).toEqual({available:true,hasMissed:true});
 expect(state).toEqual(before);
});
it('also supports planned pairs without advertising a missed-workout hint',()=>{
 vi.setSystemTime(new Date('2026-09-07T08:00:00'));
 const state=combineExample();
 expect(combineWorkoutDiscovery(state)).toEqual({available:true,hasMissed:false});
});
it.each(['activeWorkout','activeOptionalSession','todayAdaptation'])('does not advertise combining during %s',field=>{
 const state=combineExample();state[field]={id:'already-in-progress'};
 expect(combineWorkoutDiscovery(state).available).toBe(false);
});
it('hides entry points while another Coach workflow owns the conversation',()=>{
 const state=combineExample();state.activeCoachConversationId='current';
 state.conversations=[{id:'pending',conversationId:'current',reply:{text:'Review this first',action:{type:'week-schedule-change'}}}];
 expect(combineWorkoutDiscovery(state)).toEqual({available:false,hasMissed:false,reason:'coach-workflow'});
});
it('does not advertise unsupported source pairs or a missing plan',()=>{
 const state=combineExample();state.program.days.forEach(day=>day.warmupPlan={mode:'custom',items:[]});
 expect(combineWorkoutDiscovery(state).available).toBe(false);
 state.program=null;expect(combineWorkoutDiscovery(state).available).toBe(false);
});
it('keeps a recoverable imported source match as a valid next step',()=>{
 const state=combineExample(),exercise=state.program.days[0].exercises[0];
 exercise.exerciseId='imported-custom-press';exercise.importedName='Incline DB press';
 exercise.importedExercise={id:exercise.exerciseId,name:exercise.importedName};
 expect(combineWorkoutDiscovery(state).available).toBe(true);
});
it('revalidates live state and refuses a historical entry date',()=>{
 const state=combineExample();expect(combineWorkoutDiscovery(state).available).toBe(true);
 state.todayAdaptation={id:'new-adjustment'};expect(combineWorkoutDiscovery(state).available).toBe(false);
 delete state.todayAdaptation;expect(combineWorkoutDiscovery(state,'2026-09-11').available).toBe(false);
});
it('an explicit shortcut always opens canonical source choices without guessing or an intent request',async()=>{
 const state=combineExample(),before=structuredClone(state),interpret=vi.fn();
 const reply=await coachCombineReply(state,'Combine two workouts',{selection:{step:'sources'},interpret});
 expect(reply.combineRequest.step).toBe('sources');expect(reply.combineRequest.choices.length).toBeGreaterThanOrEqual(2);
 expect(reply.combineRequest.sourceIds).toEqual([]);expect(reply.action).toBeNull();
 expect(interpret).not.toHaveBeenCalled();expect(state).toEqual(before);
});
