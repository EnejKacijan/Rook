import {proposeWorkoutToday,applyWorkoutToday,repeatTemplate} from './useWorkoutToday.js';
import {exercisePerformance,weeklyPerformanceReview,prEventsForWorkouts} from './performanceInsights.js';
import {startFreestyleWorkout,addFreestyleExercise} from './freestyleWorkout.js';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {blankState,buildProgram,startWorkout,completeWorkout,deserializeState,serializeState,workoutPerformedDate} from './domain.js';
import {flexibleSessions,proposeFlexibleWeek,applyFlexibleWeek,missedFlexibleSessions} from './flexibleWeek.js';
import {calendarDayStates} from './workoutCalendar.js';
import {completedWorkoutsForDate} from './completedWorkoutsForDate.js';
import {workoutPhotoDay} from './workoutPhotoTimeline.js';
function fixture(){const s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});s.program=buildProgram(s.profile);s.program.trainingBlock.startDate='2026-09-14';s.program.createdAt='2026-09-14T12:00:00';s.selectedDate='2026-09-14';return deserializeState(s);}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-18T12:00:00'));});afterEach(()=>vi.useRealTimers());
it('captures planned Monday separately from real Friday and migrates/reloads idempotently',()=>{
 let s=fixture();const mon=flexibleSessions(s)[0],plan=structuredClone(s.program);s.activeWorkout=startWorkout(s,mon.workout);
 expect(s.activeWorkout).toMatchObject({canonicalPlanDate:'2026-09-14',workoutDateKey:'2026-09-18',logicalSessionId:mon.logicalSessionId,originalScheduledDate:'2026-09-14'});
 s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>{set.completed=true;set.reps=8;set.weight=20;}));s=completeWorkout(s);const w=s.workouts[0];
 expect(workoutPerformedDate(w)).toBe('2026-09-18');expect(completedWorkoutsForDate(s.workouts,'2026-09-14')).toEqual([]);expect(completedWorkoutsForDate(s.workouts,'2026-09-18')).toHaveLength(1);
 expect(calendarDayStates(s,['2026-09-14','2026-09-18'])).toMatchObject({'2026-09-14':{complete:false,planned:true},'2026-09-18':{complete:true}});expect(workoutPhotoDay(w)).toBe('2026-09-18');
 const reloaded=deserializeState(serializeState(s));expect(reloaded.workouts).toEqual(s.workouts);expect(deserializeState(serializeState(reloaded)).workouts).toEqual(reloaded.workouts);expect(reloaded.program.days.map(d=>d.id)).toEqual(plan.days.map(d=>d.id));
});
it.each([
 [{startedAt:'2026-09-17T21:50:00Z',completedAt:'2026-09-17T22:40:00Z',utcOffsetMinutesAtStart:-120},'2026-09-17'],
 [{startedAt:'2026-03-28T23:30:00Z',completedAt:'2026-03-29T02:30:00Z',timeZoneAtStart:'Europe/Ljubljana'},'2026-03-29'],
 [{startedAt:'2026-11-01T03:30:00Z',completedAt:'2026-11-01T07:30:00Z',timeZoneAtStart:'America/New_York'},'2026-10-31'],
 [{startedAt:'invalid',completedAt:'2026-09-18T23:30:00Z',utcOffsetMinutesAtStart:-120},'2026-09-19'],
 [{historicalImport:{version:2},sourceDate:{day:'2020-01-01'},startedAt:'2020-01-02T00:30:00Z'},'2020-01-01'],
 [{canonicalPlanDate:'2020-01-01'},'2020-01-01'],
 [{workoutDateKey:'2020-01-02',canonicalPlanDate:'2020-01-01'},'2020-01-02'],
])('uses actual start, recorded local zone, import fact or evidence-only legacy fallback: %j',(fields,date)=>expect(workoutPerformedDate({canonicalPlanDate:'2026-09-14',...fields})).toBe(date));
it('repairs old factual key from actual evidence without overwriting schedule or results',()=>{
 const s=fixture();s.workouts=[{id:'legacy',name:'Legacy',canonicalPlanDate:'2026-09-14',workoutDateKey:'2026-09-14',startedAt:'2026-09-18T10:00:00Z',completedAt:'2026-09-18T11:00:00Z',utcOffsetMinutesAtStart:-120,exercises:[]}];
 const one=deserializeState(s),two=deserializeState(serializeState(one));expect(one.workouts[0]).toMatchObject({id:'legacy',canonicalPlanDate:'2026-09-14',workoutDateKey:'2026-09-18'});expect(two.workouts).toEqual(one.workouts);
});
it('atomically exchanges two current dates, preserving IDs, original dates, history and next week',()=>{
 vi.setSystemTime(new Date('2026-09-14T12:00:00'));
 const s=fixture();s.program.days.forEach(d=>d.name='Same name');const [a,b]=flexibleSessions(s),before=structuredClone(s);
 const p=proposeFlexibleWeek(s,{mode:'swap',sessionId:a.logicalSessionId,otherSessionId:b.logicalSessionId});expect(p.status,p.error).toBe('ready');expect(s).toEqual(before);
 const r=applyFlexibleWeek(s,p);expect(r.status).toBe('applied');expect(r.state.program).toEqual(before.program);expect(r.state.workouts).toEqual(before.workouts);
 const reload=deserializeState(serializeState(r.state)),all=flexibleSessions(reload);expect(all.find(x=>x.logicalSessionId===a.logicalSessionId)).toMatchObject({originalDate:a.originalDate,scheduledDate:b.scheduledDate});expect(all.find(x=>x.logicalSessionId===b.logicalSessionId)).toMatchObject({originalDate:b.originalDate,scheduledDate:a.scheduledDate});expect(new Set(all.map(x=>x.logicalSessionId)).size).toBe(all.length);expect(all.filter(x=>x.originalDate>='2026-09-21').map(x=>[x.logicalSessionId,x.scheduledDate])).toEqual(flexibleSessions(before).filter(x=>x.originalDate>='2026-09-21').map(x=>[x.logicalSessionId,x.scheduledDate]));vi.setSystemTime(new Date('2026-09-18T12:00:00'));expect(missedFlexibleSessions(reload).map(x=>x.logicalSessionId)).toEqual([b.logicalSessionId,a.logicalSessionId]);
});
it.each(['completed','active','skipped','reserved','optional-active','same','closed','stale'])('rejects unsafe swap %s with neither side changed',kind=>{
 vi.setSystemTime(new Date('2026-09-14T12:00:00'));
 const s=fixture();const [a,b]=flexibleSessions(s);let p;
 if(kind==='completed')s.workouts=[{id:'done',logicalSessionId:b.logicalSessionId,completedAt:'2026-09-16T12:00:00'}];
 if(kind==='active')s.activeWorkout={logicalSessionId:b.logicalSessionId};
 if(kind==='skipped'){p=proposeFlexibleWeek(s,{mode:'skip',sessionId:b.logicalSessionId});Object.assign(s,applyFlexibleWeek(s,p).state);}
 if(kind==='reserved')s.todayAdaptation={programDayId:b.workoutId,date:b.scheduledDate};
 if(kind==='optional-active')s.activeOptionalSession={date:b.scheduledDate};
 if(kind==='closed')vi.setSystemTime(new Date('2026-09-21T12:00:00'));
 p=proposeFlexibleWeek(s,{mode:'swap',sessionId:a.logicalSessionId,otherSessionId:kind==='same'?a.logicalSessionId:b.logicalSessionId});
 if(kind==='stale'){expect(p.status).toBe('ready');s.activeWorkout={logicalSessionId:b.logicalSessionId};const before=structuredClone(s);expect(applyFlexibleWeek(s,p)).toMatchObject({status:'stale',state:before});}else expect(p.status).toBe('conflict');
});
it('moves date-bound edits safely when swapping two occurrences of the same template',()=>{
 const s=fixture(),all=flexibleSessions(s),a=all[0],b=all.find(x=>x.workoutId===a.workoutId&&x.logicalSessionId!==a.logicalSessionId);s.workoutOccurrenceOverrides={[a.scheduledDate]:{[a.workoutId]:{tag:'first'}},[b.scheduledDate]:{[b.workoutId]:{tag:'second'}}};
 const p=proposeFlexibleWeek(s,{mode:'swap',sessionId:a.logicalSessionId,otherSessionId:b.logicalSessionId});expect(p.status,p.error).toBe('ready');const r=applyFlexibleWeek(s,p);expect(r.state.workoutOccurrenceOverrides[a.scheduledDate][a.workoutId]).toEqual({tag:'second'});expect(r.state.workoutOccurrenceOverrides[b.scheduledDate][b.workoutId]).toEqual({tag:'first'});expect(r.state.workoutOccurrenceOverrides[b.scheduledDate][b.workoutId]).not.toBe(s.workoutOccurrenceOverrides[a.scheduledDate][a.workoutId]);
});

