import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import {cancelActiveWorkout, hasMeaningfulSessionWork} from './workoutCancellation.js';
import {calendarStatusFixture} from './calendarStatus.fixture.js';
import {startWorkout, plannedWorkoutForDate, completeWorkout, workoutSetSummary, saveState, loadState, deserializeState, saveActiveExercisePersonalNote} from './domain.js';
import {startFreestyleWorkout, addFreestyleExercise, undoFreestyleAddition} from './freestyleWorkout.js';
import {flexibleOccurrenceForDate, proposeFlexibleWeek, applyFlexibleWeek} from './flexibleWeek.js';
import {calendarDayPresentation} from './workoutCalendar.js';
import {repeatedRestartFixture} from './restartWorkout.fixture.js';
const today='2026-09-21';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(`${today}T12:00:00`));});
afterEach(()=>vi.useRealTimers());
function planned(date=today) {
  const s=calendarStatusFixture();s.selectedDate=date;
  s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,date));return s;
}
function logFour(s) {
  s.activeWorkout.exercises.flatMap(e=>e.sets).slice(0,4).forEach(set=>Object.assign(set,{weight:20,reps:8,completed:true}));return s;
}
const cancel=s=>cancelActiveWorkout(s,s.activeWorkout.id,today);
it.each(['empty','logged'])('freestyle %s discards exactly the active session and never creates history',kind=>{
  let s=startFreestyleWorkout(calendarStatusFixture());
  if(kind==='logged'){s=addFreestyleExercise(s,'barbell-bench-press');s=logFour(s);}
  const before=structuredClone(s),next=cancel(s);
  expect(next).toEqual({...s,activeWorkout:null,selectedDate:today,selectedDay:'Mon'});expect(s).toEqual(before);
});
it.each([today,'2026-09-23','2026-09-18'])('planned %s becomes canonically unresolved, without changing its dates or plan',date=>{
  const s=logFour(planned(date)),before=structuredClone(s),next=cancel(s);
  expect(next.workouts).toBe(s.workouts);expect(next.program).toBe(s.program);expect(s).toEqual(before);
  expect(next.selectedDate).toBe(date);expect(flexibleOccurrenceForDate(next,date).status).toBe(date<today?'missed':'planned');
  const calendar=calendarDayPresentation(next,[today,date]);expect(calendar[today].markers).not.toContain('active');expect(calendar[today].markers).not.toContain('completed');
});
it('early Tuesday source started on Monday returns to Tuesday, and Monday has no credit',()=>{
  const s=calendarStatusFixture();s.program.days[1].weekday='Tue';s.selectedDate='2026-09-22';
  s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,s.selectedDate));const id=s.activeWorkout.logicalSessionId;
  expect(s.activeWorkout.workoutDateKey).toBe(today);expect(s.activeWorkout.canonicalPlanDate).toBe('2026-09-22');
  const next=cancel(logFour(s)),occurrence=flexibleOccurrenceForDate(next,'2026-09-22');
  expect(occurrence.logicalSessionId).toBe(id);expect(occurrence.status).toBe('planned');expect(next.workouts).toEqual([]);
});
it('keeps multiple completed workouts on the same date, other plans and an unrelated adjustment',()=>{
  const s=calendarStatusFixture('multiple-completed');s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,today));
  s.todayAdaptation={id:'unrelated'};const next=cancel(logFour(s));
  expect(next.workouts).toBe(s.workouts);expect(next.todayAdaptation).toBe(s.todayAdaptation);
  expect(calendarDayPresentation(next,[today])[today].markers).toEqual(['completed']);
});
it('keeps a pre-existing schedule move and the source identity',()=>{
  const original=calendarStatusFixture(),occurrence=flexibleOccurrenceForDate(original,today);
  const result=applyFlexibleWeek(original,proposeFlexibleWeek(original,{mode:'move',sessionId:occurrence.logicalSessionId,toDate:'2026-09-22'}));
  expect(result.status).toBe('applied');const s=result.state;s.selectedDate='2026-09-22';s.activeWorkout=startWorkout(s,plannedWorkoutForDate(s,s.selectedDate));
  const next=cancel(s);expect(next.flexibleWeek).toBe(s.flexibleWeek);expect(next.selectedDate).toBe('2026-09-22');
  expect(flexibleOccurrenceForDate(next,'2026-09-22').status).toBe('planned');
});
it('current values, replacements, order, extras and warm-up work require confirmation; fully reverted state does not',()=>{
  const s=planned(),active=s.activeWorkout;expect(hasMeaningfulSessionWork(active)).toBe(false);
  const original=structuredClone(active);
  const mutations=[a=>a.exercises[0].sets[0].weight=999,a=>a.exercises[0].sets[0].reps=999,
    a=>a.exercises[0].sets[0].rir=3,a=>a.exercises[0].sets[0].sides={left:{reps:5},right:{reps:6}},
    a=>a.exercises[0].sets.push({...a.exercises[0].sets[0],id:'extra',added:true}),
    a=>a.exercises[0].exerciseId='replacement',a=>a.exercises.reverse(),a=>a.exercises.pop(),
    a=>a.warmup={completed:true},a=>a.sessionNote='Remember this'];
  for(const mutate of mutations){const edited=structuredClone(active);mutate(edited);expect(hasMeaningfulSessionWork(edited)).toBe(true);}
  active.exercises[0].sets[0].weight=999;active.exercises[0].sets[0].weight=original.exercises[0].sets[0].weight;
  Object.assign(active.exercises[0].sets[0],{touched:true,weightEntryMode:'manual',weightProvenance:'explicit'});
  active.exercises[0].startedAt=Date.now();active.exerciseIndex=1;active.rest={endsAt:Date.now()+10000};
  expect(hasMeaningfulSessionWork(active)).toBe(false);expect(hasMeaningfulSessionWork(deserializeState(s).activeWorkout)).toBe(false);
});
it('an explicit addition undone leaves no historical touched warning',()=>{
  let s=startFreestyleWorkout(calendarStatusFixture()),sessionId=s.activeWorkout.id;
  expect(hasMeaningfulSessionWork(s.activeWorkout)).toBe(false);
  s=addFreestyleExercise(s,'barbell-bench-press',{sessionId,requestId:'addition'});expect(hasMeaningfulSessionWork(s.activeWorkout)).toBe(true);
  s=undoFreestyleAddition(s,{sessionId,requestId:'addition',ids:[s.activeWorkout.exercises[0].id]});expect(hasMeaningfulSessionWork(s.activeWorkout)).toBe(false);
});
it('legacy without a baseline is protected rather than guessed pristine',()=>{const s=planned();delete s.activeWorkout.restartSnapshot;expect(hasMeaningfulSessionWork(s.activeWorkout)).toBe(true);});
it('session modifications are discarded while explicit persistent notes/preferences and history survive',()=>{
  const s=logFour(planned());s.activeWorkout.exercises.reverse();s.activeWorkout.exercises[0].sets.push({id:'extra',reps:2,completed:true});
  const id=s.activeWorkout.exercises[0].id;saveActiveExercisePersonalNote(s,id,'Seat 4');s.substitutionPreferences=[{id:'remembered'}];
  const next=cancel(s);expect(next).toEqual({...s,activeWorkout:null,selectedDate:today,selectedDay:'Mon'});
});
it('the same four sets produce history with Finish Anyway and no history with Cancel',()=>{
  const s=logFour(planned()),finished=completeWorkout(structuredClone(s)),cancelled=cancel(s);
  expect(workoutSetSummary(s.activeWorkout).completed).toBe(4);expect(finished.workouts).toHaveLength(s.workouts.length+1);
  expect(finished.workouts.at(-1).completedSetCount).toBe(4);expect(finished.workouts.at(-1).endedEarly).toBe(true);
  expect(cancelled.workouts).toEqual(s.workouts);expect(cancelled.program.trainingBlock).toEqual(s.program.trainingBlock);
});
it('exact session identity, stale request and repeated cancellation are safe no-ops',()=>{
  const s=logFour(planned()),id=s.activeWorkout.id;expect(cancelActiveWorkout(s,'other')).toBe(s);expect(cancelActiveWorkout(s)).toBe(s);
  const next=cancel(s);expect(cancelActiveWorkout(next,id)).toBe(next);
});
it('repeat cancellation releases only its pending owner and preserves its historical source',()=>{
  vi.setSystemTime(new Date('2026-09-20T12:00:00'));const s=logFour(repeatedRestartFixture()),next=cancel(s);expect(next.todayAdaptation).toBeNull();expect(next.workouts).toBe(s.workouts);
});
it('combined cancellation releases source reservations even with logged work, without completed source credit',()=>{
  const s=logFour(planned()),occurrence=flexibleOccurrenceForDate({...s,activeWorkout:null},today);
  s.activeWorkout.adjustment={schemaVersion:1,mode:'combine',id:'combined',sourceSessions:[{programId:s.program.id,logicalSessionId:occurrence.logicalSessionId}]};
  s.todayAdaptation=s.activeWorkout.adjustment;
  const next=cancel(s);expect(next.todayAdaptation).toBeNull();expect(flexibleOccurrenceForDate(next,today).status).toBe('planned');expect(next.workouts).toBe(s.workouts);
});
it('successful durable cancellation does not recover an active session after reload',()=>{
  const s=logFour(planned());expect(saveState(s)).toBe(true);expect(saveState(cancel(s))).toBe(true);
  const loaded=loadState();expect(loaded.activeWorkout).toBeNull();expect(loaded.workouts).toEqual(s.workouts);
});
