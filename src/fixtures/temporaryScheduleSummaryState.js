import {adjustWeekState} from './adjustWeekState.js';
import {flexiblePlanFingerprint} from '../flexibleWeek.js';

export function temporaryScheduleSummaryState() {
  const state=adjustWeekState({shifted:false}),fingerprint=flexiblePlanFingerprint(state);
  state.flexibleWeek={schemaVersion:1,revision:1,sessions:Object.fromEntries(state.program.days.slice(3).map((day,i)=>{
    const originalDate=i?'2026-10-02':'2026-10-01',id=`${day.id}:${originalDate}`;
    return [id,{id,workoutId:day.id,name:day.name,originalDate,scheduledDate:i?'2026-10-01':'2026-10-02',
      skipped:false,blockId:state.program.trainingBlock.id,blockWeekNumber:1,planFingerprint:fingerprint,updatedAt:'2026-09-29T10:00:00.000Z'}];
  }))};
  return state;
}
