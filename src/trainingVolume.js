export const STIMULUS_PROFILE_BY_PATTERN = Object.freeze({
  "horizontal-push": Object.freeze({ Chest: 1, AnteriorDelts: 0.5, Triceps: 0.5 }),
  "incline-push": Object.freeze({ Chest: 1, AnteriorDelts: 0.5, Triceps: 0.5 }),
  "chest-isolation": Object.freeze({ Chest: 1 }),
  "horizontal-pull": Object.freeze({ Back: 1, Biceps: 0.5, RearDelts: 0.5 }),
  "vertical-pull": Object.freeze({ Back: 1, Biceps: 0.5 }),
  "upper-back-pull": Object.freeze({ Back: 1, Biceps: 0.5, RearDelts: 0.5 }),
  "vertical-push": Object.freeze({ AnteriorDelts: 1, Triceps: 0.5 }),
  "shoulder-isolation": Object.freeze({ LateralDelts: 1 }),
  "rear-delt": Object.freeze({ RearDelts: 1 }),
  "elbow-flexion": Object.freeze({ Biceps: 1 }),
  "elbow-extension": Object.freeze({ Triceps: 1 }),
  squat: Object.freeze({ Quads: 1, Glutes: 0.5 }),
  "single-leg": Object.freeze({ Quads: 1, Glutes: 0.5 }),
  hinge: Object.freeze({ Hamstrings: 1, Glutes: 0.5 }),
  "knee-flexion": Object.freeze({ Hamstrings: 1 }),
  "knee-extension": Object.freeze({ Quads: 1 }),
  "hip-extension": Object.freeze({ Glutes: 1, Hamstrings: 0.5 }),
  calf: Object.freeze({ Calves: 1 }),
  core: Object.freeze({ Core: 1 }),
});

const EXERCISE_STIMULUS_OVERRIDES = Object.freeze({
  "straight-arm-cable-pulldown": Object.freeze({ Back: 1 }),
});

export function stimulusProfileForItem(item) {
  if (!item) return {};
  return EXERCISE_STIMULUS_OVERRIDES[item.id] || STIMULUS_PROFILE_BY_PATTERN[item.pattern] || {};
}

export function accumulateStimulus(exercises = [], resolveItem, setCount = exercise =>
  Array.isArray(exercise?.sets)
    ? exercise.sets.filter(set => set?.planned !== false && !set?.added).length
    : Number(exercise?.sets) || 0) {
  const volume = {};
  for (const exercise of exercises || []) {
    const item = resolveItem(exercise?.exerciseId);
    const sets = setCount(exercise);
    for (const [muscle, credit] of Object.entries(stimulusProfileForItem(item)))
      volume[muscle] = Number(((volume[muscle] || 0) + sets * credit).toFixed(1));
  }
  return volume;
}

export function stimulusMutationPreservesPolicy({
  volume = {},
  targets = {},
  addProfile = {},
  addSets = 0,
  removeProfile = {},
  removeSets = 0,
  protectedTargetMuscles = [],
  priorityMuscles = [],
} = {}) {
  const targetProtected = new Set(protectedTargetMuscles);
  const priorityProtected = new Set(priorityMuscles);
  return Object.entries(targets).every(([muscle, policy]) => {
    const current = volume[muscle] || 0;
    const next = current + (addProfile[muscle] || 0) * addSets -
      (removeProfile[muscle] || 0) * removeSets;
    const protectedMinimum = priorityProtected.has(muscle) || targetProtected.has(muscle)
      ? policy.target
      : policy.floor;
    return next >= Math.min(current, protectedMinimum) && next <= policy.hardCap;
  });
}

export const HYPERTROPHY_VOLUME_POLICY = Object.freeze({
  Beginner: Object.freeze({
    Chest: [6, 8], Back: [6, 9], Quads: [6, 8], Hamstrings: [4, 6], Glutes: [4, 6],
    Biceps: [3, 5], Triceps: [3, 5], AnteriorDelts: [2, 4], LateralDelts: [2, 4], RearDelts: [2, 4], Calves: [3, 5], Core: [2, 4],
  }),
  Intermediate: Object.freeze({
    Chest: [7, 9], Back: [8, 10], Quads: [7, 9], Hamstrings: [6, 8], Glutes: [6, 8],
    Biceps: [4, 6], Triceps: [4, 6], AnteriorDelts: [3, 5], LateralDelts: [3, 5], RearDelts: [3, 5], Calves: [4, 6], Core: [3, 5],
  }),
  Advanced: Object.freeze({
    Chest: [8, 10], Back: [8, 12], Quads: [8, 10], Hamstrings: [6, 9], Glutes: [6, 9],
    Biceps: [4, 7], Triceps: [4, 7], AnteriorDelts: [4, 6], LateralDelts: [4, 6], RearDelts: [4, 6], Calves: [6, 7], Core: [4, 6],
  }),
});

