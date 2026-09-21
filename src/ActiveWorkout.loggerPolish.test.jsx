import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActiveWorkout } from "./App.jsx";
import { createReturningUserFixture } from "./demoFixture.js";
import { isoDay, startWorkout } from "./domain.js";

let root;
let host;
let current;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-21T12:00:00"));
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  HTMLElement.prototype.scrollTo = () => {};
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount({ rirEnabled = true, kind = "weighted" } = {}) {
  const state = createReturningUserFixture(0);
  Object.assign(state.profile, {
    rirEnabled,
    showExerciseImages: false,
    restTimerEnabled: false,
  });
  state.selectedDate = isoDay();
  const template = structuredClone(state.program.days[0]);
  template.exercises = template.exercises.slice(0, 1);
  template.exercises[0].exerciseId = kind === "timed" ? "plank" : "barbell-bench-press";
  template.exercises[0].loggingMode = kind === "timed" ? "timed" : "normal";
  state.activeWorkout = startWorkout(state, template);
  state.activeWorkout.exercises[0].sets = state.activeWorkout.exercises[0].sets.slice(0, 2);
  state.activeWorkout.exercises[0].sets.forEach((set, index) => {
    Object.assign(set, {
      weight: kind === "timed" ? null : 40,
      reps: kind === "timed" ? 30 : 8,
      rir: rirEnabled && kind !== "timed" ? 2 : null,
      completed: index === 0,
    });
  });
  function Harness() {
    const [stateValue, setState] = useState(state);
    current = stateValue;
    return (
      <ActiveWorkout
        state={stateValue}
        update={fn => setState(previous => fn(structuredClone(previous)))}
        setPage={() => {}}
        setDetail={() => {}}
        onLiveFinish={() => {}}
      />
    );
  }
  act(() => root.render(<Harness />));
}

const labels = () => [...host.querySelectorAll(".set-labels .logger-column-label")];
const firstRow = () => host.querySelector('.set-row[aria-label="set 1"]');

it("uses one shared label class, hides DONE, and preserves completion semantics", () => {
  mount();
  expect(labels().map(node => node.textContent.replace(/\s+/g, "").trim())).toEqual(["KG", "REPS", "RIR"]);
  expect(host.querySelector(".set-done-heading")).toBeNull();
  expect(firstRow().querySelector('[aria-label="Undo logged set 1"]')).not.toBeNull();
  expect(firstRow().querySelector('[aria-label="RIR for set 1"]')).not.toBeNull();
  expect(firstRow().querySelectorAll(".stepper")).toHaveLength(2);
  expect(firstRow().querySelectorAll(".stepper button")).toHaveLength(4);
});

it("removes only the RIR heading group when RIR is disabled", () => {
  mount({ rirEnabled: false });
  expect(labels().map(node => node.textContent.replace(/\s+/g, "").trim())).toEqual(["KG", "REPS"]);
  expect(host.querySelector(".set-label-help")).toBeNull();
  expect(firstRow().querySelector('[aria-label^="RIR for"]')).toBeNull();
  expect(firstRow().querySelector('[aria-label="Undo logged set 1"]')).not.toBeNull();
});

it("keeps the shared header treatment for timed rows without creating a RIR column", () => {
  mount({ kind: "timed" });
  expect(labels().map(node => node.textContent.replace(/\s+/g, "").trim())).toEqual(["+KG", "SEC"]);
  expect(host.querySelector(".set-label-help")).toBeNull();
  expect(firstRow().querySelector('[aria-label="Seconds for set 1"]')).not.toBeNull();
  expect(firstRow().querySelector(".check")).not.toBeNull();
  expect(current.activeWorkout.exercises[0].sets[0].reps).toBe(30);
});
