import {
  BASELINE_TEMPLATE_BY_FREQUENCY,
  selectStructuralTemplate,
} from "./splitPreferences.js";
import { generateWarmup } from "./warmups.js";
import {
  compileProfileTrainingSafety,
  exerciseAllowedByTrainingSafety,
  trainingSafetyBlocks,
} from "./trainingSafety.js";
import { validateSupersetExercises } from "./supersets.js";

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
    aliases: ["Cable Row", "Seated Row", "Seated Cable Low Row"],
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
  ["suspension-row","Suspension Row",["TRX Row","Ring Row"],"horizontal-pull",["Back","Arms"],["bodyweight"],1,90,"compound",{bodyweight:true,generation:"library-only"}],
  ["incline-barbell-bench-press","Incline Bench Press",["Incline Barbell Bench Press","Barbell Incline Bench Press","Barbell Incline Press"],"incline-push",["Chest","Shoulders","Arms"],["barbell","rack","bench"],2.5,150,"compound"],
  ["smith-machine-bench-press","Smith Machine Bench Press",["Smith Bench Press","Smith Bench"],"horizontal-push",["Chest","Arms"],["machines","bench"],5,120,"compound",{generation:"library-only"}],
  ["incline-smith-machine-press","Incline Smith Machine Press",["Smith Incline Press","Incline Smith Press"],"incline-push",["Chest","Shoulders","Arms"],["machines","bench"],5,120,"compound",{generation:"library-only"}],
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
  ["cable-chest-press","Cable Chest Press",["Standing Cable Chest Press","Cable Press"],"horizontal-push",["Chest","Shoulders","Arms"],["cables"],2.5,105,"compound",{generation:"library-only"}],
  ["dumbbell-shrug","Dumbbell Shrug",["DB Shrug","Dumbbell Shoulder Shrug"],"shrug",["Back","Arms"],["dumbbells"],2,75,"isolation",{generation:"library-only"}],
  ["nordic-hamstring-curl","Nordic Hamstring Curl",["Nordic Curl","Nordic Leg Curl"],"knee-flexion",["Hamstrings / glutes"],["bodyweight"],1,120,"compound",{bodyweight:true,generation:"library-only"}],
  ["lying-leg-curl","Lying Leg Curl",["Prone Leg Curl","Lying Hamstring Curl"],"knee-flexion",["Hamstrings / glutes"],["machines"],5,75,"isolation"],
  ["standing-leg-curl","Standing Leg Curl",["Single-Leg Leg Curl","Single-Leg Hamstring Curl"],"knee-flexion",["Hamstrings / glutes"],["machines"],5,75,"isolation"],
  ["single-leg-leg-extension","Single-Leg Leg Extension",["One-Leg Leg Extension","Unilateral Leg Extension"],"knee-extension",["Quads"],["machines"],5,60,"isolation"],
  ["single-leg-leg-press","Single-Leg Leg Press",["One-Leg Leg Press","Unilateral Leg Press"],"single-leg",["Quads","Hamstrings / glutes"],["machines"],5,105,"compound"],
  ["hip-abduction-machine","Hip Abduction Machine",["Abductor Machine","Seated Hip Abduction"],"hip-abduction",["Hamstrings / glutes"],["machines"],5,60,"isolation",{generation:"library-only"}],
  ["hip-adduction-machine","Hip Adduction Machine",["Adductor Machine","Seated Hip Adduction"],"hip-adduction",["Adductors"],["machines"],5,60,"isolation",{generation:"library-only"}],
  ["leg-press-calf-raise","Leg Press Calf Raise",["Calf Raise on Leg Press","Calf Raises on Leg Press"],"calf",["Calves"],["machines"],5,60,"isolation"],
  ["ez-bar-curl","EZ-Bar Curl",["EZ Curl","EZ Bar Curl"],"elbow-flexion",["Arms"],["barbell"],2.5,60,"isolation"],
  ["incline-dumbbell-curl","Incline Dumbbell Curl",["Incline Curl","Incline DB Curl"],"elbow-flexion",["Arms"],["dumbbells","bench"],2,60,"isolation"],
  ["preacher-curl","Preacher Curl",["EZ-Bar Preacher Curl","EZ Preacher Curl"],"elbow-flexion",["Arms"],["barbell","bench"],2.5,60,"isolation"],
  ["machine-preacher-curl","Machine Preacher Curl",["Biceps Curl Machine","Machine Biceps Curl"],"elbow-flexion",["Arms"],["machines"],5,60,"isolation"],
  ["reverse-curl","Reverse Curl",["Reverse EZ Curl","Overhand Curl"],"elbow-flexion",["Arms"],["barbell"],2.5,60,"isolation",{generation:"library-only"}],
  ["skull-crusher","Skull Crusher",["Lying Triceps Extension","EZ-Bar Skull Crusher"],"elbow-extension",["Arms"],["barbell","bench"],2.5,75,"isolation",{generation:"library-only"}],
  ["close-grip-bench-press","Close-Grip Bench Press",["Close-Grip Barbell Bench Press","CGBP"],"elbow-extension",["Arms","Chest"],["barbell","rack","bench"],2.5,135,"compound",{generation:"library-only"}],
  ["ab-wheel-rollout","Ab Wheel Rollout",["Wheel Rollout","Ab Roller"],"core",["Core"],["bodyweight"],1,75,"compound",{bodyweight:true,generation:"library-only"}],
  ["pallof-press","Pallof Press",["Cable Pallof Press","Anti-Rotation Press"],"core",["Core"],["cables"],2.5,60,"isolation"],
];
for (const [id,name,aliases,pattern,muscles,equipment,increment,restSeconds,kind,extra = {}] of EXPANDED_EXERCISES)
  exerciseCatalog[id] = { id, name, aliases, pattern, muscles, equipment, increment, restSeconds, kind, ...extra };

