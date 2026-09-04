import { describe, expect, it } from "vitest";
import {
  adaptationDurationLabel,
  activeWorkoutNoticeDetails,
  alignedStepperValue,
  coachContextSummary,
  contextualCoachPrompts,
  bindScrollableSheetTouch,
  displayImportedPlanName,
  displayProgramName,
  effortGuidanceFor,
  exerciseArt,
  exerciseThumbnailPresentation,
  exerciseHistoryEntries,
  exerciseHistoryPerformanceLabel,
  exerciseHistoryWeightLabel,
  formatActiveWorkoutDuration,
  formatScheduleDays,
  formatWorkoutElapsedDuration,
  latestLoggedWeightSet,
  normalizeStepperValue,
  validStepperDraft,
  planEditorAllowsSupersets,
  profileTrainingRows,
  legacyThemePreference,
  resolvedAppearance,
  resolvedTheme,
  restrictionPlanSuggestions,
  setupSelectionValid,
  shouldEnableRir,
  splitAdaptationCopy,
  splitRecommendationCopy,
  trainingClearanceLimitRows,
  weekLabel,
  workoutTitleParts,
} from "./App.jsx";
import { blankState, buildProgram, workingSetCanComplete } from "./domain.js";

describe("restriction-aware plan review", () => {
  const fixture = () => {
    const state = blankState();
    state.profile = {
      ...state.profile,
      goal: "Build muscle",
      experience: "Intermediate",
      daysPerWeek: 2,
      availableDays: ["Tue", "Sat"],
      sessionMinutes: 60,
      environment: "Commercial gym",
      equipment: ["full gym"],
    };
    state.program = buildProgram(state.profile);
    const day = state.program.days[0];
    const exercise = day.exercises[0];
    exercise.exerciseId = "leg-press";
    return { state, day, exercise };
  };

  it("does not preselect a plan mutation for an explicit movement limit", () => {
    const { state, day, exercise } = fixture();
    const [suggestion] = restrictionPlanSuggestions(
      state.program,
      { ...state.profile, avoid: "Avoid Leg Press" },
      [{
        dayId: day.id,
        dayName: day.name,
        exerciseEntryId: exercise.id,
        exerciseId: exercise.exerciseId,
        exerciseName: "Leg Press",
        reason: "movement",
        context: "explicit-limit",
      }],
    );
    expect(suggestion.choice).toBe("review");
    expect(suggestion.candidates.length).toBeGreaterThan(0);
  });

  it("offers removal rather than inferred substitutions for a pain context", () => {
    const { state, day, exercise } = fixture();
    const [suggestion] = restrictionPlanSuggestions(
      state.program,
      { ...state.profile, avoid: "Leg Press hurts" },
      [{
        dayId: day.id,
        dayName: day.name,
        exerciseEntryId: exercise.id,
        exerciseId: exercise.exerciseId,
        exerciseName: "Leg Press",
        reason: "movement",
        context: "pain",
      }],
    );
    expect(suggestion.choice).toBe("review");
    expect(suggestion.candidates).toEqual([]);
    expect(suggestion.canRemove).toBe(true);
  });
});

describe("context-aware Coach home", () => {
  it("summarizes today's real workout and first-session context", () => {
    const state = blankState();
    state.activeWorkout = {
      name: "Upper",
      exercises: Array.from({ length: 5 }, () => ({ sets: [] })),
    };
    expect(coachContextSummary(state)).toEqual({
      primary: "Upper today · 5 exercises",
      secondary: "Your current plan and today’s workout are in context.",
    });
    expect(contextualCoachPrompts(state)).toEqual([
      "Adapt today to 35 minutes.",
      "How should I approach my first workout?",
      "Explain how this program fits my goals.",
    ]);
  });

  it("uses logged workouts and rest-day state to choose useful context", () => {
    const state = blankState();
    state.workouts = [
      {
        exercises: [
          { sets: [{ completed: true, weight: 42.5, reps: 8 }] },
        ],
      },
    ];
    expect(coachContextSummary(state)).toEqual({
      primary: "Rest day today",
      secondary: "1 workout logged · Recent working weights available",
    });
    expect(contextualCoachPrompts(state)).toEqual([
      "Should I train today anyway?",
      "How am I recovering this week?",
      "Am I progressing on this program?",
    ]);
  });

  it("does not coerce a completed null-load set into a working weight", () => {
    const state = blankState();
    state.workouts = [
      {
        exercises: [
          { sets: [{ completed: true, weight: null, reps: 20 }] },
        ],
      },
    ];
    expect(coachContextSummary(state).secondary).toBe(
      "1 workout logged · Completed training history available",
    );
  });
});

