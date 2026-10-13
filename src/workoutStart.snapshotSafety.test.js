import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,exerciseCatalog,validateProgram} from './domain.js';
import {compileProfileTrainingSafety} from './trainingSafety.js';
import {createCustomExerciseRecord,customExerciseSnapshot} from './customExercises.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-13T12:00:00'));});
afterEach(()=>vi.useRealTimers());
function fixture(pattern='squat'){
 const state=createReturningUserFixture(0),template=structuredClone(state.program.days[0]);
 const custom=customExerciseSnapshot(createCustomExerciseRecord({id:'custom-safety-probe',name:pattern==='squat'?'Custom squat':'Custom row',equipment:['machines'],primaryMuscle:pattern==='squat'?'Quads':'Back',pattern,loggingType:'weight_reps'}));
 template.exercises=[{...template.exercises[0],exerciseId:custom.id,exerciseSource:'custom',importedExercise:custom}];
 return {state,template,custom};
}
it('refuses a custom snapshot squat when the current canonical restriction avoids squats',()=>{
 const {state,template}=fixture();state.profile.avoid='Avoid squats';const before=structuredClone(state);
 const safety=compileProfileTrainingSafety(state.profile,Object.values(exerciseCatalog));
 expect(safety.status).toBe('constraints_active');expect(safety.constraints.avoidPatterns).toContain('squat');
 expect(()=>startWorkout(state,template)).toThrow(/Custom squat.*training restrictions/);expect(state).toEqual(before);
 const program={...state.program,days:[template]};
 expect(validateProgram(program,state.profile,{allowImportedExercises:true}).errors).toContain('Custom squat conflicts with the current training restrictions.');
});
it('still starts an allowed custom snapshot without mutating its source prescription',()=>{
 const {state,template}=fixture('horizontal-pull');state.profile.avoid='Avoid squats';const before=structuredClone(template);
 const active=startWorkout(state,template);
 expect(active.exercises[0].exerciseId).toBe('custom-safety-probe');expect(active.exercises[0].importedExercise.name).toBe('Custom row');
 expect(active.exercises[0].sets.every(set=>!set.completed)).toBe(true);expect(template).toEqual(before);
});
it('known catalog metadata remains authoritative over a conflicting imported snapshot',()=>{
 const {state,template}=fixture('horizontal-pull');state.profile.avoid='Avoid squats';template.exercises[0].exerciseId='back-squat';
 expect(()=>startWorkout(state,template)).toThrow(/training restrictions/);
});
