import { openProfileArea } from './qa-current-navigation.mjs';
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { blankState, buildProgram, isoDay, weekday, WEEKDAYS } from "../src/domain.js";
import { normalizeGymProfilesState } from "../src/gymProfiles.js";

const artifactRoot = new URL("../artifacts/gym-profiles/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function fixture({ gyms = "one", longName = false, migrated = false, appearance = "light", style = "standard" } = {}) {
  const state = blankState();
  const today = weekday();
  state.profile = {
    ...state.profile,
    id: "qa-profile",
    name: "Alex",
    goal: "Build muscle",
    experience: "Intermediate",
    ageRange: "25–39",
    daysPerWeek: 4,
    availableDays: [today, ...WEEKDAYS.filter((day) => day !== today).slice(0, 3)],
    sessionMinutes: 75,
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
  if (!migrated) {
    state.gymProfiles = [{
      schemaVersion: 1,
      id: "gym-main",
      name: longName ? "Metropolitan Strength and Conditioning Performance Center" : "Main Gym",
      equipment: ["full gym"],
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    }];
    state.defaultGymProfileId = "gym-main";
    if (gyms === "many") state.gymProfiles.push(
      {
        schemaVersion: 1,
        id: "gym-home",
        name: "Home",
        equipment: ["dumbbells", "resistance bands", "bodyweight only"],
        createdAt: "2026-09-02T10:00:00.000Z",
        updatedAt: "2026-09-02T10:00:00.000Z",
      },
      {
        schemaVersion: 1,
        id: "gym-hotel",
        name: "Hotel",
        equipment: ["bodyweight only"],
        createdAt: "2026-09-03T10:00:00.000Z",
        updatedAt: "2026-09-03T10:00:00.000Z",
      },
    );
  }
  normalizeGymProfilesState(state, "2026-09-05T10:00:00.000Z");
  return state;
}

async function open(state, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block", colorScheme: state.profile.appearancePreference });
  await context.addInitScript((value) => {
    if (!sessionStorage.getItem("rook-gym-profiles-fixture")) {
      localStorage.setItem("lift-v2-state", JSON.stringify(value));
      sessionStorage.setItem("rook-gym-profiles-fixture", "loaded");
    }
  }, state);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("ERR_INTERNET_DISCONNECTED"))
      errors.push(message.text());
  });
  await page.route("**/api/**", (route) => route.abort("internetdisconnected"));
  await page.goto(`${baseUrl}/?gym-profiles=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "PROFILE", exact: true }).waitFor();
  await context.setOffline(true);
  return { context, page, errors };
}

async function assertLayout(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}: no horizontal overflow`);
  const headings = page.locator("h1");
  if (await headings.count()) {
    const box = await headings.first().boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1, `${label}: heading fits`);
  }
}

async function openGymSettings(page) {
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await openProfileArea(page, 'training'); await page.getByRole("button", { name: /Gym profiles/ }).click();
  await page.getByRole("heading", { name: "Your training environments" }).waitFor();
  await page.waitForTimeout(250);
}

