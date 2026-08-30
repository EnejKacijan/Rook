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

function generalCandidates(profile) {
  const fullGym =
    profile.environment === "Commercial gym" ||
    (profile.equipment || []).includes("full gym");
  return fullGym
    ? [
        {
          label: "Easy treadmill walk",
          words: ["walk", "walking", "treadmill"],
        },
        {
          label: "Easy stationary bike",
          words: ["bike", "biking", "cycle", "cycling"],
        },
        { label: "Easy elliptical", words: ["elliptical"] },
      ]
    : [
        { label: "Brisk walk", words: ["walk", "walking"] },
        { label: "Easy marching in place", words: ["march", "marching"] },
      ];
}

function rampPrescription(profile) {
  if (profile.goal === "Get stronger" && profile.experience === "Advanced")
    return [
      { loadPercent: 40, reps: 5 },
      { loadPercent: 60, reps: 3 },
      { loadPercent: 80, reps: 1 },
    ];
  if (profile.experience === "Beginner") return [{ loadPercent: 50, reps: 5 }];
  return [
    { loadPercent: 50, reps: 5 },
    { loadPercent: 70, reps: 3 },
  ];
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
    .map((exercise) => ({ exercise, item: catalog[exercise.exerciseId] }))
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
      generatorVersion: 1,
      general,
      movementPreparation: [],
      rampUpSets: [],
      nonRampMinutes: general.reduce((sum, item) => sum + item.minutes, 0),
      estimatedMinutes: general.reduce((sum, item) => sum + item.minutes, 0),
      safetyMessage,
      conservative: true,
      skipped: false,
    };
  }

  const general = [];
  if (includeRecommendedWarmups) {
    const choice = generalCandidates(profile).find(
      (candidate) => !restrictionBlocks(restrictions, candidate.words),
    );
    if (choice)
      general.push({
        id: choice.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label: choice.label,
        minutes: Number(profile.sessionMinutes) <= 45 ? 3 : 4,
      });
  }

  const movementPreparation = [];
  const firstMain = exercises.find(
    (row) => row.item.kind === "compound" || row.item.kind === "power",
  );
  if (
    includeRecommendedWarmups &&
    Number(profile.sessionMinutes) > 30 &&
    firstMain
  ) {
    const power = firstMain.item.kind === "power";
    const qualifier = previousInjury
      ? " through a comfortable, non-provocative range"
      : "";
    movementPreparation.push({
      id: `prepare-${firstMain.item.id}`,
      exerciseId: firstMain.item.id,
      label: power
        ? `Rehearse ${firstMain.item.name} with controlled, submaximal reps${qualifier}`
        : `Practice ${firstMain.item.name} with unloaded or very light, controlled reps${qualifier}`,
      minutes: 2,
    });
  }

  const rampUpSets = [];
  if (includeRampUpSets) {
    const seenFamilies = new Set();
    const maxExercises = Number(profile.sessionMinutes) <= 30 ? 1 : 2;
    const eligible = exercises.filter(
      ({ exercise, item }) =>
        item.kind === "compound" &&
        item.progressionQuality === "load-and-repetition" &&
        (exercise.programmingRole === "main" || rampUpSets.length === 0),
    );
    for (const { exercise, item } of eligible) {
      const family = movementFamily(item.pattern);
      if (seenFamilies.has(family) || seenFamilies.size >= maxExercises)
        continue;
      const workingWeight =
        (exercise.sets || []).find((set) => Number(set.weight) > 0)?.weight ??
        null;
      const sets = rampPrescription(profile).map((set, index) => ({
        id: `ramp-${item.id}-${index}`,
        ...set,
        weight: rampWeightForWorkingLoad(
          workingWeight,
          set.loadPercent,
          item.increment,
        ),
        completed: false,
      }));
      rampUpSets.push({ exerciseId: item.id, exerciseName: item.name, sets });
      seenFamilies.add(family);
    }
  }

  const nonRampMinutes = Math.min(
    8,
    general.reduce((sum, item) => sum + item.minutes, 0) +
      movementPreparation.reduce((sum, item) => sum + item.minutes, 0),
  );
  const rampCount = rampUpSets.reduce((sum, item) => sum + item.sets.length, 0);
  const estimatedMinutes = nonRampMinutes + Math.ceil(rampCount * 0.5);
  if (
    !general.length &&
    !movementPreparation.length &&
    !rampUpSets.length &&
    !safetyMessage
  )
    return null;
  return {
    generatorVersion: 1,
    general,
    movementPreparation,
    rampUpSets,
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
