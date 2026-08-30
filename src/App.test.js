import { describe, expect, it } from "vitest";
import {
  adaptationDurationLabel,
  bindScrollableSheetTouch,
  displayImportedPlanName,
  displayProgramName,
  effortGuidanceFor,
  exerciseHistoryPerformanceLabel,
  exerciseHistoryWeightLabel,
  formatActiveWorkoutDuration,
  normalizeStepperValue,
  profileTrainingRows,
  shouldEnableRir,
  splitAdaptationCopy,
  splitRecommendationCopy,
  trainingClearanceLimitRows,
  weekLabel,
  workoutTitleParts,
} from "./App.jsx";

describe("training clearance summary", () => {
  it("labels exclusions and exercise effort limits explicitly", () => {
    expect(
      trainingClearanceLimitRows({
        appliedLabels: ["Squat movements", "Leg Press: at least 1 RIR"],
      }),
    ).toEqual([
      { label: "Avoid", value: "Squat movements" },
      { label: "Leg Press", value: "Keep at least 1 RIR" },
    ]);
  });

  it("keeps a clinician-provided body-region scope user-facing", () => {
    expect(
      trainingClearanceLimitRows({
        clinicianScope: { label: "Upper-body strength training only" },
        appliedLabels: [],
      }),
    ).toEqual([
      { label: "Training scope", value: "Upper-body strength training only" },
    ]);
  });
});

function touchEvent(type, y, touches = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: touches ? [{ clientY: y }] : [],
  });
  return event;
}

describe("scrollable bottom-sheet gestures", () => {
  it("lets content scroll first, then hands the same downward gesture to the sheet at the top", () => {
    const surface = document.createElement("div");
    const scroller = document.createElement("div");
    surface.append(scroller);
    document.body.append(surface);
    Object.defineProperty(surface, "offsetHeight", { value: 500 });
    scroller.scrollTop = 80;
    const positions = [];
    let dismissed = false;
    let resets = 0;
    const unbind = bindScrollableSheetTouch({
      surface,
      scroller,
      setPosition: (value) => positions.push(value),
      onDismiss: () => {
        dismissed = true;
      },
      onReset: () => {
        resets += 1;
      },
    });
    surface.dispatchEvent(touchEvent("touchstart", 200));
    surface.dispatchEvent(touchEvent("touchmove", 230));
    expect(positions).toEqual([]);
    scroller.scrollTop = 0;
    surface.dispatchEvent(touchEvent("touchmove", 250));
    surface.dispatchEvent(touchEvent("touchmove", 300));
    expect(positions.at(-1)).toBe(50);
    surface.dispatchEvent(touchEvent("touchend", 300, 0));
    expect(dismissed).toBe(false);
    expect(resets).toBe(1);
    unbind();
    surface.remove();
  });

  it("never hijacks an upward scroll and dismisses a deliberate downward pull from the top", () => {
    const surface = document.createElement("div");
    document.body.append(surface);
    Object.defineProperty(surface, "offsetHeight", { value: 500 });
    const positions = [];
    let dismissed = false;
    const unbind = bindScrollableSheetTouch({
      surface,
      scroller: surface,
      setPosition: (value) => positions.push(value),
      onDismiss: () => {
        dismissed = true;
      },
      onReset: () => {},
    });
    surface.dispatchEvent(touchEvent("touchstart", 220));
    surface.dispatchEvent(touchEvent("touchmove", 150));
    expect(positions).toEqual([]);
    surface.dispatchEvent(touchEvent("touchend", 150, 0));
    surface.dispatchEvent(touchEvent("touchstart", 100));
    surface.dispatchEvent(touchEvent("touchmove", 250));
    surface.dispatchEvent(touchEvent("touchend", 250, 0));
    expect(dismissed).toBe(true);
    unbind();
    surface.remove();
  });
});

describe("import preview presentation", () => {
  it("removes generic source headings and schedule text from the display name only", () => {
    expect(
      displayImportedPlanName("Weekly Workout Plan: Build Muscle, 4 days/week"),
    ).toBe("Build Muscle");
    expect(displayImportedPlanName("Workout Plan")).toBe("Imported plan");
    expect(
      displayImportedPlanName("Training Plan — Hypertrophy · 3 days per week"),
    ).toBe("Hypertrophy");
  });

  it("preserves genuinely meaningful plan names", () => {
    expect(displayImportedPlanName("Alex Upper/Lower Strength Plan")).toBe(
      "Alex Upper/Lower Strength Plan",
    );
  });
});

