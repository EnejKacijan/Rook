import { describe, expect, it } from "vitest";
import {
  E1RM_FORMULA,
  activeExercisePr,
  analyzeSetPr,
  estimatedOneRepMax,
  exercisePerformance,
  performanceWeekRange,
  prEventsForWorkouts,
  weeklyPerformanceReview,
} from "./performanceInsights.js";

const set = (weight, reps, extra = {}) => ({
  completed: true,
  planned: true,
  weight,
  reps,
  ...extra,
});
const workout = (id, date, sets, extra = {}) => ({
  id,
  completedAt: `${date}T18:00:00.000Z`,
  canonicalPlanDate: date,
  sourcePlanSlotId: `${id}:${date}`,
  exercises: [{ exerciseId: "bench", name: "Bench Press", sets }],
  ...extra,
});
const state = (workouts = [], extra = {}) => ({
  workouts,
  program: { days: [{ id: "a" }, { id: "b" }] },
  weekScheduleOverrides: {},
  workoutOccurrenceOverrides: {},
  ...extra,
});

describe("Performance Insights", () => {
  it("uses and documents one Epley estimate for 1–12 reps", () => {
    expect(E1RM_FORMULA).toContain("Epley");
    expect(estimatedOneRepMax(100, 5)).toBe(116.67);
    expect(estimatedOneRepMax(100, 13)).toBeNull();
    expect(estimatedOneRepMax(0, 5)).toBeNull();
  });

  it("detects a genuine weight PR after a baseline", () => {
    const result = analyzeSetPr(set(82.5, 5), [set(80, 6)]);
    expect(result.weightPr).toBe(true);
    expect(result.label).toBe("e1RM PR");
  });

  it("detects a rep PR only at a previously logged meaningful load", () => {
    expect(analyzeSetPr(set(80, 8), [set(80, 7)]).repPr).toBe(true);
    expect(analyzeSetPr(set(82.5, 8), [set(80, 7)]).repPr).toBe(false);
  });

  it("detects an estimated 1RM PR without RIR adjustment", () => {
    const result = analyzeSetPr(set(80, 8), [set(80, 7)]);
    expect(result.e1rmPr).toBe(true);
    expect(result.estimatedOneRepMax).toBe(101.33);
  });

  it("does not call an identical repeated set a PR", () => {
    expect(analyzeSetPr(set(80, 8), [set(80, 8)])).toBeNull();
  });

  it("ignores high-rep sets for e1RM while retaining a meaningful rep PR", () => {
    const result = analyzeSetPr(set(40, 15), [set(40, 14)]);
    expect(result.repPr).toBe(true);
    expect(result.e1rmPr).toBe(false);
    expect(result.estimatedOneRepMax).toBeNull();
  });

  it("keeps first exposure as baseline and surfaces a later active PR", () => {
    const history = [workout("first", "2026-08-24", [set(80, 6)])];
    const active = {
      exerciseId: "bench",
      sets: [set(80, 7, { id: "active-set" })],
    };
    expect(prEventsForWorkouts(history)).toHaveLength(0);
    expect(activeExercisePr(history, active).label).toBe("e1RM PR");
  });

  it("builds bests and an estimated 1RM session history", () => {
    const result = exercisePerformance(
      [
        workout("one", "2026-08-24", [set(80, 6), set(80, 7)]),
        workout("two", "2026-08-31", [set(82.5, 5)]),
      ],
      "bench",
    );
    expect(result.bestWeight).toBe(82.5);
    expect(result.bestReps).toBe(7);
    expect(result.sessions).toHaveLength(2);
    expect(result.estimatedOneRepMax).toBeGreaterThan(96);
  });

  it("summarizes adjusted and moved workouts without duplicate sessions", () => {
    const workouts = [
      workout("one", "2026-09-01", [set(80, 6)], { adjustment: { id: "x" } }),
      workout("two", "2026-09-03", [set(60, 8)]),
    ];
    const result = weeklyPerformanceReview(
      state(workouts, {
        weekScheduleOverrides: { "2026-08-31": { a: "2026-09-01" } },
      }),
      "2026-09-03",
    );
    expect(result.completed).toBe(2);
    expect(result.adjusted).toBe(1);
    expect(result.moved).toBe(1);
    expect(result.prCount).toBeLessThanOrEqual(1);
  });

  it("counts explicit skips and never treats removed Adjust Today sets as failed", () => {
    const adjusted = workout("one", "2026-09-01", [set(80, 6)], {
      adjustment: { changes: [{ type: "sets-removed", count: 2 }] },
    });
    const result = weeklyPerformanceReview(
      state([adjusted], {
        workoutOccurrenceOverrides: {
          "2026-09-03": { b: { skipWorkout: true } },
        },
      }),
      "2026-09-03",
    );
    expect(result.completedSets).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.summary.join(" ")).not.toMatch(/failed/i);
  });

  it("keeps deload context factual and does not report regression", () => {
    const prior = workout("old", "2026-08-25", [set(100, 6)]);
    const deload = workout("new", "2026-09-01", [set(70, 6)], {
      trainingBlock: {
        blockName: "Strength Base",
        blockWeekNumber: 6,
        totalWeeks: 6,
        plannedDeload: true,
      },
    });
    const result = weeklyPerformanceReview(state([prior, deload]), "2026-09-01");
    expect(result.blockContext).toMatchObject({ week: 6, totalWeeks: 6, plannedDeload: true });
    expect(result.summary.join(" ")).toMatch(/planned deload/i);
    expect(result.summary.join(" ")).not.toMatch(/regress/i);
  });

  it("handles empty and partial weeks", () => {
    expect(weeklyPerformanceReview(state(), "2026-09-01").empty).toBe(true);
    const partial = weeklyPerformanceReview(
      state([workout("one", "2026-09-01", [set(80, 6)])]),
      "2026-09-01",
    );
    expect(partial.partial).toBe(true);
    expect(partial.completed).toBe(1);
  });

  it("uses Monday–Sunday ranges across a year boundary", () => {
    expect(performanceWeekRange("2027-01-01")).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
  });

  it("recomputes the same analytics after source-history backup restoration", () => {
    const source = state([
      workout("one", "2026-08-25", [set(80, 6)]),
      workout("two", "2026-09-01", [set(80, 7)]),
    ]);
    const restored = JSON.parse(JSON.stringify(source));
    expect(weeklyPerformanceReview(restored, "2026-09-01")).toEqual(
      weeklyPerformanceReview(source, "2026-09-01"),
    );
  });
});
