import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {blankState,buildProgram,deserializeState,plannedWorkoutForDate,serializeState} from './domain.js';
import {flexiblePlanFingerprint,flexibleFingerprintBeforeHydration,applyFlexibleWeek,proposeFlexibleWeek,flexibleSessions,temporaryScheduleReview} from './flexibleWeek.js';
import {applyScheduleRecovery,reviewScheduleRecovery} from './scheduleRecovery.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00'));});
afterEach(()=>vi.useRealTimers());
function fixture(){
  let state=blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],environment:'Commercial gym',priorities:['Balanced'],onboardingComplete:true});
  state.program=buildProgram(state.profile);state.program.trainingBlock.startDate='2026-10-19';state.program.rotationStartDate='2026-10-19';state=deserializeState(state);
  const source=flexibleSessions(state).find(item=>item.scheduledDate==='2026-10-23');
  const next=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:source.logicalSessionId,toDate:'2026-10-24'})).state;
  return {state:next,id:source.logicalSessionId};
}
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
