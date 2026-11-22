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
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
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

// Record every aria-expanded value the warm-up toggle ever shows, from the first
// paint on, so a closed-then-open flash cannot hide between two assertions.
function recordWarmupStates() {
  window.__warmupStates = [];
  const seen = () => {
    const toggle = document.querySelector(".workout-warmup-toggle");
    const value = toggle?.getAttribute("aria-expanded");
    if (value && window.__warmupStates.at(-1) !== value) window.__warmupStates.push(value);
  };
  new MutationObserver(seen).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-expanded"] });
}

async function newPage({ width, height = 844, colorScheme, reducedMotion = "no-preference", state = fixture() }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme, reducedMotion, serviceWorkers: "block" });
  await context.addInitScript((value) => {
    if (!sessionStorage.getItem("qa-seeded")) {
      localStorage.setItem("lift-v2-state", JSON.stringify(value));
      sessionStorage.setItem("qa-seeded", "1");
    }
  }, state);
  await context.addInitScript(recordWarmupStates);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: false, provider: null }) }));
  await openActive(page);
  return { context, page, errors };
}

const expanded = (page) => page.locator(".workout-warmup-toggle").getAttribute("aria-expanded");
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout);
const settle = (page) => page.waitForTimeout(400);
async function goToExercise(page, name) {
  await page.locator(".up-next .swipe-up-next-body").filter({ hasText: name }).click();
  await page.locator(".workout-motion-paint").waitFor({ state: "detached" });
}
async function goBack(page) {
  await page.locator(".workout-previous").click();
  await page.locator(".workout-motion-paint").waitFor({ state: "detached" });
}
async function headingBelowHeader(page) {
  return page.evaluate(() => {
    const header = document.querySelector(".workout-header").getBoundingClientRect().bottom;
    const heading = document.querySelector(".exercise-heading").getBoundingClientRect();
    return heading.top >= header - 1 && heading.top < innerHeight;
  });
}

