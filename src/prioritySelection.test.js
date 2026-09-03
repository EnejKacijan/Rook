import { describe, expect, it } from "vitest";
import {
  MAX_MANUAL_TRAINING_PRIORITIES,
  nextManualPrioritySelection,
  normalizeManualPrioritySelection,
} from "./prioritySelection.js";

describe("manual training priority selection", () => {
  it("keeps both selected priorities when a third area is selected", () => {
    let selected = nextManualPrioritySelection([], "Shoulders");
    selected = nextManualPrioritySelection(selected, "Chest");
    selected = nextManualPrioritySelection(selected, "Back");

    expect(selected).toEqual(["Shoulders", "Chest"]);
    expect(selected).toHaveLength(MAX_MANUAL_TRAINING_PRIORITIES);
  });

  it("keeps Balanced mutually exclusive and restores it after the last area is deselected", () => {
    expect(nextManualPrioritySelection(["Chest", "Back"], "Balanced")).toEqual([
      "Balanced",
    ]);
    expect(nextManualPrioritySelection(["Balanced"], "Chest")).toEqual([
      "Chest",
    ]);
    expect(nextManualPrioritySelection(["Chest", "Back"], "Chest")).toEqual([
      "Back",
    ]);
    expect(nextManualPrioritySelection(["Chest"], "Chest")).toEqual([
      "Balanced",
    ]);
  });

  it("bounds older saved selections when they are next edited", () => {
    expect(
      normalizeManualPrioritySelection(["Shoulders", "Chest", "Back"]),
    ).toEqual(["Chest", "Back"]);
    expect(normalizeManualPrioritySelection(["Balanced"])).toEqual([
      "Balanced",
    ]);
    expect(normalizeManualPrioritySelection([])).toEqual(["Balanced"]);
  });
});
