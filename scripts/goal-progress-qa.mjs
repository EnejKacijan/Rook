import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";

const root = new URL("../artifacts/goal-progress/", import.meta.url);
const appUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:5175";
await mkdir(root, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, root));
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function fixture({ appearance, style, tracking = true } = {}) {
  const state = createReturningUserFixture(4);
  state.schemaVersion = 3;
  state.profile.goal = "Lose fat";
  state.profile.ageRange = "18–29";
  state.profile.appearancePreference = appearance;
  state.profile.stylePreference = style;
  state.profile.themePreference = style === "premium" ? "premium" : appearance;
  state.program.goal = "Lose fat";
  state.program.goalAtCreation = "lose_fat";
  state.weightTrackingEnabled = tracking;
  state.progressFocusOverrideByPlanId = {};
  state.weightCheckins = tracking
    ? Array.from({ length: 15 }, (_, index) => {
        const day = 1 + index * 2;
        const date = new Date(2026, 7, day, 12);
        const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        return {
          id: `weight-${index}`,
          localDate,
          weightKg: 83.4 - index * 0.08,
          createdAt: date.toISOString(),
          updatedAt: date.toISOString(),
        };
      })
    : [];
  return state;
}

async function openState(state, name, colorScheme) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme,
    serviceWorkers: "block",
  });
  await context.addInitScript(
    (value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)),
    state,
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: false, provider: null }),
    }),
  );
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "PROGRESS" }).click();
  await page.locator(".progress-screen").evaluate((element) => {
    element.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: output(`${name}.png`) });
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal(await page.locator(".goal-progress-card").count(), 1);
  assert.equal(await page.locator("body").evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  return { context, page };
}

for (const style of ["standard", "premium"])
  for (const appearance of ["light", "dark"]) {
    const name = `${style}-${appearance}`;
    const run = await openState(
      fixture({ appearance, style }),
      name,
      appearance,
    );
    assert.match(
      await run.page.locator(".goal-progress-card").innerText(),
      /Weight trend[\s\S]*Strength while losing/i,
    );
    await run.context.close();
  }

const optIn = await openState(
  fixture({ appearance: "light", style: "premium", tracking: false }),
  "premium-light-no-weight",
  "light",
);
await optIn.page.getByRole("button", { name: "ADD WEIGHT CHECK-INS" }).click();
await optIn.page.screenshot({ path: output("weight-opt-in.png") });
await optIn.page.getByRole("button", { name: "ENABLE CHECK-INS" }).click();
const firstWeightInput = optIn.page.getByRole("spinbutton", { name: "Weight kg" });
assert.equal(
  await firstWeightInput.evaluate((node) => document.activeElement === node),
  false,
  "weight editor opens without automatically focusing its input",
);
await firstWeightInput.fill("82.4");
await optIn.page.getByRole("button", { name: "SAVE" }).click();
await optIn.page.waitForTimeout(250);
await optIn.page.screenshot({ path: output("weight-history-first-entry.png") });
assert.equal(
  await optIn.page.getByRole("heading", { name: "First check-in saved" }).count(),
  1,
);
assert.equal(await optIn.page.locator(".weight-trend-chart").count(), 0);

await optIn.page.getByRole("button", { name: "ADD WEIGHT" }).click();
await optIn.page.getByRole("spinbutton", { name: "Weight kg" }).fill("82.1");
await optIn.page.locator('input[type="date"]').fill("2026-09-01");
await optIn.page.getByRole("button", { name: "SAVE" }).click();
await optIn.page.waitForTimeout(250);
await optIn.page.screenshot({ path: output("weight-history-weekly-average.png") });
assert.equal(
  await optIn.page.getByRole("heading", { name: "Building your trend" }).count(),
  1,
);
assert.match(
  await optIn.page.locator(".weight-history-averages").innerText(),
  /Weekly average[\s\S]*82\.3 kg/i,
);
assert.equal(await optIn.page.locator(".weight-trend-chart").count(), 0);

await optIn.page.getByRole("button", { name: "ADD WEIGHT" }).click();
await optIn.page.getByRole("spinbutton", { name: "Weight kg" }).fill("82.8");
await optIn.page.locator('input[type="date"]').fill("2026-08-28");
await optIn.page.getByRole("button", { name: "SAVE" }).click();
await optIn.page.waitForTimeout(250);
await optIn.page.screenshot({ path: output("weight-history-early-trend.png") });
assert.equal(
  await optIn.page.getByRole("heading", { name: "Building your trend" }).count(),
  0,
);
assert.equal(await optIn.page.locator(".weight-trend-chart").count(), 1);
await optIn.context.close();

await browser.close();
console.log(`Goal progress screenshots written to ${fileURLToPath(root)}`);
