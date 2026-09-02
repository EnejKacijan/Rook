import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  WEEKDAYS,
  blankState,
  buildProgram,
  estimateSessionMinutes,
  exerciseCatalog,
  isoDay,
  startWorkout,
  weekday,
} from "../src/domain.js";

const root = new URL("../artifacts/warmup-sequencing/", import.meta.url);
await mkdir(root, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, root));
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function fixture() {
  const today = weekday();
  const availableDays = [
    today,
    ...WEEKDAYS.filter((day) => day !== today).slice(0, 3),
  ];
  const state = blankState();
  state.profile = {
    ...state.profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 4,
    availableDays,
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Balanced"],
    recommendedWarmupsEnabled: true,
    rampUpSetsEnabled: true,
    onboardingComplete: true,
  };
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  const day = state.program.days.find((item) => item.weekday === today);
  const ids = ["machine-chest-press", "chest-supported-row", "leg-press"];
  day.exercises = [
    ...ids.map((exerciseId, index) => ({
    ...structuredClone(day.exercises[index]),
    id: `qa-warmup-exercise-${index}`,
    exerciseId,
    programmingRole: "main",
    sets: structuredClone(day.exercises[index].sets).map((set, setIndex) => ({
      ...set,
      id: `qa-warmup-set-${index}-${setIndex}`,
      weight: index === 0 ? 60 : index === 1 ? 50 : 100,
      completed: false,
    })),
    })),
    ...day.exercises.slice(3),
  ];
  day.estimatedMinutes = estimateSessionMinutes(day.exercises);
  state.activeWorkout = startWorkout(state, day);
  return state;
}

async function openActive(page) {
  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  const resume = page.getByRole("button", { name: "RESUME WORKOUT" });
  if (await resume.count()) await resume.click();
  await page.locator(".workout-screen").waitFor({ timeout: 5000 }).catch(async () => {
    throw new Error(`Workout screen did not open. Visible page: ${await page.locator("body").innerText()}`);
  });
}

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: "dark",
  serviceWorkers: "block",
});
await context.addInitScript((state) => {
  localStorage.setItem("lift-v2-state", JSON.stringify(state));
}, fixture());
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
    body: JSON.stringify({ available: false, provider: null }),
  }),
);
await openActive(page);

const warmup = page.locator(".workout-warmup");
await warmup.getByText("For Machine Chest Press").waitFor();
await warmup.locator(".workout-warmup-toggle").click();
assert.equal(await warmup.getByText("Machine Chest Press", { exact: true }).count(), 1);
assert.equal(await warmup.getByText("Chest Supported Row", { exact: true }).count(), 0);
assert.ok(await warmup.locator(".warmup-layer").count() > 0);
await warmup.getByRole("button", { name: "FINISH WARM-UP" }).click();
await warmup.waitFor({ state: "detached" });
await page.screenshot({ path: output("01-first-exercise-complete-dark.png") });

await page
  .locator(".up-next button")
  .filter({ hasText: "Chest Supported Row" })
  .click();
await page.locator(".workout-warmup").getByText("For Chest Supported Row").waitFor();
await page.locator(".workout-warmup-toggle").click();
assert.equal(await page.locator(".workout-warmup .warmup-layer").count(), 0);
assert.equal(
  await page.locator(".workout-warmup").getByText("Chest Supported Row", { exact: true }).count(),
  1,
);
await page.locator(".workout-warmup").getByRole("button", { name: "FINISH RAMP-UP" }).waitFor();
await page.screenshot({ path: output("02-second-exercise-ramp-dark.png") });

await page.locator(".up-next button").filter({ hasText: "Leg Press" }).click();
assert.equal(await page.locator(".workout-warmup").count(), 0);
assert.equal(
  await page.getByRole("heading", { name: exerciseCatalog["leg-press"].name }).count(),
  1,
);
assert.deepEqual(errors, []);

await context.close();

const skipContext = await browser.newContext({
  viewport: { width: 320, height: 700 },
  colorScheme: "light",
  serviceWorkers: "block",
});
await skipContext.addInitScript((state) => {
  localStorage.setItem("lift-v2-state", JSON.stringify(state));
}, fixture());
const skipPage = await skipContext.newPage();
const skipErrors = [];
skipPage.on("pageerror", (error) => skipErrors.push(error.message));
skipPage.on("console", (message) => {
  if (message.type() === "error") skipErrors.push(message.text());
});
await skipPage.route("**/api/ai/status", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false, provider: null }),
  }),
);
await openActive(skipPage);
await skipPage.locator(".workout-warmup").getByRole("button", { name: "Skip" }).click();
await skipPage.locator(".workout-warmup").waitFor({ state: "detached" });
assert.equal(await skipPage.locator(".exercise-heading-art-button").count(), 1);
await skipPage.screenshot({ path: output("03-warmup-skipped-light-320.png") });
assert.deepEqual(skipErrors, []);
await skipContext.close();

await browser.close();
console.log(
  "Warm-up sequencing QA passed: first exercise gets the complete warm-up, second distinct loaded compound gets only just-in-time ramp sets, exercise three gets no warm-up panel, and Skip leaves a clean light-mode hero at 320 px.",
);
