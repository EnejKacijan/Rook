import { describe, expect, it } from "vitest";
import {
  advancedSetCanComplete,
  effectiveSetReps,
  historySetDescriptor,
  normalizeAdvancedLoggingState,
  prComparableSet,
  progressionComparableSet,
  setEffortCount,
  setTypeOf,
  unilateralSetReps,
} from "./advancedLogging.js";

describe("advanced workout logging", () => {
  it("keeps legacy sets standard and visually unmarked", () => {
    const state = { workouts: [{ exercises: [{ sets: [{ id: "s", reps: 8, completed: true }] }] }] };
    normalizeAdvancedLoggingState(state);
    expect(setTypeOf(state.workouts[0].exercises[0].sets[0])).toBe("standard");
    expect(state.workouts[0].exercises[0].sets[0]).not.toHaveProperty("setType");
  });

  it("models AMRAP without treating it as standard progression evidence", () => {
    const set = { setType: "amrap", weight: 80, reps: 12, completed: true };
    expect(progressionComparableSet(set)).toBe(false);
    expect(prComparableSet({}, set)).toBe(false);
    expect(advancedSetCanComplete({}, set)).toBe(true);
  });

  it("keeps drop segments attached to one parent set", () => {
    const set = { id: "s", setType: "drop", weight: 80, reps: 8, completed: true, segments: [{ weight: 60, reps: 10, completed: true }, { weight: 40, reps: 12, completed: true }] };
    normalizeAdvancedLoggingState({ workouts: [{ exercises: [{ sets: [set] }] }] });
    expect(set.segments.map((segment) => segment.kind)).toEqual(["drop", "drop"]);
    expect(setEffortCount(set)).toBe(3);
    expect(historySetDescriptor({}, set)).toContain("2 drop segments");
  });

  it("keeps rest-pause segments non-comparable with normal work", () => {
    const set = { setType: "rest_pause", weight: 50, reps: 10, completed: true, segments: [{ weight: 50, reps: 4, completed: true }] };
    expect(progressionComparableSet(set)).toBe(false);
    expect(setEffortCount(set)).toBe(2);
  });

  it("uses the weaker side as the deliberate unilateral result", () => {
    const exercise = { loggingMode: "per_side" };
    const set = { weight: 30, sides: { left: { reps: 10 }, right: { reps: 9 } }, completed: true };
    expect(unilateralSetReps(set)).toBe(9);
    expect(effectiveSetReps(exercise, set)).toBe(9);
    expect(prComparableSet(exercise, set)).toBe(true);
  });

  it("preserves a missing side, allows factual logging, but excludes it from PR comparison", () => {
    const exercise = { loggingMode: "per_side" };
    const set = { weight: 30, sides: { left: { reps: 10 }, right: { reps: null } }, completed: true };
    expect(unilateralSetReps(set)).toBeNull();
    expect(prComparableSet(exercise, set)).toBe(false);
    expect(advancedSetCanComplete(exercise, set)).toBe(true);
  });

  it("accepts equal sides and preserves RIR independently", () => {
    const exercise = { loggingMode: "per_side" };
    const set = { weight: 30, rir: 1, sides: { left: { reps: 10 }, right: { reps: 10 } } };
    expect(advancedSetCanComplete(exercise, set)).toBe(true);
    expect(set.rir).toBe(1);
  });
});
