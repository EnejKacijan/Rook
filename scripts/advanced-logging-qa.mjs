import assert from "node:assert/strict";
import { verifyLongContent } from './post-review-runtime-checks.mjs';
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { blankState, buildProgram, isoDay, startWorkout, weekday, WEEKDAYS } from "../src/domain.js";

const artifactRoot = new URL("../artifacts/advanced-logging/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });

function fixture({ kind = "standard", perSide = false, appearance = "light", style = "standard", longName = false } = {}) {
  const state = blankState();
  const today = weekday();
  state.profile = { ...state.profile, goal: "Build muscle", experience: "Intermediate", daysPerWeek: 2, availableDays: [today, WEEKDAYS[(WEEKDAYS.indexOf(today) + 3) % 7]], sessionMinutes: 60, environment: "Commercial gym", equipment: ["full gym"], priorities: ["Balanced"], onboardingComplete: true, appearancePreference: appearance, stylePreference: style, themePreference: style === "premium" ? "premium" : appearance, rirEnabled: true };
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.ai.planUpgradeDismissed = true;
  const template = state.program.days.find((day) => day.weekday === today);
  if (longName) template.exercises[0].importedName = "Single-Arm Supported Incline Cable Press With Long Range Of Motion";
  template.exercises[0].loggingMode = perSide ? "per_side" : "normal";
  template.exercises[0].sets = template.exercises[0].sets.slice(0, 3);
  if (kind !== "standard") template.exercises[0].sets[1].setType = kind;
  if (kind === "drop") template.exercises[0].sets[1].segments = [{ id: "drop-1", weight: 32.5, reps: 10 }, { id: "drop-2", weight: 25, reps: 12 }];
  if (kind === "rest_pause") template.exercises[0].sets[1].segments = [{ id: "pause-1", weight: 40, reps: 4 }, { id: "pause-2", weight: 40, reps: 3 }];
  state.activeWorkout = startWorkout(state, template);
  state.activeWorkout.exerciseIndex = 0;
  state.activeWorkout.exercises = state.activeWorkout.exercises.slice(0, 2);
  state.activeWorkout.exercises[0].sets.forEach((set) => { set.weight = 40; set.rir = 1; });
  if (perSide) state.activeWorkout.exercises[0].sets.forEach((set) => { set.sides = { left: { reps: 10 }, right: { reps: 9 } }; set.reps = 9; });
  return state;
}

async function open(state, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, colorScheme: state.profile.appearancePreference, serviceWorkers: "block" });
  await context.addInitScript((value) => {
    if (!sessionStorage.getItem("rook-advanced-logging-fixture")) {
      localStorage.setItem("lift-v2-state", JSON.stringify(value));
      sessionStorage.setItem("rook-advanced-logging-fixture", "loaded");
    }
  }, state);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/**", (route) => route.request().url().includes("/api/ai/status") ? route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false}' }) : route.abort());
  await page.goto(`${baseUrl}/?advanced-logging=${Date.now()}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "RESUME WORKOUT" }).click();
  return { context, page, errors };
}

async function capture(name, state, viewport = { width: 390, height: 844 }) {
  const run = await open(state, viewport);
  await verifyLongContent(run.page, name);
  await run.page.waitForTimeout(250);
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} overflow`);
  await run.page.screenshot({ path: output(`${name}.png`), fullPage: false });
  assert.deepEqual(run.errors, [], `${name}: ${run.errors.join("; ")}`);
  await run.context.close();
}

await capture("01-normal-unchanged", fixture());
await capture("02-amrap", fixture({ kind: "amrap" }));
await capture("03-drop-set", fixture({ kind: "drop" }));
await capture("04-rest-pause", fixture({ kind: "rest_pause" }));
await capture("05-unilateral", fixture({ perSide: true }));
await capture("06-unilateral-320", fixture({ perSide: true, longName: true }), { width: 320, height: 700 });
await capture("07-premium-drop", fixture({ kind: "drop", appearance: "dark", style: "premium" }));

const reload = await open(fixture({ perSide: true }));
await reload.page.getByLabel("right reps for set 1", { exact: true }).fill("8");
await reload.page.reload({ waitUntil: "networkidle" });
await reload.page.getByRole("button", { name: "RESUME WORKOUT" }).click();
assert.equal(await reload.page.getByLabel("right reps for set 1", { exact: true }).inputValue(), "8", "per-side value survives reload");
assert.deepEqual(reload.errors, []);
await reload.context.close();

await browser.close();
console.log("Advanced logging QA passed: unchanged standard workout, AMRAP, drop, rest-pause, unilateral reload, 320px, long name, and Premium.");
