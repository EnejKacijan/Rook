import { WEEKDAYS } from "./domain.js";

const blockKey = (block) => block.exercises.map((exercise) => exercise.id).join("|");

export function buildExerciseReorderBlocks(exercises = []) {
  const entries = Array.isArray(exercises) ? exercises : [];
  const supersetPositions = new Map();
  entries.forEach((exercise, index) => {
    if (!exercise?.supersetId) return;
    const positions = supersetPositions.get(exercise.supersetId) || [];
    positions.push(index);
    supersetPositions.set(exercise.supersetId, positions);
  });

  const blocks = [];
  for (let index = 0; index < entries.length; index += 1) {
    const exercise = entries[index];
    const positions = exercise?.supersetId
      ? supersetPositions.get(exercise.supersetId) || []
      : [];
    const validPair =
      positions.length === 2 && positions[1] === positions[0] + 1;
    if (validPair && index === positions[1]) continue;
    blocks.push({
      id: exercise?.supersetId && validPair
        ? `superset:${exercise.supersetId}`
        : `exercise:${exercise?.id || index}`,
      exercises: validPair ? entries.slice(index, index + 2) : [exercise],
      locked: Boolean(exercise?.supersetId && !validPair),
    });
    if (validPair) index += 1;
  }
  return blocks;
}

export function moveExerciseReorderBlock(
  exercises,
  sourceExerciseId,
  targetIndex,
) {
  const blocks = buildExerciseReorderBlocks(exercises);
  const sourceIndex = blocks.findIndex((block) =>
    block.exercises.some((exercise) => exercise?.id === sourceExerciseId),
  );
  if (sourceIndex < 0 || blocks[sourceIndex].locked) return exercises;

  const source = blocks[sourceIndex];
  const remaining = blocks.filter((_, index) => index !== sourceIndex);
  const destination = Math.max(
    0,
    Math.min(remaining.length, Number(targetIndex) || 0),
  );
  remaining.splice(destination, 0, source);
  if (remaining.map(blockKey).join("::") === blocks.map(blockKey).join("::"))
    return exercises;
  return remaining.flatMap((block) => block.exercises);
}

export function chronologicalProgramDays(days = []) {
  return [...days].sort(
    (first, second) =>
      WEEKDAYS.indexOf(first.weekday) - WEEKDAYS.indexOf(second.weekday),
  );
}

// A day ID identifies the workout template throughout ROOK (history, overrides,
// and active-workout snapshots all refer to it). Reordering therefore moves the
// complete workout identity while the chronological weekday positions stay fixed.
export function moveWorkoutThroughWeek(days, sourceDayId, targetIndex) {
  const ordered = chronologicalProgramDays(days);
  const sourceIndex = ordered.findIndex((day) => day.id === sourceDayId);
  if (sourceIndex < 0) return days;
  const weekdaySlots = ordered.map((day) => day.weekday);
  const [source] = ordered.splice(sourceIndex, 1);
  const destination = Math.max(
    0,
    Math.min(ordered.length, Number(targetIndex) || 0),
  );
  ordered.splice(destination, 0, source);
  const originalIds = chronologicalProgramDays(days).map((day) => day.id);
  if (ordered.every((day, index) => day.id === originalIds[index])) return days;
  return ordered.map((day, index) => ({
    ...day,
    weekday: weekdaySlots[index],
  }));
}
