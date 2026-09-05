import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";

const appUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const outputRoot = new URL("../artifacts/backup-restore/", import.meta.url);
await mkdir(outputRoot, { recursive: true });
const output = (name) => fileURLToPath(new URL(name, outputRoot));
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

function fixture() {
  const state = createReturningUserFixture(2);
  state.profile.name = "Backup QA";
  state.profile.units = "lb";
  state.profile.rirEnabled = true;
  state.profile.restTimerSeconds = 105;
  state.profile.avoid = "No overhead pressing";
  state.program.source = "ai-import";
  state.program.importMetadata = { source: "notes", importedAt: 1788595200000 };
  Object.assign(state.program.days[0].exercises[0], {
    exerciseId: "imported-custom-backup-press",
    exerciseSource: "imported-custom",
    importedName: "My Backup Press",
    originalImportedName: "My Backup Press",
    importedExercise: { id: "imported-custom-backup-press", name: "My Backup Press", source: "imported", pattern: null, muscles: null, equipment: null },
    matchStatus: "confirmed-custom",
    targetRir: null,
    restSeconds: 90,
    personalNote: "Stable setup",
  });
  state.workouts[0].sessionNote = "Backup round trip note";
  state.workouts[0].photoId = "backup-qa-photo";
  state.programChangeHistory = [{ id: "coach-change", source: "coach", appliedAt: 1788595200000 }];
  return state;
}

async function preparePage(state, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block", acceptDownloads: true, isMobile: true, hasTouch: true });
  await context.addInitScript((value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)), state);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/ai/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: false }) }));
  await page.goto(`${appUrl}/?backup-restore=${Date.now()}`, { waitUntil: "networkidle" });
  return { context, page, errors };
}

async function putPhoto(page, state) {
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
  }), { id: state.workouts[0].photoId, workoutId: state.workouts[0].id });
}

async function clearPhotos(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("rook-workout-media", 3);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("photos", "readwrite");
      transaction.objectStore("photos").clear();
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

const original = fixture();
const { context, page, errors } = await preparePage(original);
await putPhoto(page, original);
await page.getByRole("button", { name: "PROFILE", exact: true }).click();
await page.getByText("DATA", { exact: true }).waitFor();
await page.screenshot({ path: output("390-profile-data-light-standard.png"), fullPage: true });
await page.getByRole("button", { name: /Back up ROOK/ }).click();
await page.getByRole("heading", { name: "Keep a recovery copy of your training." }).waitFor();
await page.screenshot({ path: output("390-backup-light-standard.png"), fullPage: true });
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "CREATE BACKUP" }).click();
const download = await downloadPromise;
const backupPath = await download.path();
assert.match(download.suggestedFilename(), /^ROOK-backup-\d{4}-\d{2}-\d{2}\.zip$/);
await page.getByText("Backup created.", { exact: true }).waitFor();
await page.screenshot({ path: output("390-backup-created.png"), fullPage: true });

const bytes = new Uint8Array(await (await import("node:fs/promises")).readFile(backupPath));
const corruptEntries = unzipSync(bytes);
const corruptManifest = JSON.parse(strFromU8(corruptEntries["manifest.json"]));
corruptManifest.counts.workouts += 1;
corruptEntries["manifest.json"] = strToU8(JSON.stringify(corruptManifest));
const corruptPath = output("corrupted-qa-backup.zip");
await writeFile(corruptPath, zipSync(corruptEntries));

await page.getByRole("button", { name: "Close Back up ROOK" }).click();
await page.getByRole("button", { name: /Restore backup/ }).click();
await page.getByLabel("Choose ROOK backup file").setInputFiles(corruptPath);
await page.getByRole("alert").waitFor();
assert.match(await page.getByRole("alert").innerText(), /counts do not match/i);
await page.screenshot({ path: output("390-corrupted-backup-error.png"), fullPage: true });
await page.getByRole("button", { name: "Close Restore backup" }).click();

const altered = fixture();
altered.profile.name = "Altered locally";
altered.profile.units = "kg";
altered.workouts = [];
altered.program.days[0].name = "Deleted plan data";
await page.evaluate((value) => localStorage.setItem("lift-v2-state", JSON.stringify(value)), altered);
await clearPhotos(page);
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "PROFILE", exact: true }).click();
await page.getByRole("button", { name: /Restore backup/ }).click();
await page.getByLabel("Choose ROOK backup file").setInputFiles(backupPath);
await page.getByRole("heading", { name: "ROOK backup" }).waitFor();
await page.screenshot({ path: output("390-restore-preview.png"), fullPage: true });
await page.getByRole("button", { name: "RESTORE BACKUP", exact: true }).click();
await page.getByRole("heading", { name: "ROOK has been restored." }).waitFor();
await page.screenshot({ path: output("390-restore-success.png"), fullPage: true });

