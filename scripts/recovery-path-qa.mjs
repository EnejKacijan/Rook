import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";

const appUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const outputRoot = new URL("../artifacts/recovery-path/", import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, outputRoot));
const invalidPath = output("not-a-rook-backup.zip");
await writeFile(invalidPath, "not a zip");

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

const fixture = createReturningUserFixture(2);
fixture.profile.name = "Recovery QA";
fixture.profile.units = "lb";
fixture.profile.rirEnabled = true;
fixture.profile.restTimerSeconds = 105;
fixture.profile.avoid = "No overhead pressing";
fixture.program.source = "ai-import";
fixture.program.importMetadata = { source: "notes", importedAt: 1788595200000 };
fixture.workouts[0].sessionNote = "Recovered session note";
fixture.workouts[0].photoId = "recovery-qa-photo";
fixture.program.days[0].exercises[0].personalNote = "Recovered exercise note";

async function pageIn(context, label) {
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
  await page.goto(`${appUrl}/?recovery-path=${label}-${Date.now()}`, {
    waitUntil: "networkidle",
  });
  return { page, errors };
}

async function putPhoto(page) {
  await page.evaluate(({ id, workoutId }) => new Promise((resolve, reject) => {
    const request = indexedDB.open("rook-workout-media", 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains("photos")
        ? request.transaction.objectStore("photos")
        : db.createObjectStore("photos", { keyPath: "id" });
      if (!store.indexNames.contains("workoutId")) store.createIndex("workoutId", "workoutId");
      if (!store.indexNames.contains("createdAt")) store.createIndex("createdAt", "createdAt");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("photos", "readwrite");
      transaction.objectStore("photos").put({
        id,
        workoutId,
        blob: new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" }),
        mimeType: "image/jpeg",
        width: 100,
        height: 120,
        createdAt: "2026-09-05T10:00:00.000Z",
      });
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }), { id: fixture.workouts[0].photoId, workoutId: fixture.workouts[0].id });
}

async function countPhotos(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("rook-workout-media", 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains("photos")
        ? request.transaction.objectStore("photos")
        : db.createObjectStore("photos", { keyPath: "id" });
      if (!store.indexNames.contains("workoutId")) store.createIndex("workoutId", "workoutId");
      if (!store.indexNames.contains("createdAt")) store.createIndex("createdAt", "createdAt");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const count = db.transaction("photos", "readonly").objectStore("photos").count();
      count.onsuccess = () => { db.close(); resolve(count.result); };
      count.onerror = () => reject(count.error);
    };
  }));
}

const sourceContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
  acceptDownloads: true,
  isMobile: true,
  hasTouch: true,
});
const sourceSeed = await pageIn(sourceContext, "source-seed");
await sourceSeed.page.evaluate((state) => {
  localStorage.setItem("lift-v2-state", JSON.stringify(state));
}, fixture);
await sourceSeed.page.close();
const source = await pageIn(sourceContext, "source");
await putPhoto(source.page);
await source.page.getByRole("button", { name: "PROFILE", exact: true }).click();

