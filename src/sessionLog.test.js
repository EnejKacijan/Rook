import { describe, expect, it } from "vitest";
import { sessionLogSetParts } from "./sessionLog.js";

describe("sessionLogSetParts", () => {
  it("formats a completed weighted set with reps, load, and RIR", () => {
    expect(
      sessionLogSetParts(
        { exerciseId: "barbell-bench-press" },
        { completed: true, reps: 6, weight: 20, rir: 1 },
        0,
        "kg",
      ),
    ).toEqual(["1", "6 reps", "20 kg", "1 RIR"]);
  });

  it("labels an unweighted bodyweight set instead of requiring a load", () => {
    expect(
      sessionLogSetParts(
        { exerciseId: "pull-up" },
        { completed: true, reps: 10, weight: 0, rir: null },
        0,
        "kg",
      ),
    ).toEqual(["1", "10 reps", "Bodyweight"]);
  });

  it("shows unfinished sets as not logged without invented values", () => {
    expect(
      sessionLogSetParts(
        { exerciseId: "barbell-bench-press" },
        { completed: false, reps: 6, weight: 20, rir: 1 },
        1,
        "kg",
      ),
    ).toEqual(["2", "Not logged"]);
  });
});
