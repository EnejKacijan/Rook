import { describe, expect, it } from "vitest";
import { AIService } from "./aiService.js";
import {
  blankState,
  buildProgram,
  materializeWarmupPlan,
  startWorkout,
  warmupForWorkout,
} from "./domain.js";

describe("editable and imported warm-ups", () => {
  it("treats a missing warm-up mode as the existing automatic behavior", () => {
    const state = blankState();
    state.profile.daysPerWeek = 3;
    state.profile.availableDays = ["Mon", "Wed", "Fri"];
    state.program = buildProgram(state.profile);
    const workout = state.program.days[0];
    expect(warmupForWorkout(workout, state.profile, state.program)).toEqual(
      expect.objectContaining({ generatorVersion: 3 }),
    );
  });

  it("materializes automatic content and snapshots custom mode at workout start", () => {
    const state = blankState();
    state.profile.daysPerWeek = 3;
    state.profile.availableDays = ["Mon", "Wed", "Fri"];
    state.program = buildProgram(state.profile);
    const workout = state.program.days[0];
    workout.warmupPlan = materializeWarmupPlan(
      workout,
      state.profile,
      state.program,
    );
    workout.warmupPlan.items[0].label = "My easy preparation";
    const active = startWorkout(state, workout);
    expect(active.warmupPlan.mode).toBe("custom");
    expect(active.warmup.general[0].label).toContain("My easy preparation");
    workout.warmupPlan.items[0].label = "Changed later";
    expect(active.warmup.general[0].label).not.toContain("Changed later");
  });

  it("honors an explicit no-warm-up mode", () => {
    const state = blankState();
    state.profile.daysPerWeek = 3;
    state.profile.availableDays = ["Mon", "Wed", "Fri"];
    state.program = buildProgram(state.profile);
    const workout = state.program.days[0];
    workout.warmupPlan = { mode: "none" };
    expect(startWorkout(state, workout).warmup).toBeNull();
  });

  it("imports only explicitly headed warm-up content and avoids duplicates", async () => {
    const source = `Monday: Upper\nWarm-up\nEasy bike 5 min\nBand Pull Apart 2x15\nWorkout\nBench Press 3x8\nWednesday: Pull\nBand Pull Apart 3x12\nLow Row 3x10`;
    const result = await AIService.importTrainingPlan(blankState().profile, source);
    const monday = result.program.days[0];
    const wednesday = result.program.days[1];
    expect(monday.warmupPlan).toEqual(
      expect.objectContaining({ mode: "custom", provenance: "imported" }),
    );
    expect(monday.warmupPlan.items.map((item) => item.label)).toEqual([
      "Easy bike",
      "Band Pull Apart",
    ]);
    expect(monday.exercises.map((item) => item.importedName)).toEqual([
      "Bench Press",
    ]);
    expect(wednesday.warmupPlan).toBeUndefined();
    expect(wednesday.exercises.map((item) => item.importedName)).toContain(
      "Band Pull Apart",
    );
  });
});
