import {combinedAdjustment} from './combinedWorkoutLifecycle.js';

// A display preference for this adjustment revision, never reservation authority.
export function combinedWorkoutNoticeKey(state) {
  const adjustment=combinedAdjustment(state);
  return adjustment ? JSON.stringify([state.profile.id,state.program?.id,adjustment.id,adjustment.date,adjustment.revision||0]) : null;
}
export function combinedWorkoutNoticeHidden(state) {
  const key=combinedWorkoutNoticeKey(state);
  return key!==null && state.dismissedCombinedWorkoutNoticeKey===key;
}
export function setCombinedWorkoutNoticeHidden(state,hidden) {
  const key=combinedWorkoutNoticeKey(state);
  if(key===null)return state;
  const dismissed=hidden ? key : null;
  return state.dismissedCombinedWorkoutNoticeKey===dismissed ? state : {...state,dismissedCombinedWorkoutNoticeKey:dismissed};
}