// 1. A new workout: the first warm-up is open from the first paint, with no scroll.
{
  const { context, page, errors } = await newPage({ width: 393, colorScheme: "dark" });
  const warmup = page.locator(".workout-warmup");
  assert.equal(await expanded(page), "true");
  assert.deepEqual(await page.evaluate(() => window.__warmupStates), ["true"], "no closed frame before the open checklist");
  assert.equal(await page.locator(".workout-screen").evaluate((node) => node.scrollTop), 0, "opening does not scroll");
  assert.equal(await warmup.getByText(/^Warm-up sets$/).count(), 1, "single ramp group uses the short label");
  assert.equal(await warmup.getByText(/Chest Supported Row · Warm-up sets/i).count(), 0);
  assert.equal(await warmup.locator(".warmup-checklist-section").count(), 1);
  assert.equal(await warmup.getByText(/Practice Machine Chest Press/i).count(), 0, "no vague timed practice block");
  assert.equal(await warmup.locator(".warmup-skip").getAttribute("aria-label"), "Skip warm-up", "Skip stays in the bar while open");

  const generalStep = warmup.locator(".warmup-checklist-section .warmup-check-row").first();
  await generalStep.click();
  assert.equal(await generalStep.getAttribute("aria-checked"), "true");
  assert.equal(await generalStep.evaluate((node) => node.classList.contains("just-checked")), true);
  assert.match(await warmup.locator(".warmup-inline-progress").innerText(), /^1\/\d+$/);
  assert.equal(await warmup.locator(".warmup-ramp .warmup-check-row.current").count(), 1);
  await settle(page);
  await page.screenshot({ path: output("00-first-exercise-open-dark-393.png") });
  assert.equal(await warmup.locator(".warmup-skip").getAttribute("aria-label"), "Skip remaining");

  // Manual collapse sticks across exercise changes and a reload.
  await warmup.locator(".workout-warmup-toggle").click();
  await settle(page);
  assert.equal(await expanded(page), "false");
  await goToExercise(page, "Chest Supported Row");
  assert.equal(await expanded(page), "false", "later warm-ups start collapsed");
  await page.locator(".workout-warmup").getByText("For Chest Supported Row").waitFor();
  await goBack(page);
  assert.equal(await page.getByRole("heading", { name: exerciseCatalog["machine-chest-press"].name }).count(), 1);
  assert.equal(await expanded(page), "false", "manual collapse stays after returning");
  await page.reload({ waitUntil: "networkidle" });
  await openActive(page);
  assert.equal(await expanded(page), "false", "manual collapse stays after reload");
  await warmup.locator(".workout-warmup-toggle").click();
  await settle(page);
  await page.reload({ waitUntil: "networkidle" });
  await openActive(page);
  assert.equal(await expanded(page), "true", "an open unfinished warm-up is restored after reload");
  assert.equal(await generalStep.getAttribute("aria-checked"), "true");

  // Rapid taps on one step still end in one clean state.
  const firstRamp = warmup.locator(".warmup-ramp .warmup-check-row").first();
  for (let index = 0; index < 5; index += 1) await firstRamp.click({ delay: 0 });
  assert.equal(await firstRamp.getAttribute("aria-checked"), "true");
  for (const step of await warmup.locator('.warmup-check-row[aria-checked="false"]').all()) await step.click();
  assert.equal(await expanded(page), "true", "the last check keeps the list open");
  assert.equal(await warmup.locator(".warmup-skip").count(), 0);
  await warmup.getByRole("button", { name: "Continue to workout" }).waitFor();
  await settle(page);
  await page.screenshot({ path: output("01-all-checked-dark-393.png") });
  const exercisesBefore = (await saved(page)).exercises;
  await page.locator(".workout-screen").evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await warmup.getByRole("button", { name: "Continue to workout" }).click();
  await warmup.locator(".warmup-details").waitFor({ state: "detached" });
  await settle(page);
  assert.equal(await warmup.locator(".workout-warmup-toggle").innerText(), "✓Warm-up complete");
  assert.equal(await headingBelowHeader(page), true, "the current exercise stays visible below the header");
  assert.equal((await saved(page)).warmup.stages[0].completed, true);
  assert.deepEqual((await saved(page)).exercises, exercisesBefore, "working sets stay untouched");
  assert.equal(await warmup.locator(".workout-warmup-toggle").evaluate((button) => button === document.activeElement), true);
  await page.screenshot({ path: output("02-complete-dark-393.png") });

  // The first working set still logs and starts rest as before.
  await page.locator(".set-row button[data-workout-complete]").first().click();
  await page.locator(".rest-timer").waitFor();
  const afterSet = await saved(page);
  assert.equal(afterSet.exercises[0].sets[0].completed, true);
  assert.ok(afterSet.rest?.endsAt, "rest timer runs after the first working set");
  assert.equal(afterSet.warmup.stages[0].completed, true);

  await goToExercise(page, "Chest Supported Row");
  assert.equal(await expanded(page), "false");
  await page.locator(".workout-warmup-toggle").click();
  assert.equal(await page.locator(".workout-warmup .warmup-checklist-section").count(), 0);
  assert.equal(await page.locator(".workout-warmup").getByText(/^Warm-up sets$/).count(), 1);
  await settle(page);
  await page.screenshot({ path: output("03-second-exercise-ramp-dark-393.png") });

  await goToExercise(page, "Leg Press");
  assert.equal(await page.locator(".workout-warmup").count(), 0, "no warm-up, no card");
  assert.equal(await page.getByRole("heading", { name: exerciseCatalog["leg-press"].name }).count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
}

// 2. Skip from the bar, narrow light theme.
{
  const { context, page, errors } = await newPage({ width: 320, height: 700, colorScheme: "light" });
  assert.equal(await expanded(page), "true");
  assert.ok((await page.locator(".warmup-check-row").count()) > 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "open warm-up fits 320 px");
  const skip = await page.locator(".warmup-skip").boundingBox();
  assert.ok(skip && skip.y + skip.height <= 700 && skip.x + skip.width <= 320, "Skip is on screen without scrolling");
  await page.screenshot({ path: output("04-open-light-320.png") });
  await page.locator(".warmup-skip").click();
  await page.locator(".workout-warmup-toggle").getByText("Warm-up skipped").waitFor();
  await settle(page);
  assert.equal(await page.locator(".exercise-heading-art-button").count(), 1);
  await page.screenshot({ path: output("05-skipped-light-320.png") });
  await page.reload({ waitUntil: "networkidle" });
  await openActive(page);
  assert.equal(await expanded(page), "false", "skipped warm-ups stay collapsed");
  assert.deepEqual(errors, []);
  await context.close();
}

// 3. Narrow dark and wide light screenshots of the open first warm-up.
for (const [width, colorScheme] of [[320, "dark"], [393, "light"]]) {
  const { context, page, errors } = await newPage({ width, colorScheme });
  assert.equal(await expanded(page), "true");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: output(`06-open-${colorScheme}-${width}.png`) });
  assert.deepEqual(errors, []);
  await context.close();
}

// 4. Reduced motion: no keyframes, and exit settles at once.
{
  const { context, page, errors } = await newPage({ width: 390, colorScheme: "dark", reducedMotion: "reduce" });
  assert.equal(await expanded(page), "true");
  const row = page.locator(".warmup-check-row").first();
  await row.click();
  assert.equal(await row.evaluate((node) => getComputedStyle(node.querySelector("i")).animationName), "none");
  await page.getByRole("button", { name: "Skip remaining" }).last().click();
  assert.equal(await page.locator(".warmup-details").count(), 0);
  assert.match(await page.locator(".workout-warmup-toggle").innerText(), /Remaining steps skipped/);
  await page.screenshot({ path: output("reduced-motion-settled.png") });
  assert.deepEqual(errors, []);
  await context.close();
}

// 5. A started workout does not reopen the first warm-up.
{
  const state = fixture();
  state.activeWorkout.exercises[0].sets[0].completed = true;
  state.activeWorkout.exercises[0].sets[0].reps = 8;
  const { context, page, errors } = await newPage({ width: 390, colorScheme: "light", state });
  assert.equal(await expanded(page), "false");
  assert.deepEqual(errors, []);
  await context.close();
}

// 6. Premium theme.
{
  const state = fixture();
  state.profile.themePreference = "premium";
  const { context, page, errors } = await newPage({ width: 390, colorScheme: "dark", state });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "premium");
  assert.equal(await expanded(page), "true");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: output("07-open-premium.png") });
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log(
  "Warm-up sequencing QA passed: the first warm-up opens on first paint before any working set, manual collapse survives exercise changes and reloads, an unfinished open warm-up is restored, later and finished warm-ups stay collapsed, Skip stays in the bar, and the exercise stays visible after Continue at 320 and 393 px.",
);
