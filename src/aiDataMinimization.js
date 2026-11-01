// Only training fields leave the device in structured profile context. Free
// text deliberately supplied for the request is retained, not falsely redacted.
const fields = new Set(['ageRange','sex','goal','experience','daysPerWeek','availableDays','sessionMinutes',
  'environment','trainingEnvironmentChoice','primaryTrainingEnvironment','equipment','priorities','prioritySources',
  'confirmedPhysiquePriorities','avoid','trainingPreferences','exercisePreference','effortStyle','followUpAnswers',
  'units','increments','restDefaults','preferredTrainingStyle','trainingSplitChoice','compiledTrainingSafety',
  'customWeeklyStructure','customTrainingStructure']);
export const trainingProfileForAI = profile => Object.fromEntries(Object.entries(profile || {}).filter(([key])=>fields.has(key)));
export function minimizeAiPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const result = {...payload};
  if (result.profile) result.profile = trainingProfileForAI(result.profile);
  if (result.context?.profile) result.context = {...result.context,profile:trainingProfileForAI(result.context.profile)};
  return result;
}