// A normal cancellation keeps the user and all local data in place.
await source.page.getByRole("button", { name: "Log out", exact: true }).click();
const logoutDialog = source.page.getByRole("alertdialog", { name: "Log out?" });
await logoutDialog.waitFor();
assert.match(await logoutDialog.innerText(), /removes your ROOK data.*workout history and photos/is);
await source.page.screenshot({ path: output("logout-warning.png"), fullPage: true });
await logoutDialog.getByRole("button", { name: "CANCEL" }).click();
await source.page.getByText("Training profile", { exact: true }).waitFor();
assert.equal((await source.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")))).profile.name, "Recovery QA");

// Leaving the backup flow is a cancellation and must return to confirmation, not log out.
await source.page.getByRole("button", { name: "Log out", exact: true }).click();
await logoutDialog.getByRole("button", { name: "BACK UP FIRST" }).click();
await source.page.getByRole("heading", { name: "Keep a recovery copy of your training." }).waitFor();
await source.page.getByRole("button", { name: "Close Back up ROOK" }).click();
await logoutDialog.waitFor();
assert.equal((await source.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")))).profile.onboardingComplete, true);

// A backup handoff failure keeps both the backup screen and the signed-in local state.
await logoutDialog.getByRole("button", { name: "BACK UP FIRST" }).click();
await source.page.evaluate(() => {
  window.__rookQaCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = () => { throw new Error("QA save failure"); };
});
await source.page.getByRole("button", { name: "CREATE BACKUP" }).click();
await source.page.getByText("Backup creation failed. Your ROOK data is unchanged.", { exact: true }).waitFor();
assert.equal((await source.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")))).profile.name, "Recovery QA");
await source.page.evaluate(() => { URL.createObjectURL = window.__rookQaCreateObjectURL; });
await source.page.getByRole("button", { name: "Close Back up ROOK" }).click();
await logoutDialog.waitFor();

// A real successful file handoff returns to the warning and still never logs out automatically.
await logoutDialog.getByRole("button", { name: "BACK UP FIRST" }).click();
const downloadPromise = source.page.waitForEvent("download");
await source.page.getByRole("button", { name: "CREATE BACKUP" }).click();
const download = await downloadPromise;
const backupPath = output("recovery-backup.zip");
await download.saveAs(backupPath);
await logoutDialog.waitFor();
assert.equal((await source.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")))).profile.name, "Recovery QA");

// Confirmed logout clears state and private photos, then exposes recovery on landing.
await logoutDialog.getByRole("button", { name: "LOG OUT AND DELETE DATA" }).click();
await source.page.getByRole("button", { name: "Restore from backup" }).waitFor();
assert.equal(await source.page.evaluate(() => localStorage.getItem("lift-v2-state")), null);
assert.equal(await countPhotos(source.page), 0);
await source.page.screenshot({ path: output("landing-after-logout.png"), fullPage: true });

await source.page.getByRole("button", { name: "Restore from backup" }).click();
await source.page.getByLabel("Choose ROOK backup file").setInputFiles(backupPath);
await source.page.getByRole("heading", { name: "ROOK backup" }).waitFor();
await source.page.getByRole("button", { name: "RESTORE BACKUP", exact: true }).click();
await source.page.getByRole("button", { name: "TODAY", exact: true }).waitFor();
const afterLogoutRestore = await source.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
assert.equal(afterLogoutRestore.profile.name, "Recovery QA");
assert.equal(afterLogoutRestore.profile.onboardingComplete, true);
assert.equal(await countPhotos(source.page), 1);
assert.deepEqual(source.errors, []);
await sourceContext.close();

// A genuinely clean browser starts with no state key or photo records.
const cleanContext = await browser.newContext({
  viewport: { width: 320, height: 760 },
  serviceWorkers: "block",
  isMobile: true,
  hasTouch: true,
});
const clean = await pageIn(cleanContext, "clean");
await clean.page.getByRole("button", { name: "Restore from backup" }).waitFor();
assert.equal(await clean.page.evaluate(() => localStorage.getItem("lift-v2-state")), null);
assert.equal(await countPhotos(clean.page), 0);

// Invalid input and a cancelled picker leave the clean install untouched.
await clean.page.getByRole("button", { name: "Restore from backup" }).click();
await clean.page.getByLabel("Choose ROOK backup file").setInputFiles(invalidPath);
await clean.page.getByRole("alert").waitFor();
assert.equal(await clean.page.evaluate(() => localStorage.getItem("lift-v2-state")), null);
assert.equal(await countPhotos(clean.page), 0);
await clean.page.getByRole("button", { name: "Close Restore backup" }).click();
await clean.page.getByRole("button", { name: "Restore from backup" }).click();
const chooserPromise = clean.page.waitForEvent("filechooser");
await clean.page.getByText("CHOOSE BACKUP", { exact: true }).click();
const chooser = await chooserPromise;
await chooser.setFiles([]);
assert.equal(await clean.page.evaluate(() => localStorage.getItem("lift-v2-state")), null);
assert.equal(await countPhotos(clean.page), 0);

// Valid restore bypasses onboarding and recovers the complete representative state.
await clean.page.getByLabel("Choose ROOK backup file").setInputFiles(backupPath);
await clean.page.getByRole("heading", { name: "ROOK backup" }).waitFor();
await clean.page.screenshot({ path: output("clean-install-restore-preview.png"), fullPage: true });
await clean.page.getByRole("button", { name: "RESTORE BACKUP", exact: true }).click();
await clean.page.getByRole("button", { name: "TODAY", exact: true }).waitFor();
const restored = await clean.page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
assert.equal(restored.profile.name, fixture.profile.name);
assert.equal(restored.profile.units, "lb");
assert.equal(restored.profile.restTimerSeconds, 105);
assert.equal(restored.program.name, fixture.program.name);
assert.equal(restored.workouts.length, fixture.workouts.length);
assert.equal(restored.workouts[0].sessionNote, "Recovered session note");
assert.equal(restored.program.days[0].exercises[0].personalNote, "Recovered exercise note");
assert.equal(await countPhotos(clean.page), 1);
assert.deepEqual(clean.errors, []);
await cleanContext.close();

for (const [appearancePreference, stylePreference, width, label] of [
  ["light", "standard", 320, "light-standard"],
  ["dark", "standard", 375, "dark-standard"],
  ["light", "premium", 390, "light-premium"],
  ["dark", "premium", 430, "dark-premium"],
]) {
  const themedState = structuredClone(fixture);
  themedState.profile.onboardingComplete = false;
  themedState.profile.appearancePreference = appearancePreference;
  themedState.profile.stylePreference = stylePreference;
  themedState.profile.themePreference = stylePreference === "premium" ? "premium" : appearancePreference;
  themedState.program = null;
  themedState.workouts = [];
  const context = await browser.newContext({
    viewport: { width, height: 880 },
    serviceWorkers: "block",
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript((state) => {
    localStorage.setItem("lift-v2-state", JSON.stringify(state));
  }, themedState);
  const run = await pageIn(context, `theme-${label}`);
  await run.page.getByRole("button", { name: "Restore from backup" }).waitFor();
  assert.equal(
    await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    `${label} landing has no horizontal overflow`,
  );
  await run.page.screenshot({ path: output(`${width}-landing-${label}.png`), fullPage: true });
  assert.deepEqual(run.errors, []);
  await context.close();
}

await browser.close();
console.log("Recovery-path QA passed: clean-install restore, logout recovery, full state/photo recovery, invalid and cancelled clean-state safety, backup-first cancellation/success behavior, and all four landing themes.");
