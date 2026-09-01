import fs from "node:fs";
import path from "node:path";

const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error("Pass the Workout Guide package directory.");
const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, "manifest.json"), "utf8"));
const projectRoot = path.resolve(import.meta.dirname, "..");
const artDir = path.join(projectRoot, "src", "assets", "exercise-art");
fs.mkdirSync(artDir, { recursive: true });

const equipmentMap = {
  Barbell: ["barbell"], Dumbbell: ["dumbbells"], Machine: ["machines"],
  Cable: ["cables"], "Resistance Band": ["resistance bands"],
  "Pull-up Bar": ["pull-up bar"], Cardio: ["machines"], Plate: ["dumbbells"],
  Kettlebell: ["dumbbells"], Bodyweight: ["bodyweight"], Wall: ["bodyweight"],
  Towel: ["bodyweight"], Doorway: ["bodyweight"], Box: ["bodyweight"],
  Bench: ["bodyweight"], Chair: ["bodyweight"], "Stability Ball": ["bodyweight"],
};
const muscleMap = {
  Back: "Back", Lats: "Back", "Upper Back": "Back", "Lower Back": "Back",
  Biceps: "Arms", Triceps: "Arms", Forearms: "Arms", Chest: "Chest",
  Shoulders: "Shoulders", "Rear Delts": "Shoulders", Core: "Core", Quads: "Quads",
  Hamstrings: "Hamstrings / glutes", Glutes: "Hamstrings / glutes",
  "Posterior Chain": "Hamstrings / glutes", Legs: "Quads", Calves: "Calves",
  Adductors: "Adductors", Hips: "Hamstrings / glutes", Mobility: "Core",
};
function patternFor(item) {
  const n = item.name.toLowerCase();
  if (item.isStretch || item.primaryMuscle === "Mobility") return "mobility";
  if (item.equipment === "Cardio") return "conditioning";
  if (/jump|bound|burpee|sprint|high knee|mountain climber/.test(n)) return "power-lower";
  if (/row/.test(n)) return "horizontal-pull";
  if (/pull.?up|chin.?up|pulldown|pull down|pullover/.test(n)) return "vertical-pull";
  if (/rear delt|reverse fly|face pull/.test(n)) return "rear-delt";
  if (/bench press|push.?up|chest press|dip/.test(n)) return /incline|feet elevated/.test(n) ? "incline-push" : "horizontal-push";
  if (/chest fly|cable fly|pec deck|dumbbell fly/.test(n)) return "chest-isolation";
  if (/overhead press|shoulder press|arnold press|pike push/.test(n)) return "vertical-push";
  if (/lateral raise|front raise|y raise/.test(n)) return "shoulder-isolation";
  if (/triceps|skull crusher|pressdown/.test(n)) return "elbow-extension";
  if (/curl/.test(n) && !/leg curl|hamstring/.test(n)) return "elbow-flexion";
  if (/calf/.test(n)) return "calf";
  if (/leg extension/.test(n)) return "knee-extension";
  if (/leg curl|nordic/.test(n)) return "knee-flexion";
  if (/lunge|split squat|step.?up|step.?down|pistol/.test(n)) return "single-leg";
  if (/squat|leg press/.test(n)) return "squat";
  if (/hip thrust|glute bridge|kickback/.test(n)) return "hip-extension";
  if (/deadlift|good morning|back extension|hyperextension|pull through/.test(n)) return "hinge";
  if (/abduction/.test(n)) return "hip-abduction";
  if (/adduction/.test(n)) return "hip-adduction";
  if (/shrug/.test(n)) return "shrug";
  if (/plank|crunch|sit.?up|leg raise|rollout|rotation|pallof|dead bug|bird dog|core/.test(n)) return "core";
  return ({ Chest: "horizontal-push", Back: "horizontal-pull", Lats: "vertical-pull", Shoulders: "shoulder-isolation", "Rear Delts": "rear-delt", Biceps: "elbow-flexion", Triceps: "elbow-extension", Quads: "squat", Hamstrings: "hinge", Glutes: "hip-extension", Calves: "calf", Core: "core", Forearms: "elbow-flexion" })[item.primaryMuscle] || "mobility";
}
function kindFor(item) {
  if (item.isStretch) return "mobility";
  if (item.equipment === "Cardio") return "conditioning";
  return /fly|curl|extension|raise|pressdown|kickback|abduction|adduction|shrug/.test(item.name.toLowerCase()) ? "isolation" : "compound";
}

const exercises = manifest.map((item) => {
  const equipment = equipmentMap[item.equipment] || ["bodyweight"];
  const kind = kindFor(item);
  const artId = `wg-${item.slug}`;
  const source = path.join(sourceRoot, item.frames.find((frame) => frame.index === 2)?.path || item.frames[0].path);
  const target = path.join(artDir, `${artId}.svg`);
  let svg = fs.readFileSync(source, "utf8").replaceAll('fill="#fff"', 'fill="#1f6b4c"').replaceAll('fill="#ffffff"', 'fill="#1f6b4c"');
  fs.writeFileSync(target, svg);
  const muscles = [...new Set([item.primaryMuscle, ...(item.secondaryMuscles || [])].map((value) => muscleMap[value]).filter(Boolean))];
  return {
    sourceSlug: item.slug, name: item.name, aliases: [], pattern: patternFor(item),
    muscles: muscles.length ? muscles : ["Core"], equipment,
    increment: equipment.includes("machines") ? 5 : equipment.includes("dumbbells") ? 2 : equipment.includes("cables") || equipment.includes("barbell") ? 2.5 : 1,
    restSeconds: item.isStretch ? 30 : kind === "isolation" ? 60 : 90,
    kind, bodyweight: equipment.includes("bodyweight"), generation: "library-only",
    exerciseType: item.exerciseType, isStretch: item.isStretch,
    measure: item.exerciseType.includes("duration") ? "seconds" : "reps",
    durationRange: item.exerciseType.includes("duration") ? [20, 60] : undefined,
    artId,
    visualSource: "Workout Guide", visualLicense: "CC BY-SA 4.0",
  };
});
const output = `// Generated by scripts/import-workout-guide.mjs.\nexport const workoutGuideExercises = ${JSON.stringify(exercises, null, 2)};\n`;
fs.writeFileSync(path.join(projectRoot, "src", "workoutGuideCatalog.js"), output);
console.log(`Imported ${exercises.length} Workout Guide records and SVGs.`);
console.log("Run npm run art:normalize to fit the visible artwork to Rook thumbnails.");
