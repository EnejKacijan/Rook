import { describe, expect, it } from "vitest";
import {
  blankState,
  buildProgram,
  exerciseCatalog,
  hypertrophyVolumeTargets,
  validateProgram,
  weeklyDirectVolume,
} from "./domain.js";

const baseProfile = () => ({
  ...blankState().profile,
  goal: "Build muscle",
  experience: "Intermediate",
  availableDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  sessionMinutes: 60,
  environment: "Commercial gym",
  equipment: ["full gym"],
  exercisePreference: "No preference",
  effortStyle: "Balanced workload · usually 3 sets · 1–2 RIR",
  avoid: "",
  onboardingComplete: true,
});

const profileWithPriority = (daysPerWeek, priority = null) => ({
  ...baseProfile(),
  daysPerWeek,
  priorities: priority ? [priority] : ["Balanced"],
  prioritySources: {
    manual: priority ? [priority] : [],
    physiqueConfirmed: [],
  },
});

const shoulderPatterns = new Set([
  "vertical-push",
  "shoulder-isolation",
  "rear-delt",
]);
const directlyTrainsShoulders = (exercise) =>
  shoulderPatterns.has(exerciseCatalog[exercise.exerciseId]?.pattern);

describe("manual training-priority semantics", () => {
  it.each([2, 3, 4, 5, 6])(
    "makes Shoulders materially visible in a valid %i-day plan",
    (daysPerWeek) => {
      const neutralProfile = profileWithPriority(daysPerWeek);
      const priorityProfile = profileWithPriority(daysPerWeek, "Shoulders");
      const neutral = buildProgram(neutralProfile);
      const prioritized = buildProgram(priorityProfile);
      const bonus = daysPerWeek >= 5 ? 3 : 2;

      expect(weeklyDirectVolume(prioritized).Shoulders).toBeGreaterThanOrEqual(
        weeklyDirectVolume(neutral).Shoulders + bonus,
      );
      const directDays = prioritized.days.filter((day) =>
        day.exercises.some(directlyTrainsShoulders),
      );
      expect(directDays.length).toBeGreaterThanOrEqual(daysPerWeek >= 5 ? 3 : 2);
      expect(prioritized.days[0].exercises.some(directlyTrainsShoulders)).toBe(
        true,
      );

      const firstDay = prioritized.days[0];
      const priorityIndex = firstDay.exercises.findIndex(
        directlyTrainsShoulders,
      );
      const leadingProtectedWork = firstDay.exercises.findIndex(
        (exercise) => !["main", "power"].includes(exercise.programmingRole),
      );
      expect(priorityIndex).toBe(
        leadingProtectedWork < 0 ? 0 : leadingProtectedWork,
      );
      expect(
        prioritized.days.every(
          (day) => day.estimatedMinutes <= priorityProfile.sessionMinutes,
        ),
      ).toBe(true);
      expect(
        validateProgram(prioritized, priorityProfile, {
          requireProgramQuality: true,
        }).valid,
      ).toBe(true);
      expect(prioritized.priorityConstrained?.Shoulders).toBeUndefined();
    },
  );

  it.each([
    ["Chest", (volume) => volume.Chest],
    ["Back", (volume) => volume.Back],
    ["Shoulders", (volume) => volume.Shoulders],
    ["Arms", (volume) => volume.Biceps + volume.Triceps],
    ["Quads", (volume) => volume.Quads],
    ["Hamstrings / glutes", (volume) => volume.Hamstrings + volume.Glutes],
    ["Calves", (volume) => volume.Calves],
    ["Core", (volume) => volume.Core],
  ])("gives the broad %s priority a bounded 4-day bonus", (priority, volumeFor) => {
    const neutral = buildProgram(profileWithPriority(4));
    const prioritized = buildProgram(profileWithPriority(4, priority));
    expect(volumeFor(weeklyDirectVolume(prioritized))).toBeGreaterThanOrEqual(
      volumeFor(weeklyDirectVolume(neutral)) + 2,
    );
    expect(Math.max(...prioritized.days.map((day) => day.estimatedMinutes))).toBeLessThanOrEqual(60);
  });

  it("allocates broad Shoulders as one group instead of three target bonuses", () => {
    const neutral = hypertrophyVolumeTargets(profileWithPriority(4));
    const shoulders = hypertrophyVolumeTargets(
      profileWithPriority(4, "Shoulders"),
    );
    for (const muscle of ["AnteriorDelts", "LateralDelts", "RearDelts"])
      expect(shoulders[muscle].target).toBe(neutral[muscle].target);
  });
});
