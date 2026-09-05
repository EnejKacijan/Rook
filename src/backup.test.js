import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createReturningUserFixture } from "./demoFixture.js";
import {
  BACKUP_SCHEMA_VERSION,
  BackupError,
  buildBackupArchive,
  commitPreparedRestore,
  durableBackupState,
  parseBackupArchive,
} from "./backup.js";
import { deserializeState, serializeState, startWorkout, STORAGE_KEY } from "./domain.js";
import {
  RESTORE_JOURNAL_KEY,
  beginRestoreTransaction,
  recoverInterruptedRestore,
} from "./restoreTransaction.js";

function representativeState() {
  const state = createReturningUserFixture(3);
  state.gymProfiles = [
    {
      schemaVersion: 1,
      id: "gym-main-stable",
      name: "Main Gym",
      equipment: ["full gym"],
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:00:00.000Z",
    },
    {
      schemaVersion: 1,
      id: "gym-home-stable",
      name: "Home",
      equipment: ["dumbbells", "resistance bands"],
      createdAt: "2026-08-02T10:00:00.000Z",
      updatedAt: "2026-08-03T10:00:00.000Z",
    },
  ];
  state.defaultGymProfileId = "gym-main-stable";
  state.substitutionPreferences = [
    {
      schemaVersion: 1,
      id: "sub-barbell-bench-press-gym-home-stable",
      sourceExerciseId: "barbell-bench-press",
      replacementExerciseId: "dumbbell-bench-press",
      gymProfileId: "gym-home-stable",
      createdAt: "2026-08-04T10:00:00.000Z",
      updatedAt: "2026-08-04T10:00:00.000Z",
    },
  ];
  state.customExercises = [{
    schemaVersion: 1,
    id: "custom-exercise-prime-press",
    name: "Prime Incline Press",
    equipment: ["machines"],
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps"],
    pattern: "horizontal-push",
    loggingType: "weight_reps",
    notes: "Seat 4",
    createdAt: "2026-08-04T10:00:00.000Z",
    updatedAt: "2026-08-04T10:00:00.000Z",
    deletedAt: null,
  }];
  state.exerciseAliases = [{
    schemaVersion: 1,
    id: "exercise-alias-prime",
    alias: "Prime Chest Machine",
    normalizedAlias: "prime chest machine",
    exerciseId: "custom-exercise-prime-press",
    createdAt: "2026-08-04T10:00:00.000Z",
    updatedAt: "2026-08-04T10:00:00.000Z",
    deletedAt: null,
  }];
  state.profile.units = "lb";
  state.profile.rirEnabled = true;
  state.profile.restTimerSeconds = 105;
  state.profile.avoid = "No overhead pressing";
  state.program.source = "ai-import";
  state.program.importMetadata = { source: "notes", importedAt: 12345 };
  Object.assign(state.program.days[0].exercises[0], {
    exerciseId: "imported-custom-backup-press",
    exerciseSource: "imported-custom",
    importedName: "My Backup Press",
    originalImportedName: "My Backup Press",
    importedExercise: {
      id: "imported-custom-backup-press",
      name: "My Backup Press",
      source: "imported",
      pattern: null,
      muscles: null,
      equipment: null,
    },
    matchStatus: "confirmed-custom",
    targetRir: null,
    restSeconds: 90,
    personalNote: "Keep the setup stable",
  });
  state.workouts[0].sessionNote = "Strong session";
  state.workouts[0].photoId = "photo-1";
  state.workouts[0].exercises[0].sets[0].rir = 1;
  state.programChangeHistory = [{ id: "change-1", source: "coach", appliedAt: 44 }];
  state.conversations = [{
    id: "coach-message-1",
    conversationId: "coach-thread-1",
    user: "Adjust my next session",
    reply: { text: "I prepared a reviewed adjustment.", action: null },
    actionResult: { status: "applied", appliedAt: 45 },
  }];
  state.activeCoachConversationId = "coach-thread-1";
  state.weightTrackingEnabled = true;
  state.weightCheckins = [{ id: "weight-1", localDate: "2026-09-05", weightKg: 80 }];
  state.selectedDate = "2026-09-05";
  state.selectedDay = "Sat";
  state.coachDraft = "temporary composer text";
  state.dataSafety = { lastBackupCreatedAt: "2026-09-04T10:00:00.000Z" };
  state.ai = { available: true, provider: "runtime-provider", repairingPlan: true, lastPlanError: "temporary", lastPlanSource: "ai-import" };
  const restriction = state.profile.avoid;
  state.profile.avoid = "";
  state.activeWorkout = startWorkout(state, state.program.days[0]);
  state.profile.avoid = restriction;
  state.activeWorkout.sessionNote = "Active workout note";
  Object.assign(state.activeWorkout.exercises[0].sets[0], {
    weight: 42.5,
    reps: 9,
    rir: 2,
    completed: true,
  });
  // Fixtures created in memory bypass normal startup hydration. Canonicalize it
  // once so the equality assertion mirrors a real, already-loaded ROOK state.
  return deserializeState(state);
}

