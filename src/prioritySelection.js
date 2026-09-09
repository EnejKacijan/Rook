export const MAX_MANUAL_TRAINING_PRIORITIES = 2;
export const BALANCED_TRAINING_PRIORITY = "Balanced";
export const TRAINING_EMPHASIS_PRIORITIES = Object.freeze([
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Quads",
  "Hamstrings / glutes",
  "Calves",
  "Abs / core",
]);
export const TRAINING_PRIORITY_OPTIONS = Object.freeze([
  BALANCED_TRAINING_PRIORITY,
  ...TRAINING_EMPHASIS_PRIORITIES,
]);

export function normalizeManualPrioritySelection(
  selected = [],
  maxPriorities = MAX_MANUAL_TRAINING_PRIORITIES,
) {
  const priorities = [...new Set(selected)].filter(
    (value) => value && value !== BALANCED_TRAINING_PRIORITY,
  );
  if (priorities.length)
    return priorities.slice(-Math.max(1, maxPriorities));
  return [BALANCED_TRAINING_PRIORITY];
}

export function nextManualPrioritySelection(
  selected = [],
  option,
  maxPriorities = MAX_MANUAL_TRAINING_PRIORITIES,
) {
  if (option === BALANCED_TRAINING_PRIORITY)
    return [BALANCED_TRAINING_PRIORITY];

  const current = [...new Set(selected)].filter(
    (value) => value && value !== BALANCED_TRAINING_PRIORITY,
  );
  if (current.includes(option)) {
    const remaining = current.filter((value) => value !== option);
    return remaining.length ? remaining : [BALANCED_TRAINING_PRIORITY];
  }

  if (current.length >= Math.max(1, maxPriorities)) return current;
  return [...current, option];
}
