import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createReturningUserFixture } from "../src/demoFixture.js";

const appUrl = process.env.ROOK_QA_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

const oldState = createReturningUserFixture(1);
oldState.profile.name = "Before interrupted restore";
oldState.workouts[0].photoId = "old-photo";
const newState = structuredClone(oldState);
newState.profile.name = "Partially restored state";
newState.workouts[0].photoId = "new-photo";

async function openCase(label) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{\"available\":false}" }),
  );
  await page.goto(`${appUrl}/?restore-crash=${label}-${Date.now()}`, { waitUntil: "networkidle" });
  await page.evaluate((state) => {
    localStorage.setItem("lift-v2-state", JSON.stringify(state));
  }, oldState);
  return { context, page };
}

async function simulate(page, stage) {
  await page.evaluate(async ({ stage, oldState, newState }) => {
    const open = () => new Promise((resolve, reject) => {
      const request = indexedDB.open("rook-workout-media", 3);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transact = (database, operation) => new Promise((resolve, reject) => {
      const transaction = database.transaction(["photos", "restore-snapshot"], "readwrite");
      operation(
        transaction.objectStore("photos"),
        transaction.objectStore("restore-snapshot"),
      );
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const photo = (id) => ({
      id,
      workoutId: oldState.workouts[0].id,
      blob: new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" }),
      mimeType: "image/jpeg",
      width: 2,
      height: 2,
      createdAt: "2026-09-05T10:00:00.000Z",
    });
    const database = await open();
    await transact(database, (photos, snapshot) => {
      photos.clear();
      snapshot.clear();
      photos.put(photo("old-photo"));
    });
    const id = `crash-${stage}`;
    localStorage.setItem("rook-restore-journal-v1", JSON.stringify({
      version: 1,
      id,
      startedAt: "2026-09-05T10:00:00.000Z",
      previousState: JSON.stringify(oldState),
    }));
    if (stage !== "journal-only") {
      await transact(database, (photos, snapshot) => {
        snapshot.clear();
        snapshot.put(photo("old-photo"));
        snapshot.put({ id: "__rook_restore_snapshot__", transactionId: id });
        photos.clear();
        photos.put(photo("new-photo"));
      });
    }
    if (stage === "state-written")
      localStorage.setItem("lift-v2-state", JSON.stringify(newState));
    database.close();
  }, { stage, oldState, newState });
}

async function storedPhotoIds(page, storeName = "photos") {
  return page.evaluate((name) => new Promise((resolve, reject) => {
    const request = indexedDB.open("rook-workout-media", 3);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const get = database.transaction(name, "readonly").objectStore(name).getAllKeys();
      get.onsuccess = () => { database.close(); resolve(get.result); };
      get.onerror = () => reject(get.error);
    };
  }), storeName);
}

for (const stage of ["journal-only", "photos-staged", "state-written"]) {
  const { context, page } = await openCase(stage);
  await simulate(page, stage);
  await page.reload({ waitUntil: "networkidle" });
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
  assert.equal(state.profile.name, "Before interrupted restore", `${stage}: previous state restored`);
  assert.deepEqual(await storedPhotoIds(page), ["old-photo"], `${stage}: previous photos restored`);
  assert.deepEqual(await storedPhotoIds(page, "restore-snapshot"), [], `${stage}: snapshot cleared`);
  assert.equal(await page.evaluate(() => localStorage.getItem("rook-restore-journal-v1")), null);
  await context.close();
}

// Once the journal is removed, the new pair is committed and only stale temp data is cleaned.
{
  const { context, page } = await openCase("committed");
  await simulate(page, "state-written");
  await page.evaluate(() => localStorage.removeItem("rook-restore-journal-v1"));
  await page.reload({ waitUntil: "networkidle" });
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("lift-v2-state")));
  assert.equal(state.profile.name, "Partially restored state");
  assert.deepEqual(await storedPhotoIds(page), ["new-photo"]);
  assert.deepEqual(await storedPhotoIds(page, "restore-snapshot"), []);
  await context.close();
}

await browser.close();
console.log("Restore crash QA passed: journal-only, photo-staged, state-written, and post-commit interruption points recover deterministically.");
