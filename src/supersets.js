export function supersetMembers(exercises = [], supersetId) {
  if (!supersetId) return [];
  return exercises
    .map((exercise, exerciseIndex) => ({ exercise, exerciseIndex }))
    .filter((entry) => entry.exercise.supersetId === supersetId);
}

export function supersetMeta(exercises = [], exerciseIndex) {
  const exercise = exercises[exerciseIndex];
  if (!exercise?.supersetId) return null;
  const members = supersetMembers(exercises, exercise.supersetId);
  if (members.length !== 2) return null;
  const memberIndex = members.findIndex(
    (entry) => entry.exerciseIndex === exerciseIndex,
  );
  if (memberIndex < 0) return null;
  return {
    id: exercise.supersetId,
    role: memberIndex === 0 ? "A1" : "A2",
    memberIndex,
    members,
    partner: members[memberIndex === 0 ? 1 : 0],
    roundCount: Math.max(...members.map((entry) => entry.exercise.sets.length)),
    restSeconds: Math.max(
      ...members.map((entry) => Number(entry.exercise.restSeconds) || 0),
    ),
  };
}

export function supersetSteps(exercises = [], supersetId) {
  const members = supersetMembers(exercises, supersetId);
  if (members.length !== 2) return [];
  const roundCount = Math.max(
    ...members.map((entry) => entry.exercise.sets.length),
  );
  const steps = [];
  for (let setIndex = 0; setIndex < roundCount; setIndex += 1) {
    members.forEach((member, memberIndex) => {
      const set = member.exercise.sets[setIndex];
      if (set)
        steps.push({
          ...member,
          memberIndex,
          role: memberIndex === 0 ? "A1" : "A2",
          set,
          setIndex,
          roundIndex: setIndex,
        });
    });
  }
  return steps;
}

export function nextSupersetStep(exercises = [], supersetId) {
  return (
    supersetSteps(exercises, supersetId).find((entry) => !entry.set.completed) ||
    null
  );
}

export function isSupersetRoundBoundary(exercises, step) {
  if (!step?.exercise?.supersetId) return false;
  const roundSteps = supersetSteps(exercises, step.exercise.supersetId).filter(
    (entry) => entry.roundIndex === step.roundIndex,
  );
  return (
    roundSteps.length > 0 &&
    roundSteps.every((entry) => entry.set.completed)
  );
}

export function supersetRoundKey(supersetId, roundIndex) {
  return `${supersetId}:${roundIndex}`;
}

export function validateSupersetExercises(exercises = []) {
  const errors = [];
  const groups = new Map();
  exercises.forEach((exercise, index) => {
    if (!exercise.supersetId) return;
    const values = groups.get(exercise.supersetId) || [];
    values.push(index);
    groups.set(exercise.supersetId, values);
  });
  groups.forEach((indices) => {
    if (indices.length !== 2 || indices[1] !== indices[0] + 1)
      errors.push(
        "This plan has an invalid superset. Remove and recreate the pairing.",
      );
  });
  return errors;
}

export function remapCopiedSupersetIds(exercises = [], makeId) {
  const idMap = new Map();
  return exercises.map((exercise) => {
    if (!exercise.supersetId) return exercise;
    if (!idMap.has(exercise.supersetId))
      idMap.set(exercise.supersetId, makeId());
    return { ...exercise, supersetId: idMap.get(exercise.supersetId) };
  });
}
