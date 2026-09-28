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
  vi.spyOn(window,"scrollTo").mockImplementation(()=>{});
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
  template.exercises[0].loggingMode = kind === "per-side" ? "per_side" : kind === "timed" ? "timed" : "normal";
  state.activeWorkout = startWorkout(state, template);
  state.activeWorkout.exercises[0].sets = state.activeWorkout.exercises[0].sets.slice(0, 2);
  state.activeWorkout.exercises[0].sets.forEach((set, index) => {
    Object.assign(set, {
      weight: kind === "timed" ? null : 40,
      reps: kind === "timed" ? 30 : 8,
      rir: rirEnabled && kind !== "timed" ? 2 : null,
      completed: index === 0,
      ...(kind === 'per-side' ? {sides:{left:{reps:8},right:{reps:7}}} : {}),
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

it.each([true,false])('groups per-side reps explicitly and keeps independent entry and one completion (RIR=%s)', rirEnabled => {
  mount({kind:'per-side',rirEnabled});
  const row=host.querySelector('.set-row[aria-label="set 2"]'),group=row.querySelector('[role="group"]');
  const original=structuredClone(current.activeWorkout.exercises[0]);
  expect(group.getAttribute('aria-label')).toBe('Reps per side for set 2');expect(group.textContent).toContain('REPS / SIDE');
  expect(group.querySelectorAll('input')).toHaveLength(2);expect(row.querySelectorAll('.check')).toHaveLength(1);
  act(()=>group.querySelector('[aria-label="Increase left reps for set 2"]').click());
  expect(current.activeWorkout.exercises[0].sets[1].sides).toEqual({left:{reps:9},right:{reps:7}});
  expect(current.activeWorkout.exercises[0].sets[1].weight).toBe(40);
  act(()=>row.querySelector('.check').click());
  expect(current.activeWorkout.exercises[0].sets[1].completed).toBe(true);
  expect(current.activeWorkout.exercises[0].sets.map(s=>s.id)).toEqual(original.sets.map(s=>s.id));
});

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

it.each(['weighted','timed','per-side'])('last %s exercise shows neutral Finish until every live set is logged',kind=>{
  mount({kind});
  const finish=()=>[...host.querySelectorAll('.workout-primary-action button')].find(button=>button.textContent.trim()==='FINISH WORKOUT');
  expect(finish().classList.contains('secondary')).toBe(true);
  act(()=>finish().click());expect(document.querySelector('#workout-confirm-title')?.textContent).toBe('Finish workout early?');
  act(()=>[...document.querySelectorAll('.workout-confirm-actions button')].find(button=>button.textContent.trim()==='KEEP TRAINING').click());
  act(()=>vi.advanceTimersByTime(500));
  act(()=>host.querySelector('[aria-label="Log set 2"]').click());
  expect(current.activeWorkout.exercises[0].sets.every(set=>set.completed)).toBe(true);
  expect(finish().classList.contains('primary')).toBe(true);
  act(()=>[...host.querySelectorAll('.sets button')].find(button=>button.textContent.includes('+ ADD SET')).click());
  expect(current.activeWorkout.exercises[0].sets.at(-1).completed).toBe(false);
  expect(finish().classList.contains('secondary')).toBe(true);
});
