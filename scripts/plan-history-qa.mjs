import assert from "node:assert/strict";
import { verifyLongContent } from './post-review-runtime-checks.mjs';
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import { addPlanVersion, normalizePlanHistoryState } from "../src/planHistory.js";

const artifactRoot = new URL("../artifacts/plan-history/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function fixture({ appearance = "light", style = "standard", initialOnly = false, many = true } = {}) {
  const state = createReturningUserFixture(3);
  state.activeWorkout = null;
  state.activeOptionalSession = null;
  state.todayAdaptation = null;
  state.profile.appearancePreference = appearance;
  state.profile.stylePreference = style;
  state.profile.themePreference = style === "premium" ? "premium" : appearance;
  state.planVersions = [];
  state.program.createdAt = "2026-08-30T09:00:00.000Z";
  normalizePlanHistoryState(state, "2026-08-30T09:00:00.000Z");
  if (initialOnly) return state;

  let before = structuredClone(state.program);
  state.program.days[1].name = "Lower B";
  state.program.days[1].nameEdited = true;
  state.program.days[1].exercises[0].sets.push({
    id: "history-added-set",
    weight: null,
    reps: 8,
    completed: false,
    rir: null,
  });
  addPlanVersion(state, {
    source: "Manual edit",
    previousProgram: before,
    timestamp: "2026-09-02T17:20:00.000Z",
    id: "history-simple",
    summary: "Changed Lower B",
  });

  before = structuredClone(state.program);
  const firstDay = state.program.days[0];
  firstDay.name = "Upper Body Strength and Shoulder Stability Session";
  firstDay.nameEdited = true;
  firstDay.exercises[0].sets = firstDay.exercises[0].sets.slice(0, 2);
  firstDay.exercises[0].repMin = 5;
  firstDay.exercises[0].repMax = 8;
  firstDay.exercises[0].targetRir = 3;
  firstDay.exercises[1].sets.push({
    id: "history-complex-set",
    weight: null,
    reps: 10,
    completed: false,
    rir: null,
  });
  addPlanVersion(state, {
    source: "Coach",
    reason: "Reduced fatigue while preserving the plan’s required movement coverage",
    previousProgram: before,
    timestamp: "2026-09-05T08:45:00.000Z",
    id: "history-complex",
    summary: "Reduced upper-body fatigue",
  });

  if (many) {
    for (let index = 0; index < 9; index += 1) {
      before = structuredClone(state.program);
      state.program.days[2].exercises[0].targetRir = index % 4;
      addPlanVersion(state, {
        source: index % 2 ? "Manual edit" : "ROOK plan update",
        previousProgram: before,
        timestamp: new Date(Date.UTC(2026, 8, 5, 9, index)).toISOString(),
        id: `history-many-${index}`,
        summary: index === 8 ? "Updated Lower Day Performance Focus" : `Refined training targets ${index + 1}`,
      });
    }
  }
  state.todayAdaptation = { id: "today-stale", programDayId: "missing-day", date: "2026-09-05" };
  state.weekScheduleOverrides = { "2026-09-01": { missing: "2026-09-06" } };
  return state;
}

async function open(state, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({
    viewport,
    colorScheme: state.profile.appearancePreference === "dark" ? "dark" : "light",
    serviceWorkers: "block",
  });
  await context.addInitScript((value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)), state);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/ai/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false}' }));
  await page.goto(`${baseUrl}/?plan-history=${Date.now()}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await page.getByRole("button", { name: /Plan history/ }).click();
  await page.getByRole("heading", { name: "Plan versions" }).waitFor();
  return { context, page, errors };
}

async function capture(name, state, viewport, action) {
  const run = await open(state, viewport);
  if (action) await action(run.page);
  await verifyLongContent(run.page, name);
  await run.page.waitForTimeout(250);
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: no horizontal overflow`);
  assert.deepEqual(run.errors, [], `${name}: ${run.errors.join("; ")}`);
  await run.page.screenshot({ path: output(`${name}.png`), fullPage: false });
  await run.context.close();
}

