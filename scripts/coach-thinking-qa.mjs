import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { blankState, buildProgram, isoDay, weekday } from "../src/domain.js";

const outputRoot = new URL("../artifacts/coach-thinking/", import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
async function verifyThinkingState({ appearance, style, screenshot, expected, reducedMotion = false }) {
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
    appearancePreference: appearance,
    stylePreference: style,
    themePreference: style === "premium" ? "premium" : appearance,
  };
  state.program = buildProgram(state.profile);
  state.selectedDay = weekday();
  state.selectedDate = isoDay();

  const context = await browser.newContext({
    viewport: { width: 485, height: 840 },
    serviceWorkers: "block",
    colorScheme: appearance,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
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
  if (reducedMotion) {
    await page.getByText("Thinking…", { exact: true }).waitFor();
    assert.equal(await thinking.locator(".thinking-dots").isVisible(), false);
  }
  const thinkingMetrics = await thinking.evaluate((card) => {
    const avatarElement = card.querySelector("header span");
    const labelElement = card.querySelector("header strong");
    const avatar = avatarElement.getBoundingClientRect();
    const label = labelElement.getBoundingClientRect();
    return {
      avatarWidth: avatar.width,
      avatarHeight: avatar.height,
      labelHeight: label.height,
      avatarColor: getComputedStyle(avatarElement).color,
      avatarBackground: getComputedStyle(avatarElement).backgroundColor,
      labelColor: getComputedStyle(labelElement).color,
    };
  });
  assert.deepEqual(
    [thinkingMetrics.avatarWidth, thinkingMetrics.avatarHeight],
    [22, 22],
    "the Coach avatar remains 22 × 22 px while a reply is pending",
  );
  assert.ok(thinkingMetrics.labelHeight < 20, "ROOK COACH remains on one line");
  if (expected) {
    assert.equal(thinkingMetrics.labelColor, expected.text, "Premium ROOK COACH uses gold");
    assert.equal(thinkingMetrics.avatarColor, expected.text, "Premium avatar uses gold");
    assert.equal(
      thinkingMetrics.avatarBackground,
      expected.background,
      "Premium avatar uses its champagne surface",
    );
  }
  await page.screenshot({ path: output(screenshot), fullPage: false });

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
}

await verifyThinkingState({
  appearance: "dark",
  style: "standard",
  screenshot: "485-dark-thinking.png",
});
await verifyThinkingState({
  appearance: "light",
  style: "premium",
  screenshot: "485-premium-light-thinking.png",
  expected: {
    text: "rgb(116, 85, 9)",
    background: "rgb(241, 232, 207)",
  },
});
await verifyThinkingState({
  appearance: "dark",
  style: "premium",
  screenshot: "485-premium-dark-thinking.png",
  expected: {
    text: "rgb(215, 177, 90)",
    background: "rgb(42, 37, 23)",
  },
});
await verifyThinkingState({
  appearance: "light",
  style: "standard",
  screenshot: "485-reduced-motion-thinking.png",
  reducedMotion: true,
});

await browser.close();
console.log(
  "Coach thinking QA passed: pending and completed avatars remain stable, and Premium Light/Dark Coach identity uses gold.",
);
