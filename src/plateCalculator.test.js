import { describe, expect, it } from "vitest";
import { blankState, deserializeState, serializeState } from "./domain.js";
import { buildBackupArchive, parseBackupArchive } from "./backup.js";
import {
  createGymProfile,
  normalizeGymProfilesState,
  setDefaultGymProfile,
} from "./gymProfiles.js";
import {
  calculatePlateLoad,
  defaultPlateSetup,
  kgToPlateUnit,
  normalizePlateSetup,
  plateLoadingRelation,
  plateUnitToKg,
  selectedPlateBar,
} from "./plateCalculator.js";

describe("plate calculator", () => {
  it("loads a common 80 kg target on a 20 kg bar", () => {
    const setup = defaultPlateSetup("kg");
    const result = calculatePlateLoad({
      target: 80,
      barWeight: selectedPlateBar(setup).weight,
      plates: setup.plates,
    });
    expect(result.status).toBe("exact");
    expect(result.exact.perSide).toBe(30);
    expect(result.exact.plates).toEqual([
      { size: 20, count: 1 },
      { size: 10, count: 1 },
    ]);
  });

  it("supports a 15 kg bar", () => {
    const result = calculatePlateLoad({
      target: 65,
      barWeight: 15,
      plates: defaultPlateSetup("kg").plates,
    });
    expect(result.exact).toMatchObject({ total: 65, perSide: 25 });
  });

  it("supports a 45 lb bar and lb plates", () => {
    const setup = defaultPlateSetup("lb");
    const result = calculatePlateLoad({
      target: 135,
      barWeight: 45,
      plates: setup.plates,
    });
    expect(result.exact.plates).toEqual([{ size: 45, count: 1 }]);
  });

  it("returns nearest loads above and below when exact is impossible", () => {
    const result = calculatePlateLoad({
      target: 82.5,
      barWeight: 20,
      plates: [
        { size: 20, pairs: 2 },
        { size: 10, pairs: 2 },
        { size: 2.5, pairs: 2 },
      ],
    });
    expect(result.status).toBe("nearest");
    expect(result.lower.total).toBe(80);
    expect(result.upper.total).toBe(85);
  });

  it("respects limited plate inventory", () => {
    const result = calculatePlateLoad({
      target: 100,
      barWeight: 20,
      plates: [{ size: 20, pairs: 1 }],
    });
    expect(result.exact).toBeNull();
    expect(result.lower.total).toBe(60);
    expect(result.upper).toBeNull();
  });

  it("merges duplicate plate sizes and pair counts", () => {
    const setup = normalizePlateSetup({
      unit: "kg",
      bars: [{ id: "bar", name: "Bar", weight: 20 }],
      selectedBarId: "bar",
      plates: [
        { size: 20, pairs: 1 },
        { size: 20, pairs: 2 },
        { size: 5, pairs: 1 },
      ],
    });
    expect(setup.plates).toEqual([
      { size: 20, pairs: 3 },
      { size: 5, pairs: 1 },
    ]);
  });

  it("handles a target lighter than the selected bar", () => {
    const result = calculatePlateLoad({
      target: 15,
      barWeight: 20,
      plates: [{ size: 1.25, pairs: 1 }],
    });
    expect(result.status).toBe("below-bar");
    expect(result.lower).toBeNull();
    expect(result.upper.total).toBe(20);
  });

  it("converts kg and lb targets without changing stored kg semantics", () => {
    expect(kgToPlateUnit(20.41165665, "lb")).toBe(45);
    expect(plateUnitToKg(45, "lb")).toBeCloseTo(20.4117, 4);
    expect(plateUnitToKg(80, "kg")).toBe(80);
  });

  it("only opts explicitly modeled symmetric barbell exercises into v1", () => {
    expect(plateLoadingRelation("back-squat")).toBe("symmetric-barbell-total");
    expect(plateLoadingRelation("machine-chest-press")).toBeNull();
    expect(plateLoadingRelation("landmine-squat")).toBeNull();
    expect(plateLoadingRelation("ez-bar-curl")).toBeNull();
  });

  it("keeps independent plate inventories when switching Gym Profiles", () => {
    const state = blankState();
    state.profile.onboardingComplete = true;
    state.profile.equipment = ["full gym"];
    normalizeGymProfilesState(state, "2026-09-05T12:00:00.000Z");
    const main = state.gymProfiles[0];
    main.plateSetup = defaultPlateSetup("kg");
    const created = createGymProfile(state, {
      name: "US Gym",
      equipment: ["full gym"],
    }, "2026-09-05T12:01:00.000Z").gym;
    created.plateSetup = defaultPlateSetup("lb");
    setDefaultGymProfile(state, created.id);
    expect(state.gymProfiles.find((gym) => gym.id === state.defaultGymProfileId).plateSetup.unit).toBe("lb");
    setDefaultGymProfile(state, main.id);
    expect(state.gymProfiles.find((gym) => gym.id === state.defaultGymProfileId).plateSetup.unit).toBe("kg");
  });

  it("persists gym plate setup through normal reload serialization", () => {
    const state = blankState();
    state.profile.onboardingComplete = true;
    state.profile.equipment = ["full gym"];
    normalizeGymProfilesState(state, "2026-09-05T12:00:00.000Z");
    state.gymProfiles[0].plateSetup = normalizePlateSetup({
      unit: "kg",
      selectedBarId: "bar-15",
      bars: [{ id: "bar-15", name: "Technique bar", weight: 15 }],
      plates: [{ size: 10, pairs: 1 }],
    });
    const restored = deserializeState(serializeState(state));
    expect(restored.gymProfiles[0].plateSetup).toEqual(state.gymProfiles[0].plateSetup);
  });

  it("round-trips configured bars and plates through Backup & Restore", async () => {
    const state = blankState();
    state.profile.onboardingComplete = true;
    state.profile.equipment = ["full gym"];
    normalizeGymProfilesState(state, "2026-09-05T12:00:00.000Z");
    state.gymProfiles[0].plateSetup = normalizePlateSetup({
      unit: "lb",
      selectedBarId: "bar-special",
      bars: [
        { id: "bar-45", name: "Olympic bar", weight: 45 },
        { id: "bar-special", name: "Specialty bar", weight: 55 },
      ],
      plates: [{ size: 45, pairs: 3 }, { size: 2.5, pairs: 1 }],
    });
    const archive = await buildBackupArchive(state, []);
    const restored = await parseBackupArchive(archive.bytes);
    expect(restored.state.gymProfiles[0].plateSetup).toEqual(state.gymProfiles[0].plateSetup);
  });
});