it('places e1RM, working load, PRs and weekly activity on the real date',()=>{
 const s=fixture();const exercise={exerciseId:'bench',sets:[{completed:true,planned:true,weight:80,reps:5}]};
 const old={id:'old',canonicalPlanDate:'2026-09-01',startedAt:'2026-09-10T12:00:00',completedAt:'2026-09-10T13:00:00',exercises:[exercise]};
 const w={id:'actual',canonicalPlanDate:'2026-09-07',startedAt:'2026-09-17T23:50:00',completedAt:'2026-09-18T00:40:00',exercises:[{...exercise,sets:[{completed:true,planned:true,weight:90,reps:5}]}]};
 s.workouts=[w,old];const perf=exercisePerformance(s.workouts,'bench');expect(perf.sessions.map(x=>x.date)).toEqual(['2026-09-10','2026-09-17']);expect(prEventsForWorkouts(s.workouts).some(e=>e.date==='2026-09-17')).toBe(true);
 const review=weeklyPerformanceReview(s,new Date('2026-09-18T12:00:00'));expect(JSON.stringify(review)).not.toContain('2026-09-07');
});
it('Freestyle captures real start regardless of the browsed scheduled date and survives midnight',()=>{
 vi.setSystemTime(new Date('2026-09-17T23:50:00'));let s=startFreestyleWorkout(fixture());s=addFreestyleExercise(s,s.program.days[0].exercises[0].exerciseId);Object.assign(s.activeWorkout.exercises[0].sets[0],{completed:true,weight:20,reps:8});vi.setSystemTime(new Date('2026-09-18T00:40:00'));const done=completeWorkout(s);expect(done.workouts[0].source).toBe('freestyle');expect(workoutPerformedDate(done.workouts[0])).toBe('2026-09-17');expect(done.workouts[0].logicalSessionId).toBeUndefined();
});

