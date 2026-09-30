import { defaultProfile, WEEKDAYS, combinedTrainingPriorities } from './domain.js';
import { normalizeGymEquipment } from './gymProfiles.js';
import { onboardingSplitOptions } from './splitPreferences.js';
import { TRAINING_PRIORITY_OPTIONS } from './prioritySelection.js';
import { persistProgramReplacement } from './planReplacement.js';

export const PLAN_GOALS = ['Build muscle', 'Get stronger', 'Lose fat', 'General fitness', 'Athletic performance'];
export const PLAN_EXPERIENCES = ['Beginner', 'Intermediate', 'Advanced'];
export const PLAN_EFFORT_STYLES = ['Balanced workload · usually 3 sets · 1–2 RIR', 'Fewer hard sets · 2 sets · 1 RIR', 'More moderate sets · 3–4 sets · 2–3 RIR'];
export const PLAN_BUILDER_STEPS = ['personal', 'goal', 'experience', 'schedule', 'setup', 'priorities', 'effortStyle', 'preferences'];
export const PLAN_BUILDER_FREQUENCIES = Object.freeze([2, 3, 4, 5, 6]);
const ages = ['Under 18', '18–29', '30–39', '40–49', '50–59', '60+'];
const environments = ['Commercial gym', 'Home gym', 'Both'];
const exercisePreferences = ['Prefer free weights', 'Prefer machines', 'No preference'];
const member = (options, value) => options.includes(value) ? value : null;
const priorities = values => [...new Set((Array.isArray(values) ? values : []).filter(value => TRAINING_PRIORITY_OPTIONS.includes(value)))];

// Missing inputs stay missing. Defaults may support optional controls, but are
// never evidence that a stored answer exists or that the user reviewed it.
export function createPlanBuilderDraft(profile = {}) {
  const base = { ...defaultProfile(), ...structuredClone(profile) };
  const manual = priorities(profile.prioritySources?.manual ?? profile.priorities);
  const confirmed = priorities(profile.prioritySources?.physiqueConfirmed);
  const structure = onboardingSplitOptions(profile.daysPerWeek);
  const trainingPreferences = typeof profile.trainingPreferences === 'string' ? profile.trainingPreferences : '';
  const split = structure.find(option => option.id === profile.trainingSplitChoice) ||
    (trainingPreferences.trim() ? structure.find(option => option.value === trainingPreferences) || structure.find(option => option.id === 'other') : null);
  return {
    ...base,
    name: profile.name || '', ageRange: member(ages, profile.ageRange),
    goal: member(PLAN_GOALS, profile.goal), experience: member(PLAN_EXPERIENCES, profile.experience),
    daysPerWeek: member(PLAN_BUILDER_FREQUENCIES, profile.daysPerWeek),
    availableDays: WEEKDAYS.filter(day => Array.isArray(profile.availableDays) && profile.availableDays.includes(day)),
    sessionMinutes: member([30, 45, 60, 75, 90, 120], profile.sessionMinutes),
    environment: member(environments, profile.trainingEnvironmentChoice || profile.environment),
    primaryTrainingEnvironment: member(environments.slice(0, 2), profile.primaryTrainingEnvironment || profile.environment),
    equipment: normalizeGymEquipment(profile.equipment),
    priorities: manual.length || confirmed.length ? combinedTrainingPriorities(manual, confirmed) : [],
    prioritySources: { ...base.prioritySources, manual, physiqueConfirmed: confirmed },
    effortStyle: member(PLAN_EFFORT_STYLES, profile.effortStyle),
    exercisePreference: member(exercisePreferences, profile.exercisePreference),
    trainingPreferences, trainingSplitChoice: split?.id || null,
    avoid: typeof profile.avoid === 'string' ? profile.avoid : '',
    followUpAnswers: Array.isArray(profile.followUpAnswers) ? structuredClone(profile.followUpAnswers) : [],
  };
}

export function missingPlanBuilderStep(profile, reviewed = null) {
  const valid = {
    personal: ages.includes(profile.ageRange),
    goal: PLAN_GOALS.includes(profile.goal) && !(profile.ageRange === 'Under 18' && profile.goal === 'Lose fat'),
    experience: PLAN_EXPERIENCES.includes(profile.experience),
    schedule: PLAN_BUILDER_FREQUENCIES.includes(profile.daysPerWeek) && [30, 45, 60, 75, 90, 120].includes(profile.sessionMinutes) &&
      WEEKDAYS.filter(day => profile.availableDays?.includes(day)).length >= profile.daysPerWeek,
    setup: environments.includes(profile.environment) && normalizeGymEquipment(profile.equipment).length > 0 &&
      (profile.environment !== 'Both' || environments.slice(0, 2).includes(profile.primaryTrainingEnvironment)),
    priorities: priorities(profile.priorities).length > 0,
    effortStyle: PLAN_EFFORT_STYLES.includes(profile.effortStyle),
    preferences: exercisePreferences.includes(profile.exercisePreference) &&
      onboardingSplitOptions(profile.daysPerWeek).some(option => option.id === profile.trainingSplitChoice) &&
      (profile.trainingSplitChoice !== 'other' || Boolean(profile.trainingPreferences?.trim())),
  };
  return PLAN_BUILDER_STEPS.find(step => !valid[step] || reviewed && !reviewed.has(step)) || null;
}

const confirmedFields = [
  'name', 'ageRange', 'sex', 'units', 'goal', 'experience', 'daysPerWeek', 'availableDays', 'sessionMinutes',
  'environment', 'trainingEnvironmentChoice', 'primaryTrainingEnvironment', 'equipment', 'priorities', 'prioritySources',
  'avoid', 'trainingPreferences', 'trainingSplitChoice', 'exercisePreference', 'effortStyle', 'rirEnabled',
  'trainingSafetyAnalysis', 'trainingSafetyConfirmedHash', 'trainingSafetyClearanceAttestation',
  'trainingSafetyClearanceDeclinedHash', 'trainingSafetyClearanceResponse', 'trainingSafetyLimitsResponse', 'trainingSafetySupplementalLimits',
];

export function activatePlanBuilder(state, program, answers, source, persist) {
  if (missingPlanBuilderStep(answers)) throw new Error('Review the missing plan preferences before saving.');
  const profile = { ...state.profile, preferredTrainingStyle: 'plan' };
  for (const field of confirmedFields) {
    if (Object.hasOwn(answers, field)) profile[field] = structuredClone(answers[field]);
  }
  // The default gym owns reusable equipment. Update it only on activation, so
  // normal hydration cannot restore the old equipment over confirmed answers.
  const base = structuredClone(state);
  const gym = base.gymProfiles?.find(item => item.id === base.defaultGymProfileId);
  if (gym && (gym.environment !== profile.environment || JSON.stringify(gym.equipment) !== JSON.stringify(profile.equipment))) {
    gym.environment = profile.environment; gym.equipment = [...profile.equipment]; gym.updatedAt = new Date().toISOString();
  }
  return persistProgramReplacement(base, program, { profile, source }, persist);
}
