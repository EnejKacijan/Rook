import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROGRAM_TEMPLATES,
  STORAGE_KEY,
  WEEKDAYS,
  adaptTodayProposal,
  adaptedTemplateForToday,
  applyCoachAction,
  applyWeekScheduleChanges,
  authoritativeImportedExerciseNames,
  authoritativeImportedWeights,
  blankState,
  buildProgram,
  candidateScore,
  coachActionConflict,
  coachContext,
  combinedTrainingPriorities,
  compatibleReplacementCandidates,
  completeWorkout,
  conditioningForProfile,
  consistencyForCurrentWeek,
  currentWeekSchedule,
  deterministicCoach,
  displayWeight,
  estimateSessionMinutes,
  exerciseCatalog,
  exerciseMatchesQuery,
  exerciseName,
  exerciseValueLabel,
  firstScheduledDate,
  hasBalancedPullEquipment,
  isExerciseAllowed,
  isExerciseAutoGenerationBlocked,
  isoDay,
  loadState,
  matchImportedExerciseName,
  missedPlannedWorkouts,
  nextScheduledWorkout,
  normalizeGeneratedProgram,
  normalizeWorkoutName,
  optionalStrengthForDate,
  plannedWorkoutForDate,
  pluralize,
  previousExercise,
  progressionFor,
  programWarnings,
  proposeOptionalStrengthWorkout,
  proposeWeekScheduleChange,
  recentExerciseProgress,
  replacementCandidates,
  roundedEstimate,
  saveState,
  startWorkout,
  storedWeight,
  targetLabel,
  templateIdForFrequency,
  validateProgram,
  validateWeekScheduleChanges,
  weekDate,
  weekday,
  weeklyDirectVolume,
  weeklyFractionalVolume,
  workoutSetSummary,
} from "./domain.js";

function profile(overrides = {}) {
  return {
    ...blankState().profile,
    goal: "Build muscle",
    experience: "Beginner",
    daysPerWeek: 3,
    availableDays: ["Mon", "Wed", "Fri"],
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Balanced"],
    avoid: "",
    exercisePreference: "No preference",
    effortStyle: "Balanced workload · usually 3 sets · 1–2 RIR",
    ...overrides,
  };
}
function stateFor(overrides = {}) {
  const state = blankState();
  state.profile = profile(overrides);
  state.program = buildProgram(state.profile);
  state.selectedDay = state.program.days[0].weekday;
  return state;
}

