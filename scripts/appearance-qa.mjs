import { openProfileArea } from './qa-current-navigation.mjs';
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { blankState, buildProgram, isoDay, validateProgram, weekday } from "../src/domain.js";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const artifactRoot = new URL("../artifacts/appearance/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));

function fixture(appearance = "light", style = "standard") {
  const state = blankState();
  const today = weekday();
  state.profile = {
    ...state.profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 2,
    availableDays: [today, today === "Sat" ? "Tue" : "Sat"],
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
  assert.deepEqual(validateProgram(state.program, state.profile).errors, []);
  state.ai.planUpgradeDismissed = true;
  state.selectedDay = today;
  state.selectedDate = isoDay();
  return state;
}

async function open(state, colorScheme = "light", viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, colorScheme, serviceWorkers: "block" });
  await context.addInitScript((value) => {
    window.__rookInitialThemeStates = [];
    if (!sessionStorage.getItem("rook-appearance-fixture-loaded")) {
      localStorage.setItem("lift-v2-state", JSON.stringify(value));
      sessionStorage.setItem("rook-appearance-fixture-loaded", "true");
    }
    const observe = () =>
      new MutationObserver(() => {
        window.__rookInitialThemeStates.push({
          appearance: document.documentElement.dataset.appearance,
          style: document.documentElement.dataset.style,
        });
      }).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-appearance", "data-style"],
      });
    if (document.documentElement) observe();
    else document.addEventListener("DOMContentLoaded", observe, { once: true });
  }, state);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false}' }),
  );
  await page.goto(`http://127.0.0.1:4173/?appearance=${Date.now()}`, { waitUntil: "networkidle" });
  return { context, page, errors };
}

const combinations = [
  ["light", "standard", "#f6f5f2", "#1f6b4c"],
  ["dark", "standard", "#111413", "#4fbf87"],
  ["light", "premium", "#f7f5f0", "#8a670f"],
  ["dark", "premium", "#11110f", "#d7b15a"],
];

for (const [appearance, style, themeColor, accent] of combinations) {
  const state = fixture(appearance, style);
  const { context, page, errors } = await open(state, appearance);
  const signals = await page.evaluate(() => ({
    appearance: document.documentElement.dataset.appearance,
    style: document.documentElement.dataset.style,
    legacyTheme: document.documentElement.dataset.theme,
    colorScheme: document.documentElement.style.colorScheme,
    themeColor: document.querySelector('meta[name="theme-color"]').content,
    accent: getComputedStyle(document.documentElement).getPropertyValue("--rook-accent").trim(),
    initial: window.__rookInitialThemeStates,
  }));
  assert.equal(signals.appearance, appearance);
  assert.equal(signals.style, style);
  assert.equal(signals.legacyTheme, style === "premium" ? "premium" : appearance);
  assert.equal(signals.colorScheme, appearance);
  assert.equal(signals.themeColor, themeColor);
  assert.equal(signals.accent, accent);
  assert.ok(
    signals.initial.every((entry) =>
      (!entry.appearance || entry.appearance === appearance) &&
      (!entry.style || entry.style === style),
    ),
    `${appearance}/${style}: startup never paints an incorrect theme state`,
  );

  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await openProfileArea(page, 'preferences');
  assert.match(
    await page.getByRole("button", { name: /^Appearance/ }).innerText(),
    new RegExp(`ROOK ${style === "premium" ? "Gold" : "Green"}.*${appearance}.*Illustrations on`, "i"),
  );
  await openProfileArea(page, 'preferences'); await page.getByRole("button", { name: /^Appearance/ }).click();
  assert.equal(await page.locator(".theme-choice-layer").count(), 0);
  assert.equal(await page.getByRole("radiogroup", { name: "Theme" }).count(), 1);
  assert.equal(
    await page.getByRole("radio", { name: new RegExp(`^${appearance}$`, "i") }).getAttribute("aria-checked"),
    "true",
  );
  assert.equal(await page.locator(".appearance-style-choice").count(), 0);
  assert.match(await page.getByRole("button", { name: /^Personal themes/ }).innerText(),
    new RegExp(`ROOK ${style === "premium" ? "Gold" : "Green"}`, "i"));
  const targets = await page.locator('.appearance-theme-group [role="radio"], .appearance-palettes-group > button').evaluateAll(
    (items) => items.map((item) => ({ width: item.getBoundingClientRect().width, height: item.getBoundingClientRect().height })),
  );
  assert.ok(targets.every(({ width, height }) => width >= 44 && height >= 44));
  await page.screenshot({ path: output(`${appearance}-${style}-appearance.png`), fullPage: false });
  await page.getByRole("button", { name: "Close Appearance" }).click();
  await page.getByRole("button", { name: "COACH", exact: true }).click();
  await page.screenshot({ path: output(`${appearance}-${style}-coach.png`), fullPage: false });
  assert.deepEqual(errors, []);
  await context.close();
}

