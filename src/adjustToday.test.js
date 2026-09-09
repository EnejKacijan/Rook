import { describe, expect, it } from "vitest";
import {
  ADJUST_TODAY_MODES,
  applyTodayAdjustment,
  buildTodayAdjustment,
  resolveTodayAdjustment,
  restoreOriginalTodayWorkout,
  todayAdjustmentConflict,
} from "./adjustToday.js";
import {
  adaptedTemplateForToday,
  blankState,
  completeWorkout,
  deserializeState,
  estimateSessionMinutes,
  exerciseCatalog,
  isoDay,
  isExerciseAllowed,
  progressionFor,
  serializeState,
  startWorkout,
  validateProgram,
  weekday,
} from "./domain.js";
import { validateSupersetExercises } from "./supersets.js";
import { buildBackupArchive, parseBackupArchive } from "./backup.js";

function sets(count, prefix = "set") {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-set-${index}`,
    weight: null,
    reps: 8,
    completed: false,
    rir: null,
  }));
}

function exercise(id, count = 4, options = {}) {
  const item = exerciseCatalog[id];
  const entryId = options.entryId || `entry-${id}`;
  return {
    id: entryId,
    exerciseId: id,
    programmingRole: options.role || "accessory",
    requiredRole: options.requiredRole ?? options.role === "main",
    sets: sets(count, entryId),
    repMin: 6,
    repMax: 10,
    targetRir: options.targetRir ?? 1,
    restSeconds: item?.restSeconds || 90,
    defaultIncrement: item?.increment || 2.5,
    ...(options.supersetId ? { supersetId: options.supersetId } : {}),
  };
}

function fixture(exercises = null) {
  const state = blankState();
  const date = new Date();
  state.profile.onboardingComplete = true;
  state.profile.environment = "Commercial gym";
  state.profile.equipment = ["full gym"];
  state.profile.experience = "Intermediate";
  state.profile.goal = "Build muscle";
  state.profile.ageRange = "25–39";
  state.profile.daysPerWeek = 2;
  state.profile.availableDays = [
    weekday(date),
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].find(
      (day) => day !== weekday(date),
    ),
  ];
  state.profile.sessionMinutes = 120;
  state.profile.rirEnabled = true;
  state.selectedDate = isoDay(date);
  state.selectedDay = weekday(date);
  state.program = {
    id: "program-1",
    name: "Test plan",
    version: 4,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    days: [
      {
        id: "day-1",
        weekday: weekday(date),
        name: "Upper A",
        type: "workout",
        exercises:
          exercises ||
          [
            exercise("barbell-bench-press", 4, { role: "main" }),
            exercise("barbell-row", 4, { role: "main" }),
            exercise("lat-pulldown", 4),
            exercise("cable-fly", 4, { requiredRole: false }),
            exercise("lateral-raise", 4, { requiredRole: false }),
            exercise("cable-curl", 4, { requiredRole: false }),
          ],
      },
    ],
  };
  state.program.days.push({
    ...structuredClone(state.program.days[0]),
    id: "day-2",
    weekday: state.profile.availableDays[1],
    name: "Upper B",
    exercises: state.program.days[0].exercises.map((item, index) => ({
      ...structuredClone(item),
      id: `day-2-entry-${index}`,
      supersetId: undefined,
      sets: item.sets.map((set, setIndex) => ({
        ...structuredClone(set),
        id: `day-2-set-${index}-${setIndex}`,
      })),
    })),
  });
  state.program.days[1].estimatedMinutes = estimateSessionMinutes(
    state.program.days[1].exercises,
  );
  state.program.days[0].estimatedMinutes = estimateSessionMinutes(
    state.program.days[0].exercises,
  );
  return state;
}

describe("Adjust Today domain", () => {
  it.each([30, 45])(
    "shortens a long workout toward %i minutes without mutating the plan",
    (minutes) => {
      const state = fixture();
      const original = structuredClone(state.program);
      const result = buildTodayAdjustment(state, {
        mode: ADJUST_TODAY_MODES.lessTime,
        minutes,
      });
      expect(result.status).toBe("ready");
      expect(result.proposal.workout.exercises[0].exerciseId).toBe(
        "barbell-bench-press",
      );
      expect(result.proposal.workout.exercises).toContainEqual(
        expect.objectContaining({ exerciseId: "barbell-row" }),
      );
      expect(result.proposal.workout.estimatedMinutes).toBeLessThan(
        state.program.days[0].estimatedMinutes,
      );
      expect(result.proposal.workout.exercises.every((item) => item.sets.length > 0)).toBe(true);
      expect(validateSupersetExercises(result.proposal.workout.exercises)).toEqual([]);
      expect(state.program).toEqual(original);
    },
  );

  it("does not pretend an already-short workout needs shortening", () => {
    const state = fixture([
      exercise("barbell-bench-press", 2, { role: "main" }),
      exercise("barbell-row", 2, { role: "main" }),
    ]);
    expect(
      buildTodayAdjustment(state, {
        mode: ADJUST_TODAY_MODES.lessTime,
        minutes: 60,
      }),
    ).toMatchObject({ status: "unchanged" });
  });

  it("keeps superset metadata valid when time trimming removes or reduces work", () => {
    const state = fixture([
      exercise("barbell-bench-press", 4, { role: "main" }),
      exercise("barbell-row", 4, { role: "main" }),
      exercise("cable-fly", 3, { supersetId: "pair", requiredRole: false }),
      exercise("lateral-raise", 3, { supersetId: "pair", requiredRole: false }),
      exercise("cable-curl", 3, { requiredRole: false }),
    ]);
    const result = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.lessTime,
      minutes: 30,
    });
    expect(result.status).toBe("ready");
    expect(validateSupersetExercises(result.proposal.workout.exercises)).toEqual([]);
  });

  it("creates a conservative low-energy version and never lowers RIR", () => {
    const state = fixture();
    const result = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.lowEnergy,
    });
    expect(result.status).toBe("ready");
    for (const adjusted of result.proposal.workout.exercises) {
      const original = state.program.days[0].exercises.find(
        (item) => item.id === adjusted.id,
      );
      expect(adjusted.targetRir).toBeGreaterThanOrEqual(original.targetRir);
      expect(adjusted.sets.length).toBeGreaterThan(0);
    }
    expect(result.proposal.workout.exercises[0].sets).toHaveLength(4);
    expect(result.proposal.workout.estimatedMinutes).toBeLessThan(
      state.program.days[0].estimatedMinutes,
    );
  });

  it("does not over-reduce an already low-volume workout", () => {
    const state = fixture([
      exercise("barbell-bench-press", 1, { role: "main", targetRir: 4 }),
      exercise("barbell-row", 1, { role: "main", targetRir: 4 }),
    ]);
    const result = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.lowEnergy,
    });
    expect(result.status).toBe("ready");
    expect(result.proposal.meaningful).toBe(false);
    expect(result.proposal.workout.exercises).toHaveLength(2);
    expect(result.proposal.workout.exercises.every((item) => item.sets.length === 1)).toBe(true);
  });

  it("uses a temporary equipment profile without changing the saved profile", () => {
    const state = fixture();
    const savedEquipment = [...state.profile.equipment];
    const result = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.equipment,
      equipment: ["dumbbells", "barbell/rack/bench"],
    });
    expect(result.status).toBe("ready");
    const unresolved = new Set(
      result.proposal.unresolved.map((item) => item.entryId),
    );
    for (const adjusted of result.proposal.workout.exercises.filter(
      (item) => !unresolved.has(item.id),
    )) {
      const item = exerciseCatalog[adjusted.exerciseId];
      if (!item) continue;
      expect(
        isExerciseAllowed(item, {
          ...state.profile,
          environment: "Home gym",
          equipment: ["dumbbells", "barbell/rack/bench"],
        }),
        adjusted.exerciseId,
      ).toBe(true);
    }
    expect(state.profile.equipment).toEqual(savedEquipment);
    expect(state.program.days[0].exercises[0].exerciseId).toBe("barbell-bench-press");
  });

  it("records a saved gym reference as today-only context", () => {
    const state = fixture();
    state.gymProfiles = [
      { id: "gym-main", name: "Main Gym", equipment: ["full gym"] },
      { id: "gym-home", name: "Home", equipment: ["dumbbells", "resistance bands"] },
    ];
    state.defaultGymProfileId = "gym-main";
    const result = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.equipment,
      equipment: state.gymProfiles[1].equipment,
      gymProfileId: "gym-home",
      gymProfileName: "Home",
    });
    expect(result.proposal).toMatchObject({
      gymProfileId: "gym-home",
      gymProfileName: "Home",
      temporaryEquipment: ["dumbbells", "resistance bands"],
    });
    expect(state.defaultGymProfileId).toBe("gym-main");
    expect(state.profile.equipment).toEqual(["full gym"]);
  });

  it("uses the shared explicit preference ranking during Adjust Today", () => {
    const state = fixture();
    const cable = state.program.days[0].exercises.find(
      (item) => item.exerciseId === "cable-fly",
    );
    state.substitutionPreferences = [{
      schemaVersion: 1,
      id: "sub-cable-fly-global",
      sourceExerciseId: "cable-fly",
      replacementExerciseId: "dumbbell-fly",
      gymProfileId: null,
      createdAt: "2026-09-05T10:00:00.000Z",
      updatedAt: "2026-09-05T10:00:00.000Z",
    }];
    const result = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.unavailable,
      unavailableEntryIds: [cable.id],
    });
    expect(result.proposal.workout.exercises.find((item) => item.id === cable.id).exerciseId)
      .toBe("dumbbell-fly");
  });

  it("keeps valid custom warm-ups and drops ramp-up sets tied to replaced exercises", () => {
    const state = fixture();
    state.program.days[0].warmupPlan = {
      mode: "custom",
      items: [{ id: "general", label: "Easy bike", minutes: 4 }],
      rampUpSets: [
        {
          id: "bench-ramp",
          targetExerciseEntryId: "entry-barbell-bench-press",
          sets: [{ id: "bench-ramp-1", reps: 8, loadKind: "percent_working", loadValue: 50 }],
        },
        {
          id: "row-ramp",
          targetExerciseEntryId: "entry-barbell-row",
          sets: [{ id: "row-ramp-1", reps: 8, loadKind: "percent_working", loadValue: 50 }],
        },
      ],
    };
    const result = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.unavailable,
      unavailableEntryIds: ["entry-barbell-bench-press"],
    });
    expect(result.status).toBe("ready");
    expect(result.proposal.workout.warmupPlan.items).toEqual(
      state.program.days[0].warmupPlan.items,
    );
    expect(result.proposal.workout.warmupPlan.rampUpSets).toEqual([
      state.program.days[0].warmupPlan.rampUpSets[1],
    ]);
  });

  it("produces safe low-energy targets when RIR tracking is disabled", () => {
    const state = fixture();
    state.profile.rirEnabled = false;
    const result = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.lowEnergy,
    });
    expect(result.status).toBe("ready");
    expect(
      result.proposal.workout.exercises.every(
        (item) => Number.isFinite(item.targetRir) && item.targetRir >= 0 && item.targetRir <= 10,
      ),
    ).toBe(true);
    expect(state.profile.rirEnabled).toBe(false);
  });

  it("flags a custom exercise with missing metadata instead of inventing a replacement", () => {
    const custom = exercise("barbell-bench-press", 3, { entryId: "custom-entry" });
    custom.exerciseId = "my-custom-lift";
    custom.importedName = "My Custom Lift";
    custom.importedExercise = { id: "my-custom-lift", name: "My Custom Lift", pattern: null };
    const state = fixture([custom, exercise("barbell-row", 3, { role: "main" })]);
    const result = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.unavailable,
      unavailableEntryIds: ["custom-entry"],
    });
    expect(result.proposal.unresolved).toEqual([
      expect.objectContaining({ entryId: "custom-entry" }),
    ]);
    expect(result.proposal.workout.exercises[0].exerciseId).toBe("my-custom-lift");
  });

  it("replaces multiple unavailable exercises and preserves valid superset pairing", () => {
    const state = fixture([
      exercise("cable-fly", 3, { supersetId: "pair" }),
      exercise("lateral-raise", 3, { supersetId: "pair" }),
      exercise("barbell-row", 3, { role: "main" }),
    ]);
    const result = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.unavailable,
      unavailableEntryIds: ["entry-cable-fly", "entry-lateral-raise"],
    });
    expect(result.status).toBe("ready");
    expect(result.proposal.changes.filter((item) => item.kind === "replaced")).toHaveLength(2);
    expect(validateSupersetExercises(result.proposal.workout.exercises)).toEqual([]);
  });

  it("allows an explicit manual resolution when automatic matching is unavailable", () => {
    const custom = exercise("barbell-bench-press", 3, { entryId: "custom-entry" });
    custom.exerciseId = "my-custom-lift";
    custom.importedName = "My Custom Lift";
    custom.importedExercise = { id: "my-custom-lift", name: "My Custom Lift", pattern: null };
    const state = fixture([custom, exercise("barbell-row", 3, { role: "main" })]);
    const built = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.unavailable,
      unavailableEntryIds: ["custom-entry"],
    }).proposal;
    const resolved = resolveTodayAdjustment(
      built,
      "custom-entry",
      "dumbbell-bench-press",
      state.profile,
    );
    expect(resolved.unresolved).toHaveLength(0);
    expect(resolved.workout.exercises[0].exerciseId).toBe("dumbbell-bench-press");
  });

  it("applies and restores atomically while leaving the recurring plan unchanged", () => {
    const state = fixture();
    const originalPlan = structuredClone(state.program);
    const proposal = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.lessTime,
      minutes: 30,
    }).proposal;
    const applied = applyTodayAdjustment(state, proposal, 1234);
    expect(applied.status).toBe("applied");
    expect(applied.state.program).toEqual(originalPlan);
    expect(adaptedTemplateForToday(applied.state).exercises).toEqual(
      proposal.workout.exercises,
    );
    const restored = restoreOriginalTodayWorkout(applied.state);
    expect(restored.status).toBe("restored");
    expect(restored.state.todayAdaptation).toBeNull();
    expect(adaptedTemplateForToday(restored.state)).toEqual(
      restored.state.program.days[0],
    );
  });

  it("rejects stale proposals and adjustments after workout start", () => {
    const state = fixture();
    const proposal = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.lessTime,
      minutes: 30,
    }).proposal;
    state.program.days[0].exercises[0].repMax = 12;
    state.program.version += 1;
    expect(todayAdjustmentConflict(state, proposal)).toBe("workout-changed");
    expect(applyTodayAdjustment(state, proposal).status).toBe("conflict");
    state.activeWorkout = { id: "already-started" };
    expect(restoreOriginalTodayWorkout(state).status).toBe("unavailable");
  });

  it("survives serialization, starts through the normal workout path, and records actual work", () => {
    const state = fixture();
    const proposal = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.lessTime,
      minutes: 30,
    }).proposal;
    const applied = applyTodayAdjustment(state, proposal, 1234).state;
    const checked = validateProgram(applied.program, applied.profile);
    if (!checked.valid) throw new Error(checked.errors.join(" | "));
    const loaded = deserializeState(serializeState(applied));
    const template = adaptedTemplateForToday(loaded);
    loaded.activeWorkout = startWorkout(loaded, template);
    loaded.todayAdaptation = null;
    expect(loaded.activeWorkout.adjustment.mode).toBe(ADJUST_TODAY_MODES.lessTime);
    expect(loaded.activeWorkout.originalPlannedWorkout.exercises).toHaveLength(6);
    loaded.activeWorkout.exercises.forEach((item) =>
      item.sets.forEach((set) => {
        set.completed = true;
        set.reps = item.repMax;
        set.weight = 20;
        set.rir = item.targetRir;
      }),
    );
    const completed = completeWorkout(loaded);
    const history = completed.workouts.at(-1);
    expect(history.adapted).toBe(true);
    expect(history.adjustment.mode).toBe(ADJUST_TODAY_MODES.lessTime);
    expect(history.exercises).toHaveLength(template.exercises.length);
    expect(history.exercises).not.toHaveLength(6);
    const advice = progressionFor(history.exercises[0], completed.workouts, completed.profile);
    expect(advice).toMatchObject({ type: 'hold', title: 'Repeat to confirm' });
    expect(advice).not.toHaveProperty('weight');
  });

  it("survives a complete Backup & Restore archive round trip", async () => {
    const state = fixture();
    const proposal = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.lowEnergy,
    }).proposal;
    const applied = applyTodayAdjustment(state, proposal, 1234).state;
    const archive = await buildBackupArchive(applied, []);
    const restored = await parseBackupArchive(archive.bytes);
    expect(restored.state.todayAdaptation).toMatchObject({
      schemaVersion: 1,
      mode: ADJUST_TODAY_MODES.lowEnergy,
      date: isoDay(),
      programDayId: applied.program.days[0].id,
    });
    expect(restored.state.todayAdaptation.workout.exercises).toEqual(
      applied.todayAdaptation.workout.exercises,
    );
    expect(adaptedTemplateForToday(restored.state).adapted).toBe(true);
  });

  it("preserves completed adjusted-session metadata through Backup & Restore", async () => {
    const state = fixture();
    const proposal = buildTodayAdjustment(state, {
      mode: ADJUST_TODAY_MODES.lessTime,
      minutes: 30,
    }).proposal;
    const applied = applyTodayAdjustment(state, proposal, 1234).state;
    applied.activeWorkout = startWorkout(applied, adaptedTemplateForToday(applied));
    applied.todayAdaptation = null;
    applied.activeWorkout.exercises.forEach((item) =>
      item.sets.forEach((set) => {
        set.completed = true;
        set.reps = item.repMax;
        set.weight = 20;
      }),
    );
    const completed = completeWorkout(applied);
    const archive = await buildBackupArchive(completed, []);
    const restored = await parseBackupArchive(archive.bytes);
    expect(restored.state.workouts.at(-1)).toMatchObject({
      adapted: true,
      adjustment: {
        mode: ADJUST_TODAY_MODES.lessTime,
        requestedMinutes: 30,
      },
    });
    expect(restored.state.workouts.at(-1).originalPlannedWorkout.exercises).toHaveLength(6);
  });
});
