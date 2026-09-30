import {isoDay,weekKey} from './domain.js';
import {temporaryScheduleReview} from './flexibleWeek.js';

// A presentation receipt, never schedule authority. Reuse the schedule revision
// and occurrence identities/timestamps; dates also cover older untimestamped
// records and prevent a recreated revision from inheriting an old dismissal.
export function temporaryScheduleReceipt(state) {
  if(!state.flexibleWeek || !state.program?.id)return null;
  return {programId:state.program.id,week:weekKey(isoDay()),revision:state.flexibleWeek.revision,
    occurrences:Object.values(state.flexibleWeek.sessions||{}).map(record=>({
      id:record.id,updatedAt:record.updatedAt||null,originalDate:record.originalDate,scheduledDate:record.scheduledDate,
    })).sort((a,b)=>a.id.localeCompare(b.id))};
}
export function normalizeTemporaryScheduleDismissal(value) {
  if(!value || typeof value.programId!=='string' || typeof value.week!=='string' ||
    !Number.isSafeInteger(value.revision) || value.revision<0 || !Array.isArray(value.occurrences) || !value.occurrences.length ||
    !value.occurrences.every(item=>item && typeof item.id==='string' && typeof item.originalDate==='string' &&
      typeof item.scheduledDate==='string' && (item.updatedAt===null || typeof item.updatedAt==='string')))return null;
  return {programId:value.programId,week:value.week,revision:value.revision,
    occurrences:value.occurrences.map(({id,updatedAt,originalDate,scheduledDate})=>({id,updatedAt,originalDate,scheduledDate}))};
}
export function temporaryScheduleSummaryHidden(state,review=temporaryScheduleReview(state)) {
  // A receipt can never suppress unresolved work or an unrelated/expired scope.
  if(!review.items.length || review.unresolved.length)return false;
  const saved=normalizeTemporaryScheduleDismissal(state.dismissedTemporarySchedule),current=temporaryScheduleReceipt(state);
  return Boolean(saved && current && saved.programId===current.programId && saved.week===current.week &&
    saved.revision===current.revision && saved.occurrences.length===current.occurrences.length &&
    saved.occurrences.every((item,i)=>['id','updatedAt','originalDate','scheduledDate'].every(key=>item[key]===current.occurrences[i][key])));
}
export function hideTemporaryScheduleSummary(state) {
  const review=temporaryScheduleReview(state);
  if(!review.items.length || review.unresolved.length || temporaryScheduleSummaryHidden(state,review))return state;
  const receipt=normalizeTemporaryScheduleDismissal(temporaryScheduleReceipt(state));
  return receipt ? {...state,dismissedTemporarySchedule:receipt} : state;
}