it('Repeat preserves a real Monday history record and creates a separate Thursday fact',()=>{
 vi.setSystemTime(new Date('2026-09-14T18:00:00'));let s=fixture();s.activeWorkout=startWorkout(s,flexibleSessions(s)[0].workout);s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>Object.assign(set,{completed:true,reps:8,weight:20})));s=completeWorkout(s);const old=structuredClone(s.workouts[0]);expect(workoutPerformedDate(old)).toBe('2026-09-14');
 vi.setSystemTime(new Date('2026-09-17T18:00:00'));const p=proposeWorkoutToday(s,{workoutId:old.id});expect(p.status,p.error).toBe('ready');s=applyWorkoutToday(s,p,{persist:()=>true});s.activeWorkout=startWorkout(s,repeatTemplate(s,'2026-09-17'));expect(s.activeWorkout.exercises.every(e=>e.sets.every(set=>!set.completed))).toBe(true);s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>Object.assign(set,{completed:true,reps:9,weight:25})));s=completeWorkout(s);expect(s.workouts).toHaveLength(2);expect(s.workouts[0]).toEqual(old);expect(s.workouts[1].id).not.toBe(old.id);expect(workoutPerformedDate(s.workouts[1])).toBe('2026-09-17');expect(s.workouts[1].repeatedFromWorkoutId).toBe(old.id);
});
