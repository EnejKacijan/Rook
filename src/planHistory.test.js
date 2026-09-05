import { describe, expect, it } from "vitest";
import { buildBackupArchive, parseBackupArchive } from "./backup.js";
import { blankState, buildProgram, deserializeState, startWorkout } from "./domain.js";
import {
  PLAN_HISTORY_RECENT_LIMIT,
  addPlanVersion,
  diffPlanPrograms,
  normalizePlanHistoryState,
  planRestoreImpact,
  programMeaningfullyChanged,
  restorePlanVersion,
} from "./planHistory.js";

function planState() {
  const state = blankState();
  Object.assign(state.profile, {
    onboardingComplete: true,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 3,
    availableDays: ["Mon", "Wed", "Fri"],
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Balanced"],
  });
  state.program = buildProgram(state.profile);
  normalizePlanHistoryState(state, "2026-08-30T10:00:00.000Z");
  return state;
}

function editFirstExercise(state) {
  const exercise = state.program.days[0].exercises[0];
  exercise.sets.push({ id: `added-${exercise.sets.length}`, weight: null, reps: 8, completed: false, rir: null });
  state.program.version += 1;
  return exercise;
}

describe("Plan Version History", () => {
  it("creates an initial version and a recoverable manual-edit version", () => {
    const state = planState();
    const before = structuredClone(state.program);
    editFirstExercise(state);
    addPlanVersion(state, { source: "Manual edit", previousProgram: before, timestamp: "2026-09-02T12:00:00Z", id: "manual-v2" });
    expect(state.planVersions.map((item) => item.source)).toEqual(["Initial plan", "Manual edit"]);
    expect(state.planVersions[1].parentVersionId).toBe(state.planVersions[0].id);
    expect(state.planVersions[1].program).toEqual(state.program);
    expect(diffPlanPrograms(before, state.program)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "sets" })]));
  });

  it("records Coach adaptations and imported plans with their explicit source", () => {
    const state = planState();
    let before = structuredClone(state.program);
    editFirstExercise(state);
    addPlanVersion(state, { source: "Coach", reason: "Coach adaptation", previousProgram: before, id: "coach-v2" });
    before = structuredClone(state.program);
    state.program = buildProgram({ ...state.profile, daysPerWeek: 2, availableDays: ["Tue", "Sat"] });
    state.program.source = "ai-import";
    addPlanVersion(state, { source: "Imported plan", previousProgram: before, id: "import-v3" });
    expect(state.planVersions.at(-2).source).toBe("Coach");
    expect(state.planVersions.at(-1)).toMatchObject({ source: "Imported plan", parentVersionId: "coach-v2" });
  });

  it("shows added, removed, and replaced exercises as readable structural changes", () => {
    const state = planState();
    const before = structuredClone(state.program);
    const exercises = state.program.days[0].exercises;
    exercises[0].exerciseId = exercises[1].exerciseId;
    exercises.splice(1, 1);
    exercises.push({
      ...structuredClone(before.days[1].exercises[0]),
      id: "history-added-entry",
    });
    expect(diffPlanPrograms(before, state.program)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "exercise-replaced" }),
      expect.objectContaining({ kind: "exercise-removed" }),
      expect.objectContaining({ kind: "exercise-added" }),
    ]));
  });

  it("ignores Adjust Today, Flexible Week, logging, active-workout changes and notes", () => {
    const state = planState();
    const before = structuredClone(state.program);
    state.todayAdaptation = { id: "today-only" };
    state.weekScheduleOverrides = { "2026-09-07": { [state.program.days[0].id]: "2026-09-09" } };
    state.activeWorkout = startWorkout(state, state.program.days[0]);
    state.activeWorkout.exercises[0].sets[0].weight = 92.5;
    state.program.days[0].exercises[0].personalNote = "Keep elbows tucked";
    expect(programMeaningfullyChanged(before, state.program)).toBe(false);
    expect(state.planVersions).toHaveLength(1);
  });

  it("restores a version as a new current version without rewriting completed or active workouts", () => {
    const state = planState();
    const originalId = state.planVersions[0].id;
    const original = structuredClone(state.program);
    const completed = { id: "completed-1", completedAt: 10, exercises: [] };
    state.workouts.push(completed);
    state.activeWorkout = startWorkout(state, state.program.days[0]);
    const active = structuredClone(state.activeWorkout);
    const beforeEdit = structuredClone(state.program);
    editFirstExercise(state);
    addPlanVersion(state, { source: "Manual edit", previousProgram: beforeEdit, id: "edited" });
    const beforeRestore = structuredClone(state.program);
    const result = restorePlanVersion(state, originalId, "2026-09-05T12:00:00Z");
    expect(result.status).toBe("restored");
    expect(state.program.days).toEqual(original.days);
    expect(state.workouts).toEqual([completed]);
    expect(state.activeWorkout).toEqual(active);
    addPlanVersion(state, { source: "Restored version", previousProgram: beforeRestore, id: "restored-v3" });
    expect(state.planVersions.at(-1)).toMatchObject({ id: "restored-v3", source: "Restored version", parentVersionId: "edited" });
  });

  it("reconciles Adjust Today and stale Flexible Week and occurrence references", () => {
    const state = planState();
    const targetId = state.planVersions[0].id;
    const validDay = state.program.days[0];
    state.todayAdaptation = { id: "adjustment", programDayId: "missing-day" };
    state.weekScheduleOverrides = { week: { [validDay.id]: "2026-09-08", missing: "2026-09-09" } };
    state.workoutOccurrenceOverrides = {
      "2026-09-08": {
        [validDay.id]: { excludedEntryIds: [validDay.exercises[0].id, "missing-entry"], orderedEntryIds: ["missing-entry"] },
        missing: { skipWorkout: true },
      },
    };
    const impact = planRestoreImpact(state, targetId);
    expect(impact).toMatchObject({ todayAdjustmentRemoved: true, flexibleWeekReferencesRemoved: 1, occurrenceReferencesRemoved: 1 });
    restorePlanVersion(state, targetId);
    expect(state.todayAdaptation).toBeNull();
    expect(state.weekScheduleOverrides.week).toEqual({ [validDay.id]: "2026-09-08" });
    expect(state.workoutOccurrenceOverrides["2026-09-08"][validDay.id]).toEqual({
      excludedEntryIds: [validDay.exercises[0].id],
      orderedEntryIds: [],
    });
  });

  it("fails safely for a missing version", () => {
    const state = planState();
    const before = structuredClone(state);
    expect(restorePlanVersion(state, "missing").status).toBe("missing");
    expect(state).toEqual(before);
  });

  it("keeps the initial snapshot plus the 40 most recent meaningful versions", () => {
    const state = planState();
    const initialId = state.planVersions[0].id;
    for (let index = 0; index < PLAN_HISTORY_RECENT_LIMIT + 8; index += 1) {
      const before = structuredClone(state.program);
      state.program.days[0].exercises[0].sets[0].reps = 5 + index;
      addPlanVersion(state, { source: "Manual edit", previousProgram: before, timestamp: Date.UTC(2026, 8, 1, 0, index), id: `version-${index}` });
    }
    expect(state.planVersions).toHaveLength(PLAN_HISTORY_RECENT_LIMIT + 1);
    expect(state.planVersions[0].id).toBe(initialId);
    expect(state.planVersions[1].parentVersionId).toBe(initialId);
    expect(state.planVersions.at(-1).id).toBe(`version-${PLAN_HISTORY_RECENT_LIMIT + 7}`);
  });

  it("round-trips many full plan versions through Backup & Restore", async () => {
    const state = planState();
    for (let index = 0; index < 18; index += 1) {
      const before = structuredClone(state.program);
      state.program.days[0].name = `Very Long Permanent Workout Version ${index + 1}`;
      addPlanVersion(state, { source: index % 2 ? "Coach" : "Manual edit", previousProgram: before, id: `backup-version-${index}` });
    }
    const archive = await buildBackupArchive(deserializeState(state), []);
    const restored = await parseBackupArchive(archive.bytes);
    expect(restored.state.planVersions).toHaveLength(state.planVersions.length);
    expect(restored.state.planVersions.at(-1).program.days[0].name).toBe("Very Long Permanent Workout Version 18");
  });
});
