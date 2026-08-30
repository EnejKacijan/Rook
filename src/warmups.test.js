import { describe, expect, it } from "vitest";
import {
  blankState,
  buildProgram,
  exerciseCatalog,
  refreshWorkoutWarmup,
  startWorkout,
} from "./domain.js";
import { generateWarmup, rampWeightForWorkingLoad } from "./warmups.js";

function profile(overrides = {}) {
  return {
    ...blankState().profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 3,
    availableDays: ["Mon", "Wed", "Fri"],
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    recommendedWarmupsEnabled: true,
    rampUpSetsEnabled: true,
    ...overrides,
  };
}

function workout(ids = ["barbell-bench-press", "chest-supported-row"]) {
  return {
    exercises: ids.map((exerciseId, index) => ({
      id: `exercise-${index}`,
      exerciseId,
      programmingRole: "main",
      sets: [{ weight: 100, reps: 8 }],
    })),
  };
}

describe("personalized warm-ups", () => {
  it("turns a working-set load into a practical rounded ramp-up load", () => {
    expect(rampWeightForWorkingLoad(80, 50, 2.5)).toBe(40);
    expect(rampWeightForWorkingLoad(83, 70, 2.5)).toBe(57.5);
    expect(rampWeightForWorkingLoad(null, 50, 2.5)).toBeNull();
  });
  it("keeps non-ramp preparation compact and reduces it for short sessions", () => {
    const normal = generateWarmup(workout(), profile(), exerciseCatalog);
    const short = generateWarmup(
      workout(),
      profile({ sessionMinutes: 25 }),
      exerciseCatalog,
    );
    expect(normal.nonRampMinutes).toBeGreaterThanOrEqual(3);
    expect(normal.nonRampMinutes).toBeLessThanOrEqual(8);
    expect(short.nonRampMinutes).toBe(3);
    expect(short.movementPreparation).toEqual([]);
    expect(short.rampUpSets).toHaveLength(1);
  });

  it("uses available equipment and lets restrictions override generic choices", () => {
    const home = generateWarmup(
      workout(),
      profile({ environment: "Home gym", equipment: ["dumbbells"] }),
      exerciseCatalog,
    );
    expect(home.general[0].label).toMatch(/walk|march/i);
    expect(home.general[0].label).not.toMatch(/treadmill|bike|elliptical/i);
    const restricted = generateWarmup(
      workout(),
      profile({ avoid: "Avoid walking, cycling and the elliptical." }),
      exerciseCatalog,
    );
    expect(restricted.general).toEqual([]);
  });

  it("does not invent rehabilitation for unresolved pain or recent surgery", () => {
    const held = generateWarmup(
      workout(),
      profile({ avoid: "Recent shoulder surgery with unresolved pain." }),
      exerciseCatalog,
    );
    expect(held.safetyMessage).toMatch(/training is paused|rehabilitation/i);
    expect(held.general).toEqual([]);
    expect(held.movementPreparation).toEqual([]);
    expect(held.rampUpSets).toEqual([]);
    const approved = generateWarmup(
      workout(),
      profile({
        avoid: "Recent surgery. Clinician-approved activities: easy walking",
      }),
      exerciseCatalog,
    );
    expect(approved.general).toEqual([]);
    expect(approved.safetyMessage).toMatch(/training is paused/i);
    expect(approved.rampUpSets).toEqual([]);
  });

  it("treats old injury language conservatively without presenting rehab", () => {
    const result = generateWarmup(
      workout(),
      profile({ avoid: "Previous shoulder injury; no current pain." }),
      exerciseCatalog,
    );
    expect(result.conservative).toBe(true);
    expect(result.movementPreparation[0].label).toMatch(
      /comfortable, non-provocative/i,
    );
    expect(result.safetyMessage).toBeNull();
  });

  it("keeps general warm-ups and ramp-up sets independently configurable", () => {
    const rampsOnly = generateWarmup(
      workout(),
      profile({ recommendedWarmupsEnabled: false, rampUpSetsEnabled: true }),
      exerciseCatalog,
    );
    expect(rampsOnly.general).toEqual([]);
    expect(rampsOnly.movementPreparation).toEqual([]);
    expect(rampsOnly.rampUpSets.length).toBeGreaterThan(0);
    expect(
      generateWarmup(
        workout(),
        profile({ recommendedWarmupsEnabled: false, rampUpSetsEnabled: false }),
        exerciseCatalog,
      ),
    ).toBeNull();
  });

  it("honors the plan toggle and recomputes recommendations after exercise replacement", () => {
    const state = blankState();
    state.profile = profile();
    state.program = buildProgram(state.profile);
    state.program.includeRecommendedWarmups = false;
    const active = startWorkout(state, state.program.days[0]);
    expect(active.warmup.general).toEqual([]);
    expect(active.warmup.rampUpSets.length).toBeGreaterThan(0);
    active.exercises[0].exerciseId = "leg-press";
    refreshWorkoutWarmup(active, state.profile, state.program);
    expect(active.warmup.rampUpSets[0].exerciseId).toBe("leg-press");
    expect(
      active.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    ).toBeGreaterThan(0);
  });
});
