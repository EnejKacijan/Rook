import { describe, expect, it } from "vitest";
import {
  adaptTodayProposal,
  blankState,
  buildProgram,
  coachContext,
  deserializeState,
  exerciseCatalog,
  isoDay,
  serializeState,
  weeklyDirectVolume,
  weekday,
} from "./domain.js";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function profile({
  daysPerWeek = 4,
  sessionMinutes = 60,
  priorities = ["Balanced"],
  home = false,
} = {}) {
  return {
    ...blankState().profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek,
    availableDays: WEEK.slice(0, daysPerWeek),
    sessionMinutes,
    environment: home ? "Home gym" : "Commercial gym",
    equipment: home
      ? ["dumbbells", "bodyweight only"]
      : ["full gym"],
    priorities,
    prioritySources: {
      manual: priorities,
      physiqueSuggested: [],
      physiqueConfirmed: [],
    },
    onboardingComplete: true,
  };
}

const coreRows = (program) =>
  program.days.flatMap((day) =>
    day.exercises
      .filter(
        (exercise) => exerciseCatalog[exercise.exerciseId]?.pattern === "core",
      )
      .map((exercise) => ({ day, exercise })),
  );

describe("Abs / core training priority", () => {
  it.each([2, 3, 4, 5, 6])(
    "adds distributed, progression-ready direct work in a %i-day plan",
    (daysPerWeek) => {
      const balanced = buildProgram(profile({ daysPerWeek }));
      const prioritized = buildProgram(
        profile({ daysPerWeek, priorities: ["Abs / core"] }),
      );
      const balancedCore = weeklyDirectVolume(balanced).Core;
      const rows = coreRows(prioritized);
      const exposures = new Set(rows.map(({ day }) => day.weekday));

      expect(weeklyDirectVolume(prioritized).Core).toBeGreaterThanOrEqual(
        balancedCore + 2,
      );
      expect(exposures.size).toBeGreaterThanOrEqual(
        daysPerWeek === 2 ? 2 : 3,
      );
      expect(new Set(rows.map(({ exercise }) => exercise.exerciseId)).size).toBe(
        1,
      );
      expect(prioritized.name).not.toMatch(/\b(?:abs|core)\b/i);
      expect(
        Math.max(...prioritized.days.map((day) => day.estimatedMinutes)),
      ).toBeLessThanOrEqual(60);
    },
  );

  it.each([30, 45, 60, 90])(
    "keeps all frequency variants sane at %i minutes",
    (sessionMinutes) => {
      for (const daysPerWeek of [2, 3, 4, 5, 6]) {
        const balanced = buildProgram(profile({ daysPerWeek, sessionMinutes }));
        const prioritized = buildProgram(
          profile({
            daysPerWeek,
            sessionMinutes,
            priorities: ["Abs / core"],
          }),
        );
        const balancedCore = weeklyDirectVolume(balanced).Core;
        const prioritizedCore = weeklyDirectVolume(prioritized).Core;
        expect(
          prioritizedCore > balancedCore ||
            Boolean(prioritized.priorityConstrained?.["Abs / core"]),
        ).toBe(true);
        expect(
          Math.max(...prioritized.days.map((day) => day.estimatedMinutes)),
        ).toBeLessThanOrEqual(sessionMinutes + 5);
        expect(prioritized.days).toHaveLength(daysPerWeek);
        expect(prioritized.name).not.toMatch(/\b(?:abs|core)\b/i);
      }
    },
  );

  it.each([
    ["Chest", (volume) => volume.Chest],
    ["Back", (volume) => volume.Back],
    ["Quads", (volume) => volume.Quads],
    ["Hamstrings / glutes", (volume) => volume.Hamstrings + volume.Glutes],
  ])("keeps both %s and Abs / core meaningful", (priority, priorityVolume) => {
    const balanced = buildProgram(profile());
    const combined = buildProgram(
      profile({ priorities: [priority, "Abs / core"] }),
    );
    expect(priorityVolume(weeklyDirectVolume(combined))).toBeGreaterThanOrEqual(
      priorityVolume(weeklyDirectVolume(balanced)) + 2,
    );
    expect(weeklyDirectVolume(combined).Core).toBeGreaterThanOrEqual(
      weeklyDirectVolume(balanced).Core + 2,
    );
    expect(Math.max(...combined.days.map((day) => day.estimatedMinutes))).toBeLessThanOrEqual(60);
  });

  it("uses a small stable bodyweight selection without unavailable equipment", () => {
    const generated = buildProgram(
      profile({ daysPerWeek: 5, home: true, priorities: ["Abs / core"] }),
    );
    const rows = coreRows(generated);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(new Set(rows.map(({ exercise }) => exercise.exerciseId)).size).toBeLessThanOrEqual(2);
    for (const { exercise } of rows)
      expect(exerciseCatalog[exercise.exerciseId].equipment).not.toContain(
        "cables",
      );
  });

  it("protects selected direct core work when Less Time trims a workout", () => {
    const state = blankState();
    state.profile = profile({ priorities: ["Abs / core"] });
    state.program = buildProgram(state.profile);
    const coreDay = state.program.days.find((day) => coreRows({ days: [day] }).length);
    coreDay.weekday = weekday();
    state.program.days = [coreDay];
    state.selectedDay = weekday();
    state.selectedDate = isoDay();
    const proposal = adaptTodayProposal(state, 35, new Date());
    const kept = new Set(proposal.setTargets.map((item) => item.exerciseId));
    expect(
      coreDay.exercises.some(
        (exercise) =>
          exerciseCatalog[exercise.exerciseId].pattern === "core" &&
          kept.has(exercise.exerciseId),
      ),
    ).toBe(true);
  });

  it("normalizes contradictory saved state and round-trips the new priority", () => {
    const state = blankState();
    state.profile.priorities = ["Balanced", "Abs / core"];
    state.profile.prioritySources.manual = ["Balanced", "Abs / core"];
    const restored = deserializeState(serializeState(state));
    expect(restored.profile.prioritySources.manual).toEqual(["Abs / core"]);
    expect(restored.profile.priorities).toEqual(["Abs / core"]);
    expect(coachContext(restored).profile.priorities).toEqual(["Abs / core"]);

    const existing = blankState();
    existing.profile.priorities = ["Chest"];
    existing.profile.prioritySources.manual = ["Chest"];
    expect(
      deserializeState(serializeState(existing)).profile.priorities,
    ).toEqual(["Chest"]);
  });
});
