import {
  compileProfileTrainingSafety,
  exerciseAllowedByTrainingSafety,
  trainingSafetyBlocks,
} from "./trainingSafety.js";

const PREVIOUS_INJURY_LANGUAGE =
  /\b(?:previous|old|past|history\s+of)\b.{0,45}\b(?:injur(?:y|ies)|pain|strain|sprain|issue)\b/i;

const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
const restrictionBlocks = (restriction, words) =>
  words.some((word) =>
    new RegExp(
      `\\b(?:avoid|no|cannot|can't|cant|do not|don't|dont|unable to)\\b[^.;\\n]{0,45}\\b${word}\\b`,
      "i",
    ).test(restriction),
  );
const movementFamily = (pattern) =>
  ["squat", "single-leg", "knee-extension"].includes(pattern)
    ? "lower"
    : ["hinge", "hip-extension", "knee-flexion"].includes(pattern)
      ? "posterior"
      : ["horizontal-push", "incline-push", "vertical-push"].includes(pattern)
        ? "push"
        : ["horizontal-pull", "vertical-pull", "upper-back-pull"].includes(
              pattern,
            )
          ? "pull"
          : pattern;

function generalCandidates(profile, family) {
  const fullGym =
    profile.environment === "Commercial gym" ||
    (profile.equipment || []).includes("full gym");
  if (!fullGym)
    return [
      { label: "Brisk walk", words: ["walk", "walking"] },
      { label: "Easy marching in place", words: ["march", "marching"] },
    ];
  const candidates = {
    lower: [
      { label: "Easy stationary bike", words: ["bike", "biking", "cycle", "cycling"] },
      { label: "Easy treadmill walk", words: ["walk", "walking", "treadmill"] },
      { label: "Easy elliptical", words: ["elliptical"] },
    ],
    posterior: [
      { label: "Easy treadmill walk", words: ["walk", "walking", "treadmill"] },
      { label: "Easy stationary bike", words: ["bike", "biking", "cycle", "cycling"] },
      { label: "Easy elliptical", words: ["elliptical"] },
    ],
    push: [
      { label: "Easy elliptical", words: ["elliptical"] },
      { label: "Easy treadmill walk", words: ["walk", "walking", "treadmill"] },
      { label: "Easy stationary bike", words: ["bike", "biking", "cycle", "cycling"] },
    ],
    pull: [
      { label: "Easy treadmill walk", words: ["walk", "walking", "treadmill"] },
      { label: "Easy elliptical", words: ["elliptical"] },
      { label: "Easy stationary bike", words: ["bike", "biking", "cycle", "cycling"] },
    ],
  };
  return candidates[family] || candidates.lower;
}

function equipmentIncrement(item, profile) {
  const equipmentKey = item?.equipment?.find((key) =>
    Object.hasOwn(profile.increments || {}, key),
  );
  return Math.max(
    0.5,
    Number(profile.increments?.[equipmentKey] || item?.increment) || 1,
  );
}

function rampSetCount({
  exercise,
  item,
  profile,
  workingWeight,
  firstDemanding,
}) {
  const sessionMinutes = Number(profile.sessionMinutes) || 60;
  const repMin = Number(exercise.repMin ?? exercise.sets?.[0]?.reps) || 8;
  const repMax = Number(exercise.repMax ?? repMin) || repMin;
  const machineSupported = item.equipment?.some((key) =>
    ["machines", "cables"].includes(key),
  );
  if (!firstDemanding) {
    if (repMax <= 5 && sessionMinutes > 30) return 2;
    return 1;
  }
  if (repMax >= 10 && machineSupported) return 1;
  if (sessionMinutes <= 30) return 2;
  if (repMax <= 8) {
    const increment = equipmentIncrement(item, profile);
    const establishedLoadSteps = Number(workingWeight) / increment;
    if (
      repMax <= 5 ||
      establishedLoadSteps >= 10 ||
      profile.experience === "Advanced"
    )
      return 3;
  }
  return 2;
}

function rampPrescription(count, { beginner = false, later = false } = {}) {
  const shapes =
    count >= 3
      ? [
          { loadPercent: 45, reps: 8, loadInstruction: "Very light" },
          { loadPercent: 65, reps: 5, loadInstruction: "Light" },
          { loadPercent: 80, reps: 2, loadInstruction: "Moderate" },
        ]
      : count === 2
        ? [
            { loadPercent: 50, reps: 8, loadInstruction: "Light" },
            { loadPercent: 70, reps: 4, loadInstruction: "Moderate" },
          ]
        : [{ loadPercent: later ? 60 : 50, reps: later ? 5 : 8, loadInstruction: "Light" }];
  if (beginner && shapes.length)
    shapes[0] = {
      ...shapes[0],
      reps: Math.max(8, shapes[0].reps),
      loadInstruction: "Very light",
      technique: true,
    };
  return shapes;
}

