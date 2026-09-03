import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";

const artifacts = new URL(
  "../artifacts/profile-priority-semantics/",
  import.meta.url,
);
await mkdir(artifacts, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, artifacts));
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

for (const source of ["fixed-template", "ai-import", "manual"]) {
  const state = createReturningUserFixture(1);
  state.program.source = source;
  state.program.name =
    source === "ai-import" ? "Imported plan" : "My training plan";
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
    colorScheme: "dark",
    serviceWorkers: "block",
  });
  await context.addInitScript(
    ({ value }) => localStorage.setItem("lift-v2-state", JSON.stringify(value)),
    { value: state },
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
      body: JSON.stringify({ available: false, provider: null }),
    }),
  );
  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "PROFILE", exact: true }).click();

  const profile = page.locator(".profile-screen");
  const preferencesOnly = ["ai-import", "manual"].includes(source);
  if (preferencesOnly) {
    await profile.getByText("COACHING PREFERENCES", { exact: true }).waitFor();
    assert.equal(
      await profile.getByText("TRAINING PRIORITIES", { exact: true }).count(),
      0,
    );
    assert.match(
      await profile.innerText(),
      /Used by Coach and future generated plans\. Changes don’t update this plan\./,
    );
    if (source === "ai-import") {
      await page.screenshot({
        path: output("320-dark-imported-profile.png"),
        fullPage: false,
      });
    }
    await profile.getByRole("button", { name: /Edit priorities/ }).click();
    await page
      .getByRole("heading", { name: "What would you like Coach to emphasize?" })
      .waitFor();
    assert.match(
      await page.locator(".priority-settings").innerText(),
      /Your current plan won’t change automatically\./,
    );
    assert.equal(
      await page.getByRole("button", { name: "SAVE PREFERENCES" }).count(),
      1,
    );
  } else {
    await profile.getByText("TRAINING PRIORITIES", { exact: true }).waitFor();
    assert.match(
      await profile.innerText(),
      /Used to build your plan and guide Coach\. Changes apply when you adjust or rebuild it\./,
    );
    await profile.getByRole("button", { name: /Review priorities/ }).click();
    await page
      .getByRole("heading", { name: "What would you like to emphasize?" })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "SAVE PRIORITIES" }).count(),
      1,
    );
  }
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    `${source} priority semantics do not create horizontal overflow`,
  );
  if (source === "ai-import") {
    await page.screenshot({
      path: output("320-dark-imported-preferences-editor.png"),
      fullPage: false,
    });
  }
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
console.log(
  "Profile priority semantics QA passed: generated plans retain Training priorities, while imported and scratch plans use honest Coaching preferences semantics.",
);
