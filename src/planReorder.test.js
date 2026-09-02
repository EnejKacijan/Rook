import { describe, expect, it } from "vitest";
import {
  buildExerciseReorderBlocks,
  moveExerciseReorderBlock,
  moveWorkoutThroughWeek,
} from "./planReorder.js";

const exercise = (id, supersetId) => ({ id, ...(supersetId ? { supersetId } : {}) });

describe("plan reorder helpers", () => {
  it("moves a normal exercise between atomic blocks", () => {
    const exercises = [exercise("a"), exercise("b"), exercise("c")];
    expect(moveExerciseReorderBlock(exercises, "a", 2).map((item) => item.id))
      .toEqual(["b", "c", "a"]);
  });

  it("moves a valid superset together without changing its internal order", () => {
    const exercises = [
      exercise("a1", "pair-a"),
      exercise("a2", "pair-a"),
      exercise("b"),
    ];
    expect(buildExerciseReorderBlocks(exercises)).toHaveLength(2);
    expect(moveExerciseReorderBlock(exercises, "a2", 1).map((item) => item.id))
      .toEqual(["b", "a1", "a2"]);
  });

  it("refuses to drag a malformed superset group", () => {
    const exercises = [
      exercise("a1", "pair-a"),
      exercise("b"),
      exercise("a2", "pair-a"),
    ];
    expect(moveExerciseReorderBlock(exercises, "a1", 2)).toBe(exercises);
  });

  it("keeps weekday slots while moving the complete workout identity", () => {
    const days = [
      { id: "push", weekday: "Mon", name: "Push", exercises: [exercise("p")] },
      { id: "pull", weekday: "Wed", name: "Pull", exercises: [exercise("r")] },
      { id: "legs", weekday: "Fri", name: "Legs", exercises: [exercise("l")] },
    ];
    const moved = moveWorkoutThroughWeek(days, "push", 2);
    expect(moved.map((day) => day.weekday)).toEqual(["Mon", "Wed", "Fri"]);
    expect(moved.map((day) => day.id)).toEqual(["pull", "legs", "push"]);
    expect(moved[2].exercises[0].id).toBe("p");
  });

  it("returns the original array for a no-op", () => {
    const days = [
      { id: "a", weekday: "Mon" },
      { id: "b", weekday: "Tue" },
    ];
    expect(moveWorkoutThroughWeek(days, "a", 0)).toBe(days);
  });
});