for (const style of ["standard", "premium"]) {
  const state = fixture("system", style);
  const { context, page, errors } = await open(state, "light");
  assert.deepEqual(
    await page.evaluate(() => [document.documentElement.dataset.appearance, document.documentElement.dataset.style]),
    ["light", style],
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.appearance === "dark");
  assert.equal(await page.locator("html").getAttribute("data-style"), style);
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")).profile.stylePreference),
    style,
  );
  assert.deepEqual(errors, []);
  await context.close();
}

for (const legacy of ["system", "light", "dark", "premium"]) {
  const state = fixture();
  delete state.profile.appearancePreference;
  delete state.profile.stylePreference;
  state.profile.themePreference = legacy;
  const { context, page, errors } = await open(state, "dark");
  const expectedAppearance = legacy === "premium" || legacy === "system" ? "dark" : legacy;
  const expectedStyle = legacy === "premium" ? "premium" : "standard";
  assert.deepEqual(
    await page.evaluate(() => [document.documentElement.dataset.appearance, document.documentElement.dataset.style]),
    [expectedAppearance, expectedStyle],
  );
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")).profile);
  assert.equal(stored.appearancePreference, legacy === "premium" ? "system" : legacy);
  assert.equal(stored.stylePreference, expectedStyle);
  assert.equal(stored.themePreference, legacy);
  assert.deepEqual(errors, []);
  await context.close();
}

{
  const { context, page, errors } = await open(fixture("light", "standard"));
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await openProfileArea(page, 'preferences'); await page.getByRole("button", { name: /^Appearance/ }).click();
  const illustrations = page.getByRole("switch", { name: "Exercise illustrations" });
  await illustrations.uncheck({ force: true });
  await page.getByRole("button", { name: /^Personal themes/ }).click();
  await page.getByRole("button", { name: "ROOK Gold", exact: true }).click();
  await page.getByRole("button", { name: "Apply theme", exact: true }).click();
  await page.locator('.pro-theme-studio').waitFor({ state: 'hidden' });
  assert.equal(await page.locator("html").getAttribute("data-style"), "premium");
  assert.equal(await page.locator(".modal-layer").count(), 1, "theme Apply keeps Appearance open");
  await page.getByRole("button", { name: "Close Appearance" }).click();
  assert.match(await page.getByRole("button", { name: /^Appearance/ }).innerText(), /ROOK Gold.*Light.*Illustrations off/i);
  await openProfileArea(page, 'preferences'); await page.getByRole("button", { name: /^Appearance/ }).click();
  assert.equal(await illustrations.isChecked(), false, "illustration preference survives reopening");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("html").getAttribute("data-style"), "premium");
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await openProfileArea(page, 'preferences'); await page.getByRole("button", { name: /^Appearance/ }).click();
  assert.equal(await page.getByRole("switch", { name: "Exercise illustrations" }).isChecked(), false);
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log("Appearance QA passed: one brightness preference plus Personal Themes with legacy color compatibility, four visual combinations, System changes, legacy migration, first-paint state, persistence, summary, illustrations, and reopening are correct.");
