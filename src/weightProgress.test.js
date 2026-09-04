import { describe, expect, it } from "vitest";
import {
  bodyWeightFromKg,
  bodyWeightToKg,
  effectiveProgressFocus,
  upsertWeightCheckin,
  validateWeightCheckin,
  weightCheckinNeedsConfirmation,
  weightTrend,
} from "./domain.js";

const checkin = (localDate, weightKg) => ({
  id: `weight-${localDate}`,
  localDate,
  weightKg,
  createdAt: `${localDate}T08:00:00.000Z`,
  updatedAt: `${localDate}T08:00:00.000Z`,
});

describe("goal-aware progress", () => {
  it("prefers a per-plan focus without mutating generation provenance", () => {
    const state = {
      profile: { ageRange: "18–29" },
      program: { id: "plan-1", goalAtCreation: "build_muscle" },
      progressFocusOverrideByPlanId: { "plan-1": "lose_fat" },
    };
    expect(effectiveProgressFocus(state)).toBe("lose_fat");
    expect(state.program.goalAtCreation).toBe("build_muscle");
  });

  it("does not expose a lose-fat focus for a known under-18 profile", () => {
    expect(
      effectiveProgressFocus({
        profile: { ageRange: "Under 18" },
        program: { id: "plan-1", goalAtCreation: "lose_fat" },
        progressFocusOverrideByPlanId: {},
      }),
    ).toBeNull();
  });
});

describe("body-weight check-ins", () => {
  it("stores kilograms canonically and displays pounds to one decimal", () => {
    expect(bodyWeightToKg(220.5, "lb")).toBeCloseTo(100.017, 3);
    expect(bodyWeightFromKg(100, "lb")).toBe(220.5);
  });

  it("edits the existing local date rather than adding a duplicate", () => {
    const first = upsertWeightCheckin([], {
      localDate: "2026-08-01",
      weightKg: 82,
    });
    const second = upsertWeightCheckin(first, {
      localDate: "2026-08-01",
      weightKg: 81.8,
    });
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].weightKg).toBe(81.8);
  });

  it("rejects impossible values and future dates", () => {
    expect(
      validateWeightCheckin({
        value: 0,
        units: "kg",
        localDate: "2026-08-01",
      }).error,
    ).toBe("Enter a valid body weight.");
    expect(
      validateWeightCheckin({
        value: 80,
        units: "kg",
        localDate: "2999-01-01",
      }).error,
    ).toBe("Choose today or an earlier date.");
  });

  it("flags a greater-than-five-percent short-window change", () => {
    expect(
      weightCheckinNeedsConfirmation(
        [checkin("2026-08-01", 80)],
        "2026-08-03",
        85,
      ),
    ).toBe(true);
    expect(
      weightCheckinNeedsConfirmation(
        [checkin("2026-08-01", 80)],
        "2026-08-03",
        83,
      ),
    ).toBe(false);
  });

  it("requires three distinct days across at least seven days and two calendar weeks", () => {
    expect(
      weightTrend([
        checkin("2026-08-03", 82),
        checkin("2026-08-05", 81.9),
        checkin("2026-08-08", 81.8),
      ]).ready,
    ).toBe(false);
    expect(
      weightTrend([
        checkin("2026-08-01", 82),
        checkin("2026-08-03", 81.9),
        checkin("2026-08-08", 81.7),
      ]).ready,
    ).toBe(true);
  });

  it("supports infrequent weekly check-ins without requiring more logging", () => {
    const result = weightTrend([
      checkin("2026-08-03", 82),
      checkin("2026-08-10", 81.8),
      checkin("2026-08-17", 81.5),
    ]);
    expect(result.ready).toBe(true);
    expect(result.weeks).toHaveLength(3);
    expect(result.weeks.every((week) => week.samples === 1)).toBe(true);
  });

  it("exposes a weekly average only when a week has at least two check-ins", () => {
    const result = weightTrend([
      checkin("2026-08-03", 82),
      checkin("2026-08-05", 81.6),
      checkin("2026-08-10", 81.4),
    ]);
    expect(result.weeks[0].samples).toBe(2);
    expect(result.weeks[0].weightKg).toBeCloseTo(81.8, 5);
    expect(result.weeks[1].samples).toBe(1);
  });

  it("does not let same-day duplicates overweight a weekly average", () => {
    const earlier = checkin("2026-08-03", 82);
    const corrected = {
      ...checkin("2026-08-03", 81.8),
      id: "corrected-weight",
      updatedAt: "2026-08-03T09:00:00.000Z",
    };
    const result = weightTrend([
      earlier,
      corrected,
      checkin("2026-08-05", 81.6),
    ]);
    expect(result.entries).toHaveLength(2);
    expect(result.weeks[0].samples).toBe(2);
    expect(result.weeks[0].weightKg).toBeCloseTo(81.7, 5);
  });

  it("uses seven-day means and detects a sustained rapid downward trend", () => {
    const entries = [];
    for (let day = 1; day <= 29; day += 2)
      entries.push(
        checkin(
          `2026-08-${String(day).padStart(2, "0")}`,
          100 - (day - 1) * 0.2,
        ),
      );
    const result = weightTrend(entries);
    expect(result.ready).toBe(true);
    expect(result.points.at(-1).samples).toBeGreaterThanOrEqual(3);
    expect(result.changeKg).toBeLessThan(0);
    expect(result.rapidDownward).toBe(true);
  });
});
