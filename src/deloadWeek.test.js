import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {blankState,buildProgram,plannedWorkoutForDate,currentWeekSchedule,startWorkout,completeWorkout,serializeState,deserializeState,possibleFatigueSignal} from './domain.js';
import {createTrainingBlock,currentTrainingBlockWeek,prescribeTrainingBlockWorkout,trainingRestForDate} from './trainingBlocks.js';
import {chooseDeloadWeek,needsDeloadChoice,canUndoDeloadChoice,undoDeloadChoice,deloadChoiceFingerprint} from './deloadWeek.js';
import {missedFlexibleSessions,flexiblePlanFingerprint,flexibleWeekConflict,proposeFlexibleWeek,applyFlexibleWeek} from './flexibleWeek.js';
import {isDeloadWorkout} from './progressionHistory.js';
import {nextWorkoutAdvice} from './nextWorkoutAdvice.js';
import {reviewTrainingBlock,proposeNextBlock,applyNextBlock} from './blockReview.js';
import {weeklyPerformanceReview} from './performanceInsights.js';
import {buildBackupArchive,parseBackupArchive} from './backup.js';
import {syncEntities} from './accountSyncModel.js';

let seed;
export function deloadFixture({totalWeeks=6,week=totalWeeks,plannedDeloadWeek=totalWeeks}={}){
  if(!seed){
    seed=blankState();Object.assign(seed.profile,{onboardingComplete:true,goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced'],showExerciseImages:false,recommendedWarmupsEnabled:false,rampUpSetsEnabled:false});
    seed.program=buildProgram(seed.profile);Object.assign(seed.program,{source:'manual',userEdited:true,rotationStartDate:'2026-10-12'});
    for(const day of seed.program.days){const e=day.exercises[0],set=e.sets[0];Object.assign(e,{programmingRole:'main',repMin:6,repMax:10,targetRir:2});e.sets=[1,2,3].map(i=>({...set,id:`${e.id}:${i}`,planned:true,added:false,weight:50,reps:6,rir:null,completed:false}));}
  }
  const state=structuredClone(seed);state.program.trainingBlock=createTrainingBlock(state.program,{id:'deload-choice-block',totalWeeks,currentWeek:week,plannedDeloadWeek,startDate:'2026-10-12'});
  state.selectedDate='2026-11-16';state.selectedDay='Mon';return state;
}
const choose=(state,mode,extra={})=>chooseDeloadWeek(state,{blockId:state.program.trainingBlock.id,weekNumber:state.program.trainingBlock.currentWeek,mode,...extra});
const finish=(state,date)=>{state.selectedDate=date;const template=plannedWorkoutForDate(state,new Date(`${date}T12:00:00`));state.activeWorkout=startWorkout(state,template);for(const e of state.activeWorkout.exercises)for(const set of e.sets)Object.assign(set,{completed:true,reps:e.repMax,weight:50,rir:e.targetRir});return completeWorkout(state);};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-16T12:00:00'));});
afterEach(()=>vi.useRealTimers());

describe('one choice for the deload week',()=>{
  it('keeps deload recommended until the user explicitly chooses and preserves normal plan settings',()=>{
    const state=deloadFixture(),template=plannedWorkoutForDate(state);expect(needsDeloadChoice(state,template)).toBe(true);
    const next=choose(state,'deload');expect(needsDeloadChoice(next,plannedWorkoutForDate(next))).toBe(false);
    expect(plannedWorkoutForDate(next).exercises[0]).toMatchObject({repMin:6,repMax:10,targetRir:4});
    expect(next.program.trainingBlock.currentWeek).toBe(6);expect(next.program.trainingBlock.completed).toBe(false);
    expect(next.program.days).toEqual(state.program.days);expect(state.program.trainingBlock.deloadChoices).toBeUndefined();
  });
  it.each([[6,4],[4,3]])('uses the last normal targets in a %s-week block (%s sets)',(length,count)=>{
    const state=choose(deloadFixture({totalWeeks:length}),'normal'),workout=plannedWorkoutForDate(state),e=workout.exercises[0];
    expect([e.sets.length,e.repMin,e.repMax,e.targetRir]).toEqual([count,7,11,1]);
    expect(isDeloadWorkout(workout)).toBe(false);expect(workout.trainingBlock).toMatchObject({phase:'final',plannedDeload:false,deloadChoice:'normal'});
    expect(currentTrainingBlockWeek(state).label).toBe('Normal training');
    expect(nextWorkoutAdvice(e,[],state.profile,state)?.title).not.toBe('Planned deload');
    expect(state.program.trainingBlock.plannedDeloadWeek).toBe(length);
  });
  it('does not invalidate accepted moves when only this week’s training choice changes',()=>{
    let state=deloadFixture();const id=`${state.program.days[2].id}:2026-11-20`;
    const moved=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:id,toDate:'2026-11-21'}));expect(moved.status).toBe('applied');state=moved.state;
    const next=choose(state,'normal');expect(flexiblePlanFingerprint(next)).toBe(flexiblePlanFingerprint(state));
    expect(flexibleWeekConflict(next)).toBe(false);expect(next.flexibleWeek).toEqual(state.flexibleWeek);
    expect(plannedWorkoutForDate(next,new Date('2026-11-21T12:00:00')).trainingBlock.plannedDeload).toBe(false);
  });
  it('uses normal success evidence and removes the after-deload qualifier when normal training is selected',()=>{
    const state=deloadFixture(),past={...state,program:{...state.program,trainingBlock:{...state.program.trainingBlock,currentWeek:5}}};
    const workout=prescribeTrainingBlockWorkout(past,state.program.days[0]);
    for(const e of workout.exercises)for(const set of e.sets)Object.assign(set,{completed:true,weight:50,reps:e.repMax,rir:e.targetRir});
    state.workouts=[{...structuredClone(workout),id:'success-1',completedAt:'2026-11-09T12:00:00Z'},{...structuredClone(workout),id:'success-2',completedAt:'2026-11-11T12:00:00Z'}];
    const next=choose(state,'normal'),e=plannedWorkoutForDate(next).exercises[0];
    const advice=nextWorkoutAdvice(e,next.workouts,next.profile,next);expect(advice.type).toBe('progress');expect(advice.weight).toBeGreaterThan(50);expect(advice.afterDeload).toBeUndefined();
  });
  it('allows a new choice for remaining sessions without rewriting an earlier normal session',()=>{
    let state=choose(deloadFixture(),'normal');state=finish(state,'2026-11-16');const history=structuredClone(state.workouts);
    state=choose(state,'deload');expect(state.workouts).toEqual(history);expect(isDeloadWorkout(history[0])).toBe(false);
    expect(plannedWorkoutForDate(state,new Date('2026-11-18T12:00:00')).trainingBlock.plannedDeload).toBe(true);
  });
  it('rejects stale choices and changes during an active session without altering input',()=>{
    const state=deloadFixture(),fingerprint=deloadChoiceFingerprint(state);state.program.name+=' edited';const before=structuredClone(state);
    expect(()=>choose(state,'normal',{fingerprint})).toThrow('Reopen');expect(state).toEqual(before);
    state.activeWorkout=startWorkout(state,plannedWorkoutForDate(state));const active=structuredClone(state);
    for(const mode of ['normal','deload','rest'])expect(()=>choose(state,mode)).toThrow('active session');expect(state).toEqual(active);
  });
});