async function captureSettingsRow() {
  const run = await open(fixture());
  await run.page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await openProfileArea(run.page, 'training'); await run.page.getByRole("button", { name: /Gym profiles/ }).waitFor();
  await run.page.screenshot({ path: output("01-settings-row.png"), fullPage: true });
  await assertLayout(run.page, "settings row");
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

async function captureOneGym() {
  const run = await open(fixture());
  await openGymSettings(run.page);
  await run.page.screenshot({ path: output("02-one-gym.png") });
  assert.equal(await run.page.locator(".gym-profile-row").count(), 1);
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

async function captureManyGyms() {
  const run = await open(fixture({ gyms: "many" }));
  await openGymSettings(run.page);
  await run.page.screenshot({ path: output("03-multiple-gyms.png") });
  assert.equal(await run.page.locator(".gym-profile-row").count(), 3);
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

async function captureCreateAndPicker() {
  const run = await open(fixture());
  await openGymSettings(run.page);
  await run.page.getByRole("button", { name: "ADD GYM" }).click();
  await run.page.screenshot({ path: output("04-create.png") });
  await run.page.getByRole("button", { name: "Dumbbells", exact: true }).click();
  await run.page.getByRole("button", { name: "Cables", exact: true }).click();
  await run.page.locator(".gym-profile-editor").evaluate((element) => element.scrollTo(0, 0));
  await run.page.screenshot({ path: output("06-equipment-picker.png") });
  await assertLayout(run.page, "equipment picker");
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

async function captureEditDefaultAndDelete() {
  const run = await open(fixture({ gyms: "many" }));
  await openGymSettings(run.page);
  await run.page.getByRole("button", { name: /^Home/ }).click();
  await run.page.screenshot({ path: output("05-edit.png") });
  await run.page.getByRole("button", { name: /Use as default gym/ }).click();
  await run.page.getByRole("button", { name: "SAVE GYM" }).scrollIntoViewIfNeeded();
  await run.page.waitForTimeout(250);
  await run.page.screenshot({ path: output("07-set-default.png") });
  await run.page.getByRole("button", { name: "DELETE GYM" }).click();
  await run.page.locator(".gym-delete-confirm").scrollIntoViewIfNeeded();
  await run.page.waitForTimeout(250);
  await run.page.screenshot({ path: output("08-delete-confirmation.png") });
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

async function captureAdjustPicker() {
  const run = await open(fixture({ gyms: "many" }));
  await run.page.getByRole("button", { name: "ADJUST TODAY", exact: true }).click();
  await run.page.getByRole("button", { name: /^Different equipment/ }).click();
  await run.page.getByRole("heading", { name: "Where are you training?" }).waitFor();
  await run.page.waitForTimeout(250);
  await run.page.screenshot({ path: output("09-adjust-saved-gym.png") });
  assert.equal(await run.page.locator(".adjust-saved-gyms button").count(), 3);
  await run.page.locator(".adjust-saved-gyms button").filter({ hasText: "Home" }).click();
  await run.page.getByRole("button", { name: "REVIEW CHANGES" }).click();
  await run.page.getByText("Using Home equipment today", { exact: true }).waitFor();
  assert.equal(
    await run.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")).defaultGymProfileId),
    "gym-main",
  );
  await run.page.getByRole("button", { name: "CANCEL", exact: true }).click();
  await run.page.getByRole("button", { name: "ADJUST TODAY", exact: true }).click();
  await run.page.getByRole("button", { name: /^Different equipment/ }).click();
  await run.page.getByRole("button", { name: /Choose equipment/ }).click();
  await run.page.getByRole("button", { name: "Bodyweight only", exact: true }).click();
  await run.page.getByRole("button", { name: "REVIEW CHANGES" }).click();
  await run.page.locator(".adjust-review-section").first().waitFor();
  assert.equal(await run.page.locator(".adjust-gym-context").count(), 0);
  await assertLayout(run.page, "Adjust saved gym");
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

async function captureLongName() {
  const run = await open(fixture({ longName: true }), { width: 320, height: 700 });
  await openGymSettings(run.page);
  await run.page.screenshot({ path: output("10-long-name-320.png") });
  await assertLayout(run.page, "long gym name");
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

async function captureMigration() {
  const run = await open(fixture({ migrated: true }));
  await openGymSettings(run.page);
  await run.page.screenshot({ path: output("11-first-run-migration.png") });
  const stored = await run.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
  assert.equal(stored.gymProfiles.length, 1);
  assert.deepEqual(stored.gymProfiles[0].equipment, ["full gym"]);
  assert.equal(stored.defaultGymProfileId, "gym-qa-profile");
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

async function captureMain430() {
  const run = await open(fixture({ gyms: "many" }), { width: 430, height: 900 });
  await openGymSettings(run.page);
  await run.page.screenshot({ path: output("12-main-430.png") });
  await assertLayout(run.page, "430px main state");
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

async function runtimeCrudReloadOffline() {
  const run = await open(fixture({ gyms: "many" }));
  await openGymSettings(run.page);
  await run.page.getByRole("button", { name: "ADD GYM" }).click();
  await run.page.getByLabel("Gym name").fill("Garage");
  await run.page.getByRole("button", { name: "Barbell / rack / bench", exact: true }).click();
  await run.page.getByRole("button", { name: "SAVE GYM" }).click();
  await run.page.getByRole("button", { name: /^Garage/ }).click();
  await run.page.getByLabel("Gym name").fill("Garage Strength");
  await run.page.getByRole("button", { name: "Dumbbells", exact: true }).click();
  await run.page.getByRole("button", { name: /Use as default gym/ }).click();
  await run.page.getByRole("button", { name: "SAVE GYM" }).click();
  await run.context.setOffline(false);
  await run.page.reload({ waitUntil: "domcontentloaded" });
  await run.page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await openProfileArea(run.page, 'training'); await run.page.getByRole("button", { name: /Gym profiles/ }).click();
  await run.page.getByRole("button", { name: /^Garage Strength/ }).waitFor();
  const stored = await run.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
  const garage = stored.gymProfiles.find((gym) => gym.name === "Garage Strength");
  assert.ok(garage);
  assert.deepEqual(garage.equipment, ["barbell/rack/bench", "dumbbells"]);
  assert.equal(stored.defaultGymProfileId, garage.id);
  assert.deepEqual(stored.profile.equipment, garage.equipment);
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

async function captureThemeMatrix() {
  const themes = [
    ["light", "standard", "light-standard"],
    ["dark", "standard", "dark-standard"],
    ["light", "premium", "light-premium"],
    ["dark", "premium", "dark-premium"],
  ];
  for (const [appearance, style, label] of themes) {
    const run = await open(fixture({ gyms: "many", appearance, style }));
    await openGymSettings(run.page);
    assert.equal(await run.page.evaluate(() => document.documentElement.dataset.appearance), appearance);
    assert.equal(await run.page.evaluate(() => document.documentElement.dataset.style), style);
    await run.page.screenshot({ path: output(`theme-${label}-list.png`) });
    await run.page.getByRole("button", { name: /^Home/ }).click();
    await run.page.screenshot({ path: output(`theme-${label}-editor.png`) });
    await run.page.locator(".detail-header-close").click();
    await run.page.getByRole("button", { name: "TODAY", exact: true }).click();
    await run.page.getByRole("button", { name: "ADJUST TODAY", exact: true }).click();
    await run.page.getByRole("button", { name: /^Different equipment/ }).click();
    await run.page.waitForTimeout(250);
    await run.page.screenshot({ path: output(`theme-${label}-adjust.png`) });
    await assertLayout(run.page, `${label} Adjust picker`);
    assert.deepEqual(run.errors, []);
    await run.context.close();
  }
}

try {
  await captureSettingsRow();
  await captureOneGym();
  await captureManyGyms();
  await captureCreateAndPicker();
  await captureEditDefaultAndDelete();
  await captureAdjustPicker();
  await captureLongName();
  await captureMigration();
  await captureMain430();
  await runtimeCrudReloadOffline();
  await captureThemeMatrix();
  console.log("Gym Profiles QA passed: 11 required states, 430px main state, and four-theme matrix captured; migration, offline CRUD, default sync, reload, long names, and Adjust Today saved-gym integration verified.");
} finally {
  await browser.close();
}
