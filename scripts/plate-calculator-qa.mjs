import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  blankState,
  buildProgram,
  exerciseCatalog,
  isoDay,
  startWorkout,
  weekday,
  WEEKDAYS,
} from "../src/domain.js";
import { normalizeGymProfilesState } from "../src/gymProfiles.js";
import {
  defaultPlateSetup,
  normalizePlateSetup,
  plateUnitToKg,
} from "../src/plateCalculator.js";

const artifactRoot = new URL("../artifacts/plate-calculator/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function fixture({
  target = 80,
  sourceId = "back-squat",
  setup = defaultPlateSetup("kg"),
  appearance = "light",
  style = "standard",
  travelGym = false,
} = {}) {
  const state = blankState();
  const today = weekday();
  state.profile = {
    ...state.profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 2,
    availableDays: [today, WEEKDAYS[(WEEKDAYS.indexOf(today) + 3) % 7]],
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Balanced"],
    onboardingComplete: true,
    appearancePreference: appearance,
    stylePreference: style,
    themePreference: style === "premium" ? "premium" : appearance,
    units: setup.unit,
  };
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.ai.planUpgradeDismissed = true;
  const template = state.program.days.find((day) => day.weekday === today);
  template.exercises[0] = {
    ...template.exercises[0],
    exerciseId: sourceId,
    restSeconds: exerciseCatalog[sourceId]?.restSeconds || 90,
    defaultIncrement: exerciseCatalog[sourceId]?.increment || 1,
  };
  normalizeGymProfilesState(state, "2026-09-05T12:00:00.000Z");
  state.gymProfiles[0].plateSetup = normalizePlateSetup(setup, setup.unit);
  if (travelGym) {
    state.gymProfiles.push({
      schemaVersion: 1,
      id: "gym-travel-plate",
      name: "Travel Gym",
      equipment: ["barbell/rack/bench"],
      plateSetup: normalizePlateSetup({
        unit: "kg",
        selectedBarId: "travel-15",
        bars: [{ id: "travel-15", name: "Travel bar", weight: 15 }],
        plates: [{ size: 10, pairs: 2 }, { size: 5, pairs: 2 }],
      }),
      createdAt: "2026-09-05T12:00:00.000Z",
      updatedAt: "2026-09-05T12:00:00.000Z",
    });
  }
  state.activeWorkout = startWorkout(state, template);
  state.activeWorkout.exerciseIndex = 0;
  state.activeWorkout.exercises = state.activeWorkout.exercises.slice(0, 2);
  state.activeWorkout.exercises[0].sets.forEach((set) => {
    set.weight = setup.unit === "lb" ? plateUnitToKg(target, "lb") : target;
    set.weightEntryMode = "auto";
  });
  if (travelGym) {
    state.activeWorkout.adjustment = {
      mode: "different-equipment",
      temporaryEquipment: ["barbell/rack/bench"],
      gymProfileId: "gym-travel-plate",
      gymProfileName: "Travel Gym",
    };
  }
  return state;
}