describe('rest for the whole deload week',()=>{
  it('resolves all remaining sessions in one action without fake completions or progress',()=>{
    const state=deloadFixture(),before=structuredClone(state),next=choose(state,'rest');
    expect(state).toEqual(before);expect(next.workouts).toEqual([]);expect(next.program.trainingBlock.completed).toBe(true);
    expect(next.program.trainingBlock.resolvedSkips).toHaveLength(3);expect(next.completedTrainingBlocks).toHaveLength(1);
    expect(currentWeekSchedule(next)).toEqual([]);expect(missedFlexibleSessions(next)).toEqual([]);
    expect(trainingRestForDate(next,'2026-11-22')).toMatchObject({mode:'rest',restFrom:'2026-11-16',restThrough:'2026-11-22'});
    expect(trainingRestForDate(next,'2026-11-23')).toBeNull();expect(reviewTrainingBlock(next)).toMatchObject({completedSessions:0,skipped:0,plannedRestSessions:3,plannedRest:{weekNumber:6},loggedSets:0});
    expect(weeklyPerformanceReview(next,new Date())).toMatchObject({completed:0,completedSets:0,exercisesProgressed:0});
    expect(()=>startWorkout(next,next.program.days[0])).toThrow('planned rest week');
  });
  it('keeps a completed session and rests only the remaining obligations',()=>{
    let state=finish(deloadFixture(),'2026-11-16');const history=structuredClone(state.workouts);
    vi.setSystemTime(new Date('2026-11-18T12:00:00'));state=choose(state,'rest');
    expect(state.workouts).toEqual(history);expect(state.program.trainingBlock.resolvedSkips).toHaveLength(2);
    expect(reviewTrainingBlock(state)).toMatchObject({completedSessions:1,skipped:0,plannedRestSessions:2});
    expect(state.program.trainingBlock.deloadChoices[6]).toMatchObject({restFrom:'2026-11-18',restThrough:'2026-11-24'});
  });
  it('cancels a moved deload occurrence beyond the rest window and leaves no review dead end',()=>{
    const state=deloadFixture(),id=`${state.program.days[2].id}:2026-11-20`;
    const moved=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:id,toDate:'2026-11-24'}));expect(moved.status).toBe('applied');
    const next=choose(moved.state,'rest');expect(next.flexibleWeek.sessions[id].skipped).toBe(true);expect(flexibleWeekConflict(next)).toBe(false);
    expect(next.program.trainingBlock.completed).toBe(true);
  });
  it('advances a non-final deload, keeps seven recovery days clear and resumes normal targets afterward',()=>{
    const state=choose(deloadFixture({week:3,plannedDeloadWeek:3}),'rest');
    expect(state.program.trainingBlock).toMatchObject({currentWeek:4,completed:false});expect(currentWeekSchedule(state)).toEqual([]);
    const next=plannedWorkoutForDate(state,new Date('2026-11-23T12:00:00'));expect(next.trainingBlock.phase).not.toBe('deload');expect(next.exercises[0].sets).toHaveLength(4);
  });
  it('starts a reviewed next block after the rest week without carrying over the choice',()=>{
    const state=choose(deloadFixture(),'rest'),proposal=proposeNextBlock(state,{repeat:true});expect(proposal.startDate).toBe('2026-11-23');
    const result=applyNextBlock(state,proposal);expect(result.status).toBe('applied');expect(result.state.program.trainingBlock.deloadChoices).toBeUndefined();
    expect(result.state.program.trainingBlock.currentWeek).toBe(1);expect(plannedWorkoutForDate(result.state,new Date('2026-11-18T12:00:00'))).toBeNull();
    expect(trainingRestForDate(result.state,'2026-11-18')).not.toBeNull();
  });
  it('keeps recovery dates when a restored block already has an archived copy, and undo restores that copy',()=>{
    const state=deloadFixture();state.completedTrainingBlocks=[{...structuredClone(state.program.trainingBlock),completed:true,program:structuredClone(state.program)}];
    const next=choose(state,'rest'),proposal=proposeNextBlock(next,{repeat:true}),result=applyNextBlock(next,proposal);
    expect(result.status).toBe('applied');expect(trainingRestForDate(result.state,'2026-11-20')).not.toBeNull();
    expect(undoDeloadChoice(next).completedTrainingBlocks).toEqual(state.completedTrainingBlocks);
  });
  it('treats a repeated apply as a no-op without extending the week or duplicating skips',()=>{
    const state=choose(deloadFixture(),'rest');vi.setSystemTime(new Date('2026-11-17T12:00:00'));
    expect(choose(state,'rest')).toBe(state);
  });
  it('separates old negative evidence across a rest week without adding workout records',()=>{
    const state=deloadFixture(),past={...state,program:{...state.program,trainingBlock:{...state.program.trainingBlock,currentWeek:5}}};
    const workout=prescribeTrainingBlockWorkout(past,state.program.days[0]);
    for(const e of workout.exercises)for(const set of e.sets)Object.assign(set,{completed:true,weight:50,reps:3,rir:e.targetRir});
    state.workouts=[{...structuredClone(workout),id:'poor-1',completedAt:'2026-11-09T12:00:00Z'},{...structuredClone(workout),id:'poor-2',completedAt:'2026-11-11T12:00:00Z'}];
    const exercise=state.workouts.at(-1).exercises[0];expect(nextWorkoutAdvice(exercise,state.workouts,state.profile,state).title).toBe('Review the load');
    const next=choose(state,'rest');expect(next.workouts).toEqual(state.workouts);
    expect(nextWorkoutAdvice(exercise,next.workouts,next.profile,next).title).not.toBe('Review the load');
    const declining=structuredClone(next.workouts);for(const e of declining[0].exercises)for(const set of e.sets)set.weight=60;
    expect(possibleFatigueSignal(declining)).not.toBeNull();expect(possibleFatigueSignal(declining,next)).toBeNull();
  });
});

