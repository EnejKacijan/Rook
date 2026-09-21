import {it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,restartActiveWorkout,activeWorkoutCanRestart,serializeState,deserializeState,resumeCompletedWorkout} from './domain.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {removeUpNext} from './upNextRemoval.js';
import {reorderUpNext,upNextMoveRequest} from './upNextReorder.js';

it.each([false,true])('planned restart restores the original structure and warm-up while retaining occurrence/adjustment/history (Adjust Today %s)',adjusted=>{
 let s=createReturningUserFixture(0);const template=structuredClone(s.program.days[0]);
 if(adjusted){template.adapted=true;template.todayOnlyAdjustment={id:'today-short',mode:'shorten',date:s.selectedDate,originalWorkout:structuredClone(template)};s.todayAdaptation=structuredClone(template.todayOnlyAdjustment);}
 s.activeWorkout=startWorkout(s,template);const initial=structuredClone(s),snapshot=initial.activeWorkout.restartSnapshot;
 s=reorderUpNext(s,upNextMoveRequest(s.activeWorkout,s.activeWorkout.exercises[2].id,-1));
 s=removeUpNext(s,s.activeWorkout.exercises[3].id).state;
 const active=s.activeWorkout;
 active.exercises.push({...structuredClone(active.exercises[1]),id:'manually-added',sets:[{id:'extra-set',weight:70,reps:8,completed:false}]});
 active.exercises[0].exerciseId=active.exercises[1].exerciseId;active.exercises[0].personalNote='Changed during this session';
 Object.assign(active.exercises[0].sets[0],{weight:62.5,reps:9,rir:1,completed:true,completedAt:123,touched:true});
 Object.assign(active.exercises[0].sets[1],{weight:80,reps:12,rir:2,touched:true});
 active.exerciseIndex=1;active.rest={endsAt:99999};active.handledSupersetRestRounds=['pair:1'];
 if(active.warmup){active.warmup.completed=true;active.warmup.skipped=true;for(const stage of active.warmup.stages||[]){stage.completed=true;stage.skipped=true;}}
 active.sessionNote='Retained metadata';active.photoId='existing-photo-reference';
 const restarted=restartActiveWorkout(s,50000),result=restarted.activeWorkout;
 expect(result.exercises).toEqual(snapshot.exercises);expect(result.warmup).toEqual(snapshot.warmup);expect(result.removedUpNextExercises).toBeUndefined();
 expect(result.exerciseIndex).toBe(0);expect(result.rest).toBeNull();expect(result.handledSupersetRestRounds).toEqual([]);expect(result.startedAt).toBe(50000);
 for(const key of ['id','programDayId','logicalSessionId','sourcePlanSlotId','canonicalPlanDate','workoutDateKey','optionalSessionId','adjustment','originalPlannedWorkout','adapted'])expect(result[key]).toEqual(initial.activeWorkout[key]);
 expect(result.sessionNote).toBe('Retained metadata');expect(result.photoId).toBe('existing-photo-reference');
 expect(restarted.program).toEqual(initial.program);expect(restarted.todayAdaptation).toEqual(initial.todayAdaptation);expect(restarted.workouts).toEqual(initial.workouts);
 expect(deserializeState(serializeState(restarted),{strict:true}).activeWorkout.exercises.map(e=>e.id)).toEqual(snapshot.exercises.map(e=>e.id));
 expect(activeWorkoutCanRestart(result)).toBe(false);expect(restartActiveWorkout(restarted,60000)).toBe(restarted);
});

it('freestyle resumed from a legacy empty completion still restarts to its original empty session',()=>{
 let state=addFreestyleExercise(startFreestyleWorkout(createReturningUserFixture(0)),'barbell-row');
 Object.assign(state.activeWorkout.exercises[0],{startedAt:1});state.activeWorkout.exercises[0].sets[0].weight=45;
 // Current Finish disallows empty freestyle completion; reproduce older data.
 const ended={...structuredClone(state.activeWorkout),id:'legacy-empty',completedAt:new Date().toISOString(),durationSeconds:60};
 delete ended.restartSnapshot;state={...state,activeWorkout:null,workouts:[ended]};
 state=resumeCompletedWorkout(state,ended.id);
 expect(state.activeWorkout.exercises).toHaveLength(1);
 expect(state.activeWorkout.restartSnapshot).toEqual({exercises:[],warmup:null});
 // Compatibility with an older resume that captured the chosen queue.
 state.activeWorkout.restartSnapshot={exercises:structuredClone(state.activeWorkout.exercises),warmup:null};
 expect(restartActiveWorkout(state).activeWorkout.exercises).toEqual([]);
});

it.each([false,true])('freestyle restores its empty session start and cannot resurrect removal Undo (legacy without snapshot %s)',legacy=>{
 let s=startFreestyleWorkout(createReturningUserFixture(0));
 if(legacy)delete s.activeWorkout.restartSnapshot;
 expect(activeWorkoutCanRestart(s.activeWorkout)).toBe(false);
 for(const id of ['barbell-bench-press','cable-fly','barbell-row','plank'])s=addFreestyleExercise(s,id,{requestId:id});
 expect(activeWorkoutCanRestart(s.activeWorkout)).toBe(true);
 s=reorderUpNext(s,upNextMoveRequest(s.activeWorkout,s.activeWorkout.exercises[3].id,-1));s=removeUpNext(s,s.activeWorkout.exercises[1].id).state;
 const active=s.activeWorkout;active.exercises[0].personalNote='Keep this reminder';active.exercises[0].startedAt=1;
 active.exercises.forEach((e,i)=>{Object.assign(e.sets[0],{weight:50,reps:10+i,rir:2,completed:true,touched:true,completedAt:22,weightSourceSetId:'old',repsEntryMode:'manual'});});
 active.exercises[1].loggingMode='per_side';active.exercises[1].sets[0].sides={left:{reps:9,completed:true},right:{reps:8,touched:true}};
 active.exercises[2].sets[0].setType='drop';active.exercises[2].sets[0].segments=[{id:'drop-1',kind:'drop',weight:12,reps:6,rir:0,completed:true}];
 active.exerciseIndex=1;active.rest={endsAt:90000};const before=structuredClone(active);
 const next=restartActiveWorkout(s,50000),result=next.activeWorkout;
 expect(result.exercises).toEqual([]);expect(result.queueCommandIds).toEqual(before.queueCommandIds);expect(result.id).toBe(before.id);
 expect(result.restartSnapshot).toEqual({exercises:[],warmup:null});expect(result.removedUpNextExercises).toBeUndefined();
 expect(result.startedAt).toBe(50000);expect(result.exerciseIndex).toBe(0);expect(result.rest).toBeNull();expect(activeWorkoutCanRestart(result)).toBe(false);
 expect(deserializeState(serializeState(next),{strict:true}).activeWorkout.exercises.map(e=>e.id)).toEqual(result.exercises.map(e=>e.id));
 expect(next.workouts).toEqual(s.workouts);expect(next.program).toEqual(s.program);
 expect(addFreestyleExercise(next,'barbell-row',{requestId:'barbell-row'})).toBe(next);
 const continued=addFreestyleExercise(next,'barbell-row',{requestId:'new-after-restart'});
 expect(continued.activeWorkout.id).toBe(before.id);expect(continued.activeWorkout.exercises).toHaveLength(1);
 expect(continued.activeWorkout.exercises[0].sets[0]).toMatchObject({weight:null,reps:null,completed:false});
});
