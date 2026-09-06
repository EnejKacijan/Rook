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

const artifactRoot = new URL("../artifacts/smart-substitutions/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function fixture({
  sourceId = "back-squat",
  appearance = "light",
  style = "standard",
  custom = false,
  temporaryGym = false,
  preferredId = null,
  superset = false,
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
  state.gymProfiles.push({
    schemaVersion: 1,
    id: "gym-travel",
    name: "Travel Gym",
    equipment: ["dumbbells"],
    createdAt: "2026-09-05T12:00:00.000Z",
    updatedAt: "2026-09-05T12:00:00.000Z",
  });
  state.activeWorkout = startWorkout(state, template);
  state.activeWorkout.exercises = state.activeWorkout.exercises.slice(0, 2);
  state.activeWorkout.exercises[1] = {
    ...state.activeWorkout.exercises[1],
    exerciseId: "lat-pulldown",
    sets: structuredClone(state.activeWorkout.exercises[0].sets),
  };
  if (custom) {
    state.activeWorkout.exercises[0] = {
      ...state.activeWorkout.exercises[0],
      exerciseId: "custom-press-no-metadata",
      exerciseSource: "imported-custom",
      importedName: "My Custom Press Without Complete Metadata",
      originalImportedName: "My Custom Press Without Complete Metadata",
      importedExercise: {
        id: "custom-press-no-metadata",
        name: "My Custom Press Without Complete Metadata",
        source: "imported",
        pattern: null,
        muscles: null,
        equipment: null,
      },
      matchStatus: "confirmed-custom",
    };
  }
  state.activeWorkout.exerciseIndex = 0;
  state.activeWorkout.exercises[0].sets.forEach((set, index) => {
    set.weight = 80 + index * 2.5;
  });
  if (temporaryGym) {
    state.activeWorkout.adjustment = {
      mode: "different-equipment",
      temporaryEquipment: ["dumbbells"],
      gymProfileId: "gym-travel",
      gymProfileName: "Travel Gym",
    };
  }
  if (preferredId) {
    state.substitutionPreferences = [{
      schemaVersion: 1,
      id: "sub-preferred",
      sourceExerciseId: sourceId,
      replacementExerciseId: preferredId,
      gymProfileId: temporaryGym ? "gym-travel" : null,
      createdAt: "2026-09-05T12:00:00.000Z",
      updatedAt: "2026-09-05T12:00:00.000Z",
    }];
  }
  if (superset) {
    state.activeWorkout.exercises[0].supersetId = "pair-qa";
    state.activeWorkout.exercises[1].supersetId = "pair-qa";
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
    if (!sessionStorage.getItem("rook-smart-substitution-fixture")) {
      localStorage.setItem("lift-v2-state", JSON.stringify(value));
      sessionStorage.setItem("rook-smart-substitution-fixture", "loaded");
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
  await page.goto(`${baseUrl}/?smart-substitutions=${Date.now()}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "RESUME WORKOUT" }).click();
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(350); // Measure the settled sheet, not its entrance animation.
  return { context, page, errors };
}

async function screenshotState(name, state, viewport, action) {
  const run = await open(state, viewport);
  if (action) await action(run.page);
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} has no horizontal overflow`);
  const sheetGeometry = await run.page.locator(".replace-sheet").evaluate((node) => ({ scrollLeft: node.scrollLeft, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, children: [...node.children].map((child) => ({ cls: child.className, width: child.getBoundingClientRect().width, scrollWidth: child.scrollWidth, clientWidth: child.clientWidth })) }));
  assert.equal(sheetGeometry.scrollLeft, 0, `${name} keeps the sheet horizontally anchored: ${JSON.stringify(sheetGeometry)}`);
  await run.page.screenshot({ path: output(`${name}.png`), fullPage: false });
  assert.deepEqual(run.errors, [], `${name} console errors: ${run.errors.join("; ")}`);
  await run.context.close();
}

await screenshotState("390-normal-recommendations", fixture(), { width: 390, height: 844 });
await screenshotState('320-initial-unscrolled', fixture(), { width: 320, height: 700 }, async page => {
  const title = page.getByRole('heading', { name: 'Replace Back Squat', exact: true });
  await title.waitFor();
  const bounds = await title.boundingBox();
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height < 700, 'initial replacement target is visible');
  assert.equal(await page.locator('.sheet-scroll').evaluate(el => el.scrollTop), 0);
});
for (const appearance of ['light', 'dark']) for (const style of ['standard', 'premium']) {
  await screenshotState(`390-clear-${style}-${appearance}`, fixture({ appearance, style }), { width: 390, height: 844 }, async page => {
    await page.getByRole('button', { name: 'Choose another exercise' }).click();
    const field = page.getByRole('searchbox');
    const before = await field.boundingBox();
    await field.fill('Cable');
    const clear = page.getByRole('button', { name: 'Clear search', exact: true });
    assert.equal(await clear.count(), 1);
    assert.deepEqual(await field.boundingBox(), before, 'typing and clear affordance preserve input size');
    await field.press('Tab');
    assert.equal(await clear.evaluate(el => el === document.activeElement), true);
    assert.notEqual(await clear.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    await clear.press('Enter');
    assert.equal(await field.inputValue(), '');
    assert.equal(await field.evaluate(el => el === document.activeElement), true);
    await field.fill('Cable');
  });
}
await screenshotState("390-many-recommendations", fixture(), { width: 390, height: 844 }, async (page) => {
  await page.getByRole("button", { name: "More suggestions" }).click();
  await page.waitForTimeout(250);
  const count = await page.locator(".replace-sheet .choice-row").count();
  assert.ok(count > 3, `${count}: ${await page.locator(".replace-sheet").innerText()}`);
});
await screenshotState("320-densest-recommendations", fixture(), { width: 320, height: 700 }, async (page) => {
  await page.getByRole("button", { name: "More suggestions" }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".sheet-scroll").evaluate((node) => node.scrollHeight > node.clientHeight), true);
});
await screenshotState("390-no-valid-recommendation", fixture({ custom: true }), { width: 390, height: 844 }, async (page) => {
  await page.getByText("not enough compatible exercise metadata", { exact: false }).waitFor();
});
await screenshotState("390-manual-search", fixture({ custom: true }), { width: 390, height: 844 }, async (page) => {
  await page.getByRole("button", { name: "Choose another exercise" }).click();
  await page.getByRole("searchbox").fill("Dumbbell Bench Press");
});
await screenshotState("390-preferred-replacement", fixture({ preferredId: "front-squat" }), { width: 390, height: 844 }, async (page) => {
  assert.equal(await page.locator(".choice-row").first().locator("strong").innerText(), "Front Squat");
  assert.equal(await page.locator(".choice-row").first().locator("small").innerText(), "Preferred replacement");
});
await screenshotState("390-different-gym", fixture({ temporaryGym: true }), { width: 390, height: 844 }, async (page) => {
  assert.match(await page.locator(".substitution-preference-toggle small").innerText(), /Travel Gym/);
  const choices = await page.locator(".choice-row strong").allInnerTexts();
  assert.ok(choices.every((name) => !/Barbell|Machine|Hack|Leg Press|Belt/.test(name)), choices.join(" | "));
});
await screenshotState("390-custom-exercise", fixture({ custom: true }), { width: 390, height: 844 });
await screenshotState("390-superset-replacement", fixture({ superset: true }), { width: 390, height: 844 });

for (const [appearance, style, label] of [
  ["light", "standard", "standard-light"],
  ["dark", "standard", "standard-dark"],
  ["light", "premium", "premium-light"],
  ["dark", "premium", "premium-dark"],
]) {
  await screenshotState(`390-${label}`, fixture({ appearance, style, preferredId: "front-squat" }), { width: 390, height: 844 });
}
await screenshotState("430-main", fixture({ preferredId: "front-squat" }), { width: 430, height: 900 });

const runtimeState = fixture({ superset: true });
const runtime = await open(runtimeState);
const page = runtime.page;
const programBefore = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("lift-v2-state")).program));
const source = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")).activeWorkout.exercises[0]);
await page.getByRole("button", { name: "Prefer my choice" }).click();
const chosenName = await page.locator(".replace-sheet .choice-row").first().locator("strong").innerText();
await page.locator(".replace-sheet .choice-row").first().click();
let stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
assert.equal(JSON.stringify(stored.program), programBefore, "workout replacement never mutates the permanent plan");
assert.equal(stored.activeWorkout.exercises[0].supersetId, "pair-qa", "compatible superset membership is preserved");
assert.equal(stored.activeWorkout.exercises[1].supersetId, "pair-qa");
assert.ok(stored.activeWorkout.exercises[0].sets.every((set) => set.weight === null), "old load is not transferred");
assert.ok(stored.activeWorkout.exercises[0].sets.every((set) => set.completed === false));
assert.ok(stored.substitutionPreferences.some((item) => item.sourceExerciseId === source.exerciseId), "preference is stored only after explicit opt-in");
await page.reload({ waitUntil: "networkidle" });
stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
assert.ok(stored.substitutionPreferences.some((item) => item.sourceExerciseId === source.exerciseId), "preference survives reload");
assert.equal(JSON.stringify(stored.program), programBefore);
assert.ok(chosenName);
assert.deepEqual(runtime.errors, []);
await runtime.context.close();

const offline = await open(fixture());
await offline.context.setOffline(true);
await offline.page.getByRole("button", { name: "More suggestions" }).click();
await offline.page.waitForTimeout(250);
assert.ok(await offline.page.locator(".replace-sheet .choice-row").count() > 3, "local ranking works offline");
await offline.context.setOffline(false);
assert.deepEqual(offline.errors, []);
await offline.context.close();

await browser.close();
console.log("Smart Substitutions QA passed: visual matrix, shared local ranking, explicit durable preferences, gym filtering, manual fallback, session-only replacement, load reset, superset preservation, narrow layout, themes, and offline use.");
