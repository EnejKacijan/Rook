import {
  BASELINE_TEMPLATE_BY_FREQUENCY,
  TRAINING_STRUCTURES,
  selectStructuralTemplate,
} from "./splitPreferences.js";
import { generateWarmup } from "./warmups.js";
import {
  compileProfileTrainingSafety,
  exerciseAllowedByTrainingSafety,
  trainingSafetyBlocks,
} from "./trainingSafety.js";
import {
  fewerHardRepRange,
  inferredProgrammingRole,
  isFewerHardSets,
  minimumWorkingSetsForExercise,
} from "./prescriptionPolicy.js";
import { validateSupersetExercises } from "./supersets.js";
import { workoutGuideExercises } from "./workoutGuideCatalog.js";
import {
  accumulateStimulus,
  hypertrophyTargetsForProfile,
  priorityProgrammingGroupsForProfile,
  priorityStimulusMusclesForProfile,
  stimulusMutationPreservesPolicy,
  stimulusProfileForItem,
} from "./trainingVolume.js";
export {
  priorityProgrammingGroupsForProfile,
  priorityStimulusMusclesForProfile,
  stimulusMutationPreservesPolicy,
} from "./trainingVolume.js";

export const STORAGE_KEY = "lift-v2-state";
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const exerciseCatalog = {
  "barbell-bench-press": {
    id: "barbell-bench-press",
    name: "Bench Press",
    aliases: [
      "Barbell Bench Press",
      "Flat Bench Press",
      "Flat Barbell Bench Press",
      "Barbell Flat Bench Press",
      "BB Bench Press",
    ],
    pattern: "horizontal-push",
    muscles: ["Chest", "Arms"],
    equipment: ["barbell", "rack", "bench"],
    increment: 2.5,
    restSeconds: 150,
    kind: "compound",
  },
  "dumbbell-bench-press": {
    id: "dumbbell-bench-press",
    name: "Dumbbell Bench Press",
    aliases: ["DB Bench Press", "Dumbbell Chest Press", "Flat Dumbbell Press"],
    pattern: "horizontal-push",
    muscles: ["Chest", "Arms"],
    equipment: ["dumbbells", "bench"],
    increment: 2,
    restSeconds: 120,
    kind: "compound",
  },
  "incline-dumbbell-press": {
    id: "incline-dumbbell-press",
    name: "Incline Dumbbell Press",
    aliases: [
      "Dumbbell Incline Press",
      "Incline Dumbbell Bench Press",
      "DB Incline Press",
      "Incline DB Press",
    ],
    pattern: "incline-push",
    muscles: ["Chest", "Shoulders", "Arms"],
    equipment: ["dumbbells", "bench"],
    increment: 2,
    restSeconds: 120,
    kind: "compound",
  },
  "incline-machine-press": {
    id: "incline-machine-press",
    name: "Incline Machine Press",
    aliases: [
      "Incline Chest Press Machine",
      "Incline Machine Chest Press",
      "Plate-loaded Incline Chest Press",
    ],
    pattern: "incline-push",
    muscles: ["Chest", "Shoulders", "Arms"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 120,
    kind: "compound",
  },
  "machine-chest-press": {
    id: "machine-chest-press",
    name: "Machine Chest Press",
    aliases: ["Flat Machine Press", "Chest Press Machine"],
    pattern: "horizontal-push",
    muscles: ["Chest", "Arms"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 120,
    kind: "compound",
  },
  "pec-deck": {
    id: "pec-deck",
    name: "Pec Deck",
    aliases: ["Pec Deck Fly", "Machine Chest Fly"],
    pattern: "chest-isolation",
    muscles: ["Chest"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 60,
    kind: "isolation",
  },
  "cable-fly": {
    id: "cable-fly",
    name: "Cable Fly",
    aliases: [
      "Cable Chest Fly",
      "Mid Cable Fly",
      "Mid-to-Mid Cable Fly",
      "Standing Cable Fly",
      "Cable Crossover",
    ],
    pattern: "chest-isolation",
    muscles: ["Chest"],
    equipment: ["cables"],
    increment: 2.5,
    restSeconds: 60,
    kind: "isolation",
  },
  "low-to-high-cable-fly": {
    id: "low-to-high-cable-fly",
    name: "Low-to-High Cable Fly",
    aliases: [
      "Low to High Cable Fly",
      "Low-to-High Cable Crossover",
      "Low to High Cable Crossover",
      "Low Cable Fly",
      "Incline Cable Fly",
    ],
    pattern: "chest-isolation",
    muscles: ["Chest"],
    equipment: ["cables"],
    increment: 2.5,
    restSeconds: 60,
    kind: "isolation",
  },
  "high-to-low-cable-fly": {
    id: "high-to-low-cable-fly",
    name: "High-to-Low Cable Fly",
    aliases: [
      "High to Low Cable Fly",
      "High-to-Low Cable Crossover",
      "High to Low Cable Crossover",
      "High Cable Fly",
      "Decline Cable Fly",
    ],
    pattern: "chest-isolation",
    muscles: ["Chest"],
    equipment: ["cables"],
    increment: 2.5,
    restSeconds: 60,
    kind: "isolation",
  },
  "dumbbell-fly": {
    id: "dumbbell-fly",
    name: "Dumbbell Fly",
    aliases: ["Dumbbell Chest Fly"],
    pattern: "chest-isolation",
    muscles: ["Chest"],
    equipment: ["dumbbells", "bench"],
    increment: 2,
    restSeconds: 60,
    kind: "isolation",
  },
  "push-up": {
    id: "push-up",
    name: "Push-up",
    pattern: "horizontal-push",
    muscles: ["Chest", "Arms"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 90,
    kind: "compound",
    bodyweight: true,
  },
  "close-grip-push-up": {
    id: "close-grip-push-up",
    name: "Close-grip Push-up",
    pattern: "elbow-extension",
    muscles: ["Arms", "Chest"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 75,
    kind: "compound",
    bodyweight: true,
  },
  "pike-push-up": {
    id: "pike-push-up",
    name: "Pike Push-up",
    pattern: "vertical-push",
    muscles: ["Shoulders", "Arms"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 90,
    kind: "compound",
    bodyweight: true,
  },
  "barbell-row": {
    id: "barbell-row",
    name: "Barbell Row",
    aliases: [
      "BB Row",
      "Bent-Over Row",
      "Bent Over Row",
      "Bent-over Barbell Row",
      "Bent Over Barbell Row",
    ],
    pattern: "horizontal-pull",
    muscles: ["Back", "Arms"],
    equipment: ["barbell"],
    increment: 2.5,
    restSeconds: 150,
    kind: "compound",
  },
  "one-arm-dumbbell-row": {
    id: "one-arm-dumbbell-row",
    name: "One-arm Dumbbell Row",
    pattern: "horizontal-pull",
    muscles: ["Back", "Arms"],
    equipment: ["dumbbells"],
    increment: 2,
    restSeconds: 120,
    kind: "compound",
  },
  "chest-supported-row": {
    id: "chest-supported-row",
    name: "Chest Supported Row",
    aliases: ["Chest-Supported Row"],
    pattern: "horizontal-pull",
    muscles: ["Back", "Arms"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 120,
    kind: "compound",
  },
  "seated-cable-row": {
    id: "seated-cable-row",
    name: "Seated Cable Row",
    aliases: [
      "Cable Row",
      "Cable Low Row",
      "Seated Row",
      "Seated Cable Low Row",
    ],
    pattern: "horizontal-pull",
    muscles: ["Back", "Arms"],
    equipment: ["cables"],
    increment: 5,
    restSeconds: 120,
    kind: "compound",
  },
  "low-row": {
    id: "low-row",
    name: "Low Row",
    aliases: ["Low Row Machine", "Machine Low Row", "Plate-loaded Low Row"],
    pattern: "horizontal-pull",
    muscles: ["Back", "Arms"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 120,
    kind: "compound",
  },
  "machine-high-row": {
    id: "machine-high-row",
    name: "Machine High Row",
    aliases: [
      "Chest Supported High Row",
      "Chest-Supported High Row",
      "High Row Machine",
    ],
    pattern: "upper-back-pull",
    muscles: ["Back", "Arms"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 105,
    kind: "compound",
  },
  "pull-up": {
    id: "pull-up",
    name: "Pull-up",
    aliases: ["Pull Up", "Pronated Pull-up", "Overhand Pull-up"],
    pattern: "vertical-pull",
    muscles: ["Back", "Arms"],
    equipment: ["pull-up bar"],
    increment: 1,
    restSeconds: 150,
    kind: "compound",
    bodyweight: true,
  },
  "lat-pulldown": {
    id: "lat-pulldown",
    name: "Lat Pulldown",
    aliases: ["Lat Pull-down", "Wide-grip Lat Pulldown", "Wide Grip Pulldown"],
    pattern: "vertical-pull",
    muscles: ["Back", "Arms"],
    equipment: ["cables"],
    increment: 5,
    restSeconds: 120,
    kind: "compound",
  },
  "prone-w-raise": {
    id: "prone-w-raise",
    name: "Prone W Raise",
    aliases: ["Lying W Raise", "Prone W Lift", "Floor W Raise", "W Raise"],
    pattern: "horizontal-pull",
    muscles: ["Back", "Shoulders"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
    bodyweight: true,
  },
  "reverse-snow-angel": {
    id: "reverse-snow-angel",
    name: "Reverse Snow Angel",
    pattern: "vertical-pull",
    muscles: ["Back", "Shoulders"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
    bodyweight: true,
  },
  "barbell-overhead-press": {
    id: "barbell-overhead-press",
    name: "Overhead Press",
    aliases: ["Barbell Overhead Press", "OHP", "Military Press"],
    pattern: "vertical-push",
    muscles: ["Shoulders", "Arms"],
    equipment: ["barbell", "rack"],
    increment: 2.5,
    restSeconds: 150,
    kind: "compound",
  },
  "dumbbell-shoulder-press": {
    id: "dumbbell-shoulder-press",
    name: "Dumbbell Shoulder Press",
    pattern: "vertical-push",
    muscles: ["Shoulders", "Arms"],
    equipment: ["dumbbells"],
    increment: 2,
    restSeconds: 120,
    kind: "compound",
  },
  "machine-shoulder-press": {
    id: "machine-shoulder-press",
    name: "Machine Shoulder Press",
    pattern: "vertical-push",
    muscles: ["Shoulders", "Arms"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 120,
    kind: "compound",
  },
  "lateral-raise": {
    id: "lateral-raise",
    name: "Lateral Raise",
    aliases: ["Dumbbell Lateral Raise", "DB Lateral Raise"],
    pattern: "shoulder-isolation",
    muscles: ["Shoulders"],
    equipment: ["dumbbells"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
  },
  "cable-lateral-raise": {
    id: "cable-lateral-raise",
    name: "Cable Lateral Raise",
    aliases: ["Single-arm Cable Lateral Raise", "One-arm Cable Lateral Raise"],
    pattern: "shoulder-isolation",
    muscles: ["Shoulders"],
    equipment: ["cables"],
    increment: 2.5,
    restSeconds: 60,
    kind: "isolation",
  },
  "back-squat": {
    id: "back-squat",
    name: "Back Squat",
    pattern: "squat",
    muscles: ["Quads", "Hamstrings / glutes"],
    equipment: ["barbell", "rack"],
    increment: 2.5,
    restSeconds: 180,
    kind: "compound",
  },
  "goblet-squat": {
    id: "goblet-squat",
    name: "Goblet Squat",
    pattern: "squat",
    muscles: ["Quads", "Hamstrings / glutes"],
    equipment: ["dumbbells"],
    increment: 2,
    restSeconds: 120,
    kind: "compound",
  },
  "leg-press": {
    id: "leg-press",
    name: "Leg Press",
    pattern: "squat",
    muscles: ["Quads", "Hamstrings / glutes"],
    equipment: ["machines"],
    increment: 10,
    restSeconds: 150,
    kind: "compound",
  },
  "hack-squat": {
    id: "hack-squat",
    name: "Hack Squat",
    pattern: "squat",
    muscles: ["Quads", "Hamstrings / glutes"],
    equipment: ["machines"],
    increment: 10,
    restSeconds: 150,
    kind: "compound",
  },
  "leg-extension": {
    id: "leg-extension",
    name: "Leg Extension",
    aliases: ["Machine Leg Extension"],
    pattern: "knee-extension",
    muscles: ["Quads"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 75,
    kind: "isolation",
  },
  "bodyweight-squat": {
    id: "bodyweight-squat",
    name: "Bodyweight Squat",
    pattern: "squat",
    muscles: ["Quads", "Hamstrings / glutes"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 75,
    kind: "compound",
    bodyweight: true,
  },
  "split-squat": {
    id: "split-squat",
    name: "Split Squat",
    pattern: "single-leg",
    muscles: ["Quads", "Hamstrings / glutes"],
    equipment: ["dumbbells"],
    increment: 2,
    restSeconds: 120,
    kind: "compound",
  },
  "bodyweight-split-squat": {
    id: "bodyweight-split-squat",
    name: "Bodyweight Split Squat",
    pattern: "single-leg",
    muscles: ["Quads", "Hamstrings / glutes"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 90,
    kind: "compound",
    bodyweight: true,
  },
  "reverse-lunge": {
    id: "reverse-lunge",
    name: "Reverse Lunge",
    pattern: "single-leg",
    muscles: ["Quads", "Hamstrings / glutes"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 90,
    kind: "compound",
    bodyweight: true,
  },
  "bulgarian-split-squat": {
    id: "bulgarian-split-squat",
    name: "Bulgarian Split Squat",
    aliases: [
      "Rear Foot Elevated Split Squat",
      "Rear-Foot-Elevated Split Squat",
    ],
    pattern: "single-leg",
    muscles: ["Quads", "Hamstrings / glutes"],
    equipment: ["dumbbells", "bench"],
    increment: 2,
    restSeconds: 120,
    kind: "compound",
  },
  deadlift: {
    id: "deadlift",
    name: "Deadlift",
    aliases: ["Conventional Deadlift"],
    pattern: "hinge",
    muscles: ["Hamstrings / glutes", "Back"],
    equipment: ["barbell"],
    increment: 2.5,
    restSeconds: 180,
    kind: "compound",
  },
  "romanian-deadlift": {
    id: "romanian-deadlift",
    name: "Romanian Deadlift",
    aliases: ["RDL", "Barbell Romanian Deadlift", "BB RDL", "Barbell RDL"],
    pattern: "hinge",
    muscles: ["Hamstrings / glutes", "Back"],
    equipment: ["barbell"],
    increment: 2.5,
    restSeconds: 150,
    kind: "compound",
  },
  "dumbbell-rdl": {
    id: "dumbbell-rdl",
    name: "Dumbbell Romanian Deadlift",
    aliases: ["Dumbbell RDL", "DB RDL"],
    pattern: "hinge",
    muscles: ["Hamstrings / glutes"],
    equipment: ["dumbbells"],
    increment: 2,
    restSeconds: 120,
    kind: "compound",
  },
  "leg-curl": {
    id: "leg-curl",
    name: "Leg Curl",
    pattern: "knee-flexion",
    muscles: ["Hamstrings / glutes"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 75,
    kind: "isolation",
  },
  "seated-leg-curl": {
    id: "seated-leg-curl",
    name: "Seated Leg Curl",
    pattern: "knee-flexion",
    muscles: ["Hamstrings / glutes"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 75,
    kind: "isolation",
  },
  "hip-thrust": {
    id: "hip-thrust",
    name: "Hip Thrust",
    aliases: ["Barbell Hip Thrust", "Hip Thrust (Barbell)"],
    pattern: "hip-extension",
    muscles: ["Hamstrings / glutes"],
    equipment: ["barbell", "bench"],
    increment: 5,
    restSeconds: 120,
    kind: "compound",
  },
  "glute-bridge": {
    id: "glute-bridge",
    name: "Glute Bridge",
    pattern: "hip-extension",
    muscles: ["Hamstrings / glutes"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 75,
    kind: "compound",
    bodyweight: true,
  },
  "hamstring-walkout": {
    id: "hamstring-walkout",
    name: "Hamstring Walkout",
    pattern: "knee-flexion",
    muscles: ["Hamstrings / glutes"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 75,
    kind: "isolation",
    bodyweight: true,
  },
  "calf-raise": {
    id: "calf-raise",
    name: "Standing Calf Raise",
    pattern: "calf",
    muscles: ["Calves"],
    equipment: ["bodyweight"],
    increment: 2,
    restSeconds: 60,
    kind: "isolation",
    bodyweight: true,
  },
  "seated-calf-raise": {
    id: "seated-calf-raise",
    name: "Seated Calf Raise",
    pattern: "calf",
    muscles: ["Calves"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 60,
    kind: "isolation",
  },
  "standing-calf-raise-machine": {
    id: "standing-calf-raise-machine",
    name: "Standing Calf Raise Machine",
    aliases: ["Standing Calf Machine"],
    pattern: "calf",
    muscles: ["Calves"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 60,
    kind: "isolation",
  },
  "reverse-pec-deck": {
    id: "reverse-pec-deck",
    name: "Reverse Pec Deck",
    aliases: ["Reverse Fly Machine", "Rear Delt Machine Fly"],
    pattern: "rear-delt",
    muscles: ["Back", "Shoulders"],
    equipment: ["machines"],
    increment: 5,
    restSeconds: 60,
    kind: "isolation",
  },
  "dumbbell-curl": {
    id: "dumbbell-curl",
    name: "Dumbbell Curl",
    pattern: "elbow-flexion",
    muscles: ["Arms"],
    equipment: ["dumbbells"],
    increment: 2,
    restSeconds: 60,
    kind: "isolation",
  },
  "hammer-curl": {
    id: "hammer-curl",
    name: "Hammer Curl",
    pattern: "elbow-flexion",
    muscles: ["Arms"],
    equipment: ["dumbbells"],
    increment: 2,
    restSeconds: 60,
    kind: "isolation",
  },
  "barbell-curl": {
    id: "barbell-curl",
    name: "Barbell Curl",
    pattern: "elbow-flexion",
    muscles: ["Arms"],
    equipment: ["barbell"],
    increment: 2.5,
    restSeconds: 60,
    kind: "isolation",
  },
  "cable-curl": {
    id: "cable-curl",
    name: "Cable Curl",
    aliases: ["Straight-bar Cable Curl", "Straight Bar Cable Curl"],
    pattern: "elbow-flexion",
    muscles: ["Arms"],
    equipment: ["cables"],
    increment: 2.5,
    restSeconds: 60,
    kind: "isolation",
  },
  "cable-triceps-pressdown": {
    id: "cable-triceps-pressdown",
    name: "Cable Triceps Pressdown",
    aliases: [
      "Triceps Pushdown",
      "Tricep Pushdown",
      "Cable Triceps Pushdown",
      "Cable Pushdown",
      "Rope Triceps Pushdown",
      "Rope Pushdown",
      "Straight-bar Cable Pushdown",
      "Straight Bar Cable Pushdown",
    ],
    pattern: "elbow-extension",
    muscles: ["Arms"],
    equipment: ["cables"],
    increment: 2.5,
    restSeconds: 60,
    kind: "isolation",
  },
  "dumbbell-overhead-triceps-extension": {
    id: "dumbbell-overhead-triceps-extension",
    name: "Dumbbell Overhead Triceps Extension",
    pattern: "elbow-extension",
    muscles: ["Arms"],
    equipment: ["dumbbells"],
    increment: 2,
    restSeconds: 60,
    kind: "isolation",
  },
  "cable-overhead-triceps-extension": {
    id: "cable-overhead-triceps-extension",
    name: "Cable Overhead Triceps Extension",
    aliases: ["Rope Overhead Extension", "Overhead Cable Extension"],
    pattern: "elbow-extension",
    muscles: ["Arms"],
    equipment: ["cables"],
    increment: 2.5,
    restSeconds: 60,
    kind: "isolation",
  },
  plank: {
    id: "plank",
    name: "Plank",
    pattern: "core",
    muscles: ["Core"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
    bodyweight: true,
    measure: "seconds",
    durationRange: [30, 60],
  },
  "side-plank": {
    id: "side-plank",
    name: "Side Plank",
    pattern: "core",
    muscles: ["Core"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
    bodyweight: true,
    measure: "seconds",
    durationRange: [20, 45],
  },
  "dead-bug": {
    id: "dead-bug",
    name: "Dead Bug",
    pattern: "core",
    muscles: ["Core"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
    bodyweight: true,
  },
  "hanging-leg-raise": {
    id: "hanging-leg-raise",
    name: "Hanging Leg Raise",
    aliases: ["Hanging Leg Raises"],
    pattern: "core",
    muscles: ["Core"],
    equipment: ["pull-up bar"],
    increment: 1,
    restSeconds: 75,
    kind: "isolation",
    bodyweight: true,
  },
  "cable-crunch": {
    id: "cable-crunch",
    name: "Cable Crunch",
    aliases: ["Cable Crunches", "Kneeling Cable Crunch"],
    pattern: "core",
    muscles: ["Core"],
    equipment: ["cables"],
    increment: 2.5,
    restSeconds: 60,
    kind: "isolation",
  },
  "reverse-crunch": {
    id: "reverse-crunch",
    name: "Reverse Crunch",
    aliases: ["Reverse Crunches"],
    pattern: "core",
    muscles: ["Core"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
    bodyweight: true,
  },
  "band-chest-press": {
    id: "band-chest-press",
    name: "Band Chest Press",
    pattern: "horizontal-push",
    muscles: ["Chest", "Arms"],
    equipment: ["resistance bands"],
    increment: 1,
    restSeconds: 90,
    kind: "compound",
  },
  "band-fly": {
    id: "band-fly",
    name: "Band Fly",
    pattern: "chest-isolation",
    muscles: ["Chest"],
    equipment: ["resistance bands"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
  },
  "band-row": {
    id: "band-row",
    name: "Band Row",
    pattern: "horizontal-pull",
    muscles: ["Back", "Arms"],
    equipment: ["resistance bands"],
    increment: 1,
    restSeconds: 90,
    kind: "compound",
  },
  "band-lat-pulldown": {
    id: "band-lat-pulldown",
    name: "Band Lat Pulldown",
    pattern: "vertical-pull",
    muscles: ["Back", "Arms"],
    equipment: ["resistance bands"],
    increment: 1,
    restSeconds: 90,
    kind: "compound",
  },
  "band-overhead-press": {
    id: "band-overhead-press",
    name: "Band Overhead Press",
    pattern: "vertical-push",
    muscles: ["Shoulders", "Arms"],
    equipment: ["resistance bands"],
    increment: 1,
    restSeconds: 90,
    kind: "compound",
  },
  "band-leg-curl": {
    id: "band-leg-curl",
    name: "Band Leg Curl",
    pattern: "knee-flexion",
    muscles: ["Hamstrings / glutes"],
    equipment: ["resistance bands"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
  },
  "band-curl": {
    id: "band-curl",
    name: "Band Curl",
    pattern: "elbow-flexion",
    muscles: ["Arms"],
    equipment: ["resistance bands"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
  },
  "band-triceps-pressdown": {
    id: "band-triceps-pressdown",
    name: "Band Triceps Pressdown",
    pattern: "elbow-extension",
    muscles: ["Arms"],
    equipment: ["resistance bands"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
  },
  "dumbbell-calf-raise": {
    id: "dumbbell-calf-raise",
    name: "Dumbbell Calf Raise",
    pattern: "calf",
    muscles: ["Calves"],
    equipment: ["dumbbells"],
    increment: 2,
    restSeconds: 60,
    kind: "isolation",
  },
  "broad-jump": {
    id: "broad-jump",
    name: "Standing Broad Jump",
    pattern: "power-lower",
    muscles: ["Hamstrings / glutes", "Quads"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 120,
    kind: "power",
    bodyweight: true,
  },
  "squat-jump": {
    id: "squat-jump",
    name: "Squat Jump",
    pattern: "power-lower",
    muscles: ["Quads", "Hamstrings / glutes"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 120,
    kind: "power",
    bodyweight: true,
  },
  "explosive-push-up": {
    id: "explosive-push-up",
    name: "Explosive Push-up",
    pattern: "power-upper",
    muscles: ["Chest", "Arms"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 120,
    kind: "power",
    bodyweight: true,
  },
  "wide-push-up": {
    id: "wide-push-up",
    name: "Wide Push-up",
    pattern: "horizontal-push",
    muscles: ["Chest", "Arms"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 90,
    kind: "compound",
    bodyweight: true,
  },
  "feet-elevated-push-up": {
    id: "feet-elevated-push-up",
    name: "Feet-elevated Push-up",
    pattern: "incline-push",
    muscles: ["Chest", "Shoulders", "Arms"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 90,
    kind: "compound",
    bodyweight: true,
  },
  "prone-swimmer-pull": {
    id: "prone-swimmer-pull",
    name: "Prone Swimmer Pull",
    aliases: ["Prone Swimmer", "Swimmer Pull", "Prone Floor Swimmer", "Floor Swimmer Pull"],
    pattern: "horizontal-pull",
    muscles: ["Back", "Shoulders"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
    bodyweight: true,
  },
  "floor-lat-pulldown": {
    id: "floor-lat-pulldown",
    name: "Floor Lat Pulldown",
    aliases: ["Floor Lat Pull-down", "Prone Lat Pulldown", "Prone Lat Pull-down", "Bodyweight Lat Pulldown", "Floor Pulldown"],
    pattern: "vertical-pull",
    muscles: ["Back", "Arms"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
    bodyweight: true,
  },
  "prone-y-raise": {
    id: "prone-y-raise",
    name: "Prone Y Raise",
    pattern: "shoulder-isolation",
    muscles: ["Shoulders", "Back"],
    equipment: ["bodyweight"],
    increment: 1,
    restSeconds: 60,
    kind: "isolation",
    bodyweight: true,
  },
};

// Broader searchable/importable coverage. The final flag keeps specific
// variants available to users without making the automatic planner noisy.
const EXPANDED_EXERCISES = [
  ["straight-arm-cable-pulldown","Straight-Arm Cable Pulldown",["Straight-Arm Pulldown","Straight Arm Pulldown","Cable Pullover"],"vertical-pull",["Back"],["cables"],2.5,75,"isolation"],
  ["chin-up","Chin-up",["Chin Up","Underhand Chin-up","Supinated Pull-up"],"vertical-pull",["Back","Arms"],["pull-up bar"],1,150,"compound",{bodyweight:true}],
  ["neutral-grip-pull-up","Neutral-Grip Pull-up",["Neutral Grip Pull-up","Parallel-Grip Pull-up"],"vertical-pull",["Back","Arms"],["pull-up bar"],1,150,"compound",{bodyweight:true}],
  ["assisted-pull-up","Assisted Pull-up",["Machine Assisted Pull-up","Assisted Pull Up"],"vertical-pull",["Back","Arms"],["machines"],5,120,"compound"],
  ["neutral-grip-lat-pulldown","Neutral-Grip Lat Pulldown",["Close-Grip Neutral Pulldown","Neutral Grip Pulldown"],"vertical-pull",["Back","Arms"],["cables"],5,120,"compound"],
  ["single-arm-cable-lat-pulldown","Single-Arm Cable Lat Pulldown",["One-Arm Lat Pulldown","Single Arm Lat Pulldown","Unilateral Lat Pulldown"],"vertical-pull",["Back","Arms"],["cables"],2.5,105,"compound"],
  ["t-bar-row","T-Bar Row",["T Bar Row","Chest-Supported T-Bar Row","Chest Supported T Bar Row"],"horizontal-pull",["Back","Arms"],["machines"],5,120,"compound"],
  ["machine-row","Machine Row",["Selectorized Row","Seated Row Machine","Plate-loaded Row"],"horizontal-pull",["Back","Arms"],["machines"],5,120,"compound"],
  ["single-arm-cable-row","Single-Arm Cable Row",["One-Arm Cable Row","Single Arm Cable Row","Unilateral Cable Row"],"horizontal-pull",["Back","Arms"],["cables"],2.5,105,"compound"],
  ["face-pull","Face Pull",["Rope Face Pull","Cable Face Pull"],"rear-delt",["Back","Shoulders"],["cables"],2.5,60,"isolation"],
  ["inverted-row","Inverted Row",["Body Row","Australian Pull-up"],"horizontal-pull",["Back","Arms"],["pull-up bar"],1,90,"compound",{bodyweight:true,generation:"library-only"}],
  ["suspension-row","Suspension Row",["TRX Row","Ring Row","Suspension Trainer Row","Suspended Row","TRX Inverted Row","Ring Inverted Row"],"horizontal-pull",["Back","Arms"],["bodyweight"],1,90,"compound",{bodyweight:true,generation:"library-only"}],
  ["incline-barbell-bench-press","Incline Bench Press",["Incline Barbell Bench Press","Barbell Incline Bench Press","Barbell Incline Press"],"incline-push",["Chest","Shoulders","Arms"],["barbell","rack","bench"],2.5,150,"compound"],
  ["smith-machine-bench-press","Smith Machine Bench Press",["Smith Bench Press","Smith Bench"],"horizontal-push",["Chest","Arms"],["machines","bench"],5,120,"compound",{generation:"library-only"}],
  ["incline-smith-machine-press","Incline Smith Machine Press",["Smith Incline Press","Incline Smith Press","Smith Machine Incline Press","Smith Incline Bench Press","Incline Smith Bench Press","Smith Incline Bench"],"incline-push",["Chest","Shoulders","Arms"],["machines","bench"],5,120,"compound",{generation:"library-only"}],
  ["parallel-bar-dip","Dip",["Dips","Chest Dip","Parallel-Bar Dip","Parallel Bar Dip","Bodyweight Dip"],"horizontal-push",["Chest","Arms"],["bodyweight"],1,120,"compound",{bodyweight:true,generation:"library-only"}],
  ["assisted-dip","Assisted Dip",["Machine Assisted Dip","Assisted Parallel-Bar Dip"],"horizontal-push",["Chest","Arms"],["machines"],5,105,"compound",{generation:"library-only"}],
  ["weighted-push-up","Weighted Push-up",["Loaded Push-up","Plate-loaded Push-up"],"horizontal-push",["Chest","Arms"],["bodyweight"],2.5,120,"compound",{bodyweight:true,generation:"library-only"}],
  ["dumbbell-rear-delt-fly","Dumbbell Rear Delt Fly",["Bent-Over Dumbbell Rear Delt Fly","Dumbbell Reverse Fly","Rear Delt Fly"],"rear-delt",["Shoulders","Back"],["dumbbells"],2,60,"isolation"],
  ["cable-rear-delt-fly","Cable Rear Delt Fly",["Reverse Cable Fly","Cable Reverse Fly","Rear Delt Cable Fly"],"rear-delt",["Shoulders","Back"],["cables"],2.5,60,"isolation"],
  ["arnold-press","Arnold Press",["Arnold Shoulder Press"],"vertical-push",["Shoulders","Arms"],["dumbbells"],2,105,"compound",{generation:"library-only"}],
  ["front-squat","Front Squat",["Barbell Front Squat","Olympic Front Squat"],"squat",["Quads","Hamstrings / glutes"],["barbell","rack"],2.5,150,"compound"],
  ["smith-machine-squat","Smith Machine Squat",["Smith Squat"],"squat",["Quads","Hamstrings / glutes"],["machines"],5,135,"compound"],
  ["belt-squat","Belt Squat",["Belt Squat Machine"],"squat",["Quads","Hamstrings / glutes"],["machines"],5,120,"compound"],
  ["pendulum-squat","Pendulum Squat",["Pendulum Machine Squat"],"squat",["Quads","Hamstrings / glutes"],["machines"],5,120,"compound"],
  ["walking-lunge","Walking Lunge",["Dumbbell Walking Lunge","DB Walking Lunge"],"single-leg",["Quads","Hamstrings / glutes"],["dumbbells"],2,105,"compound"],
  ["step-up","Step-up",["Dumbbell Step-up","Weighted Step-up","Step Up"],"single-leg",["Quads","Hamstrings / glutes"],["dumbbells","bench"],2,105,"compound"],
  ["step-down","Step-down",["Step Down","Single-Leg Step-down"],"single-leg",["Quads","Hamstrings / glutes"],["bodyweight"],1,75,"compound",{bodyweight:true,generation:"library-only"}],
  ["single-leg-romanian-deadlift","Single-Leg Romanian Deadlift",["Single-Leg RDL","One-Leg RDL"],"hinge",["Hamstrings / glutes"],["dumbbells"],2,105,"compound"],
  ["trap-bar-deadlift","Trap Bar Deadlift",["Hex Bar Deadlift"],"hinge",["Hamstrings / glutes","Quads","Back"],["barbell"],2.5,150,"compound",{generation:"library-only"}],
  ["sumo-deadlift","Sumo Deadlift",["Wide-Stance Deadlift"],"hinge",["Hamstrings / glutes","Quads","Back"],["barbell"],2.5,150,"compound",{generation:"library-only"}],
  ["good-morning","Good Morning",["Barbell Good Morning"],"hinge",["Hamstrings / glutes","Back"],["barbell","rack"],2.5,120,"compound",{generation:"library-only"}],
  ["back-extension-45","45° Back Extension",["45-Degree Back Extension","45 Degree Back Extension","45 Degree Hyperextension","Hyperextension","Roman Chair Back Extension","Back Extension"],"hip-extension",["Hamstrings / glutes","Back"],["machines"],5,90,"compound"],
  ["machine-lateral-raise","Machine Lateral Raise",["Lateral Raise Machine","Machine Side Raise","Machine Side Lateral Raise"],"shoulder-isolation",["Shoulders"],["machines"],5,75,"isolation",{generation:"library-only"}],
  ["smith-machine-romanian-deadlift","Smith Machine Romanian Deadlift",["Smith Romanian Deadlift","Smith RDL","Smith Machine RDL"],"hinge",["Hamstrings / glutes","Back"],["machines"],5,135,"compound",{generation:"library-only"}],
  ["cable-chest-press","Cable Chest Press",["Standing Cable Chest Press","Cable Press","Standing Cable Press","Dual Cable Chest Press","Dual Cable Press"],"horizontal-push",["Chest","Shoulders","Arms"],["cables"],2.5,105,"compound",{generation:"library-only"}],
  ["dumbbell-shrug","Dumbbell Shrug",["DB Shrug","Dumbbell Shoulder Shrug"],"shrug",["Back","Arms"],["dumbbells"],2,75,"isolation",{generation:"library-only"}],
  ["nordic-hamstring-curl","Nordic Hamstring Curl",["Nordic Curl","Nordic Leg Curl"],"knee-flexion",["Hamstrings / glutes"],["bodyweight"],1,120,"compound",{bodyweight:true,generation:"library-only"}],
  ["lying-leg-curl","Lying Leg Curl",["Prone Leg Curl","Lying Hamstring Curl"],"knee-flexion",["Hamstrings / glutes"],["machines"],5,75,"isolation"],
  ["standing-leg-curl","Standing Leg Curl",["Single-Leg Leg Curl","Single-Leg Hamstring Curl"],"knee-flexion",["Hamstrings / glutes"],["machines"],5,75,"isolation"],
  ["single-leg-leg-extension","Single-Leg Leg Extension",["One-Leg Leg Extension","Unilateral Leg Extension"],"knee-extension",["Quads"],["machines"],5,60,"isolation"],
  ["single-leg-leg-press","Single-Leg Leg Press",["One-Leg Leg Press","Unilateral Leg Press"],"single-leg",["Quads","Hamstrings / glutes"],["machines"],5,105,"compound"],
  ["bosu-balance","BOSU Balance",["BOSU Ball Balance","Balance on BOSU","Ravnotežje na BOSU žogi"],"balance",["Core","Hamstrings / glutes"],["bosu"],1,45,"isolation",{bodyweight:true,measure:"seconds",durationRange:[30,60],generation:"library-only"}],
  ["y-balance-reach","Y Balance Reach",["Y Balance","Y-Balance Reach","Y ravnotežni doseg"],"balance",["Core","Hamstrings / glutes"],["bodyweight"],1,45,"isolation",{bodyweight:true,generation:"library-only"}],
  ["pogo-jumps","Pogo Jumps",["Pogos","Pogo Hops","Ankle Pogo Jumps","Pogo poskoki"],"power",["Calves"],["bodyweight"],1,60,"power",{bodyweight:true,generation:"library-only"}],
  ["forward-single-leg-hops","Forward Single-Leg Hops",["Single-Leg Forward Hops","Forward Hops - Single Leg","Enonožni poskoki naprej"],"power",["Calves","Hamstrings / glutes"],["bodyweight"],1,75,"power",{bodyweight:true,generation:"library-only"}],
  ["hip-abduction-machine","Hip Abduction Machine",["Abductor Machine","Seated Hip Abduction"],"hip-abduction",["Hamstrings / glutes"],["machines"],5,60,"isolation",{generation:"library-only"}],
  ["hip-adduction-machine","Hip Adduction Machine",["Adductor Machine","Seated Hip Adduction"],"hip-adduction",["Adductors"],["machines"],5,60,"isolation",{generation:"library-only"}],
  ["leg-press-calf-raise","Leg Press Calf Raise",[
    "Calf Raise on Leg Press",
    "Calf Raises on Leg Press",
    "Leg Press Calf Raises",
    "Calf Raise on Leg Press Machine",
    "Calf Raises on Leg Press Machine",
    "Calf Raise na Leg Press masini",
    "Calf Raises na Leg Press masini",
    "Calf Raise na Leg Press mašini",
    "Calf Raises na Leg Press mašini",
    "Calf Raise na Leg Pressu",
    "Calf Raises na Leg Pressu",
    "Dvigi na prste na Leg Press masini",
    "Dvigi na prste na Leg Press mašini",
  ],"calf",["Calves"],["machines"],5,60,"isolation"],
  ["ez-bar-curl","EZ-Bar Curl",["EZ Curl","EZ Bar Curl"],"elbow-flexion",["Arms"],["barbell"],2.5,60,"isolation"],
  ["incline-dumbbell-curl","Incline Dumbbell Curl",["Incline Curl","Incline DB Curl"],"elbow-flexion",["Arms"],["dumbbells","bench"],2,60,"isolation"],
  ["preacher-curl","Preacher Curl",["EZ-Bar Preacher Curl","EZ Preacher Curl"],"elbow-flexion",["Arms"],["barbell","bench"],2.5,60,"isolation"],
  ["machine-preacher-curl","Machine Preacher Curl",["Biceps Curl Machine","Machine Biceps Curl"],"elbow-flexion",["Arms"],["machines"],5,60,"isolation"],
  ["reverse-curl","Reverse Curl",["Reverse EZ Curl","Overhand Curl"],"elbow-flexion",["Arms"],["barbell"],2.5,60,"isolation",{generation:"library-only"}],
  ["skull-crusher","Skull Crusher",["Lying Triceps Extension","EZ-Bar Skull Crusher"],"elbow-extension",["Arms"],["barbell","bench"],2.5,75,"isolation",{generation:"library-only"}],
  ["close-grip-bench-press","Close-Grip Bench Press",["Close-Grip Barbell Bench Press","CGBP"],"elbow-extension",["Arms","Chest"],["barbell","rack","bench"],2.5,135,"compound",{generation:"library-only"}],
  ["ab-wheel-rollout","Ab Wheel Rollout",["Wheel Rollout","Ab Roller"],"core",["Core"],["bodyweight"],1,75,"compound",{bodyweight:true,generation:"library-only"}],
  ["pallof-press","Pallof Press",["Cable Pallof Press","Anti-Rotation Press","Cable Anti-Rotation Press"],"core",["Core"],["cables"],2.5,60,"isolation"],
];
for (const [id,name,aliases,pattern,muscles,equipment,increment,restSeconds,kind,extra = {}] of EXPANDED_EXERCISES)
  exerciseCatalog[id] = { id, name, aliases, pattern, muscles, equipment, increment, restSeconds, kind, ...extra };

const workoutGuideNameKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/dumbbells?/g, "db")
    .replace(/[^a-z0-9]/g, "");
// User-facing/import aliases may be broader than the upstream library labels,
// but only when the pictured setup and movement remain the same.
const WORKOUT_GUIDE_IMPORT_ALIASES = Object.freeze({
  "banded-monster-walk": ["Monster Walk", "Monster Walks"],
  "skater-hop": [
    "Skater Hops",
    "Lateral Skater Hop",
    "Lateral Skater Hops",
  ],
  "single-leg-box-squat": [
    "Single-Leg Sit-to-Stand",
    "Single Leg Sit to Stand",
  ],
  cycling: ["Stationary Bike", "Exercise Bike", "Sobno kolo"],
  "hip-adduction-machine": ["Adductor", "Adductor Machine"],
});
const catalogByWorkoutGuideName = new Map();
const catalogEntriesLinkedToWorkoutGuide = new Set();
for (const item of Object.values(exerciseCatalog))
  for (const name of [item.name, ...(item.aliases || [])])
    catalogByWorkoutGuideName.set(workoutGuideNameKey(name), item);
const comparableIllustrationEquipment = (item) =>
  item === "pull-up bar" ? "bodyweight" : item;
for (const rawSource of workoutGuideExercises) {
  const source = {
    ...rawSource,
    aliases: [
      ...new Set([
        ...(rawSource.aliases || []),
        ...(WORKOUT_GUIDE_IMPORT_ALIASES[rawSource.sourceSlug] || []),
      ]),
    ],
  };
  const existing = catalogByWorkoutGuideName.get(workoutGuideNameKey(source.name));
  const equipmentCompatible =
    !existing?.equipment?.length ||
    !source.equipment?.length ||
    existing.equipment.some((item) =>
      source.equipment
        .map(comparableIllustrationEquipment)
        .includes(comparableIllustrationEquipment(item)),
    );
  if (
    existing &&
    equipmentCompatible &&
    !catalogEntriesLinkedToWorkoutGuide.has(existing.id)
  ) {
    existing.aliases = [
      ...new Set([
        ...(existing.aliases || []),
        source.name,
        ...(source.aliases || []),
      ]),
    ];
    existing.artId = source.artId;
    existing.visualSource = source.visualSource;
    existing.visualLicense = source.visualLicense;
    catalogEntriesLinkedToWorkoutGuide.add(existing.id);
    continue;
  }
  const id = `wg-${source.sourceSlug}`;
  exerciseCatalog[id] = { ...source, id };
  catalogByWorkoutGuideName.set(workoutGuideNameKey(source.name), exerciseCatalog[id]);
}

// Preserve the user's imported wording while resolving common Slovenian names
// to a stable exercise identity. These stay intentionally specific: a broad
// label such as "potisk" or "veslanje" does not identify one safe movement.
const SLOVENIAN_EXERCISE_ALIASES = Object.freeze({
  "barbell-bench-press": ["Potisk s prsi z drogom", "Potisk z drogom na ravni klopi"],
  "dumbbell-bench-press": ["Potisk s prsi z ročkami", "Potisk z ročkami na ravni klopi"],
  "incline-barbell-bench-press": ["Poševni potisk z drogom", "Potisk z drogom na poševni klopi"],
  "incline-dumbbell-press": ["Poševni potisk z ročkami", "Potisk z ročkami na poševni klopi"],
  "push-up": ["Skleca", "Sklece"],
  "pull-up": ["Zgib", "Zgibi", "Zgibi z nadprijemom"],
  "barbell-row": ["Veslanje z drogom", "Veslanje v predklonu z drogom"],
  "one-arm-dumbbell-row": ["Enoročno veslanje z ročko", "Enoročno veslanje z utežjo"],
  "seated-cable-row": ["Veslanje sede na škripcu", "Veslanje na škripcu sede"],
  "lat-pulldown": ["Vleka na prsi", "Vleka na prsi na škripcu"],
  "prone-w-raise": ["Ležeči W dvig", "W dvig leže"],
  "prone-swimmer-pull": ["Plavalec leže", "Ležeči plavalec"],
  "floor-lat-pulldown": ["Vleka za hrbet na tleh", "Vleka na prsi na tleh"],
  "suspension-row": ["TRX veslanje", "Veslanje na TRX", "Veslanje na krogih"],
  "incline-smith-machine-press": ["Poševni potisk na Smith napravi", "Smith poševni potisk"],
  "cable-chest-press": ["Potisk s prsi na škripcu", "Potisk na škripcu stoje"],
  "barbell-overhead-press": ["Potisk nad glavo z drogom", "Ramenski potisk z drogom"],
  "dumbbell-shoulder-press": ["Potisk nad glavo z ročkami", "Ramenski potisk z ročkami"],
  "lateral-raise": ["Stranski dvig z ročkami", "Stranski dvigi z ročkami", "Stranski dvigi", "Odročenje z ročkami"],
  "back-squat": ["Počep z drogom", "Zadnji počep z drogom"],
  "goblet-squat": ["Goblet počep", "Čašasti počep"],
  "leg-press": ["Nožni potisk", "Potisk z nogami na napravi"],
  "hack-squat": ["Hack počep"],
  "leg-extension": ["Izteg nog", "Izteg kolena na napravi"],
  "leg-curl": ["Upogib nog", "Upogib kolena na napravi"],
  "standing-leg-curl": ["Enonožni upogib nog stoje", "Enonožni upogib kolena stoje"],
  "single-leg-leg-extension": ["Enonožni izteg nog", "Enonožni izteg kolena na napravi"],
  "bulgarian-split-squat": ["Bolgarski počep", "Bolgarski počep z ročkami"],
  deadlift: ["Mrtvi dvig", "Klasični mrtvi dvig"],
  "romanian-deadlift": ["Romunski mrtvi dvig", "Romunski mrtvi dvig z drogom"],
  "dumbbell-rdl": ["Romunski mrtvi dvig z ročkami"],
  "hip-thrust": ["Dvig bokov z drogom", "Potisk bokov z drogom"],
  "glute-bridge": ["Most za zadnjico", "Zadnjični most"],
  "calf-raise": ["Dvig na prste", "Dvig na prste stoje"],
  "seated-calf-raise": ["Sedeči dvig na prste", "Dvig na prste sede"],
  "dumbbell-curl": ["Biceps pregib z ročkami"],
  "hammer-curl": ["Kladivasti pregib", "Kladivasti pregib z ročkami"],
  "barbell-curl": ["Biceps pregib z drogom"],
  "cable-curl": ["Biceps pregib na škripcu"],
  "cable-triceps-pressdown": ["Triceps potisk na škripcu", "Triceps potisk z vrvjo"],
  plank: ["Deska"],
  "side-plank": ["Stranska deska"],
  "dead-bug": ["Mrtvi hrošč"],
  "hanging-leg-raise": ["Dvig nog v vesi", "Dvigi nog v vesi"],
  "cable-crunch": ["Trebušnjaki na škripcu"],
  "wg-running": ["Tek"],
  "wg-walking": ["Hoja"],
  "wg-rowing": ["Veslanje na ergometru", "Veslaški ergometer"],
  "wg-jump-rope": ["Kolebnica", "Skakanje s kolebnico"],
  "wg-stair-climber": ["Naprava za stopnice", "Stopnice na napravi"],
});

const LOAD_REQUIREMENTS = new Set(["required", "optional", "none"]);
const LOAD_BEARING_EQUIPMENT = new Set([
  "barbell",
  "dumbbells",
  "cables",
  "machines",
]);
const LOAD_FREE_EQUIPMENT = new Set(["resistance bands", "bosu"]);
const EXPLICIT_LOAD_REQUIREMENTS = Object.freeze({
  "pogo-jumps": "none",
  "forward-single-leg-hops": "none",
  "y-balance-reach": "none",
  "bosu-balance": "none",
  "wg-banded-monster-walk": "none",
  "wg-skater-hop": "none",
  // These movements have a valid unloaded/bodyweight baseline even when the
  // catalog also names the station or optional dumbbells used to progress it.
  "back-extension-45": "optional",
  "wg-reverse-hyperextension": "optional",
  "wg-captains-chair-knee-raise": "optional",
  "split-squat": "optional",
  "bulgarian-split-squat": "optional",
  "walking-lunge": "optional",
  "step-up": "optional",
  "single-leg-romanian-deadlift": "optional",
  "assisted-pull-up": "optional",
  "assisted-dip": "optional",
  "wg-assisted-chin-up": "optional",
  "weighted-push-up": "required",
  "wg-weighted-pull-up": "required",
  "wg-weighted-dip": "required",
  "wg-weighted-chin-up": "required",
  // Timed work can still have an intrinsic external load. Keep these explicit
  // so the duration fallback below never turns them into load-free work.
  "wg-farmer-carry": "required",
  "wg-cable-pallof-hold": "required",
});
for (const [exerciseId, aliases] of Object.entries(SLOVENIAN_EXERCISE_ALIASES)) {
  const exercise = exerciseCatalog[exerciseId];
  if (!exercise) continue;
  exercise.aliases = [...new Set([...(exercise.aliases || []), ...aliases])];
}

export const ROOK_ORIGINAL_ILLUSTRATIONS = Object.freeze({
  "prone-w-raise": "rook-prone-w-raise",
  "prone-swimmer-pull": "rook-prone-swimmer-pull",
  "floor-lat-pulldown": "rook-floor-lat-pulldown",
  "suspension-row": "rook-suspension-row",
  "incline-smith-machine-press": "rook-incline-smith-machine-press",
  "cable-chest-press": "rook-cable-chest-press",
});

export const ROOK_ADAPTED_ILLUSTRATIONS = Object.freeze({
  "single-leg-leg-extension": "rook-single-leg-leg-extension",
  "standing-leg-curl": "rook-standing-single-leg-leg-curl",
  "bosu-balance": "rook-bosu-balance",
  "y-balance-reach": "rook-y-balance-reach",
  "pogo-jumps": "rook-pogo-jumps",
  "forward-single-leg-hops": "rook-forward-single-leg-hops",
  "incline-machine-press": "rook-incline-machine-press",
  "machine-high-row": "rook-machine-high-row",
  "barbell-curl": "rook-barbell-curl",
  "band-chest-press": "rook-band-chest-press",
  "band-fly": "rook-band-fly",
  "band-overhead-press": "rook-band-overhead-press",
  "band-leg-curl": "rook-band-leg-curl",
  "band-curl": "rook-band-curl",
  "band-triceps-pressdown": "rook-band-triceps-pressdown",
  "dumbbell-calf-raise": "rook-dumbbell-calf-raise",
  "broad-jump": "rook-standing-broad-jump",
  "single-arm-cable-lat-pulldown": "rook-single-arm-cable-lat-pulldown",
  "pendulum-squat": "rook-pendulum-squat",
  "single-leg-leg-press": "rook-single-leg-leg-press",
});

// The source assets share a normalized canvas, but complex equipment can make
// the actual movement silhouette read smaller at 46px. Keep these restrained
// thumbnail-only adjustments separate from the underlying artwork so detail
// views and light/dark paint treatment can remain independent.
export const EXERCISE_THUMBNAIL_NORMALIZATION = Object.freeze({
  "wg-machine-chest-press": Object.freeze({ scale: 1.04, x: 0, y: 0 }),
  "wg-single-arm-cable-row": Object.freeze({ scale: 1.06, x: 0, y: 0 }),
  "wg-machine-shoulder-press": Object.freeze({ scale: 1.05, x: 0, y: 0 }),
  "wg-straight-arm-pulldown": Object.freeze({ scale: 1.12, x: 0, y: 1 }),
  "wg-lateral-raise": Object.freeze({ scale: 1.07, x: 0, y: 0 }),
});
for (const [exerciseId, assetSlug] of Object.entries(ROOK_ADAPTED_ILLUSTRATIONS)) {
  const exercise = exerciseCatalog[exerciseId];
  if (!exercise) continue;
  exercise.artId = `wg-${assetSlug}`;
  exercise.visualSource = "Bryl Lim / Everkinetic · ROOK adaptation";
  exercise.visualLicense = "CC BY-SA 4.0";
}
for (const [exerciseId, assetSlug] of Object.entries(ROOK_ORIGINAL_ILLUSTRATIONS)) {
  const exercise = exerciseCatalog[exerciseId];
  if (!exercise) continue;
  exercise.artId = `wg-${assetSlug}`;
  exercise.visualSource = "ROOK original";
  exercise.visualLicense = "Proprietary";
}

// Share artwork only when the visible setup and movement are equivalent.
// Broad movement-pattern fallbacks can teach the wrong exercise.
export const EXERCISE_ILLUSTRATION_EQUIVALENTS = Object.freeze({
  "barbell-row": "barbell-row",
  "low-row": "machine-row",
  "machine-row": "machine-row",
  "lateral-raise": "lateral-raise",
  // The source frame visibly uses high pulleys and finishes low across the body.
  "high-to-low-cable-fly": "cable-fly",
  // Diamond hand placement is the library's faithful close-grip push-up frame.
  "close-grip-push-up": "diamond-push-up",
  "back-squat": "squat",
  "hamstring-walkout": "lying-hamstring-walkout",
  "calf-raise": "calf-raise",
  "dumbbell-curl": "bicep-curl",
  "dumbbell-overhead-triceps-extension":
    "dumbbell-overhead-tricep-extension",
  "cable-overhead-triceps-extension": "overhead-tricep-extension",
  "band-row": "banded-row",
  "band-lat-pulldown": "banded-lat-pulldown",
  "squat-jump": "jump-squat",
  "feet-elevated-push-up": "decline-push-up",
  "neutral-grip-lat-pulldown": "close-grip-lat-pulldown",
  "machine-lateral-raise": "machine-lateral-raise",
  "dumbbell-shoulder-press": "standing-dumbbell-press",
  "standing-calf-raise-machine": "standing-calf-raise",
  "back-extension-45": "back-extension",
  "machine-preacher-curl": "preacher-curl",
  "bodyweight-split-squat": "split-squat",
  "reverse-lunge": "reverse-lunge",
  "preacher-curl": "preacher-curl",
});
const workoutGuideBySlug = new Map(
  workoutGuideExercises.map((item) => [item.sourceSlug, item]),
);
for (const [exerciseId, sourceSlug] of Object.entries(
  EXERCISE_ILLUSTRATION_EQUIVALENTS,
)) {
  const exercise = exerciseCatalog[exerciseId];
  const source = workoutGuideBySlug.get(sourceSlug);
  if (!exercise || !source) continue;
  exercise.artId = source.artId;
  exercise.visualSource = source.visualSource;
  exercise.visualLicense = source.visualLicense;
}

const GLOBALLY_BLOCKED_EXERCISE_IDS = new Set([
  "dead-bug",
  "prone-y-raise",
  "reverse-snow-angel",
]);
const AUTO_GENERATION_BLOCKED_EXERCISE_IDS = new Set([
  "floor-lat-pulldown",
  "prone-w-raise",
  "prone-swimmer-pull",
  // Useful as an explicit/manual anti-rotation option, but too obscure and
  // non-essential for ROOK's default general training plans.
  "pallof-press",
]);
const GLOBALLY_BLOCKED_EXERCISE_NAMES = [
  /\bdead bugs?\b/,
  /\bprone y raises?\b/,
  /\breverse snow angels?\b/,
];
const BLOCKED_EXERCISE_REPLACEMENTS = {
  "dead-bug": ["reverse-crunch", "cable-crunch"],
  "prone-y-raise": ["lateral-raise", "cable-lateral-raise"],
  "reverse-snow-angel": [
    "lat-pulldown",
    "band-lat-pulldown",
    "floor-lat-pulldown",
  ],
};
export function isExerciseGloballyBlocked(value) {
  const id = typeof value === "string" ? value : value?.id || value?.exerciseId;
  const name =
    typeof value === "string"
      ? exerciseCatalog[value]?.name || value
      : value?.name || value?.importedName || value?.originalImportedName;
  const normalizedName = normalizedExerciseName(name);
  return (
    GLOBALLY_BLOCKED_EXERCISE_IDS.has(id) ||
    GLOBALLY_BLOCKED_EXERCISE_NAMES.some((pattern) =>
      pattern.test(normalizedName),
    )
  );
}
export function isExerciseAutoGenerationBlocked(value) {
  const id = typeof value === "string" ? value : value?.id || value?.exerciseId;
  const item = typeof value === "object" ? value : exerciseCatalog[id];
  return (
    AUTO_GENERATION_BLOCKED_EXERCISE_IDS.has(id) ||
    item?.generation === "library-only"
  );
}
function globallyBlockedExerciseLabel(value) {
  const id = typeof value === "string" ? value : value?.id || value?.exerciseId;
  return (
    exerciseCatalog[id]?.name ||
    (typeof value === "string"
      ? value
      : value?.name || value?.importedName || value?.originalImportedName) ||
    "This exercise"
  );
}
for (const item of Object.values(exerciseCatalog)) {
  item.loadRequirement = exerciseLoadRequirement(item);
  const barbellCompound =
    item.kind === "compound" && item.equipment.includes("barbell");
  const machineSupported = item.equipment.some((value) =>
    ["machines", "cables"].includes(value),
  );
  item.technicalDifficulty =
    item.id === "deadlift"
      ? 3
      : [
            "back-squat",
            "barbell-row",
            "barbell-overhead-press",
            "pull-up",
            "explosive-push-up",
          ].includes(item.id)
        ? 2
        : 1;
  item.stability =
    machineSupported || item.kind === "isolation"
      ? "high"
      : barbellCompound
        ? "low"
        : "moderate";
  item.fatigueCost = [
    "deadlift",
    "back-squat",
    "romanian-deadlift",
    "dumbbell-rdl",
  ].includes(item.id)
    ? "high"
    : item.id === "glute-bridge"
      ? "low"
      : item.kind === "compound"
        ? "moderate"
        : "low";
  item.progressionQuality =
    item.kind === "power"
      ? "quality-based"
      : item.bodyweight
        ? "repetition-or-variation"
        : item.equipment.includes("resistance bands")
          ? "band-resistance"
          : "load-and-repetition";
  item.unilateral = /one-arm|single-leg|split-squat|lunge|side-plank/i.test(
    `${item.id} ${item.name}`,
  );
  item.trackingSupport =
    item.measure === "seconds" ? "duration" : "reps-and-load";
}
export const exerciseLibrary = exerciseCatalog;
export const HOME_EQUIPMENT = [
  "barbell/rack/bench",
  "dumbbells",
  "pull-up bar",
  "resistance bands",
  "bodyweight only",
];
export const EQUIPMENT_BY_ENVIRONMENT = {
  "Commercial gym": [],
  "Home gym": HOME_EQUIPMENT,
  Both: HOME_EQUIPMENT,
};
const FULL_GYM = new Set([
  "barbell",
  "rack",
  "bench",
  "dumbbells",
  "cables",
  "machines",
  "pull-up bar",
  "resistance bands",
  "bodyweight",
  "bosu",
]);
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WORKOUT_DAY_NAMES = {
  Mon: ["Mon", "Monday"],
  Tue: ["Tue", "Tuesday"],
  Wed: ["Wed", "Wednesday"],
  Thu: ["Thu", "Thursday"],
  Fri: ["Fri", "Friday"],
  Sat: ["Sat", "Saturday"],
  Sun: ["Sun", "Sunday"],
};
export const uid = (prefix = "id") =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const TRAINING_GOAL_KEYS = Object.freeze({
  "Build muscle": "build_muscle",
  "Get stronger": "get_stronger",
  "Lose fat": "lose_fat",
  "General fitness": "general_fitness",
  "Athletic performance": "athletic_performance",
});
export const TRAINING_GOAL_LABELS = Object.freeze(
  Object.fromEntries(
    Object.entries(TRAINING_GOAL_KEYS).map(([label, key]) => [key, label]),
  ),
);
export const trainingGoalKey = (value) =>
  TRAINING_GOAL_KEYS[value] || (TRAINING_GOAL_LABELS[value] ? value : null);
export const trainingGoalLabel = (value) =>
  TRAINING_GOAL_LABELS[value] || (TRAINING_GOAL_KEYS[value] ? value : null);
export const profileIsUnder18 = (profile = {}) =>
  profile.ageRange === "Under 18";

export function isoDay(date = new Date()) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

const dayNumber = (value) =>
  Math.floor(new Date(`${value}T12:00:00Z`).getTime() / 86400000);
const roundTo = (value, places = 1) => {
  const scale = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
};

export function effectiveProgressFocus(state = {}) {
  const planId = state.program?.id;
  const override = planId
    ? trainingGoalKey(state.progressFocusOverrideByPlanId?.[planId])
    : null;
  const provenance = trainingGoalKey(state.program?.goalAtCreation);
  const focus = override || provenance || null;
  return profileIsUnder18(state.profile) && focus === "lose_fat"
    ? null
    : focus;
}

export function bodyWeightToKg(value, units = "kg") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return units === "lb" ? numeric / 2.2046226218 : numeric;
}

export function bodyWeightFromKg(value, units = "kg") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return roundTo(units === "lb" ? numeric * 2.2046226218 : numeric, 1);
}

export function validateWeightCheckin({ value, units = "kg", localDate } = {}) {
  const weightKg = bodyWeightToKg(value, units);
  if (!Number.isFinite(weightKg) || weightKg < 10 || weightKg > 700)
    return { valid: false, error: "Enter a valid body weight." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(localDate || "")))
    return { valid: false, error: "Choose a valid date." };
  if (dayNumber(localDate) > dayNumber(isoDay()))
    return { valid: false, error: "Choose today or an earlier date." };
  return { valid: true, weightKg: roundTo(weightKg, 4) };
}

export function weightCheckinNeedsConfirmation(
  checkins = [],
  localDate,
  weightKg,
) {
  const target = dayNumber(localDate);
  const recent = checkins
    .filter((entry) => {
      const difference = target - dayNumber(entry.localDate);
      return difference >= 1 && difference <= 3;
    })
    .sort((left, right) => right.localDate.localeCompare(left.localDate))[0];
  return Boolean(
    recent &&
      Math.abs(Number(weightKg) - Number(recent.weightKg)) /
        Number(recent.weightKg) >
        0.05,
  );
}

export function upsertWeightCheckin(checkins = [], entry) {
  const now = new Date().toISOString();
  const existing = checkins.find((item) => item.localDate === entry.localDate);
  const next = {
    id: existing?.id || entry.id || uid("weight"),
    localDate: entry.localDate,
    weightKg: roundTo(entry.weightKg, 4),
    createdAt: existing?.createdAt || entry.createdAt || now,
    updatedAt: now,
  };
  return [...checkins.filter((item) => item.localDate !== entry.localDate), next]
    .sort((left, right) => left.localDate.localeCompare(right.localDate));
}

export function weightTrend(checkins = []) {
  const validEntries = [...checkins]
    .filter(
      (entry) =>
        /^\d{4}-\d{2}-\d{2}$/.test(String(entry?.localDate || "")) &&
        Number.isFinite(Number(entry.weightKg)),
    )
    .sort((left, right) =>
      String(left.updatedAt || left.createdAt || "").localeCompare(
        String(right.updatedAt || right.createdAt || ""),
      ),
    );
  const entries = [...new Map(
    validEntries.map((entry) => [entry.localDate, entry]),
  ).values()].sort((left, right) =>
    left.localDate.localeCompare(right.localDate),
  );
  const weekBuckets = new Map();
  for (const entry of entries) {
    const date = new Date(`${entry.localDate}T12:00:00Z`);
    const weekStartDay =
      dayNumber(entry.localDate) - ((date.getUTCDay() + 6) % 7);
    const weekStart = new Date(weekStartDay * 86400000)
      .toISOString()
      .slice(0, 10);
    const bucket = weekBuckets.get(weekStart) || [];
    bucket.push(entry);
    weekBuckets.set(weekStart, bucket);
  }
  const weeks = [...weekBuckets.entries()].map(([weekStart, weekEntries]) => ({
    weekStart,
    localDate: weekStart,
    weightKg:
      weekEntries.reduce((sum, entry) => sum + Number(entry.weightKg), 0) /
      weekEntries.length,
    samples: weekEntries.length,
    entries: weekEntries,
  }));
  const points = weeks.map(({ localDate, weightKg, samples }) => ({
    localDate,
    weightKg,
    samples,
  }));
  const spanDays = entries.length
    ? dayNumber(entries.at(-1).localDate) - dayNumber(entries[0].localDate)
    : 0;
  const latest = points.at(-1) || null;
  const candidates = latest
    ? points
        .slice(0, -1)
        .map((point) => ({
          point,
          days: dayNumber(latest.localDate) - dayNumber(point.localDate),
        }))
        .filter((item) => item.days >= 7)
    : [];
  const fourWeek = candidates
    .filter((item) => item.days >= 21 && item.days <= 35)
    .sort(
      (left, right) =>
        Math.abs(left.days - 28) - Math.abs(right.days - 28) ||
        right.days - left.days,
    )[0];
  const comparison = fourWeek || candidates[0] || null;
  const ready = Boolean(
    entries.length >= 3 &&
      spanDays >= 7 &&
      weeks.length >= 2 &&
      latest &&
      comparison &&
      comparison.days >= 7,
  );
  const changeKg = ready
    ? latest.weightKg - comparison.point.weightKg
    : null;
  const changeFraction = ready
    ? changeKg / comparison.point.weightKg
    : null;
  const weeklyFraction = ready
    ? changeFraction / (comparison.days / 7)
    : null;
  return {
    entries,
    weeks,
    points,
    ready,
    latest,
    comparison,
    spanDays,
    changeKg,
    stable: Boolean(
      ready &&
        comparison.days >= 28 &&
        Math.abs(changeFraction) < 0.005,
    ),
    rapidDownward: Boolean(
      ready && comparison.days >= 14 && weeklyFraction < -0.01,
    ),
  };
}
export function workoutPlanDate(workout) {
  const explicit = workout?.canonicalPlanDate || workout?.workoutDateKey;
  if (typeof explicit === "string" && /^\d{4}-\d{2}-\d{2}$/.test(explicit))
    return explicit;
  const timestamp =
    workout?.startedAt ?? workout?.completedAt ?? workout?.endedAt ?? null;
  if (timestamp === null || Number.isNaN(new Date(timestamp).getTime())) return null;
  return isoDay(timestamp);
}
export const weekday = (date = new Date()) => dayNames[new Date(date).getDay()];
export function normalizeWorkoutName(name, day) {
  let value = String(name || "").trim();
  const labels = WORKOUT_DAY_NAMES[day] || [];
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefixed = value.match(
      new RegExp(`^${escaped}\\s*[\\u00b7:|\\u2013\\u2014-]+\\s*(.+)$`, "iu"),
    );
    if (prefixed) {
      value = prefixed[1].trim();
      break;
    }
    const suffixed = value.match(
      new RegExp(`^(.+?)\\s*[\\u00b7:|\\u2013\\u2014-]+\\s*${escaped}$`, "iu"),
    );
    if (suffixed) {
      value = suffixed[1].trim();
      break;
    }
    if (new RegExp(`^${escaped}$`, "iu").test(value)) {
      value = "";
      break;
    }
  }
  return value || "Workout";
}
const WORKOUT_IDENTITY_PATTERN =
  "(?:Full\\s+Body|Upper|Lower|Push|Pull|Legs?|Noge|Chest|Prsa|Back|Hrbet|Shoulders?|Ramena|Arms?|Roke)(?:\\s+[ABC123])?";
function descriptorKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function recognizedWorkoutDescriptor(value) {
  const key = descriptorKey(value);
  if (!key) return false;
  if (
    /^(?:strength|hypertrophy|power|functional(?: training)?|heavy|light|volume|technique|moc|hipertrofija|funkcija|funkcional(?:no|ni|na)?|tezko|tezak|tezka|lahko|lahek|lahka|volumen|tehnika)$/u.test(
      key,
    )
  )
    return true;
  if (/^(?:balanced|high|low|moderate|athletic)\s+(?:strength|volume|power|hypertrophy)$/u.test(key))
    return true;
  if (/^athletic strength and conditioning$/u.test(key)) return true;
  return /^(?:chest|back|shoulders?|arms?|quads?|quadriceps|hamstrings?|glutes?|posterior|prsa|hrbet|ramena|roke|kvadricepsi|zadnja loza|zadnjica|gluteusi)(?:\s+(?:focus|focused|emphasis|width|priority|poudarek))$/u.test(
    key,
  );
}
function recognizedWorkoutDescriptorExpression(value) {
  if (recognizedWorkoutDescriptor(value)) return true;
  const nested = String(value || "").match(/^(.*?)\s*\((.+)\)\s*$/u);
  return Boolean(nested && recognizedWorkoutDescriptor(nested[1]));
}
function displayWorkoutDescriptor(value) {
  let text = String(value || "")
    .trim()
    .replace(/^\(|\)$/g, "")
    .replace(/\s+/g, " ");
  if (!text) return "";
  if (/^[\p{Lu}\d\s&/-]+$/u.test(text))
    text = text.toLocaleLowerCase().replace(/^\p{Ll}/u, (letter) =>
      letter.toLocaleUpperCase(),
    );
  text = text.replace(
    /\b(chest|back|shoulders?|arms?|quads?|quadriceps|hamstrings?|glutes?|posterior)[ -]?focused\b/gi,
    (_, area) => `${area[0].toUpperCase()}${area.slice(1).toLowerCase()} focus`,
  );
  return text;
}
export function workoutDisplayParts(value, day) {
  const source = typeof value === "object" && value ? value : null;
  const title = normalizeWorkoutName(source?.name ?? value, day || source?.weekday);
  if (source?.workoutName) {
    return {
      primary: String(source.workoutName).trim() || title,
      detail: String(source.workoutDescriptor || "").trim(),
      context: "",
    };
  }
  let primary = title;
  let detail = "";
  let context = "";
  const parenthetical = title.match(/^(.+?)\s*\(([^()]+)\)\s*$/u);
  if (parenthetical && recognizedWorkoutDescriptor(parenthetical[2])) {
    primary = parenthetical[1];
    detail = parenthetical[2];
  } else {
    const separated = title.match(/^(.+?)\s*(?:[—–·|/:]|\s-\s)\s*(.+)$/u);
    if (separated && recognizedWorkoutDescriptorExpression(separated[2])) {
      primary = separated[1];
      detail = separated[2];
    } else {
      const prefixed = title.match(
        new RegExp(`^(.+?[- ]focused)\\s+(${WORKOUT_IDENTITY_PATTERN})$`, "iu"),
      );
      if (prefixed && recognizedWorkoutDescriptor(prefixed[1])) {
        primary = prefixed[2];
        detail = prefixed[1];
      } else {
        const suffixed = title.match(
          new RegExp(`^(${WORKOUT_IDENTITY_PATTERN})\\s+(.+)$`, "iu"),
        );
        if (suffixed && recognizedWorkoutDescriptor(suffixed[2])) {
          primary = suffixed[1];
          detail = suffixed[2];
        }
      }
    }
  }
  const nestedContext = detail.match(/^(.*?)\s*\((.+)\)\s*$/u);
  if (nestedContext && recognizedWorkoutDescriptor(nestedContext[1])) {
    detail = nestedContext[1];
    context = nestedContext[2];
  }
  return {
    primary: primary.trim(),
    detail: displayWorkoutDescriptor(detail),
    context: context.trim(),
  };
}
export const displayDate = (date = new Date()) =>
  new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
export const formatDuration = (seconds) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;
export const pluralize = (count, singular, plural = `${singular}s`) =>
  `${count} ${Number(count) === 1 ? singular : plural}`;
export const exerciseMeasure = (exercise) =>
  exerciseCatalog[exercise?.exerciseId]?.measure || exercise?.measure || "reps";
export function exerciseLoadRequirement(exercise) {
  const snapshot =
    typeof exercise === "string" ? { exerciseId: exercise } : exercise || {};
  const id = snapshot.exerciseId || snapshot.id;
  const catalogItem = id ? exerciseCatalog[id] : null;
  const explicitCatalogRequirement = EXPLICIT_LOAD_REQUIREMENTS[id];
  if (explicitCatalogRequirement) return explicitCatalogRequirement;

  // Catalog metadata is the canonical contract. A program or active-workout
  // snapshot may have been stored by an older release with the wrong value;
  // never let that stale snapshot override a known exercise definition.
  if (
    catalogItem !== snapshot &&
    LOAD_REQUIREMENTS.has(catalogItem?.loadRequirement)
  )
    return catalogItem.loadRequirement;

  const explicit = snapshot.loadRequirement;
  if (LOAD_REQUIREMENTS.has(explicit)) return explicit;

  const source = catalogItem || snapshot;
  const equipment = (source.equipment || snapshot.equipment || []).map((value) =>
    String(value).toLowerCase(),
  );
  if (
    source.isStretch ||
    ["mobility", "balance"].includes(source.pattern) ||
    ["duration", "distance_duration"].includes(source.exerciseType) ||
    (source.kind === "power" && source.bodyweight) ||
    (equipment.length > 0 &&
      equipment.every((value) => LOAD_FREE_EQUIPMENT.has(value)))
  )
    return "none";
  // A support station does not automatically make load mandatory. Exercises
  // explicitly modeled as bodyweight reps (for example a reverse hyper or
  // captain's-chair raise) remain completable at zero added load.
  if (
    source.bodyweight ||
    source.exerciseType === "bodyweight_reps" ||
    source.exerciseType === "assisted_bodyweight" ||
    equipment.includes("bodyweight") ||
    equipment.includes("pull-up bar")
  )
    return "optional";
  if (equipment.some((value) => LOAD_BEARING_EQUIPMENT.has(value)))
    return "required";
  return "required";
}
export function workingSetCanComplete(exercise, set) {
  const repetitions = Number(set?.reps);
  if (!Number.isFinite(repetitions) || repetitions <= 0) return false;
  const requirement = exerciseLoadRequirement(exercise);
  if (requirement === "none") return true;
  const weightMissing =
    set?.weight === null || set?.weight === undefined || set?.weight === "";
  // Null is the canonical representation for bodyweight with no added load.
  // Accept legacy zeroes too so an old session can never trap the user, then
  // normalize them during state loading and the next edit.
  if (
    requirement === "optional" &&
    (weightMissing || Number(set?.weight) === 0)
  )
    return true;
  const weight = Number(set?.weight);
  return Number.isFinite(weight) && weight > 0;
}
export const exerciseValueLabel = (exercise, value) =>
  exerciseMeasure(exercise) === "seconds" ? `${value} sec` : String(value);
export const repRangeLabel = (minimum, maximum) =>
  Number(minimum) === Number(maximum)
    ? String(minimum)
    : `${minimum}–${maximum}`;
export const targetLabel = (exercise, showRir = true) => {
  const timed = exerciseMeasure(exercise) === "seconds";
  const minimum = exercise.repMin ?? exercise.repRange?.[0];
  const maximum = exercise.repMax ?? exercise.repRange?.[1];
  return `${exercise.sets.filter((set) => set.planned !== false && !set.added).length} × ${exercise.failureTarget ? "failure" : repRangeLabel(minimum, maximum)}${timed ? " sec" : ""}${!timed && showRir && Number.isFinite(exercise.targetRir) ? ` · ${exercise.targetRir} RIR` : ""}`;
};
function normalizeTimedExercises(exercises, force = false) {
  for (const exercise of exercises || []) {
    const item = exerciseCatalog[exercise.exerciseId];
    if (item?.measure !== "seconds") continue;
    const [minimum, maximum] = item.durationRange;
    const legacyRepPrescription = Number(exercise.repMax) <= 20;
    if (!force && !legacyRepPrescription) continue;
    exercise.repMin = minimum;
    exercise.repMax = maximum;
    exercise.targetRir = null;
    for (const set of exercise.sets || [])
      if (force || (!set.completed && Number(set.reps) <= 20))
        set.reps = minimum;
  }
  return exercises;
}
const KG_PER_LB = 0.45359237;
export const weightUnit = (units) => (units === "lb" ? "lb" : "kg");
export function displayWeight(kg, units = "kg") {
  if (kg === null || kg === undefined || kg === "") return "";
  return Number((units === "lb" ? kg / KG_PER_LB : kg).toFixed(2));
}
export function storedWeight(value, units = "kg") {
  if (value === "" || value === null || value === undefined) return null;
  const kilograms = units === "lb" ? Number(value) * KG_PER_LB : Number(value);
  return Number(kilograms.toFixed(2));
}
export function weekDate(day, date = new Date()) {
  const result = calendarDate(date);
  result.setHours(12, 0, 0, 0);
  const mondayOffset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - mondayOffset + WEEKDAYS.indexOf(day));
  return result;
}

export const PHYSIQUE_PRIORITY_OPTIONS = {
  upper_chest: {
    label: "Upper chest",
    trainingPriority: "Chest",
    patterns: ["incline-push"],
  },
  chest: {
    label: "Chest",
    trainingPriority: "Chest",
    patterns: ["horizontal-push", "incline-push"],
  },
  lateral_delts: {
    label: "Lateral delts",
    trainingPriority: "Shoulders",
    patterns: ["shoulder-isolation"],
  },
  rear_delts: {
    label: "Rear delts",
    trainingPriority: "Shoulders",
    patterns: ["rear-delt"],
  },
  back_width: {
    label: "Back width",
    trainingPriority: "Back",
    patterns: ["vertical-pull"],
  },
  back_thickness: {
    label: "Back thickness",
    trainingPriority: "Back",
    patterns: ["horizontal-pull"],
  },
  biceps: {
    label: "Biceps",
    trainingPriority: "Arms",
    patterns: ["elbow-flexion"],
  },
  triceps: {
    label: "Triceps",
    trainingPriority: "Arms",
    patterns: ["elbow-extension"],
  },
  quads: {
    label: "Quads",
    trainingPriority: "Quads",
    patterns: ["squat", "single-leg"],
  },
  hamstrings: {
    label: "Hamstrings",
    trainingPriority: "Hamstrings / glutes",
    patterns: ["hinge", "knee-flexion"],
  },
  glutes: {
    label: "Glutes",
    trainingPriority: "Hamstrings / glutes",
    patterns: ["hip-extension", "single-leg"],
  },
  calves: { label: "Calves", trainingPriority: "Calves", patterns: ["calf"] },
};
export function confirmedPhysiquePriorities(profile) {
  return (profile?.prioritySources?.physiqueConfirmed || []).filter(
    (item) => PHYSIQUE_PRIORITY_OPTIONS[item.priorityId],
  );
}
export function combinedTrainingPriorities(manual = [], confirmed = []) {
  const explicit = (manual || []).filter(
    (value) => value && value !== "Balanced",
  );
  const derived = (confirmed || [])
    .map((item) => PHYSIQUE_PRIORITY_OPTIONS[item.priorityId]?.trainingPriority)
    .filter(Boolean);
  const combined = [...new Set([...explicit, ...derived])];
  return combined.length ? combined : ["Balanced"];
}
export function defaultProfile() {
  return {
    id: uid("profile"),
    name: "",
    ageRange: null,
    sex: null,
    goal: null,
    experience: null,
    daysPerWeek: null,
    availableDays: [],
    sessionMinutes: null,
    environment: null,
    equipment: [],
    priorities: ["Balanced"],
    prioritySources: {
      manual: ["Balanced"],
      physiqueSuggested: [],
      physiqueConfirmed: [],
    },
    avoid: "",
    trainingSafetyConfirmedHash: null,
    trainingPreferences: "",
    exercisePreference: "No preference",
    effortStyle: "Balanced workload · usually 3 sets · 1–2 RIR",
    followUpAnswers: [],
    units: "kg",
    rirEnabled: false,
    recommendedWarmupsEnabled: true,
    rampUpSetsEnabled: true,
    showExerciseImages: true,
    appearancePreference: "system",
    stylePreference: "standard",
    themePreference: "system",
    restTimerEnabled: true,
    restTimerAutoStart: true,
    restTimerSeconds: null,
    onboardingComplete: false,
    increments: { barbell: 2.5, dumbbells: 2, machines: 5, cables: 2.5 },
    restDefaults: { compound: 120, isolation: 60 },
  };
}
export function blankState() {
  return {
    schemaVersion: 3,
    profile: defaultProfile(),
    program: null,
    activeWorkout: null,
    activeOptionalSession: null,
    todayAdaptation: null,
    weekScheduleOverrides: {},
    workoutOccurrenceOverrides: {},
    optionalSessions: [],
    workouts: [],
    workoutCorrections: [],
    programChangeHistory: [],
    conversations: [],
    activeCoachConversationId: null,
    progressFocusOverrideByPlanId: {},
    weightTrackingEnabled: false,
    weightCheckins: [],
    selectedDay: null,
    selectedDate: null,
    ai: { available: null, provider: null },
  };
}
function normalizeActiveOptionalSession(session) {
  if (!session || !["Cardio", "Mobility"].includes(session.kind)) return null;
  const startedAt = Number(session.startedAt);
  if (!Number.isFinite(startedAt)) return null;
  const paused = session.status === "paused";
  return {
    ...session,
    status: paused ? "paused" : "active",
    startedAt,
    runningSince: paused
      ? null
      : Number.isFinite(Number(session.runningSince))
        ? Number(session.runningSince)
        : startedAt,
    accumulatedSeconds: Math.max(
      0,
      Number(session.accumulatedSeconds) || 0,
    ),
  };
}
function migrateOptionalSessionLifecycle(stored) {
  stored.optionalSessions = Array.isArray(stored.optionalSessions)
    ? stored.optionalSessions
    : [];
  let active = normalizeActiveOptionalSession(stored.activeOptionalSession);
  const legacyIndex = stored.optionalSessions.findLastIndex((session) =>
    ["started", "active", "paused"].includes(session?.status),
  );
  if (!active && legacyIndex >= 0) {
    active = normalizeActiveOptionalSession(stored.optionalSessions[legacyIndex]);
    stored.optionalSessions.splice(legacyIndex, 1);
  }
  if (active && stored.activeWorkout) {
    stored.optionalSessions.push({
      ...active,
      status: "cancelled",
      cancelledAt: Date.now(),
      cancellationReason: "conflicting-active-workout",
    });
    active = null;
  }
  stored.activeOptionalSession = active;
  return stored;
}
function blockedExerciseReplacementId(exerciseId, profile) {
  return (
    (BLOCKED_EXERCISE_REPLACEMENTS[exerciseId] || []).find((id) =>
      isExerciseAllowed(exerciseCatalog[id], profile),
    ) || null
  );
}
function migrateBlockedExercise(exercise, profile) {
  if (!BLOCKED_EXERCISE_REPLACEMENTS[exercise?.exerciseId]) return exercise;
  const replacementId = blockedExerciseReplacementId(
    exercise.exerciseId,
    profile,
  );
  if (!replacementId) return null;
  const replacement = exerciseCatalog[replacementId];
  const {
    importedName,
    originalImportedName,
    importedExercise,
    matchStatus,
    ...stored
  } = exercise;
  return {
    ...stored,
    exerciseId: replacementId,
    exerciseSource: "catalog",
    defaultIncrement: replacement.increment,
    restSeconds: replacement.restSeconds,
  };
}
function migrateBlockedExercises(stored) {
  const profile = stored.profile || defaultProfile();
  const migrateWorkout = (workout) => {
    if (!Array.isArray(workout?.exercises)) return;
    const seen = new Set();
    workout.exercises = workout.exercises
      .map((exercise) => migrateBlockedExercise(exercise, profile))
      .filter((exercise) => {
        if (!exercise || seen.has(exercise.exerciseId)) return false;
        seen.add(exercise.exerciseId);
        return true;
      });
    if (Number.isFinite(Number(workout.estimatedMinutes)))
      workout.estimatedMinutes = estimateSessionMinutes(workout.exercises);
  };
  stored.program?.days?.forEach(migrateWorkout);
  migrateWorkout(stored.activeWorkout);
  for (const session of stored.optionalSessions || [])
    migrateWorkout(session?.workout);
  if (stored.todayAdaptation?.exerciseIds)
    stored.todayAdaptation.exerciseIds = [
      ...new Set(
        stored.todayAdaptation.exerciseIds
          .map((id) =>
            BLOCKED_EXERCISE_REPLACEMENTS[id]
              ? blockedExerciseReplacementId(id, profile)
              : id,
          )
          .filter(Boolean),
      ),
    ];
  if (stored.todayAdaptation?.setTargets)
    stored.todayAdaptation.setTargets = stored.todayAdaptation.setTargets
      .map((item) => ({
        ...item,
        exerciseId: BLOCKED_EXERCISE_REPLACEMENTS[item.exerciseId]
          ? blockedExerciseReplacementId(item.exerciseId, profile)
          : item.exerciseId,
      }))
      .filter((item) => item.exerciseId);
  return stored;
}
function migrateMissingExerciseRest(stored) {
  const migrateWorkout = (workout) => {
    for (const exercise of workout?.exercises || []) {
      if (exercise.restSeconds !== null && exercise.restSeconds !== undefined)
        continue;
      const sourceName =
        exercise.importedName ||
        exercise.originalImportedName ||
        exercise.importedExercise?.name;
      const matchedId = sourceName
        ? matchImportedExerciseName(sourceName).exerciseId
        : null;
      exercise.restSeconds =
        exerciseCatalog[exercise.exerciseId]?.restSeconds ||
        exerciseCatalog[matchedId]?.restSeconds ||
        90;
    }
  };
  stored.program?.days?.forEach(migrateWorkout);
  migrateWorkout(stored.activeWorkout);
  for (const session of stored.optionalSessions || [])
    migrateWorkout(session?.workout);
  return stored;
}
function migrateExerciseLoadContracts(stored) {
  const migrateWorkout = (workout) => {
    for (const exercise of workout?.exercises || []) {
      const requirement = exerciseLoadRequirement(exercise);
      exercise.loadRequirement = requirement;
      if (requirement !== "optional") continue;
      for (const set of exercise.sets || []) {
        if (Number(set.weight) !== 0) continue;
        set.weight = null;
        set.weightProvenance = null;
      }
    }
  };
  stored.program?.days?.forEach(migrateWorkout);
  migrateWorkout(stored.activeWorkout);
  for (const session of stored.optionalSessions || [])
    migrateWorkout(session?.workout);
  for (const workout of stored.workouts || []) migrateWorkout(workout);
  return stored;
}
function migrateWorkoutPlanDates(stored) {
  const migrate = (workout) => {
    if (!workout || typeof workout !== "object") return;
    const canonicalPlanDate = workoutPlanDate(workout);
    if (!canonicalPlanDate) return;
    workout.canonicalPlanDate ||= canonicalPlanDate;
    workout.workoutDateKey ||= canonicalPlanDate;
    if (!workout.sourcePlanSlotId && workout.programDayId)
      workout.sourcePlanSlotId = `${workout.programDayId}:${canonicalPlanDate}`;
  };
  migrate(stored.activeWorkout);
  for (const workout of stored.workouts || []) migrate(workout);
  for (const session of stored.optionalSessions || []) migrate(session?.workout);
  return stored;
}
export function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || ![2, 3].includes(stored.schemaVersion)) return blankState();
    stored.schemaVersion = 3;
    migrateBlockedExercises(stored);
    migrateMissingExerciseRest(stored);
    migrateExerciseLoadContracts(stored);
    migrateWorkoutPlanDates(stored);
    migrateOptionalSessionLifecycle(stored);
    const base = blankState();
    stored.program?.days?.forEach((day) =>
      normalizeTimedExercises(day.exercises),
    );
    normalizeTimedExercises(stored.activeWorkout?.exercises);
    const repairedProgram = repairProgramSchedule(stored.program);
    repairedProgram?.days?.forEach((day) => {
      if (!day.nameEdited)
        day.name = normalizeWorkoutName(day.name, day.weekday);
      const titleParts = workoutDisplayParts(day, day.weekday);
      if (!day.workoutName && titleParts.detail) {
        day.workoutName = titleParts.primary;
        day.workoutDescriptor = titleParts.detail;
      }
      if (
        repairedProgram.source === "ai-import" &&
        !day.originalImportedWorkoutName
      )
        day.originalImportedWorkoutName = day.name;
    });
    const checked = validateProgram(repairedProgram, null, {
      preserveSchedule: Boolean(repairedProgram?.userEdited),
    });
    const program = checked.valid ? repairedProgram : null;
    if (program && program.goalAtCreation === undefined) {
      const userAuthored = ["ai-import", "manual"].includes(program.source);
      program.goalAtCreation = userAuthored
        ? null
        : trainingGoalKey(program.goal || stored.profile?.goal);
    }
    const legacyPrioritySources = stored.profile?.prioritySources || {
      manual: Array.isArray(stored.profile?.priorities)
        ? stored.profile.priorities
        : [],
      physiqueSuggested: [],
      physiqueConfirmed: [],
    };
    const legacyThemePreference = ["system", "light", "dark", "premium"].includes(
      stored.profile?.themePreference,
    )
      ? stored.profile.themePreference
      : "light";
    let appearancePreference = ["system", "light", "dark"].includes(
      stored.profile?.appearancePreference,
    )
      ? stored.profile.appearancePreference
      : legacyThemePreference === "premium"
        ? "system"
        : legacyThemePreference;
    let stylePreference = ["standard", "premium"].includes(
      stored.profile?.stylePreference,
    )
      ? stored.profile.stylePreference
      : legacyThemePreference === "premium"
        ? "premium"
        : "standard";
    const expectedLegacyTheme =
      stylePreference === "premium" ? "premium" : appearancePreference;
    if (
      ["system", "light", "dark", "premium"].includes(
        stored.profile?.themePreference,
      ) &&
      stored.profile.themePreference !== expectedLegacyTheme
    ) {
      // A still-open legacy client can update only themePreference. Preserve
      // that write and immediately bring the new axes back into sync.
      appearancePreference =
        stored.profile.themePreference === "premium"
          ? "system"
          : stored.profile.themePreference;
      stylePreference =
        stored.profile.themePreference === "premium" ? "premium" : "standard";
    }
    const profile = {
      ...base.profile,
      ...(stored.profile || {}),
      appearancePreference,
      stylePreference,
      // Keep the old value as a one-release compatibility alias for older
      // tabs and integrations that have not adopted the two-axis model yet.
      themePreference:
        stylePreference === "premium" ? "premium" : appearancePreference,
      prioritySources: {
        ...base.profile.prioritySources,
        ...legacyPrioritySources,
      },
      increments: {
        ...base.profile.increments,
        ...(stored.profile?.increments || {}),
      },
      restDefaults: {
        ...base.profile.restDefaults,
        ...(stored.profile?.restDefaults || {}),
      },
      onboardingComplete: Boolean(
        program && stored.profile?.onboardingComplete,
      ),
    };
    const conversations = Array.isArray(stored.conversations)
      ? stored.conversations
      : [];
    let todayAdaptation = stored.todayAdaptation || null;
    if (todayAdaptation && !stored.activeWorkout) {
      const legacy = [...conversations].reverse().find((entry) => {
        const named = String(entry.user || "").match(
          /\badapt\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
        )?.[1];
        return (
          named &&
          entry.reply?.action?.type === "adapt-today" &&
          entry.actionResult?.status === "applied" &&
          entry.reply.action.targetDate === todayAdaptation.date &&
          weekdayTokens[named.toLowerCase()] !== weekday(todayAdaptation.date)
        );
      });
      if (legacy) {
        todayAdaptation = null;
        legacy.actionResult = {
          ...legacy.actionResult,
          status: "reverted",
          revertedAt: Date.now(),
          reason: "target-date-mismatch",
        };
        legacy.reply = {
          ...legacy.reply,
          text: "That earlier adaptation targeted today by mistake, so it was automatically reverted. Your original workout remains unchanged.",
          action: null,
        };
      }
    }
    const activeCoachConversationId = Object.hasOwn(
      stored,
      "activeCoachConversationId",
    )
      ? stored.activeCoachConversationId
      : conversations.at(-1)?.conversationId ||
        (conversations.length ? "legacy" : null);
    if (
      stored.activeWorkout?.warmup &&
      stored.activeWorkout.warmup.generatorVersion !== 3
    )
      refreshWorkoutWarmup(stored.activeWorkout, profile, program);
    return {
      ...base,
      ...stored,
      profile,
      program,
      activeWorkout: Array.isArray(stored.activeWorkout?.exercises)
        ? {
            ...stored.activeWorkout,
            workoutDateKey:
              stored.activeWorkout.workoutDateKey ||
              isoDay(stored.activeWorkout.startedAt || new Date()),
            handledSupersetRestRounds: Array.isArray(
              stored.activeWorkout.handledSupersetRestRounds,
            )
              ? stored.activeWorkout.handledSupersetRestRounds
              : [],
          }
        : null,
      activeOptionalSession: normalizeActiveOptionalSession(
        stored.activeOptionalSession,
      ),
      todayAdaptation,
      workouts: Array.isArray(stored.workouts) ? stored.workouts : [],
      workoutCorrections: Array.isArray(stored.workoutCorrections)
        ? stored.workoutCorrections
        : [],
      programChangeHistory: Array.isArray(stored.programChangeHistory)
        ? stored.programChangeHistory
        : [],
      progressFocusOverrideByPlanId:
        stored.progressFocusOverrideByPlanId &&
        typeof stored.progressFocusOverrideByPlanId === "object"
          ? stored.progressFocusOverrideByPlanId
          : {},
      weightTrackingEnabled: Boolean(stored.weightTrackingEnabled),
      weightCheckins: Array.isArray(stored.weightCheckins)
        ? stored.weightCheckins
            .filter(
              (entry) =>
                entry &&
                /^\d{4}-\d{2}-\d{2}$/.test(entry.localDate) &&
                Number.isFinite(Number(entry.weightKg)) &&
                Number(entry.weightKg) >= 10 &&
                Number(entry.weightKg) <= 700,
            )
            .map((entry) => ({ ...entry, weightKg: Number(entry.weightKg) }))
        : [],
      conversations,
      activeCoachConversationId,
    };
  } catch {
    return blankState();
  }
}
export const saveState = (state) => {
  let persistedState = state;
  if (state?.profile) {
    const currentLegacy = state.profile.themePreference;
    const expectedLegacy =
      state.profile.stylePreference === "premium"
        ? "premium"
        : ["system", "light", "dark"].includes(
              state.profile.appearancePreference,
            )
          ? state.profile.appearancePreference
          : currentLegacy;
    // An older open tab may still write only themePreference. Detect that
    // deliberate legacy-axis change and migrate it forward before persisting.
    if (
      ["system", "light", "dark", "premium"].includes(currentLegacy) &&
      currentLegacy !== expectedLegacy
    ) {
      persistedState = {
        ...state,
        profile: {
          ...state.profile,
          appearancePreference:
            currentLegacy === "premium" ? "system" : currentLegacy,
          stylePreference:
            currentLegacy === "premium" ? "premium" : "standard",
        },
      };
    }
    persistedState = {
      ...persistedState,
      profile: {
        ...persistedState.profile,
        themePreference:
          persistedState.profile.stylePreference === "premium"
        ? "premium"
            : persistedState.profile.appearancePreference,
      },
    };
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
    return true;
  } catch {
    return false;
  }
};

export const weekKey = (date = new Date()) => isoDay(weekDate("Mon", date));
function calendarDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return new Date(`${value}T12:00:00`);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
export function firstScheduledDate(program, fromDate = new Date()) {
  const scheduledDays = new Set(
    (program?.days || []).map((day) => day.weekday),
  );
  if (!scheduledDays.size) return null;
  const cursor = calendarDate(fromDate);
  cursor.setHours(12, 0, 0, 0);
  for (let offset = 0; offset < 8; offset += 1) {
    if (scheduledDays.has(weekday(cursor))) return isoDay(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}
function rotatingWorkoutForDate(program, scheduledDate) {
  const startDate = String(program?.rotationStartDate || "");
  const targetDate = isoDay(scheduledDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || targetDate < startDate)
    return null;
  const sequence = [...(program?.days || [])].sort(
    (a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday),
  );
  if (!sequence.length) return null;
  const scheduledDays = new Set(sequence.map((day) => day.weekday));
  const cursor = calendarDate(startDate);
  const target = calendarDate(targetDate);
  let position = 0;
  while (cursor <= target) {
    if (scheduledDays.has(weekday(cursor))) position += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return position ? sequence[(position - 1) % sequence.length] : null;
}
export function currentWeekSchedule(state, date = new Date()) {
  if (!state?.program) return [];
  const key = weekKey(date);
  const overrides = state.weekScheduleOverrides?.[key] || {};
  return state.program.days
    .map((slot) => {
      const originalDate = isoDay(weekDate(slot.weekday, date));
      const sourceWorkout =
        rotatingWorkoutForDate(state.program, originalDate) || slot;
      const scheduledDate = overrides[sourceWorkout.id] || originalDate;
      const occurrence =
        state.workoutOccurrenceOverrides?.[scheduledDate]?.[sourceWorkout.id];
      if (occurrence?.skipWorkout) return null;
      const excludedEntryIds = new Set(occurrence?.excludedEntryIds || []);
      const orderedEntryIds = Array.isArray(occurrence?.orderedEntryIds)
        ? occurrence.orderedEntryIds
        : [];
      const orderIndex = new Map(
        orderedEntryIds.map((entryId, index) => [entryId, index]),
      );
      const sourceIndex = new Map(
        sourceWorkout.exercises.map((exercise, index) => [exercise.id, index]),
      );
      const occurrenceExercises = sourceWorkout.exercises
        .filter((exercise) => !excludedEntryIds.has(exercise.id))
        .sort((first, second) => {
          const firstOrder = orderIndex.has(first.id)
            ? orderIndex.get(first.id)
            : orderedEntryIds.length + sourceIndex.get(first.id);
          const secondOrder = orderIndex.has(second.id)
            ? orderIndex.get(second.id)
            : orderedEntryIds.length + sourceIndex.get(second.id);
          return firstOrder - secondOrder;
        });
      const customizedOccurrence = excludedEntryIds.size || orderedEntryIds.length;
      const workout = customizedOccurrence
        ? { ...sourceWorkout, exercises: occurrenceExercises }
        : sourceWorkout;
      if (!workout.exercises.length) return null;
      if (workout !== sourceWorkout)
        workout.estimatedMinutes = estimateSessionMinutes(workout.exercises);
      return {
        workout,
        workoutId: sourceWorkout.id,
        originalDate,
        scheduledDate,
        moved: scheduledDate !== originalDate,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

export function reorderExercisesForOccurrence(
  state,
  { planDate, workoutId, orderedEntryIds },
) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(planDate || ""))
    ? String(planDate)
    : isoDay(planDate);
  const source = state.program?.days.find((day) => day.id === workoutId);
  if (!source || !Array.isArray(orderedEntryIds)) return state;
  if (
    state.activeWorkout?.programDayId === workoutId &&
    workoutPlanDate(state.activeWorkout) === date
  )
    return state;
  const validIds = new Set(source.exercises.map((entry) => entry.id));
  const uniqueOrder = [...new Set(orderedEntryIds)].filter((entryId) =>
    validIds.has(entryId),
  );
  const dateOverrides = (state.workoutOccurrenceOverrides ||= {});
  const workoutOverrides = (dateOverrides[date] ||= {});
  const previous = workoutOverrides[workoutId] || {};
  workoutOverrides[workoutId] = {
    ...previous,
    orderedEntryIds: uniqueOrder,
  };
  return state;
}

export function removeExerciseFromOccurrence(
  state,
  { planDate, workoutId, planEntryId },
) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(planDate || ""))
    ? String(planDate)
    : isoDay(planDate);
  const source = state.program?.days.find((day) => day.id === workoutId);
  if (!source || !source.exercises.some((entry) => entry.id === planEntryId))
    return state;
  if (
    state.activeWorkout?.programDayId === workoutId &&
    workoutPlanDate(state.activeWorkout) === date
  )
    return state;
  const dateOverrides = (state.workoutOccurrenceOverrides ||= {});
  const workoutOverrides = (dateOverrides[date] ||= {});
  const previous = workoutOverrides[workoutId] || {};
  const excluded = new Set(previous.excludedEntryIds || []);
  excluded.add(planEntryId);
  const visible = source.exercises.filter((entry) => !excluded.has(entry.id));
  workoutOverrides[workoutId] = visible.length
    ? { ...previous, excludedEntryIds: [...excluded], skipWorkout: false }
    : { ...previous, excludedEntryIds: [...excluded], skipWorkout: true };
  return state;
}

export function restoreOccurrenceOverride(
  state,
  { planDate, workoutId, previousOverride },
) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(planDate || ""))
    ? String(planDate)
    : isoDay(planDate);
  state.workoutOccurrenceOverrides ||= {};
  if (previousOverride)
    (state.workoutOccurrenceOverrides[date] ||= {})[workoutId] =
      structuredClone(previousOverride);
  else if (state.workoutOccurrenceOverrides[date]) {
    delete state.workoutOccurrenceOverrides[date][workoutId];
    if (!Object.keys(state.workoutOccurrenceOverrides[date]).length)
      delete state.workoutOccurrenceOverrides[date];
  }
  return state;
}

export function removeExerciseFromWeeklyPlan(state, workoutId, planEntryId) {
  const index = state.program?.days.findIndex((day) => day.id === workoutId);
  if (index === undefined || index < 0) return state;
  const workout = state.program.days[index];
  const removed = workout.exercises.find((entry) => entry.id === planEntryId);
  if (!removed) return state;
  if (workout.exercises.length === 1) {
    if (state.program.days.length === 1) return state;
    state.program.days.splice(index, 1);
    state.profile.availableDays = (state.profile.availableDays || []).filter(
      (day) => day !== workout.weekday,
    );
    state.profile.daysPerWeek = state.program.days.length;
  } else {
    workout.exercises = workout.exercises.filter(
      (entry) => entry.id !== planEntryId,
    );
    if (removed.supersetId)
      workout.exercises.forEach((entry) => {
        if (entry.supersetId === removed.supersetId) delete entry.supersetId;
      });
    workout.estimatedMinutes = estimateSessionMinutes(workout.exercises);
  }
  state.program.version = Number(state.program.version || 1) + 1;
  state.program.updatedAt = new Date().toISOString();
  return state;
}

export function restoreWeeklyPlanWorkout(
  state,
  { workout, index, availableDays, daysPerWeek },
) {
  if (!state.program || !workout) return state;
  const existing = state.program.days.findIndex((day) => day.id === workout.id);
  if (existing >= 0) state.program.days[existing] = structuredClone(workout);
  else
    state.program.days.splice(
      Math.min(Math.max(0, index), state.program.days.length),
      0,
      structuredClone(workout),
    );
  state.profile.availableDays = structuredClone(availableDays || []);
  state.profile.daysPerWeek = daysPerWeek;
  state.program.version = Number(state.program.version || 1) + 1;
  state.program.updatedAt = new Date().toISOString();
  return state;
}
export function nextScheduledWorkout(state, afterDate = new Date()) {
  if (!state?.program?.days?.length) return null;
  const after = isoDay(afterDate);
  for (let weekOffset = 0; weekOffset <= 8; weekOffset += 1) {
    const reference = new Date(afterDate);
    reference.setDate(reference.getDate() + weekOffset * 7);
    const next = currentWeekSchedule(state, reference).find(
      (item) => item.scheduledDate > after,
    );
    if (next) return next;
  }
  return null;
}
export function plannedWorkoutForDate(state, date = new Date()) {
  const target = isoDay(date);
  return (
    currentWeekSchedule(state, date).find(
      (item) => item.scheduledDate === target,
    )?.workout || null
  );
}
export function validateWeekScheduleChanges(state, changes, date = new Date()) {
  if (!Array.isArray(changes) || !changes.length || !state?.program)
    return {
      valid: false,
      error: "No schedule changes were provided.",
      changes: [],
    };
  const schedule = currentWeekSchedule(state, date);
  const byId = new Map(schedule.map((item) => [item.workoutId, item]));
  const key = weekKey(date);
  const completed = new Set(
    (state.workouts || [])
      .filter(
        (workout) =>
          workout.completedAt && weekKey(workoutPlanDate(workout)) === key,
      )
      .map((workout) => workout.programDayId)
      .filter(Boolean),
  );
  const normalized = [];
  for (const change of changes) {
    const item = byId.get(change.workoutId);
    const toDate = isoDay(change.toDate);
    const fromDate = isoDay(change.fromDate);
    if (!item || item.scheduledDate !== fromDate || weekKey(toDate) !== key)
      return {
        valid: false,
        error: "The proposed workout or date no longer matches this week.",
        changes: [],
      };
    if (completed.has(change.workoutId))
      return {
        valid: false,
        error: `${item.workout.name} is already completed.`,
        changes: [],
      };
    if (state.activeWorkout?.programDayId === change.workoutId)
      return {
        valid: false,
        error: `${item.workout.name} is currently active.`,
        changes: [],
      };
    if (toDate < isoDay())
      return {
        valid: false,
        error: "Completed or past dates cannot be normal move targets.",
        changes: [],
      };
    normalized.push({ workoutId: change.workoutId, fromDate, toDate });
  }
  const finalDates = schedule.map(
    (item) =>
      normalized.find((change) => change.workoutId === item.workoutId)
        ?.toDate || item.scheduledDate,
  );
  if (new Set(finalDates).size !== finalDates.length)
    return {
      valid: false,
      error: "Two workouts cannot occupy the same date.",
      changes: [],
    };
  return { valid: true, changes: normalized, error: null };
}
export function applyWeekScheduleChanges(state, changes, date = new Date()) {
  const checked = validateWeekScheduleChanges(state, changes, date);
  if (!checked.valid) return state;
  const key = weekKey(date);
  state.weekScheduleOverrides ||= {};
  state.weekScheduleOverrides[key] = {
    ...(state.weekScheduleOverrides[key] || {}),
  };
  for (const change of checked.changes)
    state.weekScheduleOverrides[key][change.workoutId] = change.toDate;
  return state;
}

export function validateProgramExerciseChanges(state, changes) {
  if (!state?.program || !Array.isArray(changes) || !changes.length)
    return {
      valid: false,
      error: "No program changes were provided.",
      changes: [],
    };
  if (state.activeWorkout)
    return {
      valid: false,
      error: "Finish the active workout before editing the recurring program.",
      changes: [],
    };
  const normalized = [];
  for (const change of changes) {
    const workout = state.program.days.find(
      (day) => day.id === change.workoutId,
    );
    if (!workout)
      return {
        valid: false,
        error: "The proposed workout no longer exists.",
        changes: [],
      };
    const currentIds = workout.exercises.map((exercise) => exercise.exerciseId);
    const current = new Set(currentIds);
    const operations = [];
    const operatedEntries = new Set();
    for (const operation of change.operations || []) {
      if (!["replace", "remove"].includes(operation?.type))
        return {
          valid: false,
          error: `A proposed change for ${workout.name} is invalid.`,
          changes: [],
        };
      const entry = workout.exercises.find(
        (exercise) => exercise.id === operation.exerciseEntryId,
      );
      if (
        !entry ||
        operatedEntries.has(entry.id) ||
        (operation.fromExerciseId &&
          operation.fromExerciseId !== entry.exerciseId)
      )
        return {
          valid: false,
          error: `The proposed exercise in ${workout.name} has changed.`,
          changes: [],
        };
      const normalizedOperation = {
        type: operation.type,
        exerciseEntryId: entry.id,
        fromExerciseId: entry.exerciseId,
      };
      if (operation.type === "replace") {
        const replacement = exerciseCatalog[operation.toExerciseId];
        const duplicate = workout.exercises.some(
          (exercise) =>
            exercise.id !== entry.id &&
            exercise.exerciseId === operation.toExerciseId,
        );
        const compatible = compatibleReplacementCandidates(
          entry,
          state.profile,
          currentIds,
        ).some((item) => item.id === operation.toExerciseId);
        if (!replacement || duplicate || !compatible)
          return {
            valid: false,
            error: `The proposed replacement for ${workout.name} is no longer available.`,
            changes: [],
          };
        normalizedOperation.toExerciseId = replacement.id;
      }
      operatedEntries.add(entry.id);
      operations.push(normalizedOperation);
    }
    const removeExerciseIds = [
      ...new Set(change.removeExerciseIds || []),
    ].filter((id) => current.has(id));
    const addExerciseIds = [...new Set(change.addExerciseIds || [])].filter(
      (id) => !current.has(id),
    );
    if (!operations.length && !removeExerciseIds.length && !addExerciseIds.length)
      return {
        valid: false,
        error: `No actual change was proposed for ${workout.name}.`,
        changes: [],
      };
    if (
      addExerciseIds.some(
        (id) =>
          !exerciseCatalog[id] ||
          !isExerciseAllowed(exerciseCatalog[id], state.profile),
      )
    )
      return {
        valid: false,
        error: `A proposed exercise for ${workout.name} is unavailable with this profile.`,
        changes: [],
      };
    const operationRemovals = new Set(
      operations
        .filter((operation) => operation.type === "remove")
        .map((operation) => operation.exerciseEntryId),
    );
    const remaining = workout.exercises
      .filter((exercise) => !operationRemovals.has(exercise.id))
      .map((exercise) => exercise.exerciseId)
      .filter(
      (id) => !removeExerciseIds.includes(id),
    );
    if (
      remaining.length + addExerciseIds.length < 1 ||
      remaining.length + addExerciseIds.length > 12
    )
      return {
        valid: false,
        error: `${workout.name} would have an invalid exercise count.`,
        changes: [],
      };
    normalized.push({
      workoutId: workout.id,
      operations,
      addExerciseIds,
      removeExerciseIds,
    });
  }
  return { valid: true, changes: normalized, error: null };
}

export function applyProgramExerciseChanges(state, changes) {
  const checked = validateProgramExerciseChanges(state, changes);
  if (!checked.valid) return state;
  const previousVersion = Number(state.program.version || 1);
  for (const change of checked.changes) {
    const workout = state.program.days.find(
      (day) => day.id === change.workoutId,
    );
    for (const operation of change.operations) {
      const index = workout.exercises.findIndex(
        (exercise) => exercise.id === operation.exerciseEntryId,
      );
      if (index < 0) continue;
      if (operation.type === "remove") {
        workout.exercises.splice(index, 1);
        continue;
      }
      const current = workout.exercises[index];
      const replacement = exerciseCatalog[operation.toExerciseId];
      workout.exercises[index] = {
        ...current,
        exerciseId: replacement.id,
        defaultIncrement: replacement.increment,
        restSeconds: replacement.restSeconds,
        importedName: replacement.name,
        originalImportedName: replacement.name,
        matchStatus: "confirmed-match",
        exerciseSource: "catalog",
        sets: current.sets.map((set) => ({
          ...set,
          weight: null,
          completed: false,
          rir: null,
        })),
      };
      delete workout.exercises[index].importedExercise;
    }
    const removed = new Set(change.removeExerciseIds);
    workout.exercises = workout.exercises.filter(
      (exercise) => !removed.has(exercise.exerciseId),
    );
    for (const id of change.addExerciseIds)
      workout.exercises.push(
        makeProgramExercise(exerciseCatalog[id], state.profile),
      );
    workout.estimatedMinutes = estimateSessionMinutes(workout.exercises);
  }
  state.program.version = previousVersion + 1;
  state.program.updatedAt = new Date().toISOString();
  state.programChangeHistory ||= [];
  state.programChangeHistory.push({
    id: uid("program-change"),
    type: "exercise-review",
    programId: state.program.id,
    fromVersion: previousVersion,
    toVersion: state.program.version,
    changes: structuredClone(checked.changes),
    appliedAt: state.program.updatedAt,
  });
  return state;
}

function equipmentSet(profile) {
  const selected = new Set(profile.equipment || []);
  if (selected.has("full gym")) return FULL_GYM;
  const result = new Set(["bodyweight"]);
  if (selected.has("barbell/rack/bench"))
    ["barbell", "rack", "bench"].forEach((item) => result.add(item));
  for (const value of [
    "dumbbells",
    "cables",
    "machines",
    "pull-up bar",
    "resistance bands",
  ])
    if (selected.has(value)) result.add(value);
  return result;
}
export function isExerciseAllowed(item, profile) {
  if (!item || isExerciseGloballyBlocked(item)) return false;
  if (!profile?.ignoreTrainingSafety) {
    const trainingSafety = compileProfileTrainingSafety(
      profile,
      Object.values(exerciseCatalog),
    );
    if (!exerciseAllowedByTrainingSafety(item, trainingSafety)) return false;
  }
  const normalizeRestriction = (value) =>
    String(value || "")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const avoided = normalizeRestriction(profile.avoid);
  const equipmentWords = {
    barbell: "barbell",
    dumbbell: "dumbbells",
    dumbbells: "dumbbells",
    machine: "machines",
    machines: "machines",
    cable: "cables",
    cables: "cables",
    bodyweight: "bodyweight",
  };
  const mentionedEquipment = Object.entries(equipmentWords).find(([word]) =>
    new RegExp(`\\b${word}\\b`).test(avoided),
  )?.[1];
  const names = [item.name, ...(item.aliases || [])].map(normalizeRestriction);
  const explicitExercise = names.some((name) =>
    Boolean(
      name &&
      new RegExp(`\\b${name.replace(/\s+/g, "\\s+")}s?\\b`).test(avoided),
    ),
  );
  const familyRules = [
    {
      test: /\b(?:avoid|avoiding|no|cannot|cant|can t|dont want|don t want|do not want)(?: any| all)? squats?\b/,
      matches: (value) =>
        value.pattern === "squat" ||
        /squat/.test(normalizeRestriction(value.name)),
    },
    {
      test: /\b(?:avoid|avoiding|no|cannot|cant|can t|dont want|don t want|do not want)(?: any| all)? deadlifts?\b/,
      matches: (value) => /deadlift/.test(normalizeRestriction(value.name)),
    },
    {
      test: /\b(?:avoid|avoiding|no|cannot|cant|can t|dont want|don t want|do not want)(?: any| all)? bench press(?:es)?\b/,
      matches: (value) => /bench press/.test(normalizeRestriction(value.name)),
    },
  ];
  const familyMatch = familyRules.some(
    (rule) => rule.test.test(avoided) && rule.matches(item),
  );
  const equipmentScopedPattern = Boolean(
    mentionedEquipment &&
    item.equipment.includes(mentionedEquipment) &&
    item.pattern
      .split("-")
      .some(
        (word) =>
          word.length > 3 && new RegExp(`\\b${word}s?\\b`).test(avoided),
      ),
  );
  const blocked = Boolean(
    avoided &&
    (explicitExercise || familyMatch || equipmentScopedPattern) &&
    (!mentionedEquipment ||
      item.equipment.includes(mentionedEquipment) ||
      explicitExercise),
  );
  const available = equipmentSet(profile);
  return (
    !blocked && item.equipment.every((required) => available.has(required))
  );
}
export function isExerciseAutoGeneratable(item, profile) {
  return (
    !isExerciseAutoGenerationBlocked(item) && isExerciseAllowed(item, profile)
  );
}
export function hasBalancedPullEquipment(profile = {}) {
  const available = equipmentSet(profile);
  return [
    "barbell",
    "dumbbells",
    "cables",
    "machines",
    "pull-up bar",
    "resistance bands",
  ].some((item) => available.has(item));
}
const slot = (patterns, options = {}) => ({
  patterns: Array.isArray(patterns) ? patterns : [patterns],
  essential: options.essential !== false,
  role: options.role || "accessory",
});
export const PROGRAM_TEMPLATES = {
  "T2-UL": {
    name: "Upper / Lower",
    sessions: [
      {
        name: "Upper",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull", { role: "main" }),
          slot("vertical-push"),
          slot("vertical-pull"),
          slot(["shoulder-isolation", "elbow-extension"], { essential: false }),
        ],
      },
      {
        name: "Lower",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("knee-flexion"),
          slot(["calf", "core"], { essential: false }),
        ],
      },
    ],
  },
  "T2-FB": {
    name: "Full Body A / B",
    sessions: [
      {
        name: "Full Body A",
        slots: [
          slot(["squat", "single-leg"], { role: "main" }),
          slot(["horizontal-push", "incline-push"], { role: "main" }),
          slot("horizontal-pull"),
          slot("hinge"),
          slot("core", { essential: false }),
        ],
      },
      {
        name: "Full Body B",
        slots: [
          slot("hinge", { role: "main" }),
          slot("vertical-pull"),
          slot(["vertical-push", "horizontal-push"], { role: "main" }),
          slot(["single-leg", "squat"]),
          slot(["core", "shoulder-isolation"], { essential: false }),
        ],
      },
    ],
  },
  "T3-FB": {
    name: "Full Body A / B / C",
    sessions: [
      {
        name: "Full Body A",
        slots: [
          slot(["squat", "single-leg"], { role: "main" }),
          slot(["horizontal-push", "incline-push"], { role: "main" }),
          slot("horizontal-pull"),
          slot(["hinge", "knee-flexion"]),
          slot("core", { essential: false }),
        ],
      },
      {
        name: "Full Body B",
        slots: [
          slot("hinge", { role: "main" }),
          slot("vertical-push", { role: "main" }),
          slot("vertical-pull"),
          slot(["single-leg", "squat"]),
          slot("calf", { essential: false }),
        ],
      },
      {
        name: "Full Body C",
        slots: [
          slot(["single-leg", "squat"], { role: "main" }),
          slot(["incline-push", "horizontal-push"], { role: "main" }),
          slot(["horizontal-pull", "vertical-pull"]),
          slot(["knee-flexion", "hip-extension"]),
          slot(["shoulder-isolation", "core"], { essential: false }),
        ],
      },
    ],
  },
  "T3-UL": {
    name: "Upper / Lower Hybrid",
    sessions: [
      {
        name: "Upper",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull", { role: "main" }),
          slot("vertical-push"),
          slot("vertical-pull"),
          slot(["shoulder-isolation", "elbow-extension"], { essential: false }),
        ],
      },
      {
        name: "Lower",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("knee-flexion"),
          slot(["calf", "core"], { essential: false }),
        ],
      },
      {
        name: "Full Body",
        slots: [
          slot(["single-leg", "squat"], { role: "main" }),
          slot(["incline-push", "horizontal-push"], { role: "main" }),
          slot(["horizontal-pull", "vertical-pull"]),
          slot(["hinge", "hip-extension"]),
          slot(["shoulder-isolation", "core"], { essential: false }),
        ],
      },
    ],
  },
  "T3-PPL": {
    name: "Push / Pull / Legs",
    sessions: [
      {
        name: "Push",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("vertical-push"),
          slot("shoulder-isolation"),
          slot("elbow-extension"),
        ],
      },
      {
        name: "Pull",
        slots: [
          slot("horizontal-pull", { role: "main" }),
          slot("vertical-pull"),
          slot("elbow-flexion"),
          slot("core", { essential: false }),
        ],
      },
      {
        name: "Legs",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("knee-flexion"),
          slot("calf", { essential: false }),
        ],
      },
    ],
  },
  "T4-FB": {
    name: "Full Body A / B / C / D",
    sessions: [
      {
        name: "Full Body A",
        slots: [
          slot(["squat", "single-leg"], { role: "main" }),
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull"),
          slot(["hinge", "knee-flexion"]),
          slot("core", { essential: false }),
        ],
      },
      {
        name: "Full Body B",
        slots: [
          slot("hinge", { role: "main" }),
          slot("vertical-push", { role: "main" }),
          slot("vertical-pull"),
          slot(["single-leg", "squat"]),
          slot("elbow-flexion", { essential: false }),
        ],
      },
      {
        name: "Full Body C",
        slots: [
          slot(["single-leg", "squat"], { role: "main" }),
          slot(["incline-push", "horizontal-push"], { role: "main" }),
          slot(["horizontal-pull", "vertical-pull"]),
          slot(["knee-flexion", "hip-extension"]),
          slot("shoulder-isolation", { essential: false }),
        ],
      },
      {
        name: "Full Body D",
        slots: [
          slot(["hinge", "hip-extension"], { role: "main" }),
          slot(["horizontal-push", "vertical-push"]),
          slot(["vertical-pull", "horizontal-pull"]),
          slot("single-leg"),
          slot(["elbow-extension", "core"], { essential: false }),
        ],
      },
    ],
  },
  "T4-PPL": {
    name: "Push / Pull / Legs Hybrid",
    sessions: [
      {
        name: "Push",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("vertical-push"),
          slot("shoulder-isolation"),
          slot("elbow-extension"),
        ],
      },
      {
        name: "Pull",
        slots: [
          slot("horizontal-pull", { role: "main" }),
          slot("vertical-pull"),
          slot("elbow-flexion"),
          slot("core", { essential: false }),
        ],
      },
      {
        name: "Legs",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("knee-flexion"),
          slot("calf", { essential: false }),
        ],
      },
      {
        name: "Full Body",
        slots: [
          slot(["hinge", "squat"], { role: "main" }),
          slot(["incline-push", "horizontal-push"]),
          slot(["horizontal-pull", "vertical-pull"]),
          slot(["single-leg", "hip-extension"]),
          slot(["shoulder-isolation", "core"], { essential: false }),
        ],
      },
    ],
  },
  "T4-UL": {
    name: "Upper / Lower",
    sessions: [
      {
        name: "Upper A",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull", { role: "main" }),
          slot("vertical-push"),
          slot("vertical-pull"),
          slot("shoulder-isolation", { essential: false }),
          slot("elbow-extension", { essential: false }),
        ],
      },
      {
        name: "Lower A",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("knee-flexion", { essential: false }),
          slot(["calf", "core"], { essential: false }),
        ],
      },
      {
        name: "Upper B",
        slots: [
          slot(["incline-push", "horizontal-push"], { role: "main" }),
          slot("vertical-pull", { role: "main" }),
          slot("horizontal-pull"),
          slot(["vertical-push", "shoulder-isolation"]),
          slot("elbow-flexion", { essential: false }),
          slot("elbow-extension", { essential: false }),
        ],
      },
      {
        name: "Lower B",
        slots: [
          slot("hinge", { role: "main" }),
          slot("squat"),
          slot("single-leg"),
          slot(["knee-flexion", "hip-extension"], { essential: false }),
          slot(["calf", "core"], { essential: false }),
        ],
      },
    ],
  },
  "T5-UL": {
    name: "Upper / Lower Hybrid",
    sessions: [
      {
        name: "Upper A",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull", { role: "main" }),
          slot("vertical-push"),
          slot("vertical-pull"),
          slot("shoulder-isolation", { essential: false }),
        ],
      },
      {
        name: "Lower A",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("knee-flexion", { essential: false }),
          slot("calf", { essential: false }),
        ],
      },
      {
        name: "Upper B",
        slots: [
          slot(["incline-push", "horizontal-push"], { role: "main" }),
          slot("vertical-pull", { role: "main" }),
          slot("horizontal-pull"),
          slot(["vertical-push", "shoulder-isolation"]),
          slot("elbow-flexion", { essential: false }),
        ],
      },
      {
        name: "Lower B",
        slots: [
          slot("hinge", { role: "main" }),
          slot("squat"),
          slot("single-leg"),
          slot(["knee-flexion", "hip-extension"]),
          slot(["calf", "core"], { essential: false }),
        ],
      },
      {
        name: "Full Body",
        slots: [
          slot(["squat", "hinge"], { role: "main" }),
          slot("horizontal-push"),
          slot("horizontal-pull"),
          slot(["single-leg", "hip-extension"]),
          slot("core", { essential: false }),
        ],
      },
    ],
  },
  "T5-ULPPL": {
    name: "Upper / Lower / Push / Pull / Legs",
    sessions: [
      {
        name: "Upper",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull", { role: "main" }),
          slot("vertical-push"),
          slot("vertical-pull"),
          slot("shoulder-isolation", { essential: false }),
        ],
      },
      {
        name: "Lower",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("knee-flexion"),
          slot("calf", { essential: false }),
        ],
      },
      {
        name: "Push",
        slots: [
          slot(["incline-push", "horizontal-push"], { role: "main" }),
          slot("chest-isolation", { essential: false }),
          slot("vertical-push"),
          slot("shoulder-isolation"),
          slot("elbow-extension"),
        ],
      },
      {
        name: "Pull",
        slots: [
          slot("vertical-pull", { role: "main" }),
          slot("horizontal-pull"),
          slot("rear-delt", { essential: false }),
          slot("elbow-flexion"),
          slot("core", { essential: false }),
        ],
      },
      {
        name: "Legs",
        slots: [
          slot(["squat", "hip-extension", "hinge"], { role: "main" }),
          slot(["single-leg", "squat"]),
          slot("knee-flexion"),
          slot("knee-extension", { essential: false }),
          slot("calf"),
          slot("core", { essential: false }),
        ],
      },
    ],
  },
  "T6-PPL2": {
    name: "Push / Pull / Legs A / B",
    sessions: [
      {
        name: "Push A",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("vertical-push"),
          slot("shoulder-isolation"),
          slot("elbow-extension"),
        ],
      },
      {
        name: "Pull A",
        slots: [
          slot("horizontal-pull", { role: "main" }),
          slot("vertical-pull"),
          slot("elbow-flexion"),
          slot("core", { essential: false }),
        ],
      },
      {
        name: "Legs A",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("calf", { essential: false }),
        ],
      },
      {
        name: "Push B",
        slots: [
          slot(["incline-push", "horizontal-push"], { role: "main" }),
          slot("vertical-push"),
          slot("shoulder-isolation"),
          slot("elbow-extension"),
        ],
      },
      {
        name: "Pull B",
        slots: [
          slot("vertical-pull", { role: "main" }),
          slot("horizontal-pull"),
          slot("elbow-flexion"),
          slot("core", { essential: false }),
        ],
      },
      {
        name: "Legs B",
        slots: [
          slot("hinge", { role: "main" }),
          slot(["single-leg", "squat"]),
          slot(["knee-flexion", "hip-extension"]),
          slot("calf", { essential: false }),
        ],
      },
    ],
  },
  "T6-UL3": {
    name: "Upper / Lower A / B / C",
    sessions: [
      {
        name: "Upper A",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull", { role: "main" }),
          slot("vertical-push"),
          slot("vertical-pull"),
          slot("shoulder-isolation", { essential: false }),
        ],
      },
      {
        name: "Lower A",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("knee-flexion"),
          slot("calf", { essential: false }),
        ],
      },
      {
        name: "Upper B",
        slots: [
          slot(["incline-push", "horizontal-push"], { role: "main" }),
          slot("vertical-pull", { role: "main" }),
          slot("horizontal-pull"),
          slot(["vertical-push", "shoulder-isolation"]),
          slot("elbow-flexion", { essential: false }),
        ],
      },
      {
        name: "Lower B",
        slots: [
          slot("hinge", { role: "main" }),
          slot("squat"),
          slot("single-leg"),
          slot(["knee-flexion", "hip-extension"]),
          slot(["calf", "core"], { essential: false }),
        ],
      },
      {
        name: "Upper C",
        slots: [
          slot("vertical-push", { role: "main" }),
          slot("horizontal-pull", { role: "main" }),
          slot("horizontal-push"),
          slot("vertical-pull"),
          slot("elbow-extension", { essential: false }),
        ],
      },
      {
        name: "Lower C",
        slots: [
          slot(["single-leg", "squat"], { role: "main" }),
          slot(["hip-extension", "hinge"]),
          slot("knee-flexion"),
          slot("calf"),
          slot("core", { essential: false }),
        ],
      },
    ],
  },
  "T2-ARNOLD": {
    name: "Arnold-inspired Full Body",
    sessions: [
      {
        name: "Full Body A · Chest emphasis",
        slots: [
          slot(["squat", "single-leg"], { role: "main" }),
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull"),
          slot("vertical-pull"),
          slot("core", { essential: false }),
        ],
      },
      {
        name: "Full Body B · Back & shoulder emphasis",
        slots: [
          slot("hinge", { role: "main" }),
          slot("vertical-pull", { role: "main" }),
          slot("vertical-push"),
          slot(["single-leg", "squat"]),
          slot(["elbow-flexion", "elbow-extension"], { essential: false }),
        ],
      },
    ],
  },
  "T3-ARNOLD": {
    name: "Arnold Split",
    sessions: [
      {
        name: "Chest & Back",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull", { role: "main" }),
          slot("incline-push"),
          slot("vertical-pull"),
          slot("core", { essential: false }),
        ],
      },
      {
        name: "Shoulders & Arms",
        slots: [
          slot("vertical-push", { role: "main" }),
          slot("shoulder-isolation"),
          slot("elbow-flexion"),
          slot("elbow-extension"),
        ],
      },
      {
        name: "Legs",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("knee-flexion"),
          slot("calf", { essential: false }),
        ],
      },
    ],
  },
  "T4-ARNOLD": {
    name: "Arnold-inspired Hybrid",
    sessions: [
      {
        name: "Chest & Back",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull", { role: "main" }),
          slot("incline-push"),
          slot("vertical-pull"),
        ],
      },
      {
        name: "Legs",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("knee-flexion"),
          slot("calf", { essential: false }),
        ],
      },
      {
        name: "Shoulders & Arms",
        slots: [
          slot("vertical-push", { role: "main" }),
          slot("shoulder-isolation"),
          slot("elbow-flexion"),
          slot("elbow-extension"),
        ],
      },
      {
        name: "Full Body",
        slots: [
          slot(["hinge", "squat"], { role: "main" }),
          slot("horizontal-push"),
          slot("horizontal-pull"),
          slot(["vertical-push", "vertical-pull"]),
          slot("core", { essential: false }),
        ],
      },
    ],
  },
  "T5-ARNOLD": {
    name: "Arnold-inspired Hybrid",
    sessions: [
      {
        name: "Chest & Back A",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull", { role: "main" }),
          slot("incline-push"),
          slot("vertical-pull"),
        ],
      },
      {
        name: "Legs",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("knee-flexion"),
          slot("calf", { essential: false }),
        ],
      },
      {
        name: "Shoulders & Arms",
        slots: [
          slot("vertical-push", { role: "main" }),
          slot("shoulder-isolation"),
          slot("elbow-flexion"),
          slot("elbow-extension"),
        ],
      },
      {
        name: "Chest & Back B",
        slots: [
          slot(["incline-push", "horizontal-push"], { role: "main" }),
          slot("vertical-pull", { role: "main" }),
          slot("horizontal-pull"),
          slot("elbow-flexion", { essential: false }),
        ],
      },
      {
        name: "Full Body",
        slots: [
          slot(["hinge", "squat"], { role: "main" }),
          slot("horizontal-push"),
          slot("horizontal-pull"),
          slot(["single-leg", "knee-flexion"]),
          slot("core", { essential: false }),
        ],
      },
    ],
  },
  "T6-ARNOLD": {
    name: "Arnold Split A / B",
    sessions: [
      {
        name: "Chest & Back A",
        slots: [
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull", { role: "main" }),
          slot("incline-push"),
          slot("vertical-pull"),
        ],
      },
      {
        name: "Shoulders & Arms A",
        slots: [
          slot("vertical-push", { role: "main" }),
          slot("shoulder-isolation"),
          slot("elbow-flexion"),
          slot("elbow-extension"),
        ],
      },
      {
        name: "Legs A",
        slots: [
          slot("squat", { role: "main" }),
          slot("hinge"),
          slot("single-leg"),
          slot("calf", { essential: false }),
        ],
      },
      {
        name: "Chest & Back B",
        slots: [
          slot(["incline-push", "horizontal-push"], { role: "main" }),
          slot("vertical-pull", { role: "main" }),
          slot("horizontal-pull"),
          slot("elbow-flexion", { essential: false }),
        ],
      },
      {
        name: "Shoulders & Arms B",
        slots: [
          slot("vertical-push", { role: "main" }),
          slot("core"),
          slot("shoulder-isolation"),
          slot("elbow-extension"),
          slot("elbow-flexion", { essential: false }),
        ],
      },
      {
        name: "Legs B",
        slots: [
          slot("hinge", { role: "main" }),
          slot(["single-leg", "squat"]),
          slot(["knee-flexion", "hip-extension"]),
          slot("calf", { essential: false }),
        ],
      },
    ],
  },
};

const fullBodySession = (name, variant = 0) => ({
  name,
  slots: [
    slot(variant % 2 ? ["hinge", "single-leg"] : ["squat", "single-leg"], {
      role: "main",
    }),
    slot(
      variant % 3
        ? ["vertical-push", "horizontal-push"]
        : ["horizontal-push", "incline-push"],
      { role: "main" },
    ),
    slot(
      variant % 2
        ? ["vertical-pull", "horizontal-pull"]
        : ["horizontal-pull", "vertical-pull"],
    ),
    slot(variant % 2 ? ["squat", "knee-flexion"] : ["hinge", "hip-extension"]),
    slot(["core", "shoulder-isolation", "elbow-flexion"], { essential: false }),
  ],
});
const pushSession = (name, variant = 0) => ({
  name,
  slots: [
    slot(variant % 2 ? ["single-leg", "squat"] : ["squat", "single-leg"], {
      role: "main",
    }),
    slot(
      variant % 2 ? ["incline-push", "horizontal-push"] : "horizontal-push",
      { role: "main" },
    ),
    slot("vertical-push"),
    slot("shoulder-isolation"),
    slot("elbow-extension", { essential: false }),
  ],
});
const pullSession = (name, variant = 0) => ({
  name,
  slots: [
    slot(variant % 2 ? ["hip-extension", "hinge"] : "hinge", { role: "main" }),
    slot(variant % 2 ? "vertical-pull" : "horizontal-pull", { role: "main" }),
    slot(variant % 2 ? "horizontal-pull" : "vertical-pull"),
    slot("knee-flexion"),
    slot("elbow-flexion", { essential: false }),
  ],
});
const torsoSession = (name, variant = 0) => ({
  name,
  slots: [
    slot(
      variant % 2 ? ["incline-push", "horizontal-push"] : "horizontal-push",
      { role: "main" },
    ),
    slot(variant % 2 ? "vertical-pull" : "horizontal-pull", { role: "main" }),
    slot("vertical-push"),
    slot(variant % 2 ? "horizontal-pull" : "vertical-pull"),
    slot("shoulder-isolation", { essential: false }),
  ],
});
const limbsSession = (name, variant = 0) => ({
  name,
  slots: [
    slot(variant % 2 ? ["hinge", "hip-extension"] : ["squat", "single-leg"], {
      role: "main",
    }),
    slot(variant % 2 ? ["single-leg", "squat"] : ["hinge", "knee-flexion"]),
    slot("elbow-flexion"),
    slot("elbow-extension"),
    slot(["calf", "core"], { essential: false }),
  ],
});
const bodyPartSessions = {
  chest: {
    name: "Chest",
    slots: [
      slot("horizontal-push", { role: "main" }),
      slot("incline-push"),
      slot(["horizontal-push", "elbow-extension"]),
      slot("shoulder-isolation", { essential: false }),
    ],
  },
  back: {
    name: "Back",
    slots: [
      slot("horizontal-pull", { role: "main" }),
      slot("vertical-pull"),
      slot(["horizontal-pull", "elbow-flexion"]),
      slot("core", { essential: false }),
    ],
  },
  legs: {
    name: "Legs",
    slots: [
      slot("squat", { role: "main" }),
      slot("hinge"),
      slot("single-leg"),
      slot("knee-flexion"),
      slot("calf", { essential: false }),
    ],
  },
  shoulders: {
    name: "Shoulders",
    slots: [
      slot("vertical-push", { role: "main" }),
      slot("shoulder-isolation"),
      slot(["horizontal-push", "incline-push"]),
      slot("elbow-extension", { essential: false }),
    ],
  },
  arms: {
    name: "Arms",
    slots: [
      slot("elbow-flexion", { role: "main" }),
      slot("elbow-extension", { role: "main" }),
      slot("shoulder-isolation"),
      slot(["horizontal-pull", "horizontal-push"], { essential: false }),
    ],
  },
  posterior: {
    name: "Posterior Chain",
    slots: [
      slot("hinge", { role: "main" }),
      slot("hip-extension"),
      slot("knee-flexion"),
      slot("horizontal-pull"),
      slot("calf", { essential: false }),
    ],
  },
};

Object.assign(PROGRAM_TEMPLATES, {
  "T5-FB": {
    name: "Full Body A / B / C / D / E",
    sessions: Array.from({ length: 5 }, (_, index) =>
      fullBodySession(`Full Body ${String.fromCharCode(65 + index)}`, index),
    ),
  },
  "T6-FB": {
    name: "Full Body A / B / C / D / E / F",
    sessions: Array.from({ length: 6 }, (_, index) =>
      fullBodySession(`Full Body ${String.fromCharCode(65 + index)}`, index),
    ),
  },
  "T2-PP": {
    name: "Push / Pull",
    sessions: [pushSession("Push"), pullSession("Pull")],
  },
  "T3-PP": {
    name: "Push / Pull Rotation",
    sessions: [
      pushSession("Push A"),
      pullSession("Pull"),
      pushSession("Push B", 1),
    ],
  },
  "T4-PP": {
    name: "Push / Pull A / B",
    sessions: [
      pushSession("Push A"),
      pullSession("Pull A"),
      pushSession("Push B", 1),
      pullSession("Pull B", 1),
    ],
  },
  "T5-PP": {
    name: "Push / Pull Rotation",
    sessions: [
      pushSession("Push A"),
      pullSession("Pull A"),
      pushSession("Push B", 1),
      pullSession("Pull B", 1),
      pushSession("Push C", 2),
    ],
  },
  "T6-PP": {
    name: "Push / Pull A / B / C",
    sessions: [
      pushSession("Push A"),
      pullSession("Pull A"),
      pushSession("Push B", 1),
      pullSession("Pull B", 1),
      pushSession("Push C", 2),
      pullSession("Pull C", 2),
    ],
  },
  "T2-TL": {
    name: "Torso / Limbs",
    sessions: [torsoSession("Torso"), limbsSession("Limbs")],
  },
  "T3-TL": {
    name: "Torso / Limbs Rotation",
    sessions: [
      torsoSession("Torso A"),
      limbsSession("Limbs"),
      torsoSession("Torso B", 1),
    ],
  },
  "T4-TL": {
    name: "Torso / Limbs A / B",
    sessions: [
      torsoSession("Torso A"),
      limbsSession("Limbs A"),
      torsoSession("Torso B", 1),
      limbsSession("Limbs B", 1),
    ],
  },
  "T5-TL": {
    name: "Torso / Limbs Rotation",
    sessions: [
      torsoSession("Torso A"),
      limbsSession("Limbs A"),
      torsoSession("Torso B", 1),
      limbsSession("Limbs B", 1),
      torsoSession("Torso C", 2),
    ],
  },
  "T6-TL": {
    name: "Torso / Limbs A / B / C",
    sessions: [
      torsoSession("Torso A"),
      limbsSession("Limbs A"),
      torsoSession("Torso B", 1),
      limbsSession("Limbs B", 1),
      torsoSession("Torso C", 2),
      limbsSession("Limbs C", 2),
    ],
  },
  "T2-BP": {
    name: "Body-part-inspired Upper / Lower",
    sessions: [
      {
        name: "Upper · Chest & back",
        slots: [
          ...bodyPartSessions.chest.slots.slice(0, 2),
          ...bodyPartSessions.back.slots.slice(0, 2),
        ],
      },
      {
        name: "Lower · Legs & posterior chain",
        slots: bodyPartSessions.legs.slots,
      },
    ],
  },
  "T3-BP": {
    name: "Body-part Split",
    sessions: [
      { name: "Chest & Triceps", slots: bodyPartSessions.chest.slots },
      { name: "Back & Biceps", slots: bodyPartSessions.back.slots },
      {
        name: "Legs & Shoulders",
        slots: [
          ...bodyPartSessions.legs.slots.slice(0, 3),
          ...bodyPartSessions.shoulders.slots.slice(0, 2),
        ],
      },
    ],
  },
  "T4-BP": {
    name: "Body-part Split",
    sessions: [
      bodyPartSessions.chest,
      bodyPartSessions.back,
      bodyPartSessions.legs,
      {
        name: "Shoulders & Arms",
        slots: [
          ...bodyPartSessions.shoulders.slots.slice(0, 2),
          ...bodyPartSessions.arms.slots.slice(0, 3),
        ],
      },
    ],
  },
  "T5-BP": {
    name: "Body-part Split",
    sessions: [
      bodyPartSessions.chest,
      bodyPartSessions.back,
      bodyPartSessions.legs,
      bodyPartSessions.shoulders,
      bodyPartSessions.arms,
    ],
  },
  "T6-BP": {
    name: "Body-part Split",
    sessions: [
      bodyPartSessions.chest,
      bodyPartSessions.back,
      { ...bodyPartSessions.legs, name: "Quads & Calves" },
      bodyPartSessions.shoulders,
      bodyPartSessions.arms,
      bodyPartSessions.posterior,
    ],
  },
  "T5-PPLUL": {
    name: "Push / Pull / Legs / Upper / Lower",
    sessions: PROGRAM_TEMPLATES["T5-ULPPL"].sessions
      .slice(2)
      .concat(PROGRAM_TEMPLATES["T5-ULPPL"].sessions.slice(0, 2)),
  },
});
export function templateIdForFrequency(frequency) {
  return BASELINE_TEMPLATE_BY_FREQUENCY[
    Math.max(2, Math.min(6, Number(frequency) || 3))
  ];
}
function trainingPrescription(profile, item, role = "accessory") {
  const compound = item.kind === "compound";
  const power = item.kind === "power";
  const strength = profile.goal === "Get stronger";
  const athletic = profile.goal === "Athletic performance";
  const muscle = profile.goal === "Build muscle";
  const fatLoss = profile.goal === "Lose fat";
  const experience = profile.experience || "Beginner";
  const effort = String(profile.effortStyle || "");
  const hard = isFewerHardSets(profile);
  const moderate = effort.startsWith("More moderate");
  const balanced = effort.startsWith("Balanced workload");
  const olderAdult = profile.ageRange === "60+";
  let sets = experience === "Beginner" ? 2 : 3;
  if (balanced) sets = 3;
  if (moderate) sets = compound || power || role === "main" ? 3 : 4;
  if (strength && role === "main") sets = experience === "Beginner" ? 3 : 4;
  if (power) sets = 3;
  if (hard) sets = 2;
  let repMin = compound ? 6 : 10;
  let repMax = compound ? 12 : 15;
  let targetRir = 2;
  if (muscle) {
    repMin = compound ? 6 : 10;
    repMax = compound ? 10 : 15;
    targetRir = compound ? 2 : 1;
  }
  if (fatLoss) {
    repMin = compound ? 6 : 10;
    repMax = compound ? 12 : 15;
    targetRir = 2;
  }
  if (strength) {
    repMin = compound && role === "main" ? 3 : compound ? 5 : 8;
    repMax = compound && role === "main" ? 6 : compound ? 8 : 12;
    targetRir = role === "main" ? 3 : 2;
  }
  if (athletic) {
    repMin = power ? 2 : compound ? 3 : 8;
    repMax = power ? 5 : compound ? 6 : 12;
    targetRir = power ? 3 : compound ? 3 : 2;
  }
  if (hard) {
    [repMin, repMax] = fewerHardRepRange(profile, item, role);
    // Power work ends on speed/quality loss, not proximity to muscular failure.
    targetRir = power ? null : 1;
  }
  if (moderate && !power)
    targetRir = Math.max(targetRir, compound ? 3 : 2);
  if (olderAdult && !power)
    targetRir = Math.max(targetRir, compound ? 3 : 2);
  if (power) targetRir = null;
  let restSeconds = item.restSeconds;
  if (power) restSeconds = Math.max(120, restSeconds || 0);
  else if (strength && compound)
    restSeconds =
      role === "main" ? Math.max(180, restSeconds) : Math.max(120, restSeconds);
  else if (compound) restSeconds = Math.max(90, Math.min(180, restSeconds));
  else restSeconds = Math.max(60, Math.min(120, restSeconds));
  if (item.measure === "seconds")
    return {
      sets,
      repMin: item.durationRange[0],
      repMax: item.durationRange[1],
      targetRir: null,
      restSeconds,
    };
  return { sets, repMin, repMax, targetRir, restSeconds };
}
function physiquePriorityMatch(item, profile) {
  const stimulus = stimulusProfileForItem(item);
  return priorityProgrammingGroupsForProfile(profile).some(group =>
    group.source === "confirmed" &&
    group.patterns?.includes(item.pattern) &&
    group.muscles.some(muscle => stimulus[muscle] === 1),
  );
}
const PATTERN_PREFERENCES = {
  "horizontal-push": [
    "barbell-bench-press",
    "dumbbell-bench-press",
    "machine-chest-press",
    "smith-machine-bench-press",
    "assisted-dip",
    "push-up",
    "band-chest-press",
    "wide-push-up",
    "cable-chest-press",
  ],
  "chest-isolation": [
    "cable-fly",
    "low-to-high-cable-fly",
    "high-to-low-cable-fly",
    "pec-deck",
    "dumbbell-fly",
    "band-fly",
  ],
  "incline-push": [
    "incline-machine-press",
    "incline-smith-machine-press",
    "incline-dumbbell-press",
    "incline-barbell-bench-press",
    "feet-elevated-push-up",
  ],
  "horizontal-pull": [
    "chest-supported-row",
    "low-row",
    "t-bar-row",
    "machine-row",
    "seated-cable-row",
    "single-arm-cable-row",
    "one-arm-dumbbell-row",
    "barbell-row",
    "band-row",
    "prone-w-raise",
    "prone-swimmer-pull",
  ],
  "vertical-pull": [
    "lat-pulldown",
    "neutral-grip-lat-pulldown",
    "assisted-pull-up",
    "single-arm-cable-lat-pulldown",
    "pull-up",
    "chin-up",
    "neutral-grip-pull-up",
    "straight-arm-cable-pulldown",
    "band-lat-pulldown",
    "reverse-snow-angel",
    "floor-lat-pulldown",
  ],
  "vertical-push": [
    "dumbbell-shoulder-press",
    "machine-shoulder-press",
    "barbell-overhead-press",
    "pike-push-up",
    "band-overhead-press",
  ],
  squat: [
    "back-squat",
    "hack-squat",
    "pendulum-squat",
    "belt-squat",
    "leg-press",
    "smith-machine-squat",
    "front-squat",
    "goblet-squat",
    "bodyweight-squat",
  ],
  "knee-extension": ["leg-extension", "single-leg-leg-extension"],
  hinge: [
    "romanian-deadlift",
    "dumbbell-rdl",
    "single-leg-romanian-deadlift",
    "deadlift",
    "smith-machine-romanian-deadlift",
  ],
  "single-leg": [
    "single-leg-leg-press",
    "bulgarian-split-squat",
    "walking-lunge",
    "step-up",
    "split-squat",
    "reverse-lunge",
    "bodyweight-split-squat",
  ],
  "knee-flexion": [
    "seated-leg-curl",
    "lying-leg-curl",
    "standing-leg-curl",
    "leg-curl",
    "band-leg-curl",
    "hamstring-walkout",
  ],
  "hip-extension": ["hip-thrust", "back-extension-45", "glute-bridge"],
  calf: [
    "standing-calf-raise-machine",
    "seated-calf-raise",
    "leg-press-calf-raise",
    "dumbbell-calf-raise",
    "calf-raise",
  ],
  "shoulder-isolation": [
    "cable-lateral-raise",
    "lateral-raise",
    "machine-lateral-raise",
  ],
  "rear-delt": [
    "reverse-pec-deck",
    "cable-rear-delt-fly",
    "dumbbell-rear-delt-fly",
    "face-pull",
  ],
  "upper-back-pull": ["machine-high-row"],
  "elbow-flexion": [
    "cable-curl",
    "machine-preacher-curl",
    "preacher-curl",
    "incline-dumbbell-curl",
    "ez-bar-curl",
    "dumbbell-curl",
    "hammer-curl",
    "barbell-curl",
    "band-curl",
  ],
  "elbow-extension": [
    "cable-triceps-pressdown",
    "dumbbell-overhead-triceps-extension",
    "cable-overhead-triceps-extension",
    "band-triceps-pressdown",
    "close-grip-push-up",
  ],
  core: [
    "cable-crunch",
    "pallof-press",
    "reverse-crunch",
    "hanging-leg-raise",
    "plank",
    "side-plank",
  ],
  "power-lower": ["broad-jump", "squat-jump"],
  "power-upper": ["explosive-push-up"],
};
function technicalDemand(item) {
  return Number(item.technicalDifficulty) || 1;
}
export function candidateScore(
  item,
  profile,
  usedCounts = new Map(),
  pattern = item?.pattern,
  dayIndex = 0,
  role = "accessory",
  sessionItems = [],
) {
  const preference = PATTERN_PREFERENCES[pattern] || [];
  const preferenceIndex = preference.indexOf(item.id);
  const neutralModality =
    !profile.exercisePreference ||
    profile.exercisePreference === "No preference";
  const loaded =
    !item.bodyweight && item.progressionQuality === "load-and-repetition";
  let value =
    neutralModality && loaded
      ? 10
      : preferenceIndex >= 0
        ? 12 - preferenceIndex
        : 0;
  // No preference removes equipment bias, but a main back slot still benefits
  // from a stable bilateral row that is straightforward to load and progress.
  // Keep unilateral cable rows available as accessories/fallbacks rather than
  // letting the deterministic tie-break promote one to the primary row.
  if (neutralModality && role === "main" && pattern === "horizontal-pull") {
    const mainRowOrder = [
      "chest-supported-row",
      "t-bar-row",
      "machine-row",
      "low-row",
      "seated-cable-row",
      "barbell-row",
    ];
    const mainRowIndex = mainRowOrder.indexOf(item.id);
    if (mainRowIndex >= 0) value += mainRowOrder.length - mainRowIndex;
    if (item.id === "single-arm-cable-row") value -= 2;
  }
  const compoundMainPatterns = new Set([
    "horizontal-push",
    "incline-push",
    "vertical-push",
    "horizontal-pull",
    "vertical-pull",
    "squat",
    "hinge",
    "single-leg",
    "hip-extension",
  ]);
  if (loaded) value += role === "main" ? 6 : 4;
  if (
    role === "main" &&
    compoundMainPatterns.has(pattern) &&
    item.kind !== "compound"
  )
    value -= 6;
  if (
    (profile.environment === "Commercial gym" ||
      (profile.equipment || []).includes("full gym")) &&
    item.bodyweight &&
    item.kind === "isolation" &&
    ["horizontal-pull", "vertical-pull"].includes(item.pattern)
  )
    value -= 8;
  // Scoring is only a tie-breaker; protected post-conditions below guarantee
  // the material weekly effect without letting this bias distort the split.
  if (isPriorityExercise(item, profile)) value += 7;
  if (physiquePriorityMatch(item, profile)) value += 4;
  if (profile.goal === "Build muscle" && item.stability === "high") value += 4;
  // In a fully equipped gym, a cable or pec-deck fly is the more repeatable
  // default isolation. Dumbbell fly remains available for limited/home setups.
  if (
    pattern === "chest-isolation" &&
    item.id === "dumbbell-fly" &&
    profile.exercisePreference !== "Prefer free weights" &&
    (profile.environment === "Commercial gym" ||
      (profile.equipment || []).includes("full gym"))
  )
    value -= 4;
  if (
    profile.goal === "Build muscle" &&
    role === "main" &&
    (profile.priorities || []).includes("Chest") &&
    item.pattern === "incline-push"
  )
    value += 3;
  if (
    profile.exercisePreference === "Prefer free weights" &&
    item.equipment.some((entry) => ["barbell", "dumbbells"].includes(entry))
  )
    value += 5;
  if (
    profile.exercisePreference === "Prefer machines" &&
    item.equipment.some((entry) => ["machines", "cables"].includes(entry))
  )
    value += 5;
  if (neutralModality) {
    if (item.stability === "high") value += 1;
    if (item.stability === "low") value -= 1;
  }
  if (
    profile.goal === "Get stronger" &&
    role === "main" &&
    item.progressionQuality === "load-and-repetition"
  )
    value += 3;
  if (
    profile.goal === "Get stronger" &&
    role === "main" &&
    item.kind === "compound" &&
    item.equipment.includes("barbell")
  )
    value += 2;
  const lowerPatterns = new Set([
    "squat",
    "hinge",
    "single-leg",
    "knee-flexion",
    "hip-extension",
  ]);
  const lowerCompounds = sessionItems.filter(
    (entry) => entry?.kind === "compound" && lowerPatterns.has(entry.pattern),
  );
  const highFatigueLower = lowerCompounds.filter(
    (entry) => entry.fatigueCost === "high",
  ).length;
  if (
    profile.goal === "Get stronger" &&
    role !== "main" &&
    lowerPatterns.has(item.pattern) &&
    lowerCompounds.length >= 2 &&
    highFatigueLower >= 2
  )
    value -=
      item.fatigueCost === "high" ? 8 : item.fatigueCost === "moderate" ? 3 : 0;
  if (profile.experience === "Beginner") value -= technicalDemand(item) * 2;
  if (profile.ageRange === "60+") {
    if (item.stability === "high") value += 2;
    if (item.fatigueCost === "high") value -= 4;
    value -= Math.max(0, technicalDemand(item) - 1);
  }
  const repeatPenalty =
    item.fatigueCost === "high" ? 14 : role === "main" ? 3 : 6;
  value -= (usedCounts.get(item.id) || 0) * repeatPenalty;
  return value + ((item.id.length + dayIndex) % 7) / 100;
}
function isPriorityExercise(item, profile) {
  if (!item) return false;
  const stimulus = stimulusProfileForExercise(item);
  return priorityProgrammingGroupsForProfile(profile).some(
    (group) =>
      (!group.patterns?.length || group.patterns.includes(item.pattern)) &&
      group.muscles.some((muscle) => stimulus[muscle] === 1),
  );
}
function makeProgramExercise(item, profile, options = {}) {
  const p = trainingPrescription(profile, item, options.role);
  const effort = String(profile.effortStyle || "");
  const hard = effort.startsWith("Fewer hard");
  const moderate = effort.startsWith("More moderate");
  const maxSets = hard ? 2 : moderate ? 4 : 5;
  const setCount = Math.min(
    maxSets,
    p.sets + (options.prioritySet && !hard ? 1 : 0),
  );
  return {
    id: uid("program-exercise"),
    exerciseId: item.id,
    loadRequirement: exerciseLoadRequirement(item),
    programmingRole: options.role || "accessory",
    effortMode: item.kind === "power" ? "velocity-quality" : "rir",
    requiredRole: options.requiredRole !== false,
    slotPatterns: options.slotPatterns || [item.pattern],
    sets: Array.from({ length: setCount }, () => ({
      id: uid("set"),
      weight: null,
      reps: p.repMin,
      completed: false,
      rir: null,
    })),
    repMin: p.repMin,
    repMax: p.repMax,
    targetRir: p.targetRir,
    restSeconds: p.restSeconds,
    defaultIncrement: item.increment,
    ...(options.prioritySet ? { protectedPrioritySets: 1 } : {}),
  };
}
export function estimateExerciseMinutes(exercise) {
  const sets = exercise.sets.length;
  const workSeconds = sets * 45;
  const betweenSetRest = Math.max(0, sets - 1) * (exercise.restSeconds || 90);
  const warmupMinutes =
    exerciseCatalog[exercise.exerciseId]?.kind === "compound" ? 3 : 1;
  return Math.max(
    3,
    Math.ceil((workSeconds + betweenSetRest) / 60 + warmupMinutes),
  );
}
export function estimateSessionMinutes(exercises) {
  if (!exercises.length) return 0;
  const generalWarmup = 5;
  const transitions = Math.max(0, exercises.length - 1) * 2;
  return (
    generalWarmup +
    transitions +
    exercises.reduce(
      (sum, exercise) => sum + estimateExerciseMinutes(exercise),
      0,
    )
  );
}
export function roundedEstimate(minutes, step = 5) {
  const value = Number(minutes);
  const increment = Math.max(1, Number(step) || 5);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(increment, Math.round(value / increment) * increment);
}
function minimumWorkingSets(profile, exercise) {
  return Math.min(
    exercise.sets.length,
    minimumWorkingSetsForExercise(profile, exercise) +
      Math.max(0, Number(exercise.protectedPrioritySets) || 0),
  );
}
function fitSessionToDuration(
  exercises,
  minutes,
  profile = {},
  session = null,
) {
  const result = [...exercises];
  // The requested duration is the generation budget. Display-estimation
  // tolerance belongs in validation, not as free programming time.
  while (estimateSessionMinutes(result) > minutes) {
    const reduciblePool = [...result]
      .reverse()
      .filter(
        (exercise) =>
          exercise.sets.length > minimumWorkingSets(profile, exercise),
      );
    const reducible =
      reduciblePool.find(
        (exercise) =>
          !isPriorityExercise(exerciseCatalog[exercise.exerciseId], profile),
      ) || reduciblePool[0];
    if (reducible) reducible.sets.pop();
    else {
      const removableCandidates = [...result.keys()].reverse().filter(
        (index) =>
          result.length > 2 &&
          requiredSessionRolesSatisfied(
            { ...session, exercises: result },
            result.filter((_, candidate) => candidate !== index),
          ),
      );
      const optionalCandidates = removableCandidates.filter(
        (index) => !result[index].requiredRole,
      );
      const removableIndex =
        optionalCandidates.find(
          (index) =>
            !isPriorityExercise(
              exerciseCatalog[result[index].exerciseId],
              profile,
            ),
        ) ?? optionalCandidates[0] ?? removableCandidates[0];
      if (removableIndex === undefined) break;
      result.splice(removableIndex, 1);
    }
  }
  return result;
}
const IDEAL_SCHEDULES = {
  2: [1, 4],
  3: [0, 2, 4],
  4: [0, 1, 3, 5],
  5: [0, 1, 3, 4, 5],
  6: [0, 1, 2, 4, 5, 6],
};
function combinations(values, count, start = 0, chosen = [], result = []) {
  if (chosen.length === count) {
    result.push([...chosen]);
    return result;
  }
  for (
    let index = start;
    index <= values.length - (count - chosen.length);
    index++
  ) {
    chosen.push(values[index]);
    combinations(values, count, index + 1, chosen, result);
    chosen.pop();
  }
  return result;
}
function selectScheduledDays(
  availableDays,
  frequency,
  profile = null,
  sessions = null,
) {
  const availableIndexes = [...new Set(availableDays)]
    .filter((day) => WEEKDAYS.includes(day))
    .map((day) => WEEKDAYS.indexOf(day))
    .sort((a, b) => a - b);
  const pool =
    availableIndexes.length >= frequency
      ? availableIndexes
      : WEEKDAYS.map((_, index) => index);
  if (pool.length === frequency) return pool.map((index) => WEEKDAYS[index]);
  const ideal = IDEAL_SCHEDULES[frequency] || pool.slice(0, frequency);
  const candidates = combinations(pool, frequency);
  const extraRecovery = ["50–59", "60+"].includes(profile?.ageRange);
  const score = (candidate) => {
    const idealDistance = candidate.reduce(
      (sum, value, index) => sum + Math.abs(value - ideal[index]),
      0,
    );
    const longRuns = candidate.reduce(
      (sum, value, index) =>
        index > 1 &&
        value - candidate[index - 1] === 1 &&
        candidate[index - 1] - candidate[index - 2] === 1
          ? sum + 1
          : sum,
      0,
    );
    const adjacentPairs = candidate.reduce((sum, value, index) => {
      const next =
        index === candidate.length - 1
          ? candidate[0] + 7
          : candidate[index + 1];
      return sum + Number(next - value === 1);
    }, 0);
    const candidateDays = candidate.map((index) => WEEKDAYS[index]);
    const sessionRecovery =
      sessions?.length === frequency
        ? recoveryPenalty(sessions, candidateDays)
        : 0;
    return (
      idealDistance +
      adjacentPairs * (extraRecovery ? 7 : 4) +
      (extraRecovery ? longRuns * 30 : 0) +
      sessionRecovery * 10
    );
  };
  return candidates
    .sort(
      (a, b) => score(a) - score(b) || a.join("").localeCompare(b.join("")),
    )[0]
    .map((index) => WEEKDAYS[index]);
}
function namedSessionFocus(day) {
  const name = String(day?.name || "").toLowerCase();
  if (/lower|legs?/.test(name)) return "lower";
  if (/push/.test(name)) return "push";
  if (/pull/.test(name)) return "pull";
  if (/upper/.test(name)) return "upper";
  if (/full body/.test(name)) return "full";
  return null;
}
export function sessionStructureKey(day) {
  const name = String(day?.name || "").toLowerCase();
  if (/chest\s*(?:&|and)\s*back/.test(name)) return "chest-back";
  if (/shoulders?\s*(?:&|and)\s*arms?/.test(name)) return "shoulders-arms";
  if (/full body/.test(name)) return "full-body";
  if (/torso/.test(name)) return "torso";
  if (/limbs?/.test(name)) return "limbs";
  if (/upper/.test(name)) return "upper";
  if (/lower/.test(name)) return "lower";
  if (/push/.test(name)) return "push";
  if (/pull/.test(name)) return "pull";
  if (/legs?/.test(name)) return "legs";
  if (/chest/.test(name)) return "chest";
  if (/back|posterior/.test(name)) return "back";
  if (/shoulders?/.test(name)) return "shoulders";
  if (/arms?/.test(name)) return "arms";
  return "mixed";
}
function expandedSessionSequence(sequence, count) {
  if (!sequence?.length) return [];
  return Array.from({ length: count }, (_, index) => sequence[index % sequence.length]);
}
function orderSessionsByStructuralSequence(days, sequence) {
  const expected = expandedSessionSequence(sequence, days.length);
  if (!expected.length) return days;
  const queues = new Map();
  for (const day of days) {
    const key = day.structureKey || sessionStructureKey(day);
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(day);
  }
  const ordered = expected.map((key) => queues.get(key)?.shift()).filter(Boolean);
  return ordered.length === days.length ? ordered : days;
}
function structureIdForTemplate(templateId, splitPreferenceId = null) {
  if (splitPreferenceId && TRAINING_STRUCTURES[splitPreferenceId])
    return splitPreferenceId;
  if (/PPLUL|ULPPL/.test(templateId || "")) return "pplul";
  if (/PPL/.test(templateId || "")) return "push-pull-legs";
  if (/ARNOLD/.test(templateId || "")) return "arnold";
  if (/(?:^|-)UL/.test(templateId || "")) return "upper-lower";
  if (/(?:^|-)PP(?:$|-)/.test(templateId || "")) return "push-pull";
  if (/(?:^|-)TL/.test(templateId || "")) return "torso-limbs";
  if (/(?:^|-)BP/.test(templateId || "")) return "body-part";
  if (/(?:^|-)FB/.test(templateId || "")) return "full-body";
  return null;
}
function sequenceForTemplate(templateId, splitPreferenceId = null) {
  if (templateId === "T5-ULPPL")
    return ["upper", "lower", "push", "pull", "legs"];
  if (templateId === "T5-PPLUL")
    return ["push", "pull", "legs", "upper", "lower"];
  const id = structureIdForTemplate(templateId, splitPreferenceId);
  return TRAINING_STRUCTURES[id]?.canonicalSessionSequence || null;
}
function sessionFocus(day) {
  const named = namedSessionFocus(day);
  if (named) return named;
  const patterns = (day?.exercises || [])
    .map((exercise) => exerciseCatalog[exercise.exerciseId]?.pattern)
    .filter(Boolean);
  const count = (values) =>
    patterns.filter((pattern) => values.has(pattern)).length;
  const threshold = Math.max(2, Math.ceil(patterns.length / 2));
  const lower = count(
    new Set([
      "squat",
      "hinge",
      "single-leg",
      "knee-flexion",
      "hip-extension",
      "calf",
      "power-lower",
    ]),
  );
  const push = count(
    new Set([
      "horizontal-push",
      "incline-push",
      "chest-isolation",
      "vertical-push",
      "shoulder-isolation",
      "elbow-extension",
      "power-upper",
    ]),
  );
  const pull = count(
    new Set(["horizontal-pull", "vertical-pull", "elbow-flexion"]),
  );
  if (lower >= threshold) return "lower";
  if (push >= threshold && pull >= threshold) return "upper";
  if (push >= threshold) return "push";
  if (pull >= threshold) return "pull";
  return "mixed";
}
function sessionNameMatchesExercises(day, exercises = day?.exercises || []) {
  const focus = namedSessionFocus(day);
  if (!focus || !exercises.length) return true;
  const lowerPatterns = new Set([
    "squat",
    "hinge",
    "single-leg",
    "knee-flexion",
    "hip-extension",
    "calf",
    "power-lower",
  ]);
  const pushPatterns = new Set([
    "horizontal-push",
    "incline-push",
    "chest-isolation",
    "vertical-push",
    "shoulder-isolation",
    "elbow-extension",
    "power-upper",
  ]);
  const pullPatterns = new Set([
    "horizontal-pull",
    "vertical-pull",
    "elbow-flexion",
  ]);
  const upperPatterns = new Set([...pushPatterns, ...pullPatterns]);
  const patterns = exercises
    .map((exercise) => exerciseCatalog[exercise.exerciseId]?.pattern)
    .filter(Boolean);
  const count = (set) => patterns.filter((pattern) => set.has(pattern)).length;
  const majority = Math.ceil(patterns.length / 2);
  if (focus === "push") return count(pushPatterns) >= majority;
  if (focus === "pull") return count(pullPatterns) >= majority;
  if (focus === "lower") return count(lowerPatterns) >= majority;
  if (focus === "upper") return count(upperPatterns) >= majority;
  if (focus === "full")
    return count(upperPatterns) > 0 && count(lowerPatterns) > 0;
  return true;
}
function requiredSessionRolesSatisfied(day, exercises = day?.exercises || []) {
  const focus = namedSessionFocus(day);
  if (!focus || !exercises.length) return true;
  const patterns = new Set(
    exercises
      .map((exercise) => exerciseCatalog[exercise.exerciseId]?.pattern)
      .filter(Boolean),
  );
  const has = (values) => values.some((value) => patterns.has(value));
  if (focus === "pull")
    return has(["horizontal-pull"]) && has(["vertical-pull"]);
  if (focus === "push")
    return has(["horizontal-push", "incline-push"]) && has(["vertical-push"]);
  if (focus === "lower")
    return (
      has(["squat", "single-leg"]) &&
      has(["hinge", "knee-flexion", "hip-extension"])
    );
  if (focus === "upper")
    return (
      has(["horizontal-push", "incline-push", "vertical-push"]) &&
      has(["horizontal-pull", "vertical-pull"])
    );
  if (focus === "full")
    return (
      has(["horizontal-push", "incline-push", "vertical-push"]) &&
      has(["horizontal-pull", "vertical-pull"]) &&
      has(["squat", "single-leg"]) &&
      has(["hinge", "knee-flexion", "hip-extension"])
    );
  return true;
}
function programQualityErrors(program) {
  const errors = [];
  const interchangeableCompoundPatterns = new Set([
    "horizontal-push",
    "vertical-push",
    "horizontal-pull",
    "vertical-pull",
  ]);
  for (const day of program.days || []) {
    const ids = (day.exercises || [])
      .map((exercise) => exercise.exerciseId)
      .filter(Boolean);
    const compoundsByPattern = new Map();
    for (const id of ids) {
      const exercise = exerciseCatalog[id];
      if (
        !exercise ||
        exercise.kind !== "compound" ||
        !interchangeableCompoundPatterns.has(exercise.pattern)
      )
        continue;
      const existing = compoundsByPattern.get(exercise.pattern);
      if (existing)
        errors.push(
          `${day.weekday} contains redundant compound exercises for the same ${exercise.pattern} movement pattern: ${existing.name} and ${exercise.name}. Keep one and use the slot for a different training purpose.`,
        );
      else compoundsByPattern.set(exercise.pattern, exercise);
    }
    if (!sessionNameMatchesExercises(day))
      errors.push(
        `${day.weekday} is named ${day.name}, but its exercises do not match that session focus.`,
      );
  }
  return errors;
}
function recoveryPenalty(days, scheduledDays) {
  let penalty = 0;
  const focusPenalty = (previous, current, gap) => {
    if (previous === current && previous !== "mixed")
      return ["lower", "upper", "full"].includes(previous) ? 4 : 2;
    if (previous === "full" || current === "full") return 2;
    if (
      (previous === "upper" && ["push", "pull"].includes(current)) ||
      (current === "upper" && ["push", "pull"].includes(previous))
    )
      return 1;
    return 0;
  };
  for (let first = 0; first < days.length; first++)
    for (let second = first + 1; second < days.length; second++) {
      const distance = Math.abs(
        WEEKDAYS.indexOf(scheduledDays[second]) -
          WEEKDAYS.indexOf(scheduledDays[first]),
      );
      const gap = Math.min(distance, 7 - distance);
      if (gap > 2) continue;
      const raw = focusPenalty(
        sessionFocus(days[first]),
        sessionFocus(days[second]),
        gap,
      );
      // Consecutive sessions with the same training focus are materially worse
      // than repeating that focus after a full day off. Weight that distinction
      // strongly so the optimizer never "improves" a week by clustering overlap.
      penalty += gap === 1 ? raw * 2 : raw >= 4 ? 1 : raw ? 0.5 : 0;
    }
  return penalty;
}
function overlapRelationship(previousKey, currentKey) {
  if (previousKey === "full-body" && currentKey === "full-body")
    return "full-body-to-full-body";
  if (previousKey === currentKey && ["upper", "lower"].includes(currentKey))
    return `${currentKey}-to-${currentKey}`;
  if (["push", "pull"].includes(previousKey) && currentKey === "upper")
    return `${previousKey}-to-upper`;
  if (previousKey === "legs" && currentKey === "lower")
    return "legs-to-lower";
  if (previousKey === "chest-back" && currentKey === "shoulders-arms")
    return "chest-back-to-shoulders-arms";
  return null;
}
function weekdayGap(previous, current) {
  return (
    (WEEKDAYS.indexOf(current) - WEEKDAYS.indexOf(previous) + 7) % 7
  );
}
function adaptConsecutiveSessionRecovery(days, profile) {
  if (days.length < 2) return days;
  const adjusted = days.map((day) => ({
    ...day,
    exercises: day.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    })),
  }));
  const volumePolicy = profile.goal === "Build muscle" ? hypertrophyVolumeTargets(profile) : null;
  const priorityMuscles = priorityStimulusMusclesForProfile(profile);
  const priorityMuscle = muscle => priorityMuscles.has(muscle);
  for (let index = 0; index < adjusted.length; index++) {
    const previous = adjusted[(index - 1 + adjusted.length) % adjusted.length];
    const current = adjusted[index];
    if (weekdayGap(previous.weekday, current.weekday) !== 1) continue;
    const relationship = overlapRelationship(
      previous.structureKey || sessionStructureKey(previous),
      current.structureKey || sessionStructureKey(current),
    );
    if (!relationship) continue;
    const previousVolume = fractionalVolumeForExercises(previous.exercises);
    const weeklyVolume = volumePolicy ? weeklyStimulusVolume({ days: adjusted }) : null;
    const reducible = current.exercises
      .map((exercise, exerciseIndex) => ({
        exercise,
        exerciseIndex,
        overlap: Object.entries(stimulusProfileForExercise(exercise.exerciseId))
          .reduce((sum, [muscle, credit]) => sum + (previousVolume[muscle] ? credit : 0), 0),
      }))
      .filter(entry => entry.overlap > 0 && entry.exercise.sets.length > minimumWorkingSets(profile, entry.exercise))
      .filter(entry => !volumePolicy || Object.entries(stimulusProfileForExercise(entry.exercise.exerciseId)).every(
        ([muscle, credit]) => (weeklyVolume[muscle] || 0) - credit >=
          (priorityMuscle(muscle) ? volumePolicy[muscle]?.target : volumePolicy[muscle]?.floor),
      ))
      .sort((a, b) => b.overlap - a.overlap || b.exerciseIndex - a.exerciseIndex || a.exercise.exerciseId.localeCompare(b.exercise.exerciseId))[0];
    if (!reducible) continue;
    reducible.exercise.sets.pop();
    current.recoveryAdjustment = {
      relationship,
      strategy: "reduced-overlap-volume",
      previousWeekday: previous.weekday,
    };
    current.estimatedMinutes = estimateSessionMinutes(current.exercises);
  }
  return adjusted;
}
function repairProgramSchedule(program) {
  if (!program || !Array.isArray(program.days) || program.days.length < 2)
    return program;
  if (program.source === "ai-import") return program;
  const chronological = [...program.days].sort(
    (a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday),
  );
  const scheduledDays = chronological.map((day) => day.weekday);
  const sequence =
    program.trainingStructure?.userRequestedSequence ||
    program.trainingStructure?.canonicalSessionSequence ||
    sequenceForTemplate(program.templateId, program.splitPreference?.id);
  const arranged = orderSessionsByStructuralSequence(chronological, sequence);
  if (arranged.every((day, index) => day === chronological[index]))
    return program;
  return {
    ...program,
    version: Math.max(2, Number(program.version) || 1),
    days: arranged.map((day, index) => ({
      ...day,
      weekday: scheduledDays[index],
    })),
  };
}
function prioritySetBudgets(profile) {
  const frequency = Math.max(2, Math.min(6, Number(profile.daysPerWeek) || 3));
  const bonus =
    profile.goal === "Build muscle" ? (frequency >= 5 ? 3 : 2) : 2;
  return new Map(priorityProgrammingGroupsForProfile(profile).map((group, index) => [
    `${group.source}:${group.key}:${index}`,
    { ...group, remaining: bonus },
  ]));
}
function takePrioritySet(item, budgets) {
  const stimulus = stimulusProfileForExercise(item);
  const priority = [...budgets.entries()].find(([, group]) =>
    group.remaining > 0 &&
    (!group.patterns?.length || group.patterns.includes(item.pattern)) &&
    group.muscles.some(muscle => stimulus[muscle] === 1),
  );
  if (!priority) return false;
  priority[1].remaining -= 1;
  return true;
}
const upperMovementFamily = (pattern) =>
  [
    "horizontal-push",
    "incline-push",
    "chest-isolation",
    "vertical-push",
    "shoulder-isolation",
    "elbow-extension",
    "power-upper",
  ].includes(pattern)
    ? "push"
    : [
          "horizontal-pull",
          "vertical-pull",
          "upper-back-pull",
          "rear-delt",
          "elbow-flexion",
        ].includes(pattern)
      ? "pull"
      : null;
function sequenceMixedUpperExercises(exercises, session, profile) {
  // A soft default for mixed upper sessions. Dedicated body-part, Push, Pull and
  // Arnold sessions keep their authored grouping, where repeated targets may be intentional.
  if (!/^(upper|torso)\b/i.test(session?.name || "") || exercises.length < 3)
    return exercises;
  const remaining = exercises.map((exercise, index) => ({
    exercise,
    index,
    item: exerciseCatalog[exercise.exerciseId],
  }));
  if (
    !remaining.some(
      (row) => upperMovementFamily(row.item?.pattern) === "push",
    ) ||
    !remaining.some((row) => upperMovementFamily(row.item?.pattern) === "pull")
  )
    return exercises;
  const ordered = [remaining.shift()];
  while (remaining.length) {
    const previous = ordered.at(-1);
    const previousFamily = upperMovementFamily(previous.item?.pattern);
    const previousPrimary = previous.item?.muscles?.[0];
    const ranked = remaining
      .map((row, remainingIndex) => {
        const family = upperMovementFamily(row.item?.pattern);
        const sameFamily = family && family === previousFamily;
        const samePrimary =
          row.item?.muscles?.[0] && row.item.muscles[0] === previousPrimary;
        const priority = (profile.priorities || []).includes(
          row.item?.muscles?.[0],
        );
        const score =
          row.index * 4 +
          Number(sameFamily) * 20 +
          Number(samePrimary) * 12 -
          Number(row.exercise.programmingRole === "main") * 3 -
          Number(priority) * 2;
        return { row, remainingIndex, score };
      })
      .sort((a, b) => a.score - b.score || a.row.index - b.row.index);
    const [next] = remaining.splice(ranked[0].remainingIndex, 1);
    ordered.push(next);
  }
  return ordered.map((row) => row.exercise);
}
function resolveTemplateSession(
  session,
  profile,
  allowed,
  usedCounts,
  dayIndex,
  budgets,
) {
  const exercises = [];
  const selected = new Set();
  let slots = session.slots.map((definition) => ({
    ...definition,
    patterns: [...definition.patterns],
  }));
  if (profile.goal === "Athletic performance") {
    const lower = /lower|legs|full body/i.test(session.name);
    const upper = /upper|push/i.test(session.name);
    if (lower || upper)
      slots = [
        slot(lower ? "power-lower" : "power-upper", { role: "power" }),
        ...slots,
      ];
  }
  const chestHypertrophyPriority =
    profile.goal === "Build muscle" &&
    (profile.priorities || []).includes("Chest");
  if (
    chestHypertrophyPriority &&
    /^Push$/i.test(session.name) &&
    slots.filter((definition) => definition.patterns.some((pattern) =>
      ["horizontal-push", "incline-push"].includes(pattern))).length < 2
  ) {
    const firstChest = slots.findIndex((definition) =>
      definition.patterns.some((pattern) =>
        ["horizontal-push", "incline-push"].includes(pattern),
      ),
    );
    if (firstChest >= 0)
      slots.splice(
        firstChest + 1,
        0,
        slot("horizontal-push", { essential: false }),
      );
  }
  if (
    chestHypertrophyPriority &&
    /^Upper(?:\s+[ABC])?$/i.test(session.name) &&
    slots.filter((definition) =>
      definition.patterns.some((pattern) =>
        ["horizontal-push", "incline-push", "chest-isolation"].includes(
          pattern,
        ),
      ),
    ).length < 2
  ) {
    const firstChest = slots.findIndex((definition) =>
      definition.patterns.some((pattern) =>
        ["horizontal-push", "incline-push"].includes(pattern),
      ),
    );
    if (firstChest >= 0)
      slots.splice(
        firstChest + 1,
        0,
        slot("chest-isolation", { essential: false }),
      );
  }
  if (
    profile.goal === "Build muscle" &&
    (profile.priorities || []).includes("Back") &&
    /^Pull$/i.test(session.name) &&
    !slots.some((definition) => definition.patterns.includes("upper-back-pull"))
  ) {
    const lastPull = slots.findLastIndex((definition) => definition.patterns.some(
      (pattern) => ["horizontal-pull", "vertical-pull"].includes(pattern),
    ));
    if (lastPull >= 0) slots.splice(lastPull + 1, 0, slot("upper-back-pull", { essential: false }));
  }
  // Weekly balancing decides whether optional chest work is useful. Deleting it
  // here previously underdosed Balanced push work while retaining every pull.
  if (chestHypertrophyPriority) {
    const firstChest = slots.findIndex((definition) =>
      definition.patterns.some((pattern) =>
        ["horizontal-push", "incline-push"].includes(pattern),
      ),
    );
    const secondChest = slots.findIndex(
      (definition, index) =>
        index > firstChest &&
        !definition.essential &&
        definition.patterns.some((pattern) =>
          ["horizontal-push", "incline-push"].includes(pattern),
        ),
    );
    if (firstChest >= 0 && secondChest > firstChest + 1) {
      const [secondaryPress] = slots.splice(secondChest, 1);
      slots.splice(firstChest + 1, 0, secondaryPress);
    }
  }
  const hasDedicatedInclineSlot = slots.some(
    (definition) =>
      definition.patterns.includes("incline-push") &&
      !definition.patterns.includes("horizontal-push"),
  );
  for (const definition of slots) {
    const patterns =
      chestHypertrophyPriority &&
      !hasDedicatedInclineSlot &&
      definition.role === "main" &&
      definition.patterns.includes("horizontal-push")
        ? [...new Set([...definition.patterns, "incline-push"])]
        : definition.patterns;
    const interchangeable = new Set([
      "horizontal-push",
      "vertical-push",
      "horizontal-pull",
      "vertical-pull",
      "squat",
      "hinge",
    ]);
    const usedCompoundPatterns = new Set(
      exercises
        .map((exercise) => exerciseCatalog[exercise.exerciseId])
        .filter(
          (item) =>
            item?.kind === "compound" && interchangeable.has(item.pattern),
        )
        .map((item) => item.pattern),
    );
    if (
      !definition.essential &&
      patterns.every((pattern) => usedCompoundPatterns.has(pattern))
    )
      continue;
    let candidates = allowed.filter(
      (item) =>
        !selected.has(item.id) &&
        patterns.includes(item.pattern) &&
        !(item.kind === "compound" && usedCompoundPatterns.has(item.pattern)) &&
        (profile.experience !== "Beginner" || technicalDemand(item) <= 2),
    );
    const externallyLoadable = candidates.filter(
      (item) =>
        !item.bodyweight && item.progressionQuality === "load-and-repetition",
    );
    if (externallyLoadable.length) candidates = externallyLoadable;
    const sessionItems = exercises
      .map((exercise) => exerciseCatalog[exercise.exerciseId])
      .filter(Boolean);
    const chosen = [...candidates].sort(
      (a, b) =>
        candidateScore(
          b,
          profile,
          usedCounts,
          b.pattern,
          dayIndex,
          definition.role,
          sessionItems,
        ) -
          candidateScore(
            a,
            profile,
            usedCounts,
            a.pattern,
            dayIndex,
            definition.role,
            sessionItems,
          ) || a.name.localeCompare(b.name),
    )[0];
    if (!chosen) continue;
    const prioritySet =
      isPriorityExercise(chosen, profile) && takePrioritySet(chosen, budgets);
    exercises.push(
      makeProgramExercise(chosen, profile, {
        role: definition.role,
        prioritySet,
        requiredRole: definition.essential,
        slotPatterns: patterns,
      }),
    );
    selected.add(chosen.id);
    usedCounts.set(chosen.id, (usedCounts.get(chosen.id) || 0) + 1);
  }
  return sequenceMixedUpperExercises(exercises, session, profile);
}
export function stimulusProfileForExercise(itemOrId) {
  const item = typeof itemOrId === "string" ? exerciseCatalog[itemOrId] : itemOrId;
  return stimulusProfileForItem(item);
}

export function weeklyStimulusVolume(program) {
  return accumulateStimulus(
    (program?.days || []).flatMap(day => day.exercises || []),
    exerciseId => exerciseCatalog[exerciseId],
  );
}

export const weeklyFractionalVolume = weeklyStimulusVolume;
export function weeklyDirectVolume(program) {
  const volume = {
    Chest: 0,
    Back: 0,
    Shoulders: 0,
    Biceps: 0,
    Triceps: 0,
    Quads: 0,
    Hamstrings: 0,
    Glutes: 0,
    Core: 0,
    Calves: 0,
  };
  for (const exercise of (program?.days || []).flatMap(
    (day) => day.exercises || [],
  )) {
    const item = exerciseCatalog[exercise.exerciseId];
    if (!item) continue;
    const sets = (exercise.sets || []).filter(
      (set) => set.planned !== false && !set.added,
    ).length;
    if (
      ["horizontal-push", "incline-push", "chest-isolation"].includes(
        item.pattern,
      )
    )
      volume.Chest += sets;
    if (
      ["horizontal-pull", "vertical-pull", "upper-back-pull"].includes(
        item.pattern,
      )
    )
      volume.Back += sets;
    if (
      ["vertical-push", "shoulder-isolation", "rear-delt"].includes(
        item.pattern,
      )
    )
      volume.Shoulders += sets;
    if (item.pattern === "elbow-flexion") volume.Biceps += sets;
    if (item.pattern === "elbow-extension") volume.Triceps += sets;
    if (["squat", "single-leg", "knee-extension"].includes(item.pattern))
      volume.Quads += sets;
    if (["hinge", "knee-flexion"].includes(item.pattern))
      volume.Hamstrings += sets;
    if (["hip-extension", "single-leg"].includes(item.pattern))
      volume.Glutes += sets;
    if (item.pattern === "core") volume.Core += sets;
    if (item.pattern === "calf") volume.Calves += sets;
  }
  return Object.fromEntries(
    Object.entries(volume).map(([muscle, sets]) => [
      muscle,
      Number(sets.toFixed(1)),
    ]),
  );
}
function fractionalVolumeForExercises(exercises) {
  return accumulateStimulus(exercises, exerciseId => exerciseCatalog[exerciseId]);
}
export function programWarnings(program, profile = {}) {
  const warnings = [];
  for (const day of program?.days || []) {
    const volume = fractionalVolumeForExercises(day.exercises);
    for (const [muscle, sets] of Object.entries(volume))
      if (sets > 8)
        warnings.push({
          code: sets > 10 ? "very_high_session_volume" : "high_session_volume",
          day: day.weekday,
          muscle,
          message: `${muscle} receives ${sets} fractional sets in one session.`,
        });
    if ((day.exercises || []).length > 8)
      warnings.push({
        code: "session_complexity",
        day: day.weekday,
        message: `${day.name} contains more than eight exercises.`,
      });
    if (
      profile.experience === "Beginner" &&
      (day.exercises || []).some(
        (exercise) =>
          exerciseCatalog[exercise.exerciseId]?.kind === "compound" &&
          exercise.targetRir === 0,
      )
    )
      warnings.push({
        code: "beginner_failure_compound",
        day: day.weekday,
        message: "A beginner compound is prescribed at 0 RIR.",
      });
  }
  const chronological = [...(program?.days || [])].sort(
    (a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday),
  );
  for (let index = 0; index < chronological.length; index++) {
    const current = chronological[index];
    const next = chronological[(index + 1) % chronological.length];
    if (!next) continue;
    const gap =
      (WEEKDAYS.indexOf(next.weekday) - WEEKDAYS.indexOf(current.weekday) + 7) %
      7;
    if (gap !== 1) continue;
    const a = fractionalVolumeForExercises(current.exercises);
    const b = fractionalVolumeForExercises(next.exercises);
    const overlap = Object.keys(a).reduce(
      (sum, muscle) => sum + Math.min(a[muscle], b[muscle] || 0),
      0,
    );
    if (overlap >= 4)
      warnings.push({
        code: "adjacent_overlap",
        day: next.weekday,
        message: `${current.name} and ${next.name} share ${Number(overlap.toFixed(1))} fractional sets across adjacent days.`,
      });
  }
  return warnings;
}
function initialVolumeCeiling(profile) {
  if (profile.goal === "General fitness") return 8;
  if (profile.goal === "Build muscle")
    return profile.experience === "Beginner"
      ? 14
      : profile.experience === "Advanced"
        ? 20
        : 18;
  if (profile.goal === "Lose fat")
    return profile.experience === "Beginner" ? 10 : 14;
  return profile.goal === "Athletic performance" ? 14 : 16;
}

export function hypertrophyVolumeTargets(profile = {}) {
  return hypertrophyTargetsForProfile(profile);
}

function sessionSupportsStimulus(day, muscle) {
  const key = day.structureKey || sessionStructureKey(day);
  if (["Chest", "AnteriorDelts", "LateralDelts", "Triceps"].includes(muscle))
    return ["push", "upper", "full-body", "chest", "shoulders", "arms", "chest-back", "shoulders-arms", "torso"].includes(key);
  if (["Back", "Biceps", "RearDelts"].includes(muscle))
    return ["pull", "upper", "full-body", "back", "arms", "chest-back", "shoulders-arms", "torso"].includes(key);
  if (["Quads", "Hamstrings", "Glutes", "Calves"].includes(muscle))
    return ["legs", "lower", "full-body", "limbs"].includes(key);
  return muscle === "Core";
}

function refreshHypertrophyCoverage(program, profile) {
  if (profile.goal !== "Build muscle") return program;
  const targets = hypertrophyVolumeTargets(profile);
  const volume = weeklyStimulusVolume(program);
  program.volumeTargets = targets;
  program.coverageConstrained = Object.fromEntries(Object.entries(targets)
    .filter(([muscle, policy]) => (volume[muscle] || 0) < policy.floor)
    .map(([muscle, policy]) => [muscle, {
      actual: volume[muscle] || 0,
      floor: policy.floor,
      reason: program.coverageConstraintReasons?.[muscle] || "time",
    }]));
  return program;
}

function rebalanceHypertrophyFloors(program, profile, allowed = [], usedCounts = new Map()) {
  if (profile.goal !== "Build muscle") return program;
  const targets = hypertrophyVolumeTargets(profile);
  const fixedTwoSetPolicy = String(profile.effortStyle || "").startsWith("Fewer hard");
  const priorityMuscles = priorityStimulusMusclesForProfile(profile);
  const isPriorityMuscle = muscle => priorityMuscles.has(muscle);
  const majorMuscles = ["Chest", "Back", "Quads", "Hamstrings", "Glutes"];
  let volume = weeklyStimulusVolume(program);
  const mutationWithinVolumePolicy = ({
    addItem = null,
    addSets = 0,
    removeItem = null,
    removeSets = 0,
    protectTargets = [],
  } = {}) => {
    const added = addItem ? stimulusProfileForExercise(addItem) : {};
    const removed = removeItem ? stimulusProfileForExercise(removeItem) : {};
    return stimulusMutationPreservesPolicy({
      volume,
      targets,
      addProfile: added,
      addSets,
      removeProfile: removed,
      removeSets,
      protectedTargetMuscles: protectTargets,
      priorityMuscles: Object.keys(targets).filter(isPriorityMuscle),
    });
  };
  const muscleOrder = Object.keys(targets).sort((a, b) => Number(!majorMuscles.includes(a)) - Number(!majorMuscles.includes(b)) || a.localeCompare(b));
  for (const threshold of ["floor", "target"]) {
  for (const muscle of muscleOrder) {
    const desiredVolume = targets[muscle][threshold];
    let guard = 0;
    while ((volume[muscle] || 0) < desiredVolume && guard++ < 12) {
      const candidates = fixedTwoSetPolicy ? [] : program.days.flatMap((day, dayIndex) => day.exercises.map((exercise, exerciseIndex) => ({ day, dayIndex, exercise, exerciseIndex, item: exerciseCatalog[exercise.exerciseId] })))
        .filter(entry => (stimulusProfileForExercise(entry.item)[muscle] || 0) === 1)
        .filter(entry => entry.exercise.sets.length < 4)
        .sort((a, b) => a.exercise.sets.length - b.exercise.sets.length || Number(a.exercise.programmingRole === "main") - Number(b.exercise.programmingRole === "main") || a.dayIndex - b.dayIndex || a.exerciseIndex - b.exerciseIndex || a.exercise.exerciseId.localeCompare(b.exercise.exerciseId));
      let selected = candidates.find(entry => {
        const nextSets = [...entry.exercise.sets, { ...entry.exercise.sets.at(-1), id: uid("set") }];
        const nextExercises = entry.day.exercises.map(exercise => exercise === entry.exercise ? { ...exercise, sets: nextSets } : exercise);
        return estimateSessionMinutes(nextExercises) <= Number(profile.sessionMinutes || 45) &&
          mutationWithinVolumePolicy({ addItem: entry.item, addSets: 1 });
      });
      let donor = null;
      let donorRemoveIndex = null;
      if (!selected) {
        for (const candidate of candidates) {
          const donors = candidate.day.exercises.map((exercise, exerciseIndex) => ({
            exercise,
            exerciseIndex,
            item: exerciseCatalog[exercise.exerciseId],
          })).filter(entry => entry.exercise !== candidate.exercise)
            .filter(entry => entry.exercise.sets.length > minimumWorkingSets(profile, entry.exercise))
            .map(entry => {
              const directMuscle = Object.entries(stimulusProfileForExercise(entry.item)).find(([, credit]) => credit === 1)?.[0];
              const donorThreshold = isPriorityMuscle(muscle)
                ? targets[directMuscle]?.floor
                : targets[directMuscle]?.target;
              return { ...entry, directMuscle, surplus: directMuscle ? (volume[directMuscle] || 0) - (donorThreshold || Infinity) : -Infinity };
            })
            .filter(entry => entry.surplus > 0)
            .sort((a, b) => b.surplus - a.surplus || b.exerciseIndex - a.exerciseIndex || a.exercise.exerciseId.localeCompare(b.exercise.exerciseId));
          donor = donors.find(entry => {
            const nextExercises = candidate.day.exercises.map(exercise => {
              if (exercise === candidate.exercise) return { ...exercise, sets: [...exercise.sets, { ...exercise.sets.at(-1), id: uid("set") }] };
              if (exercise === entry.exercise) return { ...exercise, sets: exercise.sets.slice(0, -1) };
              return exercise;
            });
            return estimateSessionMinutes(nextExercises) <= Number(profile.sessionMinutes || 45) &&
              mutationWithinVolumePolicy({
                addItem: candidate.item,
                addSets: 1,
                removeItem: entry.item,
                removeSets: 1,
                protectTargets: !isPriorityMuscle(muscle) && entry.directMuscle ? [entry.directMuscle] : [],
              });
          }) || null;
          if (donor) { selected = candidate; break; }
          const removable = candidate.day.exercises.map((exercise, exerciseIndex) => ({
            exercise,
            exerciseIndex,
            item: exerciseCatalog[exercise.exerciseId],
          })).filter(entry => entry.exercise !== candidate.exercise && entry.exercise.programmingRole !== "main" && !entry.exercise.requiredRole && !entry.exercise.protectedPrioritySets)
            .filter(entry => mutationWithinVolumePolicy({
              addItem: candidate.item,
              addSets: 1,
              removeItem: entry.item,
              removeSets: entry.exercise.sets.length,
            }))
            .sort((a, b) => b.exerciseIndex - a.exerciseIndex || a.exercise.exerciseId.localeCompare(b.exercise.exerciseId));
          const removed = removable.find(entry => {
            const next = candidate.day.exercises.filter((_, index) => index !== entry.exerciseIndex).map(exercise =>
              exercise === candidate.exercise
                ? { ...exercise, sets: [...exercise.sets, { ...exercise.sets.at(-1), id: uid("set") }] }
                : exercise);
            return estimateSessionMinutes(next) <= Number(profile.sessionMinutes || 45) &&
              requiredSessionRolesSatisfied(candidate.day, next) && sessionNameMatchesExercises(candidate.day, next);
          });
          if (removed) {
            selected = candidate;
            donorRemoveIndex = removed.exerciseIndex;
            break;
          }
        }
      }
      if (selected) {
        if (donor) donor.exercise.sets.pop();
        if (Number.isInteger(donorRemoveIndex)) selected.day.exercises.splice(donorRemoveIndex, 1);
        selected.exercise.sets.push({ ...selected.exercise.sets.at(-1), id: uid("set") });
        selected.day.estimatedMinutes = estimateSessionMinutes(selected.day.exercises);
      } else {
        const deficit = desiredVolume - (volume[muscle] || 0);
        const directAllowed = allowed.filter(item => (stimulusProfileForExercise(item)[muscle] || 0) === 1);
        const externallyLoadable = directAllowed.filter(item => !item.bodyweight && item.progressionQuality === "load-and-repetition");
        const additionPool = externallyLoadable.length ? externallyLoadable : directAllowed;
        const additions = program.days.flatMap((day, dayIndex) => {
          if (!sessionSupportsStimulus(day, muscle) || day.exercises.length >= 8) return [];
          const existing = new Set(day.exercises.map(exercise => exercise.exerciseId));
          const existingPatterns = new Set(day.exercises.map(exercise => exerciseCatalog[exercise.exerciseId]?.pattern).filter(Boolean));
          return additionPool.filter(item => !existing.has(item.id) && !existingPatterns.has(item.pattern))
            .map(item => ({ day, dayIndex, item }));
        }).sort((a, b) =>
          Number(a.item.bodyweight) - Number(b.item.bodyweight) ||
          (usedCounts.get(a.item.id) || 0) - (usedCounts.get(b.item.id) || 0) ||
          a.dayIndex - b.dayIndex || a.item.id.localeCompare(b.item.id));
        const makeAddition = entry => {
          const exercise = makeProgramExercise(entry.item, profile, {
            requiredRole: false,
            slotPatterns: [entry.item.pattern],
          });
          const desiredSets = Math.max(minimumWorkingSets(profile, exercise), Math.ceil(deficit));
          exercise.sets = exercise.sets.slice(0, Math.min(exercise.sets.length, desiredSets));
          return exercise;
        };
        let addition = additions.find(entry => {
          entry.exercise = makeAddition(entry);
          return estimateSessionMinutes([...entry.day.exercises, entry.exercise]) <= Number(profile.sessionMinutes || 45) &&
            mutationWithinVolumePolicy({ addItem: entry.item, addSets: entry.exercise.sets.length });
        });
        if (!addition) {
          for (const entry of additions) {
            const exercise = entry.exercise || makeAddition(entry);
            const donors = entry.day.exercises.map((candidate, exerciseIndex) => ({
              exercise: candidate,
              exerciseIndex,
              item: exerciseCatalog[candidate.exerciseId],
            })).filter(candidate => candidate.exercise.programmingRole !== "main" && !candidate.exercise.requiredRole && !candidate.exercise.protectedPrioritySets)
              .filter(candidate => mutationWithinVolumePolicy({
                addItem: exercise.exerciseId,
                addSets: exercise.sets.length,
                removeItem: candidate.item,
                removeSets: candidate.exercise.sets.length,
              }))
              .sort((a, b) => b.exerciseIndex - a.exerciseIndex || a.exercise.exerciseId.localeCompare(b.exercise.exerciseId));
            const swap = donors.find(candidate => {
              const next = entry.day.exercises.map((current, index) => index === candidate.exerciseIndex ? exercise : current);
              return estimateSessionMinutes(next) <= Number(profile.sessionMinutes || 45) &&
                requiredSessionRolesSatisfied(entry.day, next) && sessionNameMatchesExercises(entry.day, next);
            });
            if (swap) {
              addition = { ...entry, exercise, swapIndex: swap.exerciseIndex };
              break;
            }
          }
        }
        if (!addition) {
          program.coverageConstraintReasons ||= {};
          program.coverageConstraintReasons[muscle] = directAllowed.length
            ? additions.length ? "time" : "split"
            : "equipment-or-restriction";
          break;
        }
        if (Number.isInteger(addition.swapIndex)) addition.day.exercises.splice(addition.swapIndex, 1, addition.exercise);
        else addition.day.exercises.push(addition.exercise);
        addition.day.estimatedMinutes = estimateSessionMinutes(addition.day.exercises);
        usedCounts.set(addition.item.id, (usedCounts.get(addition.item.id) || 0) + 1);
      }
      volume = weeklyStimulusVolume(program);
    }
  }
  }
  return refreshHypertrophyCoverage(program, profile);
}
export function conditioningForProfile(profile = {}) {
  if (profile.goal !== "Lose fat") return null;
  const strengthDays = Math.max(
    2,
    Math.min(6, Number(profile.daysPerWeek) || 3),
  );
  const sessionsPerWeek = strengthDays <= 4 ? 2 : 1;
  const durationMinutes =
    strengthDays >= 5 || Number(profile.sessionMinutes) <= 30 ? 20 : 30;
  const olderAdult = profile.ageRange === "60+";
  const modalities =
    profile.environment === "Home gym"
      ? "Brisk walking, cycling, or another low-impact option"
      : "Incline walking, cycling, elliptical, or another low-impact option";
  return {
    sessionsPerWeek,
    durationMinutes,
    intensity: olderAdult
      ? "Easy · conversational pace"
      : "Easy to moderate · conversational pace",
    modalities,
    placement:
      strengthDays >= 5
        ? "After strength or on the easiest rest day"
        : "On rest days or after strength",
    progression: "Add 5 minutes only when recovery and consistency stay good.",
  };
}
function enforceInitialVolumeCeilings(program, profile) {
  const ceiling = initialVolumeCeiling(profile);
  const hardPolicy = profile.goal === "Build muscle" ? hypertrophyVolumeTargets(profile) : null;
  const balancedPolicy = profile.goal === "Build muscle" &&
    !(profile.priorities || []).some(value => value !== "Balanced")
      ? hypertrophyVolumeTargets(profile)
      : null;
  const limitFor = muscle => Math.min(
    balancedPolicy?.[muscle]?.softCap || ceiling,
    hardPolicy?.[muscle]?.hardCap || ceiling,
  );
  let volumes = weeklyFractionalVolume(program);
  let guard = 0;
  while (
    Object.entries(volumes).some(([muscle, value]) => value > limitFor(muscle)) &&
    guard++ < 200
  ) {
    const muscle = Object.entries(volumes)
      .filter(([name, value]) => value > limitFor(name))
      .sort((a, b) => (b[1] - limitFor(b[0])) - (a[1] - limitFor(a[0])) || a[0].localeCompare(b[0]))[0]?.[0];
    const entries = program.days
      .flatMap((day, dayIndex) =>
        day.exercises.map((exercise, exerciseIndex) => ({
          day,
          dayIndex,
          exercise,
          exerciseIndex,
          item: exerciseCatalog[exercise.exerciseId],
        })),
      )
      .filter((entry) => (stimulusProfileForExercise(entry.item)[muscle] || 0) > 0);
    const reducible = entries
      .filter(
        (entry) =>
          entry.exercise.sets.length >
          minimumWorkingSets(profile, entry.exercise),
      )
      .filter((entry) => !hardPolicy || Object.entries(stimulusProfileForExercise(entry.item)).every(
        ([affectedMuscle, credit]) => (volumes[affectedMuscle] || 0) - credit >= (hardPolicy[affectedMuscle]?.floor || 0),
      ))
      .sort(
        (a, b) =>
          Number(a.exercise.programmingRole === "main") -
            Number(b.exercise.programmingRole === "main") ||
          Number((stimulusProfileForExercise(b.item)[muscle] || 0) === 1) -
            Number((stimulusProfileForExercise(a.item)[muscle] || 0) === 1) ||
          b.dayIndex - a.dayIndex ||
          b.exerciseIndex - a.exerciseIndex,
      );
    if (reducible.length) reducible[0].exercise.sets.pop();
    else {
      const removable = entries
        .filter(
          (entry) =>
            entry.day.exercises.length > 2 &&
            entry.exercise.programmingRole !== "main" &&
            !entry.exercise.protectedPrioritySets &&
            sessionNameMatchesExercises(
              entry.day,
              entry.day.exercises.filter(
                (_, index) => index !== entry.exerciseIndex,
              ),
            ) &&
            requiredSessionRolesSatisfied(
              entry.day,
              entry.day.exercises.filter(
                (_, index) => index !== entry.exerciseIndex,
              ),
            ) &&
            (!hardPolicy || Object.entries(stimulusProfileForExercise(entry.item)).every(
              ([affectedMuscle, credit]) => (volumes[affectedMuscle] || 0) - credit * entry.exercise.sets.length >= (hardPolicy[affectedMuscle]?.floor || 0),
            )),
        )
        .sort(
          (a, b) =>
            Number(a.exercise.requiredRole) - Number(b.exercise.requiredRole) ||
            Number((stimulusProfileForExercise(b.item)[muscle] || 0) === 1) -
              Number((stimulusProfileForExercise(a.item)[muscle] || 0) === 1) ||
            b.dayIndex - a.dayIndex ||
            b.exerciseIndex - a.exerciseIndex,
        );
      if (!removable.length) break;
      removable[0].day.exercises.splice(removable[0].exerciseIndex, 1);
    }
    volumes = weeklyFractionalVolume(program);
  }
  for (const day of program.days)
    day.estimatedMinutes = estimateSessionMinutes(day.exercises);
  return refreshHypertrophyCoverage(program, profile);
}

function priorityGroupMatchesDirectExercise(group, exercise) {
  const item = exerciseCatalog[exercise?.exerciseId];
  if (!item) return false;
  if (group.patterns?.length && !group.patterns.includes(item.pattern))
    return false;
  const stimulus = stimulusProfileForExercise(item);
  return group.muscles.some((muscle) => stimulus[muscle] === 1);
}

function directPriorityGroupSets(program, group) {
  return program.days.reduce(
    (total, day) =>
      total +
      day.exercises.reduce(
        (dayTotal, exercise) =>
          dayTotal +
          (priorityGroupMatchesDirectExercise(group, exercise)
            ? exercise.sets.length
            : 0),
        0,
      ),
    0,
  );
}

function prioritizeFirstRelevantExposure(program, profile, group) {
  const relevantDays = program.days.filter((day) =>
    group.muscles.some((muscle) => sessionSupportsStimulus(day, muscle)),
  );
  const first = relevantDays[0];
  if (!first) return false;
  const hasDirect = (day) =>
    day.exercises.some((exercise) =>
      priorityGroupMatchesDirectExercise(group, exercise),
    );
  if (!hasDirect(first)) {
    const source = relevantDays.slice(1).find((day) =>
      day.exercises.some(
        (exercise) =>
          priorityGroupMatchesDirectExercise(group, exercise) &&
          exercise.programmingRole !== "main" &&
          !exercise.requiredRole,
      ),
    );
    const sourceIndex = source?.exercises.findIndex(
      (exercise) =>
        priorityGroupMatchesDirectExercise(group, exercise) &&
        exercise.programmingRole !== "main" &&
        !exercise.requiredRole,
    );
    const targetIndex = first.exercises.findIndex(
      (exercise) =>
        !priorityGroupMatchesDirectExercise(group, exercise) &&
        exercise.programmingRole !== "main" &&
        !exercise.requiredRole,
    );
    if (source && sourceIndex >= 0 && targetIndex >= 0) {
      const originalSourceExercise = source.exercises[sourceIndex];
      const originalTargetExercise = first.exercises[targetIndex];
      const sourceExercise = {
        ...originalSourceExercise,
        sets: originalSourceExercise.sets.slice(
          0,
          originalTargetExercise.sets.length,
        ),
      };
      const targetExercise = {
        ...originalTargetExercise,
        sets: Array.from(
          { length: originalSourceExercise.sets.length },
          (_, index) =>
            originalTargetExercise.sets[index] || {
              ...originalTargetExercise.sets.at(-1),
              id: uid("set"),
            },
        ),
      };
      const nextFirst = first.exercises.map((exercise, index) =>
        index === targetIndex ? sourceExercise : exercise,
      );
      const nextSource = source.exercises.map((exercise, index) =>
        index === sourceIndex ? targetExercise : exercise,
      );
      if (
        estimateSessionMinutes(nextFirst) <= Number(profile.sessionMinutes || 45) &&
        estimateSessionMinutes(nextSource) <= Number(profile.sessionMinutes || 45) &&
        requiredSessionRolesSatisfied(first, nextFirst) &&
        requiredSessionRolesSatisfied(source, nextSource) &&
        sessionNameMatchesExercises(first, nextFirst) &&
        sessionNameMatchesExercises(source, nextSource)
      ) {
        first.exercises = nextFirst;
        source.exercises = nextSource;
      }
    }
    if (!hasDirect(first)) {
      const targetIndex = first.exercises.findIndex(
        (exercise) =>
          !priorityGroupMatchesDirectExercise(group, exercise) &&
          exercise.programmingRole !== "main" &&
          !exercise.requiredRole,
      );
      const existing = new Set(
        first.exercises.map((exercise) => exercise.exerciseId),
      );
      const allowed = Object.values(exerciseCatalog)
        .filter((item) => isExerciseAutoGeneratable(item, profile))
        .filter((item) => !existing.has(item.id))
        .filter((item) =>
          priorityGroupMatchesDirectExercise(group, { exerciseId: item.id }),
        )
        .sort(
          (a, b) =>
            candidateScore(
              b,
              profile,
              new Map(),
              b.pattern,
              0,
              "accessory",
              first.exercises.map(
                (exercise) => exerciseCatalog[exercise.exerciseId],
              ),
            ) -
              candidateScore(
                a,
                profile,
                new Map(),
                a.pattern,
                0,
                "accessory",
                first.exercises.map(
                  (exercise) => exerciseCatalog[exercise.exerciseId],
                ),
              ) ||
            a.name.localeCompare(b.name),
        );
      if (targetIndex >= 0 && allowed.length) {
        const target = first.exercises[targetIndex];
        const replacement = makeProgramExercise(allowed[0], profile, {
          prioritySet: true,
          requiredRole: false,
          slotPatterns: [allowed[0].pattern],
        });
        replacement.sets = Array.from(
          { length: target.sets.length },
          (_, index) =>
            replacement.sets[index] || {
              ...replacement.sets.at(-1),
              id: uid("set"),
            },
        );
        const next = first.exercises.map((exercise, index) =>
          index === targetIndex ? replacement : exercise,
        );
        if (
          estimateSessionMinutes(next) <= Number(profile.sessionMinutes || 45) &&
          requiredSessionRolesSatisfied(first, next) &&
          sessionNameMatchesExercises(first, next)
        ) {
          first.exercises = next;
        }
      }
    }
  }
  const priorityIndex = first.exercises.findIndex((exercise) =>
    priorityGroupMatchesDirectExercise(group, exercise),
  );
  if (priorityIndex < 0) return false;
  let firstAccessoryIndex = 0;
  while (
    firstAccessoryIndex < first.exercises.length &&
    ["main", "power"].includes(
      first.exercises[firstAccessoryIndex].programmingRole,
    )
  ) {
    firstAccessoryIndex += 1;
  }
  if (priorityIndex > firstAccessoryIndex) {
    const [priorityExercise] = first.exercises.splice(priorityIndex, 1);
    first.exercises.splice(firstAccessoryIndex, 0, priorityExercise);
  }
  for (const day of new Set([first, ...relevantDays]))
    day.estimatedMinutes = estimateSessionMinutes(day.exercises);
  return true;
}

function addProtectedPrioritySets(program, baseline, profile, group, bonus) {
  const target = directPriorityGroupSets(baseline, group) + bonus;
  const policies = hypertrophyVolumeTargets(profile);
  let guard = 0;
  while (directPriorityGroupSets(program, group) < target && guard++ < 12) {
    const volume = weeklyStimulusVolume(program);
    const candidates = program.days
      .flatMap((day, dayIndex) =>
        day.exercises.map((exercise, exerciseIndex) => ({
          day,
          dayIndex,
          exercise,
          exerciseIndex,
          item: exerciseCatalog[exercise.exerciseId],
        })),
      )
      .filter((entry) => priorityGroupMatchesDirectExercise(group, entry.exercise))
      .filter((entry) => entry.exercise.sets.length < 5)
      .filter((entry) =>
        Object.entries(stimulusProfileForExercise(entry.item)).every(
          ([muscle, credit]) =>
            (volume[muscle] || 0) + credit <=
            (policies[muscle]?.hardCap || initialVolumeCeiling(profile)),
        ),
      )
      .sort((a, b) =>
        a.exercise.sets.length - b.exercise.sets.length ||
        Number(a.exercise.programmingRole === "main") -
          Number(b.exercise.programmingRole === "main") ||
        a.dayIndex - b.dayIndex ||
        a.exerciseIndex - b.exerciseIndex,
      );
    let applied = false;
    for (const candidate of candidates) {
      const addedSet = { ...candidate.exercise.sets.at(-1), id: uid("set") };
      const withAddedSet = candidate.day.exercises.map((exercise) =>
        exercise === candidate.exercise
          ? { ...exercise, sets: [...exercise.sets, addedSet] }
          : exercise,
      );
      if (
        estimateSessionMinutes(withAddedSet) <= Number(profile.sessionMinutes || 45)
      ) {
        candidate.exercise.sets.push(addedSet);
        candidate.exercise.protectedPrioritySets =
          (candidate.exercise.protectedPrioritySets || 0) + 1;
        applied = true;
      } else {
        const donor = candidate.day.exercises
          .map((exercise, exerciseIndex) => ({
            exercise,
            exerciseIndex,
            item: exerciseCatalog[exercise.exerciseId],
          }))
          .filter((entry) => entry.exercise !== candidate.exercise)
          .filter(
            (entry) =>
              !priorityGroupMatchesDirectExercise(group, entry.exercise) &&
              entry.exercise.sets.length > minimumWorkingSets(profile, entry.exercise),
          )
          .filter((entry) =>
            Object.entries(stimulusProfileForExercise(entry.item)).every(
              ([muscle, credit]) =>
                (volume[muscle] || 0) - credit >= (policies[muscle]?.floor || 0),
            ),
          )
          .sort((a, b) =>
            Number(a.exercise.requiredRole) - Number(b.exercise.requiredRole) ||
            Number(a.exercise.programmingRole === "main") -
              Number(b.exercise.programmingRole === "main") ||
            b.exerciseIndex - a.exerciseIndex,
          )[0];
        if (!donor) continue;
        donor.exercise.sets.pop();
        candidate.exercise.sets.push(addedSet);
        candidate.exercise.protectedPrioritySets =
          (candidate.exercise.protectedPrioritySets || 0) + 1;
        applied = true;
      }
      if (applied) {
        candidate.day.estimatedMinutes = estimateSessionMinutes(
          candidate.day.exercises,
        );
        break;
      }
    }
    if (!applied) break;
  }
  const actual = directPriorityGroupSets(program, group);
  if (actual < target) {
    program.priorityConstrained ||= {};
    program.priorityConstrained[group.key] = {
      actual,
      target,
      reason: "time-recovery-or-volume",
    };
  }
}

function enforceManualPriorityPostconditions(program, baseline, profile) {
  if (profile.goal !== "Build muscle") return program;
  const groups = priorityProgrammingGroupsForProfile(profile).filter(
    (group) => group.source === "manual",
  );
  if (!groups.length) return program;
  const bonus = Number(profile.daysPerWeek) >= 5 ? 3 : 2;
  for (const group of groups) {
    prioritizeFirstRelevantExposure(program, profile, group);
    addProtectedPrioritySets(program, baseline, profile, group, bonus);
  }
  for (const day of program.days) {
    day.exercises = fitSessionToDuration(
      day.exercises,
      Number(profile.sessionMinutes) || 45,
      profile,
      day,
    );
    day.estimatedMinutes = estimateSessionMinutes(day.exercises);
  }
  for (const group of groups) {
    const target = directPriorityGroupSets(baseline, group) + bonus;
    const actual = directPriorityGroupSets(program, group);
    if (actual >= target) continue;
    program.priorityConstrained ||= {};
    program.priorityConstrained[group.key] = {
      actual,
      target,
      reason: "time-recovery-or-volume",
    };
  }
  return refreshHypertrophyCoverage(program, profile);
}

export function buildProgram(profile, options = {}) {
  const trainingSafety = compileProfileTrainingSafety(
    profile,
    Object.values(exerciseCatalog),
  );
  if (trainingSafetyBlocks(trainingSafety.status))
    throw new Error(trainingSafety.message || "Training restrictions need review.");
  const frequency = Math.max(2, Math.min(6, Number(profile.daysPerWeek) || 3));
  const available = (profile.availableDays || []).filter((day) =>
    WEEKDAYS.includes(day),
  );
  const structuralSelection = selectStructuralTemplate(profile, frequency);
  const baseTemplateId = structuralSelection.templateId;
  const allowedRegions = trainingSafety.constraints.allowedBodyRegions || [];
  const scopedRegion =
    allowedRegions.length === 1 &&
    ["upper_body", "lower_body"].includes(allowedRegions[0])
      ? allowedRegions[0]
      : null;
  const scopedSlots =
    scopedRegion === "upper_body"
      ? [
          slot("horizontal-push", { role: "main" }),
          slot("horizontal-pull", { role: "main" }),
          slot("vertical-push"),
          slot("vertical-pull"),
          slot(["shoulder-isolation", "elbow-flexion", "elbow-extension"], {
            essential: false,
          }),
          slot("core", { essential: false }),
        ]
      : scopedRegion === "lower_body"
        ? [
            slot("squat", { role: "main" }),
            slot("hinge", { role: "main" }),
            slot("single-leg"),
            slot("knee-flexion"),
            slot("calf", { essential: false }),
            slot("core", { essential: false }),
          ]
        : null;
  const templateId = scopedRegion
    ? `SAFETY-${scopedRegion === "upper_body" ? "UPPER" : "LOWER"}`
    : baseTemplateId;
  const template = scopedRegion
    ? {
        name:
          scopedRegion === "upper_body"
            ? "Upper-body training"
            : "Lower-body training",
        sessions: Array.from({ length: frequency }, (_, index) => ({
          name: `${scopedRegion === "upper_body" ? "Upper" : "Lower"} ${String.fromCharCode(65 + index)}`,
          slots: scopedSlots,
        })),
      }
    : PROGRAM_TEMPLATES[templateId];
  const allowed = Object.values(exerciseCatalog).filter((item) =>
    isExerciseAutoGeneratable(item, profile),
  );
  const usedCounts = new Map();
  const budgets = prioritySetBudgets(profile);
  const requestedSequence =
    structuralSelection.userRequestedSequence ||
    structuralSelection.canonicalSessionSequence ||
    sequenceForTemplate(templateId, structuralSelection.preference?.id);
  const sessionDefinitions = scopedRegion
    ? template.sessions
    : orderSessionsByStructuralSequence(template.sessions, requestedSequence);
  const sessions = sessionDefinitions.map((definition, dayIndex) => {
    const resolved = resolveTemplateSession(
      definition,
      profile,
      allowed,
      usedCounts,
      dayIndex,
      budgets,
    );
    const fitted = fitSessionToDuration(
      resolved,
      Number(profile.sessionMinutes) || 45,
      profile,
      definition,
    );
    const emphasized =
      frequency === 5 && definition.name === "Upper"
        ? (profile.priorities || []).filter(
            (value) =>
              value !== "Balanced" &&
              fitted.filter(
                (exercise) =>
                  exerciseCatalog[exercise.exerciseId]?.muscles?.[0] === value,
              ).length >= 2,
          )
        : [];
    const emphasis =
      emphasized.length > 1
        ? `${emphasized.slice(0, -1).join(", ")} & ${emphasized.at(-1)}`
        : emphasized[0];
    const name = emphasis ? `Upper · ${emphasis} emphasis` : definition.name;
    const titleParts = workoutDisplayParts(name);
    return {
      id: uid("program-day"),
      weekday: null,
      location: profile.environment === "Home gym" ? "Home" : "Commercial gym",
      type: "workout",
      name,
      workoutName: titleParts.detail ? titleParts.primary : undefined,
      workoutDescriptor: titleParts.detail || undefined,
      structureKey: sessionStructureKey(definition),
      estimatedMinutes: estimateSessionMinutes(fitted),
      exercises: fitted,
    };
  });
  const scheduledDays = selectScheduledDays(
    available,
    frequency,
    profile,
    sessions,
  );
  const placedSessions = sessions.map((day, index) => ({
    ...day,
    weekday: scheduledDays[index],
  }));
  const days = placedSessions;
  const splitPreference = structuralSelection.preference
    ? {
        id: structuralSelection.preference.id,
        label: structuralSelection.preference.label,
        honored: structuralSelection.preferenceHonored,
        exactFrequencyMatch: structuralSelection.exactFrequencyMatch,
        fidelity: structuralSelection.fidelity,
        fallbackReason: structuralSelection.fallbackReason,
        structureFamily: structuralSelection.structuralFamily,
        userRequestedSequence: structuralSelection.userRequestedSequence,
      }
    : null;
  const parsed = structuralSelection.parsedPreference;
  const trainingStyle =
    parsed &&
    (parsed.structure ||
      parsed.namedProgram ||
      parsed.progression ||
      parsed.periodization ||
      parsed.styleOverlays?.length)
      ? {
          structure: parsed.structure?.id || null,
          styleOverlays: parsed.styleOverlays,
          progression: parsed.progression,
          periodization: parsed.periodization,
          namedProgram: parsed.namedProgram,
          fidelity: structuralSelection.fidelity || parsed.fidelity,
          userRequestedSequence: parsed.userRequestedSequence,
          confidence: parsed.confidence,
          reasonCodes: parsed.reasonCodes,
        }
      : null;
  const generatedProgram = {
      id: uid("program"),
      name: template.name,
      templateId,
      programmingVersion: 3,
      goal: profile.goal,
      goalAtCreation: trainingGoalKey(profile.goal),
      createdAt: new Date().toISOString(),
      version: 1,
      source: "fixed-template",
      profileSnapshot: structuredClone(profile),
      splitPreference,
      trainingStyle,
      trainingStructure: {
        structureFamily:
          structuralSelection.structuralFamily ||
          structureIdForTemplate(templateId),
        canonicalSessionSequence:
          structuralSelection.canonicalSessionSequence ||
          sequenceForTemplate(templateId),
        userRequestedSequence: structuralSelection.userRequestedSequence,
        scheduledSessionSequence: days.map((day) => day.structureKey),
        schedulingFlexibility: structuralSelection.schedulingFlexibility,
        recoveryRelationships: structuralSelection.recoveryRelationships,
        fidelity: structuralSelection.fidelity,
      },
      volumeCeiling: initialVolumeCeiling(profile),
      conditioning: conditioningForProfile(profile),
      includeRecommendedWarmups: profile.recommendedWarmupsEnabled !== false,
      trainingSafety: {
        parserVersion: trainingSafety.parserVersion,
        policyVersion: trainingSafety.policyVersion,
        constraintHash: trainingSafety.constraintHash,
      },
      days,
  };
  rebalanceHypertrophyFloors(generatedProgram, profile, allowed, usedCounts);
  generatedProgram.days = adaptConsecutiveSessionRecovery(generatedProgram.days, profile);
  const finalized = enforceInitialVolumeCeilings(generatedProgram, profile);
  if (options.skipPriorityPostconditions) return finalized;
  const hasManualPriority = priorityProgrammingGroupsForProfile(profile).some(
    (group) => group.source === "manual",
  );
  if (!hasManualPriority || profile.goal !== "Build muscle") return finalized;
  const neutralProfile = {
    ...profile,
    priorities: ["Balanced"],
    prioritySources: {
      ...(profile.prioritySources || {}),
      manual: [],
    },
  };
  const baseline = buildProgram(neutralProfile, {
    skipPriorityPostconditions: true,
  });
  return enforceManualPriorityPostconditions(
    finalized,
    baseline,
    profile,
  );
}

const REPLACEMENT_GENERATOR_VERSION = 1;
const replacementSlots = (program) =>
  (program?.days || []).flatMap((day, dayIndex) =>
    (day.exercises || []).map((exercise, exerciseIndex) => ({
      day,
      dayIndex,
      exercise,
      exerciseIndex,
    })),
  );
const replacementHistoryCounts = (workouts = []) => {
  const counts = new Map();
  for (const workout of workouts || [])
    for (const exercise of workout.exercises || [])
      if ((exercise.sets || []).some((set) => set.completed))
        counts.set(
          exercise.exerciseId,
          (counts.get(exercise.exerciseId) || 0) + 1,
        );
  return counts;
};
const correspondingReplacementExercise = (
  currentProgram,
  candidateDay,
  dayIndex,
  exerciseIndex,
) => {
  const currentDay =
    currentProgram?.days?.find((day) => day.weekday === candidateDay.weekday) ||
    currentProgram?.days?.find(
      (day) =>
        candidateDay.structureKey && day.structureKey === candidateDay.structureKey,
    ) ||
    currentProgram?.days?.[dayIndex];
  return currentDay?.exercises?.[exerciseIndex] || null;
};
export function replacementProgramDifference(candidate, currentProgram) {
  const slots = replacementSlots(candidate);
  const changed = slots.filter(({ day, dayIndex, exercise, exerciseIndex }) =>
    exercise.exerciseId !==
    correspondingReplacementExercise(
      currentProgram,
      day,
      dayIndex,
      exerciseIndex,
    )?.exerciseId,
  ).length;
  return {
    changed,
    total: slots.length,
    ratio: slots.length ? changed / slots.length : 0,
  };
}
function replacementVariantSeed(profile, currentProgram, generation) {
  const fingerprint = JSON.stringify({
    goal: profile.goal,
    experience: profile.experience,
    daysPerWeek: profile.daysPerWeek,
    availableDays: profile.availableDays,
    sessionMinutes: profile.sessionMinutes,
    equipment: profile.equipment,
    priorities: profile.priorities,
    exercisePreference: profile.exercisePreference,
    effortStyle: profile.effortStyle,
    templateId: currentProgram?.templateId,
    generation,
    generatorVersion: REPLACEMENT_GENERATOR_VERSION,
  });
  let hash = 2166136261;
  for (const character of fingerprint) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `replacement-${REPLACEMENT_GENERATOR_VERSION}-${(hash >>> 0).toString(36)}`;
}
export function buildReplacementProgram(
  profile,
  currentProgram,
  workouts = [],
) {
  const program = buildProgram(profile);
  const generation = Math.max(
    1,
    Number(currentProgram?.replacementGeneration || 0) + 1,
  );
  const initialDifference = replacementProgramDifference(program, currentProgram);
  const minimumChanged = Math.min(
    initialDifference.total,
    initialDifference.total <= 1
      ? initialDifference.total
      : Math.max(2, Math.ceil(initialDifference.total * 0.3)),
  );
  const historyCounts = replacementHistoryCounts(workouts);
  const occupied = new Set(
    replacementSlots(program).map(({ exercise }) => exercise.exerciseId),
  );
  const unchangedSlots = replacementSlots(program)
    .filter(({ day, dayIndex, exercise, exerciseIndex }) =>
      exercise.exerciseId ===
      correspondingReplacementExercise(
        currentProgram,
        day,
        dayIndex,
        exerciseIndex,
      )?.exerciseId,
    )
    .sort(
      (a, b) =>
        (historyCounts.get(a.exercise.exerciseId) || 0) -
          (historyCounts.get(b.exercise.exerciseId) || 0) ||
        a.exerciseIndex - b.exerciseIndex ||
        a.dayIndex - b.dayIndex,
    );
  const firstByDay = [];
  const remaining = [];
  const seenDays = new Set();
  for (const slot of unchangedSlots)
    if (!seenDays.has(slot.dayIndex)) {
      seenDays.add(slot.dayIndex);
      firstByDay.push(slot);
    } else remaining.push(slot);
  const orderedSlots = [...firstByDay, ...remaining];
  let difference = initialDifference;
  for (const { exercise, dayIndex, exerciseIndex } of orderedSlots) {
    if (difference.changed >= minimumChanged) break;
    const current = exerciseCatalog[exercise.exerciseId];
    if (!current) continue;
    occupied.delete(exercise.exerciseId);
    const alternatives = compatibleReplacementCandidates(
      exercise,
      profile,
      [...occupied],
    ).filter(
      (item) =>
        !occupied.has(item.id) &&
        item.kind === current.kind &&
        item.pattern === current.pattern,
    );
    if (!alternatives.length) {
      occupied.add(exercise.exerciseId);
      continue;
    }
    const topAlternatives = alternatives.slice(0, Math.min(3, alternatives.length));
    const replacement =
      topAlternatives[
        (generation + dayIndex + exerciseIndex - 1) % topAlternatives.length
      ];
    exercise.exerciseId = replacement.id;
    exercise.restSeconds = replacement.restSeconds;
    exercise.defaultIncrement = replacement.increment;
    occupied.add(replacement.id);
    difference = replacementProgramDifference(program, currentProgram);
  }
  return {
    ...program,
    source: "personalized-replacement",
    generatorVersion: REPLACEMENT_GENERATOR_VERSION,
    replacementGeneration: generation,
    variantSeed: replacementVariantSeed(profile, currentProgram, generation),
    replacementSummary: {
      ...difference,
      minimumChanged,
      limitedBySafeAlternatives: difference.changed < minimumChanged,
    },
  };
}
export function validateProgram(program, profile = null, options = {}) {
  const errors = [];
  if (!program || !Array.isArray(program.days))
    return { valid: false, errors: ["Program is missing days."] };
  const trainingSafety = profile && options.ignoreTrainingSafety !== true
    ? compileProfileTrainingSafety(profile, Object.values(exerciseCatalog))
    : null;
  if (trainingSafety && trainingSafetyBlocks(trainingSafety.status))
    errors.push(trainingSafety.message || "Training restrictions need review.");
  if (trainingSafety && !trainingSafetyBlocks(trainingSafety.status))
    for (const day of program.days || [])
      for (const exercise of day.exercises || []) {
        const item = exerciseCatalog[exercise.exerciseId];
        if (item && !exerciseAllowedByTrainingSafety(item, trainingSafety))
          errors.push(`${item.name} conflicts with the current training restrictions.`);
        const minimumRir =
          trainingSafety.constraints.minRirByExerciseId?.[exercise.exerciseId];
        if (
          item &&
          Number.isFinite(minimumRir) &&
          Number(exercise.targetRir) < minimumRir
        )
          errors.push(
            `${item.name} must stay at least ${minimumRir} reps in reserve because of the current training restrictions.`,
          );
      }
  if (
    profile?.goal === "Lose fat" &&
    options.allowImportedExercises !== true &&
    program.source !== "ai-import"
  ) {
    const conditioning = program.conditioning;
    if (
      !conditioning ||
      !Number.isInteger(conditioning.sessionsPerWeek) ||
      conditioning.sessionsPerWeek < 1 ||
      conditioning.sessionsPerWeek > 3 ||
      !Number.isInteger(conditioning.durationMinutes) ||
      conditioning.durationMinutes < 10 ||
      conditioning.durationMinutes > 60 ||
      !String(conditioning.intensity || "").trim() ||
      !String(conditioning.modalities || "").trim() ||
      !String(conditioning.placement || "").trim()
    )
      errors.push(
        "Fat-loss program is missing a valid conditioning prescription.",
      );
  }
  const allowImportedExercises =
    options.allowImportedExercises === true || program.source === "ai-import";
  const allowSingleExercise =
    allowImportedExercises || program.source === "manual";
  if (
    profile?.daysPerWeek &&
    program.days.length !== Number(profile.daysPerWeek)
  )
    errors.push("Workout day count does not match profile.");
  const allowedDays = new Set(
    profile?.availableDays?.length ? profile.availableDays : WEEKDAYS,
  );
  const seenDays = new Set();
  const seenInstanceIds = new Set();
  const seenSupersetIds = new Set();
  for (const day of program.days) {
    if (!day.id || seenInstanceIds.has(day.id))
      errors.push(
        `Invalid or duplicate program day ID: ${day.id || "missing"}.`,
      );
    else seenInstanceIds.add(day.id);
    if (
      !WEEKDAYS.includes(day.weekday) ||
      !allowedDays.has(day.weekday) ||
      seenDays.has(day.weekday)
    )
      errors.push(`Invalid scheduled day: ${day.weekday}`);
    seenDays.add(day.weekday);
    const minimumExercises = allowSingleExercise ? 1 : 2;
    const maximumExercises = allowImportedExercises ? 30 : 8;
    if (
      !Array.isArray(day.exercises) ||
      day.exercises.length < minimumExercises ||
      day.exercises.length > maximumExercises
    )
      errors.push(`Invalid workload on ${day.weekday}.`);
    const inferredLocation =
      profile?.environment === "Home gym" ? "Home" : "Commercial gym";
    const location = day.location || inferredLocation;
    if (
      !["Commercial gym", "Home"].includes(location) ||
      (profile?.environment === "Commercial gym" &&
        location !== "Commercial gym") ||
      (profile?.environment === "Home gym" && location !== "Home")
    )
      errors.push(`Invalid training location on ${day.weekday}.`);
    const validationProfile =
      options.ignoreTrainingSafety === true
        ? { ...profile, ignoreTrainingSafety: true }
        : profile;
    const dayProfile =
      validationProfile?.environment === "Both" && location === "Home"
        ? {
            ...validationProfile,
            equipment: (validationProfile.equipment || []).filter(
              (value) => value !== "full gym",
            ),
          }
        : validationProfile;
    const seen = new Set();
    for (const exercise of day.exercises || []) {
      const item = exerciseCatalog[exercise.exerciseId];
      const customImportedExercise =
        (allowImportedExercises || program.source === "manual") &&
        !item &&
        Boolean(exercise.importedName) &&
        String(exercise.exerciseId || "").startsWith("imported-custom-");
      if (
        (!item && !customImportedExercise) ||
        (!allowImportedExercises && seen.has(exercise.exerciseId))
      )
        errors.push(`Invalid or duplicate exercise on ${day.weekday}.`);
      if (!exercise.id || seenInstanceIds.has(exercise.id))
        errors.push(
          `Invalid or duplicate program exercise ID: ${exercise.id || "missing"}.`,
        );
      else seenInstanceIds.add(exercise.id);
      if (!allowImportedExercises && isExerciseGloballyBlocked(item || exercise))
        errors.push(
          `${globallyBlockedExerciseLabel(item || exercise)} is not available in Rook programs.`,
        );
      else if (
        !allowImportedExercises &&
        item &&
        dayProfile &&
        !isExerciseAllowed(item, dayProfile)
      )
        errors.push(
          `${item.name} is incompatible with the equipment available on ${day.weekday}.`,
        );
      seen.add(exercise.exerciseId);
      const min = exercise.repMin ?? exercise.repRange?.[0];
      const max = exercise.repMax ?? exercise.repRange?.[1];
      const validRest =
        (allowImportedExercises && exercise.restSeconds === null) ||
        (exercise.restSeconds >= 30 && exercise.restSeconds <= 300);
      if (
        !Array.isArray(exercise.sets) ||
        exercise.sets.length < 1 ||
        exercise.sets.length > (allowImportedExercises ? 20 : 6) ||
        !(min > 0 && max >= min) ||
        !(exercise.defaultIncrement > 0) ||
        !validRest ||
        (exercise.targetRir !== undefined &&
          exercise.targetRir !== null &&
          !(exercise.targetRir >= 0 && exercise.targetRir <= 4))
      )
        errors.push(`Invalid prescription for ${exercise.exerciseId}.`);
      for (const set of exercise.sets || []) {
        if (!set.id || seenInstanceIds.has(set.id))
          errors.push(`Invalid or duplicate set ID: ${set.id || "missing"}.`);
        else seenInstanceIds.add(set.id);
        if (
          set.weight !== null &&
          set.weight !== undefined &&
          (!Number.isFinite(Number(set.weight)) || Number(set.weight) < 0)
        )
          errors.push(`Invalid set weight for ${exercise.exerciseId}.`);
      }
    }
    for (const error of validateSupersetExercises(day.exercises || []))
      errors.push(error);
    for (const supersetId of new Set(
      (day.exercises || [])
        .map((exercise) => exercise.supersetId)
        .filter(Boolean),
    )) {
      if (seenSupersetIds.has(supersetId))
        errors.push(
          "This plan has an invalid superset. Remove and recreate the pairing.",
        );
      seenSupersetIds.add(supersetId);
    }
    const calculatedMinutes = estimateSessionMinutes(day.exercises || []);
    const availableMinutes = Number(
      profile?.sessionMinutes || day.estimatedMinutes,
    );
    const durationLimit = Math.max(
      availableMinutes + 5,
      Math.ceil(availableMinutes * 1.15),
    );
    if (
      !Number.isFinite(Number(day.estimatedMinutes)) ||
      Math.abs(Number(day.estimatedMinutes) - calculatedMinutes) > 5 ||
      calculatedMinutes > durationLimit
    )
      errors.push(`Estimated duration is incompatible on ${day.weekday}.`);
  }
  if (!allowImportedExercises)
    for (const [muscle, sets] of Object.entries(weeklyFractionalVolume(program))) {
      const hardCap = profile?.goal === "Build muscle"
        ? hypertrophyVolumeTargets(profile)[muscle]?.hardCap || 20
        : 20;
      if (sets > hardCap)
        errors.push(`${muscle} exceeds the hard weekly volume limit of ${hardCap}.`);
    }
  if (!allowImportedExercises && profile?.goal === "Build muscle" && program.volumeTargets) {
    const volume = weeklyStimulusVolume(program);
    const targets = hypertrophyVolumeTargets(profile);
    for (const [muscle, policy] of Object.entries(targets)) {
      const constrained = program.coverageConstrained?.[muscle];
      if ((volume[muscle] || 0) < policy.floor &&
          (!constrained || constrained.actual !== (volume[muscle] || 0) || constrained.floor !== policy.floor || !constrained.reason))
        errors.push(`${muscle} is below its weekly floor without a recorded constraint reason.`);
    }
  }
  if (
    program.source === "fixed-template" &&
    (!PROGRAM_TEMPLATES[program.templateId] ||
      PROGRAM_TEMPLATES[program.templateId].sessions.length !==
        program.days.length)
  )
    errors.push("Fixed program structure is invalid.");
  if (
    !options.preserveSchedule &&
    program.source !== "ai-import" &&
    program.days.length > 1
  ) {
    const chronological = [...program.days].sort(
      (a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday),
    );
    const focusVariety = new Set(chronological.map(sessionFocus));
    for (let index = 0; index < chronological.length; index++) {
      const current = chronological[index];
      const next = chronological[(index + 1) % chronological.length];
      const distance =
        (WEEKDAYS.indexOf(next.weekday) -
          WEEKDAYS.indexOf(current.weekday) +
          7) %
        7;
      const currentFocus = sessionFocus(current);
      const nextFocus = sessionFocus(next);
      if (
        focusVariety.size > 1 &&
        distance === 1 &&
        currentFocus === nextFocus &&
        ["upper", "lower", "full", "push", "pull"].includes(currentFocus)
      ) {
        errors.push(
          `Recovery conflict: consecutive ${currentFocus} sessions across ${current.weekday} to ${next.weekday}.`,
        );
        break;
      }
    }
  }
  if (options.requireProgramQuality)
    errors.push(...programQualityErrors(program));
  return { valid: errors.length === 0, errors };
}
function resolveCatalogId(value) {
  if (exerciseCatalog[value]) return value;
  const slug = (text) =>
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return (
    Object.values(exerciseCatalog).find(
      (item) => slug(item.name) === slug(value),
    )?.id || null
  );
}
export function normalizedExerciseName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function compactExerciseName(value) {
  return normalizedExerciseName(value).replace(/\s+/g, "");
}
const EXECUTION_MODIFIER_PREFIX =
  /^(?:(?:slow\s+)?eccentric|ekscentricn(?:i|a|o)|tempo|paused?)\s+/u;
const EXECUTION_MODIFIER_SUFFIXES = [
  /\s+(?:(?:\d+(?:[.,]\d+)?\s*(?:s|sec|seconds?|sek|sekund(?:a|e|i)?))\s+)?(?:isometric|iso|izometricn(?:i|a|o)|izometricen)\s+(?:hold|zadrzek|zadrzevanje)(?:\s+\d+(?:[.,]\d+)?\s*(?:s|sec|seconds?|sek|sekund(?:a|e|i)?))?$/u,
  /\s+(?:paused?|with\s+(?:a\s+)?pause|s\s+pavzo|s\s+premorom|z\s+zadrzkom)$/u,
  /\s+(?:(?:\d+\s+){1,3})?tempo(?:\s+(?:\d+\s*){1,4})?$/u,
  /\s+(?:(?:slow\s+)?eccentric|ekscentricn(?:i|a|o)(?:\s+del)?)$/u,
];
export function exerciseNameWithoutExecutionModifier(value) {
  const normalized = normalizedExerciseName(value);
  if (!normalized) return "";
  let candidate = normalized.replace(EXECUTION_MODIFIER_PREFIX, "");
  for (const pattern of EXECUTION_MODIFIER_SUFFIXES)
    candidate = candidate.replace(pattern, "");
  return candidate.trim().replace(/\s+/g, " ");
}
const IMPORTED_EXERCISE_NAMES_REQUIRING_REVIEW = new Set([
  "balance",
  "ravnotezje",
]);
export function importedExerciseNameNeedsReview(value) {
  return IMPORTED_EXERCISE_NAMES_REQUIRING_REVIEW.has(
    normalizedExerciseName(value),
  );
}
function pluralizedExerciseName(value) {
  const words = normalizedExerciseName(value).split(" ").filter(Boolean);
  if (!words.length) return "";
  const last = words.at(-1);
  if (/[^aeiou]y$/u.test(last)) words[words.length - 1] = `${last.slice(0, -1)}ies`;
  else if (/(?:ss|x|z|ch|sh)$/u.test(last)) words[words.length - 1] = `${last}es`;
  else if (!/s$/u.test(last)) words[words.length - 1] = `${last}s`;
  return words.join(" ");
}
function catalogExerciseNames(item) {
  return [item?.name, ...(item?.aliases || [])].filter(Boolean);
}
export function exerciseMatchesQuery(item, query) {
  const normalizedQuery = normalizedExerciseName(query);
  if (!normalizedQuery) return true;
  const compactQuery = compactExerciseName(query);
  return catalogExerciseNames(item).some(
    (value) => {
      const normalizedValue = normalizedExerciseName(value);
      const pluralValue = pluralizedExerciseName(value);
      return (
        normalizedValue.includes(normalizedQuery) ||
        pluralValue.includes(normalizedQuery) ||
        compactExerciseName(normalizedValue).includes(compactQuery) ||
        compactExerciseName(pluralValue).includes(compactQuery)
      );
    },
  );
}
function importedSourceName(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^\s*(?:[-*•◦]+|\d+[.)])\s*/, "");
  const setWord =
    "(?:sets?|series|s[eé]ries?|serie|serije?|serii|zestawy|s[aä]tze?|seturi|подход(?:а|ов|ы)?|серии|세트|セット|[组組])";
  const prescription = cleaned.search(
    new RegExp(
      `\\s*(?:[-–—:|]\\s*)?(?:\\d+\\s*(?:x|×)\\s*\\d+|\\d+\\s*${setWord}(?=\\s|\\d|$)|${setWord}\\s*[:=]?\\s*\\d+)`,
      "iu",
    ),
  );
  return (prescription >= 0 ? cleaned.slice(0, prescription) : cleaned)
    .replace(/[\s:|–—-]+$/g, "")
    .trim();
}
function stripImportedExerciseClassification(value) {
  return importedSourceName(value)
    .replace(
      /\s*\(\s*(?:compound(?:\s+exercise)?|isolation(?:\s+exercise)?|accessory(?:\s+exercise)?|warm[- ]?up|core)\s*\)?\s*$/iu,
      "",
    )
    .trim();
}
export function splitImportedExerciseLabel(value) {
  const cleaned = stripImportedExerciseClassification(value);
  if (!cleaned || matchImportedExerciseName(cleaned).exerciseId)
    return { name: cleaned, note: null };
  const annotated = cleaned.match(/^(.+?)\s*\(\s*([^()]*)\)?\s*$/u);
  if (!annotated) return { name: cleaned, note: null };
  const name = annotated[1].trim();
  const note = annotated[2].trim();
  if (!name || !note || !matchImportedExerciseName(name).exerciseId)
    return { name: cleaned, note: null };
  return { name, note };
}
export function cleanImportedExerciseLabel(value) {
  return splitImportedExerciseLabel(value).name;
}
export function authoritativeImportedExerciseNames(sourceText, proposedNames) {
  return findImportedOccurrences(sourceText, proposedNames).map(
    (item) => item.name,
  );
}
function searchableImportedSource(value) {
  const raw = String(value || "");
  let normalized = "";
  const map = [];
  for (let index = 0; index < raw.length;) {
    const point = raw.codePointAt(index);
    const character = String.fromCodePoint(point);
    const width = character.length;
    const folded = character
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase();
    for (const part of folded) {
      if (/\p{L}|\p{N}/u.test(part)) {
        normalized += part;
        map.push(index);
      } else if (normalized && normalized.at(-1) !== " ") {
        normalized += " ";
        map.push(index);
      }
    }
    index += width;
  }
  return { raw, normalized, map };
}
function findImportedOccurrences(sourceText, proposedNames) {
  const source = searchableImportedSource(sourceText);
  let cursor = 0;
  return proposedNames.map((value) => {
    const proposed = importedSourceName(value);
    const target = normalizedExerciseName(proposed);
    if (!target)
      throw new Error("Imported exercise is missing its source name.");
    let index = source.normalized.indexOf(target, cursor);
    while (index >= 0) {
      const before = source.normalized[index - 1];
      const after = source.normalized[index + target.length];
      if ((!before || before === " ") && (!after || after === " ")) break;
      index = source.normalized.indexOf(target, index + 1);
    }
    if (index < 0)
      throw new Error(
        `Imported exercise "${proposed}" was not found exactly in the source plan. Exercise names and qualifiers must be preserved.`,
      );
    const rawStart = source.map[index];
    const rawLast = source.map[index + target.length - 1];
    const rawEnd =
      rawLast + String.fromCodePoint(source.raw.codePointAt(rawLast)).length;
    cursor = index + target.length;
    return {
      name: source.raw.slice(rawStart, rawEnd).trim(),
      rawStart,
      rawEnd,
    };
  });
}
function explicitKgPrescription(source, setCount, defaultUnit = null) {
  const text = String(source);
  const normalizeLoad = (value, unit) => {
    const numeric = Number(String(value).trim().replace(",", "."));
    if (!Number.isFinite(numeric)) return NaN;
    return Number(
      ((unit === "lb" ? numeric * KG_PER_LB : numeric)).toFixed(2),
    );
  };
  const normalizedUnit = (value) =>
    /^(?:lb|lbs)$/iu.test(String(value || ""))
      ? "lb"
      : /^(?:kg|kgs)$/iu.test(String(value || ""))
        ? "kg"
        : defaultUnit === "lb" || defaultUnit === "kg"
          ? defaultUnit
          : null;
  const sharedRepsSequence = text.match(
    /(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?){1,19})\s*(kg|kgs|lb|lbs)?\s*(?:[x×*]\s*)?\d+\s*(?:reps?|repov|ponovitev|ponovitve|ponavljanj|wdh|repeticiones?)\b/iu,
  );
  const sharedUnit = normalizedUnit(sharedRepsSequence?.[2]);
  const sharedValues =
    sharedRepsSequence && sharedUnit
      ? sharedRepsSequence[1]
          .split("/")
          .map((value) => normalizeLoad(value, sharedUnit))
      : [];
  const explicitSlash = text.match(
    /(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?){1,19})\s*(kg|kgs|lb|lbs)\b/iu,
  );
  const slashUnit = normalizedUnit(explicitSlash?.[2]);
  const slashValues =
    explicitSlash && slashUnit
      ? explicitSlash[1]
          .split("/")
          .map((value) => normalizeLoad(value, slashUnit))
      : [];
  const directValues = [
    ...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|lb|lbs)\b/giu),
  ].map((match) => normalizeLoad(match[1], normalizedUnit(match[2])));
  const groupedSetValues = [
    ...text.matchAll(
      /(\d+)\s*(?:sets?|seti|seta|serije?|seriji|serij|serti|series?|satz|satze|sätze)\b[^\n;]*?(\d+(?:[.,]\d+)?)\s*(kg|kgs|lb|lbs)\b/giu,
    ),
  ].flatMap((match) =>
    Array.from({ length: Number(match[1]) }, () =>
      normalizeLoad(match[2], normalizedUnit(match[3])),
    ),
  );
  if (
    groupedSetValues.length === Number(setCount) &&
    groupedSetValues.every((value) => Number.isFinite(value) && value >= 0)
  )
    return groupedSetValues.every((value) => value === groupedSetValues[0])
      ? { weightKg: groupedSetValues[0], setWeightsKg: null }
      : { weightKg: null, setWeightsKg: groupedSetValues };
  const values = sharedValues.length
    ? sharedValues
    : slashValues.length
      ? slashValues
      : directValues;
  if (
    !values.length ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  )
    return { weightKg: null, setWeightsKg: null };
  if (values.length === 1) return { weightKg: values[0], setWeightsKg: null };
  if (values.length === Number(setCount))
    return { weightKg: null, setWeightsKg: values };
  if (values.every((value) => value === values[0]))
    return { weightKg: values[0], setWeightsKg: null };
  return { weightKg: null, setWeightsKg: null };
}
export function authoritativeImportedWeights(
  sourceText,
  proposedExercises,
  defaultUnit = null,
) {
  const source = String(sourceText || "");
  const workingLoadText = (value) =>
    String(value || "")
      .split(/\r?\n/u)
      .filter(
        (line) =>
          !/^\s*(?:[-*•]\s*)?(?:ogrevaln\p{L}*|warm[ -]?up|ramp[ -]?up|ramp\s+sets?)\b/iu.test(
            line,
          ),
      )
      .join("\n");
  const occurrences = findImportedOccurrences(
    source,
    proposedExercises.map((value) => value.sourceName),
  );
  return proposedExercises.map((value, index) => {
    const occurrence = occurrences[index];
    const lineStart =
      Math.max(
        source.lastIndexOf("\n", occurrence.rawStart),
        source.lastIndexOf(";", occurrence.rawStart),
      ) + 1;
    const newline = source.indexOf("\n", occurrence.rawEnd);
    const semicolon = source.indexOf(";", occurrence.rawEnd);
    const lineEnd = Math.min(
      ...[newline, semicolon].filter((position) => position >= 0),
      source.length,
    );
    const previous = occurrences[index - 1];
    const next = occurrences[index + 1];
    const start =
      previous && previous.rawStart >= lineStart
        ? occurrence.rawStart
        : lineStart;
    const end = next && next.rawStart < lineEnd ? next.rawStart : lineEnd;
    const inline = explicitKgPrescription(
      workingLoadText(source.slice(start, end)),
      value.sets,
      defaultUnit,
    );
    if (inline.weightKg !== null || inline.setWeightsKg !== null) return inline;
    const nextOccurrence = occurrences[index + 1];
    const blankLine = source.slice(occurrence.rawEnd).search(/\r?\n\s*\r?\n/u);
    const blockEnd = Math.min(
      nextOccurrence?.rawStart ?? source.length,
      blankLine >= 0 ? occurrence.rawEnd + blankLine : source.length,
    );
    return explicitKgPrescription(
      workingLoadText(source.slice(occurrence.rawEnd, blockEnd)),
      value.sets,
      defaultUnit,
    );
  });
}
export function matchImportedExerciseName(value) {
  const normalized = normalizedExerciseName(value);
  if (!normalized) return { exerciseId: null, status: "unresolved" };
  const exact = Object.values(exerciseCatalog).filter(
    (item) => normalizedExerciseName(item.name) === normalized,
  );
  const exactCanonical = exact.filter((item) => !item.id.startsWith("wg-"));
  if (exact.length === 1 || exactCanonical.length === 1)
    return {
      exerciseId: (exactCanonical[0] || exact[0]).id,
      status: "matched",
    };
  const aliases = Object.values(exerciseCatalog).filter((item) =>
    (item.aliases || []).some(
      (alias) => normalizedExerciseName(alias) === normalized,
    ),
  );
  const aliasCanonical = aliases.filter((item) => !item.id.startsWith("wg-"));
  if (aliases.length === 1 || aliasCanonical.length === 1)
    return {
      exerciseId: (aliasCanonical[0] || aliases[0]).id,
      status: "alias",
    };
  const pluralExact = Object.values(exerciseCatalog).filter(
    (item) => pluralizedExerciseName(item.name) === normalized,
  );
  const pluralExactCanonical = pluralExact.filter(
    (item) => !item.id.startsWith("wg-"),
  );
  if (pluralExact.length === 1 || pluralExactCanonical.length === 1)
    return {
      exerciseId: (pluralExactCanonical[0] || pluralExact[0]).id,
      status: "alias",
    };
  const pluralAliases = Object.values(exerciseCatalog).filter((item) =>
    (item.aliases || []).some(
      (alias) => pluralizedExerciseName(alias) === normalized,
    ),
  );
  const pluralAliasCanonical = pluralAliases.filter(
    (item) => !item.id.startsWith("wg-"),
  );
  if (pluralAliases.length === 1 || pluralAliasCanonical.length === 1)
    return {
        exerciseId: (pluralAliasCanonical[0] || pluralAliases[0]).id,
        status: "alias",
      };
  // Separators are only formatting differences (Pull-up / Pull up / Pullup).
  // Compact matching is accepted only when one canonical exercise remains.
  const compact = compactExerciseName(normalized);
  const compactMatches = Object.values(exerciseCatalog).filter((item) =>
    catalogExerciseNames(item).some((name) =>
      [normalizedExerciseName(name), pluralizedExerciseName(name)].some(
        (candidate) => compactExerciseName(candidate) === compact,
      ),
    ),
  );
  const compactCanonical = compactMatches.filter(
    (item) => !item.id.startsWith("wg-"),
  );
  if (compactMatches.length === 1 || compactCanonical.length === 1)
    return {
      exerciseId: (compactCanonical[0] || compactMatches[0]).id,
      status: "alias",
    };
  // Execution cues can reuse the base movement artwork only after the full
  // name has failed to resolve. Equipment, stance and movement words stay
  // untouched, so e.g. seated and lying curls never collapse into each other.
  const baseMovement = exerciseNameWithoutExecutionModifier(normalized);
  if (
    !/[()]/u.test(String(value || "")) &&
    baseMovement &&
    baseMovement !== normalized
  ) {
    const baseMatch = matchImportedExerciseName(baseMovement);
    if (baseMatch.exerciseId)
      return { exerciseId: baseMatch.exerciseId, status: "alias" };
  }
  return { exerciseId: null, status: "unresolved" };
}
function importedCustomId(value) {
  let hash = 2166136261;
  for (const character of normalizedExerciseName(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `imported-custom-${(hash >>> 0).toString(36)}`;
}
function removeInterchangeableCompoundDuplicates(days) {
  const interchangeablePatterns = new Set([
    "horizontal-push",
    "vertical-push",
    "horizontal-pull",
    "vertical-pull",
  ]);
  return days.map((day) => {
    const seen = new Set();
    const removable = new Set();
    for (const exercise of day.exercises || []) {
      const item = exerciseCatalog[exercise.exerciseId];
      if (
        !item ||
        item.kind !== "compound" ||
        !interchangeablePatterns.has(item.pattern)
      )
        continue;
      if (seen.has(item.pattern)) removable.add(exercise.id);
      else seen.add(item.pattern);
    }
    if (!removable.size || day.exercises.length - removable.size < 2)
      return day;
    const exercises = day.exercises.filter(
      (exercise) => !removable.has(exercise.id),
    );
    return {
      ...day,
      exercises,
      estimatedMinutes: estimateSessionMinutes(exercises),
    };
  });
}
export function normalizeGeneratedProgram(raw, profile, options = {}) {
  if (!raw?.days) throw new Error("AI plan did not contain days.");
  const preserve = options.preservePrescription === true;
  const expertReview = options.expertReview === true;
  const normalizedSessions = raw.days.map((day) => {
    if (!Array.isArray(day.exercises))
      throw new Error(
        `AI plan is missing exercises for ${day.weekday || "a day"}.`,
      );
    const exercises = day.exercises.map((value, index) => {
      const importedLabel = preserve
        ? splitImportedExerciseLabel(value.sourceName)
        : { name: null, note: null };
      const importedName = importedLabel.name;
      const importedMatch = preserve
        ? matchImportedExerciseName(importedName)
        : null;
      const exerciseId = preserve
        ? importedMatch.exerciseId || importedCustomId(importedName)
        : resolveCatalogId(value.exerciseId);
      const item = exerciseCatalog[exerciseId];
      if (
        !preserve &&
        isExerciseGloballyBlocked(
          item || { exerciseId, importedName, name: value.exerciseId },
        )
      )
        throw new Error(
          `${globallyBlockedExerciseLabel(item || { exerciseId, importedName, name: value.exerciseId })} is not available in Rook programs. Replace it with another exercise.`,
        );
      if (!item && !preserve)
        throw new Error(`Unknown exercise: ${value.exerciseId}`);
      if (!item && !importedName)
        throw new Error("Imported exercise is missing its source name.");
      const explicitProgrammingRole = ["main", "accessory", "power"].includes(
        value.programmingRole,
      )
        ? value.programmingRole
        : null;
      const programmingRole = preserve
        ? undefined
        : item?.kind === "power"
          ? "power"
          : explicitProgrammingRole === "main" ||
              explicitProgrammingRole === "accessory"
            ? explicitProgrammingRole
            : inferredProgrammingRole(day.exercises, index, (exercise) =>
                exerciseCatalog[resolveCatalogId(exercise.exerciseId)],
              );
      const fallback = item
        ? trainingPrescription(profile, item, programmingRole)
        : { targetRir: null };
      const count = Number(value.sets);
      const repMin = Number(value.repMin);
      const repMax = Number(value.repMax);
      const targetRir =
        !preserve && item?.kind === "power"
          ? null
          : preserve &&
              (value.targetRir === null || value.targetRir === undefined)
            ? null
            : Number(value.targetRir ?? fallback.targetRir);
      const importedRestWasProvided =
        value.restSeconds !== null && value.restSeconds !== undefined;
      const restSeconds = preserve
        ? importedRestWasProvided
          ? Number(value.restSeconds)
          : item?.restSeconds || 90
        : Number(value.restSeconds);
      const commonWeight =
        preserve && value.weightKg !== null && value.weightKg !== undefined
          ? Number(value.weightKg)
          : null;
      const setWeights =
        preserve && Array.isArray(value.setWeightsKg)
          ? value.setWeightsKg
          : null;
      if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > (preserve ? 20 : 6) ||
        !Number.isInteger(repMin) ||
        repMin < 1 ||
        !Number.isInteger(repMax) ||
        repMax < repMin ||
        (targetRir !== null &&
          (!Number.isInteger(targetRir) || targetRir < 0 || targetRir > 4)) ||
        (restSeconds !== null && !Number.isFinite(restSeconds)) ||
        (commonWeight !== null &&
          (!Number.isFinite(commonWeight) || commonWeight < 0)) ||
        (setWeights &&
          (setWeights.length !== count ||
            setWeights.some(
              (weight) =>
                weight !== null &&
                (!Number.isFinite(Number(weight)) || Number(weight) < 0),
            )))
      )
        throw new Error(
          `AI returned an invalid prescription for ${exerciseId}.`,
        );
      if (
        !preserve &&
        isFewerHardSets(profile) &&
        (count !== fallback.sets ||
          repMin !== fallback.repMin ||
          repMax !== fallback.repMax)
      )
        throw new Error(
          `${item.name} must use ${fallback.sets} sets of ${fallback.repMin}–${fallback.repMax} for the selected Fewer hard sets approach.`,
        );
      const importedExercise =
        preserve && !item
          ? {
              id: exerciseId,
              name: importedName,
              source: "imported",
              pattern: null,
              muscles: null,
              equipment: null,
              measure: value.measure || null,
            }
          : null;
      return {
        id: uid("program-exercise"),
        exerciseId,
        loadRequirement: exerciseLoadRequirement(
          item || {
            ...value,
            exerciseId,
            importedName,
            importedExercise,
          },
        ),
        programmingRole,
        effortMode:
          !preserve && item?.kind === "power" ? "velocity-quality" : undefined,
        importedName,
        originalImportedName: importedName,
        exerciseSource: preserve
          ? item
            ? "catalog"
            : "imported-custom"
          : "catalog",
        importedExercise,
        measure: preserve ? value.measure || item?.measure || null : item?.measure,
        matchStatus: preserve
          ? importedExerciseNameNeedsReview(importedName)
            ? "needs-name-review"
            : !item
              ? "unresolved"
              : importedMatch.status
          : undefined,
        failureTarget: preserve ? Boolean(value.failureTarget) : false,
        notes: preserve
          ? [
              ...new Set(
                [importedLabel.note, value.notes && String(value.notes)].filter(
                  Boolean,
                ),
              ),
            ].join(" · ") || null
          : null,
        sets: Array.from({ length: count }, (_, index) => ({
          id: uid("set"),
          weight: setWeights
            ? setWeights[index] === null
              ? null
              : Number(setWeights[index])
            : commonWeight,
          weightProvenance:
            preserve &&
            Number(setWeights ? setWeights[index] : commonWeight) > 0
              ? "imported"
              : null,
          reps: repMin,
          completed: false,
          rir: null,
        })),
        repMin,
        repMax,
        targetRir,
        restSeconds,
        defaultIncrement: item?.increment || 1,
      };
    });
    const location =
      day.location ||
      (profile.environment === "Home gym" ? "Home" : "Commercial gym");
    const normalizedWorkoutName = normalizeWorkoutName(day.name, day.weekday);
    const titleParts = workoutDisplayParts(normalizedWorkoutName, day.weekday);
    const importedWarmupItems = preserve
      ? (day.warmup?.items || []).slice(0, 12).map((item) => {
          const label = String(item.label || item.name || item.sourceName || "")
            .trim()
            .slice(0, 80);
          const match = matchImportedExerciseName(label);
          return {
            id: uid("warmup-item"),
            exerciseId: match.exerciseId || null,
            label: label || "Warm-up movement",
            sets: Math.max(1, Math.min(10, Number(item.sets) || 1)),
            reps:
              Number(item.reps) > 0
                ? Math.min(100, Number(item.reps))
                : null,
            seconds:
              Number(item.seconds) > 0
                ? Math.min(1800, Number(item.seconds))
                : null,
            minutes: Math.max(1, Math.min(30, Number(item.minutes) || 1)),
            notes: item.notes ? String(item.notes).slice(0, 160) : null,
            provenance: "imported",
          };
        })
      : [];
    return {
      id: uid("program-day"),
      weekday: day.weekday,
      location,
      type: "workout",
      name: normalizedWorkoutName,
      originalImportedWorkoutName: preserve ? normalizedWorkoutName : undefined,
      workoutName: titleParts.detail ? titleParts.primary : undefined,
      workoutDescriptor: titleParts.detail || undefined,
      structureKey: sessionStructureKey(day),
      estimatedMinutes: estimateSessionMinutes(exercises),
      warmupPlan: importedWarmupItems.length
        ? {
            mode: "custom",
            provenance: "imported",
            items: importedWarmupItems,
            rampUpSets: [],
          }
        : undefined,
      exercises,
    };
  });
  const sortedSessions = preserve
    ? normalizedSessions
    : [...normalizedSessions].sort(
        (a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday),
      );
  const days =
    options.repairInterchangeableCompounds === true
      ? removeInterchangeableCompoundDuplicates(sortedSessions)
      : sortedSessions;
  const structuralSelection = preserve
    ? null
    : selectStructuralTemplate(profile, Number(profile.daysPerWeek));
  const parsed = structuralSelection?.parsedPreference;
  const splitPreference = structuralSelection?.preference
    ? {
        id: structuralSelection.preference.id,
        label: structuralSelection.preference.label,
        honored: structuralSelection.preferenceHonored,
        exactFrequencyMatch: structuralSelection.exactFrequencyMatch,
        fidelity: structuralSelection.fidelity,
        fallbackReason: structuralSelection.fallbackReason,
        structureFamily: structuralSelection.structuralFamily,
        userRequestedSequence: structuralSelection.userRequestedSequence,
      }
    : null;
  const trainingStyle =
    parsed &&
    (parsed.structure ||
      parsed.namedProgram ||
      parsed.progression ||
      parsed.periodization ||
      parsed.styleOverlays?.length)
      ? {
          structure: parsed.structure?.id || null,
          styleOverlays: parsed.styleOverlays,
          progression: parsed.progression,
          periodization: parsed.periodization,
          namedProgram: parsed.namedProgram,
          fidelity: structuralSelection.fidelity || parsed.fidelity,
          userRequestedSequence: parsed.userRequestedSequence,
          confidence: parsed.confidence,
          reasonCodes: parsed.reasonCodes,
        }
      : null;
  const program = {
    id: uid("program"),
    name: String(raw.name || "Personalized Plan"),
    goal: profile.goal,
    goalAtCreation: preserve ? null : trainingGoalKey(profile.goal),
    createdAt: new Date().toISOString(),
    version: 1,
    source: "ai",
    profileSnapshot: structuredClone(profile),
    splitPreference,
    trainingStyle,
    trainingStructure: structuralSelection
      ? {
          structureFamily:
            structuralSelection.structuralFamily ||
            structureIdForTemplate(structuralSelection.templateId),
          canonicalSessionSequence:
            structuralSelection.canonicalSessionSequence ||
            sequenceForTemplate(structuralSelection.templateId),
          userRequestedSequence: structuralSelection.userRequestedSequence,
          scheduledSessionSequence: days.map((day) => day.structureKey),
          schedulingFlexibility: structuralSelection.schedulingFlexibility,
          recoveryRelationships: structuralSelection.recoveryRelationships,
          fidelity: structuralSelection.fidelity,
        }
      : null,
    conditioning: preserve ? null : conditioningForProfile(profile),
    days,
  };
  if (!preserve)
    for (const day of program.days)
      normalizeTimedExercises(day.exercises, true);
  const validationProfile = expertReview
    ? null
    : preserve
      ? { ...profile, sessionMinutes: null }
      : profile;
  const result = validateProgram(program, validationProfile, {
    preserveSchedule: preserve || expertReview,
    requireProgramQuality: !preserve && !expertReview,
    allowImportedExercises: preserve,
  });
  if (!result.valid) throw new Error(result.errors.join(" "));
  return program;
}
const rawExerciseName = (value) =>
  value.originalImportedName ||
  value.importedName ||
  value.importedExercise?.name ||
  exerciseCatalog[value.exerciseId]?.name ||
  "Unknown exercise";
export const exerciseName = (value) =>
  splitImportedExerciseLabel(rawExerciseName(value)).name;
export const exerciseNote = (value) => {
  const imported = splitImportedExerciseLabel(rawExerciseName(value));
  return (
    [...new Set([imported.note, value?.notes && String(value.notes)].filter(Boolean))].join(
      " · ",
    ) || null
  );
};
export const EXERCISE_PERSONAL_NOTE_MAX_LENGTH = 120;
export function normalizeExercisePersonalNote(note) {
  const normalized = String(note || "").trim();
  return normalized
    ? normalized.slice(0, EXERCISE_PERSONAL_NOTE_MAX_LENGTH)
    : null;
}
export const exercisePersonalNote = (value) =>
  normalizeExercisePersonalNote(value?.personalNote);

function assignExercisePersonalNote(exercise, note) {
  if (!exercise) return;
  if (note) exercise.personalNote = note;
  else delete exercise.personalNote;
}

export function saveActiveExercisePersonalNote(
  state,
  activeExerciseId,
  note,
) {
  const active = state?.activeWorkout;
  const activeExercise = active?.exercises?.find(
    (exercise) => exercise.id === activeExerciseId,
  );
  if (!activeExercise) return { saved: false, scope: null };

  const normalized = normalizeExercisePersonalNote(note);
  assignExercisePersonalNote(activeExercise, normalized);
  const restartExercise = active.restartSnapshot?.exercises?.find(
    (exercise) => exercise.id === activeExerciseId,
  );
  assignExercisePersonalNote(restartExercise, normalized);

  const programDay = state.program?.days?.find(
    (day) => day.id === active.programDayId,
  );
  const templateExercise = programDay?.exercises?.find(
    (exercise) => exercise.id === activeExerciseId,
  );
  assignExercisePersonalNote(templateExercise, normalized);
  active.updatedAt = Date.now();

  return {
    saved: true,
    scope: templateExercise ? "template" : "workout",
    note: normalized,
  };
}
export function templateForToday(program, date = new Date(), selectedDay) {
  if (!program) return null;
  return (
    program.days.find(
      (day) => day.weekday === (selectedDay || weekday(date)),
    ) || null
  );
}
export function adaptedTemplateForToday(state, date = new Date()) {
  const template = plannedWorkoutForDate(state, date);
  const adaptation = state.todayAdaptation;
  if (
    !template ||
    !adaptation ||
    adaptation.date !== isoDay(date) ||
    adaptation.programDayId !== template.id
  )
    return template;
  const setTargets = new Map(
    (adaptation.setTargets || []).map((item) => [
      item.exerciseId,
      Number(item.sets),
    ]),
  );
  const source = new Map(
    template.exercises.map((exercise) => [exercise.exerciseId, exercise]),
  );
  const exercises = (adaptation.exerciseIds || [])
    .map((exerciseId) => {
      const existing = source.get(exerciseId);
      const base = existing
        ? structuredClone(existing)
        : exerciseCatalog[exerciseId] &&
            isExerciseAllowed(exerciseCatalog[exerciseId], state.profile)
          ? makeProgramExercise(exerciseCatalog[exerciseId], state.profile, {
              role:
                exerciseCatalog[exerciseId].kind === "compound"
                  ? "main"
                  : "accessory",
            })
          : null;
      if (!base) return null;
      const requestedSets = setTargets.get(exerciseId);
      if (Number.isFinite(requestedSets))
        base.sets = base.sets.slice(
          0,
          Math.max(1, Math.min(base.sets.length, requestedSets)),
        );
      return base;
    })
    .filter(Boolean);
  return exercises.length
    ? {
        ...structuredClone(template),
        adapted: true,
        estimatedMinutes:
          Number(adaptation.estimatedMinutes) ||
          estimateSessionMinutes(exercises),
        exercises,
      }
    : template;
}
export function optionalStrengthForDate(state, date = new Date()) {
  return (
    (state.optionalSessions || []).find(
      (session) =>
        session.kind === "Strength" &&
        session.status === "planned" &&
        session.date === isoDay(date) &&
        Array.isArray(session.workout?.exercises),
    )?.workout || null
  );
}
export function previousExercise(workouts, exerciseId) {
  for (const workout of [...workouts].reverse()) {
    const found = workout.exercises.find(
      (item) =>
        item.exerciseId === exerciseId &&
        item.sets.some((set) => set.completed),
    );
    if (found) return found;
  }
  return null;
}
export function warmupForWorkout(workout, profile, program = null) {
  const warmupPlan = workout?.warmupPlan;
  if (warmupPlan?.mode === "none") return null;
  if (warmupPlan?.mode === "custom")
    return customWarmupForWorkout(workout, warmupPlan);
  return generateWarmup(workout, profile, exerciseCatalog, {
    includeRecommendedWarmups:
      program?.includeRecommendedWarmups ??
      profile?.recommendedWarmupsEnabled !== false,
    includeRampUpSets: profile?.rampUpSetsEnabled !== false,
  });
}
function customWarmupMovementLabel(item) {
  const name = String(item?.label || item?.name || "Warm-up movement").trim();
  const sets = Math.max(1, Number(item?.sets) || 1);
  if (Number(item?.seconds) > 0)
    return `${name} · ${sets} × ${Number(item.seconds)} sec`;
  if (Number(item?.reps) > 0)
    return `${name} · ${sets} × ${Number(item.reps)}`;
  return name;
}
function customWarmupForWorkout(workout, plan) {
  const general = (plan.items || []).map((item, index) => ({
    id: item.id || `custom-warmup-${index}`,
    label: customWarmupMovementLabel(item),
    minutes: Math.max(1, Number(item.minutes) || 1),
    custom: true,
    completed: false,
  }));
  const rampUpSets = (plan.rampUpSets || [])
    .map((entry, index) => {
      const exerciseIndex = (workout.exercises || []).findIndex(
        (exercise) => exercise.id === entry.targetExerciseEntryId,
      );
      if (exerciseIndex < 0) return null;
      const exercise = workout.exercises[exerciseIndex];
      const item = exerciseCatalog[exercise.exerciseId];
      return {
        exerciseId: exercise.exerciseId,
        exerciseInstanceId: exercise.id,
        exerciseIndex,
        exerciseName: exerciseName(exercise),
        movementFamily: item?.pattern || null,
        sets: (entry.sets || []).map((set, setIndex) => ({
          id: set.id || `custom-ramp-${index}-${setIndex}`,
          reps: Math.max(1, Number(set.reps) || 1),
          loadPercent:
            set.loadKind === "percent_working" ? Number(set.loadValue) : null,
          weight:
            set.loadKind === "absolute" ? Number(set.loadValue) : null,
          loadInstruction:
            set.loadKind === "instruction" ? set.loadInstruction : null,
          completed: false,
        })),
      };
    })
    .filter((entry) => entry?.sets.length);
  const stageIndexes = new Set([
    ...(general.length && workout.exercises?.length ? [0] : []),
    ...rampUpSets.map((entry) => entry.exerciseIndex),
  ]);
  const stages = [...stageIndexes]
    .sort((a, b) => a - b)
    .map((exerciseIndex) => {
      const exercise = workout.exercises[exerciseIndex];
      const ramps = rampUpSets.filter(
        (entry) => entry.exerciseIndex === exerciseIndex,
      );
      return {
        id: `custom-warmup-stage-${exercise.id}`,
        exerciseId: exercise.exerciseId,
        exerciseInstanceId: exercise.id,
        exerciseIndex,
        exerciseName: exerciseName(exercise),
        general: exerciseIndex === 0 ? general : [],
        movementPreparation: [],
        rampUpSets: ramps,
        estimatedMinutes: Math.max(
          1,
          (exerciseIndex === 0
            ? general.reduce((sum, item) => sum + item.minutes, 0)
            : 0) + Math.ceil(ramps.reduce((sum, entry) => sum + entry.sets.length, 0) * 0.5),
        ),
        completed: false,
        skipped: false,
      };
    });
  if (!stages.length) return null;
  return {
    generatorVersion: 3,
    source: "custom",
    general,
    movementPreparation: [],
    rampUpSets,
    stages,
    nonRampMinutes: general.reduce((sum, item) => sum + item.minutes, 0),
    estimatedMinutes: stages.reduce((sum, stage) => sum + stage.estimatedMinutes, 0),
    safetyMessage: null,
    conservative: false,
    skipped: false,
  };
}
export function materializeWarmupPlan(workout, profile, program = null) {
  const generated = generateWarmup(workout, profile, exerciseCatalog, {
    includeRecommendedWarmups:
      program?.includeRecommendedWarmups ??
      profile?.recommendedWarmupsEnabled !== false,
    includeRampUpSets: profile?.rampUpSetsEnabled !== false,
  });
  return {
    mode: "custom",
    provenance: "generated-materialized",
    items: [
      ...(generated?.general || []),
      ...(generated?.movementPreparation || []),
    ].map((item) => ({
      id: uid("warmup-item"),
      exerciseId: item.exerciseId || null,
      label: item.label,
      minutes: Math.max(1, Number(item.minutes) || 1),
      sets: null,
      reps: null,
      seconds: null,
      provenance: "generated-materialized",
    })),
    rampUpSets: (generated?.rampUpSets || []).map((entry) => ({
      id: uid("warmup-ramp"),
      targetExerciseEntryId: entry.exerciseInstanceId,
      provenance: "generated-materialized",
      sets: entry.sets.map((set) => ({
        id: uid("warmup-ramp-set"),
        reps: set.reps,
        loadKind: set.loadInstruction ? "instruction" : "percent_working",
        loadValue: set.loadInstruction ? null : set.loadPercent,
        loadInstruction: set.loadInstruction || null,
      })),
    })),
  };
}
export function refreshWorkoutWarmup(workout, profile, program = null) {
  if (!workout) return workout;
  const previous = workout.warmup;
  const next = warmupForWorkout(workout, profile, program);
  if (next) {
    const previousStages = previous?.stages || [];
    const previousRampSets = new Map(
      (previous?.rampUpSets || []).flatMap((entry) =>
        (entry.sets || []).map((set) => [set.id, Boolean(set.completed)]),
      ),
    );
    const previousItems = new Map(
      (previous?.stages || []).flatMap((stage) =>
        [...(stage.general || []), ...(stage.movementPreparation || [])].map(
          (item) => [item.id, Boolean(item.completed)],
        ),
      ),
    );
    for (const stage of next.stages || []) {
      const priorStage = previousStages.find((item) => item.id === stage.id);
      if (priorStage) {
        stage.completed = Boolean(priorStage.completed);
        stage.skipped = Boolean(priorStage.skipped);
      } else if (stage.exerciseIndex === 0 && !previousStages.length) {
        stage.completed = Boolean(previous?.completed);
        stage.skipped = Boolean(previous?.skipped);
      }
      for (const entry of stage.rampUpSets || [])
        for (const set of entry.sets || [])
          if (previousRampSets.has(set.id))
            set.completed = previousRampSets.get(set.id);
      for (const item of [
        ...(stage.general || []),
        ...(stage.movementPreparation || []),
      ])
        if (previousItems.has(item.id))
          item.completed = previousItems.get(item.id);
    }
  }
  workout.warmup = next;
  return workout;
}
export function startWorkout(state, template) {
  if (state.activeWorkout)
    throw new Error("A workout is already in progress. Resume or finish it first.");
  const supersetErrors = validateSupersetExercises(template?.exercises || []);
  if (supersetErrors.length) throw new Error(supersetErrors[0]);
  const trainingSafety = compileProfileTrainingSafety(
    state.profile,
    Object.values(exerciseCatalog),
  );
  if (trainingSafetyBlocks(trainingSafety.status))
    throw new Error(trainingSafety.message || "Training restrictions need review.");
  const effortConflict = (template.exercises || []).find((exercise) => {
    const minimumRir =
      trainingSafety.constraints.minRirByExerciseId?.[exercise.exerciseId];
    return Number.isFinite(minimumRir) && Number(exercise.targetRir) < minimumRir;
  });
  if (effortConflict) {
    const item = exerciseCatalog[effortConflict.exerciseId];
    const minimumRir =
      trainingSafety.constraints.minRirByExerciseId[effortConflict.exerciseId];
    throw new Error(
      `${item?.name || "This exercise"} must stay at least ${minimumRir} reps in reserve because of the current training restrictions.`,
    );
  }
  const prohibited = (template.exercises || []).find((exercise) => {
    const item = exerciseCatalog[exercise.exerciseId];
    return item && !exerciseAllowedByTrainingSafety(item, trainingSafety);
  });
  if (prohibited)
    throw new Error(
      `${exerciseName(prohibited)} conflicts with the current training restrictions.`,
    );
  const startedAt = Date.now();
  const canonicalPlanDate = state.selectedDate || isoDay(startedAt);
  const workout = {
    id: uid("active"),
    templateId: template.weekday,
    programDayId: template.id,
    canonicalPlanDate,
    workoutDateKey: canonicalPlanDate,
    sourcePlanSlotId: template.id
      ? `${template.id}:${canonicalPlanDate}`
      : null,
    optionalSessionId: template.optionalSessionId || null,
    name: template.name,
    workoutName: template.workoutName,
    workoutDescriptor: template.workoutDescriptor,
    originalImportedWorkoutName: template.originalImportedWorkoutName,
    startedAt,
    updatedAt: startedAt,
    timeZoneAtStart:
      Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    utcOffsetMinutesAtStart: new Date(startedAt).getTimezoneOffset(),
    exerciseIndex: 0,
    rest: null,
    handledSupersetRestRounds: [],
    adapted: Boolean(template.optionalSessionId),
    warmupPlan: template.warmupPlan
      ? structuredClone(template.warmupPlan)
      : { mode: "auto" },
    exercises: template.exercises.map((base) => {
      const previous = previousExercise(state.workouts, base.exerciseId);
      const completedPreviousSets =
        previous?.sets.filter((set) => set.completed) || [];
      return {
        ...structuredClone(base),
        sets: base.sets.map((set, index) => {
          const previousSet = completedPreviousSets[index];
          const weight = previousSet?.weight ?? set.weight ?? null;
          return {
            ...set,
            id: uid("set"),
            planned: true,
            added: false,
            completed: false,
            weight,
            weightProvenance:
              Number(previousSet?.weight) > 0
                ? "history"
                : Number(weight) > 0
                  ? set.weightProvenance || "explicit-plan"
                  : null,
            reps: previousSet?.reps ?? base.repMin,
            rir: null,
          };
        }),
      };
    }),
  };
  const prepared = refreshWorkoutWarmup(workout, state.profile, state.program);
  prepared.restartSnapshot = {
    exercises: structuredClone(prepared.exercises),
    warmup: prepared.warmup ? structuredClone(prepared.warmup) : null,
  };
  return prepared;
}
export function activeWorkoutCanRestart(workout) {
  const snapshot = workout?.restartSnapshot;
  if (!snapshot || !Array.isArray(snapshot.exercises)) return false;
  if (Number(workout.exerciseIndex || 0) !== 0 || workout.rest) return true;
  return (
    JSON.stringify(workout.exercises) !== JSON.stringify(snapshot.exercises) ||
    JSON.stringify(workout.warmup || null) !==
      JSON.stringify(snapshot.warmup || null)
  );
}
export function restartActiveWorkout(state, restartedAt = Date.now()) {
  const active = state.activeWorkout;
  if (!activeWorkoutCanRestart(active)) return state;
  const snapshot = active.restartSnapshot;
  return {
    ...state,
    activeWorkout: {
      ...active,
      startedAt: restartedAt,
      updatedAt: restartedAt,
      exerciseIndex: 0,
      rest: null,
      handledSupersetRestRounds: [],
      exercises: structuredClone(snapshot.exercises),
      warmup: snapshot.warmup ? structuredClone(snapshot.warmup) : null,
    },
  };
}

export function completedWorkoutCanResume(state, workoutId) {
  if (state?.activeWorkout || !workoutId) return false;
  const workout = (state.workouts || []).find((item) => item.id === workoutId);
  if (
    !workout ||
    !Array.isArray(workout.exercises) ||
    workoutSetSummary(workout).completed !== 0
  )
    return false;
  return !(state.workoutCorrections || []).some(
    (item) =>
      item?.type === "resume-empty-completion" &&
      item.targetCompletedWorkoutId === workoutId,
  );
}

export function resumeCompletedWorkout(
  state,
  workoutId,
  resumedAt = Date.now(),
  operationId = `resume:${workoutId}`,
) {
  const existing = (state.workoutCorrections || []).find(
    (item) =>
      item?.type === "resume-empty-completion" &&
      (item.operationId === operationId ||
        item.targetCompletedWorkoutId === workoutId),
  );
  if (existing) return state;
  if (!completedWorkoutCanResume(state, workoutId)) return state;
  const workoutIndex = state.workouts.findIndex(
    (item) => item.id === workoutId,
  );
  const completed = state.workouts[workoutIndex];
  const elapsedSeconds = Math.max(0, Number(completed.durationSeconds) || 0);
  const replacementId = uid("active");
  const frozen = structuredClone(completed);
  const active = structuredClone(completed);
  for (const key of [
    "completedAt",
    "endedAt",
    "durationSeconds",
    "status",
    "endedEarly",
    "plannedSetCount",
    "completedPlannedSetCount",
    "completedSetCount",
    "supersedesCompletionId",
  ])
    delete active[key];
  active.id = replacementId;
  active.startedAt = resumedAt - elapsedSeconds * 1000;
  active.updatedAt = resumedAt;
  active.resumedAt = resumedAt;
  active.resumedFromCompletionId = completed.id;
  active.resumeOperationId = operationId;
  active.exerciseIndex = Math.max(
    0,
    active.exercises.findIndex((exercise) =>
      (exercise.sets || []).some((set) => !set.completed),
    ),
  );
  active.rest = null;
  active.handledSupersetRestRounds = [];
  active.restartSnapshot = {
    exercises: structuredClone(active.exercises),
    warmup: active.warmup ? structuredClone(active.warmup) : null,
  };
  const correction = {
    id: uid("workout-correction"),
    type: "resume-empty-completion",
    targetCompletedWorkoutId: completed.id,
    replacementActiveWorkoutId: replacementId,
    operationId,
    createdAt: new Date(resumedAt).toISOString(),
    completedWorkout: frozen,
  };
  const optionalSessions = (state.optionalSessions || []).map((optional) =>
    optional.id === active.optionalSessionId
      ? { ...optional, status: "active", completedAt: null }
      : optional,
  );
  return {
    ...state,
    activeWorkout: active,
    optionalSessions,
    selectedDay: active.templateId || state.selectedDay,
    selectedDate: workoutPlanDate(active) || state.selectedDate,
    workouts: state.workouts.filter((_, index) => index !== workoutIndex),
    workoutCorrections: [...(state.workoutCorrections || []), correction],
  };
}
export function progressionFor(exercise, history, profile = null) {
  const min = exercise.repMin ?? exercise.repRange?.[0];
  const max = exercise.repMax ?? exercise.repRange?.[1];
  const timed = exerciseMeasure(exercise) === "seconds";
  const catalogItem = exerciseCatalog[exercise.exerciseId];
  const loadRequirement = exerciseLoadRequirement(exercise);
  const appearances = (history || [])
    .map((workout, index) => ({
      workout,
      index,
      item: workout.exercises?.find(
        (item) => item.exerciseId === exercise.exerciseId,
      ),
    }))
    .filter((entry) => entry.item);
  const observations = appearances
    .map((entry) => {
      const planned = (entry.item.sets || []).filter(
        (set) => set.planned !== false && !set.added,
      );
      const completed = planned.filter(
        (set) => set.completed && Number.isFinite(Number(set.reps)),
      );
      const complete =
        planned.length > 0 && completed.length === planned.length;
      const loads = completed.map((set) =>
        set.weight === null ||
        set.weight === undefined ||
        !Number.isFinite(Number(set.weight))
          ? null
          : Number(set.weight),
      );
      const hasLoad =
        loads.length > 0 && loads.every((value) => value !== null);
      const loadKey = hasLoad ? loads.join("|") : null;
      const effortOkay = completed.every(
        (set) =>
          set.rir === null ||
          set.rir === undefined ||
          exercise.targetRir === null ||
          exercise.targetRir === undefined ||
          Number(set.rir) >= Number(exercise.targetRir),
      );
      return {
        ...entry,
        planned,
        completed,
        complete,
        hasLoad,
        loadKey,
        weight: hasLoad ? loads[0] : null,
        allAtTop: complete && completed.every((set) => Number(set.reps) >= max),
        anyBelowMin:
          complete && completed.some((set) => Number(set.reps) < min),
        topReps: completed.length
          ? Math.max(...completed.map((set) => Number(set.reps)))
          : null,
        effortOkay,
        date: new Date(
          entry.workout.completedAt || entry.workout.endedAt || NaN,
        ),
      };
    })
    .filter((entry) => entry.completed.length);
  if (!observations.length) return null;
  const latest = observations.at(-1);
  if (!latest.complete) return null;
  const structurallyComparable = observations.filter(
    (entry) => entry.complete && entry.planned.length === latest.planned.length,
  );
  const comparable = structurallyComparable.filter((entry) => {
    if (loadRequirement === "none") return true;
    if (loadRequirement === "optional" && !latest.hasLoad)
      return !entry.hasLoad;
    return entry.loadKey !== null && entry.loadKey === latest.loadKey;
  });
  const previous = comparable.at(-2);
  const previousWithoutLoad = structurallyComparable
    .filter((entry) => !entry.hasLoad)
    .at(-2);
  if (
    loadRequirement === "required" &&
    !latest.hasLoad &&
    previousWithoutLoad &&
    latest.allAtTop &&
    previousWithoutLoad.allAtTop
  )
    return {
      type: "hold",
      title: "Log a working load first",
      detail:
        "The rep target was reached twice, but no external load was logged. Keep the prescription and record the load before increasing it.",
    };
  if (previous && latest.anyBelowMin && previous.anyBelowMin)
    return {
      type: "hold",
      title: timed ? "Reduce the hold target slightly" : "Review the load",
      detail: timed
        ? `Two comparable sessions stayed below ${min} seconds. Use a slightly easier variation and rebuild.`
        : `Two comparable sessions stayed below ${min} reps. Consider a small load reduction, then rebuild with stable form.`,
    };
  if (
    previous &&
    latest.allAtTop &&
    previous.allAtTop &&
    latest.effortOkay &&
    previous.effortOkay
  ) {
    if (loadRequirement === "required" && !latest.hasLoad)
      return {
        type: "hold",
        title: "Log a working load first",
        detail:
          "The target was reached, but no external load was logged. Keep the prescription and record the load before increasing it.",
      };
    if (timed)
      return {
        type: "progress",
        title: "Ready to progress",
        detail: `Two complete sessions reached ${max} seconds. Increase the hold gradually.`,
        evidenceExposures: 2,
      };
    if (loadRequirement !== "required" && !latest.hasLoad)
      return {
        type: "progress",
        title: "Ready for a harder variation",
        detail:
          loadRequirement === "none" &&
          catalogItem?.equipment?.includes("resistance bands")
            ? "Two complete sessions reached the top of the range. Increase band resistance or progress the variation gradually."
            : `Two complete sessions reached ${max} reps at the target effort. Progress the variation gradually.`,
        evidenceExposures: 2,
      };
    if (!latest.hasLoad)
      return {
        type: "hold",
        title: "Log a working load first",
        detail:
          "The rep target was reached, but no external load was logged. Keep the prescription and record the load before increasing it.",
      };
    const equipmentKey = catalogItem?.equipment?.find((value) =>
      Object.hasOwn(profile?.increments || {}, value),
    );
    const increment = Number(
      profile?.increments?.[equipmentKey] ||
        exercise.defaultIncrement ||
        exercise.increment,
    );
    const lowerPattern = [
      "squat",
      "hinge",
      "single-leg",
      "knee-flexion",
      "hip-extension",
      "calf",
    ].includes(catalogItem?.pattern);
    const jumpLimit = lowerPattern ? 0.1 : 0.075;
    if (
      !(increment > 0) ||
      increment / Math.max(latest.weight, 0.01) > jumpLimit
    )
      return {
        type: "hold",
        title: "Use a smaller increment",
        detail: `Two sessions reached the top of the range, but the available ${increment || "next"} kg jump is too large for this load. Keep building or choose a smaller real increment.`,
      };
    return {
      type: "progress",
      title: "Ready to progress",
      detail: `Two complete sessions reached ${max} reps at the target effort.`,
      weight: Number((latest.weight + increment).toFixed(2)),
      evidenceExposures: 2,
    };
  }
  const completeRecent = observations.filter((entry) => entry.complete);
  const plateauWindow = completeRecent.slice(
    -Math.max(4, completeRecent.length >= 6 ? 6 : 4),
  );
  const firstDate = plateauWindow[0]?.date;
  const lastDate = plateauWindow.at(-1)?.date;
  const spanDays =
    firstDate &&
    lastDate &&
    Number.isFinite(firstDate.getTime()) &&
    Number.isFinite(lastDate.getTime())
      ? (lastDate - firstDate) / 86400000
      : 0;
  const adherence = appearances.length
    ? completeRecent.length / appearances.length
    : 0;
  if (
    plateauWindow.length >= 4 &&
    adherence >= 0.8 &&
    (plateauWindow.length >= 6 || spanDays >= 14)
  ) {
    const first = plateauWindow[0];
    const noLoadGain = plateauWindow.every(
      (entry) =>
        entry.weight === null ||
        first.weight === null ||
        entry.weight <= first.weight,
    );
    const noRepGain = plateauWindow.every(
      (entry) => entry.topReps <= first.topReps,
    );
    if (noLoadGain && noRepGain)
      return {
        type: "stalled",
        title: "Progress has slowed",
        detail:
          "At least four comparable complete exposures across two weeks show no rep or load gain. Review recovery or use a small exercise adjustment.",
      };
  }
  return null;
}
export function workoutSetSummary(workout) {
  const sets =
    workout?.exercises?.flatMap((exercise) => exercise.sets || []) || [];
  const planned = sets.filter((set) => set.planned !== false && !set.added);
  const completed = sets.filter((set) => set.completed);
  return {
    total: sets.length,
    planned: planned.length,
    completedPlanned: planned.filter((set) => set.completed).length,
    completed: completed.length,
    extras: sets.filter((set) => set.added).length,
  };
}
function exerciseObservation(exercise) {
  const completed = (exercise?.sets || []).filter(
    (set) => set.completed && Number.isFinite(Number(set.reps)),
  );
  if (!completed.length) return null;
  const weighted = completed.filter(
    (set) =>
      set.weight !== null &&
      set.weight !== undefined &&
      Number.isFinite(Number(set.weight)),
  );
  if (!weighted.length)
    return {
      weight: null,
      reps: Math.max(...completed.map((set) => Number(set.reps))),
    };
  const weight = Math.max(...weighted.map((set) => Number(set.weight)));
  return {
    weight,
    reps: Math.max(
      ...weighted
        .filter((set) => Number(set.weight) === weight)
        .map((set) => Number(set.reps)),
    ),
  };
}
export function recentExerciseProgress(workouts) {
  const histories = new Map();
  for (const workout of workouts || [])
    for (const exercise of workout.exercises || []) {
      const observation = exerciseObservation(exercise);
      if (!observation) continue;
      const key = exercise.exerciseId;
      if (!histories.has(key)) histories.set(key, []);
      histories
        .get(key)
        .push({ ...observation, exercise, completedAt: workout.completedAt });
    }
  const results = [];
  for (const [exerciseId, values] of histories) {
    if (values.length < 2) continue;
    const previous = values.at(-2);
    const latest = values.at(-1);
    let result = null;
    if (
      latest.weight !== null &&
      previous.weight !== null &&
      latest.weight > previous.weight
    )
      result = {
        type: "weight",
        deltaWeight: Number((latest.weight - previous.weight).toFixed(2)),
        weight: latest.weight,
        reps: latest.reps,
      };
    else if (latest.weight === previous.weight && latest.reps > previous.reps)
      result = {
        type: "reps",
        deltaReps: latest.reps - previous.reps,
        weight: latest.weight,
        reps: latest.reps,
      };
    if (result)
      results.push({
        exerciseId,
        exercise: latest.exercise,
        completedAt: latest.completedAt,
        ...result,
      });
  }
  return results.sort(
    (a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0),
  );
}
export function possibleFatigueSignal(workouts) {
  const observations = new Map();
  for (const workout of workouts || [])
    for (const exercise of workout.exercises || []) {
      const item = exerciseCatalog[exercise.exerciseId];
      if (item?.stability !== "high") continue;
      const observation = exerciseObservation(exercise);
      if (!observation) continue;
      if (!observations.has(exercise.exerciseId))
        observations.set(exercise.exerciseId, []);
      observations
        .get(exercise.exerciseId)
        .push({ ...observation, completedAt: workout.completedAt });
    }
  const decliningExerciseIds = [...observations.entries()]
    .filter(([, values]) => {
      if (values.length < 2) return false;
      const previous = values.at(-2);
      const latest = values.at(-1);
      return latest.weight !== null && previous.weight !== null
        ? latest.weight < previous.weight ||
            (latest.weight === previous.weight && latest.reps < previous.reps)
        : latest.reps < previous.reps;
    })
    .map(([exerciseId]) => exerciseId);
  return decliningExerciseIds.length >= 2
    ? {
        type: "possible-fatigue",
        decliningExerciseIds,
        message:
          "Performance declined across at least two stable exercises. This may reflect short-term fatigue; review sleep, stress and recovery before changing the program.",
      }
    : null;
}
export const SESSION_NOTE_MAX_LENGTH = 500;
export function normalizeSessionNote(value) {
  const note = String(value || "").trim();
  return note ? note.slice(0, SESSION_NOTE_MAX_LENGTH) : null;
}
export function completeWorkout(state) {
  if (!state.activeWorkout) return state;
  const endedAt = Date.now();
  const summary = workoutSetSummary(state.activeWorkout);
  const endedEarly = summary.completed < summary.total;
  const completedActiveWorkout = structuredClone(state.activeWorkout);
  delete completedActiveWorkout.restartSnapshot;
  const session = {
    ...completedActiveWorkout,
    id: uid("workout"),
    endedAt,
    durationSeconds: Math.max(
      1,
      Math.round((endedAt - state.activeWorkout.startedAt) / 1000),
    ),
    completedAt: new Date().toISOString(),
    status: endedEarly ? "ended-early" : "completed",
    endedEarly,
    plannedSetCount: summary.planned,
    completedPlannedSetCount: summary.completedPlanned,
    completedSetCount: summary.completed,
    ...(state.activeWorkout.resumedFromCompletionId
      ? { supersedesCompletionId: state.activeWorkout.resumedFromCompletionId }
      : {}),
  };
  const optionalSessions = (state.optionalSessions || []).map((optional) =>
    optional.id === state.activeWorkout.optionalSessionId
      ? { ...optional, status: "completed", completedAt: session.completedAt }
      : optional,
  );
  return {
    ...state,
    activeWorkout: null,
    optionalSessions,
    workouts: [...state.workouts, session],
  };
}
export function optionalSessionElapsedSeconds(session, now = Date.now()) {
  if (!session) return 0;
  const accumulated = Math.max(
    0,
    Number(session.accumulatedSeconds) || 0,
  );
  if (session.status !== "active") return accumulated;
  const runningSince = Number(session.runningSince ?? session.startedAt);
  if (!Number.isFinite(runningSince)) return accumulated;
  return accumulated + Math.max(0, Number(now) - runningSince) / 1000;
}
export function startOptionalSession(
  state,
  {
    date = isoDay(),
    kind,
    activity,
    duration,
    intensity = "Easy",
  },
  now = Date.now(),
) {
  if (
    state.activeWorkout ||
    state.activeOptionalSession ||
    date !== isoDay(new Date(now)) ||
    !["Cardio", "Mobility"].includes(kind)
  )
    return state;
  const targetMinutes = Math.max(
    1,
    Math.min(180, Math.round(Number(duration) || 15)),
  );
  return {
    ...state,
    activeOptionalSession: {
      id: uid("optional-session"),
      date,
      kind,
      activity: String(
        activity || (kind === "Cardio" ? "Light cardio" : "Mobility / recovery"),
      ).slice(0, 60),
      duration: targetMinutes,
      intensity: kind === "Cardio" ? String(intensity || "Easy") : "Easy",
      status: "active",
      startedAt: Number(now),
      runningSince: Number(now),
      accumulatedSeconds: 0,
    },
  };
}
export function pauseOptionalSession(state, now = Date.now()) {
  const session = state.activeOptionalSession;
  if (!session || session.status !== "active") return state;
  return {
    ...state,
    activeOptionalSession: {
      ...session,
      status: "paused",
      accumulatedSeconds: optionalSessionElapsedSeconds(session, now),
      runningSince: null,
      pausedAt: Number(now),
    },
  };
}
export function resumeOptionalSession(state, now = Date.now()) {
  const session = state.activeOptionalSession;
  if (!session || session.status !== "paused" || state.activeWorkout)
    return state;
  return {
    ...state,
    activeOptionalSession: {
      ...session,
      status: "active",
      runningSince: Number(now),
      resumedAt: Number(now),
    },
  };
}
export function finishOptionalSession(state, now = Date.now()) {
  const session = state.activeOptionalSession;
  if (!session || !["active", "paused"].includes(session.status)) return state;
  const completed = {
    ...session,
    status: "completed",
    elapsedSeconds: Math.max(
      0,
      Math.round(optionalSessionElapsedSeconds(session, now)),
    ),
    completedAt: new Date(now).toISOString(),
    runningSince: null,
  };
  delete completed.pausedAt;
  return {
    ...state,
    activeOptionalSession: null,
    optionalSessions: [
      ...(state.optionalSessions || []).filter((item) => item.id !== session.id),
      completed,
    ],
  };
}
export function cancelOptionalSession(state, now = Date.now()) {
  if (!state.activeOptionalSession) return state;
  return {
    ...state,
    activeOptionalSession: null,
  };
}
function replacementMetadata(source) {
  if (typeof source === "string") return exerciseCatalog[source] || null;
  if (!source) return null;
  return (
    exerciseCatalog[source.exerciseId] ||
    (source.importedExercise?.pattern
      ? source.importedExercise
      : source.pattern
        ? source
        : null)
  );
}
export function compatibleReplacementCandidates(
  source,
  profile,
  programExerciseIds = [],
) {
  const current = replacementMetadata(source);
  if (!current?.pattern) return [];
  const primaryMuscle = current.muscles?.[0] || null;
  const sourceId = typeof source === "string" ? source : source.exerciseId;
  const eligible = Object.values(exerciseCatalog).filter(
    (item) =>
      item.id !== sourceId &&
      item.pattern === current.pattern &&
      (!primaryMuscle || item.muscles?.includes(primaryMuscle)) &&
      isExerciseAutoGeneratable(item, profile) &&
      (profile.experience !== "Beginner" || item.technicalDifficulty <= 2),
  );
  const externallyLoadable = eligible.filter(
    (item) =>
      !item.bodyweight && item.progressionQuality === "load-and-repetition",
  );
  return (externallyLoadable.length ? externallyLoadable : eligible).sort(
    (a, b) => {
      const score = (item) =>
        (item.muscles?.[0] === primaryMuscle ? 6 : 0) +
        (item.kind === current.kind ? 3 : 0) +
        (item.stability === current.stability ? 2 : 0) +
        (item.progressionQuality === "load-and-repetition" ? 2 : 0) +
        (profile.goal === "Build muscle" && item.stability === "high" ? 2 : 0) +
        (profile.goal === "Get stronger" && item.equipment.includes("barbell")
          ? 2
          : 0) +
        (profile.exercisePreference === "Prefer free weights" &&
        item.equipment.some((value) => ["barbell", "dumbbells"].includes(value))
          ? 2
          : 0) +
        (profile.exercisePreference === "Prefer machines" &&
        item.equipment.some((value) => ["machines", "cables"].includes(value))
          ? 2
          : 0) -
        (item.fatigueCost === "high" && current.fatigueCost !== "high"
          ? 2
          : 0) -
        (programExerciseIds.includes(item.id) ? 4 : 0);
      return score(b) - score(a) || a.name.localeCompare(b.name);
    },
  );
}
export function userSelectableReplacementCandidates(
  source,
  profile,
  excludedExerciseIds = [],
) {
  const sourceId = typeof source === "string" ? source : source?.exerciseId;
  const excluded = new Set(excludedExerciseIds);
  return Object.values(exerciseCatalog)
    .filter(
      (item) =>
        item.id !== sourceId &&
        !excluded.has(item.id) &&
        isExerciseAllowed(item, profile),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function replacementCandidates(
  source,
  profile,
  programExerciseIds = [],
) {
  return compatibleReplacementCandidates(
    source,
    profile,
    programExerciseIds,
  ).slice(0, 4);
}
export function missedPlannedWorkouts(state, date = new Date()) {
  if (!state.program) return [];
  const created = isoDay(state.program.createdAt);
  const result = [];
  for (let offset = 1; offset <= 14; offset++) {
    const candidate = new Date(date);
    candidate.setHours(12, 0, 0, 0);
    candidate.setDate(candidate.getDate() - offset);
    if (isoDay(candidate) < created) continue;
    const planned = plannedWorkoutForDate(state, candidate);
    if (!planned) continue;
    const completed = state.workouts.some(
      (workout) =>
        (workout.programDayId === planned.id ||
          (!workout.programDayId && workout.templateId === planned.weekday)) &&
        workoutPlanDate(workout) === isoDay(candidate),
    );
    if (!completed)
      result.push({
        date: isoDay(candidate),
        weekday: planned.weekday,
        workoutName: planned.name,
      });
  }
  return result;
}
export function coachContext(state) {
  const scheduledToday =
    adaptedTemplateForToday(state) || optionalStrengthForDate(state);
  const today = state.activeWorkout || scheduledToday;
  const currentDate = isoDay();
  const uniqueExercises = Object.values(
    (state.program?.days || [])
      .flatMap((day) => day.exercises)
      .reduce((map, item) => ({ ...map, [item.exerciseId]: item }), {}),
  );
  return {
    currentDate,
    currentWeekday: weekday(),
    todayStatus: {
      date: currentDate,
      weekday: weekday(),
      type: state.activeWorkout
        ? "active-workout"
        : scheduledToday
          ? "planned-workout"
          : "rest-day",
      workoutId: today?.programDayId || today?.id || null,
      workoutName: today?.name || null,
    },
    profile: {
      name: state.profile.name,
      ageRange: state.profile.ageRange,
      sex: state.profile.sex,
      goal: state.profile.goal,
      experience: state.profile.experience,
      availableDays: state.profile.availableDays,
      sessionMinutes: state.profile.sessionMinutes,
      environment: state.profile.environment,
      equipment: state.profile.equipment,
      priorities: state.profile.priorities,
      confirmedPhysiquePriorities: confirmedPhysiquePriorities(
        state.profile,
      ).map((item) => ({
        priorityId: item.priorityId,
        label: PHYSIQUE_PRIORITY_OPTIONS[item.priorityId].label,
      })),
      avoid: state.profile.avoid,
      trainingPreferences: state.profile.trainingPreferences,
      exercisePreference: state.profile.exercisePreference,
      effortStyle: state.profile.effortStyle,
      followUpAnswers: state.profile.followUpAnswers,
    },
    program: state.program
      ? {
          id: state.program.id,
          name: state.program.name,
          goal: state.program.goal,
          source: state.program.source || null,
          version: Number(state.program.version || 1),
          days: state.program.days.map((day) => ({
            id: day.id,
            weekday: day.weekday,
            name: day.name,
            estimatedMinutes: day.estimatedMinutes,
            exercises: day.exercises.map((item) => ({
              exerciseEntryId: item.id,
              exerciseId: item.exerciseId,
              name: exerciseName(item),
              target: [item.repMin, item.repMax],
              sets: item.sets.length,
            })),
          })),
        }
      : null,
    availableExercises: Object.values(exerciseCatalog)
      .filter((item) => isExerciseAutoGeneratable(item, state.profile))
      .map((item) => ({
        exerciseId: item.id,
        name: item.name,
        pattern: item.pattern,
        muscles: item.muscles,
        kind: item.kind,
        fatigueCost: item.fatigueCost,
        stability: item.stability,
      })),
    currentWeekSchedule: currentWeekSchedule(state).map((item) => ({
      workoutId: item.workoutId,
      name: item.workout.name,
      originalDate: item.originalDate,
      scheduledDate: item.scheduledDate,
      moved: item.moved,
      focus: sessionFocus(item.workout),
      completed: state.workouts.some(
        (workout) =>
          workout.completedAt &&
          workout.programDayId === item.workoutId &&
          weekKey(workoutPlanDate(workout)) === weekKey(),
      ),
      active: state.activeWorkout?.programDayId === item.workoutId,
    })),
    today: today
      ? {
          id: today.id,
          name: today.name,
          estimatedMinutes:
            today.estimatedMinutes || estimateSessionMinutes(today.exercises),
          exercises: today.exercises.map((item) => ({
            exerciseId: item.exerciseId,
            name: exerciseName(item),
            sets: item.sets,
          })),
        }
      : null,
    recentWorkouts: state.workouts.slice(-8).map((workout) => ({
      id: workout.id,
      planDate: workoutPlanDate(workout),
      completedAt: workout.completedAt,
      name: workout.name,
      completedSetCount: workoutSetSummary(workout).completed,
      resumable: completedWorkoutCanResume(state, workout.id),
      sessionNote: normalizeSessionNote(workout.sessionNote)
        ? {
            text: normalizeSessionNote(workout.sessionNote),
            source: "user-authored-session-note",
            reliability: "subjective-context-only",
          }
        : null,
      exercises: workout.exercises.map((item) => ({
        exerciseId: item.exerciseId,
        name: exerciseName(item),
        sets: item.sets.filter((set) => set.completed),
      })),
    })),
    progressionResults: uniqueExercises.map((item) => ({
      exerciseId: item.exerciseId,
      name: exerciseName(item),
      result: progressionFor(item, state.workouts, state.profile),
    })),
    fatigueSignal: possibleFatigueSignal(state.workouts),
    missedWorkouts: missedPlannedWorkouts(state),
    preferences: {
      units: state.profile.units,
      rirEnabled: state.profile.rirEnabled,
    },
    conversationHistory: state.conversations
      .filter(
        (entry) =>
          (entry.conversationId || "legacy") ===
          state.activeCoachConversationId,
      )
      .slice(-12)
      .map((entry) => ({
        user: entry.user,
        coach: entry.reply?.text || null,
        action: entry.reply?.action || null,
        actionResult: entry.actionResult || null,
      })),
  };
}
function adaptationCoverageGroup(exercise) {
  const pattern =
    exerciseCatalog[exercise.exerciseId]?.pattern ||
    exercise.importedExercise?.pattern;
  if (
    [
      "horizontal-push",
      "incline-push",
      "vertical-push",
      "power-upper",
    ].includes(pattern)
  )
    return "push";
  if (["horizontal-pull", "vertical-pull"].includes(pattern)) return "pull";
  if (["squat", "single-leg", "power-lower"].includes(pattern))
    return "knee-dominant";
  if (["hinge", "hip-extension", "knee-flexion"].includes(pattern))
    return "posterior-chain";
  return null;
}
function adaptationValue(exercise, profile, locked) {
  const item = exerciseCatalog[exercise.exerciseId];
  if (!item) return locked ? 1000 : 0;
  const freeWeight = item.equipment.some((value) =>
    ["barbell", "dumbbells"].includes(value),
  );
  const machine = item.equipment.some((value) =>
    ["machines", "cables"].includes(value),
  );
  return (
    (locked ? 1000 : 0) +
    (item.kind === "compound" ? 30 : 0) +
    (exercise.programmingRole === "main" ? 12 : 0) +
    (isPriorityExercise(item, profile) ? 14 : 0) +
    (profile.goal === "Get stronger" &&
    item.kind === "compound" &&
    item.equipment.includes("barbell")
      ? 8
      : 0) +
    (profile.exercisePreference === "Prefer free weights" && freeWeight
      ? 5
      : 0) +
    (profile.exercisePreference === "Prefer machines" && machine ? 5 : 0) +
    (item.fatigueCost === "high" ? -3 : 0) +
    (item.stability === "high" ? 2 : 0)
  );
}
function withSetCount(exercise, count) {
  const copy = structuredClone(exercise);
  copy.sets = copy.sets.slice(
    0,
    Math.max(1, Math.min(copy.sets.length, count)),
  );
  return copy;
}
function coverageAwareAdaptation(
  source,
  minutes,
  profile,
  lockedIds = new Set(),
) {
  const limit = Math.max(10, Number(minutes));
  const rows = source.exercises.map((exercise, index) => ({
    exercise,
    index,
    group: adaptationCoverageGroup(exercise),
    value: adaptationValue(
      exercise,
      profile,
      lockedIds.has(exercise.exerciseId),
    ),
  }));
  const selected = new Map();
  const minimumSets = (exercise) =>
    Math.min(
      exercise.sets.length,
      exerciseCatalog[exercise.exerciseId]?.kind === "compound" ? 2 : 1,
    );
  const materialized = () =>
    [...selected.values()]
      .sort((a, b) => a.index - b.index)
      .map((row) => withSetCount(row.exercise, row.sets));
  const fits = (row, sets) =>
    estimateSessionMinutes([
      ...materialized(),
      withSetCount(row.exercise, sets),
    ]) <=
    limit + 5;
  for (const row of rows.filter((row) =>
    lockedIds.has(row.exercise.exerciseId),
  ))
    selected.set(row.exercise.exerciseId, {
      ...row,
      sets: Math.max(
        minimumSets(row.exercise),
        row.exercise.sets.filter((set) => set.completed).length,
      ),
    });
  const groups = [...new Set(rows.map((row) => row.group).filter(Boolean))];
  const groupValue = (group) =>
    Math.max(
      ...rows.filter((row) => row.group === group).map((row) => row.value),
    );
  const upper = ["push", "pull"].filter((group) => groups.includes(group));
  const lower = ["knee-dominant", "posterior-chain"].filter((group) =>
    groups.includes(group),
  );
  const preferredGroups =
    upper.length && lower.length
      ? [
          [...upper].sort((a, b) => groupValue(b) - groupValue(a))[0],
          [...lower].sort((a, b) => groupValue(b) - groupValue(a))[0],
        ]
      : upper.length
        ? upper
        : lower;
  const orderedGroups = [...new Set([...preferredGroups, ...groups])];
  for (const group of orderedGroups) {
    if ([...selected.values()].some((row) => row.group === group)) continue;
    const candidates = rows
      .filter(
        (row) => row.group === group && !selected.has(row.exercise.exerciseId),
      )
      .sort((a, b) => b.value - a.value || a.index - b.index);
    const candidate = candidates.find((row) =>
      fits(row, minimumSets(row.exercise)),
    );
    if (candidate)
      selected.set(candidate.exercise.exerciseId, {
        ...candidate,
        sets: minimumSets(candidate.exercise),
      });
  }
  if (!selected.size && rows.length) {
    const best = [...rows].sort(
      (a, b) => b.value - a.value || a.index - b.index,
    )[0];
    selected.set(best.exercise.exerciseId, {
      ...best,
      sets: minimumSets(best.exercise),
    });
  }
  for (const row of [...rows].sort(
    (a, b) => b.value - a.value || a.index - b.index,
  )) {
    if (selected.has(row.exercise.exerciseId)) continue;
    const sets = minimumSets(row.exercise);
    if (fits(row, sets))
      selected.set(row.exercise.exerciseId, { ...row, sets });
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of [...selected.values()].sort(
      (a, b) => b.value - a.value || a.index - b.index,
    )) {
      if (row.sets >= row.exercise.sets.length) continue;
      row.sets += 1;
      if (estimateSessionMinutes(materialized()) <= limit + 5) changed = true;
      else row.sets -= 1;
    }
  }
  while (selected.size) {
    const currentMinutes = estimateSessionMinutes(materialized());
    const currentDistance = Math.abs(currentMinutes - limit);
    const candidates = [...selected.values()]
      .filter(
        (row) =>
          row.sets >
          Math.max(1, row.exercise.sets.filter((set) => set.completed).length),
      )
      .map((row) => {
        row.sets -= 1;
        const estimate = estimateSessionMinutes(materialized());
        row.sets += 1;
        return { row, estimate, distance: Math.abs(estimate - limit) };
      })
      .filter((candidate) => candidate.distance < currentDistance)
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          a.row.value - b.row.value ||
          b.row.index - a.row.index,
      );
    if (!candidates.length) break;
    candidates[0].row.sets -= 1;
  }
  return [...selected.values()]
    .sort((a, b) => a.index - b.index)
    .map((row) => ({ exerciseId: row.exercise.exerciseId, sets: row.sets }));
}
export function adaptTodayProposal(state, minutes, date = new Date()) {
  const targetDate = isoDay(date);
  const active = targetDate === isoDay() ? state.activeWorkout : null;
  const source = active || adaptedTemplateForToday(state, date);
  if (!source) return null;
  const locked = new Set(
    active
      ? source.exercises
          .filter(
            (exercise, index) =>
              index === source.exerciseIndex ||
              exercise.sets.some((set) => set.completed),
          )
          .map((exercise) => exercise.exerciseId)
      : [],
  );
  const setTargets = coverageAwareAdaptation(
    source,
    minutes,
    state.profile,
    locked,
  );
  const keep = setTargets.map((item) => item.exerciseId);
  const targets = new Map(
    setTargets.map((item) => [item.exerciseId, item.sets]),
  );
  const estimatedMinutes = estimateSessionMinutes(
    source.exercises
      .filter((item) => keep.includes(item.exerciseId))
      .map((item) => withSetCount(item, targets.get(item.exerciseId))),
  );
  const dayLabel =
    targetDate === isoDay()
      ? "TODAY"
      : new Intl.DateTimeFormat("en", { weekday: "long" })
          .format(new Date(date))
          .toUpperCase();
  return {
    type: "adapt-today",
    label: `APPLY TO ${dayLabel}`,
    exerciseIds: keep,
    setTargets,
    skippedExerciseIds: source.exercises
      .map((item) => item.exerciseId)
      .filter((id) => !keep.includes(id)),
    minutes: Number(minutes),
    requestedMinutes: Number(minutes),
    estimatedMinutes,
    workoutId: active?.id || null,
    baseWorkoutUpdatedAt: active?.updatedAt || null,
    programDayId: source.programDayId || source.id,
    targetDate,
  };
}
export function proposeOptionalStrengthWorkout(
  state,
  message,
  date = new Date(),
) {
  const lower = String(message || "").toLocaleLowerCase();
  const mentionsToday = /\b(?:today|tonight|danes|dans|nocoj)\b/u.test(lower);
  const wantsTraining =
    /\b(?:train|training|workout|lift|trenir\p{L}*|vadb\p{L}*)\b/u.test(lower);
  if (
    !mentionsToday ||
    !wantsTraining ||
    state.activeWorkout ||
    plannedWorkoutForDate(state, date) ||
    optionalStrengthForDate(state, date)
  )
    return null;
  const allowed = Object.values(exerciseCatalog).filter((item) =>
    isExerciseAutoGeneratable(item, state.profile),
  );
  if (allowed.length < 2) return null;
  const next = currentWeekSchedule(state, date).find(
    (item) => item.scheduledDate > isoDay(date),
  );
  const nextIds = new Set(
    next?.workout.exercises.map((exercise) => exercise.exerciseId) || [],
  );
  const allowedById = new Map(allowed.map((item) => [item.id, item]));
  const balancedSlots = [
    [
      "machine-chest-press",
      "dumbbell-bench-press",
      "push-up",
      "barbell-bench-press",
    ],
    [
      "chest-supported-row",
      "seated-cable-row",
      "one-arm-dumbbell-row",
      "lat-pulldown",
      "pull-up",
    ],
    [
      "goblet-squat",
      "bodyweight-split-squat",
      "reverse-lunge",
      "leg-curl",
      "bodyweight-squat",
    ],
    ["cable-lateral-raise", "lateral-raise", "reverse-crunch", "plank"],
  ];
  const selected = balancedSlots
    .map(
      (ids) =>
        ids
          .map((id) => allowedById.get(id))
          .filter(Boolean)
          .sort(
            (a, b) => Number(nextIds.has(a.id)) - Number(nextIds.has(b.id)),
          )[0],
    )
    .filter(Boolean);
  const selectedIds = new Set(selected.map((item) => item.id));
  const selectedPatterns = new Set(selected.map((item) => item.pattern));
  for (const item of [...allowed].sort(
    (a, b) =>
      Number(nextIds.has(a.id)) - Number(nextIds.has(b.id)) ||
      a.name.localeCompare(b.name),
  )) {
    if (selected.length >= 4) break;
    if (selectedIds.has(item.id) || selectedPatterns.has(item.pattern))
      continue;
    selected.push(item);
    selectedIds.add(item.id);
    selectedPatterns.add(item.pattern);
  }
  if (selected.length < 2) return null;
  const minutes = Math.max(
    20,
    Math.min(45, Number(state.profile.sessionMinutes) || 35),
  );
  const slovenian = /\b(?:danes|dans|počitek|rad|trenir\p{L}*)\b/u.test(lower);
  return {
    type: "add-today-workout",
    label: "APPLY TO TODAY",
    name: slovenian ? "Opcijski trening" : "Optional workout",
    exerciseIds: selected.map((item) => item.id),
    minutes,
    explanation: slovenian
      ? "Lažji opcijski trening za današnji prost dan. Redni tedenski plan ostane nespremenjen."
      : "A lighter optional session for today. Your recurring weekly plan stays unchanged.",
  };
}
const weekdayTokens = {
  mon: "Mon",
  monday: "Mon",
  tue: "Tue",
  tuesday: "Tue",
  wed: "Wed",
  wednesday: "Wed",
  thu: "Thu",
  thursday: "Thu",
  fri: "Fri",
  friday: "Fri",
  sat: "Sat",
  saturday: "Sat",
  sun: "Sun",
  sunday: "Sun",
};
function mentionedWeekdays(text) {
  const matches =
    String(text)
      .toLowerCase()
      .match(
        /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/g,
      ) || [];
  return matches.map((value) => weekdayTokens[value]);
}
function schedulePenalty(schedule) {
  const ordered = [...schedule].sort((a, b) =>
    a.scheduledDate.localeCompare(b.scheduledDate),
  );
  return recoveryPenalty(
    ordered.map((item) => item.workout),
    ordered.map((item) => weekday(item.scheduledDate)),
  );
}
export function proposeWeekScheduleChange(state, message, date = new Date()) {
  const schedule = currentWeekSchedule(state, date);
  if (!schedule.length) return null;
  const lower = String(message || "").toLowerCase();
  const days = mentionedWeekdays(lower);
  const dates = WEEKDAYS.map((day) => isoDay(weekDate(day, date))).filter(
    (value) => value >= isoDay(),
  );
  const occupied = new Set(schedule.map((item) => item.scheduledDate));
  const completed = new Set(
    (state.workouts || [])
      .filter(
        (workout) =>
          workout.completedAt &&
          weekKey(workoutPlanDate(workout)) === weekKey(date),
      )
      .map((workout) => workout.programDayId),
  );
  const movable = (item) =>
    !completed.has(item.workoutId) &&
    state.activeWorkout?.programDayId !== item.workoutId;
  let unavailable = [];
  let requestedFrom = null;
  let requestedTo = null;
  const moveMatch = lower.match(
    /move\s+(?:the\s+)?([a-z]+)(?:'s)?(?:\s+workout)?\s+to\s+([a-z]+)/,
  );
  if (moveMatch) {
    requestedFrom = weekdayTokens[moveMatch[1]];
    requestedTo = weekdayTokens[moveMatch[2]];
  } else if (
    /can(?:not|'t)\s+train/.test(lower) &&
    /\bbut\b/.test(lower) &&
    days.length >= 2
  ) {
    requestedFrom = days[0];
    requestedTo = days.at(-1);
  } else if (
    /tomorrow/.test(lower) &&
    /rest day|need.*rest|can(?:not|'t).*train/.test(lower)
  )
    requestedFrom = weekday(new Date(Date.now() + 86400000));
  else if (/weekend/.test(lower) && /can(?:not|'t)/.test(lower))
    unavailable = ["Sat", "Sun"];
  else if (/can(?:not|'t)\s+train/.test(lower))
    unavailable = [...new Set(days)];
  if (requestedFrom) unavailable = [requestedFrom];
  const changes = [];
  const working = schedule.map((item) => ({ ...item }));
  const moveItem = (item, preferredDay = null) => {
    const blocked = new Set(
      unavailable.map((day) => isoDay(weekDate(day, date))),
    );
    const free = dates.filter(
      (candidate) =>
        candidate !== item.scheduledDate &&
        !blocked.has(candidate) &&
        !working.some(
          (other) =>
            other.workoutId !== item.workoutId &&
            other.scheduledDate === candidate,
        ),
    );
    if (!free.length) return false;
    const preferred = preferredDay
      ? isoDay(weekDate(preferredDay, date))
      : null;
    const ranked = free
      .map((candidate) => {
        const candidateSchedule = working.map((other) =>
          other.workoutId === item.workoutId
            ? { ...other, scheduledDate: candidate }
            : other,
        );
        return {
          candidate,
          penalty: schedulePenalty(candidateSchedule),
          preferred: candidate === preferred ? 0 : 1,
        };
      })
      .sort(
        (a, b) =>
          a.penalty - b.penalty ||
          a.preferred - b.preferred ||
          a.candidate.localeCompare(b.candidate),
      );
    const chosen = ranked[0]?.candidate;
    if (!chosen) return false;
    changes.push({
      workoutId: item.workoutId,
      fromDate: item.scheduledDate,
      toDate: chosen,
    });
    item.scheduledDate = chosen;
    return true;
  };
  if (requestedFrom) {
    const item = working.find(
      (entry) => weekday(entry.scheduledDate) === requestedFrom,
    );
    if (!item || !movable(item) || !moveItem(item, requestedTo)) return null;
  } else
    for (const item of working.filter((entry) =>
      unavailable.includes(weekday(entry.scheduledDate)),
    ))
      if (movable(item) && !moveItem(item)) return null;
  if (!changes.length) return null;
  const usedRequested =
    requestedTo && changes[0].toDate === isoDay(weekDate(requestedTo, date));
  const explanation = usedRequested
    ? "The requested move fits the remaining week without adding a worse same-focus recovery conflict."
    : requestedTo
      ? "I chose the closest safer open day because the requested date would create a worse recovery layout or was already occupied."
      : "I moved the affected uncompleted sessions to the best available open days this week.";
  return {
    type: "week-schedule-change",
    label: "APPLY TO THIS WEEK",
    changes,
    explanation,
    weekKey: weekKey(date),
  };
}
export function deterministicCoach(state, message) {
  const lower = message.toLowerCase();
  const minuteMatch = lower.match(/(\d{2,3})\s*(?:min|minute)/);
  const latestApplied = [...(state.conversations || [])]
    .reverse()
    .find(
      (entry) =>
        (entry.conversationId || "legacy") ===
          state.activeCoachConversationId &&
        entry.actionResult?.status === "applied",
    );
  const gratitude =
    /\b(?:hvala|thanks|thank you|najbolj\p{L}*|super|top)\b/u.test(lower);
  const newRequest =
    /\b(?:premak\p{L}*|prestav\p{L}*|spremen\p{L}*|dodaj\p{L}*|odstran\p{L}*|move|change|add|remove|danes|jutri|today|tomorrow|trening|workout)\b/u.test(
      lower,
    );
  if (latestApplied && gratitude && !newRequest)
    return {
      text: /\b(?:hvala|najbolj\p{L}*|super|top)\b/u.test(lower)
        ? "Ni za kaj \u2014 sprememba je \u017ee potrjena in velja. Ni je treba \u0161e enkrat potrditi."
        : "You're welcome \u2014 the change is already applied. You do not need to confirm it again.",
      action: null,
      source: "deterministic",
      final: true,
    };
  const wantsResume =
    /\b(?:resume|reopen|reset|restart|nadaljuj\p{L}*|odpri\p{L}*|reset\p{L}*|ponovno\p{L}*)\b/u.test(
      lower,
    ) ||
    /(?:pomotoma|po nesreči).{0,40}(?:zaključ\p{L}*|konč\p{L}*)/u.test(lower);
  const resumable = [...(state.workouts || [])]
    .reverse()
    .find((workout) => completedWorkoutCanResume(state, workout.id));
  if (wantsResume && resumable) {
    const slovenian = /\b(?:pomotoma|po nesreči|zaključ\p{L}*|trening|vadb\p{L}*)\b/u.test(
      lower,
    );
    return {
      text: slovenian
        ? "Ta prazen trening lahko varno znova odprem. Preglej dejanje spodaj; plan in drugi zaključeni treningi ostanejo nespremenjeni."
        : "I can safely reopen that empty workout. Review the action below; your plan and other completed workouts stay unchanged.",
      action: {
        type: "resume-empty-completed-workout",
        label: "RESUME WORKOUT",
        targetCompletedWorkoutId: resumable.id,
        trainingDate: workoutPlanDate(resumable),
        expectedCompletedAt: resumable.completedAt,
        operationId: `coach-resume:${resumable.id}:${resumable.completedAt}`,
      },
      source: "deterministic",
      final: true,
    };
  }
  if (minuteMatch) {
    const requestedDay = mentionedWeekdays(lower)[0];
    const target = requestedDay ? weekDate(requestedDay) : new Date();
    if (requestedDay && isoDay(target) < isoDay())
      target.setDate(target.getDate() + 7);
    const action = adaptTodayProposal(state, Number(minuteMatch[1]), target);
    if (action)
      return {
        text: `I used the actual ${action.targetDate === isoDay() ? state.activeWorkout?.name || "selected workout" : state.program?.days.find((day) => day.id === action.programDayId)?.name || "requested workout"} and kept the highest-value work that fits the time. Review the change below.`,
        action,
        source: "deterministic",
      };
  }
  const optionalWorkout = proposeOptionalStrengthWorkout(state, message);
  if (optionalWorkout)
    return {
      text: /\b(?:danes|dans|počitek|rad|trenir\p{L}*)\b/u.test(lower)
        ? "Pripravil sem lažji opcijski trening za danes. Preden ga dodam, ga lahko pregledaš spodaj."
        : "I prepared a lighter optional workout for today. Review it below before adding it.",
      action: optionalWorkout,
      source: "deterministic",
    };
  const scheduleAction = proposeWeekScheduleChange(state, message);
  if (scheduleAction)
    return {
      text: scheduleAction.explanation,
      action: scheduleAction,
      source: "deterministic",
    };
  const plannedExercises =
    state.program?.days.flatMap((day) => day.exercises) || [];
  const candidates = [
    ...plannedExercises,
    ...Object.values(exerciseCatalog).filter(
      (item) =>
        !plannedExercises.some((exercise) => exercise.exerciseId === item.id),
    ),
  ];
  const nameFor = (item) => item.name || exerciseName(item);
  const referenced = candidates
    .filter((item) => {
      const name = nameFor(item).toLowerCase();
      return (
        lower.includes(name) ||
        name.split(" ").some((word) => word.length > 5 && lower.includes(word))
      );
    })
    .sort((a, b) => nameFor(b).length - nameFor(a).length)[0];
  if (referenced) {
    const exerciseId = referenced.exerciseId || referenced.id;
    const name = nameFor(referenced);
    const history = previousExercise(state.workouts, exerciseId);
    if (!history)
      return {
        text: `You do not have a completed ${name} session yet, so there is no performance history to evaluate. Log the first session and I can assess the next target.`,
        source: "deterministic",
      };
    const planned =
      plannedExercises.find((item) => item.exerciseId === exerciseId) ||
      history;
    const recommendation = progressionFor(
      planned,
      state.workouts,
      state.profile,
    );
    if (recommendation?.weight)
      return {
        text: `${name} reached the top of its rep range in two comparable complete sessions. The conservative next target is ${displayWeight(recommendation.weight, state.profile.units)} ${weightUnit(state.profile.units)}.`,
        source: "deterministic",
      };
    return {
      text:
        recommendation?.detail ||
        `Your latest ${name} work is logged, but it does not yet trigger a load increase. Keep building within the programmed rep range.`,
      source: "deterministic",
    };
  }
  return {
    text: "AI Coach is not configured, so I cannot provide a reasoned answer to that question. Workout logging and data-based progression remain fully available offline.",
    source: "offline",
  };
}
export function coachActionConflict(state, action) {
  if (action?.type === "resume-empty-completed-workout") {
    const target = state.workouts.find(
      (workout) => workout.id === action.targetCompletedWorkoutId,
    );
    if (!target || !completedWorkoutCanResume(state, target.id))
      return "workout-changed";
    if (
      action.expectedCompletedAt &&
      target.completedAt !== action.expectedCompletedAt
    )
      return "workout-changed";
    if (action.trainingDate && workoutPlanDate(target) !== action.trainingDate)
      return "workout-changed";
    return null;
  }
  if (
    action?.type === "program-exercise-change" &&
    Number.isFinite(Number(action.baseProgramVersion)) &&
    Number(state.program?.version || 1) !== Number(action.baseProgramVersion)
  )
    return "program-changed";
  if (action?.type !== "adapt-today" || !action.workoutId) return null;
  if (!state.activeWorkout || state.activeWorkout.id !== action.workoutId)
    return "workout-changed";
  const base = Number(action.baseWorkoutUpdatedAt);
  return Number.isFinite(base) && Number(state.activeWorkout.updatedAt) !== base
    ? "workout-changed"
    : null;
}
export function applyCoachAction(state, action) {
  if (!action) return state;
  if (coachActionConflict(state, action)) return state;
  if (action.type === "resume-empty-completed-workout") {
    const resumed = resumeCompletedWorkout(
      state,
      action.targetCompletedWorkoutId,
      Date.now(),
      action.operationId,
    );
    if (resumed !== state) Object.assign(state, resumed);
  }
  if (action.type === "add-today-workout") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(action.targetDate || ""))
      ? action.targetDate
      : isoDay();
    const target = new Date(`${date}T12:00:00`);
    if (
      !Number.isFinite(target.getTime()) ||
      date < isoDay() ||
      (date === isoDay() && state.activeWorkout) ||
      plannedWorkoutForDate(state, target) ||
      optionalStrengthForDate(state, target)
    )
      return state;
    const ids = [...new Set(action.exerciseIds || [])]
      .filter(
        (id) =>
          exerciseCatalog[id] &&
          isExerciseAllowed(exerciseCatalog[id], state.profile),
      )
      .slice(0, 6);
    if (ids.length < 2) return state;
    const optionalSessionId = uid("optional-strength");
    const exercises = ids.map((id) =>
      makeProgramExercise(exerciseCatalog[id], state.profile),
    );
    const workout = {
      id: uid("optional-workout"),
      optionalSessionId,
      weekday: weekday(target),
      location:
        state.profile.environment === "Home gym" ? "Home" : "Commercial gym",
      type: "workout",
      name: String(action.name || "Optional workout").slice(0, 60),
      estimatedMinutes: estimateSessionMinutes(exercises),
      exercises,
    };
    state.optionalSessions ||= [];
    state.optionalSessions.push({
      id: optionalSessionId,
      date,
      kind: "Strength",
      activity: workout.name,
      duration: Number(action.minutes) || workout.estimatedMinutes,
      intensity: "Coach planned",
      status: "planned",
      createdAt: Date.now(),
      workout,
    });
    state.selectedDay = weekday(target);
    state.selectedDate = date;
  }
  if (action.type === "adapt-today") {
    const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(
      String(action.targetDate || ""),
    )
      ? action.targetDate
      : isoDay();
    const target = new Date(`${targetDate}T12:00:00`);
    if (state.activeWorkout && targetDate === isoDay()) {
      if (action.workoutId && action.workoutId !== state.activeWorkout.id)
        return state;
      const currentExerciseId =
        state.activeWorkout.exercises[state.activeWorkout.exerciseIndex]?.id;
      const requested = new Set(action.exerciseIds || []);
      const setTargets = new Map(
        (action.setTargets || []).map((item) => [
          item.exerciseId,
          Number(item.sets),
        ]),
      );
      const originalIds = new Set(
        state.activeWorkout.exercises.map((item) => item.exerciseId),
      );
      const exercises = state.activeWorkout.exercises
        .filter(
          (item, index) =>
            requested.has(item.exerciseId) ||
            index === state.activeWorkout.exerciseIndex ||
            item.sets.some((set) => set.completed),
        )
        .map((item) => {
          const completed = item.sets.filter((set) => set.completed).length;
          const requestedSets = setTargets.get(item.exerciseId);
          if (Number.isFinite(requestedSets))
            item.sets = item.sets.slice(
              0,
              Math.max(1, completed, Math.min(item.sets.length, requestedSets)),
            );
          return item;
        });
      for (const exerciseId of action.exerciseIds || []) {
        if (originalIds.has(exerciseId)) continue;
        const item = exerciseCatalog[exerciseId];
        if (!item || !isExerciseAllowed(item, state.profile)) continue;
        const added = makeProgramExercise(item, state.profile, {
          role: item.kind === "compound" ? "main" : "accessory",
        });
        const requestedSets = setTargets.get(exerciseId);
        if (Number.isFinite(requestedSets))
          added.sets = added.sets.slice(
            0,
            Math.max(1, Math.min(added.sets.length, requestedSets)),
          );
        added.sets = added.sets.map((set) => ({
          ...set,
          planned: true,
          added: false,
          completed: false,
          rir: null,
        }));
        exercises.push(added);
      }
      if (!exercises.length) return state;
      state.activeWorkout.exercises = exercises;
      const restoredIndex = exercises.findIndex(
        (item) => item.id === currentExerciseId,
      );
      state.activeWorkout.exerciseIndex =
        restoredIndex >= 0 ? restoredIndex : 0;
      state.activeWorkout.adapted = true;
      state.activeWorkout.adaptation = {
        requestedMinutes: Number(action.requestedMinutes || action.minutes),
        estimatedMinutes: estimateSessionMinutes(exercises),
        appliedAt: Date.now(),
      };
      refreshWorkoutWarmup(state.activeWorkout, state.profile, state.program);
    } else {
      const template = plannedWorkoutForDate(state, target);
      if (
        !template ||
        (action.programDayId && action.programDayId !== template.id)
      )
        return state;
      const actual = new Set(
        template.exercises.map((exercise) => exercise.exerciseId),
      );
      const exerciseIds = [...new Set(action.exerciseIds || [])].filter(
        (id) =>
          actual.has(id) ||
          (exerciseCatalog[id] &&
            isExerciseAllowed(exerciseCatalog[id], state.profile)),
      );
      const setTargets = (action.setTargets || [])
        .filter((item) => exerciseIds.includes(item.exerciseId))
        .map((item) => ({
          exerciseId: item.exerciseId,
          sets: Math.max(
            1,
            Math.min(
              actual.has(item.exerciseId)
                ? template.exercises.find(
                    (exercise) => exercise.exerciseId === item.exerciseId,
                  ).sets.length
                : 3,
              Number(item.sets) || 1,
            ),
          ),
        }));
      if (!exerciseIds.length) return state;
      const targets = new Map(
        setTargets.map((item) => [item.exerciseId, item.sets]),
      );
      const selectedExercises = exerciseIds.map((id) => {
        const existing = template.exercises.find(
          (exercise) => exercise.exerciseId === id,
        );
        const base = existing
          ? structuredClone(existing)
          : makeProgramExercise(exerciseCatalog[id], state.profile, {
              role:
                exerciseCatalog[id].kind === "compound" ? "main" : "accessory",
            });
        return withSetCount(base, targets.get(id) || base.sets.length);
      });
      const estimatedMinutes = estimateSessionMinutes(selectedExercises);
      state.todayAdaptation = {
        id: uid("adaptation"),
        date: targetDate,
        programDayId: template.id,
        exerciseIds,
        setTargets,
        minutes: Number(action.requestedMinutes || action.minutes),
        requestedMinutes: Number(action.requestedMinutes || action.minutes),
        estimatedMinutes,
        appliedAt: Date.now(),
      };
      state.selectedDay = weekday(target);
      state.selectedDate = targetDate;
    }
  }
  if (action.type === "week-schedule-change")
    applyWeekScheduleChanges(state, action.changes);
  if (action.type === "program-exercise-change")
    applyProgramExerciseChanges(state, action.changes);
  if (action.type === "replace-exercise" && state.activeWorkout) {
    const index = state.activeWorkout.exercises.findIndex(
      (item) => item.exerciseId === action.fromExerciseId,
    );
    const replacement = exerciseCatalog[action.toExerciseId];
    if (
      index >= 0 &&
      !state.activeWorkout.exercises[index].sets.some((set) => set.completed) &&
      replacement &&
      replacementCandidates(action.fromExerciseId, state.profile).some(
        (item) => item.id === replacement.id,
      )
    ) {
      const currentSupersetId =
        state.activeWorkout.exercises[index].supersetId;
      state.activeWorkout.exercises[index] = makeProgramExercise(
        replacement,
        state.profile,
      );
      if (currentSupersetId)
        state.activeWorkout.exercises[index].supersetId = currentSupersetId;
      refreshWorkoutWarmup(state.activeWorkout, state.profile, state.program);
      state.activeWorkout.updatedAt = Date.now();
    }
  }
  return state;
}
export function consistencyForCurrentWeek(state, date = new Date()) {
  const start = isoDay(weekDate("Mon", date));
  const end = isoDay(weekDate("Sun", date));
  const planned = currentWeekSchedule(state, date).length;
  const completed = (state.workouts || []).filter((workout) => {
    const planDate = workoutPlanDate(workout);
    return (
      workout.completedAt &&
      planDate >= start &&
      planDate <= end &&
      workoutSetSummary(workout).completed > 0
    );
  }).length;
  return { completed: Math.min(planned, completed), planned };
}
