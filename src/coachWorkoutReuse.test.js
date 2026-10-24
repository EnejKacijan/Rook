import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {serializeState,deserializeState,completeWorkout,proposeOptionalStrengthWorkout} from './domain.js';
import {coachWorkoutReuseReply,resolveCoachWorkoutReuse,startCoachWorkoutReuse} from './coachWorkoutReuse.js';
import {saveWorkoutTemplate} from './savedWorkouts.js';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00'));});
afterEach(()=>vi.useRealTimers());
function fixture(){const s=createReturningUserFixture(0);s.profile.showExerciseImages=false;s.program.days[0].name='Noge B';s.program.days[0].workoutName='Noge B';const day=s.program.days[0];day.exercises=day.exercises.slice(0,3);day.exercises.forEach((e,i)=>{e.sets=e.sets.slice(0,i===1?1:2);e.sets.forEach((set,j)=>Object.assign(set,{weight:j?null:25+i,reps:j?null:8+i,rir:2,completed:false}));});return s;}
it.each(['Daj mi isti moj trening Noge B','Repeat my Noge B workout'])('routes %s to the exact source before optional generation',message=>{
  const s=fixture(),reply=coachWorkoutReuseReply(s,message),before=structuredClone(s);
  expect(reply.action.type).toBe('reuse-existing-workout');expect(reply.action.choices).toHaveLength(1);
  expect(proposeOptionalStrengthWorkout(s,`${message} danes workout`)).toBeNull();expect(s).toEqual(before);
});
it('ignores provider invented exercises/counts and uses the named original',()=>{
  const s=fixture(),reply=coachWorkoutReuseReply(s,'Danes bi treniral',{proposedAction:{type:'add-today-workout',name:'Noge B — optional (normal)',exerciseIds:['plank'],sets:3}});
  const reference=reply.action.choices[0].reference,draft=resolveCoachWorkoutReuse(s,reference),before=structuredClone(s);
  const next=startCoachWorkoutReuse(s,{reference,requestId:'reuse-1',reviewedPrescription:JSON.stringify(draft)});
  expect(next.activeWorkout.name).toBe('Noge B');expect(next.activeWorkout.source).toBe('freestyle');
  expect(next.activeWorkout.exercises.map(e=>e.sets.length)).toEqual([2,1,2]);
  expect(next.activeWorkout.exercises.map(e=>e.sets.map(({weight,reps,rir})=>({weight,reps,rir})))).toEqual(draft.exercises.map(e=>e.sets.map(({weight,reps,rir})=>({weight,reps,rir}))));
  expect(next.activeWorkout.exercises.every(e=>e.sets.every(set=>!set.completed))).toBe(true);
  expect(next.activeWorkout.exercises[0].id).not.toBe(draft.exercises[0].id);expect(next.activeWorkout.exercises[0].sets[0].id).not.toBe(draft.exercises[0].sets[0].id);
  expect(next.program).toEqual(before.program);expect(next.workouts).toEqual(before.workouts);
  const loaded=deserializeState(serializeState(next),{strict:true});expect(loaded.activeWorkout.exercises.map(e=>e.sets.map(({weight,reps})=>({weight,reps})))).toEqual(next.activeWorkout.exercises.map(e=>e.sets.map(({weight,reps})=>({weight,reps}))));
  expect(startCoachWorkoutReuse(next,{reference,requestId:'reuse-1',reviewedPrescription:JSON.stringify(draft)})).toBe(next);
});
it('does not guess between duplicate saved/plan names and rejects stale references at Start',()=>{
  let s=fixture();const draft={name:'Noge B',exercises:s.program.days[0].exercises};s=saveWorkoutTemplate(s,draft,{id:'saved-noge'});
  const reply=coachWorkoutReuseReply(s,'I want my same Noge B workout');expect(reply.action.choices).toHaveLength(2);
  for(const choice of reply.action.choices){const original=resolveCoachWorkoutReuse(s,choice.reference);const changed=structuredClone(s);if(choice.reference.kind==='plan')changed.program.days[0].exercises[0].sets.pop();else changed.savedWorkoutTemplates[0].revision++;
    expect(()=>startCoachWorkoutReuse(changed,{reference:choice.reference,requestId:'stale',reviewedPrescription:JSON.stringify(original)})).toThrow(/changed/);
    expect(()=>resolveCoachWorkoutReuse({...s,profile:{...s.profile,id:'different'}},choice.reference)).toThrow('another profile');
  }
});
it('keeps a persisted Coach source reference usable when only the display duration is recalculated',()=>{
  const s=fixture();s.program.days[0].estimatedMinutes=999;
  const reply=coachWorkoutReuseReply(s,'Repeat my Noge B workout');
  s.conversations=[{id:'reuse-persisted',user:'Repeat my Noge B workout',createdAt:Date.now(),reply}];
  const loaded=deserializeState(serializeState(s),{strict:true});
  expect(()=>resolveCoachWorkoutReuse(loaded,loaded.conversations[0].reply.action.choices[0].reference)).not.toThrow();
});
