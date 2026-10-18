// This controls proactive logger UI only. Recommendation calculations,
// previous values and the on-demand Progress overview do not depend on it.
export const progressionTipsEnabled = profile => profile?.showProgressionTips !== false;

export function setProgressionTipsEnabled(state, enabled) {
  if (state.profile.showProgressionTips === enabled) return state;
  return {...state, profile: {...state.profile, showProgressionTips: enabled}};
}
