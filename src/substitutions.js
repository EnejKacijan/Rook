export const SUBSTITUTION_PREFERENCE_VERSION = 1;

const cleanId = (value) => String(value || "").trim();
const preferenceScopeKey = (sourceExerciseId, gymProfileId = null) =>
  `${cleanId(sourceExerciseId)}::${cleanId(gymProfileId) || "global"}`;
const stablePreferenceId = (sourceExerciseId, gymProfileId = null) =>
  `sub-${preferenceScopeKey(sourceExerciseId, gymProfileId)}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);

export function normalizeSubstitutionPreferencesState(
  state,
  now = new Date().toISOString(),
) {
  if (!state) return state;
  const validGymIds = new Set((state.gymProfiles || []).map((gym) => gym.id));
  const byScope = new Map();
  for (const value of Array.isArray(state.substitutionPreferences)
    ? state.substitutionPreferences
    : []) {
    const sourceExerciseId = cleanId(value?.sourceExerciseId);
    const replacementExerciseId = cleanId(value?.replacementExerciseId);
    const gymProfileId = cleanId(value?.gymProfileId) || null;
    if (
      !sourceExerciseId ||
      !replacementExerciseId ||
      sourceExerciseId === replacementExerciseId ||
      (gymProfileId && !validGymIds.has(gymProfileId))
    )
      continue;
    const preference = {
      schemaVersion: SUBSTITUTION_PREFERENCE_VERSION,
      id: cleanId(value.id) || stablePreferenceId(sourceExerciseId, gymProfileId),
      sourceExerciseId,
      replacementExerciseId,
      gymProfileId,
      createdAt: value.createdAt || now,
      updatedAt: value.updatedAt || value.createdAt || now,
    };
    const key = preferenceScopeKey(sourceExerciseId, gymProfileId);
    const previous = byScope.get(key);
    if (!previous || String(preference.updatedAt) >= String(previous.updatedAt))
      byScope.set(key, preference);
  }
  state.substitutionPreferences = [...byScope.values()];
  return state;
}

export function recordSubstitutionPreference(
  state,
  { sourceExerciseId, replacementExerciseId, gymProfileId = null },
  now = new Date().toISOString(),
) {
  normalizeSubstitutionPreferencesState(state, now);
  const sourceId = cleanId(sourceExerciseId);
  const replacementId = cleanId(replacementExerciseId);
  const scopedGymId = cleanId(gymProfileId) || null;
  if (!sourceId || !replacementId || sourceId === replacementId)
    return { status: "invalid" };
  if (scopedGymId && !(state.gymProfiles || []).some((gym) => gym.id === scopedGymId))
    return { status: "missing-gym" };
  const key = preferenceScopeKey(sourceId, scopedGymId);
  const existing = state.substitutionPreferences.find(
    (item) => preferenceScopeKey(item.sourceExerciseId, item.gymProfileId) === key,
  );
  const preference = {
    schemaVersion: SUBSTITUTION_PREFERENCE_VERSION,
    id: existing?.id || stablePreferenceId(sourceId, scopedGymId),
    sourceExerciseId: sourceId,
    replacementExerciseId: replacementId,
    gymProfileId: scopedGymId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  state.substitutionPreferences = [
    ...state.substitutionPreferences.filter(
      (item) => preferenceScopeKey(item.sourceExerciseId, item.gymProfileId) !== key,
    ),
    preference,
  ];
  return { status: existing ? "updated" : "created", preference };
}

function loadCapability(item = {}) {
  if (item.loadRequirement) return item.loadRequirement;
  if (item.bodyweight) return "optional";
  return item.equipment?.length ? "required" : "optional";
}

function overlapCount(left = [], right = []) {
  const values = new Set(right);
  return left.filter((item) => values.has(item)).length;
}

function preferenceWeight(preferences, sourceId, candidateId, gymProfileId) {
  const relevant = (preferences || []).filter(
    (item) =>
      item.sourceExerciseId === sourceId &&
      item.replacementExerciseId === candidateId,
  );
  if (gymProfileId && relevant.some((item) => item.gymProfileId === gymProfileId))
    return 240;
  if (relevant.some((item) => !item.gymProfileId)) return 180;
  return 0;
}

function rankingScore({
  source,
  candidate,
  profile,
  programExerciseIds,
  preferences,
  gymProfileId,
}) {
  const primary = source.muscles?.[0] || null;
  const secondary = source.muscles?.slice(1) || [];
  const candidatePrimary = candidate.muscles?.[0] || null;
  const repMin = Number(source.repMin ?? source.repRange?.[0]);
  const repMax = Number(source.repMax ?? source.repRange?.[1]);
  let score = 0;
  if (candidate.pattern === source.pattern) score += 70;
  if (primary && candidatePrimary === primary) score += 48;
  else if (primary && candidate.muscles?.includes(primary)) score += 30;
  score += overlapCount(secondary, candidate.muscles || []) * 9;
  if (candidate.kind === source.kind) score += 22;
  if (candidate.stability === source.stability) score += 10;
  if (candidate.progressionQuality === source.progressionQuality) score += 12;
  if (loadCapability(candidate) === loadCapability(source)) score += 10;
  if (Boolean(candidate.bodyweight) === Boolean(source.bodyweight)) score += 6;
  if (Number.isFinite(repMax)) {
    if (repMax <= 6 && candidate.kind === "compound") score += 8;
    if (repMin >= 8 && candidate.kind === source.kind) score += 5;
  }
  if (profile?.goal === "Build muscle" && candidate.stability === "high") score += 5;
  if (profile?.goal === "Get stronger" && candidate.equipment?.includes("barbell")) score += 5;
  if (
    profile?.exercisePreference === "Prefer free weights" &&
    candidate.equipment?.some((value) => ["barbell", "dumbbells"].includes(value))
  )
    score += 5;
  if (
    profile?.exercisePreference === "Prefer machines" &&
    candidate.equipment?.some((value) => ["machines", "cables"].includes(value))
  )
    score += 5;
  if (candidate.fatigueCost === "high" && source.fatigueCost !== "high") score -= 8;
  if (programExerciseIds.includes(candidate.id)) score -= 18;
  score += preferenceWeight(
    preferences,
    source.id || source.exerciseId,
    candidate.id,
    gymProfileId,
  );
  return score;
}

export function rankSubstitutionCandidates({
  source,
  candidates = [],
  profile = {},
  isAllowed = () => true,
  autoGeneratable = isAllowed,
  strictIntent = true,
  excludedExerciseIds = [],
  programExerciseIds = [],
  preferences = [],
  gymProfileId = null,
} = {}) {
  const sourceId = source?.id || source?.exerciseId;
  const excluded = new Set(excludedExerciseIds);
  if (!sourceId) return [];
  if (strictIntent && (!source.pattern || !source.muscles?.[0])) return [];
  const allowed = candidates.filter(
    (candidate) =>
      candidate?.id &&
      candidate.id !== sourceId &&
      !excluded.has(candidate.id) &&
      (!strictIntent || (candidate.pattern === source.pattern && candidate.muscles?.includes(source.muscles[0]))) &&
      (strictIntent ? autoGeneratable(candidate, profile) : isAllowed(candidate, profile)) &&
      (profile.experience !== "Beginner" || candidate.technicalDifficulty <= 2),
  );
  const intentSafe = strictIntent
    ? allowed.filter(
        (candidate) =>
          candidate.pattern === source.pattern &&
          candidate.muscles?.includes(source.muscles[0]),
      )
    : allowed;
  return intentSafe
    .map((candidate) => ({
      exercise: candidate,
      score: rankingScore({
        source,
        candidate,
        profile,
        programExerciseIds,
        preferences,
        gymProfileId,
      }),
      preferred: preferenceWeight(
        preferences,
        sourceId,
        candidate.id,
        gymProfileId,
      ) > 0,
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.exercise.name.localeCompare(right.exercise.name),
    );
}

export function substitutionReason(source, replacement, preferred = false) {
  if (preferred) return "Preferred replacement";
  const sameMovement = Boolean(source?.pattern && source.pattern === replacement?.pattern);
  const equipment = replacement?.equipment?.[0];
  const equipmentLabel = ({
    "barbell/rack/bench": "Barbell",
    barbell: "Barbell",
    dumbbells: "Dumbbells",
    cables: "Cable",
    machines: "Machine",
    "resistance bands": "Bands",
    "pull-up bar": "Pull-up bar",
    bodyweight: "Bodyweight",
  })[equipment] || (equipment ? equipment.charAt(0).toUpperCase() + equipment.slice(1) : null);
  if (sameMovement && equipmentLabel) return `Same movement · ${equipmentLabel}`;
  if (sameMovement) return "Same movement";
  if (source?.muscles?.[0] && replacement?.muscles?.includes(source.muscles[0]))
    return `Same target${equipmentLabel ? ` · ${equipmentLabel}` : ""}`;
  return equipmentLabel || "Available today";
}
