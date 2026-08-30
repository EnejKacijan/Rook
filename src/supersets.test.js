import { describe, expect, it } from "vitest";
import {
  isSupersetRoundBoundary,
  nextSupersetStep,
  remapCopiedSupersetIds,
  supersetMeta,
  supersetSteps,
  validateSupersetExercises,
} from "./supersets.js";
import {
  blankState,
  completeWorkout,
  startWorkout,
} from "./domain.js";

const exercise = (id, setCount, supersetId = "pair-1") => ({
  id,
  supersetId,
  restSeconds: id === "a" ? 60 : 120,
  sets: Array.from({ length: setCount }, (_, index) => ({
    id: `${id}-${index}`,
    completed: false,
  })),
});

describe("superset scheduling", () => {
  it("builds canonical rounds for unequal set counts", () => {
    const exercises = [exercise("a", 4), exercise("b", 3)];
    expect(
      supersetSteps(exercises, "pair-1").map(
        (step) => `${step.role}-${step.setIndex + 1}`,
      ),
    ).toEqual(["A1-1", "A2-1", "A1-2", "A2-2", "A1-3", "A2-3", "A1-4"]);
    expect(supersetMeta(exercises, 0)).toMatchObject({
      role: "A1",
      roundCount: 4,
      restSeconds: 120,
    });
  });

  it("returns the earliest pending step and detects a round boundary", () => {
    const exercises = [exercise("a", 2), exercise("b", 2)];
    exercises[0].sets[0].completed = true;
    expect(nextSupersetStep(exercises, "pair-1")).toMatchObject({
      role: "A2",
      setIndex: 0,
    });
    const step = supersetSteps(exercises, "pair-1")[1];
    exercises[1].sets[0].completed = true;
    expect(isSupersetRoundBoundary(exercises, step)).toBe(true);
  });

  it("rewinds to a reopened gap without changing later completed sets", () => {
    const exercises = [exercise("a", 2), exercise("b", 2)];
    exercises.flatMap((entry) => entry.sets).forEach((set) => {
      set.completed = true;
    });
    exercises[0].sets[0].completed = false;
    expect(nextSupersetStep(exercises, "pair-1")).toMatchObject({
      role: "A1",
      setIndex: 0,
    });
    expect(exercises[0].sets[1].completed).toBe(true);
    expect(exercises[1].sets[1].completed).toBe(true);
  });

  it("places late-added and trailing sets into deterministic rounds", () => {
    const exercises = [exercise("a", 3), exercise("b", 2)];
    exercises.flatMap((entry) => entry.sets).forEach((set) => {
      set.completed = true;
    });
    exercises[1].sets.push({ id: "b-2-added", completed: false, added: true });
    expect(nextSupersetStep(exercises, "pair-1")).toMatchObject({
      role: "A2",
      setIndex: 2,
      roundIndex: 2,
    });
    exercises[1].sets[2].completed = true;
    exercises[0].sets.push({ id: "a-3-added", completed: false, added: true });
    expect(nextSupersetStep(exercises, "pair-1")).toMatchObject({
      role: "A1",
      setIndex: 3,
      roundIndex: 3,
    });
  });
});

describe("superset persistence", () => {
  it("rejects orphaned, oversized and non-adjacent groups", () => {
    expect(validateSupersetExercises([exercise("a", 2)])).toHaveLength(1);
    expect(
      validateSupersetExercises([
        exercise("a", 2),
        exercise("x", 2, undefined),
        exercise("b", 2),
      ]),
    ).toHaveLength(1);
    expect(
      validateSupersetExercises([
        exercise("a", 2),
        exercise("b", 2),
        exercise("c", 2),
      ]),
    ).toHaveLength(1);
  });

  it("gives a copied pair a fresh shared id", () => {
    const copied = remapCopiedSupersetIds(
      [exercise("a", 2), exercise("b", 2)],
      () => "pair-copy",
    );
    expect(copied.map((entry) => entry.supersetId)).toEqual([
      "pair-copy",
      "pair-copy",
    ]);
  });

  it("keeps legacy unpaired exercises valid", () => {
    expect(
      validateSupersetExercises([
        exercise("a", 2, null),
        exercise("b", 2, null),
      ]),
    ).toEqual([]);
  });

  it("preserves pairing but keeps completion history independent", () => {
    let state = blankState();
    const template = {
      id: "day-1",
      weekday: "Mon",
      name: "Upper",
      exercises: [
        {
          ...exercise("a", 2),
          exerciseId: "barbell-bench-press",
          repMin: 6,
          repMax: 10,
          defaultIncrement: 2.5,
        },
        {
          ...exercise("b", 2),
          exerciseId: "machine-row",
          repMin: 8,
          repMax: 12,
          defaultIncrement: 5,
        },
      ],
    };
    state.activeWorkout = startWorkout(state, template);
    expect(state.activeWorkout.exercises.map((item) => item.supersetId)).toEqual([
      "pair-1",
      "pair-1",
    ]);
    state.activeWorkout.exercises[0].sets[0].completed = true;
    state.activeWorkout.exercises[0].sets[0].reps = 7;
    state.activeWorkout.exercises[1].sets[0].completed = true;
    state.activeWorkout.exercises[1].sets[0].reps = 11;
    state = completeWorkout(state);
    const saved = state.workouts.at(-1);
    expect(saved.exercises[0].sets[0].reps).toBe(7);
    expect(saved.exercises[1].sets[0].reps).toBe(11);
    expect(saved.exercises.flatMap((item) => item.sets).filter((set) => !set.completed)).toHaveLength(2);
  });
});