describe("personalized training domain", () => {
  beforeEach(() => localStorage.clear());
  it("starts onboarding with Balanced selected as the default priority", () => {
    const state = blankState();
    expect(state.profile.priorities).toEqual(["Balanced"]);
    expect(state.profile.prioritySources.manual).toEqual(["Balanced"]);
    expect(state.profile.effortStyle).toBe(
      "Balanced workload · usually 3 sets · 1–2 RIR",
    );
  });
  it("keeps familiar bench names discoverable without splitting history identity", () => {
    expect(exerciseCatalog["barbell-bench-press"].name).toBe("Bench Press");
    expect(exerciseCatalog["incline-barbell-bench-press"].name).toBe(
      "Incline Bench Press",
    );
    expect(matchImportedExerciseName("Incline Barbell Bench Press")).toMatchObject(
      { exerciseId: "incline-barbell-bench-press" },
    );
    expect(matchImportedExerciseName("Barbell Bench Press")).toMatchObject({
      exerciseId: "barbell-bench-press",
    });
  });

  it("searches canonical names and aliases", () => {
    expect(
      exerciseMatchesQuery(exerciseCatalog["romanian-deadlift"], "RDL"),
    ).toBe(true);
    expect(
      exerciseMatchesQuery(
        exerciseCatalog["incline-dumbbell-press"],
        "incline dumbbell bench",
      ),
    ).toBe(true);
    expect(
      exerciseMatchesQuery(exerciseCatalog["barbell-row"], "bent over row"),
    ).toBe(true);
  });

  it("adds the four high-value catalog gaps with valid metadata", () => {
    const ids = [
      "machine-lateral-raise",
      "smith-machine-romanian-deadlift",
      "cable-chest-press",
      "dumbbell-shrug",
    ];
    ids.forEach((id) => {
      const item = exerciseCatalog[id];
      expect(item).toBeTruthy();
      expect(item.aliases.length).toBeGreaterThan(0);
      expect(item.equipment.length).toBeGreaterThan(0);
      expect(item.increment).toBeGreaterThan(0);
      expect(item.restSeconds).toBeGreaterThanOrEqual(30);
    });
    expect(isExerciseAutoGenerationBlocked("dumbbell-shrug")).toBe(true);
    expect(isExerciseAutoGenerationBlocked("machine-lateral-raise")).toBe(
      true,
    );
  });
  it("treats Plank and Side Plank prescriptions as timed holds", () => {
    const p = profile({
      daysPerWeek: 1,
      availableDays: ["Mon"],
      sessionMinutes: 60,
    });
    const raw = {
      name: "Timed Core",
      days: [
        {
          weekday: "Mon",
          location: "Commercial gym",
          name: "Core",
          estimatedMinutes: 20,
          exercises: [
            {
              exerciseId: "plank",
              sets: 3,
              repMin: 10,
              repMax: 15,
              targetRir: 2,
              restSeconds: 60,
            },
            {
              exerciseId: "side-plank",
              sets: 2,
              repMin: 10,
              repMax: 15,
              targetRir: 2,
              restSeconds: 60,
            },
          ],
        },
      ],
    };
    const program = normalizeGeneratedProgram(raw, p);
    const [plank, sidePlank] = program.days[0].exercises;
    expect([plank.repMin, plank.repMax, plank.targetRir]).toEqual([
      30,
      60,
      null,
    ]);
    expect([sidePlank.repMin, sidePlank.repMax, sidePlank.targetRir]).toEqual([
      20,
      45,
      null,
    ]);
    expect(targetLabel(plank)).toBe("3 × 30–60 sec");
    expect(
      targetLabel({
        ...plank,
        repMin: 30,
        repMax: 30,
      }),
    ).toBe("3 × 30 sec");
    expect(exerciseValueLabel(plank, 45)).toBe("45 sec");
  });
  it("removes a duplicated weekday from workout names", () => {
    expect(normalizeWorkoutName("SATURDAY \u2014 LOWER B", "Sat")).toBe(
      "LOWER B",
    );
    expect(normalizeWorkoutName("Upper A", "Mon")).toBe("Upper A");
    expect(normalizeWorkoutName("Monday", "Mon")).toBe("Workout");
  });
  it("starts a fresh user with no plan, history, progress, or prefilled profile claims", () => {
    const state = blankState();
    expect(state.program).toBeNull();
    expect(state.workouts).toEqual([]);
    expect(state.conversations).toEqual([]);
    expect(state.profile.goal).toBeNull();
    expect(state.profile.daysPerWeek).toBeNull();
  });
  it("allows explicitly named custom exercises in manual plans without treating them as catalog exercises", () => {
    const p = profile();
    const program = buildProgram(p);
    const original = program.days[0].exercises[0];
    program.source = "manual";
    program.userEdited = true;
    program.days[0].exercises[0] = {
      ...original,
      exerciseId: "imported-custom-user-cable-press",
      exerciseSource: "imported-custom",
      importedName: "My Cable Press",
      originalImportedName: "My Cable Press",
      importedExercise: {
        id: "imported-custom-user-cable-press",
        name: "My Cable Press",
        source: "manual",
        pattern: null,
        muscles: null,
        equipment: null,
      },
      matchStatus: "confirmed-custom",
    };
    expect(validateProgram(program, p, { preserveSchedule: true }).valid).toBe(
      true,
    );
    program.source = "fixed-template";
    expect(validateProgram(program, p, { preserveSchedule: true }).valid).toBe(
      false,
    );
  });
  it("migrates existing profiles to real rest-timer and priority-source settings without losing nested defaults", () => {
    const state = stateFor({ priorities: ["Back"] });
    state.profile.onboardingComplete = true;
    delete state.profile.restTimerEnabled;
    delete state.profile.restTimerAutoStart;
    delete state.profile.restTimerSeconds;
    delete state.profile.prioritySources;
    state.profile.increments = { barbell: 3 };
    saveState(state);
    const loaded = loadState();
    expect(loaded.profile.restTimerEnabled).toBe(true);
    expect(loaded.profile.restTimerAutoStart).toBe(true);
    expect(loaded.profile.restTimerSeconds).toBeNull();
    expect(loaded.profile.prioritySources.manual).toEqual(["Back"]);
    expect(loaded.profile.increments).toMatchObject({
      barbell: 3,
      dumbbells: 2,
      machines: 5,
      cables: 2.5,
    });
  });
  it("builds meaningfully different valid programs from different complete profiles", () => {
    const profiles = [
      profile(),
      profile({
        experience: "Intermediate",
        daysPerWeek: 4,
        availableDays: ["Mon", "Tue", "Thu", "Fri"],
        sessionMinutes: 45,
        priorities: ["Chest", "Back"],
      }),
      profile({
        goal: "Get stronger",
        experience: "Advanced",
        daysPerWeek: 5,
        availableDays: WEEKDAYS.slice(0, 5),
        sessionMinutes: 75,
      }),
      profile({
        daysPerWeek: 2,
        availableDays: ["Tue", "Sat"],
        sessionMinutes: 30,
        environment: "Home gym",
        equipment: ["dumbbells", "bodyweight only"],
      }),
    ];
    const programs = profiles.map((value) => buildProgram(value));
    programs.forEach((program, index) =>
      expect(validateProgram(program, profiles[index])).toEqual({
        valid: true,
        errors: [],
      }),
    );
    expect(
      new Set(
        programs.map(
          (program) =>
            `${program.name}:${program.days.length}:${program.days[0].exercises.length}`,
        ),
      ).size,
    ).toBe(4);
  });
  it("maps every supported frequency to one stable structural template", () => {
    const expected = {
      2: "T2-FB",
      3: "T3-FB",
      4: "T4-UL",
      5: "T5-ULPPL",
      6: "T6-PPL2",
    };
    for (const [days, templateId] of Object.entries(expected)) {
      const p = profile({ daysPerWeek: Number(days), availableDays: WEEKDAYS });
      const program = buildProgram(p);
      expect(templateIdForFrequency(days)).toBe(templateId);
      expect(program).toMatchObject({
        templateId,
        source: "fixed-template",
        programmingVersion: 3,
      });
      expect(program.days).toHaveLength(
        PROGRAM_TEMPLATES[templateId].sessions.length,
      );
      expect(
        validateProgram(program, p, { requireProgramQuality: true }).valid,
      ).toBe(true);
    }
  });
  it("globally blocks excluded exercises and migrates them out of saved plans and pending workouts", () => {
    const p = profile();
    expect(isExerciseAllowed(exerciseCatalog["dead-bug"], p)).toBe(false);
    expect(isExerciseAllowed(exerciseCatalog["prone-y-raise"], p)).toBe(false);
    expect(isExerciseAllowed(exerciseCatalog["reverse-snow-angel"], p)).toBe(
      false,
    );
    for (const goal of [
      "General fitness",
      "Build muscle",
      "Get stronger",
      "Athletic performance",
    ])
      for (let days = 2; days <= 6; days++) {
        const program = buildProgram(
          profile({ goal, daysPerWeek: days, availableDays: WEEKDAYS }),
        );
        expect(
          program.days
            .flatMap((day) => day.exercises)
            .some((exercise) =>
              ["dead-bug", "prone-y-raise", "reverse-snow-angel"].includes(
                exercise.exerciseId,
              ),
            ),
        ).toBe(false);
      }
    const state = stateFor();
    state.profile.onboardingComplete = true;
    const day = state.program.days[0];
    day.exercises = day.exercises.filter(
      (exercise, index) =>
        index === 0 || exercise.exerciseId !== "reverse-crunch",
    );
    day.exercises[0] = {
      ...day.exercises[0],
      exerciseId: "dead-bug",
      defaultIncrement: 1,
      restSeconds: 60,
    };
    day.estimatedMinutes = 60;
    state.activeWorkout = startWorkout(state, day);
    const optionalWorkout = structuredClone(day);
    optionalWorkout.exercises[0] = {
      ...optionalWorkout.exercises[0],
      exerciseId: "prone-y-raise",
    };
    state.optionalSessions = [
      {
        id: "optional",
        kind: "Strength",
        status: "planned",
        workout: optionalWorkout,
      },
    ];
    state.todayAdaptation = {
      id: "adapted",
      date: isoDay(),
      programDayId: day.id,
      exerciseIds: ["dead-bug", "prone-y-raise"],
    };
    saveState(state);
    const loaded = loadState();
    const liveExercises = [
      ...loaded.program.days.flatMap((value) => value.exercises),
      ...loaded.activeWorkout.exercises,
      ...loaded.optionalSessions.flatMap(
        (session) => session.workout.exercises,
      ),
    ];
    expect(
      liveExercises.some((exercise) =>
        ["dead-bug", "prone-y-raise", "reverse-snow-angel"].includes(
          exercise.exerciseId,
        ),
      ),
    ).toBe(false);
    expect(
      liveExercises.some(
        (exercise) => exercise.exerciseId === "reverse-crunch",
      ),
    ).toBe(true);
    expect(
      liveExercises.some((exercise) => exercise.exerciseId === "lateral-raise"),
    ).toBe(true);
    expect(loaded.todayAdaptation.exerciseIds).toEqual([
      "reverse-crunch",
      "lateral-raise",
    ]);
    const raw = {
      name: "Blocked exercise",
      days: [
        {
          weekday: "Mon",
          location: "Commercial gym",
          name: "Core",
          estimatedMinutes: 15,
          exercises: [
            {
              exerciseId: "dead-bug",
              sets: 2,
              repMin: 8,
              repMax: 10,
              targetRir: 2,
              restSeconds: 60,
            },
          ],
        },
      ],
    };
    expect(() => normalizeGeneratedProgram(raw, p)).toThrow(
      /Dead Bug is not available/i,
    );
    raw.days[0].exercises[0].exerciseId = "prone-y-raise";
    expect(() => normalizeGeneratedProgram(raw, p)).toThrow(
      /Prone Y Raise is not available/i,
    );
    raw.days[0].exercises[0].exerciseId = "reverse-snow-angel";
    expect(() => normalizeGeneratedProgram(raw, p)).toThrow(
      /Reverse Snow Angel is not available/i,
    );
  });
  it("requires real pulling equipment instead of inventing a balanced bodyweight-only plan", () => {
    const bodyweight = profile({
      environment: "Home gym",
      equipment: ["bodyweight only"],
    });
    expect(hasBalancedPullEquipment(bodyweight)).toBe(false);
    for (const equipment of [
      ["resistance bands"],
      ["dumbbells"],
      ["pull-up bar"],
      ["barbell/rack/bench"],
    ])
      expect(hasBalancedPullEquipment({ ...bodyweight, equipment })).toBe(true);
    expect(
      ["floor-lat-pulldown", "prone-w-raise", "prone-swimmer-pull"].every(
        (id) => isExerciseAutoGenerationBlocked(exerciseCatalog[id]),
      ),
    ).toBe(true);
  });
  it("keeps generated weekly fractional volume inside the hard cap", () => {
    for (const goal of [
      "General fitness",
      "Build muscle",
      "Lose fat",
      "Get stronger",
      "Athletic performance",
    ])
      for (const experience of ["Beginner", "Intermediate", "Advanced"])
        for (let days = 2; days <= 6; days++) {
          const p = profile({
            goal,
            experience,
            daysPerWeek: days,
            availableDays: WEEKDAYS,
            priorities: ["Chest", "Back"],
            sessionMinutes: 60,
          });
          const program = buildProgram(p);
          expect(
            Math.max(...Object.values(weeklyFractionalVolume(program))),
          ).toBeLessThanOrEqual(20);
          expect(
            validateProgram(program, p, { requireProgramQuality: true }).valid,
          ).toBe(true);
          expect(
            programWarnings(program, p).some(
              (item) => item.code === "beginner_failure_compound",
            ),
          ).toBe(false);
        }
  });
  it("treats a named exercise restriction narrowly and a movement-family restriction broadly", () => {
    const p = profile();
    expect(
      isExerciseAllowed(exerciseCatalog["pull-up"], {
        ...p,
        avoid: "No pull-ups",
      }),
    ).toBe(false);
    expect(
      isExerciseAllowed(exerciseCatalog["lat-pulldown"], {
        ...p,
        avoid: "No pull-ups",
      }),
    ).toBe(true);
    expect(
      isExerciseAllowed(exerciseCatalog["back-squat"], {
        ...p,
        avoid: "I cannot barbell squat.",
      }),
    ).toBe(false);
    expect(
      isExerciseAllowed(exerciseCatalog["goblet-squat"], {
        ...p,
        avoid: "I cannot barbell squat.",
      }),
    ).toBe(true);
    expect(
      isExerciseAllowed(exerciseCatalog["goblet-squat"], {
        ...p,
        avoid: "Avoid squats",
      }),
    ).toBe(false);
  });
  it("puts a low-skill power slot first for athletic sessions that support one", () => {
    const p = profile({
      goal: "Athletic performance",
      daysPerWeek: 3,
      availableDays: ["Mon", "Wed", "Fri"],
    });
    const program = buildProgram(p);
    expect(
      program.days.every(
        (day) => exerciseCatalog[day.exercises[0].exerciseId].kind === "power",
      ),
    ).toBe(true);
    expect(
      program.days
        .flatMap((day) => day.exercises)
        .filter(
          (exercise) => exerciseCatalog[exercise.exerciseId].kind === "power",
        )
        .every(
          (exercise) =>
            exercise.repMin === 2 &&
            exercise.repMax === 5 &&
            exercise.targetRir >= 3,
        ),
    ).toBe(true);
  });
  it("uses confirmed physique priorities as weighting without changing scheduling constraints", () => {
    const base = profile({
      experience: "Intermediate",
      daysPerWeek: 4,
      availableDays: ["Mon", "Tue", "Thu", "Sat"],
      sessionMinutes: 60,
      priorities: ["Balanced"],
    });
    const confirmed = [
      {
        priorityId: "upper_chest",
        label: "Upper chest",
        priorityLevel: "high",
        reason: "Possible emphasis.",
      },
      {
        priorityId: "lateral_delts",
        label: "Lateral delts",
        priorityLevel: "moderate",
        reason: "Possible emphasis.",
      },
    ];
    const focused = {
      ...base,
      priorities: combinedTrainingPriorities([], confirmed),
      prioritySources: {
        manual: [],
        physiqueSuggested: confirmed,
        physiqueConfirmed: confirmed,
      },
    };
    const normalPlan = buildProgram(base);
    const focusedPlan = buildProgram(focused);
    expect(focusedPlan.days.map((day) => day.weekday)).toEqual(
      normalPlan.days.map((day) => day.weekday),
    );
    expect(
      focusedPlan.days.map((day) => day.name.replace(/ ·.*$/, "")),
    ).toEqual(normalPlan.days.map((day) => day.name.replace(/ ·.*$/, "")));
    const focusSets = (program) =>
      program.days
        .flatMap((day) => day.exercises)
        .filter((item) =>
          ["incline-push", "shoulder-isolation"].includes(
            exerciseCatalog[item.exerciseId].pattern,
          ),
        )
        .reduce((sum, item) => sum + item.sets.length, 0);
    expect(focusSets(focusedPlan)).toBeGreaterThan(focusSets(normalPlan));
    expect(validateProgram(focusedPlan, focused)).toEqual({
      valid: true,
      errors: [],
    });
  });
  it("uses only selected available days and respects equipment", () => {
    const p = profile({
      daysPerWeek: 2,
      availableDays: ["Tue", "Sat"],
      environment: "Home gym",
      equipment: ["dumbbells", "bodyweight only"],
    });
    const program = buildProgram(p);
    expect(program.days.map((day) => day.weekday)).toEqual(["Tue", "Sat"]);
    for (const exercise of program.days.flatMap((day) => day.exercises))
      expect(isExerciseAllowed(exerciseCatalog[exercise.exerciseId], p)).toBe(
        true,
      );
  });
  it("rejects AI plans that disguise one repeated workout as differently named sessions", () => {
    const p = profile({ daysPerWeek: 3 });
    const base = buildProgram(p);
    const repeated = base.days[0].exercises.map((item) => ({
      exerciseId: item.exerciseId,
      sets: item.sets.length,
      repMin: item.repMin,
      repMax: item.repMax,
      targetRir: item.targetRir,
      restSeconds: item.restSeconds,
    }));
    const raw = {
      name: "Fake Split",
      days: p.availableDays.map((day, index) => ({
        weekday: day,
        location: "Commercial gym",
        name: ["Push", "Pull", "Lower"][index],
        estimatedMinutes: 60,
        exercises: repeated,
      })),
    };
    expect(() => normalizeGeneratedProgram(raw, p)).toThrow(
      /repeats the exact exercise selection|do not match that session focus/i,
    );
  });
  it("does not mistake squat and leg press for interchangeable compounds", () => {
    const p = profile({
      daysPerWeek: 1,
      availableDays: ["Mon"],
      sessionMinutes: 60,
    });
    const prescription = (exerciseId) => ({
      exerciseId,
      sets: 3,
      repMin: 8,
      repMax: 10,
      targetRir: 2,
      restSeconds: 120,
    });
    const raw = {
      name: "Lower Plan",
      days: [
        {
          weekday: "Mon",
          location: "Commercial gym",
          name: "Lower",
          estimatedMinutes: 45,
          exercises: [
            prescription("back-squat"),
            prescription("leg-press"),
            prescription("leg-curl"),
          ],
        },
      ],
    };
    expect(
      normalizeGeneratedProgram(raw, p).days[0].exercises.map(
        (item) => item.exerciseId,
      ),
    ).toEqual(["back-squat", "leg-press", "leg-curl"]);
  });
  it("offers enough no-equipment movements for varied bodyweight programming", () => {
    const p = profile({
      environment: "Home gym",
      equipment: ["bodyweight only"],
    });
    const allowed = Object.values(exerciseCatalog).filter((item) =>
      isExerciseAllowed(item, p),
    );
    expect(allowed.length).toBeGreaterThanOrEqual(12);
    expect(
      new Set(allowed.map((item) => item.pattern)).size,
    ).toBeGreaterThanOrEqual(8);
  });
  it("round-trips the regression import exercise identities and prescriptions without trusting suggested substitutions", () => {
    const p = profile({
      daysPerWeek: 4,
      availableDays: ["Mon", "Tue", "Thu", "Sat"],
      sessionMinutes: null,
    });
    const source = [
      [
        "Mon",
        "Upper A",
        [
          ["Barbell Bench Press", 3, 8, 10],
          ["Chest Supported Row", 3, 8, 12, "one-arm-dumbbell-row"],
          ["Overhead Press", 3, 8, 10, "barbell-overhead-press"],
          ["Lat Pulldown", 3, 10, 12],
          ["Dumbbell Lateral Raise", 3, 12, 15],
          ["Triceps Pushdown", 2, 10, 15],
        ],
      ],
      [
        "Tue",
        "Lower A",
        [
          ["Back Squat", 3, 6, 8],
          ["Romanian Deadlift", 3, 8, 10],
          ["Leg Press", 3, 10, 12],
          ["Leg Curl", 3, 10, 15],
          ["Standing Calf Raise", 3, 12, 15],
        ],
      ],
      [
        "Thu",
        "Upper B",
        [
          ["Incline Dumbbell Press", 3, 8, 10, "dumbbell-bench-press"],
          ["Pull-Up", 3, 6, 10],
          ["Seated Cable Row", 3, 8, 12],
          ["Machine Shoulder Press", 3, 8, 10, "machine-chest-press"],
          ["Cable Lateral Raise", 3, 12, 15],
          ["Dumbbell Curl", 2, 10, 15],
        ],
      ],
      [
        "Sat",
        "Lower B",
        [
          ["Deadlift", 3, 5, 6],
          ["Bulgarian Split Squat", 3, 8, 10],
          ["Hack Squat", 3, 8, 12],
          ["Seated Leg Curl", 3, 10, 15],
          ["Seated Calf Raise", 3, 12, 15],
        ],
      ],
    ];
    const raw = {
      name: "Imported Test Plan",
      days: source.map(([weekday, name, exercises]) => ({
        weekday,
        location: "Commercial gym",
        name,
        estimatedMinutes: 60,
        exercises: exercises.map(
          ([sourceName, sets, repMin, repMax, suggestedId = sourceName]) => ({
            exerciseId: suggestedId,
            sourceName: `${sourceName} - ${sets} x ${repMin}-${repMax}`,
            sets,
            repMin,
            repMax,
            targetRir: null,
            restSeconds: null,
            notes: null,
          }),
        ),
      })),
    };
    const program = normalizeGeneratedProgram(raw, p, {
      preservePrescription: true,
    });
    const imported = program.days.flatMap((day) => day.exercises);
    const expectedNames = source.flatMap(([, , exercises]) =>
      exercises.map(([name]) => name),
    );
    expect(imported.map(exerciseName)).toEqual(expectedNames);
    expect(
      imported.map((item) => [item.sets.length, item.repMin, item.repMax]),
    ).toEqual(
      source.flatMap(([, , exercises]) =>
        exercises.map(([, sets, min, max]) => [sets, min, max]),
      ),
    );
    expect(
      imported.every(
        (item) => item.targetRir === null && !targetLabel(item).includes("RIR"),
      ),
    ).toBe(true);
    expect(
      imported.find((item) => item.importedName === "Chest Supported Row")
        .exerciseId,
    ).toBe("chest-supported-row");
    expect(
      imported.find((item) => item.importedName === "Incline Dumbbell Press")
        .exerciseId,
    ).toBe("incline-dumbbell-press");
    expect(
      imported.find((item) => item.importedName === "Machine Shoulder Press")
        .exerciseId,
    ).toBe("machine-shoulder-press");
    expect(
      imported.find((item) => item.importedName === "Triceps Pushdown")
        .exerciseId,
    ).toBe("cable-triceps-pressdown");
    const overheadPress = imported.find(
      (item) => item.importedName === "Overhead Press",
    );
    expect(overheadPress.matchStatus).toBe("matched");
    expect(overheadPress.exerciseId).toBe("barbell-overhead-press");
    program.source = "ai-import";
    const state = blankState();
    state.profile = { ...p, onboardingComplete: true };
    state.program = program;
    saveState(state);
    const loaded = loadState();
    expect(
      loaded.program.days.flatMap((day) => day.exercises).map(exerciseName),
    ).toEqual(expectedNames);
    expect(loaded.program.days.map((day) => day.weekday)).toEqual(
      source.map(([day]) => day),
    );
    const today = loaded.program.days[0];
    expect(today.exercises.map(exerciseName)).toEqual(
      source[0][2].map(([name]) => name),
    );
    const active = startWorkout(loaded, today);
    expect(active.exercises.map(exerciseName)).toEqual(
      source[0][2].map(([name]) => name),
    );
  });
  it("matches unseen formatting only through exact identity or explicit aliases", () => {
    expect(matchImportedExerciseName(" DB Incline Press ")).toEqual({
      exerciseId: "incline-dumbbell-press",
      status: "alias",
    });
    expect(matchImportedExerciseName("PULL UP")).toEqual({
      exerciseId: "pull-up",
      status: "matched",
    });
    expect(matchImportedExerciseName("Low Row")).toEqual({
      exerciseId: "low-row",
      status: "matched",
    });
    expect(matchImportedExerciseName("Machine Low Row")).toEqual({
      exerciseId: "low-row",
      status: "alias",
    });
    expect(matchImportedExerciseName("Low-to-High Cable Fly")).toEqual({
      exerciseId: "low-to-high-cable-fly",
      status: "matched",
    });
    expect(matchImportedExerciseName("Low to High Cable Crossover")).toEqual({
      exerciseId: "low-to-high-cable-fly",
      status: "alias",
    });
    expect(matchImportedExerciseName("High-to-Low Cable Fly")).toEqual({
      exerciseId: "high-to-low-cable-fly",
      status: "matched",
    });
    expect(matchImportedExerciseName("Straight-Arm Pulldown")).toEqual({
      exerciseId: "straight-arm-cable-pulldown",
      status: "alias",
    });
    expect(matchImportedExerciseName("Single-Arm Cable Row")).toEqual({
      exerciseId: "single-arm-cable-row",
      status: "matched",
    });
    expect(matchImportedExerciseName("Rear Delt Fly")).toEqual({
      exerciseId: "dumbbell-rear-delt-fly",
      status: "alias",
    });
    expect(matchImportedExerciseName("Single-Leg Hamstring Curl")).toEqual({
      exerciseId: "standing-leg-curl",
      status: "alias",
    });
    expect(matchImportedExerciseName("Adductor Machine")).toEqual({
      exerciseId: "hip-adduction-machine",
      status: "alias",
    });
    expect(matchImportedExerciseName("Straight Bar Cable Pushdown")).toEqual({
      exerciseId: "cable-triceps-pressdown",
      status: "alias",
    });
    expect(matchImportedExerciseName("Overhead Press")).toEqual({
      exerciseId: "barbell-overhead-press",
      status: "matched",
    });
    expect(matchImportedExerciseName("Barbell Overhead Press")).toEqual({
      exerciseId: "barbell-overhead-press",
      status: "alias",
    });
    expect(matchImportedExerciseName("Rear-foot-elevated split squat")).toEqual(
      { exerciseId: "bulgarian-split-squat", status: "alias" },
    );
    for (const name of [
      "Machine Incline Press",
      "Dumbbell Chest-Supported Row",
      "Landmine Press",
    ])
      expect(matchImportedExerciseName(name)).toEqual({
        exerciseId: null,
        status: "unresolved",
      });
  });
  it("accepts only source-authoritative exercise names in their original order", () => {
    const source =
      "Mon · Upper A\n- Chest Supported Row — 3 × 8–12\nIncline Dumbbell Press | 3 x 8-10\nMachine Shoulder Press: 3 sets of 10";
    expect(
      authoritativeImportedExerciseNames(source, [
        "Chest Supported Row",
        "Incline Dumbbell Press",
        "Machine Shoulder Press",
      ]),
    ).toEqual([
      "Chest Supported Row",
      "Incline Dumbbell Press",
      "Machine Shoulder Press",
    ]);
    expect(() =>
      authoritativeImportedExerciseNames(source, [
        "Seated Cable Row",
        "Incline Dumbbell Press",
        "Machine Shoulder Press",
      ]),
    ).toThrow(/not found exactly/i);
    expect(() =>
      authoritativeImportedExerciseNames(source, [
        "Chest Supported Row",
        "Dumbbell Bench Press",
        "Machine Shoulder Press",
      ]),
    ).toThrow(/not found exactly/i);
    expect(() =>
      authoritativeImportedExerciseNames(source, [
        "Chest Supported Row",
        "Incline Dumbbell Press",
        "Machine Chest Press",
      ]),
    ).toThrow(/not found exactly/i);
    expect(() =>
      authoritativeImportedExerciseNames(source, [
        "Chest Supported Row",
        "Machine Shoulder Press",
        "Incline Dumbbell Press",
      ]),
    ).toThrow(/source plan/i);
  });
  it("verifies free-form notes without requiring dashes, @ symbols, or one exercise per line", () => {
    const source = `ponedeljek upper: Bench Press 3x8 80kg, Chest-Supported Row (3 sets po 10) 60 kg
sreda noge
1) Back Squat 100 kg reps 8/8/7
leg curl: 3 sets of 12, pavza 60 sec`;
    const proposed = [
      "Bench Press",
      "Chest Supported Row",
      "Back Squat",
      "leg curl",
    ];
    expect(authoritativeImportedExerciseNames(source, proposed)).toEqual([
      "Bench Press",
      "Chest-Supported Row",
      "Back Squat",
      "leg curl",
    ]);
    expect(
      authoritativeImportedWeights(
        source,
        proposed.map((sourceName, index) => ({
          sourceName,
          sets: index === 2 ? 3 : 3,
        })),
      ),
    ).toEqual([
      { weightKg: 80, setWeightsKg: null },
      { weightKg: 60, setWeightsKg: null },
      { weightKg: 100, setWeightsKg: null },
      { weightKg: null, setWeightsKg: null },
    ]);
  });
  it("preserves multilingual exercise names and parses localized plan structure", () => {
    const source =
      "Ponedeljek: Zgornji del\nPotisk s prsi — 3 serije po 8 @ 72,5 kg\nVeslanje z oporo prsi 3 × 10\nСреда · Спина\nТяга верхнего блока — 4 подхода по 10\n金曜日：下半身\nバーベルスクワット 3セット x 8";
    const names = [
      "Potisk s prsi",
      "Veslanje z oporo prsi",
      "Тяга верхнего блока",
      "バーベルスクワット",
    ];
    expect(authoritativeImportedExerciseNames(source, names)).toEqual(names);
    expect(
      authoritativeImportedWeights(
        source,
        names.map((sourceName, index) => ({
          sourceName,
          sets: index === 2 ? 4 : 3,
        })),
      ),
    ).toEqual([
      { weightKg: 72.5, setWeightsKg: null },
      { weightKg: null, setWeightsKg: null },
      { weightKg: null, setWeightsKg: null },
      { weightKg: null, setWeightsKg: null },
    ]);
    for (const name of names)
      expect(matchImportedExerciseName(name)).toEqual({
        exerciseId: null,
        status: "unresolved",
      });
  });
  it("extracts only explicitly written kilogram loads and carries them into the first workout", () => {
    const source =
      "Mon · Upper\nBarbell Bench Press — 3 × 8 @ 80 kg\nChest Supported Row — 3 × 10 · set 1 60kg, set 2 62.5kg, set 3 60kg\nLateral Raise — 3 × 12";
    const exercises = [
      { sourceName: "Barbell Bench Press", sets: 3 },
      { sourceName: "Chest Supported Row", sets: 3 },
      { sourceName: "Lateral Raise", sets: 3 },
    ];
    const weights = authoritativeImportedWeights(source, exercises);
    expect(weights).toEqual([
      { weightKg: 80, setWeightsKg: null },
      { weightKg: null, setWeightsKg: [60, 62.5, 60] },
      { weightKg: null, setWeightsKg: null },
    ]);
    const p = profile({
      daysPerWeek: 1,
      availableDays: ["Mon"],
      sessionMinutes: null,
    });
    const raw = {
      name: "Weighted import",
      days: [
        {
          weekday: "Mon",
          location: "Commercial gym",
          name: "Upper",
          estimatedMinutes: 60,
          exercises: exercises.map((exercise, index) => ({
            exerciseId: [
              "barbell-bench-press",
              "chest-supported-row",
              "lateral-raise",
            ][index],
            ...exercise,
            repMin: index === 2 ? 12 : index === 1 ? 10 : 8,
            repMax: index === 2 ? 12 : index === 1 ? 10 : 8,
            targetRir: null,
            restSeconds: null,
            notes: null,
            ...weights[index],
          })),
        },
      ],
    };
    const program = normalizeGeneratedProgram(raw, p, {
      preservePrescription: true,
    });
    expect(
      program.days[0].exercises.map((exercise) =>
        exercise.sets.map((set) => set.weight),
      ),
    ).toEqual([
      [80, 80, 80],
      [60, 62.5, 60],
      [null, null, null],
    ]);
    const active = startWorkout({ workouts: [] }, program.days[0]);
    expect(
      active.exercises.map((exercise) =>
        exercise.sets.map((set) => set.weight),
      ),
    ).toEqual([
      [80, 80, 80],
      [60, 62.5, 60],
      [null, null, null],
    ]);
  });
  it("does not accept ambiguous or invented kilogram prescriptions", () => {
    expect(
      authoritativeImportedWeights("Bench Press — 3 × 8", [
        { sourceName: "Bench Press", sets: 3 },
      ]),
    ).toEqual([{ weightKg: null, setWeightsKg: null }]);
    expect(
      authoritativeImportedWeights(
        "Bench Press — 3 × 8 · progress from 70 kg to 75 kg",
        [{ sourceName: "Bench Press", sets: 3 }],
      ),
    ).toEqual([{ weightKg: null, setWeightsKg: null }]);
  });
  it("imports unseen exercise names as stable custom identities without catalog substitution", () => {
    const names = [
      "Meadows Row",
      "Pendlay Row",
      "Larsen Press",
      "Cable Y-Raise",
      "Bayesian Cable Curl",
      "Sissy Squat",
      "Seal Row",
      "JM Press",
    ];
    const p = profile({
      daysPerWeek: 1,
      availableDays: ["Mon"],
      sessionMinutes: null,
    });
    const raw = {
      name: "Custom Import",
      days: [
        {
          weekday: "Mon",
          location: "Commercial gym",
          name: "Custom Day",
          estimatedMinutes: 60,
          exercises: names.map((sourceName, index) => ({
            exerciseId: index % 2 ? "barbell-row" : "machine-chest-press",
            sourceName,
            sets: 3,
            repMin: 8,
            repMax: 12,
            targetRir: null,
            restSeconds: null,
            notes: null,
          })),
        },
      ],
    };
    const first = normalizeGeneratedProgram(raw, p, {
      preservePrescription: true,
    });
    const second = normalizeGeneratedProgram(raw, p, {
      preservePrescription: true,
    });
    const imported = first.days[0].exercises;
    expect(imported.map(exerciseName)).toEqual(names);
    expect(
      imported.every(
        (item) =>
          item.exerciseId.startsWith("imported-custom-") &&
          item.exerciseSource === "imported-custom" &&
          item.importedExercise?.source === "imported",
      ),
    ).toBe(true);
    expect(imported.map((item) => item.exerciseId)).toEqual(
      second.days[0].exercises.map((item) => item.exerciseId),
    );
    expect(
      imported.every(
        (item) =>
          item.importedExercise.pattern === null &&
          item.importedExercise.muscles === null &&
          item.targetRir === null &&
          item.restSeconds === null,
      ),
    ).toBe(true);
  });
  it("keeps custom imported exercise history, progression, and Coach context under the same identity", () => {
    const p = profile({
      daysPerWeek: 1,
      availableDays: ["Mon"],
      sessionMinutes: null,
    });
    const raw = {
      name: "Custom History",
      days: [
        {
          weekday: "Mon",
          location: "Commercial gym",
          name: "Pull",
          estimatedMinutes: 30,
          exercises: ["Meadows Row", "Bayesian Cable Curl"].map(
            (sourceName) => ({
              exerciseId: null,
              sourceName,
              sets: 2,
              repMin: 8,
              repMax: 10,
              targetRir: null,
              restSeconds: null,
              notes: null,
            }),
          ),
        },
      ],
    };
    const program = normalizeGeneratedProgram(raw, p, {
      preservePrescription: true,
    });
    program.source = "ai-import";
    let state = blankState();
    state.profile = { ...p, onboardingComplete: true };
    state.program = program;
    for (let exposure = 0; exposure < 2; exposure++) {
      state.activeWorkout = startWorkout(state, program.days[0]);
      const custom = state.activeWorkout.exercises[0];
      custom.sets.forEach((set) => {
        set.weight = 20;
        set.reps = 10;
        set.completed = true;
      });
      state = completeWorkout(state);
    }
    const next = startWorkout(state, program.days[0]);
    expect(next.exercises[0].sets.map((set) => set.weight)).toEqual([20, 20]);
    expect(progressionFor(next.exercises[0], state.workouts)).toMatchObject({
      weight: 21,
      evidenceExposures: 2,
    });
    expect(coachContext(state).recentWorkouts[0].exercises[0].name).toBe(
      "Meadows Row",
    );
    expect(
      coachContext(state).progressionResults.find(
        (item) => item.name === "Meadows Row",
      ),
    ).toBeTruthy();
    expect(
      deterministicCoach(state, "Should I increase Meadows Row?").text,
    ).toContain("21 kg");
  });
  it("enforces equipment by environment and workout location", () => {
    const commercial = profile({
      environment: "Commercial gym",
      equipment: ["full gym"],
    });
    expect(
      isExerciseAllowed(exerciseCatalog["machine-chest-press"], commercial),
    ).toBe(true);
    expect(
      isExerciseAllowed(exerciseCatalog["seated-cable-row"], commercial),
    ).toBe(true);
    const home = profile({ environment: "Home gym", equipment: ["dumbbells"] });
    expect(
      isExerciseAllowed(exerciseCatalog["dumbbell-bench-press"], home),
    ).toBe(false);
    expect(
      isExerciseAllowed(exerciseCatalog["one-arm-dumbbell-row"], home),
    ).toBe(true);
    expect(
      isExerciseAllowed(exerciseCatalog["machine-chest-press"], home),
    ).toBe(false);
    const both = profile({
      environment: "Both",
      equipment: ["full gym", "dumbbells"],
    });
    const gymProgram = buildProgram(both);
    gymProgram.days.forEach((day) => {
      day.location = "Commercial gym";
    });
    expect(validateProgram(gymProgram, both).valid).toBe(true);
    const homeProgram = buildProgram(home);
    homeProgram.days.forEach((day) => {
      day.location = "Home";
    });
    expect(validateProgram(homeProgram, both).valid).toBe(true);
    const unsupportedHome = structuredClone(gymProgram);
    unsupportedHome.days.forEach((day) => {
      day.location = "Home";
    });
    expect(validateProgram(unsupportedHome, both).errors.join(" ")).toMatch(
      /equipment/i,
    );
  });
  it("keeps avoided exercises out through a general restriction rule", () => {
    const p = profile({
      daysPerWeek: 4,
      availableDays: ["Mon", "Tue", "Thu", "Fri"],
      avoid: "I don't want squats.",
    });
    const program = buildProgram(p);
    expect(
      program.days
        .flatMap((day) => day.exercises)
        .map((item) => exerciseCatalog[item.exerciseId].name.toLowerCase())
        .some((name) => name.includes("squat")),
    ).toBe(false);
  });
  it("leaves first-session weights unset and only prefills actual completed history", () => {
    const state = stateFor();
    const first = startWorkout(state, state.program.days[0]);
    expect(
      first.exercises
        .flatMap((item) => item.sets)
        .every((set) => set.weight === null),
    ).toBe(true);
    first.exercises[0].sets.forEach((set, index) => {
      set.weight = 20;
      set.reps = 8 + index;
      set.completed = true;
    });
    state.activeWorkout = first;
    const completed = completeWorkout(state);
    const next = startWorkout(completed, completed.program.days[0]);
    expect(next.exercises[0].sets.map((set) => set.weight)).toEqual(
      first.exercises[0].sets.map(() => 20),
    );
    expect(
      previousExercise(blankState().workouts, first.exercises[0].exerciseId),
    ).toBeNull();
  });
  it("never prefills values from incomplete historical sets", () => {
    const state = stateFor();
    const first = startWorkout(state, state.program.days[0]);
    first.exercises[0].sets[0] = {
      ...first.exercises[0].sets[0],
      weight: 42.5,
      reps: 12,
      completed: true,
    };
    first.exercises[0].sets[1] = {
      ...first.exercises[0].sets[1],
      weight: 99,
      reps: 20,
      completed: false,
    };
    state.activeWorkout = first;
    const saved = completeWorkout(state);
    const next = startWorkout(saved, saved.program.days[0]);
    expect(next.exercises[0].sets[0]).toMatchObject({
      weight: 42.5,
      reps: 12,
      completed: false,
    });
    expect(next.exercises[0].sets[1].weight).toBeNull();
    expect(next.exercises[0].sets[1].reps).toBe(next.exercises[0].repMin);
  });
  it("distinguishes a complete workout from one ended early using planned-set data", () => {
    const earlyState = stateFor();
    earlyState.activeWorkout = startWorkout(
      earlyState,
      earlyState.program.days[0],
    );
    const planned = workoutSetSummary(earlyState.activeWorkout).planned;
    earlyState.activeWorkout.exercises[0].sets[0].completed = true;
    earlyState.activeWorkout.exercises[0].sets.push({
      id: "extra",
      planned: false,
      added: true,
      completed: true,
      weight: 10,
      reps: 10,
      rir: null,
    });
    const early = completeWorkout(earlyState);
    expect(early.workouts.at(-1)).toMatchObject({
      status: "ended-early",
      endedEarly: true,
      plannedSetCount: planned,
      completedPlannedSetCount: 1,
      completedSetCount: 2,
    });
    const fullState = stateFor();
    fullState.activeWorkout = startWorkout(
      fullState,
      fullState.program.days[0],
    );
    fullState.activeWorkout.exercises
      .flatMap((item) => item.sets)
      .forEach((set) => {
        set.completed = true;
      });
    const full = completeWorkout(fullState);
    expect(full.workouts.at(-1)).toMatchObject({
      status: "completed",
      endedEarly: false,
    });
    expect(full.workouts.at(-1).completedPlannedSetCount).toBe(
      full.workouts.at(-1).plannedSetCount,
    );
  });
  it("commits a workout exactly once when completion is dispatched twice", () => {
    const state = stateFor();
    state.activeWorkout = startWorkout(state, state.program.days[0]);
    state.activeWorkout.exercises[0].sets[0].completed = true;
    const once = completeWorkout(state);
    const twice = completeWorkout(once);
    expect(twice).toBe(once);
    expect(twice.workouts).toHaveLength(1);
    expect(twice.activeWorkout).toBeNull();
  });
  it("keeps the active snapshot and completed history isolated from later plan mutations", () => {
    const state = stateFor();
    const originalExerciseId = state.program.days[0].exercises[0].exerciseId;
    state.activeWorkout = startWorkout(state, state.program.days[0]);
    state.activeWorkout.exercises[0].sets[0].completed = true;
    const replacement = Object.values(exerciseCatalog).find(
      (item) =>
        item.id !== originalExerciseId &&
        isExerciseAllowed(item, state.profile),
    );
    state.program.days[0].exercises[0].exerciseId = replacement.id;
    const completed = completeWorkout(state);
    expect(completed.program.days[0].exercises[0].exerciseId).toBe(
      replacement.id,
    );
    expect(completed.workouts[0].exercises[0].exerciseId).toBe(
      originalExerciseId,
    );
    const immutableHistory = structuredClone(completed.workouts);
    completed.program.name = "A later plan name";
    completed.program.days[0].name = "A later workout name";
    expect(completed.workouts).toEqual(immutableHistory);
  });
  it("rejects invalid prescription boundaries before persistence", () => {
    const base = stateFor();
    for (const mutate of [
      (program) => {
        program.days[0].exercises[0].sets = [];
      },
      (program) => {
        program.days[0].exercises[0].targetRir = 5;
      },
      (program) => {
        program.days[0].exercises[0].sets[0].weight = -1;
      },
    ]) {
      const invalid = structuredClone(base.program);
      mutate(invalid);
      expect(validateProgram(invalid, base.profile).valid).toBe(false);
    }
  });
  it("uses correct singular and plural set labels", () => {
    expect(pluralize(1, "set")).toBe("1 set");
    expect(pluralize(2, "set")).toBe("2 sets");
  });
  it("keeps user-added extra sets out of the programmed target label", () => {
    const state = stateFor();
    const active = startWorkout(state, state.program.days[0]);
    const exercise = active.exercises[0];
    const original = targetLabel(exercise);
    exercise.sets.push({
      ...exercise.sets.at(-1),
      id: "extra",
      planned: false,
      added: true,
    });
    expect(targetLabel(exercise)).toBe(original);
  });
  it("hides the RIR target when effort tracking is disabled", () => {
    const state = stateFor();
    const exercise = state.program.days[0].exercises[0];
    expect(targetLabel(exercise)).toMatch(/RIR/);
    expect(targetLabel(exercise, false)).not.toMatch(/RIR/);
  });
  it("requires two complete comparable exposures before deterministic progression", () => {
    const state = stateFor({ experience: "Intermediate" });
    const exercise = {
      ...state.program.days[0].exercises[0],
      defaultIncrement: 1,
    };
    const reps = exercise.repMax;
    const exposure = (completed) => ({
      exercises: [
        {
          exerciseId: exercise.exerciseId,
          sets: exercise.sets.map(() => ({ reps, weight: 20, completed })),
        },
      ],
    });
    expect(progressionFor(exercise, [exposure(true)])).toBeNull();
    expect(
      progressionFor(exercise, [exposure(true), exposure(true)]),
    ).toMatchObject({ type: "progress", weight: 21, evidenceExposures: 2 });
    expect(
      progressionFor(exercise, [exposure(true), exposure(false)]),
    ).toBeNull();
  });
  it("never invents an external load and blocks an oversized increment", () => {
    const state = stateFor({ experience: "Intermediate" });
    const source = state.program.days[0].exercises.find(
      (item) => !exerciseCatalog[item.exerciseId].bodyweight,
    );
    const exercise = { ...source, defaultIncrement: 10 };
    const exposure = (weight) => ({
      exercises: [
        {
          exerciseId: exercise.exerciseId,
          sets: exercise.sets.map(() => ({
            reps: exercise.repMax,
            weight,
            completed: true,
          })),
        },
      ],
    });
    const missing = progressionFor(exercise, [exposure(null), exposure(null)]);
    expect(missing).toMatchObject({
      type: "hold",
      title: "Log a working load first",
    });
    expect(missing).not.toHaveProperty("weight");
    const oversized = progressionFor(exercise, [exposure(20), exposure(20)]);
    expect(oversized).toMatchObject({
      type: "hold",
      title: "Use a smaller increment",
    });
    expect(oversized).not.toHaveProperty("weight");
  });
  it("does not react to one poor session but flags two comparable underperformances", () => {
    const state = stateFor({ experience: "Intermediate" });
    const exercise = state.program.days[0].exercises[0];
    const exposure = (reps) => ({
      exercises: [
        {
          exerciseId: exercise.exerciseId,
          sets: exercise.sets.map(() => ({
            reps,
            weight: 40,
            completed: true,
          })),
        },
      ],
    });
    expect(
      progressionFor(exercise, [exposure(exercise.repMin - 1)]),
    ).toBeNull();
    expect(
      progressionFor(exercise, [
        exposure(exercise.repMin - 1),
        exposure(exercise.repMin - 1),
      ]),
    ).toMatchObject({ type: "hold", title: "Review the load" });
  });
  it("reports only measured session-to-session weight or rep improvements", () => {
    const exercise = {
      exerciseId: "dumbbell-bench-press",
      sets: [{ completed: true, weight: 30, reps: 8 }],
    };
    const workout = (weight, reps, day) => ({
      completedAt: `2026-08-${day}T12:00:00.000Z`,
      exercises: [
        {
          ...structuredClone(exercise),
          sets: [{ completed: true, weight, reps }],
        },
      ],
    });
    expect(recentExerciseProgress([workout(30, 8, "18")])).toEqual([]);
    expect(
      recentExerciseProgress([workout(30, 8, "18"), workout(30, 8, "20")]),
    ).toEqual([]);
    expect(
      recentExerciseProgress([workout(30, 8, "18"), workout(30, 10, "20")])[0],
    ).toMatchObject({ type: "reps", deltaReps: 2, weight: 30 });
    expect(
      recentExerciseProgress([
        workout(30, 10, "18"),
        workout(32.5, 8, "20"),
      ])[0],
    ).toMatchObject({ type: "weight", deltaWeight: 2.5, weight: 32.5 });
  });
  it("creates actual-workout adaptations and applies them only after acceptance", () => {
    const state = stateFor();
    state.activeWorkout = startWorkout(state, state.program.days[0]);
    const before = state.activeWorkout.exercises.map((item) => item.exerciseId);
    const proposal = adaptTodayProposal(state, 20);
    expect(
      state.activeWorkout.exercises.map((item) => item.exerciseId),
    ).toEqual(before);
    expect(proposal.label).toBe("APPLY TO TODAY");
    applyCoachAction(state, proposal);
    expect(
      state.activeWorkout.exercises.map((item) => item.exerciseId),
    ).toEqual(proposal.exerciseIds);
    expect(
      state.program.days[0].exercises.map((item) => item.exerciseId),
    ).toEqual(before);
  });
  it("keeps the requested adaptation duration separate from the closest honest estimate", () => {
    const state = stateFor();
    state.program.days[0].weekday = weekday();
    const proposal = adaptTodayProposal(state, 35);
    expect(proposal.requestedMinutes).toBe(35);
    expect(roundedEstimate(proposal.estimatedMinutes)).toBe(35);
    expect(proposal.estimatedMinutes).toBe(
      estimateSessionMinutes(
        adaptedTemplateForToday({
          ...state,
          todayAdaptation: {
            date: isoDay(),
            programDayId: state.program.days[0].id,
            exerciseIds: proposal.exerciseIds,
            setTargets: proposal.setTargets,
            estimatedMinutes: proposal.estimatedMinutes,
          },
        }).exercises,
      ),
    );
    applyCoachAction(state, proposal);
    expect(state.todayAdaptation.requestedMinutes).toBe(35);
    expect(state.todayAdaptation.estimatedMinutes).toBe(
      estimateSessionMinutes(adaptedTemplateForToday(state).exercises),
    );
  });
  it("shortens by movement coverage and set count instead of taking a list prefix", () => {
    const state = stateFor({
      daysPerWeek: 2,
      availableDays: ["Tue", "Sat"],
      sessionMinutes: 60,
    });
    const day = state.program.days[0];
    day.exercises.sort(
      (a, b) =>
        Number(exerciseCatalog[a.exerciseId].kind === "compound") -
        Number(exerciseCatalog[b.exerciseId].kind === "compound"),
    );
    const prefix = day.exercises.slice(0, 3).map((item) => item.exerciseId);
    const proposal = adaptTodayProposal(
      { ...state, selectedDay: day.weekday },
      35,
      weekDate(day.weekday),
    );
    const patterns = proposal.exerciseIds.map(
      (id) => exerciseCatalog[id].pattern,
    );
    expect(
      patterns.some((pattern) =>
        ["horizontal-push", "incline-push", "vertical-push"].includes(pattern),
      ),
    ).toBe(true);
    expect(
      patterns.some((pattern) =>
        ["horizontal-pull", "vertical-pull"].includes(pattern),
      ),
    ).toBe(true);
    expect(
      patterns.some((pattern) => ["squat", "single-leg"].includes(pattern)),
    ).toBe(true);
    expect(
      patterns.some((pattern) =>
        ["hinge", "hip-extension", "knee-flexion"].includes(pattern),
      ),
    ).toBe(true);
    expect(proposal.exerciseIds).not.toEqual(prefix);
    expect(
      proposal.setTargets.some(
        (target) =>
          target.sets <
          day.exercises.find(
            (exercise) => exercise.exerciseId === target.exerciseId,
          ).sets.length,
      ),
    ).toBe(true);
  });
  it("applies a reviewed temporary compound addition and reduced sets without changing the program", () => {
    const today = weekday();
    const state = stateFor({
      daysPerWeek: 2,
      availableDays: [today, WEEKDAYS.find((day) => day !== today)],
      environment: "Commercial gym",
      equipment: ["full gym"],
    });
    state.program.days[0].weekday = today;
    const day = state.program.days[0];
    const permanent = structuredClone(day);
    const addition = Object.values(exerciseCatalog).find(
      (item) =>
        item.kind === "compound" &&
        isExerciseAllowed(item, state.profile) &&
        !day.exercises.some((exercise) => exercise.exerciseId === item.id),
    );
    const kept = day.exercises[0].exerciseId;
    applyCoachAction(state, {
      type: "adapt-today",
      targetDate: isoDay(),
      programDayId: day.id,
      exerciseIds: [kept, addition.id],
      setTargets: [
        { exerciseId: kept, sets: 1 },
        { exerciseId: addition.id, sets: 2 },
      ],
      minutes: 25,
    });
    const adapted = adaptedTemplateForToday(state);
    expect(adapted.exercises.map((exercise) => exercise.exerciseId)).toEqual([
      kept,
      addition.id,
    ]);
    expect(adapted.exercises.map((exercise) => exercise.sets.length)).toEqual([
      1, 2,
    ]);
    expect(state.program.days[0]).toEqual(permanent);
  });
  it("adds a reviewed optional strength workout on a rest day without changing the recurring plan", () => {
    const today = weekday();
    const availableDays = WEEKDAYS.filter((day) => day !== today).slice(0, 2);
    const state = stateFor({ daysPerWeek: 2, availableDays });
    const permanent = structuredClone(state.program);
    const proposal = proposeOptionalStrengthWorkout(
      state,
      "danes imam rest, pa bi vseeno rad treniral",
    );
    expect(proposal).toMatchObject({
      type: "add-today-workout",
      label: "APPLY TO TODAY",
    });
    expect(proposal.exerciseIds.length).toBeGreaterThanOrEqual(2);
    expect(optionalStrengthForDate(state)).toBeNull();
    applyCoachAction(state, proposal);
    const optional = optionalStrengthForDate(state);
    expect(optional.name).toBe("Opcijski trening");
    expect(optional.exercises.map((exercise) => exercise.exerciseId)).toEqual(
      proposal.exerciseIds,
    );
    expect(state.program).toEqual(permanent);
    state.activeWorkout = startWorkout(state, optional);
    expect(state.activeWorkout.optionalSessionId).toBeTruthy();
    state.activeWorkout.exercises[0].sets[0].completed = true;
    const completedState = completeWorkout(state);
    expect(
      completedState.optionalSessions.find(
        (item) => item.id === state.activeWorkout.optionalSessionId,
      ).status,
    ).toBe("completed");
  });
  it("adds a reviewed optional strength workout to its future target date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 23, 12));
    try {
      const state = stateFor({ daysPerWeek: 2, availableDays: ["Mon", "Thu"] });
      const exerciseIds = state.program.days
        .flatMap((day) => day.exercises)
        .slice(0, 3)
        .map((exercise) => exercise.exerciseId);
      applyCoachAction(state, {
        type: "add-today-workout",
        targetDate: "2026-08-25",
        name: "Lažji trening",
        exerciseIds,
        minutes: 30,
      });
      const optional = optionalStrengthForDate(
        state,
        new Date(2026, 7, 25, 12),
      );
      expect(optional).toMatchObject({ name: "Lažji trening", weekday: "Tue" });
      expect(state.selectedDate).toBe("2026-08-25");
      expect(optionalStrengthForDate(state)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("applies a user-reviewed exercise selection without changing the permanent plan", () => {
    const state = stateFor();
    state.program.days[0].weekday = weekday();
    const permanent = state.program.days[0].exercises.map(
      (item) => item.exerciseId,
    );
    const proposal = adaptTodayProposal(state, 20);
    expect(proposal.skippedExerciseIds.length).toBeGreaterThan(0);
    const reviewedIds = [
      ...proposal.exerciseIds.slice(0, -1),
      proposal.skippedExerciseIds[0],
    ];
    applyCoachAction(state, { ...proposal, exerciseIds: reviewedIds });
    expect(state.todayAdaptation.exerciseIds).toEqual(reviewedIds);
    expect(
      adaptedTemplateForToday(state).exercises.map((item) => item.exerciseId),
    ).toEqual(permanent.filter((id) => reviewedIds.includes(id)));
    expect(
      state.program.days[0].exercises.map((item) => item.exerciseId),
    ).toEqual(permanent);
  });
  it("adapts a named future workout without changing today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 23, 12));
    try {
      const state = stateFor({ daysPerWeek: 2, availableDays: ["Tue", "Sat"] });
      const saturday = state.program.days.find((day) => day.weekday === "Sat");
      const reply = deterministicCoach(state, "adapt saturday to 35 minutes");
      expect(reply.action).toMatchObject({
        type: "adapt-today",
        label: "APPLY TO SATURDAY",
        targetDate: "2026-08-29",
        programDayId: saturday.id,
      });
      applyCoachAction(state, reply.action);
      expect(state.todayAdaptation).toMatchObject({
        date: "2026-08-29",
        programDayId: saturday.id,
      });
      expect(state.selectedDate).toBe("2026-08-29");
      expect(
        adaptedTemplateForToday(state, new Date(2026, 7, 29, 12)).exercises.map(
          (item) => item.exerciseId,
        ),
      ).toEqual(reply.action.exerciseIds);
      expect(adaptedTemplateForToday(state)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("never removes the current exercise or completed set data while adapting an active workout", () => {
    const state = stateFor();
    state.activeWorkout = startWorkout(state, state.program.days[0]);
    const original = structuredClone(state.activeWorkout.exercises);
    state.activeWorkout.exerciseIndex = 1;
    state.activeWorkout.exercises[0].sets[0] = {
      ...state.activeWorkout.exercises[0].sets[0],
      completed: true,
      weight: 42.5,
      reps: 9,
    };
    const requested = [state.activeWorkout.exercises.at(-1).exerciseId];
    applyCoachAction(state, {
      type: "adapt-today",
      workoutId: state.activeWorkout.id,
      exerciseIds: requested,
      minutes: 20,
    });
    expect(
      state.activeWorkout.exercises.map((item) => item.exerciseId),
    ).toEqual([
      original[0].exerciseId,
      original[1].exerciseId,
      original.at(-1).exerciseId,
    ]);
    expect(state.activeWorkout.exercises[0].sets[0]).toMatchObject({
      completed: true,
      weight: 42.5,
      reps: 9,
    });
    expect(
      state.activeWorkout.exercises[state.activeWorkout.exerciseIndex]
        .exerciseId,
    ).toBe(original[1].exerciseId);
  });
  it("rejects a stale active-workout Coach proposal without losing newer entries", () => {
    const state = stateFor();
    state.activeWorkout = startWorkout(state, state.program.days[0]);
    const proposal = adaptTodayProposal(state, 20);
    expect(coachActionConflict(state, proposal)).toBeNull();
    state.activeWorkout.exercises[0].sets[0].weight = 47.5;
    state.activeWorkout.updatedAt += 1;
    const before = structuredClone(state.activeWorkout);
    expect(coachActionConflict(state, proposal)).toBe("workout-changed");
    applyCoachAction(state, proposal);
    expect(state.activeWorkout).toEqual(before);
  });
  it("never replaces an exercise after completed work exists", () => {
    const state = stateFor();
    state.activeWorkout = startWorkout(state, state.program.days[0]);
    const source = state.activeWorkout.exercises[0];
    const replacement = replacementCandidates(
      source.exerciseId,
      state.profile,
    )[0];
    source.sets[0] = {
      ...source.sets[0],
      completed: true,
      weight: 40,
      reps: 8,
    };
    const before = structuredClone(source);
    applyCoachAction(state, {
      type: "replace-exercise",
      fromExerciseId: source.exerciseId,
      toExerciseId: replacement.id,
    });
    expect(state.activeWorkout.exercises[0]).toEqual(before);
  });
  it("moves the same workout identity for this week only and persists the override", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 12));
    try {
      const state = stateFor({ daysPerWeek: 2, availableDays: ["Thu", "Sat"] });
      state.profile.onboardingComplete = true;
      const workout = state.program.days.find((day) => day.weekday === "Thu");
      const originalExercises = workout.exercises.map((item) => item.id);
      const change = {
        workoutId: workout.id,
        fromDate: "2026-08-20",
        toDate: "2026-08-19",
      };
      expect(validateWeekScheduleChanges(state, [change]).valid).toBe(true);
      applyWeekScheduleChanges(state, [change]);
      expect(plannedWorkoutForDate(state, new Date(2026, 7, 19, 12)).id).toBe(
        workout.id,
      );
      expect(
        plannedWorkoutForDate(state, new Date(2026, 7, 20, 12)),
      ).toBeNull();
      expect(
        state.program.days.find((day) => day.id === workout.id).weekday,
      ).toBe("Thu");
      expect(
        state.program.days
          .find((day) => day.id === workout.id)
          .exercises.map((item) => item.id),
      ).toEqual(originalExercises);
      saveState(state);
      expect(
        currentWeekSchedule(loadState()).find(
          (item) => item.workoutId === workout.id,
        ).scheduledDate,
      ).toBe("2026-08-19");
    } finally {
      vi.useRealTimers();
    }
  });
  it("starts a newly accepted A/B/C plan with A at the first available slot, without changing legacy weekday plans", () => {
    const state = stateFor({
      daysPerWeek: 3,
      availableDays: ["Mon", "Wed", "Fri"],
    });
    const ordered = [...state.program.days].sort(
      (a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday),
    );
    ordered.forEach((day, index) => {
      day.name = `Full Body ${String.fromCharCode(65 + index)}`;
    });
    expect(firstScheduledDate(state.program, new Date(2026, 7, 25, 12))).toBe(
      "2026-08-26",
    );
    state.program.rotationStartDate = "2026-08-26";
    expect(plannedWorkoutForDate(state, new Date(2026, 7, 26, 12)).name).toBe(
      "Full Body A",
    );
    expect(plannedWorkoutForDate(state, new Date(2026, 7, 28, 12)).name).toBe(
      "Full Body B",
    );
    expect(plannedWorkoutForDate(state, new Date(2026, 7, 31, 12)).name).toBe(
      "Full Body C",
    );
    delete state.program.rotationStartDate;
    expect(plannedWorkoutForDate(state, new Date(2026, 7, 26, 12)).name).toBe(
      "Full Body B",
    );
  });
  it("records a moved workout on its actual completion date without a false miss or extra session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 12));
    try {
      let state = stateFor({ daysPerWeek: 2, availableDays: ["Thu", "Sat"] });
      const workout = state.program.days.find((day) => day.weekday === "Thu");
      applyWeekScheduleChanges(state, [
        { workoutId: workout.id, fromDate: "2026-08-20", toDate: "2026-08-19" },
      ]);
      vi.setSystemTime(new Date(2026, 7, 19, 12));
      state.activeWorkout = startWorkout(state, plannedWorkoutForDate(state));
      state.activeWorkout.exercises
        .flatMap((exercise) => exercise.sets)
        .forEach((set) => {
          set.completed = true;
        });
      state = completeWorkout(state);
      expect(isoDay(state.workouts[0].completedAt)).toBe("2026-08-19");
      expect(state.workouts[0].programDayId).toBe(workout.id);
      expect(consistencyForCurrentWeek(state)).toEqual({
        completed: 1,
        planned: 2,
      });
      vi.setSystemTime(new Date(2026, 7, 21, 12));
      expect(
        missedPlannedWorkouts(state).some(
          (item) => item.workoutName === workout.name,
        ),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("builds a structured natural-language week proposal and excludes completed or active workouts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 12));
    try {
      const state = stateFor({ daysPerWeek: 2, availableDays: ["Thu", "Sat"] });
      const proposal = proposeWeekScheduleChange(
        state,
        "I can't train Thursday this week, but I can train Wednesday.",
      );
      expect(proposal).toMatchObject({
        type: "week-schedule-change",
        label: "APPLY TO THIS WEEK",
      });
      expect(proposal.changes[0]).toMatchObject({
        fromDate: "2026-08-20",
        toDate: "2026-08-19",
      });
      const workout = state.program.days.find((day) => day.weekday === "Thu");
      state.activeWorkout = startWorkout(state, workout);
      expect(
        proposeWeekScheduleChange(state, "Move Thursday workout to Wednesday."),
      ).toBeNull();
      state.activeWorkout = null;
      state.workouts.push({
        programDayId: workout.id,
        completedAt: "2026-08-18T12:00:00.000Z",
      });
      expect(
        validateWeekScheduleChanges(state, [
          {
            workoutId: workout.id,
            fromDate: "2026-08-20",
            toDate: "2026-08-19",
          },
        ]).valid,
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not mistake a progression question about a lift for a request to train today", () => {
    const state = stateFor();
    expect(
      proposeOptionalStrengthWorkout(state, "Am I ready to increase a lift?"),
    ).toBeNull();
  });
  it("rearranges multiple unavailable days and avoids an occupied requested target", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 12));
    try {
      const state = stateFor({
        daysPerWeek: 4,
        availableDays: ["Tue", "Thu", "Fri", "Sat"],
      });
      const rearranged = proposeWeekScheduleChange(
        state,
        "I can't train Friday or Saturday this week.",
      );
      expect(rearranged.changes).toHaveLength(2);
      expect(
        rearranged.changes.every(
          (change) => !["Fri", "Sat"].includes(weekday(change.toDate)),
        ),
      ).toBe(true);
      expect(validateWeekScheduleChanges(state, rearranged.changes).valid).toBe(
        true,
      );
      const occupied = proposeWeekScheduleChange(
        state,
        "Move Saturday's workout to Thursday.",
      );
      expect(occupied.changes[0].toDate).not.toBe("2026-08-20");
      expect(occupied.explanation).toMatch(/safer|occupied/i);
    } finally {
      vi.useRealTimers();
    }
  });
  it("never fabricates Coach knowledge when an exercise has no history", () => {
    const state = stateFor();
    const exercise = state.program.days[0].exercises[0];
    const reply = deterministicCoach(
      state,
      `Should I increase ${exerciseCatalog[exercise.exerciseId].name}?`,
    );
    expect(reply.text).toMatch(/do not have a completed/i);
    expect(reply.source).toBe("deterministic");
  });
  it("builds Coach context exclusively from stored profile, program, and history", () => {
    const state = stateFor({
      name: "Alex",
      ageRange: "30–39",
      sex: "Prefer not to say",
      goal: "General fitness",
      priorities: ["Back"],
    });
    state.program.days[0].weekday = weekday();
    const context = coachContext(state);
    expect(context.profile).toMatchObject({
      name: "Alex",
      ageRange: "30–39",
      sex: "Prefer not to say",
      goal: "General fitness",
    });
    expect(context.profile.priorities).toEqual(["Back"]);
    expect(context.recentWorkouts).toEqual([]);
    expect(context.today.exercises[0].exerciseId).toBeTruthy();
  });
  it("gives Coach authoritative memory of an applied action and does not reconfirm it after thanks", () => {
    const state = stateFor();
    state.activeCoachConversationId = "thread-1";
    state.conversations = [
      {
        id: "message-1",
        conversationId: "thread-1",
        user: "Move Lower A to today.",
        reply: {
          text: "Review the move.",
          action: {
            type: "week-schedule-change",
            changes: [
              {
                workoutId: state.program.days[0].id,
                fromDate: "2026-08-20",
                toDate: "2026-08-19",
              },
            ],
          },
        },
        actionResult: {
          status: "applied",
          appliedAt: 123,
          scope: "current-week",
        },
      },
    ];
    const context = coachContext(state);
    expect(context.conversationHistory[0]).toMatchObject({
      action: { type: "week-schedule-change" },
      actionResult: { status: "applied", scope: "current-week" },
    });
    const reply = deterministicCoach(
      state,
      "hvala ti, res si najboljsi ai coach",
    );
    expect(reply).toMatchObject({
      action: null,
      source: "deterministic",
      final: true,
    });
    expect(reply.text).toMatch(/potrjena/i);
  });
  it("derives missed Coach-context workouts from the real schedule and completion dates", () => {
    const state = stateFor({ daysPerWeek: 2, availableDays: ["Mon", "Fri"] });
    state.program.createdAt = new Date(2026, 7, 1, 12).toISOString();
    const missed = missedPlannedWorkouts(state, new Date(2026, 7, 22, 12));
    expect(missed.some((item) => item.weekday === "Fri")).toBe(true);
    state.workouts.push({
      templateId: "Fri",
      completedAt: new Date(2026, 7, 21, 12).toISOString(),
    });
    expect(
      missedPlannedWorkouts(state, new Date(2026, 7, 22, 12)).some(
        (item) => item.date === "2026-08-21",
      ),
    ).toBe(false);
  });
  it("offers replacements with the same movement pattern and allowed equipment", () => {
    const p = profile({
      environment: "Home gym",
      equipment: ["dumbbells", "bodyweight only"],
    });
    const candidates = replacementCandidates("dumbbell-bench-press", p);
    expect(candidates.length).toBeGreaterThan(0);
    expect(
      candidates.every(
        (item) =>
          item.pattern === "horizontal-push" && isExerciseAllowed(item, p),
      ),
    ).toBe(true);
    expect(candidates.some((item) => item.pattern.includes("pull"))).toBe(
      false,
    );
  });
  it("generalizes replacement validation across movement categories without unrelated fallbacks", () => {
    const p = profile();
    for (const id of [
      "dumbbell-bench-press",
      "barbell-row",
      "pull-up",
      "back-squat",
      "deadlift",
      "dumbbell-curl",
    ]) {
      const source = exerciseCatalog[id];
      const candidates = compatibleReplacementCandidates(id, p);
      expect(candidates.length, id).toBeGreaterThan(0);
      expect(
        candidates.every(
          (item) =>
            item.pattern === source.pattern &&
            item.muscles.includes(source.muscles[0]) &&
            isExerciseAllowed(item, p),
        ),
        id,
      ).toBe(true);
    }
  });
  it("uses known custom metadata but refuses to guess for unresolved imported exercises", () => {
    const p = profile();
    const known = {
      exerciseId: "custom-row",
      importedExercise: {
        name: "Custom Supported Row",
        pattern: "horizontal-pull",
        muscles: ["Back"],
        equipment: ["machines"],
        kind: "compound",
      },
    };
    expect(
      compatibleReplacementCandidates(known, p).every(
        (item) =>
          item.pattern === "horizontal-pull" && item.muscles.includes("Back"),
      ),
    ).toBe(true);
    const unknown = {
      exerciseId: "custom-mystery",
      importedExercise: {
        name: "Mystery Exercise",
        pattern: null,
        muscles: null,
        equipment: null,
      },
    };
    expect(compatibleReplacementCandidates(unknown, p)).toEqual([]);
  });
  it("turns muscle priorities into additional direct weekly volume when the time and volume budget allow it", () => {
    const options = {
      experience: "Intermediate",
      daysPerWeek: 4,
      availableDays: ["Mon", "Tue", "Thu", "Fri"],
      sessionMinutes: 75,
    };
    const balanced = buildProgram(
      profile({ ...options, priorities: ["Balanced"] }),
    );
    const prioritized = buildProgram(
      profile({ ...options, priorities: ["Chest", "Back"] }),
    );
    const baseline = weeklyDirectVolume(balanced);
    const focused = weeklyDirectVolume(prioritized);
    expect(focused.Chest + focused.Back).toBeGreaterThan(
      baseline.Chest + baseline.Back,
    );
  });
  it("keeps the fixed five-day structure while goal and priority overlays change prescriptions", () => {
    const days = WEEKDAYS.slice(0, 5);
    const muscle = buildProgram(
      profile({ daysPerWeek: 5, availableDays: days, priorities: ["Chest"] }),
    );
    const strength = buildProgram(
      profile({
        goal: "Get stronger",
        daysPerWeek: 5,
        availableDays: days,
        priorities: ["Balanced"],
      }),
    );
    expect(muscle.templateId).toBe("T5-ULPPL");
    expect(strength.templateId).toBe("T5-ULPPL");
    expect(muscle.days.map((day) => day.name.replace(/ ·.*$/, ""))).toEqual([
      "Upper",
      "Lower",
      "Push",
      "Pull",
      "Legs",
    ]);
    expect(strength.days.map((day) => day.name)).toEqual([
      "Upper",
      "Lower",
      "Push",
      "Pull",
      "Legs",
    ]);
    expect(muscle.days.some((day) => day.name.includes("Chest"))).toBe(true);
    expect(muscle.days[0].exercises[0].repMin).not.toBe(
      strength.days[0].exercises[0].repMin,
    );
  });
  it("starts a commercial-gym chest-priority hypertrophy session with a stable incline press and an honest emphasis", () => {
    const days = WEEKDAYS.slice(0, 5);
    const user = profile({
      goal: "Build muscle",
      daysPerWeek: 5,
      availableDays: days,
      environment: "Commercial gym",
      equipment: ["full gym"],
      priorities: ["Chest"],
      exercisePreference: "No preference",
    });
    const program = buildProgram(user);
    const chestEmphasis = program.days.find((day) =>
      day.name.includes("Chest emphasis"),
    );
    const directChest = chestEmphasis.exercises.filter(
      (exercise) => exerciseCatalog[exercise.exerciseId].muscles[0] === "Chest",
    );
    const firstPress = chestEmphasis.exercises.find((exercise) =>
      ["horizontal-push", "incline-push"].includes(
        exerciseCatalog[exercise.exerciseId].pattern,
      ),
    );
    expect(directChest.length).toBeGreaterThanOrEqual(2);
    expect(firstPress.exerciseId).toBe("incline-machine-press");
    expect(exerciseCatalog[firstPress.exerciseId].stability).toBe("high");
  });
  it("materially changes a four-day plan for Arnold versus Upper/Lower preferences", () => {
    const options = {
      daysPerWeek: 4,
      availableDays: ["Mon", "Tue", "Thu", "Sat"],
      sessionMinutes: 60,
    };
    const upperLower = buildProgram(
      profile({
        ...options,
        trainingPreferences: "I enjoy an upper lower split.",
      }),
    );
    const arnold = buildProgram(
      profile({
        ...options,
        trainingPreferences: "I really like the Arnold split.",
      }),
    );
    expect(upperLower.templateId).toBe("T4-UL");
    expect(arnold.templateId).toBe("T4-ARNOLD");
    expect(arnold.name).toBe("Arnold-inspired Hybrid");
    expect(arnold.days.map((day) => day.name)).toEqual(
      expect.arrayContaining([
        "Chest & Back",
        "Shoulders & Arms",
        "Legs",
        "Full Body",
      ]),
    );
    expect(arnold.days.map((day) => day.name)).not.toEqual(
      upperLower.days.map((day) => day.name),
    );
    expect(
      validateProgram(
        arnold,
        profile({ ...options, trainingPreferences: "Arnold split" }),
        { requireProgramQuality: true },
      ).valid,
    ).toBe(true);
  });
  it("adapts an explicit Upper/Lower preference to a balanced three-day hybrid", () => {
    const user = profile({
      goal: "Build muscle",
      experience: "Beginner",
      daysPerWeek: 3,
      availableDays: ["Wed", "Thu", "Sun"],
      sessionMinutes: 45,
      priorities: ["Chest", "Back"],
      trainingPreferences: "Upper / Lower",
    });
    const program = buildProgram(user);
    expect(program.templateId).toBe("T3-UL");
    expect(program.name).toBe("Upper / Lower Hybrid");
    expect(program.days.map((day) => day.name)).toEqual(
      expect.arrayContaining(["Upper", "Lower", "Full Body"]),
    );
    expect(program.days.map((day) => day.name)).not.toEqual([
      "Full Body A",
      "Full Body B",
      "Full Body C",
    ]);
    expect(
      validateProgram(program, user, { requireProgramQuality: true }).valid,
    ).toBe(true);
  });
  it("uses a recognizable local Push/Pull/Legs fallback when three days are requested", () => {
    const user = profile({
      daysPerWeek: 3,
      availableDays: ["Mon", "Wed", "Fri"],
      trainingPreferences: "PPL works best for me.",
    });
    const program = buildProgram(user);
    expect(program.templateId).toBe("T3-PPL");
    expect(program.days.map((day) => day.name)).toEqual([
      "Push",
      "Pull",
      "Legs",
    ]);
    expect(
      validateProgram(program, user, { requireProgramQuality: true }).valid,
    ).toBe(true);
  });
  it("honors recognized split preferences across every safe supported frequency", () => {
    const supported = {
      "Upper / Lower": {
        2: "T2-UL",
        3: "T3-UL",
        4: "T4-UL",
        5: "T5-UL",
        6: "T6-UL3",
      },
      PPL: { 3: "T3-PPL", 4: "T4-PPL", 5: "T5-ULPPL", 6: "T6-PPL2" },
      "Full Body": { 2: "T2-FB", 3: "T3-FB", 4: "T4-FB" },
    };
    for (const [preference, frequencies] of Object.entries(supported))
      for (const [frequency, templateId] of Object.entries(frequencies)) {
        const user = profile({
          daysPerWeek: Number(frequency),
          availableDays: WEEKDAYS,
          trainingPreferences: `I prefer ${preference}.`,
        });
        const program = buildProgram(user);
        expect(program.templateId, `${preference} / ${frequency} days`).toBe(
          templateId,
        );
        expect(
          validateProgram(program, user, { requireProgramQuality: true }).valid,
          `${preference} / ${frequency} days`,
        ).toBe(true);
      }
  });
  it("uses a transparent recovery-safe fallback only when the requested split is not viable at that frequency", () => {
    const twoDayPpl = profile({
      daysPerWeek: 2,
      availableDays: WEEKDAYS,
      trainingPreferences: "I prefer PPL.",
    });
    const fiveDayFullBody = profile({
      daysPerWeek: 5,
      availableDays: WEEKDAYS,
      trainingPreferences: "I prefer full body.",
    });
    expect(buildProgram(twoDayPpl).templateId).toBe("T2-FB");
    expect(buildProgram(fiveDayFullBody).templateId).toBe("T5-FB");
    expect(
      validateProgram(buildProgram(twoDayPpl), twoDayPpl, {
        requireProgramQuality: true,
      }).valid,
    ).toBe(true);
    expect(
      validateProgram(buildProgram(fiveDayFullBody), fiveDayFullBody, {
        requireProgramQuality: true,
      }).valid,
    ).toBe(true);
  });
  it("persists custom split, restrictions and exercise-style preferences through plan generation", () => {
    const user = profile({
      daysPerWeek: 5,
      availableDays: WEEKDAYS,
      trainingPreferences: "Upper / Lower with an extra arms day",
      avoid: "Avoid barbell bench press",
      exercisePreference: "Prefer machines",
    });
    const program = buildProgram(user);
    expect(program.profileSnapshot).toMatchObject({
      trainingPreferences: user.trainingPreferences,
      avoid: user.avoid,
      exercisePreference: user.exercisePreference,
    });
    expect(program.splitPreference).toMatchObject({
      id: "upper-lower",
      honored: true,
    });
    expect(
      program.days
        .flatMap((day) => day.exercises)
        .some((exercise) => exercise.exerciseId === "barbell-bench-press"),
    ).toBe(false);
  });
  it("keeps every local Arnold fallback valid across supported goals, experience levels, and frequencies", () => {
    for (const goal of [
      "General fitness",
      "Build muscle",
      "Get stronger",
      "Athletic performance",
    ])
      for (const experience of ["Beginner", "Intermediate", "Advanced"])
        for (let daysPerWeek = 2; daysPerWeek <= 6; daysPerWeek++) {
          const user = profile({
            goal,
            experience,
            daysPerWeek,
            availableDays: WEEKDAYS,
            trainingPreferences: "I prefer an Arnold split.",
          });
          expect(
            validateProgram(buildProgram(user), user, {
              requireProgramQuality: true,
            }).valid,
            `${goal} / ${experience} / ${daysPerWeek} days`,
          ).toBe(true);
        }
  });
  it("builds and validates the complete supported split, goal, experience, and frequency matrix", () => {
    const preferences = [
      "",
      "Upper / Lower",
      "PPL",
      "Full Body",
      "Arnold split",
    ];
    const goals = [
      "General fitness",
      "Build muscle",
      "Lose fat",
      "Get stronger",
      "Athletic performance",
    ];
    const experiences = ["Beginner", "Intermediate", "Advanced"];
    let combinations = 0;
    for (const trainingPreferences of preferences)
      for (const goal of goals)
        for (const experience of experiences)
          for (let daysPerWeek = 2; daysPerWeek <= 6; daysPerWeek++) {
            const user = profile({
              trainingPreferences,
              goal,
              experience,
              daysPerWeek,
              availableDays: WEEKDAYS,
              sessionMinutes: 60,
            });
            const program = buildProgram(user);
            const validation = validateProgram(program, user, {
              requireProgramQuality: true,
            });
            combinations++;
            expect(
              program.days,
              `${trainingPreferences || "baseline"} / ${goal} / ${experience} / ${daysPerWeek} days`,
            ).toHaveLength(daysPerWeek);
            expect(
              validation.valid,
              `${trainingPreferences || "baseline"} / ${goal} / ${experience} / ${daysPerWeek} days: ${validation.errors.join(" ")}`,
            ).toBe(true);
            expect(program.splitPreference?.honored ?? false).toBe(
              trainingPreferences
                ? !(["PPL"].includes(trainingPreferences) && daysPerWeek === 2)
                : false,
            );
          }
    expect(combinations).toBe(375);
  });
  it("uses all-day availability to place five hypertrophy sessions around two recovery days", () => {
    const program = buildProgram(
      profile({
        goal: "Build muscle",
        daysPerWeek: 5,
        availableDays: WEEKDAYS,
        sessionMinutes: 75,
      }),
    );
    expect(program.days.map((day) => day.weekday)).toEqual([
      "Mon",
      "Tue",
      "Thu",
      "Fri",
      "Sat",
    ]);
    expect(program.days.map((day) => day.name)).toEqual([
      "Upper",
      "Lower",
      "Push",
      "Pull",
      "Legs",
    ]);
  });
  it("makes a five-day Chest and Back emphasis measurable instead of decorative", () => {
    const user = profile({
      goal: "Build muscle",
      experience: "Beginner",
      daysPerWeek: 5,
      availableDays: WEEKDAYS,
      sessionMinutes: 60,
      environment: "Commercial gym",
      equipment: ["full gym"],
      priorities: ["Chest", "Back"],
      effortStyle: "Fewer hard sets · 2 sets · 0–1 RIR",
    });
    const program = buildProgram(user);
    const upper = program.days.find((day) => /^Upper/.test(day.name));
    const volume = weeklyFractionalVolume(program);
    expect(program.days.map((day) => day.weekday)).toEqual([
      "Mon",
      "Tue",
      "Thu",
      "Fri",
      "Sat",
    ]);
    expect(upper.name).toBe("Upper · Chest & Back emphasis");
    for (const muscle of ["Chest", "Back"])
      expect(
        upper.exercises.filter(
          (exercise) =>
            exerciseCatalog[exercise.exerciseId].muscles[0] === muscle,
        ).length,
      ).toBeGreaterThanOrEqual(2);
    expect(volume.Chest).toBeGreaterThanOrEqual(10);
    expect(volume.Back).toBeGreaterThanOrEqual(10);
    expect(
      validateProgram(program, user, { requireProgramQuality: true }).valid,
    ).toBe(true);
  });
  it("interleaves push and pull on mixed Upper days without banning intentional body-part grouping", () => {
    const user = profile({
      goal: "Build muscle",
      experience: "Intermediate",
      daysPerWeek: 5,
      availableDays: WEEKDAYS,
      sessionMinutes: 60,
      environment: "Commercial gym",
      equipment: ["full gym"],
      priorities: ["Chest", "Back"],
      exercisePreference: "Prefer machines",
      effortStyle: "Fewer hard sets · 2 sets · 0–1 RIR",
    });
    const program = buildProgram(user);
    const upper = program.days.find((day) => /^Upper/.test(day.name));
    const family = (exercise) => {
      const pattern = exerciseCatalog[exercise.exerciseId].pattern;
      return [
        "horizontal-push",
        "incline-push",
        "chest-isolation",
        "vertical-push",
        "shoulder-isolation",
        "elbow-extension",
      ].includes(pattern)
        ? "push"
        : [
              "horizontal-pull",
              "vertical-pull",
              "upper-back-pull",
              "rear-delt",
              "elbow-flexion",
            ].includes(pattern)
          ? "pull"
          : "other";
    };
    expect(upper.exercises.slice(0, 4).map(family)).toEqual([
      "push",
      "pull",
      "push",
      "pull",
    ]);
    expect(exerciseCatalog[upper.exercises[0].exerciseId].muscles[0]).toBe(
      "Chest",
    );
    const bodyPart = buildProgram(
      profile({
        ...user,
        trainingPreferences: "traditional five-day body-part split",
        priorities: ["Chest"],
      }),
    );
    const chestDay = bodyPart.days.find((day) => day.name === "Chest");
    expect(
      chestDay.exercises
        .slice(0, 2)
        .every(
          (exercise) =>
            exerciseCatalog[exercise.exerciseId].muscles[0] === "Chest",
        ),
    ).toBe(true);
  });
  it("defaults to cable or pec-deck fly in a commercial gym while preserving explicit free-weight and home choices", () => {
    const gym = profile({
      goal: "Build muscle",
      daysPerWeek: 5,
      availableDays: WEEKDAYS,
      sessionMinutes: 60,
      environment: "Commercial gym",
      equipment: ["full gym"],
      priorities: ["Chest"],
      exercisePreference: "No preference",
    });
    const gymIsolation = buildProgram(gym)
      .days.flatMap((day) => day.exercises)
      .find(
        (exercise) =>
          exerciseCatalog[exercise.exerciseId].pattern === "chest-isolation",
      );
    expect(["cable-fly", "pec-deck"]).toContain(gymIsolation.exerciseId);
    const freeWeightGym = buildProgram({
      ...gym,
      exercisePreference: "Prefer free weights",
    })
      .days.flatMap((day) => day.exercises)
      .find(
        (exercise) =>
          exerciseCatalog[exercise.exerciseId].pattern === "chest-isolation",
      );
    expect(freeWeightGym?.exerciseId).toBe("dumbbell-fly");
    const home = profile({
      goal: "Build muscle",
      daysPerWeek: 5,
      availableDays: WEEKDAYS,
      sessionMinutes: 90,
      environment: "Home gym",
      equipment: ["dumbbells", "barbell/rack/bench"],
      priorities: ["Chest"],
      exercisePreference: "Prefer free weights",
    });
    const homeIsolation = buildProgram(home)
      .days.flatMap((day) => day.exercises)
      .find(
        (exercise) =>
          exerciseCatalog[exercise.exerciseId].pattern === "chest-isolation",
      );
    expect(homeIsolation?.exerciseId).toBe("dumbbell-fly");
  });
  it("builds a balanced machine-preference five-day hypertrophy plan without duplicated high-fatigue hinges", () => {
    const user = profile({
      goal: "Build muscle",
      experience: "Intermediate",
      daysPerWeek: 5,
      availableDays: ["Mon", "Tue", "Thu", "Fri", "Sat"],
      sessionMinutes: 60,
      environment: "Commercial gym",
      equipment: ["full gym"],
      priorities: ["Chest", "Back"],
      exercisePreference: "Prefer machines",
      effortStyle: "Fewer hard sets · 2 sets · 0–1 RIR",
    });
    const program = buildProgram(user);
    const items = program.days
      .flatMap((day) => day.exercises)
      .map((exercise) => exerciseCatalog[exercise.exerciseId]);
    const direct = weeklyDirectVolume(program);
    expect(program.days.map((day) => day.weekday)).toEqual([
      "Mon",
      "Tue",
      "Thu",
      "Fri",
      "Sat",
    ]);
    expect(
      items.filter((item) =>
        ["romanian-deadlift", "dumbbell-rdl", "deadlift"].includes(item.id),
      ),
    ).toHaveLength(1);
    expect(items.some((item) => item.pattern === "knee-flexion")).toBe(true);
    expect(items.some((item) => item.pattern === "knee-extension")).toBe(true);
    expect(direct).toMatchObject({
      Chest: 10,
      Back: 10,
      Biceps: 2,
      Triceps: 2,
    });
    expect(
      items.filter((item) =>
        item.equipment.some((value) => ["machines", "cables"].includes(value)),
      ).length / items.length,
    ).toBeGreaterThan(0.7);
    expect(
      validateProgram(program, user, { requireProgramQuality: true }).valid,
    ).toBe(true);
  });
  it("does not count a Romanian deadlift as direct pulling volume", () => {
    const user = profile({
      daysPerWeek: 5,
      availableDays: ["Mon", "Tue", "Thu", "Fri", "Sat"],
      priorities: ["Chest", "Back"],
    });
    const program = buildProgram(user);
    const directPullingSets = program.days
      .flatMap((day) => day.exercises)
      .filter((exercise) =>
        ["horizontal-pull", "vertical-pull", "upper-back-pull"].includes(
          exerciseCatalog[exercise.exerciseId].pattern,
        ),
      )
      .reduce((sum, exercise) => sum + exercise.sets.length, 0);
    expect(weeklyDirectVolume(program).Back).toBe(directPullingSets);
  });
  it("uses loadable gym exercises instead of mobility-style bodyweight drills for the main Pull movement", () => {
    const user = profile({
      goal: "Build muscle",
      experience: "Beginner",
      daysPerWeek: 5,
      availableDays: WEEKDAYS,
      sessionMinutes: 60,
      environment: "Commercial gym",
      equipment: ["full gym"],
      priorities: ["Chest", "Back"],
      effortStyle: "Fewer hard sets · 2 sets · 0–1 RIR",
    });
    const pull = buildProgram(user).days.find((day) => day.name === "Pull");
    const main = pull.exercises.find(
      (exercise) => exercise.programmingRole === "main",
    );
    const item = exerciseCatalog[main.exerciseId];
    expect(item.pattern).toMatch(/pull/);
    expect(item.kind).toBe("compound");
    expect(item.progressionQuality).toBe("load-and-repetition");
    expect(
      pull.exercises.some((exercise) =>
        ["reverse-snow-angel", "floor-lat-pulldown"].includes(
          exercise.exerciseId,
        ),
      ),
    ).toBe(false);
  });
  it("uses externally loadable exercises throughout full-gym plans while retaining bodyweight-only fallbacks", () => {
    for (const goal of [
      "Build muscle",
      "Get stronger",
      "Lose fat",
      "General fitness",
      "Athletic performance",
    ])
      for (let daysPerWeek = 2; daysPerWeek <= 6; daysPerWeek++) {
        const program = buildProgram(
          profile({
            goal,
            daysPerWeek,
            availableDays: WEEKDAYS,
            environment: "Commercial gym",
            equipment: ["full gym"],
          }),
        );
        const avoidableBodyweight = program.days
          .flatMap((day) => day.exercises)
          .map((exercise) => exerciseCatalog[exercise.exerciseId])
          .filter((item) => item.bodyweight && item.kind !== "power");
        expect(avoidableBodyweight, `${goal} / ${daysPerWeek} days`).toEqual(
          [],
        );
      }
    const bodyweight = buildProgram(
      profile({
        daysPerWeek: 3,
        availableDays: ["Mon", "Wed", "Fri"],
        environment: "Home gym",
        equipment: ["bodyweight only"],
      }),
    );
    expect(
      bodyweight.days
        .flatMap((day) => day.exercises)
        .every((exercise) => exerciseCatalog[exercise.exerciseId].bodyweight),
    ).toBe(true);
  });
  it("prefers better-spaced full-body days when the available-day pool allows it", () => {
    const program = buildProgram(
      profile({ daysPerWeek: 3, availableDays: ["Wed", "Thu", "Fri", "Sun"] }),
    );
    expect(program.templateId).toBe("T3-FB");
    expect(program.days.map((day) => day.weekday)).toEqual([
      "Wed",
      "Fri",
      "Sun",
    ]);
  });
  it("keeps necessary adjacent full-body days when availability leaves no alternative", () => {
    const program = buildProgram(
      profile({ daysPerWeek: 3, availableDays: ["Wed", "Thu", "Sun"] }),
    );
    expect(program.days.map((day) => day.weekday)).toEqual([
      "Wed",
      "Thu",
      "Sun",
    ]);
    expect(
      validateProgram(
        program,
        profile({ daysPerWeek: 3, availableDays: ["Wed", "Thu", "Sun"] }),
      ).valid,
    ).toBe(true);
  });
  it("counts the repeating Sunday-to-Monday boundary when choosing among available days", () => {
    const program = buildProgram(
      profile({ daysPerWeek: 3, availableDays: ["Mon", "Tue", "Thu", "Sun"] }),
    );
    expect(program.days.map((day) => day.weekday)).toEqual([
      "Tue",
      "Thu",
      "Sun",
    ]);
  });
  it("resolves the actual next scheduled workout across the week boundary", () => {
    const state = stateFor({ daysPerWeek: 2, availableDays: ["Mon", "Thu"] });
    const next = nextScheduledWorkout(state, new Date(2026, 7, 23, 12));
    expect(next).toMatchObject({
      scheduledDate: "2026-08-24",
      workout: { weekday: "Mon" },
    });
    expect(
      nextScheduledWorkout(
        { ...state, program: null },
        new Date(2026, 7, 23, 12),
      ),
    ).toBeNull();
  });
  it("uses age range as secondary recovery context when enough days are available", () => {
    const program = buildProgram(
      profile({ ageRange: "60+", daysPerWeek: 5, availableDays: WEEKDAYS }),
    );
    const indexes = program.days.map((day) => WEEKDAYS.indexOf(day.weekday));
    const hasThreeDayRun = indexes.some(
      (value, index) =>
        index > 1 &&
        value - indexes[index - 1] === 1 &&
        indexes[index - 1] - indexes[index - 2] === 1,
    );
    expect(hasThreeDayRun).toBe(false);
  });
  it("uses a conservative effort floor and lower-fatigue equivalents for a 60+ starting profile without reducing load by assumption", () => {
    const options = {
      daysPerWeek: 4,
      availableDays: WEEKDAYS,
      sessionMinutes: 60,
      effortStyle: "Balanced workload · usually 3 sets · 1–2 RIR",
    };
    const younger = buildProgram(profile({ ...options, ageRange: "30–39" }));
    const older = buildProgram(profile({ ...options, ageRange: "60+" }));
    const compounds = older.days
      .flatMap((day) => day.exercises)
      .filter(
        (exercise) => exerciseCatalog[exercise.exerciseId].kind === "compound",
      );
    const highFatigueCount = (program) =>
      program.days
        .flatMap((day) => day.exercises)
        .filter(
          (exercise) =>
            exerciseCatalog[exercise.exerciseId].fatigueCost === "high",
        ).length;
    expect(
      Math.min(...compounds.map((exercise) => exercise.targetRir)),
    ).toBeGreaterThanOrEqual(3);
    expect(highFatigueCount(older)).toBeLessThanOrEqual(
      highFatigueCount(younger),
    );
    expect(
      older.days
        .flatMap((day) => day.exercises)
        .every((exercise) => exercise.sets.every((set) => set.weight === null)),
    ).toBe(true);
  });
  it("rejects avoidable consecutive lower sessions and keeps the local schedule recovery-friendly", () => {
    const p = profile({
      daysPerWeek: 4,
      availableDays: ["Mon", "Tue", "Thu", "Fri"],
    });
    const program = buildProgram(p);
    expect(validateProgram(program, p).valid).toBe(true);
    const weekdays = program.days.map((day) => day.weekday);
    const lower = program.days.filter((day) => day.name.startsWith("Lower"));
    expect(lower).toHaveLength(2);
    expect(
      Math.abs(
        WEEKDAYS.indexOf(lower[0].weekday) - WEEKDAYS.indexOf(lower[1].weekday),
      ),
    ).toBeGreaterThan(1);
    const bad = structuredClone(program);
    const ordered = [bad.days[1], bad.days[3], bad.days[0], bad.days[2]];
    bad.days = ordered.map((day, index) => ({
      ...day,
      weekday: weekdays[index],
    }));
    expect(validateProgram(bad, p).errors.join(" ")).toMatch(
      /recovery|consecutive/i,
    );
  });
  it("treats Sunday and the next Monday as consecutive and repairs an avoidable upper-to-upper boundary", () => {
    const p = profile({
      daysPerWeek: 4,
      availableDays: ["Mon", "Wed", "Sat", "Sun"],
    });
    const program = buildProgram(p);
    const upper = program.days.filter((day) => day.name.startsWith("Upper"));
    const lower = program.days.filter((day) => day.name.startsWith("Lower"));
    const bad = structuredClone(program);
    bad.source = "ai";
    bad.days = [
      { ...upper[0], weekday: "Mon" },
      { ...lower[0], weekday: "Wed" },
      { ...lower[1], weekday: "Sat" },
      { ...upper[1], weekday: "Sun" },
    ];
    expect(validateProgram(bad, p).errors.join(" ")).toMatch(
      /Sunday-to-Monday|consecutive/i,
    );
    const state = blankState();
    state.profile = { ...p, onboardingComplete: true };
    state.program = bad;
    const ids = bad.days.map((day) => day.id).sort();
    saveState(state);
    const loaded = loadState();
    const monday = loaded.program.days.find((day) => day.weekday === "Mon");
    const sunday = loaded.program.days.find((day) => day.weekday === "Sun");
    expect([
      monday.name.startsWith("Upper"),
      sunday.name.startsWith("Upper"),
    ]).not.toEqual([true, true]);
    expect(loaded.program.days.map((day) => day.id).sort()).toEqual(ids);
  });
  it("turns goal and preferred effort style into different set, rep, and RIR prescriptions without requiring failure", () => {
    const options = {
      daysPerWeek: 2,
      availableDays: ["Tue", "Sat"],
      sessionMinutes: 90,
    };
    const hypertrophy = buildProgram(
      profile({
        ...options,
        goal: "Build muscle",
        effortStyle: "Fewer hard sets · 2 sets · 0–1 RIR",
      }),
    );
    const strength = buildProgram(
      profile({
        ...options,
        goal: "Get stronger",
        effortStyle: "Balanced workload · usually 3 sets · 1–2 RIR",
      }),
    );
    const hardCompound = hypertrophy.days
      .flatMap((day) => day.exercises)
      .find((item) => exerciseCatalog[item.exerciseId].kind === "compound");
    const hardIsolation = hypertrophy.days
      .flatMap((day) => day.exercises)
      .find((item) => exerciseCatalog[item.exerciseId].kind === "isolation");
    const strengthCompound = strength.days
      .flatMap((day) => day.exercises)
      .find(
        (item) =>
          item.programmingRole === "main" &&
          exerciseCatalog[item.exerciseId].kind === "compound",
      );
    expect(hardCompound.sets).toHaveLength(2);
    expect(hardCompound.repMin).toBe(6);
    expect(hardCompound.repMax).toBe(10);
    expect(hardCompound.targetRir).toBe(1);
    expect(hardIsolation?.targetRir).toBe(1);
    expect(strengthCompound.repMin).toBe(3);
    expect(strengthCompound.repMax).toBe(6);
    expect(strengthCompound.targetRir).toBe(3);
    expect(strengthCompound.sets.length).toBeGreaterThan(
      hardCompound.sets.length,
    );
  });
  it("keeps all three effort choices materially distinct after duration and weekly-volume fitting", () => {
    const options = {
      daysPerWeek: 4,
      availableDays: WEEKDAYS,
      sessionMinutes: 60,
      ageRange: "30–39",
    };
    const exercises = (effortStyle) =>
      buildProgram(profile({ ...options, effortStyle })).days.flatMap(
        (day) => day.exercises,
      );
    const hard = exercises("Fewer hard sets · 2 sets · 0–1 RIR");
    const balanced = exercises("Balanced workload · usually 3 sets · 1–2 RIR");
    const moderate = exercises("More moderate sets · 3–4 sets · 2–3 RIR");
    expect(
      hard.every(
        (exercise) => exercise.sets.length === 2 && exercise.targetRir === 1,
      ),
    ).toBe(true);
    expect(
      moderate.every(
        (exercise) =>
          exercise.sets.length >= 3 &&
          exercise.sets.length <= 4 &&
          exercise.targetRir >= 2 &&
          exercise.targetRir <= 3,
      ),
    ).toBe(true);
    expect(
      hard.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    ).toBeLessThan(
      balanced.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    );
    expect(moderate.length).toBeLessThanOrEqual(balanced.length);
  });
  it("adds recoverable cardio only to fat-loss plans and scales it around frequency, time, environment, and age", () => {
    expect(
      conditioningForProfile(profile({ goal: "Build muscle" })),
    ).toBeNull();
    const lowerFrequency = profile({
      goal: "Lose fat",
      daysPerWeek: 3,
      sessionMinutes: 60,
      environment: "Commercial gym",
      ageRange: "30–39",
    });
    const lowerPlan = buildProgram(lowerFrequency);
    expect(lowerPlan.conditioning).toMatchObject({
      sessionsPerWeek: 2,
      durationMinutes: 30,
      intensity: "Easy to moderate · conversational pace",
      placement: "On rest days or after strength",
    });
    expect(lowerPlan.conditioning.modalities).toMatch(
      /incline walking|cycling/i,
    );
    expect(
      validateProgram(lowerPlan, lowerFrequency, {
        requireProgramQuality: true,
      }).valid,
    ).toBe(true);

    const highFrequency = profile({
      goal: "Lose fat",
      daysPerWeek: 6,
      availableDays: WEEKDAYS,
      sessionMinutes: 30,
      environment: "Home gym",
      equipment: ["resistance bands", "bodyweight only"],
      ageRange: "60+",
    });
    const highPlan = buildProgram(highFrequency);
    expect(highPlan.conditioning).toMatchObject({
      sessionsPerWeek: 1,
      durationMinutes: 20,
      intensity: "Easy · conversational pace",
      placement: "After strength or on the easiest rest day",
    });
    expect(highPlan.conditioning.modalities).toMatch(/walking|low-impact/i);
    expect(
      validateProgram(highPlan, highFrequency, { requireProgramQuality: true })
        .valid,
    ).toBe(true);
  });
  it("validates the full goal, experience, frequency, effort, and age personalization matrix", () => {
    for (const goal of [
      "General fitness",
      "Build muscle",
      "Lose fat",
      "Get stronger",
      "Athletic performance",
    ])
      for (const experience of ["Beginner", "Intermediate", "Advanced"])
        for (let daysPerWeek = 2; daysPerWeek <= 6; daysPerWeek++)
          for (const effortStyle of [
            "Balanced workload · usually 3 sets · 1–2 RIR",
            "Fewer hard sets · 2 sets · 0–1 RIR",
            "More moderate sets · 3–4 sets · 2–3 RIR",
          ])
            for (const ageRange of ["30–39", "60+"]) {
              const user = profile({
                goal,
                experience,
                daysPerWeek,
                availableDays: WEEKDAYS,
                effortStyle,
                ageRange,
              });
              const result = validateProgram(buildProgram(user), user, {
                requireProgramQuality: true,
              });
              expect(
                result.valid,
                `${goal} / ${experience} / ${daysPerWeek}d / ${effortStyle} / ${ageRange}: ${result.errors.join(" ")}`,
              ).toBe(true);
            }
  });
  it("derives honest duration estimates and rejects invalid rest, duration, and instance IDs", () => {
    const p = profile();
    const program = buildProgram(p);
    expect(validateProgram(program, p).valid).toBe(true);
    const invalid = structuredClone(program);
    invalid.days[0].estimatedMinutes = 5;
    invalid.days[0].exercises[0].restSeconds = 0;
    invalid.days[0].exercises[1].id = invalid.days[0].exercises[0].id;
    expect(validateProgram(invalid, p).errors.join(" ")).toMatch(
      /duration|prescription|duplicate/i,
    );
  });
  it("can explicitly apply a today-only adaptation before the workout has started", () => {
    const state = stateFor();
    state.program.days[0].weekday = weekday();
    const permanent = state.program.days[0].exercises.map(
      (item) => item.exerciseId,
    );
    const proposal = adaptTodayProposal(state, 20);
    expect(state.activeWorkout).toBeNull();
    applyCoachAction(state, proposal);
    expect(state.activeWorkout).toBeNull();
    expect(state.todayAdaptation.exerciseIds).toEqual(proposal.exerciseIds);
    expect(
      adaptedTemplateForToday(state).exercises.map((item) => item.exerciseId),
    ).toEqual(proposal.exerciseIds);
    expect(
      state.program.days[0].exercises.map((item) => item.exerciseId),
    ).toEqual(permanent);
  });
  it("persists a pending Today adaptation and active Coach conversation across reload", () => {
    const other = WEEKDAYS[(WEEKDAYS.indexOf(weekday()) + 3) % 7];
    const state = stateFor({
      daysPerWeek: 2,
      availableDays: [weekday(), other],
    });
    state.profile.onboardingComplete = true;
    const proposal = adaptTodayProposal(state, 20);
    applyCoachAction(state, proposal);
    state.activeCoachConversationId = "thread-1";
    state.conversations = [
      {
        id: "message-1",
        conversationId: "thread-1",
        user: "Adapt today.",
        reply: { text: "I shortened it.", action: proposal },
        actionResult: {
          status: "applied",
          workoutName: adaptedTemplateForToday(state).name,
        },
      },
    ];
    saveState(state);
    const loaded = loadState();
    expect(loaded.activeWorkout).toBeNull();
    expect(loaded.activeCoachConversationId).toBe("thread-1");
    expect(loaded.conversations[0].actionResult.status).toBe("applied");
    expect(
      adaptedTemplateForToday(loaded).exercises.map((item) => item.exerciseId),
    ).toEqual(proposal.exerciseIds);
  });
  it("reverts the known legacy bug where a named Saturday adaptation was stored on today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 23, 12));
    try {
      const state = stateFor({ daysPerWeek: 2, availableDays: ["Sun", "Sat"] });
      state.profile.onboardingComplete = true;
      const today = state.program.days.find((day) => day.weekday === "Sun");
      const wrong = {
        type: "adapt-today",
        targetDate: "2026-08-23",
        programDayId: today.id,
        exerciseIds: today.exercises.slice(0, 2).map((item) => item.exerciseId),
        minutes: 35,
      };
      state.todayAdaptation = {
        id: "wrong",
        date: "2026-08-23",
        programDayId: today.id,
        exerciseIds: wrong.exerciseIds,
        minutes: 35,
      };
      state.conversations = [
        {
          id: "message-1",
          conversationId: "thread-1",
          user: "adapt saturday to 35 minutes",
          reply: { text: "I adapted today.", action: wrong },
          actionResult: { status: "applied", targetDate: "2026-08-23" },
        },
      ];
      saveState(state);
      const loaded = loadState();
      expect(loaded.todayAdaptation).toBeNull();
      expect(loaded.conversations[0].reply.action).toBeNull();
      expect(loaded.conversations[0].actionResult.status).toBe("reverted");
      expect(loaded.conversations[0].reply.text).toMatch(
        /automatically reverted/i,
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it("tells Coach explicitly when today is a rest day", () => {
    const todayIndex = WEEKDAYS.indexOf(weekday());
    const days = [
      WEEKDAYS[(todayIndex + 2) % 7],
      WEEKDAYS[(todayIndex + 4) % 7],
    ];
    const state = stateFor({ daysPerWeek: 2, availableDays: days });
    const context = coachContext(state);
    expect(context.today).toBeNull();
    expect(context.todayStatus).toMatchObject({
      date: isoDay(),
      weekday: weekday(),
      type: "rest-day",
      workoutId: null,
    });
    expect(context.currentWeekSchedule).toHaveLength(2);
  });
  it("applies only reviewed recurring program exercise changes", () => {
    const state = stateFor({ daysPerWeek: 2, availableDays: ["Tue", "Sat"] });
    const workout = state.program.days[0];
    const addition = Object.values(exerciseCatalog).find(
      (item) =>
        isExerciseAllowed(item, state.profile) &&
        !workout.exercises.some((exercise) => exercise.exerciseId === item.id),
    );
    const before = workout.exercises.length;
    applyCoachAction(state, {
      type: "program-exercise-change",
      changes: [
        {
          workoutId: workout.id,
          addExerciseIds: [addition.id],
          removeExerciseIds: [],
        },
      ],
    });
    expect(workout.exercises).toHaveLength(before + 1);
    expect(workout.exercises.at(-1).exerciseId).toBe(addition.id);
    expect(state.program.version).toBe(2);
  });
  it("reserves both horizontal and vertical pulling in five- and six-day plans, including short sessions", () => {
    for (const daysPerWeek of [5, 6])
      for (const sessionMinutes of [30, 60]) {
        const user = profile({
          goal: "General fitness",
          daysPerWeek,
          availableDays: WEEKDAYS,
          sessionMinutes,
        });
        const program = buildProgram(user);
        const pulls = program.days.filter((day) => /^Pull/i.test(day.name));
        expect(pulls.length).toBeGreaterThan(0);
        for (const day of pulls) {
          const patterns = day.exercises.map(
            (exercise) => exerciseCatalog[exercise.exerciseId].pattern,
          );
          expect(patterns).toContain("horizontal-pull");
          expect(patterns).toContain("vertical-pull");
          expect(estimateSessionMinutes(day.exercises)).toBeLessThanOrEqual(
            sessionMinutes + 5,
          );
        }
      }
  });
  it("uses barbell anchors for strength while letting an explicit machine preference win", () => {
    const options = {
      goal: "Get stronger",
      daysPerWeek: 4,
      availableDays: WEEKDAYS,
      sessionMinutes: 60,
    };
    const neutral = buildProgram(
      profile({ ...options, exercisePreference: "No preference" }),
    );
    const free = buildProgram(
      profile({ ...options, exercisePreference: "Prefer free weights" }),
    );
    const machines = buildProgram(
      profile({ ...options, exercisePreference: "Prefer machines" }),
    );
    const firstUpperPress = (program) =>
      program.days
        .find((day) => /^Upper/i.test(day.name))
        .exercises.find((exercise) =>
          ["horizontal-push", "incline-push"].includes(
            exerciseCatalog[exercise.exerciseId].pattern,
          ),
        ).exerciseId;
    expect(firstUpperPress(neutral)).toBe("barbell-bench-press");
    expect(
      exerciseCatalog[firstUpperPress(free)].equipment.some((value) =>
        ["barbell", "dumbbells"].includes(value),
      ),
    ).toBe(true);
    expect(
      exerciseCatalog[firstUpperPress(machines)].equipment.some((value) =>
        ["machines", "cables"].includes(value),
      ),
    ).toBe(true);
  });
  it("keeps bands as a home-equipment default but never forces them into a full-gym plan", () => {
    expect(exerciseCatalog["band-row"].progressionQuality).toBe(
      "band-resistance",
    );
    for (const goal of [
      "General fitness",
      "Build muscle",
      "Lose fat",
      "Get stronger",
      "Athletic performance",
    ])
      for (let daysPerWeek = 2; daysPerWeek <= 6; daysPerWeek++) {
        const commercial = profile({
          goal,
          daysPerWeek,
          availableDays: WEEKDAYS,
          environment: "Commercial gym",
          equipment: ["full gym"],
        });
        const ids = buildProgram(commercial).days.flatMap((day) =>
          day.exercises.map((exercise) => exercise.exerciseId),
        );
        expect(
          ids.some((id) =>
            exerciseCatalog[id].equipment.includes("resistance bands"),
          ),
        ).toBe(false);
        expect(ids.some((id) => isExerciseAutoGenerationBlocked(id))).toBe(
          false,
        );
      }
    const bands = profile({
      environment: "Home gym",
      equipment: ["resistance bands", "bodyweight only"],
    });
    const program = buildProgram(bands);
    const ids = program.days.flatMap((day) =>
      day.exercises.map((exercise) => exercise.exerciseId),
    );
    expect(ids).toContain("band-row");
    expect(ids).toContain("band-lat-pulldown");
    expect(
      validateProgram(program, bands, { requireProgramQuality: true }).valid,
    ).toBe(true);
  });
  it("keeps No preference modality-neutral when exercise attributes are otherwise identical", () => {
    const base = {
      id: "same-free",
      pattern: "horizontal-push",
      muscles: ["Chest"],
      equipment: ["barbell"],
      kind: "compound",
      progressionQuality: "load-and-repetition",
      stability: "moderate",
      fatigueCost: "moderate",
      technicalDifficulty: 1,
    };
    const machine = { ...base, id: "same-mach", equipment: ["machines"] };
    const user = profile({
      goal: "General fitness",
      exercisePreference: "No preference",
    });
    expect(candidateScore(base, user)).toBe(candidateScore(machine, user));
  });
  it("applies a soft fatigue-collision penalty after two demanding lower compounds", () => {
    const user = profile({ goal: "Get stronger" });
    const hipThrust = exerciseCatalog["hip-thrust"];
    const gluteBridge = exerciseCatalog["glute-bridge"];
    const demanding = [
      exerciseCatalog["deadlift"],
      exerciseCatalog["back-squat"],
    ];
    expect(
      candidateScore(
        hipThrust,
        user,
        new Map(),
        "hip-extension",
        0,
        "accessory",
        demanding,
      ),
    ).toBeLessThan(
      candidateScore(
        hipThrust,
        user,
        new Map(),
        "hip-extension",
        0,
        "accessory",
        [],
      ),
    );
    expect(
      candidateScore(
        gluteBridge,
        user,
        new Map(),
        "hip-extension",
        0,
        "accessory",
        demanding,
      ),
    ).toBe(
      candidateScore(
        gluteBridge,
        user,
        new Map(),
        "hip-extension",
        0,
        "accessory",
        [],
      ),
    );
  });
  it("adds a second hypertrophy chest compound only for Chest priority and places it before isolations", () => {
    const options = {
      goal: "Build muscle",
      daysPerWeek: 5,
      availableDays: WEEKDAYS,
      sessionMinutes: 75,
    };
    const balanced = buildProgram(
      profile({ ...options, priorities: ["Balanced"] }),
    );
    const focused = buildProgram(
      profile({ ...options, priorities: ["Chest"] }),
    );
    const isChest = (exercise) =>
      ["horizontal-push", "incline-push"].includes(
        exerciseCatalog[exercise.exerciseId].pattern,
      );
    expect(
      balanced.days.every((day) => day.exercises.filter(isChest).length <= 1),
    ).toBe(true);
    const doubled = focused.days.filter(
      (day) => day.exercises.filter(isChest).length > 1,
    );
    expect(doubled.length).toBeGreaterThan(0);
    for (const day of doubled) {
      const chestIndexes = day.exercises
        .map((exercise, index) => (isChest(exercise) ? index : -1))
        .filter((index) => index >= 0);
      const firstIsolation = day.exercises.findIndex(
        (exercise) => exerciseCatalog[exercise.exerciseId].kind === "isolation",
      );
      expect(chestIndexes[1]).toBe(chestIndexes[0] + 1);
      if (firstIsolation >= 0)
        expect(chestIndexes[1]).toBeLessThan(firstIsolation);
    }
  });
  it("never regenerates an existing plan or active workout after generator rules change", () => {
    const state = stateFor({
      goal: "Get stronger",
      daysPerWeek: 4,
      availableDays: WEEKDAYS,
    });
    state.profile.onboardingComplete = true;
    state.activeWorkout = startWorkout(state, state.program.days[0]);
    state.activeWorkout.exercises[0].sets[0] = {
      ...state.activeWorkout.exercises[0].sets[0],
      weight: 72.5,
      reps: 5,
      completed: true,
    };
    const expectedProgram = state.program.days.map((day) => ({
      id: day.id,
      weekday: day.weekday,
      exercises: day.exercises.map((exercise) => exercise.exerciseId),
    }));
    const expectedActive = structuredClone(state.activeWorkout);
    saveState(state);
    const loaded = loadState();
    expect(
      loaded.program.days.map((day) => ({
        id: day.id,
        weekday: day.weekday,
        exercises: day.exercises.map((exercise) => exercise.exerciseId),
      })),
    ).toEqual(expectedProgram);
    expect(loaded.activeWorkout).toEqual(expectedActive);
  });
  it("persists a generated program without regenerating it on reload", () => {
    const state = stateFor();
    state.profile.onboardingComplete = true;
    const id = state.program.id;
    saveState(state);
    const loaded = loadState();
    expect(loaded.program.id).toBe(id);
    expect(loaded.profile.onboardingComplete).toBe(true);
  });
  it("repairs a persisted recovery conflict without deleting the plan or changing session IDs", () => {
    const state = stateFor({
      daysPerWeek: 4,
      availableDays: ["Mon", "Tue", "Thu", "Fri"],
    });
    state.profile.onboardingComplete = true;
    const weekdays = state.program.days.map((day) => day.weekday);
    const ordered = [
      state.program.days[1],
      state.program.days[3],
      state.program.days[0],
      state.program.days[2],
    ];
    state.program.days = ordered.map((day, index) => ({
      ...day,
      weekday: weekdays[index],
    }));
    const ids = state.program.days.map((day) => day.id).sort();
    saveState(state);
    const loaded = loadState();
    expect(loaded.program).not.toBeNull();
    expect(loaded.program.days.map((day) => day.id).sort()).toEqual(ids);
    const lowerDays = loaded.program.days
      .filter((day) => day.name.startsWith("Lower"))
      .map((day) => WEEKDAYS.indexOf(day.weekday));
    expect(Math.abs(lowerDays[0] - lowerDays[1])).toBeGreaterThan(1);
  });
  it("never repairs or rearranges an imported source schedule on reload", () => {
    const state = stateFor({
      daysPerWeek: 4,
      availableDays: ["Mon", "Tue", "Thu", "Fri"],
    });
    state.profile.onboardingComplete = true;
    const weekdays = state.program.days.map((day) => day.weekday);
    const sourceOrder = [
      state.program.days[1],
      state.program.days[3],
      state.program.days[0],
      state.program.days[2],
    ];
    state.program = {
      ...state.program,
      source: "ai-import",
      days: sourceOrder.map((day, index) => ({
        ...day,
        weekday: weekdays[index],
        exercises: day.exercises.map((exercise) => ({
          ...exercise,
          importedName: exerciseCatalog[exercise.exerciseId].name,
          originalImportedName: exerciseCatalog[exercise.exerciseId].name,
          exerciseSource: "catalog",
        })),
      })),
    };
    const expected = state.program.days.map((day) => ({
      weekday: day.weekday,
      id: day.id,
      name: day.name,
    }));
    saveState(state);
    const loaded = loadState();
    expect(loaded.program).not.toBeNull();
    expect(
      loaded.program.days.map((day) => ({
        weekday: day.weekday,
        id: day.id,
        name: day.name,
      })),
    ).toEqual(expected);
  });
  it("recovers malformed persistence and computes consistency from real sessions", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        profile: profile(),
        program: { days: "bad" },
        workouts: "bad",
      }),
    );
    expect(loadState().program).toBeNull();
    const state = stateFor({ daysPerWeek: 2, availableDays: ["Mon", "Fri"] });
    state.workouts = [
      {
        templateId: "Mon",
        completedAt: weekDate("Mon").toISOString(),
        exercises: [{ sets: [{ completed: true }] }],
      },
    ];
    const result = consistencyForCurrentWeek(state);
    expect(result.completed).toBe(1);
    expect(result.planned).toBe(2);
  });
  it("uses the full current-week plan and only real completed-set sessions for consistency", () => {
    const state = stateFor({
      daysPerWeek: 3,
      availableDays: ["Mon", "Wed", "Fri"],
    });
    const reference = new Date(2026, 7, 19, 12);
    const logged = (date) => ({
      completedAt: date.toISOString(),
      exercises: [{ sets: [{ completed: true }] }],
    });
    state.workouts = [
      logged(weekDate("Mon", reference)),
      {
        completedAt: weekDate("Wed", reference).toISOString(),
        exercises: [{ sets: [{ completed: false }] }],
      },
      logged(new Date(2026, 7, 10, 12)),
    ];
    expect(consistencyForCurrentWeek(state, reference)).toEqual({
      completed: 1,
      planned: 3,
    });
    expect(consistencyForCurrentWeek(state, new Date(2026, 7, 26, 12))).toEqual(
      { completed: 0, planned: 3 },
    );
  });
  it("converts display units while retaining canonical kilograms", () => {
    expect(displayWeight(82.5, "lb")).toBe(181.88);
    expect(storedWeight(displayWeight(82.5, "lb"), "lb")).toBe(82.5);
  });
  it("shows honest five-minute workout estimates without changing internal calculations", () => {
    expect(roundedEstimate(64)).toBe(65);
    expect(roundedEstimate(61)).toBe(60);
    expect(roundedEstimate(30)).toBe(30);
  });
});
