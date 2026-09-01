import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { blankState, buildProgram, isoDay, weekday } from "../src/domain.js";

const outputRoot = new URL("../artifacts/coach-thinking/", import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, outputRoot));
const state = blankState();
state.profile = {
  ...state.profile,
  goal: "Build muscle",
  experience: "Intermediate",
  daysPerWeek: 2,
  availableDays: ["Mon", "Thu"],
  sessionMinutes: 45,
  environment: "Commercial gym",
  equipment: ["full gym"],
  onboardingComplete: true,
  themePreference: "dark",
};
state.program = buildProgram(state.profile);
state.selectedDay = weekday();
state.selectedDate = isoDay();

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 485, height: 840 },
  serviceWorkers: "block",
});
await context.addInitScript(
  (value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)),
  state,
);
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
    body: JSON.stringify({ available: true, provider: "qa" }),
  }),
);
await page.route("**/api/ai", async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 700));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      data: { text: "Your next workout fits the current plan.", action: null },
    }),
  });
});
await page.goto(`http://127.0.0.1:4173/?coach-thinking=${Date.now()}`, {
  waitUntil: "domcontentloaded",
});
await page.getByRole("button", { name: "COACH", exact: true }).click();
await page.getByLabel("Ask Coach").fill("Explain my next workout.");
await page.getByRole("button", { name: "Send message" }).click();

const thinking = page.locator(".coach-thinking");
await thinking.waitFor();
const thinkingMetrics = await thinking.evaluate((card) => {
  const avatar = card.querySelector("header span").getBoundingClientRect();
  const label = card.querySelector("header strong").getBoundingClientRect();
  return {
    avatarWidth: avatar.width,
    avatarHeight: avatar.height,
    labelHeight: label.height,
  };
});
assert.deepEqual(
  [thinkingMetrics.avatarWidth, thinkingMetrics.avatarHeight],
  [22, 22],
  "the Coach avatar remains 22 × 22 px while a reply is pending",
);
assert.ok(thinkingMetrics.labelHeight < 20, "ROOK COACH remains on one line");
await page.screenshot({ path: output("485-dark-thinking.png"), fullPage: false });

await page.getByText("Your next workout fits the current plan.").waitFor();
const finalAvatar = await page
  .locator(".coach-message:not(.coach-thinking) header span")
  .last()
  .evaluate((avatar) => {
    const box = avatar.getBoundingClientRect();
    return [box.width, box.height];
  });
assert.deepEqual(finalAvatar, [22, 22]);
assert.deepEqual(errors, []);

await context.close();
await browser.close();
console.log(
  "Coach thinking QA passed: pending and completed avatars remain 22 × 22 px and the label does not wrap.",
);