describe("training setup validation", () => {
  it("keeps superset planning in Edit plan and out of previews", () => {
    expect(planEditorAllowsSupersets("edit")).toBe(true);
    for (const mode of ["review", "scratch", "import", "expert", "read-only"])
      expect(planEditorAllowsSupersets(mode)).toBe(false);
  });

  it("resolves explicit and system theme preferences without changing app data", () => {
    expect(resolvedTheme("system", false)).toBe("light");
    expect(resolvedTheme("system", true)).toBe("dark");
    expect(resolvedTheme("light", true)).toBe("light");
    expect(resolvedTheme("dark", false)).toBe("dark");
    expect(resolvedTheme("premium", false)).toBe("premium");
    expect(resolvedTheme("premium", true)).toBe("premium");
    expect(resolvedAppearance("system", false)).toBe("light");
    expect(resolvedAppearance("system", true)).toBe("dark");
    expect(resolvedAppearance("light", true)).toBe("light");
    expect(legacyThemePreference("dark", "standard")).toBe("dark");
    expect(legacyThemePreference("light", "premium")).toBe("premium");
  });

  it("uses only faithful exercise-specific art and no pattern fallback", () => {
    expect(exerciseArt({ exerciseId: "barbell-bench-press" })).toMatch(/wg-bench-press.*\.svg/);
    expect(exerciseArt({ exerciseId: "barbell-row" })).toMatch(/wg-barbell-row.*\.svg/);
    expect(exerciseArt({ exerciseId: "single-leg-leg-press" })).toMatch(
      /wg-rook-single-leg-leg-press.*\.svg/,
    );
    expect(exerciseArt({ exerciseId: "imported-custom-exercise", pattern: "horizontal-pull" })).toBeNull();
    expect(
      exerciseArt({
        exerciseId: "imported-custom-machine-lateral-raise",
        importedName: "Machine Lateral Raise",
      }),
    ).toMatch(/wg-machine-lateral-raise.*\.svg/);
    expect(
      exerciseArt({
        exerciseId: "imported-custom-cable-triceps-pushdown",
        importedName: "Cable Triceps Pushdown",
      }),
    ).toMatch(/wg-tricep-pushdown.*\.svg/);
    expect(
      exerciseArt({
        exerciseId: "free-text-exercise",
        name: "Incline DB Press",
      }),
    ).toMatch(/wg-incline-dumbbell-press.*\.svg/);
    expect(
      exerciseArt({
        exerciseId: "free-text-exercise",
        title: "Romanian Deadlift",
      }),
    ).toMatch(/wg-romanian-deadlift.*\.svg/);
    expect(
      exerciseArt({
        exerciseId: "imported-custom-lateral-raises",
        importedName: "Lateral Raises",
      }),
    ).toMatch(/wg-lateral-raise.*\.svg/);
    expect(
      exerciseArt({
        exerciseId: "imported-custom-slovenian",
        importedName: "Poševni potisk z ročkami",
      }),
    ).toMatch(/wg-incline-dumbbell-press.*\.svg/);
    expect(
      exerciseArt({
        exerciseId: "imported-custom-compact",
        importedName: "stranskidvigi",
      }),
    ).toMatch(/wg-lateral-raise.*\.svg/);
    expect(
      exerciseArt({
        exerciseId: "imported-custom-leg-curl-hold",
        importedName: "Leg Curl Izometrični Hold",
      }),
    ).toMatch(/wg-leg-curl.*\.svg/);
  });

  it("normalizes only known thumbnail outliers without changing their artwork family", () => {
    expect(
      exerciseThumbnailPresentation({ exerciseId: "straight-arm-cable-pulldown" }),
    ).toEqual({
      artId: "wg-straight-arm-pulldown",
      style: {
        "--exercise-art-scale": 1.12,
        "--exercise-art-offset-x": "0px",
        "--exercise-art-offset-y": "1px",
      },
    });
    expect(
      exerciseThumbnailPresentation({
        exerciseId: "imported-custom-lateral-raises",
        importedName: "Lateral Raises",
      }),
    ).toEqual({
      artId: "wg-lateral-raise",
      style: {
        "--exercise-art-scale": 1.07,
        "--exercise-art-offset-x": "0px",
        "--exercise-art-offset-y": "0px",
      },
    });
    expect(
      exerciseThumbnailPresentation({ exerciseId: "barbell-bench-press" }),
    ).toEqual({
      artId: "wg-bench-press",
      style: {
        "--exercise-art-scale": 1,
        "--exercise-art-offset-x": "0px",
        "--exercise-art-offset-y": "0px",
      },
    });
  });

  it("accepts bodyweight-only as a complete home-gym setup", () => {
    expect(
      setupSelectionValid({
        environment: "Home gym",
        equipment: ["bodyweight only"],
      }),
    ).toBe(true);
    expect(
      setupSelectionValid({ environment: "Home gym", equipment: [] }),
    ).toBe(false);
  });

  it("explains when selected equipment requires a different split", () => {
    expect(
      splitAdaptationCopy({
        days: Array.from({ length: 5 }, () => ({})),
        splitPreference: {
          label: "Push / Pull / Legs",
          honored: false,
          fallbackReason: "split-needs-pull-equipment",
        },
      }),
    ).toBe(
      "Push / Pull / Legs needs pulling equipment for dedicated pull sessions, so Rook used a structure that fits your available equipment.",
    );
    expect(
      splitAdaptationCopy({
        days: Array.from({ length: 5 }, () => ({})),
        splitPreference: {
          label: "Full Body",
          honored: false,
          fallbackReason: "bodyweight-high-frequency-volume",
        },
      }),
    ).toBe(
      "Rook adapted your Full Body preference to keep a high-frequency bodyweight plan within recoverable weekly volume.",
    );
  });
});

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
  it("compacts only continuous training-day schedules", () => {
    expect(formatScheduleDays(["Fri", "Tue", "Thu", "Mon", "Wed"])).toBe(
      "Mon–Fri",
    );
    expect(formatScheduleDays(["Mon", "Wed", "Fri", "Sat"])).toBe(
      "Mon, Wed, Fri, Sat",
    );
    expect(formatScheduleDays(["Sat", "Sun"])).toBe("Sat–Sun");
  });

  it("never formats a missing session length as null or undefined minutes", () => {
    const rows = profileTrainingRows({
      goal: "Build muscle",
      availableDays: ["Mon", "Thu"],
      sessionMinutes: null,
      equipment: [],
    });
    expect(rows).toEqual([
      ["Goal", "Build muscle"],
      ["Availability", "Mon, Thu"],
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

  it("formats the live workout clock without ambiguous accumulated minutes", () => {
    expect(formatWorkoutElapsedDuration(8)).toBe("00:08");
    expect(formatWorkoutElapsedDuration(40 * 60 + 8)).toBe("40:08");
    expect(formatWorkoutElapsedDuration(65 * 60 + 32)).toBe("1:05:32");
    expect(formatWorkoutElapsedDuration(530 * 60 + 35)).toBe("8:50:35");
    expect(formatWorkoutElapsedDuration(Number.NaN)).toBe("00:00");
  });

  it("summarizes live progress and only adds the date for an older active workout", () => {
    const now = new Date("2026-09-02T12:00:00").getTime();
    const workout = {
      startedAt: now - 4 * 60 * 1000,
      exercises: [
        { sets: [{ completed: true }, { completed: false }] },
        { sets: [{ completed: false }] },
      ],
    };
    expect(activeWorkoutNoticeDetails(workout, "2026-09-02", now)).toBe(
      "1 / 3 sets · 4 min",
    );
    expect(activeWorkoutNoticeDetails(workout, "2026-09-01", now)).toBe(
      "Tuesday, Sep 1 · 1 / 3 sets · 4 min",
    );
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
    expect(
      exerciseHistoryWeightLabel({
        loadRequirement: "none",
        loadContext: "Band",
      }),
    ).toBe("Band");
    expect(
      exerciseHistoryWeightLabel({
        bodyweight: true,
        loadRequirement: "optional",
        weight: 10,
      }),
    ).toBe("+10 kg");
  });

  it("labels every historical result with its meaning", () => {
    expect(
      exerciseHistoryPerformanceLabel({ exerciseId: "barbell-bench-press" }, [
        { completed: true, reps: 8 },
        { completed: true, reps: 7 },
      ]),
    ).toBe("8 / 7 reps");
    expect(
      exerciseHistoryPerformanceLabel({ exerciseId: "plank" }, [
        { completed: true, reps: 45 },
      ]),
    ).toBe("45 sec");
  });

  it("keeps varying reps compact and includes RIR only when consistently logged", () => {
    expect(
      exerciseHistoryPerformanceLabel({ exerciseId: "barbell-bench-press" }, [
        { completed: true, reps: 8, rir: 2 },
        { completed: true, reps: 8, rir: 2 },
        { completed: true, reps: 7, rir: 2 },
      ]),
    ).toBe("8 / 8 / 7 reps · 2 RIR");
    expect(
      exerciseHistoryPerformanceLabel({ exerciseId: "barbell-bench-press" }, [
        { completed: true, reps: 8, rir: 2 },
        { completed: true, reps: 7, rir: null },
      ]),
    ).toBe("8 / 7 reps");
  });

  it("finds exercise history globally across plans and the latest relevant load", () => {
    const workouts = [
      {
        completedAt: "2026-08-01T12:00:00.000Z",
        programId: "old-plan",
        exercises: [
          {
            exerciseId: "barbell-bench-press",
            sets: [{ completed: true, reps: 8, weight: 80 }],
          },
        ],
      },
      {
        completedAt: "2026-08-20T12:00:00.000Z",
        programId: "new-plan",
        exercises: [
          {
            exerciseId: "barbell-bench-press",
            sets: [{ completed: true, reps: 8, weight: null }],
          },
        ],
      },
    ];
    const history = exerciseHistoryEntries(
      workouts,
      "barbell-bench-press",
    );
    expect(history).toHaveLength(2);
    expect(latestLoggedWeightSet(history)?.weight).toBe(80);
  });
});

describe("workout input and duration contracts", () => {
  it("requires reps and meaningful load only when the exercise uses external weight", () => {
    expect(
      workingSetCanComplete(
        { exerciseId: "barbell-bench-press" },
        { weight: null, reps: 8 },
      ),
    ).toBe(false);
    expect(
      workingSetCanComplete(
        { exerciseId: "barbell-bench-press" },
        { weight: 100, reps: 8 },
      ),
    ).toBe(true);
    expect(
      workingSetCanComplete(
        { exerciseId: "push-up" },
        { weight: null, reps: 12 },
      ),
    ).toBe(true);
    expect(
      workingSetCanComplete(
        { exerciseId: "plank" },
        { weight: null, reps: 0 },
      ),
    ).toBe(false);
  });

  it("accepts decimal load entry, decimal commas and integer-only reps", () => {
    expect(normalizeStepperValue("52.5")).toBe(52.5);
    expect(normalizeStepperValue("27,5")).toBe(27.5);
    expect(normalizeStepperValue("8.9", { min: 1, integer: true })).toBe(8);
    expect(normalizeStepperValue("invalid")).toBeUndefined();
    expect(validStepperDraft("52,")).toBe(true);
    expect(validStepperDraft("52,5")).toBe(true);
    expect(validStepperDraft("52.5")).toBe(true);
    expect(validStepperDraft("52,5.5")).toBe(false);
    expect(validStepperDraft("8", { integer: true })).toBe(true);
    expect(validStepperDraft("8,5", { integer: true })).toBe(false);
  });

  it("moves manually entered weights to the next practical increment", () => {
    expect(alignedStepperValue(141, 5, 1)).toBe(145);
    expect(alignedStepperValue(141, 5, -1)).toBe(140);
    expect(alignedStepperValue(140, 5, 1)).toBe(145);
    expect(alignedStepperValue(140, 5, -1)).toBe(135);
    expect(alignedStepperValue(36.25, 2.5, 1)).toBe(37.5);
    expect(alignedStepperValue(36.25, 2.5, -1)).toBe(35);
    expect(alignedStepperValue(36.4, 1.25, 1)).toBe(37.5);
    expect(alignedStepperValue(36.4, 1.25, -1)).toBe(36.25);
    expect(alignedStepperValue(1, 5, -1, 0)).toBe(0);
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

  it("separates confident imported workout modifiers while preserving their language", () => {
    expect(workoutTitleParts("NOGE B (FUNKCIJA)", "Mon")).toEqual({
      primary: "NOGE B",
      detail: "Funkcija",
      context: "",
    });
    expect(workoutTitleParts("NOGE A (MOČ)", "Mon")).toEqual({
      primary: "NOGE A",
      detail: "Moč",
      context: "",
    });
    expect(workoutTitleParts("Upper (Chest Focused)", "Mon")).toEqual({
      primary: "Upper",
      detail: "Chest focus",
      context: "",
    });
    expect(workoutTitleParts("Pull - Back Width", "Mon")).toEqual({
      primary: "Pull",
      detail: "Back Width",
      context: "",
    });
    expect(workoutTitleParts("Lower Hypertrophy", "Mon")).toEqual({
      primary: "Lower",
      detail: "Hypertrophy",
      context: "",
    });
    expect(workoutTitleParts("Chest-focused Upper", "Mon")).toEqual({
      primary: "Upper",
      detail: "Chest focus",
      context: "",
    });
  });

  it("keeps ambiguous custom workout titles intact", () => {
    expect(workoutTitleParts("Monday Madness (John's version)", "Mon")).toEqual({
      primary: "Monday Madness (John's version)",
      detail: "",
      context: "",
    });
    expect(workoutTitleParts("Upper - Outdoors", "Mon")).toEqual({
      primary: "Upper - Outdoors",
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
      "Fewer hard sets",
      "More sets and practice",
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
