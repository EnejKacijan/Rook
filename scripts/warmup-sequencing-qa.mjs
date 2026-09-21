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
assert.equal(await warmup.getByText(/Machine Chest Press · RAMP-UP/i).count(), 1);
assert.equal(await warmup.getByText(/Chest Supported Row · RAMP-UP/i).count(), 0);
assert.equal(await warmup.locator(".warmup-checklist-section").count(), 1);
assert.equal(
  await warmup.getByText(/Practice Machine Chest Press/i).count(),
  0,
  "the expanded checklist does not repeat a vague timed practice block",
);
const generalStep = warmup.locator(".warmup-checklist-section .warmup-check-row").first();
assert.equal(await generalStep.getAttribute("aria-checked"), "false");
await generalStep.click();
assert.equal(await generalStep.getAttribute("aria-checked"), "true");
assert.equal(await warmup.locator(".warmup-ramp .warmup-check-row.current").count(), 1);
await page.waitForTimeout(250);
await page.screenshot({ path: output("00-first-exercise-expanded-dark.png") });
assert.equal(await warmup.getByRole('button', {name:'Skip remaining'}).count(), 1);
for (const step of await warmup.locator('.warmup-check-row[aria-checked="false"]').all()) await step.click();
assert.equal(await warmup.locator('.workout-warmup-toggle').getAttribute('aria-expanded'), 'true');
await warmup.getByRole('button', {name:'Continue to workout'}).click();
await warmup.locator('.warmup-details').waitFor({state:'detached'});
assert.equal(await warmup.locator('.workout-warmup-toggle').innerText(), '✓Warm-up complete');
assert.equal(await warmup.count(), 1, 'completed summary remains reviewable');
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lift-v2-state')).activeWorkout.warmup.stages[0].completed), true);
assert.equal(await warmup.locator('.workout-warmup-toggle').evaluate(button => button === document.activeElement), true);
await page.screenshot({ path: output("01-first-exercise-complete-dark.png") });

await page
  .locator(".up-next .swipe-up-next-body")
  .filter({ hasText: "Chest Supported Row" })
  .click();
await page.locator(".workout-motion-paint").waitFor({state:"detached"});
await page.locator(".workout-warmup").getByText("For Chest Supported Row").waitFor();
await page.locator(".workout-warmup-toggle").click();
assert.equal(await page.locator(".workout-warmup .warmup-checklist-section").count(), 0);
assert.equal(
  await page.locator(".workout-warmup").getByText(/Chest Supported Row · RAMP-UP/i).count(),
  1,
);
await page.locator(".workout-warmup").getByRole("button", { name: "Skip warm-up" }).waitFor();
await page.screenshot({ path: output("02-second-exercise-ramp-dark.png") });

await page.locator(".up-next .swipe-up-next-body").filter({ hasText: "Leg Press" }).click();
await page.locator(".workout-motion-paint").waitFor({state:"detached"});
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
await skipPage.locator(".workout-warmup-toggle").click();
assert.ok(await skipPage.locator(".warmup-check-row").count() > 0);
assert.equal(
  await skipPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
  "expanded Light warm-up stays narrow-safe at 320 px",
);
await skipPage.screenshot({ path: output("03-expanded-light-320.png") });
await skipPage.locator(".workout-warmup-toggle").click();
await skipPage.locator(".workout-warmup").getByRole("button", { name: "Skip" }).click();
await skipPage.locator(".workout-warmup-toggle").getByText("Warm-up skipped").waitFor();
assert.equal(await skipPage.locator(".exercise-heading-art-button").count(), 1);
await skipPage.screenshot({ path: output("04-warmup-skipped-light-320.png") });
assert.deepEqual(skipErrors, []);
await skipContext.close();

const reducedContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: "dark",
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
await reducedContext.addInitScript((state) => {
  localStorage.setItem("lift-v2-state", JSON.stringify(state));
}, fixture());
const reducedPage = await reducedContext.newPage();
const reducedErrors = [];
reducedPage.on("pageerror", (error) => reducedErrors.push(error.message));
reducedPage.on("console", (message) => {
  if (message.type() === "error") reducedErrors.push(message.text());
});
await reducedPage.route("**/api/ai/status", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false, provider: null }),
  }),
);
await openActive(reducedPage);
await reducedPage.locator(".workout-warmup-toggle").click();
await reducedPage.getByRole('button', {name:'Skip warm-up'}).click();
assert.equal(await reducedPage.locator('.warmup-details').count(), 0);
assert.equal(await reducedPage.locator('.workout-warmup-toggle').innerText(), 'Warm-up skipped');
await reducedPage.screenshot({path:output('reduced-motion-settled.png')});
assert.deepEqual(reducedErrors, []);
await reducedContext.close();

const premiumState = fixture();
premiumState.profile.themePreference = "premium";
const premiumContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: "dark",
  serviceWorkers: "block",
});
await premiumContext.addInitScript((state) => {
  localStorage.setItem("lift-v2-state", JSON.stringify(state));
}, premiumState);
const premiumPage = await premiumContext.newPage();
const premiumErrors = [];
premiumPage.on("pageerror", (error) => premiumErrors.push(error.message));
premiumPage.on("console", (message) => {
  if (message.type() === "error") premiumErrors.push(message.text());
});
await premiumPage.route("**/api/ai/status", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false, provider: null }),
  }),
);
await openActive(premiumPage);
await premiumPage.locator(".workout-warmup-toggle").click();
assert.equal(
  await premiumPage.evaluate(() => document.documentElement.dataset.theme),
  "premium",
);
assert.equal(
  await premiumPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
  "expanded Premium warm-up stays narrow-safe",
);
await premiumPage.screenshot({ path: output("05-expanded-premium.png") });
assert.deepEqual(premiumErrors, []);
await premiumContext.close();

await browser.close();
console.log(
  "Warm-up sequencing QA passed: the first exercise gets a compact actionable checklist, explicit completion retains a reviewable summary, the second distinct compound gets just-in-time ramp sets, and Skip stays clean at 320 px.",
);