const GLOBALLY_BLOCKED_EXERCISE_IDS = new Set([
  "dead-bug",
  "prone-y-raise",
  "reverse-snow-angel",
]);
const AUTO_GENERATION_BLOCKED_EXERCISE_IDS = new Set([
  "floor-lat-pulldown",
  "prone-w-raise",
  "prone-swimmer-pull",
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
export function isoDay(date = new Date()) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
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
  const result = new Date(date);
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
    patterns: ["horizontal-pull"],
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
    schemaVersion: 2,
    profile: defaultProfile(),
    program: null,
    activeWorkout: null,
    todayAdaptation: null,
    weekScheduleOverrides: {},
    optionalSessions: [],
    workouts: [],
    conversations: [],
    activeCoachConversationId: null,
    selectedDay: null,
    selectedDate: null,
    ai: { available: null, provider: null },
  };
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
export function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || stored.schemaVersion !== 2) return blankState();
    migrateBlockedExercises(stored);
    const base = blankState();
    stored.program?.days?.forEach((day) =>
      normalizeTimedExercises(day.exercises),
    );
    normalizeTimedExercises(stored.activeWorkout?.exercises);
    const repairedProgram = repairProgramSchedule(stored.program);
    repairedProgram?.days?.forEach((day) => {
      if (!day.nameEdited)
        day.name = normalizeWorkoutName(day.name, day.weekday);
    });
    const validationProfile = repairedProgram?.userEdited
      ? { ...(stored.profile || {}), sessionMinutes: null }
      : stored.profile;
    const checked = validateProgram(repairedProgram, validationProfile, {
      preserveSchedule: Boolean(repairedProgram?.userEdited),
      ignoreTrainingSafety: true,
    });
    const program = checked.valid ? repairedProgram : null;
    const legacyPrioritySources = stored.profile?.prioritySources || {
      manual: Array.isArray(stored.profile?.priorities)
        ? stored.profile.priorities
        : [],
      physiqueSuggested: [],
      physiqueConfirmed: [],
    };
    const profile = {
      ...base.profile,
      ...(stored.profile || {}),
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
      stored.activeWorkout.warmup.generatorVersion !== 1
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
            handledSupersetRestRounds: Array.isArray(
              stored.activeWorkout.handledSupersetRestRounds,
            )
              ? stored.activeWorkout.handledSupersetRestRounds
              : [],
          }
        : null,
      todayAdaptation,
      workouts: Array.isArray(stored.workouts) ? stored.workouts : [],
      conversations,
      activeCoachConversationId,
    };
  } catch {
    return blankState();
  }
}
export const saveState = (state) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

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
      const workout =
        rotatingWorkoutForDate(state.program, originalDate) || slot;
      const scheduledDate = overrides[workout.id] || originalDate;
      return {
        workout,
        workoutId: workout.id,
        originalDate,
        scheduledDate,
        moved: scheduledDate !== originalDate,
      };
    })
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
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
          workout.completedAt && weekKey(workout.completedAt) === key,
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
    const removeExerciseIds = [
      ...new Set(change.removeExerciseIds || []),
    ].filter((id) => current.has(id));
    const addExerciseIds = [...new Set(change.addExerciseIds || [])].filter(
      (id) => !current.has(id),
    );
    if (!removeExerciseIds.length && !addExerciseIds.length)
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
    const remaining = currentIds.filter(
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
      addExerciseIds,
      removeExerciseIds,
    });
  }
  return { valid: true, changes: normalized, error: null };
}

