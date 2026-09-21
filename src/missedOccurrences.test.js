import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {blankState,buildProgram,serializeState,deserializeState,plannedWorkoutForDate,startWorkout,completeWorkout,missedPlannedWorkouts,isoDay,weekKey,workoutPerformedDate} from './domain.js';
import {missedFlexibleSessions,flexibleSessions,proposeFlexibleWeek,applyFlexibleWeek,addCalendarDays} from './flexibleWeek.js';
import {coachMissedReply} from './coachMissed.js';
import {proposeWorkoutToday,applyWorkoutToday} from './useWorkoutToday.js';
import {combineSources,buildCombinedProposal,applyCombinedProposal} from './combineWorkouts.js';
import {cancelCombinedWorkout} from './combinedWorkoutLifecycle.js';
import {AIService} from './aiService.js';
export function missedFixture(){const s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});s.program=buildProgram(s.profile);s.program.trainingBlock.startDate='2026-09-14';s.program.createdAt='2026-09-14T12:00:00';s.selectedDate='2026-09-18';return deserializeState(s);}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-18T12:00:00'));});
afterEach(()=>vi.useRealTimers());
const ids=s=>missedFlexibleSessions(s).map(i=>i.logicalSessionId);
const move=(s,id,toDate)=>{const p=proposeFlexibleWeek(s,{mode:'move',sessionId:id,toDate});expect(p.status,p.error).toBe('ready');const r=applyFlexibleWeek(s,p);expect(r.status,r.error).toBe('applied');return r.state;};
it.each([0,1,2,3])('has exactly %i actionable occurrences, sorted by current local date',count=>{
 const s=missedFixture();vi.setSystemTime(new Date(['2026-09-14','2026-09-16','2026-09-18','2026-09-19'][count]+'T12:00:00'));
 const actual=missedFlexibleSessions(s);expect(actual).toHaveLength(count);expect(actual.map(i=>i.logicalSessionId)).toEqual(s.program.days.slice(0,count).map((d,i)=>`${d.id}:${['2026-09-14','2026-09-16','2026-09-18'][i]}`));
});
it('same names remain distinct; completed Wednesday leaves Monday; browsing old dates does not change actual today',()=>{
 const s=missedFixture();s.program.days.forEach(d=>d.name='Same');const [mon,wed]=missedFlexibleSessions(s);
 s.workouts=[{id:'real',logicalSessionId:wed.logicalSessionId,programDayId:wed.workoutId,canonicalPlanDate:wed.scheduledDate,completedAt:'2026-09-16T12:00:00'}];
 s.selectedDate='2026-09-15';expect(ids(s)).toEqual([mon.logicalSessionId]);expect(missedPlannedWorkouts(s).map(i=>i.logicalSessionId)).toEqual(ids(s));
});
it('moves one identity, re-misses by destination and sorts by that date, then reloads exactly once',()=>{
 let s=missedFixture();const [mon,wed]=missedFlexibleSessions(s),plan=structuredClone(s.program);
 vi.setSystemTime(new Date('2026-09-15T12:00:00'));s=move(s,mon.logicalSessionId,'2026-09-17');
 vi.setSystemTime(new Date('2026-09-18T12:00:00'));s=deserializeState(serializeState(s));
 expect(ids(s)).toEqual([wed.logicalSessionId,mon.logicalSessionId]);expect(missedFlexibleSessions(s)[1]).toMatchObject({originalDate:'2026-09-14',scheduledDate:'2026-09-17'});
 expect(plannedWorkoutForDate(s,'2026-09-14')).toBeNull();expect(Object.keys(s.flexibleWeek.sessions)).toEqual([mon.logicalSessionId]);expect(s.workouts).toEqual([]);expect(s.program).toEqual(plan);
});
it('skip and active source are not missed and skip creates no factual completion',()=>{
 let s=missedFixture();const [mon,wed]=missedFlexibleSessions(s);s=applyFlexibleWeek(s,proposeFlexibleWeek(s,{mode:'skip',sessionId:mon.logicalSessionId})).state;
 s.selectedDate=wed.scheduledDate;s.activeWorkout=startWorkout(s,{...wed.workout,logicalSessionId:wed.logicalSessionId});expect(ids(s)).toEqual([]);expect(s.workouts).toEqual([]);
});
it('ordinary temporary reservation is not offered as missed',()=>{
 const s=missedFixture(),[mon,wed]=missedFlexibleSessions(s);s.todayAdaptation={id:'reserve',date:mon.scheduledDate,programDayId:mon.workoutId,mode:'less-time'};expect(ids(s)).toEqual([wed.logicalSessionId]);
});
it('Combine reserves sources, cancellation restores them, successful completion resolves without fake source history',()=>{
 let s=missedFixture();vi.setSystemTime(new Date('2026-09-19T12:00:00'));const sources=ids(s).slice(0,2),p=buildCombinedProposal(s,{sourceIds:sources,minutes:60});expect(p.status,p.error).toBe('ready');
 s=applyCombinedProposal(s,p.proposal,()=>true);expect(ids(s).some(id=>sources.includes(id))).toBe(false);expect(ids(cancelCombinedWorkout(s)).slice(0,2)).toEqual(sources);
 s.selectedDate='2026-09-19';s.activeWorkout=startWorkout(s,{...s.todayAdaptation.workout,id:s.todayAdaptation.id,todayOnlyAdjustment:s.todayAdaptation});
 s.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>{set.completed=true;set.reps=e.repMin||8;}));s=deserializeState(serializeState(completeWorkout(s)));
 expect(s.workouts).toHaveLength(1);expect(s.workouts[0].combinedSourcesResolved).toBe(true);expect(workoutPerformedDate(s.workouts[0])).toBe('2026-09-19');expect(ids(s).some(id=>sources.includes(id))).toBe(false);
});
it('week closure removes backlog without skipping; explicit carry lives through destination week only',()=>{
 let s=missedFixture();const mon=ids(s)[0];s=move(s,mon,'2026-09-22');
 vi.setSystemTime(new Date('2026-09-23T12:00:00'));expect(ids(s)).toContain(mon);expect(missedFlexibleSessions(s).every(i=>i.scheduledDate>='2026-09-21')).toBe(true);
 vi.setSystemTime(new Date('2026-09-28T12:00:00'));expect(ids(s)).toEqual([]);expect(flexibleSessions(s).find(i=>i.logicalSessionId===mon).status).toBe('missed');expect(s.flexibleWeek.sessions[mon].skipped).toBe(false);expect(s.workouts).toEqual([]);
});
it('a completed block or replaced plan does not offer old obligations',()=>{
 const s=missedFixture();s.program.trainingBlock.completed=true;expect(ids(s)).toEqual([]);
});
it('an explicit old calendar identity can move without reviving the entire backlog',()=>{
 let s=missedFixture();const old=ids(s)[0];vi.setSystemTime(new Date('2026-10-02T12:00:00'));
 expect(ids(s)).not.toContain(old);const before=ids(s);s=move(s,old,'2026-10-03');
 expect(plannedWorkoutForDate(s,'2026-10-03').logicalSessionId).toBe(old);expect(ids(s)).toEqual(before);expect(plannedWorkoutForDate(s,'2026-09-14')).toBeNull();
});
it('target conflict requires explicit displacement and persistence failure publishes nothing',()=>{
 const s=missedFixture(),mon=ids(s)[0],snapshot=serializeState(s);expect(proposeFlexibleWeek(s,{mode:'move',sessionId:mon,toDate:'2026-09-18'}).status).toBe('conflict');
 expect(proposeWorkoutToday(s,{sessionId:mon}).status).toBe('choose-date');const p=proposeWorkoutToday(s,{sessionId:mon,displacedToDate:'2026-09-19'});expect(p.status).toBe('ready');
 expect(()=>applyWorkoutToday(s,p,{persist:()=>false})).toThrow(/previous schedule/);expect(serializeState(s)).toBe(snapshot);
 let next=applyWorkoutToday(s,p,{persist:()=>true});next=deserializeState(serializeState(next));expect(plannedWorkoutForDate(next,'2026-09-18').logicalSessionId).toBe(mon);
 next.activeWorkout=startWorkout(next,plannedWorkoutForDate(next,'2026-09-18'));next.activeWorkout.exercises.forEach(e=>e.sets.forEach(set=>set.completed=true));next=deserializeState(serializeState(completeWorkout(next)));expect(next.workouts).toHaveLength(1);expect(next.workouts[0].logicalSessionId).toBe(mon);expect(ids(next)).not.toContain(mon);
});
it('Coach first/last/yesterday/date differ intentionally from chooser ordering; generic plural asks',()=>{
 const s=missedFixture(),[mon,wed]=ids(s);expect(coachMissedReply(s,'I missed my last workout').missedChoices.map(c=>c.id)).toEqual([wed]);
 expect(coachMissedReply(s,'I missed the first workout this week').missedChoices.map(c=>c.id)).toEqual([mon]);
 expect(coachMissedReply(s,'Reschedule my missed workouts').missedChoices.map(c=>c.id)).toEqual([mon,wed]);
 expect(coachMissedReply(s,'Reschedule missed Monday').missedChoices[0].id).toBe(mon);
 expect(coachMissedReply(s,'Reschedule missed 2026-09-16').missedChoices[0].id).toBe(wed);
 expect(coachMissedReply(s,'missed yesterday').missedChoices).toEqual([]);expect(coachMissedReply(s,'Combine my last two missed workouts')).toBeNull();
 expect(combineSources(s).filter(i=>i.status==='missed').map(i=>i.logicalSessionId)).toEqual([mon,wed]);
});
it.each(['2026-03-29','2026-10-25'])('local noon calendar arithmetic survives DST boundary %s',date=>{
 const next=addCalendarDays(date,1);expect(addCalendarDays(next,-1)).toBe(date);expect(isoDay(new Date(`${date}T00:05:00`))).toBe(date);expect(weekKey(next)).toBe(next);
});
it('Coach entry point resolves missed IDs before asking any provider',async()=>{
 const s=missedFixture(),reply=await AIService.coach(s,'Reschedule my missed workouts');expect(reply.source).toBe('missed-occurrence');expect(reply.action).toBeNull();expect(reply.missedChoices.map(c=>c.id)).toEqual(ids(s));
});
