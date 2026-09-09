import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  blankState,
  buildProgram,
  displayWeight,
  isoDay,
  startWorkout,
  storedWeight,
  weekday,
} from "../src/domain.js";

const root = new URL("../artifacts/warmup-load-source/", import.meta.url);
await mkdir(root, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, root));

function baseState(units = "kg") {
  const state = blankState();
  const today = weekday();
  const availableDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const todayIndex = availableDays.indexOf(today);
  state.profile = {
    ...state.profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 3,
    availableDays: [today, availableDays[(todayIndex + 2) % 7], availableDays[(todayIndex + 4) % 7]],
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    recommendedWarmupsEnabled: true,
    rampUpSetsEnabled: true,
    onboardingComplete: true,
    units,
  };
  state.program = buildProgram(state.profile);
  const day = state.program.days.find((item) => item.weekday === today);
  state.selectedDay = day.weekday;
  state.selectedDate = isoDay();
  const template = structuredClone(day.exercises[0]);
  day.name = "NOGE A (MOČ)";
  day.exercises = [{
    ...template,
    id: "qa-leg-press",
    exerciseId: "leg-press",
    repMin: 9,
    repMax: 9,
    programmingRole: "main",
    sets: Array.from({ length: 3 }, (_, index) => ({
      ...structuredClone(template.sets[0]),
      id: `qa-leg-press-set-${index}`,
      reps: 9,
      weight: null,
      completed: false,
    })),
  }, ...day.exercises.slice(1)];
  return { state, day };
}

function historyDerived(units = "kg", displayedLoad = 130) {
  const { state, day } = baseState(units);
  const storedLoad = storedWeight(displayedLoad, units);
  state.workouts.push({
    id: `qa-history-${units}`,
    completedAt: new Date(Date.now() - 86_400_000).toISOString(),
    exercises: [{
      id: `qa-history-leg-press-${units}`,
      exerciseId: "leg-press",
      sets: Array.from({ length: 3 }, (_, index) => ({
        id: `qa-history-set-${units}-${index}`,
        weight: storedLoad,
        reps: 9,
        rir: 1,
        completed: true,
      })),
    }],
  });
  state.activeWorkout = startWorkout(state, day);
  return state;
}

function ramp(state) {
  return state.activeWorkout.warmup.rampUpSets.find(
    (entry) => entry.exerciseId === "leg-press",
  ).sets;
}

const historyKg = historyDerived("kg", 130);
assert.deepEqual(
  historyKg.activeWorkout.exercises[0].sets.map((set) => [set.weight, set.weightProvenance]),
  [[130, "history"], [130, "history"], [130, "history"]],
);
assert.deepEqual(ramp(historyKg).map((set) => [set.weight, set.reps]), [[65, 8], [90, 4]]);

const explicit = baseState("kg");
explicit.day.exercises[0].sets.forEach((set) => { set.weight = 60; });
explicit.state.activeWorkout = startWorkout(explicit.state, explicit.day);
assert.deepEqual(
  explicit.state.activeWorkout.exercises[0].sets.map((set) => [set.weight, set.weightProvenance]),
  [[60, "explicit-plan"], [60, "explicit-plan"], [60, "explicit-plan"]],
);
assert.deepEqual(ramp(explicit.state).map((set) => [set.weight, set.reps]), [[30, 8], [40, 4]]);

const unknown = baseState("kg");
unknown.state.activeWorkout = startWorkout(unknown.state, unknown.day);
assert.ok(ramp(unknown.state).every((set) => set.weight === null));
assert.deepEqual(ramp(unknown.state).map((set) => set.loadInstruction), ["Light", "Moderate"]);

const historyLb = historyDerived("lb", 130);
assert.ok(Math.abs(displayWeight(historyLb.activeWorkout.exercises[0].sets[0].weight, "lb") - 130) < 0.05);
const lbRamp = ramp(historyLb).map((set) => displayWeight(set.weight, "lb"));
assert.ok(lbRamp[0] > 60 && lbRamp[0] < 70);
assert.ok(lbRamp[1] > 80 && lbRamp[1] < 95);

const barbell = baseState("kg");
barbell.day.exercises[0].exerciseId = "back-squat";
barbell.day.exercises[0].sets.forEach((set) => { set.weight = 100; });
barbell.state.activeWorkout = startWorkout(barbell.state, barbell.day);
const barbellRamp = barbell.state.activeWorkout.warmup.rampUpSets[0].sets;
assert.ok(barbellRamp.every((set) => Number(set.weight) > 0 && set.weight < 100));

const bodyweight = baseState("kg");
bodyweight.day.exercises[0].exerciseId = "pull-up";
bodyweight.state.activeWorkout = startWorkout(bodyweight.state, bodyweight.day);
const bodyweightRamps = bodyweight.state.activeWorkout.warmup?.rampUpSets || [];
assert.ok(bodyweightRamps.flatMap((entry) => entry.sets).every((set) => set.weight === null));

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
await context.addInitScript((state) => localStorage.setItem("lift-v2-state", JSON.stringify(state)), historyKg);
const page = await context.newPage();
await page.route("**/api/ai/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: false, provider: null }) }));
await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
const resume = page.getByRole("button", { name: "RESUME WORKOUT" });
if (await resume.count()) await resume.click();
await page.locator(".workout-screen").waitFor({ timeout: 5000 }).catch(async () => {
  throw new Error(`Workout screen did not open. Stored state: ${await page.evaluate(() => { const state = JSON.parse(localStorage.getItem("lift-v2-state")); return JSON.stringify({ onboardingComplete: state.profile?.onboardingComplete, program: Boolean(state.program), activeWorkout: Boolean(state.activeWorkout) }); })}. Visible page: ${await page.locator("body").innerText()}`);
});
assert.equal(await page.getByRole("spinbutton", { name: "Weight in kg for set 1" }).inputValue(), "130");
await page.locator(".workout-warmup-toggle").click();
const rampRows = page.locator(".workout-warmup .warmup-ramp .warmup-check-row span");
assert.deepEqual(await rampRows.allTextContents(), ["65 kg × 8", "90 kg × 4"]);
await page.screenshot({ path: output("history-derived-130kg-current.png"), fullPage: true });
await browser.close();

console.log("Warm-up load-source QA passed: history 130 kg -> 65/90 kg, explicit 60 kg -> 30/40 kg, unknown/bodyweight stay non-numeric, lb conversion and barbell ramps remain proportional.");