export function applyProgramExerciseChanges(state, changes) {
  const checked = validateProgramExerciseChanges(state, changes);
  if (!checked.valid) return state;
  for (const change of checked.changes) {
    const workout = state.program.days.find(
      (day) => day.id === change.workoutId,
    );
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
  state.program.version = Number(state.program.version || 1) + 1;
  state.program.updatedAt = new Date().toISOString();
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
          slot(["elbow-flexion", "elbow-extension"], { essential: false }),
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
          slot("knee-extension", { essential: false }),
          slot("calf", { essential: false }),
        ],
      },
      {
        name: "Push",
        slots: [
          slot(["incline-push", "horizontal-push"], { role: "main" }),
          slot("vertical-push"),
          slot("shoulder-isolation"),
          slot("elbow-extension"),
          slot("horizontal-push", { essential: false }),
        ],
      },
      {
        name: "Pull",
        slots: [
          slot("vertical-pull", { role: "main" }),
          slot("horizontal-pull"),
          slot("upper-back-pull", { essential: false }),
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
  const hard = effort.startsWith("Fewer hard");
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
  if (hard) targetRir = 1;
  if (moderate) targetRir = Math.max(targetRir, compound || power ? 3 : 2);
  if (olderAdult) targetRir = Math.max(targetRir, compound || power ? 3 : 2);
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
  return confirmedPhysiquePriorities(profile).some((priority) => {
    const option = PHYSIQUE_PRIORITY_OPTIONS[priority.priorityId];
    return (
      option &&
      item.muscles.includes(option.trainingPriority) &&
      option.patterns.includes(item.pattern)
    );
  });
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
  return (
    (profile.priorities || []).some(
      (priority) => priority !== "Balanced" && item.muscles.includes(priority),
    ) || physiquePriorityMatch(item, profile)
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
    programmingRole: options.role || "accessory",
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
  if (String(profile.effortStyle || "").startsWith("More moderate")) return 3;
  if (String(profile.effortStyle || "").startsWith("Fewer hard")) return 2;
  const accessory = exercise.programmingRole !== "main";
  const shortSession = Number(profile.sessionMinutes) <= 30;
  const highFrequencyLowDose =
    Number(profile.daysPerWeek) >= 5 &&
    ["General fitness", "Lose fat"].includes(profile.goal);
  return accessory && (shortSession || highFrequencyLowDose) ? 1 : 2;
}
function fitSessionToDuration(
  exercises,
  minutes,
  profile = {},
  session = null,
) {
  const result = [...exercises];
  while (estimateSessionMinutes(result) > minutes + 5) {
    const reducible = [...result]
      .reverse()
      .find(
        (exercise) =>
          exercise.sets.length > minimumWorkingSets(profile, exercise),
      );
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
      const removableIndex =
        removableCandidates.find((index) => !result[index].requiredRole) ??
        removableCandidates[0];
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
function sessionPermutations(values, used = [], result = []) {
  if (used.length === values.length) {
    result.push([...used]);
    return result;
  }
  for (const value of values) {
    if (used.includes(value)) continue;
    used.push(value);
    sessionPermutations(values, used, result);
    used.pop();
  }
  return result;
}
function arrangeSessionsForRecovery(days, scheduledDays) {
  if (days.length < 2) return days;
  const originalIndex = new Map(days.map((day, index) => [day, index]));
  let best = days;
  let bestScore = Infinity;
  for (const candidate of sessionPermutations(days)) {
    const recovery = recoveryPenalty(candidate, scheduledDays);
    const displacement = candidate.reduce(
      (sum, day, index) => sum + Math.abs(originalIndex.get(day) - index),
      0,
    );
    const score = recovery * 100 + displacement;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
function repairProgramSchedule(program) {
  if (!program || !Array.isArray(program.days) || program.days.length < 2)
    return program;
  if (program.source === "ai-import") return program;
  const chronological = [...program.days].sort(
    (a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday),
  );
  const scheduledDays = chronological.map((day) => day.weekday);
  const arranged = arrangeSessionsForRecovery(chronological, scheduledDays);
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
  const priorities = (profile.priorities || []).filter(
    (value) => value && value !== "Balanced",
  );
  const bonus = profile.goal === "Build muscle" ? 4 : 2;
  return new Map(priorities.map((priority) => [priority, bonus]));
}
function takePrioritySet(item, budgets) {
  const muscle = item.muscles.find((value) => (budgets.get(value) || 0) > 0);
  if (!muscle) return false;
  budgets.set(muscle, budgets.get(muscle) - 1);
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
    !slots.some((definition) => definition.patterns.includes("chest-isolation"))
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
    chestHypertrophyPriority &&
    /^Upper$/i.test(session.name) &&
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
  if (profile.goal === "Build muscle" && !chestHypertrophyPriority) {
    let chestCompoundSlotSeen = false;
    slots = slots.filter((definition) => {
      const chestCompound = definition.patterns.some((pattern) =>
        ["horizontal-push", "incline-push"].includes(pattern),
      );
      if (!chestCompound) return true;
      if (!chestCompoundSlotSeen) {
        chestCompoundSlotSeen = true;
        return true;
      }
      return definition.essential;
    });
  }
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
export function weeklyFractionalVolume(program) {
  const volume = {};
  for (const exercise of (program?.days || []).flatMap(
    (day) => day.exercises || [],
  )) {
    const item = exerciseCatalog[exercise.exerciseId];
    if (!item) continue;
    const sets = (exercise.sets || []).filter(
      (set) => set.planned !== false && !set.added,
    ).length;
    item.muscles.forEach((muscle, index) => {
      volume[muscle] = Number(
        ((volume[muscle] || 0) + sets * (index === 0 ? 1 : 0.5)).toFixed(1),
      );
    });
  }
  return volume;
}
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
  const volume = {};
  for (const exercise of exercises || []) {
    const item = exerciseCatalog[exercise.exerciseId];
    if (!item) continue;
    const sets = (exercise.sets || []).filter(
      (set) => set.planned !== false && !set.added,
    ).length;
    item.muscles.forEach((muscle, index) => {
      volume[muscle] = (volume[muscle] || 0) + sets * (index === 0 ? 1 : 0.5);
    });
  }
  return volume;
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
  let volumes = weeklyFractionalVolume(program);
  let guard = 0;
  while (
    Object.values(volumes).some((value) => value > ceiling) &&
    guard++ < 200
  ) {
    const muscle = Object.entries(volumes).sort((a, b) => b[1] - a[1])[0]?.[0];
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
      .filter((entry) => entry.item?.muscles.includes(muscle));
    const reducible = entries
      .filter(
        (entry) =>
          entry.exercise.sets.length >
          minimumWorkingSets(profile, entry.exercise),
      )
      .sort(
        (a, b) =>
          Number(a.exercise.programmingRole === "main") -
            Number(b.exercise.programmingRole === "main") ||
          Number(b.item.muscles[0] === muscle) -
            Number(a.item.muscles[0] === muscle) ||
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
            ),
        )
        .sort(
          (a, b) =>
            Number(a.exercise.requiredRole) - Number(b.exercise.requiredRole) ||
            Number(b.item.muscles[0] === muscle) -
              Number(a.item.muscles[0] === muscle) ||
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
  return program;
}
export function buildProgram(profile) {
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
  const sessions = template.sessions.map((definition, dayIndex) => {
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
    return {
      id: uid("program-day"),
      weekday: null,
      location: profile.environment === "Home gym" ? "Home" : "Commercial gym",
      type: "workout",
      name,
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
  const days = arrangeSessionsForRecovery(sessions, scheduledDays).map(
    (day, index) => ({ ...day, weekday: scheduledDays[index] }),
  );
  const splitPreference = structuralSelection.preference
    ? {
        id: structuralSelection.preference.id,
        label: structuralSelection.preference.label,
        honored: structuralSelection.preferenceHonored,
        exactFrequencyMatch: structuralSelection.exactFrequencyMatch,
        fidelity: structuralSelection.fidelity,
        fallbackReason: structuralSelection.fallbackReason,
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
          confidence: parsed.confidence,
          reasonCodes: parsed.reasonCodes,
        }
      : null;
  return enforceInitialVolumeCeilings(
    {
      id: uid("program"),
      name: template.name,
      templateId,
      programmingVersion: 3,
      goal: profile.goal,
      createdAt: new Date().toISOString(),
      version: 1,
      source: "fixed-template",
      profileSnapshot: structuredClone(profile),
      splitPreference,
      trainingStyle,
      volumeCeiling: initialVolumeCeiling(profile),
      conditioning: conditioningForProfile(profile),
      includeRecommendedWarmups: profile.recommendedWarmupsEnabled !== false,
      trainingSafety: {
        parserVersion: trainingSafety.parserVersion,
        policyVersion: trainingSafety.policyVersion,
        constraintHash: trainingSafety.constraintHash,
      },
      days,
    },
    profile,
  );
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
    const minimumExercises = allowImportedExercises ? 1 : 2;
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
    for (const [muscle, sets] of Object.entries(weeklyFractionalVolume(program)))
      if (sets > 20)
        errors.push(`${muscle} exceeds the hard weekly volume limit.`);
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
export function exerciseMatchesQuery(item, query) {
  const normalizedQuery = normalizedExerciseName(query);
  if (!normalizedQuery) return true;
  return [item?.name, ...(item?.aliases || [])]
    .filter(Boolean)
    .some((value) =>
      normalizedExerciseName(value).includes(normalizedQuery),
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
export function cleanImportedExerciseLabel(value) {
  return importedSourceName(value)
    .replace(
      /\s*\(\s*(?:compound(?:\s+exercise)?|isolation(?:\s+exercise)?|accessory(?:\s+exercise)?|warm[- ]?up|core)\s*\)?\s*$/iu,
      "",
    )
    .trim();
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
function explicitKgPrescription(source, setCount) {
  const slashValues = [
    ...String(source).matchAll(
      /(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)+)\s*kg\b/gi,
    ),
  ].flatMap((match) =>
    match[1].split("/").map((value) => Number(value.trim().replace(",", "."))),
  );
  const directValues = [
    ...String(source).matchAll(/(\d+(?:[.,]\d+)?)\s*kg\b/gi),
  ].map((match) => Number(match[1].replace(",", ".")));
  const values = slashValues.length ? slashValues : directValues;
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
export function authoritativeImportedWeights(sourceText, proposedExercises) {
  const source = String(sourceText || "");
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
    return explicitKgPrescription(source.slice(start, end), value.sets);
  });
}
export function matchImportedExerciseName(value) {
  const normalized = normalizedExerciseName(value);
  if (!normalized) return { exerciseId: null, status: "unresolved" };
  const exact = Object.values(exerciseCatalog).filter(
    (item) => normalizedExerciseName(item.name) === normalized,
  );
  if (exact.length === 1) return { exerciseId: exact[0].id, status: "matched" };
  const aliases = Object.values(exerciseCatalog).filter((item) =>
    (item.aliases || []).some(
      (alias) => normalizedExerciseName(alias) === normalized,
    ),
  );
  return aliases.length === 1
    ? { exerciseId: aliases[0].id, status: "alias" }
    : { exerciseId: null, status: "unresolved" };
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
    const exercises = day.exercises.map((value) => {
      const importedName = preserve
        ? importedSourceName(value.sourceName)
        : null;
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
      const fallback = item
        ? trainingPrescription(profile, item)
        : { targetRir: null };
      const count = Number(value.sets);
      const repMin = Number(value.repMin);
      const repMax = Number(value.repMax);
      const targetRir =
        preserve && (value.targetRir === null || value.targetRir === undefined)
          ? null
          : Number(value.targetRir ?? fallback.targetRir);
      const restSeconds =
        preserve &&
        (value.restSeconds === null || value.restSeconds === undefined)
          ? null
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
          ? value.sourceVerified && !item
            ? "confirmed-custom"
            : importedMatch.status
          : undefined,
        failureTarget: preserve ? Boolean(value.failureTarget) : false,
        notes: preserve && value.notes ? String(value.notes) : null,
        sets: Array.from({ length: count }, (_, index) => ({
          id: uid("set"),
          weight: setWeights
            ? setWeights[index] === null
              ? null
              : Number(setWeights[index])
            : commonWeight,
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
    return {
      id: uid("program-day"),
      weekday: day.weekday,
      location,
      type: "workout",
      name: normalizeWorkoutName(day.name, day.weekday),
      estimatedMinutes: estimateSessionMinutes(exercises),
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
          confidence: parsed.confidence,
          reasonCodes: parsed.reasonCodes,
        }
      : null;
  const program = {
    id: uid("program"),
    name: String(raw.name || "Personalized Plan"),
    goal: profile.goal,
    createdAt: new Date().toISOString(),
    version: 1,
    source: "ai",
    profileSnapshot: structuredClone(profile),
    splitPreference,
    trainingStyle,
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
export const exerciseName = (value) =>
  value.originalImportedName ||
  value.importedName ||
  value.importedExercise?.name ||
  exerciseCatalog[value.exerciseId]?.name ||
  "Unknown exercise";
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
  return generateWarmup(workout, profile, exerciseCatalog, {
    includeRecommendedWarmups:
      program?.includeRecommendedWarmups ??
      profile?.recommendedWarmupsEnabled !== false,
    includeRampUpSets: profile?.rampUpSetsEnabled !== false,
  });
}
export function refreshWorkoutWarmup(workout, profile, program = null) {
  if (!workout) return workout;
  const skipped = Boolean(workout.warmup?.skipped);
  workout.warmup = warmupForWorkout(workout, profile, program);
  if (workout.warmup) workout.warmup.skipped = skipped;
  return workout;
}
export function startWorkout(state, template) {
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
  const workout = {
    id: uid("active"),
    templateId: template.weekday,
    programDayId: template.id,
    optionalSessionId: template.optionalSessionId || null,
    name: template.name,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    exerciseIndex: 0,
    rest: null,
    handledSupersetRestRounds: [],
    adapted: Boolean(template.optionalSessionId),
    exercises: template.exercises.map((base) => {
      const previous = previousExercise(state.workouts, base.exerciseId);
      const completedPreviousSets =
        previous?.sets.filter((set) => set.completed) || [];
      return {
        ...structuredClone(base),
        sets: base.sets.map((set, index) => ({
          ...set,
          id: uid("set"),
          planned: true,
          added: false,
          completed: false,
          weight: completedPreviousSets[index]?.weight ?? set.weight ?? null,
          reps: completedPreviousSets[index]?.reps ?? base.repMin,
          rir: null,
        })),
      };
    }),
  };
  return refreshWorkoutWarmup(workout, state.profile, state.program);
}
export function progressionFor(exercise, history, profile = null) {
  const min = exercise.repMin ?? exercise.repRange?.[0];
  const max = exercise.repMax ?? exercise.repRange?.[1];
  const timed = exerciseMeasure(exercise) === "seconds";
  const catalogItem = exerciseCatalog[exercise.exerciseId];
  const bodyweight = Boolean(catalogItem?.bodyweight);
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
  const comparable = structurallyComparable.filter((entry) =>
    timed || bodyweight
      ? true
      : entry.loadKey !== null && entry.loadKey === latest.loadKey,
  );
  const previous = comparable.at(-2);
  const previousWithoutLoad = structurallyComparable
    .filter((entry) => !entry.hasLoad)
    .at(-2);
  if (
    !timed &&
    !bodyweight &&
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
    if (timed)
      return {
        type: "progress",
        title: "Ready to progress",
        detail: `Two complete sessions reached ${max} seconds. Increase the hold gradually.`,
        evidenceExposures: 2,
      };
    if (bodyweight && !latest.hasLoad)
      return {
        type: "progress",
        title: "Ready for a harder variation",
        detail: `Two complete sessions reached ${max} reps at the target effort. Progress the variation gradually.`,
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
export function completeWorkout(state) {
  if (!state.activeWorkout) return state;
  const endedAt = Date.now();
  const summary = workoutSetSummary(state.activeWorkout);
  const endedEarly = summary.completedPlanned < summary.planned;
  const session = {
    ...structuredClone(state.activeWorkout),
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
        isoDay(workout.completedAt) === isoDay(candidate),
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
          days: state.program.days.map((day) => ({
            id: day.id,
            weekday: day.weekday,
            name: day.name,
            estimatedMinutes: day.estimatedMinutes,
            exercises: day.exercises.map((item) => ({
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
          weekKey(workout.completedAt) === weekKey(),
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
      completedAt: workout.completedAt,
      name: workout.name,
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
          workout.completedAt && weekKey(workout.completedAt) === weekKey(date),
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
  const planned = state.program?.days.length || 0;
  const completed = (state.workouts || []).filter(
    (workout) =>
      workout.completedAt &&
      isoDay(workout.completedAt) >= start &&
      isoDay(workout.completedAt) <= end &&
      workoutSetSummary(workout).completed > 0,
  ).length;
  return { completed: Math.min(planned, completed), planned };
}
