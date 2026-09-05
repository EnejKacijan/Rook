import { describe, expect, it } from "vitest";
import { blankState, deserializeState, serializeState } from "./domain.js";
import {
  createGymProfile,
  defaultGymProfile,
  deleteGymProfile,
  effectiveGymProfile,
  normalizeGymProfilesState,
  setDefaultGymProfile,
  updateGymProfile,
} from "./gymProfiles.js";

function legacyState(equipment = ["dumbbells", "resistance bands"]) {
  const state = blankState();
  state.profile.id = "profile-existing-user";
  state.profile.onboardingComplete = true;
  state.profile.equipment = [...equipment];
  state.profile.environment = "Home gym";
  state.program = {
    id: "program-1",
    version: 4,
    days: [{ id: "day-1", exercises: [{ id: "entry-1", exerciseId: "dumbbell-bench-press" }] }],
  };
  return state;
}

describe("Gym Profiles", () => {
  it("migrates the first profile from existing equipment with a stable ID", () => {
    const state = legacyState();
    normalizeGymProfilesState(state, "2026-09-05T10:00:00.000Z");
    expect(state.gymProfiles).toEqual([
      expect.objectContaining({
        id: "gym-profile-existing-user",
        name: "Home",
        equipment: ["dumbbells", "resistance bands"],
      }),
    ]);
    expect(state.defaultGymProfileId).toBe("gym-profile-existing-user");

    state.program = null;
    const reloaded = deserializeState(JSON.parse(serializeState(state)));
    expect(reloaded.gymProfiles[0].id).toBe("gym-profile-existing-user");
    expect(reloaded.gymProfiles[0].equipment).toEqual(state.profile.equipment);
  });

  it("creates, renames, and edits a non-default gym without mutating the plan", () => {
    const state = legacyState(["full gym"]);
    normalizeGymProfilesState(state);
    const programBefore = structuredClone(state.program);
    const result = createGymProfile(state, {
      name: "  Work   Gym  ",
      equipment: ["dumbbells", "cables"],
    }, "2026-09-05T11:00:00.000Z");
    expect(result).toMatchObject({ status: "created", gym: { name: "Work Gym" } });
    expect(updateGymProfile(state, result.gym.id, {
      name: "Office Gym",
      equipment: ["machines", "bodyweight only"],
    }, "2026-09-05T12:00:00.000Z")).toMatchObject({ status: "updated" });
    expect(state.gymProfiles.find((gym) => gym.id === result.gym.id)).toMatchObject({
      name: "Office Gym",
      equipment: ["machines"],
      updatedAt: "2026-09-05T12:00:00.000Z",
    });
    expect(state.program).toEqual(programBefore);
  });

  it("sets exactly one default and keeps the legacy equipment alias in sync", () => {
    const state = legacyState(["full gym"]);
    normalizeGymProfilesState(state);
    const created = createGymProfile(state, {
      name: "Hotel",
      equipment: ["bodyweight only"],
    }).gym;
    expect(setDefaultGymProfile(state, created.id)).toMatchObject({ status: "updated" });
    expect(state.defaultGymProfileId).toBe(created.id);
    expect(defaultGymProfile(state)).toBe(created);
    expect(state.profile.equipment).toEqual(["bodyweight only"]);
    expect(state.profile.environment).toBe("Home gym");
  });

  it("preserves a limited commercial gym instead of reclassifying it as home", () => {
    const state = legacyState(["full gym"]);
    normalizeGymProfilesState(state);
    const result = updateGymProfile(state, state.defaultGymProfileId, {
      name: "Main Gym",
      environment: "Commercial gym",
      equipment: ["dumbbells", "machines"],
    });
    expect(result).toMatchObject({
      status: "updated",
      gym: {
        environment: "Commercial gym",
        equipment: ["dumbbells", "machines"],
      },
    });
    expect(state.profile.environment).toBe("Commercial gym");
    expect(effectiveGymProfile(state)).toMatchObject({
      environment: "Commercial gym",
      equipment: ["dumbbells", "machines"],
    });
  });

  it("deletes a non-default gym but requires an explicit replacement for the default", () => {
    const state = legacyState(["full gym"]);
    normalizeGymProfilesState(state);
    const home = createGymProfile(state, { name: "Home", equipment: ["dumbbells"] }).gym;
    const hotel = createGymProfile(state, { name: "Hotel", equipment: ["bodyweight only"] }).gym;
    expect(deleteGymProfile(state, hotel.id)).toMatchObject({ status: "deleted" });
    expect(deleteGymProfile(state, state.defaultGymProfileId)).toMatchObject({ status: "default-required" });
    expect(deleteGymProfile(state, state.defaultGymProfileId, home.id)).toMatchObject({ status: "deleted" });
    expect(state.defaultGymProfileId).toBe(home.id);
    expect(state.profile.equipment).toEqual(["dumbbells"]);
  });

  it("does not allow deleting the only gym", () => {
    const state = legacyState();
    normalizeGymProfilesState(state);
    expect(deleteGymProfile(state, state.defaultGymProfileId)).toMatchObject({
      status: "last-profile",
    });
    expect(state.gymProfiles).toHaveLength(1);
  });

  it("uses the active workout's today-only equipment instead of another saved gym", () => {
    const state = legacyState(["full gym"]);
    normalizeGymProfilesState(state);
    const home = createGymProfile(state, { name: "Home", equipment: ["dumbbells"] }).gym;
    state.activeWorkout = {
      adjustment: {
        gymProfileId: home.id,
        gymProfileName: home.name,
        temporaryEquipment: ["dumbbells"],
      },
    };
    expect(effectiveGymProfile(state).equipment).toEqual(["dumbbells"]);
    expect(state.defaultGymProfileId).not.toBe(home.id);
  });

  it("repairs dangling gym references deliberately while preserving their snapshot", () => {
    const state = legacyState(["full gym"]);
    normalizeGymProfilesState(state);
    state.todayAdaptation = {
      gymProfileId: "gym-deleted",
      gymProfileName: "Old Hotel",
      temporaryEquipment: ["bodyweight only"],
    };
    state.workouts = [{ id: "workout-1", adjustment: structuredClone(state.todayAdaptation) }];
    normalizeGymProfilesState(state);
    expect(state.todayAdaptation).toMatchObject({
      gymProfileId: null,
      gymProfileMissing: true,
      gymProfileName: "Old Hotel",
      temporaryEquipment: ["bodyweight only"],
    });
    expect(state.workouts[0].adjustment.gymProfileMissing).toBe(true);
    expect(effectiveGymProfile(state, null).equipment).toEqual(["bodyweight only"]);
  });
});
