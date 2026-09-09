import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";
import { deserializeState } from "../src/domain.js";
import { openProfileArea } from "./qa-current-navigation.mjs";

const phase = process.env.ROOK_PERF_PHASE || "after";
const appUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const root = "artifacts/ROOK-BASELINE-CORRECTION-REVIEW";
await mkdir(`${root}/screenshots`, { recursive: true });
await mkdir(`${root}/traces`, { recursive: true });

function realisticState() {
  const state = createReturningUserFixture(3);
  state.activeWorkout = null;
  state.profile.recommendedWarmupsEnabled = true;
  state.profile.rampUpSetsEnabled = true;
  state.profile.appearancePreference = "light";
  state.profile.stylePreference = "standard";
  state.profile.themePreference = "light";
  return state;
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
  reducedMotion: "no-preference",
});
const state = realisticState();
assert.equal(deserializeState(state).profile.onboardingComplete, true, "performance fixture remains loadable");
await context.addInitScript((fixture) => {
  localStorage.setItem("lift-v2-state", JSON.stringify(fixture));
  window.__rookPerf = { clones: [], storageWrites: [], longTasks: [] };
  const nativeClone = window.structuredClone.bind(window);
  window.structuredClone = (value, options) => {
    const started = performance.now();
    const result = nativeClone(value, options);
    window.__rookPerf.clones.push({ duration: performance.now() - started });
    return result;
  };
  const nativeSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === "lift-v2-state")
      window.__rookPerf.storageWrites.push({ time: performance.now(), bytes: String(value).length });
    return nativeSetItem.call(this, key, value);
  };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      window.__rookPerf.longTasks.push({ start: entry.startTime, duration: entry.duration });
  }).observe({ type: "longtask", buffered: true });
}, state);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
await page.route("**/api/ai/status", (route) => route.fulfill({ json: { available: false } }));

await page.goto(appUrl, { waitUntil: "networkidle" });
if (!(await page.getByRole("button", { name: "PROFILE", exact: true }).count())) {
  throw new Error(`Profile navigation unavailable. Errors: ${JSON.stringify(errors)} Body: ${await page.locator("body").innerText()}`);
}
await page.getByRole("button", { name: "PROFILE", exact: true }).click();
await openProfileArea(page, "program");
const cdp = await context.newCDPSession(page);
await cdp.send("Tracing.start", {
  categories: "devtools.timeline,blink.user_timing",
  transferMode: "ReturnAsStream",
});

const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const reset = () => page.evaluate(() => { window.__rookPerf.clones = []; window.__rookPerf.storageWrites = []; window.__rookPerf.longTasks = []; });
const snapshot = async (name, duration) => {
  const instrumentation = await page.evaluate(() => structuredClone(window.__rookPerf));
  return {
    name,
    duration,
    cloneCount: instrumentation.clones.length,
    cloneDuration: instrumentation.clones.reduce((total, entry) => total + entry.duration, 0),
    storageWrites: instrumentation.storageWrites.length,
    longTasks: instrumentation.longTasks,
  };
};
const measure = async (name, action) => {
  await reset();
  const started = performance.now();
  await action();
  await settle();
  return snapshot(name, performance.now() - started);
};

const metrics = [];
metrics.push(await measure("open", async () => {
  await page.getByRole("button", { name: /^Edit plan/ }).click();
  await page.getByRole("heading", { name: "Edit your plan", exact: true }).waitFor();
}));
const exerciseCount = state.program.days.reduce((total, day) => total + day.exercises.length, 0);
assert.equal(await page.locator(".plan-editor-exercise").count(), exerciseCount);
assert.equal(await page.locator(".plan-editor-fields").count(), 0, "collapsed exercise details are not kept mounted");
await page.screenshot({ path: `${root}/screenshots/edit-plan-${phase}.png`, animations: "disabled" });

const first = page.locator(".plan-editor-exercise").first();
metrics.push(await measure("expand", async () => {
  await first.locator(".plan-editor-summary").click();
  await first.locator(".plan-editor-summary").getAttribute("aria-expanded").then((value) => assert.equal(value, "true"));
}));
assert.equal(await page.locator(".plan-editor-fields").count(), 1, "only the expanded exercise mounts its editor fields");
const sets = first.getByRole("textbox", { name: /^Sets for/ });
metrics.push(await measure("sets-commit", async () => {
  await sets.fill("4");
  await sets.press("Tab");
  await page.waitForFunction(() => document.querySelector('.plan-editor-exercise input[aria-label^="Sets for"]')?.value === "4");
}));
assert.equal(metrics.at(-1).storageWrites, 0, "draft prescription edits do not persist");
const minReps = first.getByRole("textbox", { name: /^Minimum / });
metrics.push(await measure("reps-commit", async () => {
  await minReps.fill("7");
  await minReps.press("Tab");
}));
assert.equal(metrics.at(-1).storageWrites, 0, "draft rep edits do not persist");

metrics.push(await measure("collapse", async () => {
  await first.locator(".plan-editor-summary").click();
}));
metrics.push(await measure("scroll", async () => {
  await page.locator(".edit-plan-screen").evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
  });
}));

if (phase !== "before") {
  for (const name of ["expand", "sets-commit", "reps-commit", "collapse"]) {
    const result = metrics.find((entry) => entry.name === name);
    assert.ok(result.duration < 1500, `${name} remains inside the deliberately broad local interaction envelope`);
  }
  assert.equal(metrics.find((entry) => entry.name === "sets-commit").storageWrites, 0);
  assert.equal(metrics.find((entry) => entry.name === "reps-commit").storageWrites, 0);
}

const tracingComplete = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
await cdp.send("Tracing.end");
const { stream } = await tracingComplete;
let trace = "";
for (;;) {
  const chunk = await cdp.send("IO.read", { handle: stream });
  trace += chunk.data;
  if (chunk.eof) break;
}
await cdp.send("IO.close", { handle: stream });
await writeFile(`${root}/traces/edit-plan-${phase}-trace.json`, trace);
await writeFile(`${root}/traces/edit-plan-${phase}-metrics.json`, JSON.stringify({ phase, plan: { days: state.program.days.length, exercises: exerciseCount }, metrics }, null, 2));
assert.deepEqual(errors, []);
await context.close();
await browser.close();
console.log(JSON.stringify({ phase, metrics }, null, 2));
