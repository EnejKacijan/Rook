import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";

const artifactRoot = new URL("../artifacts/persistence-failure/", import.meta.url);
const appUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
await mkdir(artifactRoot, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
await context.addInitScript((state) => {
  localStorage.setItem("lift-v2-state", JSON.stringify(state));
  Storage.prototype.setItem = () => {
    throw new DOMException("Storage blocked", "QuotaExceededError");
  };
}, createReturningUserFixture(2));
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
    body: JSON.stringify({ available: false }),
  }),
);
await page.goto(appUrl, { waitUntil: "networkidle" });
await page.getByRole("alert").filter({ hasText: "Changes can’t be saved" }).waitFor();
// The real current day may be a rest day; inspect an explicitly planned day.
const plannedDay = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")).program.days[0].weekday);
await page.getByRole("button", { name: new RegExp(`^${plannedDay} `) }).click();
assert.equal(
  await page.getByRole("button", { name: /START WORKOUT|WORKOUT COMPLETE/ }).count(),
  1,
  "the app remains usable when persistence is unavailable",
);
assert.equal(await page.getByRole("button", { name: "BACK UP NOW" }).count(), 1, "the storage warning offers an immediate backup path");
assert.deepEqual(errors, [], "blocked storage does not cause an uncaught page error");
await page.screenshot({
  path: fileURLToPath(new URL("390-storage-warning.png", artifactRoot)),
  fullPage: false,
});
await page.getByRole("button", { name: "BACK UP NOW" }).click();
await page.getByRole("heading", { name: "Keep a recovery copy of your training." }).waitFor();
await page.getByRole("button", { name: "Close Back up ROOK" }).click();
await context.close();
const newUserContext = await browser.newContext({
  viewport: { width: 320, height: 700 },
  serviceWorkers: "block",
});
await newUserContext.addInitScript(() => {
  Storage.prototype.getItem = () => {
    throw new DOMException("Storage blocked", "SecurityError");
  };
  Storage.prototype.setItem = () => {
    throw new DOMException("Storage blocked", "SecurityError");
  };
});
const newUserPage = await newUserContext.newPage();
const newUserErrors = [];
newUserPage.on("pageerror", (error) => newUserErrors.push(error.message));
await newUserPage.route("**/api/ai/status", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: false }),
  }),
);
await newUserPage.goto(appUrl, { waitUntil: "networkidle" });
await newUserPage.getByRole("alert").filter({ hasText: "couldn’t safely reopen your data" }).waitFor();
assert.equal(
  await newUserPage.getByRole("button", { name: "RETRY" }).count(),
  1,
  "a blocked read fails closed instead of assuming there is no interrupted restore",
);
assert.deepEqual(newUserErrors, []);
await newUserContext.close();
await browser.close();
console.log(
  "Persistence failure QA passed: blocked writes stay recoverable, while blocked reads fail closed with a clear recovery state.",
);
