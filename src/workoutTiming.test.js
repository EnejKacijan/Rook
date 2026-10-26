import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,completeWorkout,serializeState,deserializeState,restartActiveWorkout} from './domain.js';
import {completeWorkoutReversibly,continueWorkout} from './workoutCompletion.js';
import {lastWorkoutActivity,workoutNeedsRecovery,workoutElapsedSeconds,markWorkoutActivity,reviewWorkoutTiming,continueIdleWorkout,reviewedWorkoutFinish,finishIdleWorkout,WORKOUT_IDLE_MS} from './workoutTiming.js';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00'));});afterEach(()=>vi.useRealTimers());
function fixture(){const s=createReturningUserFixture(0);s.activeWorkout=startWorkout(s,s.program.days[0]);s.activeWorkout.startedAt=Date.now()-4*3600000;s.activeWorkout.lastMeaningfulWorkoutActivityAt=Date.now()-200*60000;const set=s.activeWorkout.exercises[0].sets[0];Object.assign(set,{completed:true,completedAt:s.activeWorkout.lastMeaningfulWorkoutActivityAt,weight:30,reps:8});return s;}
it('requires two hours of inactivity, not a local-date change, and never creates a completion',()=>{
  const s=fixture(),before=structuredClone(s);expect(workoutNeedsRecovery(s.activeWorkout)).toBe(true);expect(reviewWorkoutTiming(s).suggestedDurationSeconds).toBe(40*60);expect(s).toEqual(before);
  const now=new Date('2026-10-25T00:20:00').getTime();s.activeWorkout.startedAt=now-40*60000;s.activeWorkout.lastMeaningfulWorkoutActivityAt=now-10*60000;
  expect(workoutNeedsRecovery(s.activeWorkout,now)).toBe(false);expect(workoutNeedsRecovery(s.activeWorkout,now+WORKOUT_IDLE_MS-10*60000)).toBe(true);
});
it('ignores timer updates and generic updatedAt, and records meaningful edits without losing a pre-existing gap',()=>{
  const s=fixture(),timer=structuredClone(s);timer.activeWorkout.updatedAt=Date.now();timer.activeWorkout.rest={endsAt:Date.now()+1000};expect(markWorkoutActivity(s,timer)).toEqual(timer);
  const changed=structuredClone(s);changed.activeWorkout.exercises[0].sets[1].reps=9;const marked=markWorkoutActivity(s,changed);expect(marked.activeWorkout.unreviewedIdleSince).toBe(s.activeWorkout.lastMeaningfulWorkoutActivityAt);expect(workoutNeedsRecovery(marked.activeWorkout)).toBe(true);
  const recent=structuredClone(s);recent.activeWorkout.lastMeaningfulWorkoutActivityAt=Date.now()-1000;const edited=structuredClone(recent);edited.activeWorkout.exercises[0].sets[1].weight=35;expect(markWorkoutActivity(recent,edited).activeWorkout.lastMeaningfulWorkoutActivityAt).toBe(Date.now());
});
it('excludes a confirmed gap once, preserves runtime identity/sets, survives reload and counts later training normally',()=>{
  const s=fixture(),review=reviewWorkoutTiming(s),sets=structuredClone(s.activeWorkout.exercises);s.activeWorkout.rest={endsAt:Date.now()-60000};
  const next=continueIdleWorkout(s,review,{requestId:'continue'});expect(next.activeWorkout.id).toBe(s.activeWorkout.id);expect(next.activeWorkout.startedAt).toBe(s.activeWorkout.startedAt);expect(next.activeWorkout.exercises).toEqual(sets);expect(next.activeWorkout.rest).toBeNull();expect(workoutElapsedSeconds(next.activeWorkout)).toBe(2400);
  expect(continueIdleWorkout(next,review,{requestId:'continue'})).toBe(next);const loaded=deserializeState(serializeState(next),{strict:true});expect(workoutElapsedSeconds(loaded.activeWorkout)).toBe(2400);expect(workoutNeedsRecovery(loaded.activeWorkout)).toBe(false);
  vi.advanceTimersByTime(600000);expect(completeWorkout(loaded).workouts.at(-1).durationSeconds).toBe(3000);
});
it('allows explicitly counting the gap instead of silently removing it',()=>{
  const s=fixture(),next=continueIdleWorkout(s,reviewWorkoutTiming(s),{requestId:'keep-time',excludeGap:false});expect(workoutElapsedSeconds(next.activeWorkout)).toBe(4*3600);expect(workoutNeedsRecovery(next.activeWorkout)).toBe(false);
});
it('requires user timing when legacy evidence is missing or invalid, never guessing from updatedAt',()=>{
  const s=fixture();s.activeWorkout.lastMeaningfulWorkoutActivityAt=Date.now()+1;s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>delete set.completedAt));s.activeWorkout.updatedAt=Date.now();const review=reviewWorkoutTiming(s);expect(lastWorkoutActivity(s.activeWorkout)).toBeNull();expect(review.suggestedDurationSeconds).toBeNull();
  expect(()=>continueIdleWorkout(s,review,{requestId:'legacy'})).toThrow('time you already trained');const next=continueIdleWorkout(s,review,{requestId:'legacy',elapsedMinutes:'35'});expect(workoutElapsedSeconds(next.activeWorkout)).toBe(35*60);
});
it('saves the reviewed end and duration only on explicit Finish, preserving the original date and reversibility',()=>{
  const s=fixture(),review=reviewWorkoutTiming(s),original=structuredClone(s),timing=reviewedWorkoutFinish(s,review,{endedAt:review.lastActivityAt,durationMinutes:'40'});
  const result=completeWorkoutReversibly(s,timing),done=result.state.workouts.at(-1);expect(done.durationSeconds).toBe(2400);expect(done.endedAt).toBe(review.lastActivityAt);expect(done.completionRecordedAt).toBe(new Date().toISOString());expect(done.workoutDateKey).toBe(s.activeWorkout.workoutDateKey);expect(s).toEqual(original);
  expect(continueWorkout(result.state,result.reversal).activeWorkout).toEqual(original.activeWorkout);
});
it('revalidates edits/profile/session and rejects impossible finish times',()=>{
  const s=fixture(),review=reviewWorkoutTiming(s),changed=structuredClone(s);changed.activeWorkout.exercises[0].sets[0].reps++;
  expect(()=>continueIdleWorkout(changed,review,{requestId:'changed'})).toThrow('changed');expect(()=>continueIdleWorkout({...s,profile:{...s.profile,id:'other'}},review,{requestId:'other'})).toThrow('changed');
  expect(()=>reviewedWorkoutFinish(s,review,{endedAt:Date.now()+1,durationMinutes:30})).toThrow('end time');expect(()=>reviewedWorkoutFinish(s,review,{endedAt:review.lastActivityAt-1000,durationMinutes:30})).toThrow('last logged');expect(()=>reviewedWorkoutFinish(s,review,{endedAt:review.lastActivityAt,durationMinutes:600})).toThrow('duration');
});
it('restart clears timing corrections and old idle evidence',()=>{
  const s=fixture();s.activeWorkout.excludedIdleMs=60000;s.activeWorkout.unreviewedIdleSince=s.activeWorkout.lastMeaningfulWorkoutActivityAt;
  const restarted=restartActiveWorkout(s);expect(restarted.activeWorkout.excludedIdleMs).toBe(0);expect(workoutNeedsRecovery(restarted.activeWorkout)).toBe(false);expect(lastWorkoutActivity(restarted.activeWorkout)).toBeNull();
});
it('finishes an idle workout directly at its last activity instead of the time it was reopened',()=>{
  const s=fixture(),review=reviewWorkoutTiming(s),before=structuredClone(s);
  const timing=finishIdleWorkout(s,review),done=completeWorkout(s,timing).workouts.at(-1);
  expect(done.durationSeconds).toBe(2400);expect(done.endedAt).toBe(review.lastActivityAt);
  expect(done.workoutDateKey).toBe(s.activeWorkout.workoutDateKey);expect(done.completionRecordedAt).toBe(new Date().toISOString());expect(s).toEqual(before);
});
it('accepts a single duration correction from 40 to 41 minutes and keeps the actual last activity unchanged',()=>{
  const s=fixture(),review=reviewWorkoutTiming(s),timing=finishIdleWorkout(s,review,{durationMinutes:'41'});
  expect(timing.durationSeconds).toBe(2460);expect(timing.endedAt).toBe(review.lastActivityAt+60000);
  expect(lastWorkoutActivity(s.activeWorkout)).toBe(review.lastActivityAt);
  const shorter=finishIdleWorkout(s,review,{durationMinutes:'35'});expect(shorter.durationSeconds).toBe(2100);expect(shorter.endedAt).toBe(review.lastActivityAt);
});
it('does not count a previously excluded gap again when adjusting an idle workout duration',()=>{
  const s=fixture();s.activeWorkout.excludedIdleMs=10*60000;
  const review=reviewWorkoutTiming(s);expect(review.suggestedDurationSeconds).toBe(1800);
  const direct=finishIdleWorkout(s,review),longer=finishIdleWorkout(s,review,{durationMinutes:'31'}),shorter=finishIdleWorkout(s,review,{durationMinutes:'20'});
  expect(direct.durationSeconds).toBe(1800);expect(direct.endedAt).toBe(review.lastActivityAt);
  expect(longer.durationSeconds).toBe(1860);expect(longer.endedAt).toBe(review.lastActivityAt+60000);
  expect(shorter.endedAt).toBe(review.lastActivityAt);expect(shorter.durationSeconds).toBe(1200);
});
it('requires only a duration for missing legacy timing and still rejects stale or future completion requests',()=>{
  const s=fixture();s.activeWorkout.lastMeaningfulWorkoutActivityAt=null;delete s.activeWorkout.exercises[0].sets[0].completedAt;
  const review=reviewWorkoutTiming(s);expect(()=>finishIdleWorkout(s,review)).toThrow('minutes you trained');
  for(const value of ['',0,-1,'nope'])expect(()=>finishIdleWorkout(s,review,{durationMinutes:value})).toThrow('minutes you trained');
  expect(()=>finishIdleWorkout(s,review,{durationMinutes:241})).toThrow('time available');
  const timing=finishIdleWorkout(s,review,{durationMinutes:35});expect(timing.durationSeconds).toBe(2100);expect(timing.endedAt).toBe(s.activeWorkout.startedAt+35*60000);
  const changed=structuredClone(s);changed.activeWorkout.exercises[0].sets[0].reps++;
  expect(()=>finishIdleWorkout(changed,review,{durationMinutes:35})).toThrow('changed');
});