describe("profile presentation", () => {
  it("never formats a missing session length as null or undefined minutes", () => {
    const rows = profileTrainingRows({
      goal: "Build muscle",
      availableDays: ["Mon", "Thu"],
      sessionMinutes: null,
      equipment: [],
    });
    expect(rows).toEqual([
      ["Goal", "Build muscle"],
      ["Schedule", "Mon, Thu"],
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/null min|undefined/i);
  });

  it("normalizes program headings without duplicating structured day metadata", () => {
    const imported = {
      source: "ai-import",
      name: "Weekly Workout Plan: Build Muscle, 4 days/week",
      days: Array.from({ length: 4 }, () => ({})),
    };
    expect(displayProgramName(imported)).toBe("Build Muscle");
    expect(
      displayProgramName({
        source: "ai",
        name: "Personalized Plan",
        days: [
          { name: "Upper A" },
          { name: "Lower A" },
          { name: "Upper B" },
          { name: "Lower B" },
        ],
      }),
    ).toBe("Upper / Lower");
  });
});

describe("Today week navigation", () => {
  it("uses a compact range for same-month and cross-month weeks", () => {
    expect(weekLabel(new Date(2026, 7, 26, 12))).toBe("Aug 24–30");
    expect(weekLabel(new Date(2026, 8, 2, 12))).toBe("Aug 31–Sep 6");
  });
});

describe("active workout duration", () => {
  it("keeps normal durations familiar and bounds abnormal values", () => {
    expect(formatActiveWorkoutDuration(18 * 60)).toBe("18 min");
    expect(formatActiveWorkoutDuration(65 * 60)).toBe("1:05 h");
    expect(formatActiveWorkoutDuration(130 * 60 * 60)).toBe("99+ h");
    expect(formatActiveWorkoutDuration(Number.NaN)).toBe("0 min");
  });
});

describe("exercise history presentation", () => {
  it("uses shipping-quality labels when a completed set has no load", () => {
    expect(exerciseHistoryWeightLabel({ weight: null })).toBe(
      "Weight not logged",
    );
    expect(exerciseHistoryWeightLabel({ weight: undefined })).toBe(
      "Weight not logged",
    );
    expect(exerciseHistoryWeightLabel({ weight: 82.5, units: "kg" })).toBe(
      "82.5 kg",
    );
    expect(exerciseHistoryWeightLabel({ bodyweight: true })).toBe("Bodyweight");
    expect(exerciseHistoryWeightLabel({ timed: true })).toBe("Timed hold");
  });

  it("labels every historical result with its meaning", () => {
    expect(
      exerciseHistoryPerformanceLabel({ exerciseId: "barbell-bench-press" }, [
        { completed: true, reps: 8 },
        { completed: true, reps: 7 },
      ]),
    ).toBe("8 reps / 7 reps");
    expect(
      exerciseHistoryPerformanceLabel({ exerciseId: "plank" }, [
        { completed: true, reps: 45 },
      ]),
    ).toBe("45 sec");
  });
});

describe("workout input and duration contracts", () => {
  it("accepts decimal load entry, decimal commas and integer-only reps", () => {
    expect(normalizeStepperValue("52.5")).toBe(52.5);
    expect(normalizeStepperValue("27,5")).toBe(27.5);
    expect(normalizeStepperValue("8.9", { min: 1, integer: true })).toBe(8);
    expect(normalizeStepperValue("invalid")).toBeUndefined();
  });

  it("states whether the reviewed duration fits or is the closest valid option", () => {
    expect(adaptationDurationLabel(35, 39)).toBe("~40 min · fits 35 min goal");
    expect(adaptationDurationLabel(35, 44)).toBe(
      "Closest valid option · ~45 min (35 min goal)",
    );
  });
});

describe("workout title hierarchy", () => {
  it("keeps the workout type prominent and separates long generated detail", () => {
    expect(
      workoutTitleParts(
        "Upper — Balanced Volume (Shoulders & Chest Recovery)",
        "Sat",
      ),
    ).toEqual({
      primary: "Upper",
      detail: "Balanced Volume",
      context: "Shoulders & Chest Recovery",
    });
    expect(workoutTitleParts("Lower · Posterior focus", "Tue")).toEqual({
      primary: "Lower",
      detail: "Posterior focus",
      context: "",
    });
    expect(workoutTitleParts("Push", "Mon")).toEqual({
      primary: "Push",
      detail: "",
      context: "",
    });
    expect(workoutTitleParts("Full Body A", "Mon")).toEqual({
      primary: "Full Body A",
      detail: "",
      context: "",
    });
  });
});

describe("experience-aware effort guidance", () => {
  it("keeps beginner choices simple and free of unexplained RIR terminology", () => {
    const guidance = effortGuidanceFor("Beginner");
    expect(JSON.stringify(guidance)).not.toMatch(/\bRIR\b|reps in reserve/i);
    expect(guidance.options.map((option) => option.label)).toEqual([
      "Balanced starting point",
      "Shorter, focused sessions",
      "More practice and volume",
    ]);
  });

  it("explains reps in reserve before using the RIR abbreviation for experienced users", () => {
    expect(effortGuidanceFor("Intermediate").hint).toMatch(
      /reps in reserve \(RIR\)/i,
    );
    expect(effortGuidanceFor("Advanced").hint).toMatch(
      /RIR means reps in reserve/i,
    );
  });

  it("keeps RIR logging off for beginners and opt-in through an effort choice for experienced users", () => {
    expect(shouldEnableRir("Beginner", "Balanced workload")).toBe(false);
    expect(shouldEnableRir("Intermediate", null)).toBe(false);
    expect(shouldEnableRir("Intermediate", "Balanced workload")).toBe(true);
  });
});

describe("training split onboarding", () => {
  it("uses the selected frequency in the default Coach recommendation", () => {
    expect(splitRecommendationCopy(2)).toBe(
      "Best fit for your goal, experience and 2-day schedule",
    );
    expect(splitRecommendationCopy(5)).toBe(
      "Best fit for your goal, experience and 5-day schedule",
    );
  });

  it("explains when a preferred split needs a closest sensible structure", () => {
    expect(
      splitAdaptationCopy({
        days: [{}, {}],
        splitPreference: {
          label: "Push / Pull / Legs",
          honored: false,
          fidelity: "incompatible",
        },
      }),
    ).toBe(
      "Push / Pull / Legs does not fit this 2-day schedule, so Rook used the closest sensible structure.",
    );
    expect(
      splitAdaptationCopy({
        days: Array.from({ length: 5 }, () => ({})),
        splitPreference: {
          label: "Arnold split",
          honored: true,
          fidelity: "adapted",
        },
      }),
    ).toMatch(/adapted.*5-day schedule/i);
  });
});