const PRIORITY_GROUPS_BY_LABEL = Object.freeze({
  Chest: { muscles: ["Chest"] },
  Back: { muscles: ["Back"] },
  Shoulders: { muscles: ["AnteriorDelts", "LateralDelts", "RearDelts"] },
  Arms: { muscles: ["Biceps", "Triceps"] },
  Quads: { muscles: ["Quads"] },
  "Hamstrings / glutes": { muscles: ["Hamstrings", "Glutes"] },
  Calves: { muscles: ["Calves"] },
  Core: { muscles: ["Core"] },
  AnteriorDelts: { muscles: ["AnteriorDelts"] },
  LateralDelts: { muscles: ["LateralDelts"] },
  RearDelts: { muscles: ["RearDelts"] },
  Biceps: { muscles: ["Biceps"] },
  Triceps: { muscles: ["Triceps"] },
  Hamstrings: { muscles: ["Hamstrings"] },
  Glutes: { muscles: ["Glutes"] },
});

const CONFIRMED_PRIORITY_GROUPS = Object.freeze({
  upper_chest: { muscles: ["Chest"], patterns: ["incline-push"] },
  chest: { muscles: ["Chest"], patterns: ["horizontal-push", "incline-push", "chest-isolation"] },
  lateral_delts: { muscles: ["LateralDelts"], patterns: ["shoulder-isolation"] },
  rear_delts: { muscles: ["RearDelts"], patterns: ["rear-delt"] },
  back_width: { muscles: ["Back"], patterns: ["vertical-pull"] },
  back_thickness: { muscles: ["Back"], patterns: ["horizontal-pull", "upper-back-pull"] },
  biceps: { muscles: ["Biceps"], patterns: ["elbow-flexion"] },
  triceps: { muscles: ["Triceps"], patterns: ["elbow-extension"] },
  quads: { muscles: ["Quads"], patterns: ["squat", "single-leg", "knee-extension"] },
  hamstrings: { muscles: ["Hamstrings"], patterns: ["hinge", "knee-flexion"] },
  glutes: { muscles: ["Glutes"], patterns: ["hip-extension", "single-leg"] },
  calves: { muscles: ["Calves"], patterns: ["calf"] },
});

export function priorityProgrammingGroupsForProfile(profile = {}) {
  // `profile.priorities` contains a backward-compatible broad combination.
  // When source data exists, use the genuinely manual values plus the confirmed
  // physique subregions so e.g. Rear delts does not become all Shoulders.
  const manual = Array.isArray(profile.prioritySources?.manual)
    ? profile.prioritySources.manual
    : profile.priorities || [];
  const confirmed = profile.prioritySources?.physiqueConfirmed ||
    profile.confirmedPhysiquePriorities || [];
  const groups = [];
  for (const label of manual) {
    const definition = PRIORITY_GROUPS_BY_LABEL[label];
    if (definition) groups.push({ key: label, source: "manual", ...definition });
  }
  for (const item of confirmed) {
    const priorityId = typeof item === "string" ? item : item?.priorityId;
    const definition = CONFIRMED_PRIORITY_GROUPS[priorityId];
    if (definition) groups.push({ key: priorityId, source: "confirmed", ...definition });
  }
  return groups.filter((group, index) => groups.findIndex(candidate => candidate.key === group.key && candidate.source === group.source) === index);
}

export function priorityStimulusMusclesForProfile(profile = {}) {
  const muscles = new Set();
  for (const group of priorityProgrammingGroupsForProfile(profile))
    for (const muscle of group.muscles) muscles.add(muscle);
  return muscles;
}

export function hypertrophyTargetsForProfile(profile = {}) {
  const experience = HYPERTROPHY_VOLUME_POLICY[profile.experience] ? profile.experience : "Intermediate";
  const workloadOffset = String(profile.effortStyle || "").startsWith("Fewer hard") ? -1
    : String(profile.effortStyle || "").startsWith("More moderate") ? 1 : 0;
  const priorityMuscles = priorityStimulusMusclesForProfile(profile);
  const prioritized = muscle => priorityMuscles.has(muscle);
  return Object.fromEntries(Object.entries(HYPERTROPHY_VOLUME_POLICY[experience]).map(
    ([muscle, [floor, target]]) => [muscle, {
      floor: Math.max(2, floor + workloadOffset),
      target: Math.max(3, target + workloadOffset + (prioritized(muscle) ? 1 : 0)),
      softCap: ["Chest", "Back", "Quads", "Hamstrings", "Glutes"].includes(muscle) ? 14
        : ["AnteriorDelts", "LateralDelts", "RearDelts"].includes(muscle) ? 8 : 10,
      hardCap: ["Chest", "Back", "Quads"].includes(muscle) ? 20
        : ["Hamstrings", "Glutes"].includes(muscle) ? 18 : 16,
    }],
  ));
}
