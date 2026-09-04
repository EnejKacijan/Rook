import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import {
  WEEKDAYS,
  blankState,
  buildProgram,
  exerciseCatalog,
  isoDay,
  startWorkout,
  weekday,
} from "../src/domain.js";

const appUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const today = weekday();
const state = blankState();
state.profile = {
  ...state.profile,
  goal: "Build muscle",
  experience: "Intermediate",
  daysPerWeek: 3,
  availableDays: [today, ...WEEKDAYS.filter((day) => day !== today).slice(0, 2)],
  sessionMinutes: 60,
  environment: "Commercial gym",
  equipment: ["full gym"],
  priorities: ["Balanced"],
  rirEnabled: true,
  restTimerEnabled: false,
  recommendedWarmupsEnabled: false,
  onboardingComplete: true,
};
state.program = buildProgram(state.profile);
state.selectedDay = today;
state.selectedDate = isoDay();
const day = state.program.days.find((item) => item.weekday === today);
state.activeWorkout = startWorkout(state, day);
state.activeWorkout.exerciseIndex = 0;
const pullUp = state.activeWorkout.exercises[0];
pullUp.exerciseId = "pull-up";
pullUp.loadRequirement = "required"; // Simulate a stale pre-contract snapshot.
pullUp.repMin = 6;
pullUp.repMax = 10;
pullUp.targetRir = 1;
pullUp.sets = Array.from({ length: 3 }, (_, index) => ({
  id: `pull-up-set-${index + 1}`,
  weight: 0, // Simulate the legacy fake-zero representation.
  reps: 6,
  rir: null,
  completed: false,
}));

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
await context.addInitScript(
  (fixture) => localStorage.setItem("lift-v2-state", JSON.stringify(fixture)),
  state,
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
await page.route("**/api/ai/status", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false }),
  }),
);
await page.goto(appUrl, { waitUntil: "networkidle" });
const resume = page.getByRole("button", { name: "RESUME WORKOUT" });
if (await resume.count()) await resume.click();
else if (!(await page.getByRole("heading", { name: "Pull-up" }).count()))
  throw new Error(`Active workout did not open. UI: ${await page.locator("body").innerText()}`);

const addedLoad = page.getByRole("spinbutton", {
  name: "Added weight (optional) in kg for set 1",
});
assert.equal(await addedLoad.getAttribute("placeholder"), "Bodyweight");
assert.equal(await addedLoad.inputValue(), "");
assert.equal(
  await page.getByRole("button", { name: "Complete set 1" }).isEnabled(),
  true,
  "pull-ups are completable with reps alone",
);
assert.equal(
  await page.locator(".set-row").first().locator(".stepper").first().locator("button").last().isEnabled(),
  true,
  "optional added load can be started with the plus control",
);
const repaired = await page.evaluate(() => {
  const active = JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout;
  return {
    loadRequirement: active.exercises[0].loadRequirement,
    weight: active.exercises[0].sets[0].weight,
  };
});
assert.deepEqual(repaired, { loadRequirement: "optional", weight: null });

await page.getByRole("button", { name: "Complete set 1" }).click();
assert.equal(
  await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout.exercises[0]
        .sets[0].completed,
  ),
  true,
);
assert.deepEqual(errors, []);
await context.close();

for (const exerciseId of [
  "back-extension-45",
  "wg-reverse-hyperextension",
  "wg-captains-chair-knee-raise",
  "wg-assisted-chin-up",
]) {
  const scenario = structuredClone(state);
  const exercise = scenario.activeWorkout.exercises[0];
  exercise.exerciseId = exerciseId;
  exercise.loadRequirement = "required"; // Simulate another stale snapshot.
  exercise.sets = Array.from({ length: 3 }, (_, index) => ({
    id: `${exerciseId}-set-${index + 1}`,
    weight: 0,
    reps: 6,
    rir: null,
    completed: false,
  }));
  const scenarioContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await scenarioContext.addInitScript(
    (fixture) => localStorage.setItem("lift-v2-state", JSON.stringify(fixture)),
    scenario,
  );
  const scenarioPage = await scenarioContext.newPage();
  const scenarioErrors = [];
  scenarioPage.on("pageerror", (error) => scenarioErrors.push(error.message));
  scenarioPage.on("console", (message) => {
    if (message.type() === "error") scenarioErrors.push(message.text());
  });
  await scenarioPage.route("**/api/ai/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: false }),
    }),
  );
  await scenarioPage.goto(appUrl, { waitUntil: "networkidle" });
  const scenarioResume = scenarioPage.getByRole("button", {
    name: "RESUME WORKOUT",
  });
  if (await scenarioResume.count()) await scenarioResume.click();
  await scenarioPage.getByRole("heading", {
    name: exerciseCatalog[exerciseId].name,
  }).waitFor();
  assert.equal(
    await scenarioPage.getByRole("button", { name: "Complete set 1" }).isEnabled(),
    true,
    `${exerciseId} is completable at zero added load`,
  );
  assert.deepEqual(
    await scenarioPage.evaluate(() => {
      const active = JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout;
      return {
        loadRequirement: active.exercises[0].loadRequirement,
        weight: active.exercises[0].sets[0].weight,
      };
    }),
    { loadRequirement: "optional", weight: null },
    `${exerciseId} repairs stale required-load metadata and fake zeroes`,
  );
  assert.deepEqual(scenarioErrors, []);
  await scenarioContext.close();
}

await browser.close();
console.log(
  "Load contract QA passed: optional bodyweight and support-station exercises accept zero added load.",
);