const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
assert.equal(restored.profile.name, original.profile.name);
assert.equal(restored.profile.units, "lb");
assert.equal(restored.profile.restTimerSeconds, 105);
assert.equal(restored.program.name, original.program.name);
assert.deepEqual(restored.program.importMetadata, original.program.importMetadata);
assert.equal(restored.program.days[0].exercises[0].importedExercise.name, "My Backup Press");
assert.equal(restored.workouts.length, original.workouts.length);
assert.equal(restored.workouts[0].sessionNote, "Backup round trip note");
assert.equal(restored.program.days[0].exercises[0].personalNote, "Stable setup");
assert.deepEqual(restored.programChangeHistory, original.programChangeHistory);
assert.equal(restored.workouts[0].exercises[0].sets[0].weight, original.workouts[0].exercises[0].sets[0].weight);
const restoredPhoto = await page.evaluate((id) => new Promise((resolve, reject) => {
  const request = indexedDB.open("rook-workout-media", 3);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const get = db.transaction("photos", "readonly").objectStore("photos").get(id);
    get.onsuccess = () => { const value = get.result; db.close(); resolve(value && { id: value.id, workoutId: value.workoutId, type: value.blob.type, size: value.blob.size }); };
    get.onerror = () => reject(get.error);
  };
}), original.workouts[0].photoId);
assert.deepEqual(restoredPhoto, { id: "backup-qa-photo", workoutId: original.workouts[0].id, type: "image/jpeg", size: 4 });
await page.getByRole("button", { name: "Close Restore backup" }).click();
await page.getByRole("button", { name: "PROGRESS", exact: true }).click();
await page.locator(".workout-photo-entry-section").scrollIntoViewIfNeeded();
await page.locator(".workout-photo-entry-card").click();
await page.getByRole("heading", { name: "Your training, over time." }).waitFor();
await page.locator(".workout-photo-timeline-item").waitFor();
assert.equal(await page.locator(".workout-photo-timeline-item").count(), 1, "restored photos reconstruct the Timeline");
assert.match(await page.locator(".workout-photo-timeline-item").first().innerText(), new RegExp(original.workouts[0].name, "i"));
assert.deepEqual(errors, []);
await context.close();

// One unavailable local photo never blocks the user's training-data backup.
{
  const missingPhotoState = fixture();
  const run = await preparePage(missingPhotoState);
  await run.page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await run.page.getByRole("button", { name: /Back up ROOK/ }).click();
  await run.page.getByRole("button", { name: "CREATE BACKUP" }).click();
  await run.page.getByText("1 workout photo is unavailable. Your ROOK data is unchanged.", { exact: true }).waitFor();
  const partialDownload = run.page.waitForEvent("download");
  await run.page.getByRole("button", { name: "CREATE WITHOUT 1 UNAVAILABLE PHOTO" }).click();
  const partial = await partialDownload;
  const partialBytes = new Uint8Array(await (await import("node:fs/promises")).readFile(await partial.path()));
  const partialEntries = unzipSync(partialBytes);
  const partialManifest = JSON.parse(strFromU8(partialEntries["manifest.json"]));
  const partialState = JSON.parse(strFromU8(partialEntries["data/state.json"]));
  assert.equal(partialManifest.photosComplete, false);
  assert.equal(partialManifest.omittedPhotos.length, 1);
  assert.equal(partialState.workouts[0].photoId, null);
  assert.equal(missingPhotoState.workouts[0].photoId, "backup-qa-photo");
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

for (const [appearancePreference, stylePreference, width, label] of [
  ["light", "standard", 320, "light-standard"],
  ["dark", "standard", 375, "dark-standard"],
  ["light", "premium", 390, "light-premium"],
  ["dark", "premium", 430, "dark-premium"],
]) {
  const themed = fixture();
  themed.profile.appearancePreference = appearancePreference;
  themed.profile.stylePreference = stylePreference;
  themed.profile.themePreference = stylePreference === "premium" ? "premium" : appearancePreference;
  const run = await preparePage(themed, { width, height: 880 });
  await run.page.getByRole("button", { name: "PROFILE", exact: true }).click();
  await run.page.getByRole("button", { name: /Back up ROOK/ }).click();
  await run.page.screenshot({ path: output(`${width}-backup-${label}.png`), fullPage: true });
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label} has no horizontal overflow`);
  assert.deepEqual(run.errors, []);
  await run.context.close();
}

await browser.close();
console.log("Backup/restore QA passed: ZIP download, corruption rejection, full data/photo round trip, rollback-safe preview flow, narrow/mobile layouts, and all four theme combinations.");
