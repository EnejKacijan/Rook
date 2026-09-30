import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {deserializeState,serializeState} from './domain.js';
import {applyFlexibleWeek,proposeFlexibleWeek,temporaryScheduleReview} from './flexibleWeek.js';
import {hideTemporaryScheduleSummary,temporaryScheduleSummaryHidden,normalizeTemporaryScheduleDismissal} from './temporarySchedulePresentation.js';
import {temporaryScheduleSummaryState} from './fixtures/temporaryScheduleSummaryState.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-29T12:00:00'));});
afterEach(()=>vi.useRealTimers());
it('Hide adds only a presentation receipt; all canonical schedule and training data stay identical',()=>{
  const state=temporaryScheduleSummaryState(),before=structuredClone(state),review=temporaryScheduleReview(state);
  expect(review.moved).toHaveLength(2);expect(review.unresolved).toHaveLength(0);
  const next=hideTemporaryScheduleSummary(state);
  expect({...next,dismissedTemporarySchedule:null}).toEqual(before);expect(state).toEqual(before);
  expect(next.flexibleWeek).toBe(state.flexibleWeek);expect(temporaryScheduleSummaryHidden(next)).toBe(true);
  expect(hideTemporaryScheduleSummary(next)).toBe(next);
});
it('save/reload retains the receipt and valid source/destination identities',()=>{
  const next=hideTemporaryScheduleSummary(temporaryScheduleSummaryState()),loaded=deserializeState(serializeState(next),{strict:true});
  expect(loaded.flexibleWeek).toEqual(next.flexibleWeek);expect(loaded.dismissedTemporarySchedule).toEqual(next.dismissedTemporarySchedule);
  expect(temporaryScheduleSummaryHidden(loaded)).toBe(true);
});
it('a new canonical Apply revision invalidates Hide while leaving its previous receipt harmless',()=>{
  const state=hideTemporaryScheduleSummary(temporaryScheduleSummaryState()),id=Object.keys(state.flexibleWeek.sessions)[0];
  const result=applyFlexibleWeek(state,proposeFlexibleWeek(state,{mode:'move',sessionId:id,toDate:'2026-10-04'}));
  expect(result.status).toBe('applied');expect(result.state.flexibleWeek.revision).toBe(2);
  expect(temporaryScheduleSummaryHidden(result.state)).toBe(false);
});
it('unresolved links override a saved Hide without needing a revision change and cannot be dismissed',()=>{
  const state=hideTemporaryScheduleSummary(temporaryScheduleSummaryState());
  state.flexibleWeek={...state.flexibleWeek,sessions:{...state.flexibleWeek.sessions}};
  const id=Object.keys(state.flexibleWeek.sessions)[0];state.flexibleWeek.sessions[id]={...state.flexibleWeek.sessions[id],planFingerprint:'stale'};
  expect(temporaryScheduleReview(state).unresolved).toHaveLength(1);
  expect(temporaryScheduleSummaryHidden(state)).toBe(false);expect(hideTemporaryScheduleSummary(state)).toBe(state);
});
it('removed or completed schedules ignore stale receipts',()=>{
  const state=hideTemporaryScheduleSummary(temporaryScheduleSummaryState());
  const removed={...state,flexibleWeek:null};expect(temporaryScheduleSummaryHidden(removed)).toBe(false);expect(hideTemporaryScheduleSummary(removed)).toBe(removed);
  const completed={...state,workouts:Object.keys(state.flexibleWeek.sessions).map(id=>({id:`done-${id}`,sourceOccurrenceId:id,completedAt:'2026-09-29T12:00:00'}))};
  expect(temporaryScheduleReview(completed).items).toHaveLength(0);expect(temporaryScheduleSummaryHidden(completed)).toBe(false);
});
it('a recreated schedule with the same revision and IDs does not inherit the old receipt',()=>{
  const state=hideTemporaryScheduleSummary(temporaryScheduleSummaryState()),recreated=temporaryScheduleSummaryState();
  recreated.program=state.program;recreated.flexibleWeek=structuredClone(state.flexibleWeek);recreated.dismissedTemporarySchedule=state.dismissedTemporarySchedule;
  Object.values(recreated.flexibleWeek.sessions).forEach(record=>record.updatedAt='2026-09-29T14:00:00.000Z');
  expect(temporaryScheduleSummaryHidden(recreated)).toBe(false);
});
it('changed placement in a legacy untimestamped revision cannot inherit Hide',()=>{
  const state=temporaryScheduleSummaryState();Object.values(state.flexibleWeek.sessions).forEach(record=>delete record.updatedAt);
  const hidden=hideTemporaryScheduleSummary(state),changed=structuredClone(hidden);
  Object.values(changed.flexibleWeek.sessions)[0].scheduledDate='2026-10-04';
  expect(temporaryScheduleSummaryHidden(hidden)).toBe(true);expect(temporaryScheduleSummaryHidden(changed)).toBe(false);
});
it('next week ignores an old dismissal even when an occurrence carried forward remains inspectable',()=>{
  const state=temporaryScheduleSummaryState();Object.values(state.flexibleWeek.sessions)[0].scheduledDate='2026-10-10';
  const hidden=hideTemporaryScheduleSummary(state);vi.setSystemTime(new Date('2026-10-05T12:00:00'));
  expect(temporaryScheduleReview(hidden).items.length).toBeGreaterThan(0);expect(temporaryScheduleSummaryHidden(hidden)).toBe(false);
});
it.each([undefined,true,'forever',{revision:1},{programId:'x',week:'2026-09-28',revision:1,occurrences:[null]}])('missing/invalid presentation metadata never rejects an otherwise valid old profile (%j)',value=>{
  const state=temporaryScheduleSummaryState();state.dismissedTemporarySchedule=value;
  expect(normalizeTemporaryScheduleDismissal(value)).toBeNull();
  const loaded=deserializeState(serializeState(state),{strict:true});expect(loaded.dismissedTemporarySchedule).toBeNull();expect(loaded.flexibleWeek).toEqual(state.flexibleWeek);
});
