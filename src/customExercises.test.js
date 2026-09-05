import { describe, expect, it } from "vitest";
import { deserializeState, exerciseCatalog, exerciseMatchesQuery, serializeState } from "./domain.js";
import { createReturningUserFixture } from "./demoFixture.js";
import { rankSubstitutionCandidates } from "./substitutions.js";
import {
  availableCustomExerciseItems,
  createCustomExercise,
  customExerciseCatalogItem,
  customExerciseSnapshot,
  customExerciseUsage,
  deleteCustomExercise,
  normalizeCustomExercisesState,
  normalizeExerciseAlias,
  registerCustomExerciseRecord,
  rememberExerciseAlias,
  removeExerciseAlias,
  resolveRememberedExercise,
  updateCustomExercise,
} from "./customExercises.js";

const state = () => ({ customExercises: [], exerciseAliases: [], program: null, activeWorkout: null, workouts: [] });
const input = (name = "Prime Incline Press") => ({
  name,
  equipment: ["machines"],
  primaryMuscle: "chest",
  secondaryMuscles: ["triceps", "shoulders"],
  pattern: "horizontal-push",
  loggingType: "weight_reps",
  notes: "Seat 4",
});

describe("custom exercise library", () => {
  it("creates a stable, normalized canonical exercise with sensible defaults", () => {
    const value = state();
    const result = createCustomExercise(value, { name: "  Prime   Incline Press  " }, "2026-09-05T10:00:00.000Z");
    expect(result.status).toBe("created");
    expect(result.exercise.id).toMatch(/^custom-exercise-/);
    expect(result.exercise).toMatchObject({
      name: "Prime Incline Press",
      equipment: ["machines"],
      primaryMuscle: "Full body",
      loggingType: "weight_reps",
      createdAt: "2026-09-05T10:00:00.000Z",
    });
  });

  it("edits metadata without changing the stable id", () => {
    const value = state();
    const created = createCustomExercise(value, input()).exercise;
    const result = updateCustomExercise(value, created.id, {
      name: "Prime Incline Chest Press",
      equipment: ["machines", "other"],
      primaryMuscle: "chest",
      secondaryMuscles: ["triceps"],
      pattern: "horizontal-push",
      loggingType: "weight_reps",
    }, "2026-09-06T10:00:00.000Z");
    expect(result.status).toBe("updated");
    expect(result.exercise.id).toBe(created.id);
    expect(result.exercise.name).toBe("Prime Incline Chest Press");
    expect(result.exercise.updatedAt).toBe("2026-09-06T10:00:00.000Z");
  });

  it("stores optional per-side logging without changing the default", () => {
    const value = state();
    const normal = createCustomExercise(value, input("Normal Press")).exercise;
    const unilateral = createCustomExercise(value, {
      ...input("Single Arm Press"),
      loggingMode: "per_side",
    }).exercise;
    expect(normal.loggingMode).toBe("normal");
    expect(unilateral.loggingMode).toBe("per_side");
    expect(customExerciseSnapshot(unilateral).loggingMode).toBe("per_side");
  });

  it("rejects active duplicate names after case and spacing normalization", () => {
    const value = state();
    createCustomExercise(value, input("Prime Incline Press"));
    expect(createCustomExercise(value, input(" prime   incline PRESS ")).status).toBe("duplicate");
  });

  it("soft deletes records and their aliases while preserving the snapshot used by history", () => {
    const value = state();
    const exercise = createCustomExercise(value, input()).exercise;
    const snapshot = customExerciseSnapshot(exercise);
    rememberExerciseAlias(value, "Prime Chest Machine", exercise.id, { builtInCatalog: exerciseCatalog });
    value.workouts = [{ exercises: [{ exerciseId: exercise.id, importedExercise: snapshot }] }];
    expect(deleteCustomExercise(value, exercise.id, "2026-09-07T10:00:00.000Z").status).toBe("deleted");
    expect(value.customExercises[0].deletedAt).toBeTruthy();
    expect(value.exerciseAliases[0].deletedAt).toBeTruthy();
    expect(availableCustomExerciseItems(value)).toEqual([]);
    expect(value.workouts[0].exercises[0].importedExercise.name).toBe("Prime Incline Press");
    expect(customExerciseUsage(value, exercise.id)).toBe(1);
  });

  it("maps a normalized alias to built-in and custom canonical exercises", () => {
    const value = state();
    const custom = createCustomExercise(value, input()).exercise;
    expect(rememberExerciseAlias(value, "  PRIME   incline machine ", custom.id, { builtInCatalog: exerciseCatalog }).status).toBe("created");
    expect(resolveRememberedExercise(value, "prime incline MACHINE", exerciseCatalog)).toMatchObject({ exerciseId: custom.id, status: "remembered-alias" });
    expect(rememberExerciseAlias(value, "My Flat Press", "barbell-bench-press", { builtInCatalog: exerciseCatalog }).status).toBe("created");
    expect(resolveRememberedExercise(value, "my flat press", exerciseCatalog).exerciseId).toBe("barbell-bench-press");
  });

  it("does not allow an alias to hijack a canonical or existing alias name", () => {
    const value = state();
    const first = createCustomExercise(value, input("First Machine")).exercise;
    const second = createCustomExercise(value, input("Second Machine")).exercise;
    expect(rememberExerciseAlias(value, exerciseCatalog["barbell-bench-press"].name, first.id, { builtInCatalog: exerciseCatalog }).status).toBe("conflict");
    expect(rememberExerciseAlias(value, "DB Bench Press", first.id, { builtInCatalog: exerciseCatalog }).status).toBe("conflict");
    expect(rememberExerciseAlias(value, "Gym Press", first.id, { builtInCatalog: exerciseCatalog }).status).toBe("created");
    expect(rememberExerciseAlias(value, " gym  press ", second.id, { builtInCatalog: exerciseCatalog }).status).toBe("conflict");
  });

  it("tombstones a removed alias without touching its canonical exercise", () => {
    const value = state();
    const exercise = createCustomExercise(value, input()).exercise;
    const alias = rememberExerciseAlias(value, "Prime Press", exercise.id, { builtInCatalog: exerciseCatalog }).alias;
    expect(removeExerciseAlias(value, alias.id).status).toBe("deleted");
    expect(resolveRememberedExercise(value, "Prime Press", exerciseCatalog)).toBeNull();
    expect(value.customExercises[0].deletedAt).toBeNull();
  });

  it("only exposes rich metadata to substitutions when the user supplied it", () => {
    const rich = customExerciseCatalogItem(createCustomExercise(state(), input()).exercise);
    expect(rich).toMatchObject({ pattern: "horizontal-push", muscles: ["Chest", "Arms", "Shoulders"], loadRequirement: "required" });
    const sparse = customExerciseCatalogItem(createCustomExercise(state(), { name: "Mystery Lever" }).exercise);
    expect(sparse.pattern).toBeNull();
    const ranked = rankSubstitutionCandidates({
      source: exerciseCatalog["machine-chest-press"],
      candidates: [rich, sparse],
      profile: { experience: "Intermediate" },
      strictIntent: true,
    });
    expect(ranked.map((item) => item.exercise.id)).toEqual([rich.id]);
  });

  it("participates in the normal exercise search without a special search path", () => {
    const item = customExerciseCatalogItem(createCustomExercise(state(), input("Prime Incline Press")).exercise);
    expect(exerciseMatchesQuery(item, "prime press")).toBe(true);
    expect(exerciseMatchesQuery(item, "pulldown")).toBe(false);
  });

  it("marks only compatible logging types as load-bearing for PR and e1RM consumers", () => {
    const weighted = customExerciseCatalogItem(createCustomExercise(state(), input()).exercise);
    const reps = customExerciseCatalogItem(createCustomExercise(state(), { ...input("Nordic Bench Rep"), loggingType: "reps", equipment: ["bodyweight"] }).exercise);
    const timed = customExerciseCatalogItem(createCustomExercise(state(), { ...input("Machine Hold"), loggingType: "duration" }).exercise);
    expect(weighted.loadRequirement).toBe("required");
    expect(reps.loadRequirement).toBe("none");
    expect(timed.measure).toBe("seconds");
  });

  it("normalizes restored records, deduplicates aliases, and preserves tombstones", () => {
    const value = {
      customExercises: [{ id: "custom-1", name: "  Long   Machine  ", muscles: ["chest"], deletedAt: "2026-09-01" }],
      exerciseAliases: [
        { id: "old", alias: "Prime  Press", exerciseId: "custom-1", updatedAt: "2026-09-01" },
        { id: "new", alias: " prime press ", exerciseId: "custom-1", updatedAt: "2026-09-02" },
      ],
    };
    normalizeCustomExercisesState(value, "2026-09-05");
    expect(value.customExercises[0]).toMatchObject({ name: "Long Machine", primaryMuscle: "Chest", deletedAt: "2026-09-01" });
    expect(value.exerciseAliases).toHaveLength(1);
    expect(value.exerciseAliases[0].id).toBe("new");
    expect(normalizeExerciseAlias(" Príme---Press ")).toBe("prime press");
  });

  it("registers deterministic imported records idempotently", () => {
    const value = state();
    const record = { id: "imported-custom-abc", ...input(), createdAt: "2026-09-01", updatedAt: "2026-09-01" };
    expect(registerCustomExerciseRecord(value, record).status).toBe("created");
    expect(registerCustomExerciseRecord(value, { ...record, notes: "Seat 5", updatedAt: "2026-09-02" }).status).toBe("updated");
    expect(value.customExercises).toHaveLength(1);
    expect(value.customExercises[0].notes).toBe("Seat 5");
  });

  it("survives a reload when used by a permanent non-imported plan", () => {
    const value = createReturningUserFixture(0);
    const custom = createCustomExercise(value, input()).exercise;
    const entry = value.program.days[0].exercises[0];
    entry.exerciseId = custom.id;
    entry.exerciseSource = "custom";
    entry.importedName = custom.name;
    entry.originalImportedName = custom.name;
    entry.importedExercise = customExerciseSnapshot(custom);
    const restored = deserializeState(serializeState(value));
    expect(restored.program.days[0].exercises[0].exerciseId).toBe(custom.id);
    expect(restored.customExercises[0].name).toBe(custom.name);
  });
});