describe('durable choices and guarded undo',()=>{
  it.each(['normal','deload','rest'])('survives save and reload with working undo (%s)',mode=>{
    const initial=deloadFixture(),next=choose(initial,mode),loaded=deserializeState(serializeState(next),{strict:true});
    expect(loaded.program.trainingBlock.deloadChoices[6].mode).toBe(mode);expect(canUndoDeloadChoice(loaded)).toBe(true);
    const restored=undoDeloadChoice(loaded);expect(restored.program.trainingBlock).toEqual(initial.program.trainingBlock);expect(restored.workouts).toEqual(initial.workouts);
  });
  it('undoes choices one at a time, including leaving a rest week, without undoing unrelated preferences',()=>{
    const initial=deloadFixture();let state=choose(initial,'deload');state=choose(state,'rest');
    state=choose(state,'normal');expect(state.program.trainingBlock.completed).toBe(false);expect(currentWeekSchedule(state)).toHaveLength(3);
    state.profile.showExerciseImages=true;state=undoDeloadChoice(state);expect(state.program.trainingBlock.completed).toBe(true);
    state=undoDeloadChoice(state);expect(state.program.trainingBlock.deloadChoices[6].mode).toBe('deload');
    state=undoDeloadChoice(state);expect(state.program.trainingBlock).toEqual(initial.program.trainingBlock);expect(state.profile.showExerciseImages).toBe(true);
  });
  it('protects subsequent training from an old undo receipt',()=>{
    let state=choose(deloadFixture(),'normal');state=finish(state,'2026-11-16');const before=structuredClone(state);
    expect(canUndoDeloadChoice(state)).toBe(false);expect(()=>undoDeloadChoice(state)).toThrow('Training or the schedule changed');expect(state).toEqual(before);
  });
  it('retains a rest week in backup/restore and in the synced program',async()=>{
    const state=choose(deloadFixture(),'rest'),backup=await buildBackupArchive(state,[]),restored=await parseBackupArchive(backup.bytes);
    expect(restored.state.program.trainingBlock.deloadChoices).toEqual(state.program.trainingBlock.deloadChoices);
    expect(trainingRestForDate(restored.state,'2026-11-20')).not.toBeNull();
    const program=[...syncEntities(state).values()].find(entity=>entity.domain==='program').value;
    expect(program.trainingBlock.deloadChoices[6].mode).toBe('rest');
  });
});
