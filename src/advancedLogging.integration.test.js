import { describe, expect, it } from "vitest";
import {
  deserializeState,
  progressionFor,
  serializeState,
  workingSetCanComplete,
} from "./domain.js";
import { exercisePerformance } from "./performanceInsights.js";
import { formatExportSet } from "./workoutExport.js";

const workout = (id, sets, loggingMode = "normal") => ({
  id,
  completedAt: `2026-09-0${id}T12:00:00.000Z`,
  exercises: [{ exerciseId: "barbell-bench-press", loggingMode, repMin: 6, repMax: 10, targetRir: 1, sets }],
});
const standard = (id, reps = 10) => ({ id, planned: true, completed: true, weight: 80, reps, rir: 1 });

describe("advanced logging integration", () => {
  it("does not let AMRAP, drop, or rest-pause evidence drive standard progression", () => {
    const exercise = { exerciseId: "barbell-bench-press", repMin: 6, repMax: 10, targetRir: 1, sets: [standard("current")] };
    const special = ["amrap", "drop", "rest_pause"].map((setType, index) => workout(index + 1, [{ ...standard(`s${index}`), setType }]));
    expect(progressionFor(exercise, special, { increments: { barbell: 2.5 } })).toBeNull();
    const normal = [workout(1, [standard("a")]), workout(2, [standard("b")])];
    expect(progressionFor(exercise, normal, { increments: { barbell: 2.5 } })?.type).toBe("progress");
  });

  it("uses both unilateral sides for PR history and ignores a missing side", () => {
    const both = workout(1, [{ ...standard("a"), sides: { left: { reps: 10 }, right: { reps: 9 } } }], "per_side");
    const missing = workout(2, [{ ...standard("b"), weight: 90, sides: { left: { reps: 10 }, right: { reps: null } } }], "per_side");
    const performance = exercisePerformance([both, missing], "barbell-bench-press");
    expect(performance.setCount).toBe(1);
    expect(performance.bestReps).toBe(9);
  });

  it("allows a factual one-sided set but requires both sides for comparisons", () => {
    const exercise = { exerciseId: "barbell-bench-press", loggingMode: "per_side" };
    expect(workingSetCanComplete(exercise, { weight: 30, sides: { left: { reps: 10 }, right: { reps: 10 } } })).toBe(true);
    expect(workingSetCanComplete(exercise, { weight: 30, sides: { left: { reps: 10 }, right: { reps: null } } })).toBe(true);
  });

  it("round-trips active and completed advanced fields through persistence", () => {
    const set = { ...standard("drop"), setType: "drop", segments: [{ id: "d1", kind: "drop", order: 1, weight: 60, reps: 10, rir: 0, completed: true }] };
    const state = { schemaVersion: 3, profile: {}, program: null, activeWorkout: workout(1, [set]), workouts: [workout(2, [set])] };
    const restored = deserializeState(serializeState(state));
    expect(restored.activeWorkout.exercises[0].sets[0].segments[0]).toMatchObject({ weight: 60, reps: 10, rir: 0, completed: true });
    expect(restored.workouts[0].exercises[0].sets[0].setType).toBe("drop");
  });

  it("exports special type and unilateral asymmetry without raw data", () => {
    const exercise = { exerciseId: "barbell-bench-press", loggingMode: "per_side" };
    const text = formatExportSet(exercise, { ...standard("u"), sides: { left: { reps: 10 }, right: { reps: 9 } } });
    expect(text).toContain("L 10 · R 9");
    expect(text).not.toContain("[object Object]");
  });
});
