import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,completeWorkout,completedWorkoutCanResume,resumeCompletedWorkout,workoutSetSummary,serializeState,deserializeState} from './domain.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-13T12:00:00'));});
afterEach(()=>vi.useRealTimers());
function emptyCompletion(){
 const state=createReturningUserFixture(0);state.activeWorkout=startWorkout(state,state.program.days[0]);
 Object.assign(state.activeWorkout.exercises[0].sets[0],{weight:62.5,reps:9,touched:true});
 return completeWorkout(state);
}
it('does not resume an empty strength completion while an optional session is active',()=>{
 const state=emptyCompletion(),workout=state.workouts.at(-1);
 state.activeOptionalSession={id:'active-cardio',date:'2026-10-13',status:'active'};
 const before=structuredClone(state);
 expect(completedWorkoutCanResume(state,workout.id)).toBe(false);
 expect(resumeCompletedWorkout(state,workout.id)).toBe(state);expect(state).toEqual(before);
});
it('keeps photo-owned empty completions in history rather than changing their cross-store owner',()=>{
 const state=emptyCompletion(),workout=state.workouts.at(-1);workout.photoId='photo-owned-by-original-completion';
 const before=structuredClone(state);
 expect(completedWorkoutCanResume(state,workout.id)).toBe(false);
 expect(resumeCompletedWorkout(state,workout.id)).toBe(state);expect(state).toEqual(before);
 expect(state.workouts.at(-1)).toMatchObject({id:workout.id,photoId:'photo-owned-by-original-completion'});
});
it.each(['repeat','combine'])('keeps a reserved %s preparation and its source history intact',mode=>{
 const state=emptyCompletion(),workout=state.workouts.at(-1);
 state.todayAdaptation={schemaVersion:1,id:'reserved-preparation',mode,date:'2026-10-13',sourceWorkoutId:workout.id,workout:{...structuredClone(workout),id:'reserved-preparation'}};
 const before=structuredClone(state);
 expect(completedWorkoutCanResume(state,workout.id)).toBe(false);expect(resumeCompletedWorkout(state,workout.id)).toBe(state);
 expect(state).toEqual(before);expect(state.todayAdaptation.sourceWorkoutId).toBe(workout.id);
});
it('still resumes a photo-free empty completion once, retaining pending values and canonical identity',()=>{
 const state=emptyCompletion(),workout=state.workouts.at(-1),history=structuredClone(workout),program=structuredClone(state.program);
 expect(completedWorkoutCanResume(state,workout.id)).toBe(true);
 const resumed=resumeCompletedWorkout(state,workout.id,Date.now(),'audit-resume');
 expect(resumed.workouts).toHaveLength(0);expect(resumed.activeOptionalSession).toBeNull();
 expect(resumed.activeWorkout).toMatchObject({programDayId:history.programDayId,logicalSessionId:history.logicalSessionId,resumedFromCompletionId:history.id});
 expect(resumed.activeWorkout.exercises[0].sets[0]).toMatchObject({weight:62.5,reps:9,completed:false});
 expect(workoutSetSummary(resumed.activeWorkout).completed).toBe(0);expect(resumed.program).toEqual(program);
 expect(resumeCompletedWorkout(resumed,workout.id,Date.now(),'audit-resume')).toBe(resumed);
 expect(resumed.workoutCorrections).toHaveLength(1);expect(state.workouts.at(-1)).toEqual(history);
 const loaded=deserializeState(serializeState(resumed),{strict:true});expect(loaded.activeWorkout.id).toBe(resumed.activeWorkout.id);
 loaded.activeWorkout.exercises[0].sets[0].completed=true;
 const finished=completeWorkout(loaded);expect(finished.workouts).toHaveLength(1);expect(finished.activeWorkout).toBeNull();
 expect(finished.workouts[0].supersedesCompletionId).toBe(history.id);
});
