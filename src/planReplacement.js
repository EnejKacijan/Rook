import {validateProgram,isoDay,weekday} from './domain.js';
import {normalizeTrainingBlocksState} from './trainingBlocks.js';
import {addPlanVersion} from './planHistory.js';

// Build/Scratch share Import's persist-before-publish boundary, without using
// Import's source-specific conversion or changing historical session records.
export function persistProgramReplacement(state,program,{profile=state.profile,source='manual'}={},persist) {
  if(state.activeWorkout || state.activeOptionalSession) throw new Error('Finish or discard your active workout before replacing your plan.');
  const next=structuredClone(state);
  next.profile={...profile,onboardingComplete:true};
  if(!validateProgram(program,{...next.profile,sessionMinutes:null},{preserveSchedule:true}).valid)
    throw new Error('Review this plan before saving. Your current plan is unchanged.');
  next.program=structuredClone(program);
  next.selectedDate=isoDay();next.selectedDay=weekday();
  next.ai={...next.ai,lastPlanSource:source};
  next.todayAdaptation=null;next.weekScheduleOverrides={};next.workoutOccurrenceOverrides={};
  normalizeTrainingBlocksState(next);
  addPlanVersion(next,{previousProgram:state.program,source:state.program?'Plan replacement':'Initial plan',reason:state.program?'Plan replaced after review':'Manual plan created'});
  if(!persist(next)) throw new Error('ROOK couldn’t save this plan. Your current plan is unchanged. Try again.');
  return next;
}
