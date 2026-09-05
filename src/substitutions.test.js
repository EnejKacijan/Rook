import { describe, expect, it } from "vitest";
import {
  blankState,
  compatibleReplacementCandidates,
  deserializeState,
  exerciseCatalog,
  serializeState,
  userSelectableReplacementCandidates,
} from "./domain.js";
import { normalizeGymProfilesState } from "./gymProfiles.js";
import {
  normalizeSubstitutionPreferencesState,
  recordSubstitutionPreference,
} from "./substitutions.js";

function profile(equipment = ["full gym"]) {
  return {
    ...blankState().profile,
    equipment,
    environment: equipment.includes("full gym") ? "Commercial gym" : "Home gym",
    experience: "Intermediate",
    goal: "Build muscle",
    avoid: "",
    ignoreTrainingSafety: true,
  };
}

function stateWithGyms() {
  const state = blankState();
  state.profile = { ...profile(), id: "preference-user", onboardingComplete: true };
  state.gymProfiles = [
    { id: "gym-main", name: "Main Gym", equipment: ["full gym"] },
    { id: "gym-work", name: "Work Gym", equipment: ["full gym"] },
  ];
  state.defaultGymProfileId = "gym-main";
  normalizeGymProfilesState(state, "2026-09-05T10:00:00.000Z");
  return state;
}

describe("smart exercise substitutions", () => {
  it("prefers the dumbbell equivalent when barbell equipment is unavailable", () => {
    const choices = compatibleReplacementCandidates(
      { ...exerciseCatalog["barbell-bench-press"], exerciseId: "barbell-bench-press", repMin: 5, repMax: 8 },
      profile(["barbell/rack/bench", "dumbbells"]),
    );
    expect(choices[0].id).toBe("dumbbell-bench-press");
  });

  it("does not recommend cable or machine exercises when that equipment is unavailable", () => {
    const home = profile(["barbell/rack/bench", "dumbbells"]);
    const cableChoices = compatibleReplacementCandidates("cable-fly", home);
    const machineChoices = compatibleReplacementCandidates("machine-chest-press", home);
    expect(cableChoices[0].id).toBe("dumbbell-fly");
    expect(cableChoices.some((item) => item.equipment.includes("cables"))).toBe(false);
    expect(machineChoices.some((item) => item.equipment.includes("machines"))).toBe(false);
  });

  it("returns several intent-safe matches in a full gym", () => {
    const choices = compatibleReplacementCandidates("barbell-bench-press", profile());
    expect(choices.length).toBeGreaterThan(1);
    expect(choices.every((item) => item.pattern === "horizontal-push")).toBe(true);
    expect(choices.every((item) => item.muscles.includes("Chest"))).toBe(true);
  });

  it("returns no automatic match when custom exercise metadata is incomplete", () => {
    const custom = {
      exerciseId: "custom-press",
      importedExercise: { id: "custom-press", name: "My Press", pattern: null, muscles: null, equipment: null },
    };
    expect(compatibleReplacementCandidates(custom, profile())).toEqual([]);
    expect(userSelectableReplacementCandidates(custom, profile()).length).toBeGreaterThan(20);
  });

  it("ranks an explicit global preference first without weakening equipment filtering", () => {
    const state = stateWithGyms();
    recordSubstitutionPreference(state, {
      sourceExerciseId: "barbell-bench-press",
      replacementExerciseId: "machine-chest-press",
    });
    const fullGym = compatibleReplacementCandidates("barbell-bench-press", profile(), [], {
      preferences: state.substitutionPreferences,
    });
    expect(fullGym[0].id).toBe("machine-chest-press");
    const home = compatibleReplacementCandidates(
      "barbell-bench-press",
      profile(["barbell/rack/bench", "dumbbells"]),
      [],
      { preferences: state.substitutionPreferences },
    );
    expect(home.some((item) => item.id === "machine-chest-press")).toBe(false);
  });

  it("gives a matching gym-scoped preference priority over a global one", () => {
    const state = stateWithGyms();
    recordSubstitutionPreference(state, {
      sourceExerciseId: "barbell-bench-press",
      replacementExerciseId: "dumbbell-bench-press",
    }, "2026-09-05T11:00:00.000Z");
    recordSubstitutionPreference(state, {
      sourceExerciseId: "barbell-bench-press",
      replacementExerciseId: "machine-chest-press",
      gymProfileId: "gym-main",
    }, "2026-09-05T12:00:00.000Z");
    const options = { preferences: state.substitutionPreferences };
    expect(compatibleReplacementCandidates("barbell-bench-press", profile(), [], {
      ...options,
      gymProfileId: "gym-main",
    })[0].id).toBe("machine-chest-press");
    expect(compatibleReplacementCandidates("barbell-bench-press", profile(), [], {
      ...options,
      gymProfileId: "gym-work",
    })[0].id).toBe("dumbbell-bench-press");
  });

  it("deduplicates preferences by source and gym and removes dangling gym scopes", () => {
    const state = stateWithGyms();
    recordSubstitutionPreference(state, {
      sourceExerciseId: "cable-fly",
      replacementExerciseId: "dumbbell-fly",
      gymProfileId: "gym-main",
    }, "2026-09-05T11:00:00.000Z");
    recordSubstitutionPreference(state, {
      sourceExerciseId: "cable-fly",
      replacementExerciseId: "pec-deck",
      gymProfileId: "gym-main",
    }, "2026-09-05T12:00:00.000Z");
    expect(state.substitutionPreferences).toHaveLength(1);
    expect(state.substitutionPreferences[0].replacementExerciseId).toBe("pec-deck");
    state.gymProfiles = state.gymProfiles.filter((gym) => gym.id !== "gym-main");
    state.defaultGymProfileId = "gym-work";
    normalizeSubstitutionPreferencesState(state);
    expect(state.substitutionPreferences).toEqual([]);
  });

  it("preserves stable preferences through reload serialization", () => {
    const state = stateWithGyms();
    state.program = null;
    recordSubstitutionPreference(state, {
      sourceExerciseId: "barbell-bench-press",
      replacementExerciseId: "dumbbell-bench-press",
      gymProfileId: "gym-main",
    }, "2026-09-05T12:00:00.000Z");
    const restored = deserializeState(serializeState(state));
    expect(restored.substitutionPreferences).toEqual(state.substitutionPreferences);
  });

  it("does not mutate superset structure while ranking its member", () => {
    const source = {
      ...exerciseCatalog["barbell-bench-press"],
      exerciseId: "barbell-bench-press",
      supersetId: "pair-1",
      sets: [{ id: "set-1" }, { id: "set-2" }],
    };
    const before = structuredClone(source);
    expect(compatibleReplacementCandidates(source, profile()).length).toBeGreaterThan(0);
    expect(source).toEqual(before);
  });
});
