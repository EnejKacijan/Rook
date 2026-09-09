import { openProfileArea } from './qa-current-navigation.mjs';
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { blankState, buildProgram, isoDay, startWorkout, weekday, WEEKDAYS } from "../src/domain.js";

const artifactRoot = new URL("../artifacts/rest-notifications/", import.meta.url);
await mkdir(artifactRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifactRoot));
const baseUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });

function fixture({ permissionPreference = false, activeExpired = false, appearance = "light", style = "standard" } = {}) {
  const state = blankState();
  const today = weekday();
  state.profile = { ...state.profile, goal: "Build muscle", experience: "Intermediate", daysPerWeek: 2, availableDays: [today, WEEKDAYS[(WEEKDAYS.indexOf(today) + 3) % 7]], sessionMinutes: 60, environment: "Commercial gym", equipment: ["full gym"], priorities: ["Balanced"], onboardingComplete: true, appearancePreference: appearance, stylePreference: style, themePreference: style === "premium" ? "premium" : appearance, restTimerEnabled: true, restTimerAutoStart: true, restTimerNotificationsEnabled: permissionPreference };
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  state.selectedDate = isoDay();
  state.ai.planUpgradeDismissed = true;
  if (activeExpired) {
    const template = state.program.days.find((day) => day.weekday === today);
    state.activeWorkout = startWorkout(state, template);
    state.activeWorkout.rest = { seconds: 60, endsAt: Date.now() - 5000 };
  }
  return state;
}

async function open(state, { permission = "default", viewport = { width: 390, height: 844 } } = {}) {
  const context = await browser.newContext({ viewport, colorScheme: state.profile.appearancePreference, serviceWorkers: "block" });
  await context.addInitScript(({ value, permissionValue }) => {
    localStorage.setItem("lift-v2-state", JSON.stringify(value));
    window.__notificationRequests = 0;
    try {
      Object.defineProperty(Notification, "permission", { configurable: true, get: () => permissionValue });
      Notification.requestPermission = async () => { window.__notificationRequests += 1; return permissionValue === "default" ? "granted" : permissionValue; };
    } catch {}
  }, { value: state, permissionValue: permission });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/**", (route) => route.request().url().includes("/api/ai/status") ? route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false}' }) : route.abort());
  await page.goto(`${baseUrl}/?rest-notifications=${Date.now()}`, { waitUntil: "networkidle" });
  return { context, page, errors };
}

async function openLogging(run) {
  await run.page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await openProfileArea(run.page, 'preferences'); await run.page.getByRole("button", { name: /Logging & increments/ }).click();
  await run.page.getByText("REST TIMER", { exact: true }).waitFor();
}

async function capture(name, state, options = {}) {
  const run = await open(state, options);
  await openLogging(run);
  await run.page.getByText("Rest timer notifications", { exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} overflow`);
  await run.page.screenshot({ path: output(`${name}.png`), fullPage: false });
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

await capture("01-permission-not-requested", fixture());
await capture("02-enabled-granted", fixture({ permissionPreference: true }), { permission: "granted" });
await capture("03-denied", fixture({ permissionPreference: true }), { permission: "denied" });
await capture("04-premium", fixture({ appearance: "dark", style: "premium" }), { viewport: { width: 390, height: 844 }, permission: "default" });
await capture("05-320", fixture(), { viewport: { width: 320, height: 700 }, permission: "default" });

const explicit = await open(fixture(), { permission: "default" });
await openLogging(explicit);
assert.equal(await explicit.page.evaluate(() => window.__notificationRequests), 0, "permission is not requested on load");
await explicit.page.getByText("Rest timer notifications", { exact: true }).click();
assert.equal(await explicit.page.evaluate(() => window.__notificationRequests), 1, "explicit toggle requests once");
await explicit.context.close();

const restored = await open(fixture({ permissionPreference: true }), { permission: "default" });
await openLogging(restored);
assert.equal(await restored.page.getByLabel("Rest timer notifications").isChecked(), false, "restored preference cannot imply browser permission");
assert.equal(await restored.page.evaluate(() => window.__notificationRequests), 0, "restore does not request permission");
await restored.context.close();

const expired = await open(fixture({ activeExpired: true }));
await expired.page.getByRole("button", { name: "RESUME WORKOUT" }).click();
await expired.page.getByText("REST COMPLETE", { exact: true }).waitFor();
assert.deepEqual(expired.errors, []);
await expired.context.close();

await browser.close();
console.log("Rest notification QA passed: explicit permission, granted/denied/restored states, expired absolute timer return, Premium and 320px.");
