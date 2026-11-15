import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {adaptedTemplateForToday,blankState,buildProgram,deserializeState,plannedWorkoutForDate,serializeState} from './domain.js';
import {applyTodayAdjustment,createManualTodayPreparation} from './adjustToday.js';
import {flexiblePlanFingerprint,flexibleFingerprintBeforeHydration,applyFlexibleWeek,proposeFlexibleWeek,flexibleSessions,flexibleWeekConflict,temporaryScheduleReview} from './flexibleWeek.js';
import {applyScheduleRecovery,preserveMovesAfterPlanEdit,reviewScheduleRecovery} from './scheduleRecovery.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00'));});
afterEach(()=>vi.useRealTimers());
function fixture(){
  let state=blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
  state.program=buildProgram(state.profile);state.program.trainingBlock.startDate='2026-10-19';state.program.rotationStartDate='2026-10-19';state=deserializeState(state);
  const source=flexibleSessions(state).find(item=>item.scheduledDate==='2026-10-23');
  const next=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:'2026-10-24'})).state;
  return {state:next,id:source.logicalSessionId};
}
function adjustedFixture(){
  const {state,id}=fixture();
  const draft=createManualTodayPreparation(state);
  draft.workout.exercises[0].sets[0].weight=43;
  const result=applyTodayAdjustment(state,draft);
  expect(result.status).toBe('applied');
  return {state:result.state,id};
}
it('keeps a moved session and its one-off edits when a different workout in the plan changes',()=>{
  const {state,id}=adjustedFixture(),after=structuredClone(state);
  after.program.days[0].exercises[0].sets[0].weight=51;
  const next=preserveMovesAfterPlanEdit(state,after);
  expect(temporaryScheduleReview(next).unresolved).toHaveLength(0);
  expect(plannedWorkoutForDate(next,'2026-10-24').logicalSessionId).toBe(id);
  expect(adaptedTemplateForToday(next).exercises[0].sets[0].weight).toBe(43);
  expect(next.todayAdaptation).toEqual(state.todayAdaptation);
  expect(next.program).toEqual(after.program);
  expect(next.workouts).toEqual(state.workouts);
});
it('reviews an edited moved workout with a real preview for each version and keeps future weeks on the new plan',()=>{
  const {state,id}=adjustedFixture(),after=structuredClone(state),record=after.flexibleWeek.sessions[id];
  after.program.days.find(day=>day.id===record.workoutId).exercises[0].sets[0].weight=57;
  const pending=preserveMovesAfterPlanEdit(state,after);
  expect(temporaryScheduleReview(pending).unresolved.map(change=>change.id)).toEqual([id]);
  const review=reviewScheduleRecovery(pending,id);
  expect(review.adjustment.workout.exercises[0].sets[0].weight).toBe(43);
  expect(review.workout.exercises[0].sets[0].weight).toBe(57);
  const kept=deserializeState(serializeState(applyScheduleRecovery(pending,review,'keep-adjustment')),{strict:true});
  expect(adaptedTemplateForToday(kept).exercises[0].sets[0].weight).toBe(43);
  expect(plannedWorkoutForDate(kept,'2026-10-30').exercises[0].sets[0].weight).toBe(57);
  expect(temporaryScheduleReview(kept).unresolved).toHaveLength(0);
  const updated=applyScheduleRecovery(pending,review,'keep');
  expect(updated.todayAdaptation).toBeNull();
  expect(adaptedTemplateForToday(updated).exercises[0].sets[0].weight).toBe(57);
});
it('shows the saved one-off snapshot when the source was removed and clears only its linked edits on confirmation',()=>{
  const {state,id}=adjustedFixture(),record=state.flexibleWeek.sessions[id];
  state.program.days=state.program.days.filter(day=>day.id!==record.workoutId);
  state.workoutOccurrenceOverrides[record.scheduledDate]={[record.workoutId]:{},other:{skipWorkout:true}};
  const review=reviewScheduleRecovery(state,id);
  expect(review.workout).toBeNull();
  expect(review.adjustment.workout).toBeNull();
  expect(review.adjustment.snapshot.exercises[0].sets[0].weight).toBe(43);
  const next=applyScheduleRecovery(state,review,'remove');
  expect(next.todayAdaptation).toBeNull();
  expect(next.workoutOccurrenceOverrides[record.scheduledDate]).toEqual({other:{skipWorkout:true}});
  expect(next.workouts).toEqual(state.workouts);
});
it('repairs both sides of a stale swap together without reviving the original placements',()=>{
  const {state}=fixture();
  vi.setSystemTime(new Date('2026-10-19T12:00:00'));
  state.flexibleWeek=null;
  const sessions=flexibleSessions(state),first=sessions.find(item=>item.originalDate==='2026-10-19'),second=sessions.find(item=>item.originalDate==='2026-10-21');
  const swapped=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'swap',sessionId:first.logicalSessionId,otherSessionId:second.logicalSessionId}));
  expect(swapped.status).toBe('applied');
  const next=swapped.state;next.program.days[0].exercises[0].sets[0].weight=51;
  const review=reviewScheduleRecovery(next,first.logicalSessionId);
  expect(review.groupCount).toBe(2);
  const kept=applyScheduleRecovery(next,review,'keep');
  expect(plannedWorkoutForDate(kept,'2026-10-19').logicalSessionId).toBe(second.logicalSessionId);
  expect(plannedWorkoutForDate(kept,'2026-10-21').logicalSessionId).toBe(first.logicalSessionId);
  expect(temporaryScheduleReview(kept).unresolved).toEqual([]);
});
it('keeps a past skip as a fact, but makes an outdated future skip removable',()=>{
  const {state,id}=fixture(),record=state.flexibleWeek.sessions[id];
  record.skipped=true;state.program.version++;
  record.scheduledDate='2026-10-23';
  expect(flexibleWeekConflict(state)).toBe(false);
  expect(temporaryScheduleReview(state).recent[0].id).toBe(id);
  record.scheduledDate='2026-10-24';
  expect(flexibleWeekConflict(state)).toBe(true);
  expect(temporaryScheduleReview(state).unresolved[0].id).toBe(id);
  const removed=applyScheduleRecovery(state,reviewScheduleRecovery(state,id),'remove');
  expect(flexibleWeekConflict(removed)).toBe(false);
});
it('a duration estimate refresh never hides a move; valid legacy hashes migrate on reload',()=>{
  const {state,id}=fixture(),fingerprint=flexiblePlanFingerprint(state);
  state.program.days.forEach(day=>{day.estimatedMinutes=999;});
  expect(flexiblePlanFingerprint(state)).toBe(fingerprint);
  state.flexibleWeek.sessions[id].planFingerprint=flexibleFingerprintBeforeHydration(state).legacy;
  const loaded=deserializeState(serializeState(state),{strict:true});
  expect(loaded.program.days[0].estimatedMinutes).not.toBe(999);
  expect(loaded.flexibleWeek.sessions[id].planFingerprint).toBe(flexiblePlanFingerprint(loaded));
  expect(plannedWorkoutForDate(loaded,'2026-10-24').logicalSessionId).toBe(id);
  expect(temporaryScheduleReview(loaded).unresolved).toHaveLength(0);
});
it('repairs a stale Fri→Sat move explicitly, keeps its date and block identity, and survives reload',()=>{
  const {state,id}=fixture(),history=structuredClone(state.workouts);state.program.days[0].name='Changed other workout';
  expect(plannedWorkoutForDate(state,'2026-10-24')).toBeNull();
  const review=reviewScheduleRecovery(state,id);expect(review.workout).toBeTruthy();expect(temporaryScheduleReview(state).unresolved).toHaveLength(1);
  const next=applyScheduleRecovery(state,review,'keep');
  expect(plannedWorkoutForDate(next,'2026-10-24').logicalSessionId).toBe(id);
  expect(next.flexibleWeek.sessions[id].blockWeekNumber).toBe(1);expect(next.workouts).toEqual(history);expect(next.program).toEqual(state.program);
  expect(temporaryScheduleReview(deserializeState(next,{strict:true})).unresolved).toHaveLength(0);
});
it('does not silently rebind an already stale legacy record or a real prescription change during hydration',()=>{
  const {state,id}=fixture();state.flexibleWeek.sessions[id].planFingerprint=flexibleFingerprintBeforeHydration(state).legacy;
  state.program.days[0].exercises[0].sets.pop();
  const loaded=deserializeState(state);expect(temporaryScheduleReview(loaded).unresolved).toHaveLength(1);
  expect(loaded.flexibleWeek.sessions[id].planFingerprint).toBe(state.flexibleWeek.sessions[id].planFingerprint);
});
it('offers a truthful removal for a deleted template, retains the original record in an audit, and leaves history unchanged',()=>{
  const {state,id}=fixture(),record=structuredClone(state.flexibleWeek.sessions[id]);state.program.days=state.program.days.filter(day=>day.id!==record.workoutId);
  const review=reviewScheduleRecovery(state,id);expect(review.workout).toBeNull();expect(()=>applyScheduleRecovery(state,review,'keep')).toThrow('no longer available');
  const next=applyScheduleRecovery(state,review,'remove');expect(next.flexibleWeek.sessions[id]).toBeUndefined();expect(next.flexibleWeek.recoveryHistory[0]).toMatchObject(record);expect(next.workouts).toEqual(state.workouts);expect(next.program).toEqual(state.program);
});
it.each(['collision','block','past','active','completed'])('does not keep an unsafe %s move',kind=>{
  const {state,id}=fixture(),record=state.flexibleWeek.sessions[id];state.program.version++;
  if(kind==='collision'){const day=state.program.days[0];state.weekScheduleOverrides={'2026-10-19':{[day.id]:'2026-10-24'}};}
  if(kind==='block')state.program.trainingBlock.id='different-block';
  if(kind==='past')record.scheduledDate='2026-10-22';
  if(kind==='active')state.activeWorkout={id:'active'};
  if(kind==='completed')state.workouts.push({id:'done',logicalSessionId:id,completedAt:'2026-10-24T10:00:00',exercises:[]});
  if(['active','completed'].includes(kind))expect(()=>reviewScheduleRecovery(state,id)).toThrow();
  else {const review=reviewScheduleRecovery(state,id);expect(review.workout).toBeNull();expect(()=>applyScheduleRecovery(state,review,'keep')).toThrow();}
});
it('rejects changed reviews and midnight without mutating the previous schedule',()=>{
  const {state,id}=fixture();state.program.version++;const review=reviewScheduleRecovery(state,id),changed=structuredClone(state);changed.profile.units='lb';
  expect(()=>applyScheduleRecovery(changed,review,'keep')).toThrow('changed');
  vi.setSystemTime(new Date('2026-10-25T12:00:00'));expect(()=>applyScheduleRecovery(state,review,'remove')).toThrow('changed');
  expect(state.flexibleWeek.sessions[id].planFingerprint).not.toBe(flexiblePlanFingerprint(state));
});
