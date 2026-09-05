import { describe, expect, it } from "vitest";
import { buildBackupArchive, parseBackupArchive } from "./backup.js";
import {
  applyWeekScheduleChanges,
  blankState,
  buildProgram,
  completeWorkout,
  currentWeekSchedule,
  deserializeState,
  isoDay,
  serializeState,
  startWorkout,
} from "./domain.js";
import {
  addPlanVersion,
  diffPlanPrograms,
  normalizePlanHistoryState,
  programMeaningfullyChanged,
  restorePlanVersion,
} from "./planHistory.js";
import {
  createFollowUpTrainingBlock,
  createTrainingBlock,
  normalizeTrainingBlocksState,
  prescribeTrainingBlockWorkout,
  reconfigureTrainingBlock,
} from "./trainingBlocks.js";

function stateWithBlock() {
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
  state.selectedDate = "2026-09-07";
  normalizeTrainingBlocksState(state);
  normalizePlanHistoryState(state, "2026-09-01T08:00:00Z");
  return state;
}

function finishTemplate(state, template) {
  state.activeWorkout = startWorkout(state, template);
  state.activeWorkout.exercises.forEach((exercise) =>
    exercise.sets.forEach((set) => { set.completed = true; }),
  );
  return completeWorkout(state);
}

describe("Training Blocks", () => {
  it("adds a sensible six-week generated block with an explicit deload", () => {
    const state = stateWithBlock();
    const block = state.program.trainingBlock;
    expect(block).toMatchObject({ totalWeeks: 6, currentWeek: 1, plannedDeloadWeek: 6, completed: false });
    expect(block.weeks).toHaveLength(6);
    expect(block.weeks[5]).toMatchObject({ phase: "deload", rirDelta: 2, setMultiplier: 0.6 });
    expect(new Set(block.weeks.flatMap((week) => week.workouts.map((workout) => workout.id))).size).toBe(18);
  });

  it("supports a four-week block without a deload", () => {
    const state = stateWithBlock();
    state.program.trainingBlock = reconfigureTrainingBlock(state.program, {
      name: "Four-week strength block",
      totalWeeks: 4,
      includeDeload: false,
    });
    expect(state.program.trainingBlock).toMatchObject({ name: "Four-week strength block", totalWeeks: 4, plannedDeloadWeek: null });
    expect(state.program.trainingBlock.weeks.every((week) => week.phase !== "deload")).toBe(true);
  });

  it("preserves explicit imported week targets during normalization", () => {
    const state = stateWithBlock();
    state.program.trainingBlock.weeks[1] = {
      ...state.program.trainingBlock.weeks[1],
      label: "Technique progression",
      reason: "Imported coach-authored target.",
      repOffset: 0,
      rirDelta: 1,
      mainSetDelta: 0,
      changes: [{ variable: "RIR", reason: "Imported reason" }],
    };
    normalizeTrainingBlocksState(state);
    expect(state.program.trainingBlock.weeks[1]).toMatchObject({
      label: "Technique progression",
      repOffset: 0,
      rirDelta: 1,
      changes: [{ variable: "RIR", reason: "Imported reason" }],
    });
  });

  it("applies one intentional target step at a time and never forces a weight jump", () => {
    const state = stateWithBlock();
    const base = state.program.days[0];
    const baseMain = base.exercises.find((exercise) => exercise.programmingRole === "main") || base.exercises[0];
    state.program.trainingBlock.currentWeek = 2;
    const repetitions = prescribeTrainingBlockWorkout(state, base);
    const weekTwoMain = repetitions.exercises.find((exercise) => exercise.id === baseMain.id);
    expect(weekTwoMain.repMin).toBe(baseMain.repMin + 1);
    expect(weekTwoMain.targetRir).toBe(baseMain.targetRir);
    expect(weekTwoMain.sets).toHaveLength(baseMain.sets.length);
    expect(weekTwoMain.sets.every((set) => set.weight === null)).toBe(true);
    state.program.trainingBlock.currentWeek = 3;
    const effort = prescribeTrainingBlockWorkout(state, base).exercises.find((exercise) => exercise.id === baseMain.id);
    expect(effort.targetRir).toBe(Math.max(0, baseMain.targetRir - 1));
    expect(effort.sets).toHaveLength(baseMain.sets.length);
    state.program.trainingBlock.currentWeek = 4;
    const volume = prescribeTrainingBlockWorkout(state, base).exercises.find((exercise) => exercise.id === baseMain.id);
    expect(volume.sets).toHaveLength(baseMain.sets.length + 1);
  });

  it("reduces sets and increases RIR during the planned deload", () => {
    const state = stateWithBlock();
    state.program.trainingBlock.currentWeek = 6;
    const base = state.program.days[0];
    const deload = prescribeTrainingBlockWorkout(state, base);
    expect(deload.trainingBlock).toMatchObject({ plannedDeload: true, blockWeekNumber: 6 });
    expect(deload.exercises[0].sets.length).toBe(Math.max(1, Math.round(base.exercises[0].sets.length * 0.6)));
    expect(deload.exercises[0].targetRir).toBe(Math.min(4, base.exercises[0].targetRir + 2));
  });

  it("keeps Flexible Week placement separate from stable block-workout identity", () => {
    const state = stateWithBlock();
    const schedule = currentWeekSchedule(state, new Date("2026-09-07T12:00:00"));
    const source = schedule[0];
    const openDate = ["2026-09-08", "2026-09-10", "2026-09-12", "2026-09-13"]
      .find((date) => !schedule.some((item) => item.scheduledDate === date));
    const identity = source.workout.trainingBlock.blockWorkoutId;
    applyWeekScheduleChanges(state, [{ workoutId: source.workoutId, fromDate: source.scheduledDate, toDate: openDate }], new Date("2026-09-07T12:00:00"));
    const moved = currentWeekSchedule(state, new Date("2026-09-07T12:00:00")).find((item) => item.workoutId === source.workoutId);
    expect(moved.scheduledDate).toBe(openDate);
    expect(moved.workout.trainingBlock.blockWorkoutId).toBe(identity);
    expect(moved.workout.trainingBlock.blockWeekNumber).toBe(1);
  });

  it("advances only after every block-week workout and does not advance on a calendar boundary", () => {
    let state = stateWithBlock();
    const block = state.program.trainingBlock;
    const templates = state.program.days.map((day) => prescribeTrainingBlockWorkout(state, day));
    state = finishTemplate(state, templates[0]);
    expect(state.program.trainingBlock.currentWeek).toBe(1);
    state.selectedDate = "2026-09-14";
    const carried = startWorkout(state, templates[1]);
    expect(carried.trainingBlock).toMatchObject({ blockWeekNumber: 1, blockWeekId: block.weeks[0].id });
    state.activeWorkout = carried;
    carried.exercises.forEach((exercise) => exercise.sets.forEach((set) => { set.completed = true; }));
    state = completeWorkout(state);
    expect(state.program.trainingBlock.currentWeek).toBe(1);
    state = finishTemplate(state, templates[2]);
    expect(state.program.trainingBlock.currentWeek).toBe(2);
  });

  it("treats Adjust Today and current-week progress as temporary while block edits create Plan History diffs", () => {
    const state = stateWithBlock();
    const before = structuredClone(state.program);
    state.program.trainingBlock.currentWeek = 2;
    expect(programMeaningfullyChanged(before, state.program)).toBe(false);
    const today = prescribeTrainingBlockWorkout(state, state.program.days[0]);
    today.exercises.pop();
    expect(state.program.days[0].exercises.length).toBeGreaterThan(today.exercises.length);
    const editBefore = structuredClone(state.program);
    state.program.trainingBlock = reconfigureTrainingBlock(state.program, { totalWeeks: 4, includeDeload: false });
    expect(programMeaningfullyChanged(editBefore, state.program)).toBe(true);
    expect(diffPlanPrograms(editBefore, state.program)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "training-block", title: "Block length changed" }),
      expect.objectContaining({ kind: "training-block", title: "Deload changed" }),
    ]));
  });

  it("restores block definitions with Plan History while preserving completed block records", () => {
    const state = stateWithBlock();
    const originalVersionId = state.planVersions[0].id;
    state.completedTrainingBlocks.push({ ...structuredClone(state.program.trainingBlock), completed: true, completedAt: "2026-08-31T10:00:00Z" });
    const before = structuredClone(state.program);
    state.program.trainingBlock = reconfigureTrainingBlock(state.program, { totalWeeks: 4, includeDeload: false });
    addPlanVersion(state, { source: "Manual edit", previousProgram: before, id: "block-edit" });
    restorePlanVersion(state, originalVersionId);
    normalizeTrainingBlocksState(state);
    expect(state.program.trainingBlock.totalWeeks).toBe(6);
    expect(state.completedTrainingBlocks).toHaveLength(1);
  });

  it("persists current/completed blocks through reload and Backup & Restore", async () => {
    const state = stateWithBlock();
    state.program.trainingBlock.currentWeek = 5;
    state.completedTrainingBlocks.push(createTrainingBlock(state.program, { id: "completed-block", completed: true, completedAt: "2026-08-31T10:00:00Z" }));
    const reloaded = deserializeState(serializeState(state));
    expect(reloaded.program.trainingBlock.currentWeek).toBe(5);
    expect(reloaded.completedTrainingBlocks[0].id).toBe("completed-block");
    const archive = await buildBackupArchive(reloaded, []);
    const restored = await parseBackupArchive(archive.bytes);
    expect(restored.state.program.trainingBlock.currentWeek).toBe(5);
    expect(restored.state.completedTrainingBlocks[0].weeks).toHaveLength(6);
  });

  it("creates a new stable identity only after the completed block is reviewed", () => {
    const state = stateWithBlock();
    const current = state.program.trainingBlock;
    current.completed = true;
    const next = createFollowUpTrainingBlock(state.program, { repeat: false, startDate: "2026-10-01" });
    const repeated = createFollowUpTrainingBlock(state.program, { repeat: true, startDate: "2026-10-01" });
    expect(next.id).not.toBe(current.id);
    expect(repeated.id).not.toBe(current.id);
    expect(repeated.name).toBe(current.name);
    expect(next.startDate).toBe("2026-10-01");
  });
});
