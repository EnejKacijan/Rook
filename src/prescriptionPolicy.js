export const isFewerHardSets = (profile = {}) =>
  String(profile.effortStyle || "").startsWith("Fewer hard");

export function minimumWorkingSetsForExercise(profile = {}, exercise = {}) {
  if (String(profile.effortStyle || "").startsWith("More moderate")) return 3;
  if (String(profile.effortStyle || "").startsWith("Fewer hard")) return 2;
  const accessory = exercise.programmingRole !== "main";
  const shortSession = Number(profile.sessionMinutes) <= 30;
  const highFrequencyLowDose = Number(profile.daysPerWeek) >= 5 &&
    ["General fitness", "Lose fat"].includes(profile.goal);
  return accessory && (shortSession || highFrequencyLowDose) ? 1 : 2;
}

// ROOK-generated plans use deliberately narrow ranges for clearer double
// progression. Imported and manually authored prescriptions bypass this policy.
export function fewerHardRepRange(profile = {}, item = {}, role = "accessory") {
  if (item.measure === "seconds" && Array.isArray(item.durationRange))
    return [...item.durationRange];
  if (item.kind === "power") return [2, 5];

  const compound = item.kind === "compound";
  if (!compound) return [8, 12];

  if (profile.goal === "Get stronger")
    return role === "main" ? [3, 6] : [6, 8];
  if (profile.goal === "Athletic performance")
    return role === "main" ? [3, 6] : [6, 8];
  if (
    profile.goal === "General fitness" ||
    profile.goal === "Lose fat"
  )
    return role === "main" ? [6, 8] : [8, 10];
  return [6, 8];
}

export function inferredProgrammingRole(
  exercises = [],
  index,
  itemForExercise,
) {
  const mainCompoundIndex = exercises.findIndex(
    (exercise) => itemForExercise(exercise)?.kind === "compound",
  );
  return index === mainCompoundIndex ? "main" : "accessory";
}