function photoRecord(state = representativeState()) {
  return {
    id: "photo-1",
    workoutId: state.workouts[0].id,
    blob: new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" }),
    mimeType: "image/jpeg",
    width: 100,
    height: 120,
    createdAt: "2026-09-05T10:00:00.000Z",
  };
}

function rewriteManifest(bytes, change) {
  const entries = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(entries["manifest.json"]));
  change(manifest);
  entries["manifest.json"] = strToU8(JSON.stringify(manifest));
  return zipSync(entries);
}

function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function firstDifference(left, right, path = "state") {
  if (Object.is(left, right)) return null;
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return { path, left, right };
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const difference = firstDifference(left[key], right[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

describe("ROOK backup archives", () => {
  it("round-trips representative durable data and its private workout photo", async () => {
    const state = representativeState();
    const archive = await buildBackupArchive(state, [photoRecord(state)], {
      createdAt: "2026-09-05T12:00:00.000Z",
    });
    const restored = await parseBackupArchive(archive.bytes);
    const archivedState = JSON.parse(strFromU8(unzipSync(archive.bytes)["data/state.json"]));
    expect(restored.manifest.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(restored.manifest.counts.workoutPhotos).toBe(1);
    expect(restored.state.program.id).toBe(state.program.id);
    expect(restored.state.program.name).toBe(state.program.name);
    expect(restored.state.program.importMetadata).toEqual(state.program.importMetadata);
    expect(restored.state.program.days[0].exercises[0].importedExercise.name).toBe("My Backup Press");
    expect(restored.state.program.days[0].exercises[0].personalNote).toBe("Keep the setup stable");
    expect(restored.state.workouts).toEqual(state.workouts);
    expect(restored.state.profile.units).toBe("lb");
    expect(restored.state.gymProfiles).toEqual(state.gymProfiles);
    expect(restored.state.defaultGymProfileId).toBe("gym-main-stable");
    expect(restored.state.substitutionPreferences).toEqual(state.substitutionPreferences);
    expect(restored.state.programChangeHistory).toEqual(state.programChangeHistory);
    expect(restored.state.selectedDate).toBeNull();
    expect(archivedState).not.toHaveProperty("selectedDate");
    expect(archivedState).not.toHaveProperty("selectedDay");
    expect(archivedState).not.toHaveProperty("coachDraft");
    expect(archivedState).not.toHaveProperty("dataSafety");
    expect(archivedState.ai).toEqual({ lastPlanSource: "ai-import" });
    expect(restored.photos[0]).toMatchObject({
      id: "photo-1",
      workoutId: state.workouts[0].id,
      mimeType: "image/jpeg",
    });
    expect(Array.from(await readBlob(restored.photos[0].blob))).toEqual([255, 216, 255, 217]);
    expect(restored.manifest.photos[0].sha256).toBe(
      await digestHex(new Uint8Array([255, 216, 255, 217])),
    );
    const expected = deserializeState(JSON.parse(serializeState(durableBackupState(state))));
    expect(firstDifference(durableBackupState(restored.state), durableBackupState(expected))).toBeNull();
    expect(restored.state.activeWorkout.exercises[0].sets[0]).toMatchObject({
      weight: 42.5,
      reps: 9,
      rir: 2,
      completed: true,
    });
  });

  it("supports empty history and a large history without changing counts", async () => {
    const empty = createReturningUserFixture(0);
    empty.workouts = [];
    const emptyArchive = await buildBackupArchive(empty, []);
    expect((await parseBackupArchive(emptyArchive.bytes)).manifest.counts.workouts).toBe(0);

    const large = createReturningUserFixture(0);
    const sample = createReturningUserFixture(1).workouts[0];
    large.workouts = Array.from({ length: 1200 }, (_, index) => ({
      ...structuredClone(sample),
      id: `workout-${index}`,
      completedAt: Number(sample.completedAt || Date.now()) + index,
    }));
    const largeArchive = await buildBackupArchive(large, []);
    expect((await parseBackupArchive(largeArchive.bytes)).manifest.counts.workouts).toBe(1200);
  });

  it("rejects missing photos instead of silently producing an incomplete backup", async () => {
    const state = representativeState();
    await expect(buildBackupArchive(state, [])).rejects.toMatchObject({
      code: "unavailable-photos",
    });
    const partial = await buildBackupArchive(state, [], { allowUnavailablePhotos: true });
    const restored = await parseBackupArchive(partial.bytes);
    expect(partial.manifest).toMatchObject({ photosComplete: false });
    expect(partial.manifest.omittedPhotos).toEqual([
      { id: "photo-1", workoutId: state.workouts[0].id, reason: "missing" },
    ]);
    expect(restored.state.workouts[0].photoId).toBeNull();
    expect(state.workouts[0].photoId).toBe("photo-1");
  });

  it("rejects corrupted photo assets and future backup versions", async () => {
    const state = representativeState();
    const archive = await buildBackupArchive(state, [photoRecord(state)]);
    const entries = unzipSync(archive.bytes);
    const photoPath = JSON.parse(strFromU8(entries["manifest.json"])).photos[0].path;
    entries[photoPath] = new Uint8Array([0, 1, 2, 3]);
    await expect(parseBackupArchive(zipSync(entries))).rejects.toMatchObject({ code: "corrupted-photo" });

    const future = rewriteManifest(archive.bytes, (manifest) => {
      manifest.schemaVersion = BACKUP_SCHEMA_VERSION + 1;
    });
    await expect(parseBackupArchive(future)).rejects.toMatchObject({ code: "newer-backup-version" });
  });

  it("reports corrupt and orphaned local photos and only omits them explicitly", async () => {
    const corruptState = representativeState();
    const corrupt = {
      ...photoRecord(corruptState),
      blob: new Blob([new Uint8Array([0, 1, 2, 3])], { type: "image/jpeg" }),
    };
    await expect(buildBackupArchive(corruptState, [corrupt])).rejects.toMatchObject({
      code: "unavailable-photos",
      unavailablePhotos: [{ id: "photo-1", reason: "unreadable" }],
    });
    const partial = await buildBackupArchive(corruptState, [corrupt], {
      allowUnavailablePhotos: true,
    });
    expect((await parseBackupArchive(partial.bytes)).state.workouts[0].photoId).toBeNull();

    const validState = representativeState();
    const orphan = {
      ...photoRecord(validState),
      id: "orphan-photo",
      workoutId: "missing-workout",
    };
    await expect(buildBackupArchive(validState, [photoRecord(validState), orphan]))
      .rejects.toMatchObject({
        code: "unavailable-photos",
        unavailablePhotos: [{ id: "orphan-photo", reason: "orphaned" }],
      });
    const withOmission = await buildBackupArchive(
      validState,
      [photoRecord(validState), orphan],
      { allowUnavailablePhotos: true },
    );
    expect(withOmission.manifest.photosComplete).toBe(false);
    expect(withOmission.manifest.omittedPhotos[0]).toMatchObject({
      id: "orphan-photo",
      reason: "orphaned",
    });
    expect((await parseBackupArchive(withOmission.bytes)).manifest.counts.workoutPhotos).toBe(1);
  });

  it("migrates supported older state data and rejects malformed files", async () => {
    const state = createReturningUserFixture(1);
    const archive = await buildBackupArchive(state, []);
    const entries = unzipSync(archive.bytes);
    const olderState = JSON.parse(strFromU8(entries["data/state.json"]));
    olderState.schemaVersion = 2;
    entries["data/state.json"] = strToU8(JSON.stringify(olderState));
    const manifest = JSON.parse(strFromU8(entries["manifest.json"]));
    manifest.dataFormatVersion = 2;
    entries["manifest.json"] = strToU8(JSON.stringify(manifest));
    expect((await parseBackupArchive(zipSync(entries))).state.schemaVersion).toBe(3);
    await expect(parseBackupArchive(strToU8("not a zip"))).rejects.toMatchObject({ code: "wrong-file-type" });
  });

  it("commits a fully prepared restore in one state/photo replacement", async () => {
    const currentState = createReturningUserFixture(0);
    const incomingState = representativeState();
    const storage = new MemoryStorage([[STORAGE_KEY, serializeState(currentState)]]);
    const photoWrites = [];
    const restored = await commitPreparedRestore(
      { state: incomingState, photos: [photoRecord(incomingState)] },
      {
        currentState,
        storage,
        stagePhotos: async (photos, id) => photoWrites.push({ photos, id }),
        finishRestore: async ({ storage: target }) => target.removeItem(RESTORE_JOURNAL_KEY),
      },
    );
    expect(restored).toBe(incomingState);
    expect(photoWrites).toHaveLength(1);
    expect(photoWrites[0].photos[0].id).toBe("photo-1");
    expect(photoWrites[0].id).toBeTruthy();
    expect(storage.getItem(STORAGE_KEY)).toBe(serializeState(incomingState));
    expect(storage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
  });

  it("rolls state and photos back if the restore commit fails", async () => {
    const currentState = createReturningUserFixture(1);
    const incomingState = representativeState();
    const oldState = serializeState(currentState);
    const storage = new MemoryStorage([[STORAGE_KEY, oldState]]);
    const originalSet = storage.setItem.bind(storage);
    let failMainWrite = true;
    storage.setItem = (key, value) => {
      if (key === STORAGE_KEY && failMainWrite) {
        failMainWrite = false;
        throw new DOMException("full", "QuotaExceededError");
      }
      originalSet(key, value);
    };
    let photoDataset = [{ id: "old-photo" }];
    let snapshot = null;
    await expect(commitPreparedRestore(
      { state: incomingState, photos: [photoRecord(incomingState)] },
      {
        currentState,
        storage,
        stagePhotos: async (photos, id) => {
          snapshot = { id, photos: photoDataset };
          photoDataset = photos;
        },
        recoverRestore: ({ storage: target }) => recoverInterruptedRestore({
          storage: target,
          rollbackPhotos: async (id) => {
            if (snapshot?.id === id) photoDataset = snapshot.photos;
          },
          discardSnapshot: async () => { snapshot = null; },
        }),
      },
    )).rejects.toBeInstanceOf(BackupError);
    expect(photoDataset).toEqual([{ id: "old-photo" }]);
    expect(storage.getItem(STORAGE_KEY)).toBe(oldState);
    expect(storage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
  });

  it("keeps a clean install storage key absent when restore runs out of space", async () => {
    const storage = new MemoryStorage();
    const originalSet = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === STORAGE_KEY) throw new DOMException("full", "QuotaExceededError");
      originalSet(key, value);
    };
    let photoDataset = [];
    let snapshot = null;
    await expect(commitPreparedRestore(
      { state: representativeState(), photos: [photoRecord()] },
      {
        currentState: createReturningUserFixture(0),
        storage,
        stagePhotos: async (photos, id) => {
          snapshot = { id, photos: photoDataset };
          photoDataset = photos;
        },
        recoverRestore: ({ storage: target }) => recoverInterruptedRestore({
          storage: target,
          rollbackPhotos: async (id) => {
            if (snapshot?.id === id) photoDataset = snapshot.photos;
          },
          discardSnapshot: async () => { snapshot = null; },
        }),
      },
    )).rejects.toMatchObject({ code: "restore-write-failed" });
    expect(photoDataset).toEqual([]);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(storage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
  });

  it.each(["journal-only", "photos-staged", "state-written"])(
    "recovers an interrupted restore after %s",
    async (stage) => {
      const oldState = serializeState(createReturningUserFixture(1));
      const newState = serializeState(representativeState());
      const storage = new MemoryStorage([[STORAGE_KEY, oldState]]);
      const journal = beginRestoreTransaction(createReturningUserFixture(1), storage);
      let photos = [{ id: "old-photo" }];
      let snapshot = null;
      if (stage !== "journal-only") {
        snapshot = { id: journal.id, photos };
        photos = [{ id: "new-photo" }];
      }
      if (stage === "state-written") storage.setItem(STORAGE_KEY, newState);
      await recoverInterruptedRestore({
        storage,
        rollbackPhotos: async (id) => {
          if (snapshot?.id === id) photos = snapshot.photos;
        },
        discardSnapshot: async () => { snapshot = null; },
      });
      expect(storage.getItem(STORAGE_KEY)).toBe(oldState);
      expect(storage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
      expect(photos).toEqual([{ id: "old-photo" }]);
    },
  );

  it("keeps the new dataset after the journal commit point", async () => {
    const newState = serializeState(representativeState());
    const storage = new MemoryStorage([[STORAGE_KEY, newState]]);
    let rollbackCalls = 0;
    let discarded = 0;
    await recoverInterruptedRestore({
      storage,
      rollbackPhotos: async () => { rollbackCalls += 1; },
      discardSnapshot: async () => { discarded += 1; },
    });
    expect(rollbackCalls).toBe(0);
    expect(discarded).toBe(1);
    expect(storage.getItem(STORAGE_KEY)).toBe(newState);
  });
});