async function open(state, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({
    viewport,
    colorScheme: state.profile.appearancePreference,
    serviceWorkers: "block",
  });
  await context.addInitScript((value) => {
    if (!sessionStorage.getItem("rook-plate-calculator-fixture")) {
      localStorage.setItem("lift-v2-state", JSON.stringify(value));
      sessionStorage.setItem("rook-plate-calculator-fixture", "loaded");
    }
  }, state);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/**", (route) => {
    if (route.request().url().includes("/api/ai/status"))
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false,"provider":null}' });
    return route.abort();
  });
  await page.goto(`${baseUrl}/?plate-calculator=${Date.now()}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "RESUME WORKOUT" }).click();
  return { context, page, errors };
}

async function capture(name, state, viewport, action, { entry = false, requireDialog = true } = {}) {
  const run = await open(state, viewport);
  if (action) await action(run.page);
  await run.page.waitForTimeout(350);
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} has no horizontal overflow`);
  await run.page.screenshot({ path: output(`${name}.png`), fullPage: false });
  assert.deepEqual(run.errors, [], `${name} console errors: ${run.errors.join("; ")}`);
  if (!entry && requireDialog) await run.page.getByRole("dialog").waitFor();
  await run.context.close();
}

await capture("390-entry-point", fixture(), { width: 390, height: 844 }, async (page) => {
  assert.equal(await page.getByRole("button", { name: "Open plate calculator for 80 kg" }).count(), 1);
}, { entry: true });

const openCalculator = async (page) => {
  await page.getByRole("button", { name: /Open plate calculator/ }).click();
  await page.getByRole("dialog", { name: /80 kg|147\.5 kg|82\.5 kg|135 lb|75 kg/i }).waitFor();
};

await capture("390-common-80kg", fixture(), { width: 390, height: 844 }, openCalculator);
await capture("390-complex-combination", fixture({ target: 147.5 }), { width: 390, height: 844 }, openCalculator);

const impossibleSetup = normalizePlateSetup({
  unit: "kg",
  selectedBarId: "bar-20",
  bars: [{ id: "bar-20", name: "Olympic bar", weight: 20 }],
  plates: [{ size: 20, pairs: 2 }, { size: 10, pairs: 2 }, { size: 2.5, pairs: 2 }],
});
await capture("390-impossible-nearest", fixture({ target: 82.5, setup: impossibleSetup }), { width: 390, height: 844 }, async (page) => {
  await openCalculator(page);
  await page.getByText("80 kg", { exact: true }).waitFor();
  await page.getByText("85 kg", { exact: true }).waitFor();
});
await capture("320-complex", fixture({ target: 147.5 }), { width: 320, height: 700 }, openCalculator);

await capture("390-config", fixture(), { width: 390, height: 844 }, async (page) => {
  await openCalculator(page);
  await page.getByRole("button", { name: "Configure bars and plates" }).click();
  await page.getByRole("heading", { name: "Bars and plates" }).waitFor();
}, { requireDialog: false });

const lbSetup = defaultPlateSetup("lb");
await capture("390-lb", fixture({ target: 135, setup: lbSetup }), { width: 390, height: 844 }, async (page) => {
  await page.getByRole("button", { name: "Open plate calculator for 135 lb" }).click();
  await page.getByRole("dialog", { name: "135 LB" }).waitFor();
});
await capture("390-travel-gym-15kg-bar", fixture({ target: 75, travelGym: true }), { width: 390, height: 844 }, async (page) => {
  await page.getByRole("button", { name: /Open plate calculator/ }).click();
  await page.getByText("Travel Gym", { exact: true }).waitFor();
  await page.getByText("Bar: 15 kg", { exact: true }).waitFor();
});

for (const [appearance, style, label] of [
  ["light", "standard", "standard-light"],
  ["dark", "standard", "standard-dark"],
  ["light", "premium", "premium-light"],
  ["dark", "premium", "premium-dark"],
]) {
  await capture(`390-${label}-main`, fixture({ appearance, style }), { width: 390, height: 844 }, openCalculator);
  await capture(`390-${label}-complex`, fixture({ target: 147.5, appearance, style }), { width: 390, height: 844 }, openCalculator);
}
await capture("430-main", fixture(), { width: 430, height: 900 }, openCalculator);

const unchanged = await open(fixture({ target: 82.5, setup: impossibleSetup }));
const originalWeight = await unchanged.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout.exercises[0].sets[0].weight);
await openCalculator(unchanged.page);
await unchanged.page.getByRole("button", { name: /Close/ }).click();
assert.equal(await unchanged.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout.exercises[0].sets[0].weight), originalWeight, "opening and closing never changes the target");
await unchanged.context.close();

const chooseAlternative = await open(fixture({ target: 82.5, setup: impossibleSetup }));
await openCalculator(chooseAlternative.page);
await chooseAlternative.page.getByRole("button", { name: /80 kg Use for this set/ }).click();
let stored = await chooseAlternative.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
assert.equal(stored.activeWorkout.exercises[0].sets[0].weight, 80, "explicit alternative updates the current set");
assert.equal(stored.activeWorkout.exercises[0].sets[1].weight, 82.5, "an explicit per-set choice does not rewrite later set targets");
await chooseAlternative.context.close();

const configured = await open(fixture());
await openCalculator(configured.page);
await configured.page.getByRole("button", { name: "Configure bars and plates" }).click();
await configured.page.getByRole("radio", { name: /15 kg bar/ }).click();
await configured.page.getByRole("button", { name: "SAVE PLATE SETUP" }).click();
await configured.page.getByText("Bar: 15 kg", { exact: true }).waitFor();
await configured.page.getByRole("button", { name: "Close" }).click();
await configured.page.reload({ waitUntil: "networkidle" });
await configured.page.getByRole("button", { name: "RESUME WORKOUT" }).click();
await configured.page.getByRole("button", { name: /Open plate calculator/ }).click();
await configured.page.getByText("Bar: 15 kg", { exact: true }).waitFor();
assert.deepEqual(configured.errors, []);
await configured.context.close();

const excluded = await open(fixture({ sourceId: "machine-chest-press" }));
assert.equal(await excluded.page.getByRole("button", { name: /Open plate calculator/ }).count(), 0, "machines without explicit load semantics stay excluded");
await excluded.context.close();

const offline = await open(fixture());
await offline.context.setOffline(true);
await openCalculator(offline.page);
await offline.page.getByText("Bar: 20 kg", { exact: true }).waitFor();
await offline.context.setOffline(false);
assert.deepEqual(offline.errors, []);
await offline.context.close();

await browser.close();
console.log("Plate Calculator QA passed: entry, exact/complex/nearest loads, explicit alternative, kg/lb, 15/20/45 bars, gym switching, config reload, offline use, machine exclusion, widths, and four themes.");
