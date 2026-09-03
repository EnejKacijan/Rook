export const MAX_MANUAL_TRAINING_PRIORITIES = 2;

export function normalizeManualPrioritySelection(
  selected = [],
  maxPriorities = MAX_MANUAL_TRAINING_PRIORITIES,
) {
  const priorities = [...new Set(selected)].filter(
    (value) => value && value !== "Balanced",
  );
  if (priorities.length)
    return priorities.slice(-Math.max(1, maxPriorities));
  return ["Balanced"];
}

export function nextManualPrioritySelection(
  selected = [],
  option,
  maxPriorities = MAX_MANUAL_TRAINING_PRIORITIES,
) {
  if (option === "Balanced") return ["Balanced"];

  const current = [...new Set(selected)].filter(
    (value) => value && value !== "Balanced",
  );
  if (current.includes(option)) {
    const remaining = current.filter((value) => value !== option);
    return remaining.length ? remaining : ["Balanced"];
  }

  if (current.length >= Math.max(1, maxPriorities)) return current;
  return [...current, option];
}
