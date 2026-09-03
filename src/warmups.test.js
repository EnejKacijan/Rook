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
  it("uses actionable relative guidance instead of invented kilograms when load is unknown", () => {
    const firstSession = workout(["incline-machine-press"]);
    firstSession.exercises[0].sets[0].weight = null;
    firstSession.exercises[0].repMin = 6;
    firstSession.exercises[0].repMax = 8;
    const result = generateWarmup(
      firstSession,
      profile({ experience: "Beginner" }),
      exerciseCatalog,
    );
    const sets = result.rampUpSets[0].sets;
    expect(sets.every((set) => set.weight === null)).toBe(true);
    expect(sets.map((set) => set.loadInstruction)).toEqual([
      "Very light",
      "Moderate",
    ]);
    expect(sets[0]).toMatchObject({ technique: true, reps: 8 });
    expect(result.movementPreparation).toEqual([]);
  });

  it("builds a gradual low-fatigue ramp from an established 6–8 rep load", () => {
    const established = workout(["incline-machine-press"]);
    established.exercises[0].sets[0].weight = 75;
    established.exercises[0].repMin = 6;
    established.exercises[0].repMax = 8;
    const sets = generateWarmup(established, profile(), exerciseCatalog)
      .rampUpSets[0].sets;
    expect(sets.map((set) => set.weight)).toEqual([35, 50, 60]);
    expect(sets.map((set) => set.reps)).toEqual([8, 5, 2]);
    expect(sets.every((set) => set.weight % 5 === 0 && set.weight < 75)).toBe(
      true,
    );
  });

  it("uses more gradual ramps for heavy low-rep compounds and one for high-rep machines", () => {
    const heavy = workout(["barbell-bench-press"]);
    heavy.exercises[0].repMin = 3;
    heavy.exercises[0].repMax = 5;
    const heavySets = generateWarmup(heavy, profile(), exerciseCatalog)
      .rampUpSets[0].sets;
    expect(heavySets).toHaveLength(3);
    expect(heavySets.map((set) => set.reps)).toEqual([8, 5, 2]);

    const highRepMachine = workout(["machine-chest-press"]);
    highRepMachine.exercises[0].repMin = 10;
    highRepMachine.exercises[0].repMax = 15;
    expect(
      generateWarmup(highRepMachine, profile(), exerciseCatalog).rampUpSets[0]
        .sets,
    ).toHaveLength(1);
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
    expect(short.nonRampMinutes).toBe(0);
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
    expect(result.movementPreparation).toEqual([]);
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

  it("sequences the first two distinct compound warm-ups just in time", () => {
    const result = generateWarmup(workout(), profile(), exerciseCatalog);
    expect(result.generatorVersion).toBe(3);
    expect(result.stages).toHaveLength(2);
    expect(result.stages[0]).toMatchObject({
      exerciseIndex: 0,
      exerciseId: "barbell-bench-press",
    });
    expect(result.stages[0].general.length).toBeGreaterThan(0);
    expect(result.stages[0].movementPreparation).toEqual([]);
    expect(result.stages[0].rampUpSets.map((entry) => entry.exerciseId)).toEqual([
      "barbell-bench-press",
    ]);
    expect(result.stages[1]).toMatchObject({
      exerciseIndex: 1,
      exerciseId: "chest-supported-row",
      general: [],
      movementPreparation: [],
    });
    expect(result.stages[1].rampUpSets.map((entry) => entry.exerciseId)).toEqual([
      "chest-supported-row",
    ]);
  });

  it("skips overlapping compounds but prepares a later distinct movement family", () => {
    const sameFamily = generateWarmup(
      workout([
        "barbell-bench-press",
        "incline-dumbbell-press",
        "chest-supported-row",
      ]),
      profile(),
      exerciseCatalog,
    );
    expect(sameFamily.stages.map((stage) => stage.exerciseIndex)).toEqual([
      0,
      2,
    ]);
    expect(
      sameFamily.rampUpSets.map((entry) => entry.exerciseId),
    ).not.toContain("incline-dumbbell-press");

    const isolationSecond = generateWarmup(
      workout(["barbell-bench-press", "lateral-raise", "leg-press"]),
      profile(),
      exerciseCatalog,
    );
    expect(isolationSecond.stages.map((stage) => stage.exerciseIndex)).toEqual([
      0,
      2,
    ]);
  });

  it("scales preparation breadth with available workout time", () => {
    const threeFamilies = workout([
      "barbell-bench-press",
      "chest-supported-row",
      "leg-press",
    ]);
    const short = generateWarmup(
      threeFamilies,
      profile({ sessionMinutes: 30 }),
      exerciseCatalog,
    );
    const long = generateWarmup(
      threeFamilies,
      profile({ sessionMinutes: 90 }),
      exerciseCatalog,
    );
    expect(short.general).toEqual([]);
    expect(short.rampUpSets).toHaveLength(1);
    expect(long.general[0].minutes).toBe(4);
    expect(long.rampUpSets).toHaveLength(3);
  });

  it("keeps the general first stage for a custom exercise without inventing ramp sets", () => {
    const customFirst = workout([
      "imported-custom-balance-drill",
      "barbell-bench-press",
    ]);
    customFirst.exercises[0].importedName = "My balance drill";
    const result = generateWarmup(customFirst, profile(), exerciseCatalog);
    expect(result.stages[0]).toMatchObject({
      exerciseIndex: 0,
      exerciseName: "My balance drill",
      rampUpSets: [],
    });
    expect(result.stages[0].general.length).toBeGreaterThan(0);
    expect(result.stages[1].exerciseId).toBe("barbell-bench-press");
  });

  it("prepares both movements together when the first two exercises are a superset", () => {
    const paired = workout();
    paired.exercises.forEach((exercise) => {
      exercise.supersetId = "pair-1";
    });
    const result = generateWarmup(paired, profile(), exerciseCatalog);
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0].rampUpSets.map((entry) => entry.exerciseId)).toEqual([
      "barbell-bench-press",
      "chest-supported-row",
    ]);
  });

  it("preserves stage progress across reload refresh and resets replaced exercises", () => {
    const active = workout();
    active.warmup = generateWarmup(active, profile(), exerciseCatalog);
    active.warmup.stages[0].completed = true;
    active.warmup.stages[0].general[0].completed = true;
    active.warmup.stages[0].rampUpSets[0].sets[0].completed = true;
    active.warmup.stages[1].skipped = true;
    refreshWorkoutWarmup(active, profile());
    expect(active.warmup.stages[0].completed).toBe(true);
    expect(active.warmup.stages[0].general[0].completed).toBe(true);
    expect(active.warmup.stages[0].rampUpSets[0].sets[0].completed).toBe(true);
    expect(active.warmup.stages[1].skipped).toBe(true);

    active.exercises[0].exerciseId = "machine-chest-press";
    refreshWorkoutWarmup(active, profile());
    expect(active.warmup.stages[0].exerciseId).toBe("machine-chest-press");
    expect(active.warmup.stages[0].completed).toBe(false);
    expect(active.warmup.stages[1].skipped).toBe(true);
  });
});
