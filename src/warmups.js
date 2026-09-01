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
      generatorVersion: 2,
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
    (row) =>
      row.exerciseIndex === 0 &&
      (row.item.kind === "compound" || row.item.kind === "power"),
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
  let firstRamp = null;
  let secondRamp = null;
  if (includeRampUpSets) {
    const eligible = ({ item }) =>
      item.kind === "compound" &&
      item.progressionQuality === "load-and-repetition";
    const createRamp = ({ exercise, exerciseIndex, item }) => {
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
      return {
        exerciseId: item.id,
        exerciseInstanceId: exercise.id || null,
        exerciseIndex,
        exerciseName: item.name,
        movementFamily: movementFamily(item.pattern),
        sets,
      };
    };
    const first = exercises.find((row) => row.exerciseIndex === 0);
    const second = exercises.find((row) => row.exerciseIndex === 1);
    if (first && eligible(first)) firstRamp = createRamp(first);
    if (
      Number(profile.sessionMinutes) > 30 &&
      second &&
      eligible(second) &&
      (!firstRamp ||
        movementFamily(second.item.pattern) !== firstRamp.movementFamily)
    )
      secondRamp = createRamp(second);
    if (firstRamp) rampUpSets.push(firstRamp);
    if (secondRamp) rampUpSets.push(secondRamp);
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
  const stages = [
    stageFor(
      firstExercise,
      general,
      movementPreparation,
      [firstRamp, pairedFirstTwo ? secondRamp : null].filter(Boolean),
    ),
    pairedFirstTwo
      ? null
      : stageFor(secondExercise, [], [], secondRamp ? [secondRamp] : []),
  ].filter(Boolean);
  if (
    !general.length &&
    !movementPreparation.length &&
    !rampUpSets.length &&
    !safetyMessage
  )
    return null;
  return {
    generatorVersion: 2,
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