const core = fixture();
await capture("390-version-list-many", core, { width: 390, height: 844 });
await capture("390-initial-version", core, { width: 390, height: 844 }, async (page) => {
  await page.getByRole("button", { name: /Initial training plan/ }).click();
  await page.getByText("Starting plan", { exact: true }).waitFor();
});
await capture("390-simple-diff", core, { width: 390, height: 844 }, async (page) => {
  await page.getByRole("button", { name: /Changed Lower B/ }).click();
  await page.getByText(/Sets changed/).waitFor();
});
await capture("390-complex-diff", core, { width: 390, height: 844 }, async (page) => {
  await page.getByRole("button", { name: /Reduced upper-body fatigue/ }).click();
  await page.getByText(/RIR changed/).waitFor();
});
await capture("320-complex-diff", core, { width: 320, height: 700 }, async (page) => {
  await page.getByRole("button", { name: /Reduced upper-body fatigue/ }).click();
});
await capture("390-restore-confirmation", core, { width: 390, height: 844 }, async (page) => {
  await page.getByRole("button", { name: /Changed Lower B/ }).click();
  await page.getByRole("button", { name: "RESTORE THIS VERSION" }).click();
  await page.getByRole("heading", { name: "Restore this version?" }).waitFor();
  await page.getByText(/Today’s unstarted adjustment/).waitFor();
  await page.getByText(/Temporary schedule references/).waitFor();
});

const restored = await open(core);
const beforeCount = core.planVersions.length;
await restored.page.getByRole("button", { name: /Changed Lower B/ }).click();
await restored.page.getByRole("button", { name: "RESTORE THIS VERSION" }).click();
await restored.page.getByRole("button", { name: "RESTORE VERSION" }).click();
await restored.page.getByText(/Previous version restored/).waitFor();
await restored.page.waitForTimeout(100);
const saved = await restored.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
assert.equal(saved.planVersions.length, beforeCount + 1, "restore creates a new current version");
assert.equal(saved.planVersions.at(-1).source, "Restored version");
assert.equal(saved.todayAdaptation, null, "restore clears the stale unstarted Today adjustment");
assert.equal(Object.keys(saved.weekScheduleOverrides).length, 0, "restore prunes stale Flexible Week references");
await restored.page.screenshot({ path: output("390-restored-state.png"), fullPage: false });
assert.deepEqual(restored.errors, []);
await restored.context.close();

await capture("390-initial-only", fixture({ initialOnly: true }), { width: 390, height: 844 });
await capture("430-version-list", core, { width: 430, height: 900 });

for (const [appearance, style, label] of [
  ["light", "standard", "standard-light"],
  ["dark", "standard", "standard-dark"],
  ["light", "premium", "premium-light"],
  ["dark", "premium", "premium-dark"],
]) {
  const themed = fixture({ appearance, style, many: false });
  await capture(`390-${label}-list`, themed, { width: 390, height: 844 });
  await capture(`390-${label}-complex`, themed, { width: 390, height: 844 }, async (page) => {
    await page.getByRole("button", { name: /Reduced upper-body fatigue/ }).click();
  });
}

const manual = await open(fixture({ initialOnly: true }));
await manual.page.getByRole("button", { name: "Close Plan history" }).click();
await manual.page.getByRole("button", { name: /Edit plan/ }).click();
await manual.page.locator(".workout-name-field input").first().fill("Updated Lower Strength Day");
await manual.page.getByRole("button", { name: "SAVE CHANGES" }).click();
await manual.page.getByRole("button", { name: /Plan history/ }).click();
await manual.page.getByText("2 saved versions", { exact: true }).waitFor().catch(() => {});
const manualSaved = await manual.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
assert.equal(manualSaved.planVersions.length, 2, "a real manual plan edit creates a version");
await manual.context.close();

await browser.close();
console.log("Plan History QA passed: initial/manual/Coach versions, simple and complex diffs, restore-as-new-version, stale temporary reconciliation, long names, retention list, 320/390/430 widths, and four themes.");