export function rampWeightForWorkingLoad(workingWeight, percent, increment) {
  if (!(Number(workingWeight) > 0)) return null;
  const step = Math.max(0.5, Number(increment) || 1);
  const raw = (Number(workingWeight) * percent) / 100;
  return Number(Math.max(step, Math.round(raw / step) * step).toFixed(2));
}

export function generateWarmup(
  workout,
  profile = {},
  catalog = {},
  options = {},
) {
  const includeRecommendedWarmups =
    options.includeRecommendedWarmups ??
    profile.recommendedWarmupsEnabled !== false;
  const includeRampUpSets =
    options.includeRampUpSets ?? profile.rampUpSetsEnabled !== false;
  const restrictions = normalize(profile.avoid);
  const trainingSafety = compileProfileTrainingSafety(
    profile,
    Object.values(catalog || {}),
  );
  const safetyHold = trainingSafetyBlocks(trainingSafety.status);
  const previousInjury =
    trainingSafety.pastResolved ||
    PREVIOUS_INJURY_LANGUAGE.test(String(profile.avoid || ""));
  const exercises = (workout?.exercises || [])
    .map((exercise, exerciseIndex) => ({
      exercise,
      exerciseIndex,
      item: catalog[exercise.exerciseId],
    }))
    .filter(
      (row) =>
        row.item && exerciseAllowedByTrainingSafety(row.item, trainingSafety),
    );
  const safetyMessage = safetyHold
    ? "Training is paused until the restriction has a clear, enforceable training scope. Rook will not create a rehabilitation protocol."
    : null;

  if (safetyHold) {
    const general = [];
    return {
      generatorVersion: 3,
      general,
      movementPreparation: [],
      rampUpSets: [],
      stages: [],
      nonRampMinutes: general.reduce((sum, item) => sum + item.minutes, 0),
      estimatedMinutes: general.reduce((sum, item) => sum + item.minutes, 0),
      safetyMessage,
      conservative: true,
      skipped: false,
    };
  }

  const general = [];
  const firstDemanding = exercises.find(
    ({ item }) => item.kind === "compound" || item.kind === "power",
  );
  const includeGeneral =
    includeRecommendedWarmups &&
    Number(profile.sessionMinutes || 60) > 30 &&
    (workout?.exercises || []).length > 1 &&
    Boolean(firstDemanding);
  if (includeGeneral) {
    const choice = generalCandidates(
      profile,
      movementFamily(firstDemanding.item.pattern),
    ).find(
      (candidate) => !restrictionBlocks(restrictions, candidate.words),
    );
    if (choice)
      general.push({
        id: choice.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label: choice.label,
        minutes: Number(profile.sessionMinutes) >= 90 ? 4 : 3,
        completed: false,
      });
  }

  const movementPreparation = [];

  const rampUpSets = [];
  if (includeRampUpSets) {
    const eligible = ({ item }) =>
      (item.kind === "compound" &&
        item.progressionQuality === "load-and-repetition") ||
      item.kind === "power";
    const candidates = [];
    const seenFamilies = new Set();
    const maxGroups =
      Number(profile.sessionMinutes || 60) <= 30
        ? 1
        : Number(profile.sessionMinutes || 60) >= 90
          ? 3
          : 2;
    for (const row of exercises) {
      if (!eligible(row)) continue;
      const family = movementFamily(row.item.pattern);
      if (seenFamilies.has(family)) continue;
      seenFamilies.add(family);
      candidates.push(row);
      if (candidates.length >= maxGroups) break;
    }
    const createRamp = ({ exercise, exerciseIndex, item }, candidateIndex) => {
      const workingWeight =
        (exercise.sets || []).find((set) => Number(set.weight) > 0)?.weight ??
        null;
      const first = candidateIndex === 0;
      const increment = equipmentIncrement(item, profile);
      const count =
        item.kind === "power"
          ? 1
          : rampSetCount({
              exercise,
              item,
              profile,
              workingWeight,
              firstDemanding: first,
            });
      const seenWeights = new Set();
      const sets = rampPrescription(count, {
        beginner: profile.experience === "Beginner" && first,
        later: !first,
      })
        .map((set, index) => {
          const weight =
            item.kind === "power"
              ? null
              : rampWeightForWorkingLoad(
                  workingWeight,
                  set.loadPercent,
                  increment,
                );
          return {
            id: `ramp-${item.id}-${index}`,
            ...set,
            loadInstruction:
              item.kind === "power"
                ? "Controlled technique reps"
                : workingWeight
                  ? null
                  : set.loadInstruction,
            weight,
            completed: false,
          };
        })
        .filter((set) => {
          if (!(Number(workingWeight) > 0)) return true;
          if (!(Number(set.weight) > 0) || Number(set.weight) >= Number(workingWeight))
            return false;
          const key = Number(set.weight).toFixed(2);
          if (seenWeights.has(key)) return false;
          seenWeights.add(key);
          return true;
        });
      return {
        exerciseId: item.id,
        exerciseInstanceId: exercise.id || null,
        exerciseIndex,
        exerciseName: item.name,
        movementFamily: movementFamily(item.pattern),
        sets,
      };
    };
    candidates
      .map(createRamp)
      .filter((entry) => entry.sets.length)
      .forEach((entry) => rampUpSets.push(entry));
  }

  const nonRampMinutes = Math.min(
    8,
    general.reduce((sum, item) => sum + item.minutes, 0) +
      movementPreparation.reduce((sum, item) => sum + item.minutes, 0),
  );
  const rampCount = rampUpSets.reduce((sum, item) => sum + item.sets.length, 0);
  const estimatedMinutes = nonRampMinutes + Math.ceil(rampCount * 0.5);
  const stageRow = (exerciseIndex) => {
    const matched = exercises.find((row) => row.exerciseIndex === exerciseIndex);
    if (matched) return matched;
    const exercise = workout?.exercises?.[exerciseIndex];
    if (!exercise) return null;
    return {
      exercise,
      exerciseIndex,
      item: {
        id: exercise.exerciseId || `custom-${exerciseIndex}`,
        name:
          exercise.importedName ||
          exercise.originalImportedName ||
          exercise.name ||
          "Custom exercise",
      },
    };
  };
  const firstExercise = stageRow(0);
  const secondExercise = stageRow(1);
  const pairedFirstTwo = Boolean(
    firstExercise?.exercise.supersetId &&
      firstExercise.exercise.supersetId === secondExercise?.exercise.supersetId,
  );
  const stageFor = (
    row,
    stageGeneral,
    stageMovementPreparation,
    stageRampUpSets,
  ) => {
    if (
      !row ||
      (!stageGeneral.length &&
        !stageMovementPreparation.length &&
        !stageRampUpSets.length)
    )
      return null;
    const stageRampCount = stageRampUpSets.reduce(
      (sum, entry) => sum + entry.sets.length,
      0,
    );
    const stageNonRampMinutes =
      stageGeneral.reduce((sum, item) => sum + item.minutes, 0) +
      stageMovementPreparation.reduce((sum, item) => sum + item.minutes, 0);
    return {
      id: `warmup-stage-${row.exercise.id || row.exerciseIndex}-${row.item.id}`,
      exerciseId: row.item.id,
      exerciseInstanceId: row.exercise.id || null,
      exerciseIndex: row.exerciseIndex,
      exerciseName: row.item.name,
      general: stageGeneral,
      movementPreparation: stageMovementPreparation,
      rampUpSets: stageRampUpSets,
      estimatedMinutes: Math.max(
        1,
        stageNonRampMinutes + Math.ceil(stageRampCount * 0.5),
      ),
      completed: false,
      skipped: false,
    };
  };
  const stageIndexes = new Set([
    ...(general.length && firstExercise ? [0] : []),
    ...rampUpSets.map((entry) =>
      pairedFirstTwo && entry.exerciseIndex === 1 ? 0 : entry.exerciseIndex,
    ),
  ]);
  const stages = [...stageIndexes]
    .sort((a, b) => a - b)
    .map((exerciseIndex) => {
      const row = stageRow(exerciseIndex);
      const stageRamps = rampUpSets.filter(
        (entry) =>
          entry.exerciseIndex === exerciseIndex ||
          (pairedFirstTwo && exerciseIndex === 0 && entry.exerciseIndex === 1),
      );
      return stageFor(
        row,
        exerciseIndex === 0 ? general : [],
        [],
        stageRamps,
      );
    })
    .filter(Boolean);
  if (
    !general.length &&
    !movementPreparation.length &&
    !rampUpSets.length &&
    !safetyMessage
  )
    return null;
  return {
    generatorVersion: 3,
    general,
    movementPreparation,
    rampUpSets,
    stages,
    nonRampMinutes,
    estimatedMinutes,
    safetyMessage,
    conservative: previousInjury,
    skipped: false,
  };
}

export function warmupWorkingSetCount(workout) {
  return (workout?.exercises || []).reduce(
    (sum, exercise) =>
      sum +
      (exercise.sets || []).filter((set) => set.planned !== false && !set.added)
        .length,
    0,
  );
}
