import {
  Zip,
  ZipDeflate,
  ZipPassThrough,
  strFromU8,
  strToU8,
  unzipSync,
} from "fflate";
import {
  STORAGE_KEY,
  deserializeState,
  serializeState,
} from "./domain.js";
import {
  getWorkoutPhoto,
  listWorkoutPhotoMetadata,
  stageWorkoutPhotoRestore,
} from "./workoutPhotos.js";
import {
  beginRestoreTransaction,
  finishRestoreTransaction,
  recoverInterruptedRestore,
} from "./restoreTransaction.js";

export const BACKUP_TYPE = "rook-backup";
export const BACKUP_SCHEMA_VERSION = 1;
export const DATA_FORMAT_VERSION = 3;
export const APP_VERSION =
  typeof __ROOK_APP_VERSION__ !== "undefined" ? __ROOK_APP_VERSION__ : "1.0.0";

export class BackupError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BackupError";
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, message) {
  throw new BackupError(code, message);
}

function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("invalid-backup", `${label} is missing or invalid.`);
  return value;
}

function countsFor(state, photos = []) {
  const workouts = Array.isArray(state.workouts) ? state.workouts : [];
  const completedSets = workouts.reduce(
    (total, workout) =>
      total + (workout.exercises || []).reduce(
        (exerciseTotal, exercise) =>
          exerciseTotal + (exercise.sets || []).filter((set) => set.completed).length,
        0,
      ),
    0,
  );
  return {
    programDays: state.program?.days?.length || 0,
    workouts: workouts.length,
    completedSets,
    workoutPhotos: photos.length,
    coachConversations: Array.isArray(state.conversations) ? state.conversations.length : 0,
    weightCheckins: Array.isArray(state.weightCheckins) ? state.weightCheckins.length : 0,
  };
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle)
    fail("unsupported-browser", "This browser cannot verify backup integrity.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function blobBytes(blob) {
  if (typeof blob?.arrayBuffer === "function")
    return new Uint8Array(await blob.arrayBuffer());
  if (typeof FileReader !== "undefined")
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.onerror = () => reject(reader.error || new Error("Photo read failed."));
      reader.readAsArrayBuffer(blob);
    });
  fail("photo-read-failed", "A workout photo could not be read. No backup was created.");
}

function extensionFor(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/heic") return "heic";
  return "jpg";
}

function hasImageSignature(bytes, mimeType) {
  if (mimeType === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png")
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mimeType === "image/webp")
    return strFromU8(bytes.subarray(0, 4)) === "RIFF" && strFromU8(bytes.subarray(8, 12)) === "WEBP";
  if (mimeType === "image/heic")
    return strFromU8(bytes.subarray(4, 8)) === "ftyp";
  return false;
}

function validateDurableState(raw) {
  const state = asObject(raw, "ROOK data");
  if (![2, 3].includes(state.schemaVersion)) {
    if (Number(state.schemaVersion) > DATA_FORMAT_VERSION)
      fail("newer-data-version", "This backup was created by a newer version of ROOK. Update ROOK before restoring it.");
    fail("unsupported-data-version", "This backup uses an unsupported ROOK data format.");
  }
  if (state.schemaVersion === 3) {
    for (const key of [
      "profile", "program", "activeWorkout", "activeOptionalSession",
      "todayAdaptation", "weekScheduleOverrides", "workoutOccurrenceOverrides",
      "optionalSessions", "workouts", "workoutCorrections",
      "programChangeHistory", "conversations", "activeCoachConversationId",
      "progressFocusOverrideByPlanId", "weightTrackingEnabled", "weightCheckins", "ai",
    ])
      if (!Object.hasOwn(state, key))
        fail("invalid-backup", `Required ROOK data is missing: ${key}.`);
  }
  asObject(state.profile, "Training profile");
  if (state.program !== null) asObject(state.program, "Training plan");
  for (const key of ["workouts", "optionalSessions", "workoutCorrections", "programChangeHistory", "conversations", "weightCheckins"])
    if (state[key] !== undefined && !Array.isArray(state[key]))
      fail("invalid-backup", `${key} is invalid.`);
  if (state.planVersions !== undefined && !Array.isArray(state.planVersions))
    fail("invalid-backup", "planVersions is invalid.");
  if (state.completedTrainingBlocks !== undefined && !Array.isArray(state.completedTrainingBlocks))
    fail("invalid-backup", "completedTrainingBlocks is invalid.");
  if (state.customExercises !== undefined && !Array.isArray(state.customExercises))
    fail("invalid-backup", "customExercises is invalid.");
  if (state.exerciseAliases !== undefined && !Array.isArray(state.exerciseAliases))
    fail("invalid-backup", "exerciseAliases is invalid.");
  const hydrated = deserializeState(state);
  if (state.program && !hydrated.program)
    fail("invalid-backup", "The training plan in this backup is invalid.");
  return hydrated;
}

export function migrateBackupManifest(manifest) {
  const value = asObject(manifest, "Backup metadata");
  if (value.type !== BACKUP_TYPE)
    fail("wrong-file-type", "Choose a ROOK backup ZIP file.");
  const version = Number(value.schemaVersion);
  if (version > BACKUP_SCHEMA_VERSION)
    fail("newer-backup-version", "This backup was created by a newer version of ROOK. Update ROOK before restoring it.");
  if (version < 1 || !Number.isInteger(version))
    fail("unsupported-backup-version", "This ROOK backup version is not supported.");
  if (!value.createdAt || Number.isNaN(new Date(value.createdAt).getTime()))
    fail("invalid-backup", "The backup creation date is missing or invalid.");
  if (!Number.isInteger(Number(value.dataFormatVersion)))
    fail("invalid-backup", "The ROOK data format version is missing.");
  asObject(value.counts, "Backup validation counts");
  if (!Array.isArray(value.photos) || value.photosIncluded !== true)
    fail("invalid-backup", "Workout photo metadata is missing or invalid.");
  const omittedPhotos = value.omittedPhotos ?? [];
  if (!Array.isArray(omittedPhotos))
    fail("invalid-backup", "Unavailable workout photo metadata is invalid.");
  for (const photo of omittedPhotos) {
    asObject(photo, "Unavailable workout photo metadata");
    if (!photo.id || !photo.reason || (photo.workoutId !== null && !photo.workoutId))
      fail("invalid-backup", "Unavailable workout photo metadata is invalid.");
  }
  // v1 is the first format. Future migrations are applied here in sequence.
  return {
    ...value,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    photosComplete: value.photosComplete ?? omittedPhotos.length === 0,
    omittedPhotos,
  };
}

function photoReferences(state) {
  const references = new Map();
  for (const workout of state.workouts || []) {
    if (!workout?.photoId) continue;
    if (!workout.id || references.has(workout.photoId))
      fail("invalid-backup", "Workout photo references are invalid.");
    references.set(workout.photoId, workout.id);
  }
  return references;
}

export function durableBackupState(state) {
  const durable = structuredClone(state);
  delete durable.selectedDay;
  delete durable.selectedDate;
  delete durable.coachDraft;
  delete durable.dataSafety;
  durable.ai = {
    ...(durable.ai?.lastPlanSource ? { lastPlanSource: durable.ai.lastPlanSource } : {}),
    ...(durable.ai?.planUpgradeDismissed !== undefined
      ? { planUpgradeDismissed: Boolean(durable.ai.planUpgradeDismissed) }
      : {}),
  };
  return durable;
}

async function unavailableLocalPhotos(state, photoRecords, photoLoader) {
  const references = photoReferences(state);
  const records = Array.isArray(photoRecords) ? photoRecords : [];
  const byId = new Map(records.map((record) => [record?.id, record]));
  const unavailable = [];
  for (const [id, workoutId] of references) {
    const metadata = byId.get(id);
    const record = metadata?.blob ? metadata : await photoLoader?.(id);
    if (!record?.blob || record.workoutId !== workoutId) {
      unavailable.push({ id, workoutId, reason: "missing" });
      continue;
    }
    const mimeType = String(record.mimeType || record.blob.type || "");
    try {
      const bytes = await blobBytes(record.blob);
      if (!mimeType.startsWith("image/") || !hasImageSignature(bytes, mimeType))
        unavailable.push({ id, workoutId, reason: "unreadable" });
    } catch {
      unavailable.push({ id, workoutId, reason: "unreadable" });
    }
  }
  const seenOrphans = new Set();
  for (const record of records) {
    if (!record?.id || references.has(record.id) || seenOrphans.has(record.id)) continue;
    seenOrphans.add(record.id);
    unavailable.push({ id: record.id, workoutId: record.workoutId || null, reason: "orphaned" });
  }
  return unavailable;
}

export async function buildBackupArchive(
  state,
  photoRecords,
  {
    createdAt = new Date().toISOString(),
    allowUnavailablePhotos = false,
    photoLoader,
    returnParts = false,
  } = {},
) {
  let durableState = durableBackupState(
    validateDurableState(JSON.parse(serializeState(durableBackupState(state)))),
  );
  const unavailable = await unavailableLocalPhotos(durableState, photoRecords, photoLoader);
  if (unavailable.length && !allowUnavailablePhotos) {
    const count = unavailable.length;
    throw new BackupError(
      "unavailable-photos",
      `${count} workout ${count === 1 ? "photo is" : "photos are"} unavailable. Your ROOK data is unchanged.`,
      { unavailablePhotos: unavailable },
    );
  }
  if (unavailable.length) {
    const unavailableReferences = new Set(
      unavailable.filter((photo) => photo.reason !== "orphaned").map((photo) => photo.id),
    );
    durableState = structuredClone(durableState);
    durableState.workouts = durableState.workouts.map((workout) =>
      unavailableReferences.has(workout.photoId)
        ? { ...workout, photoId: null }
        : workout,
    );
  }
  const references = photoReferences(durableState);
  const byId = new Map((photoRecords || []).map((record) => [record?.id, record]));
  const chunks = [];
  let finishZip;
  let failZip;
  const completedZip = new Promise((resolve, reject) => {
    finishZip = resolve;
    failZip = reject;
  });
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      failZip(error);
      return;
    }
    chunks.push(chunk);
    if (final && returnParts) {
      finishZip({ parts: chunks, bytes: null });
    } else if (final) {
      const size = chunks.reduce((total, item) => total + item.byteLength, 0);
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const item of chunks) {
        bytes.set(item, offset);
        offset += item.byteLength;
      }
      finishZip({ parts: null, bytes });
    }
  });
  const photos = [];
  let index = 0;
  for (const [id, workoutId] of references) {
    const metadata = byId.get(id);
    const record = metadata?.blob ? metadata : await photoLoader?.(id);
    if (!record?.blob || record.workoutId !== workoutId)
      fail("photo-read-failed", "A workout photo could not be read. No backup was created.");
    const mimeType = String(record.mimeType || record.blob.type || "");
    if (!mimeType.startsWith("image/"))
      fail("photo-read-failed", "A workout photo has an invalid format. No backup was created.");
    const bytes = await blobBytes(record.blob);
    if (!hasImageSignature(bytes, mimeType))
      fail("photo-read-failed", "A workout photo is unreadable. No backup was created.");
    const path = `photos/${String(++index).padStart(6, "0")}.${extensionFor(mimeType)}`;
    const photoEntry = new ZipPassThrough(path);
    zip.add(photoEntry);
    photoEntry.push(bytes, true);
    photos.push({
      id,
      workoutId,
      path,
      mimeType,
      size: bytes.byteLength,
      sha256: await sha256(bytes),
      width: Number(record.width) || null,
      height: Number(record.height) || null,
      createdAt: record.createdAt || null,
    });
  }
  const counts = countsFor(durableState, photos);
  const manifest = {
    type: BACKUP_TYPE,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt,
    dataFormatVersion: DATA_FORMAT_VERSION,
    photosIncluded: true,
    photosComplete: unavailable.length === 0,
    omittedPhotos: unavailable,
    counts,
    photos,
  };
  const manifestEntry = new ZipDeflate("manifest.json", { level: 6 });
  zip.add(manifestEntry);
  manifestEntry.push(strToU8(JSON.stringify(manifest, null, 2)), true);
  const stateEntry = new ZipDeflate("data/state.json", { level: 6 });
  zip.add(stateEntry);
  stateEntry.push(strToU8(serializeState(durableState)), true);
  zip.end();
  const output = await completedZip;
  return {
    ...output,
    manifest,
    filename: `ROOK-backup-${createdAt.slice(0, 10)}.zip`,
  };
}

function parseJsonEntry(entries, path, label) {
  const bytes = entries[path];
  if (!bytes) fail("invalid-backup", `${label} is missing.`);
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    fail("corrupted-backup", `${label} is corrupted.`);
  }
}

export async function parseBackupArchive(source) {
  let entries;
  try {
    const bytes = source instanceof Uint8Array
      ? source
      : new Uint8Array(await source.arrayBuffer());
    entries = unzipSync(bytes);
  } catch {
    fail("wrong-file-type", "This file is not a valid ROOK backup ZIP.");
  }
  const manifest = migrateBackupManifest(parseJsonEntry(entries, "manifest.json", "Backup metadata"));
  if (
    typeof manifest.photosComplete !== "boolean" ||
    (manifest.photosComplete && manifest.omittedPhotos.length) ||
    (!manifest.photosComplete && !manifest.omittedPhotos.length)
  )
    fail("invalid-backup", "Workout photo completeness metadata is invalid.");
  if (Number(manifest.dataFormatVersion) > DATA_FORMAT_VERSION)
    fail("newer-data-version", "This backup was created by a newer version of ROOK. Update ROOK before restoring it.");
  const rawState = parseJsonEntry(entries, "data/state.json", "ROOK data");
  if (Number(rawState?.schemaVersion) !== Number(manifest.dataFormatVersion))
    fail("corrupted-backup", "Backup metadata does not match its ROOK data.");
  const state = validateDurableState(rawState);
  const allowedPaths = new Set(["manifest.json", "data/state.json"]);
  const references = photoReferences(state);
  const seenIds = new Set();
  const omittedIds = new Set();
  for (const photo of manifest.omittedPhotos) {
    if (omittedIds.has(photo.id))
      fail("invalid-backup", "Unavailable workout photo metadata is invalid.");
    omittedIds.add(photo.id);
  }
  const photos = [];
  for (const photo of Array.isArray(manifest.photos) ? manifest.photos : []) {
    asObject(photo, "Workout photo metadata");
    if (
      !photo.id ||
      !/^photos\/[a-zA-Z0-9._-]+$/.test(photo.path) ||
      seenIds.has(photo.id) ||
      omittedIds.has(photo.id)
    )
      fail("invalid-backup", "Workout photo metadata is invalid.");
    if (references.get(photo.id) !== photo.workoutId)
      fail("invalid-backup", "A workout photo is linked to the wrong workout.");
    const bytes = entries[photo.path];
    if (!bytes || bytes.byteLength !== Number(photo.size))
      fail("corrupted-photo", "A workout photo is missing or corrupted. Current ROOK data was not changed.");
    if (!String(photo.mimeType || "").startsWith("image/"))
      fail("corrupted-photo", "A workout photo has an invalid format. Current ROOK data was not changed.");
    if (!hasImageSignature(bytes, photo.mimeType))
      fail("corrupted-photo", "A workout photo is unreadable. Current ROOK data was not changed.");
    if ((await sha256(bytes)) !== photo.sha256)
      fail("corrupted-photo", "A workout photo failed its integrity check. Current ROOK data was not changed.");
    allowedPaths.add(photo.path);
    seenIds.add(photo.id);
    photos.push({
      id: photo.id,
      workoutId: photo.workoutId,
      blob: new Blob([bytes], { type: photo.mimeType }),
      mimeType: photo.mimeType,
      width: Number(photo.width) || null,
      height: Number(photo.height) || null,
      createdAt: photo.createdAt || manifest.createdAt,
    });
  }
  if (seenIds.size !== references.size)
    fail("corrupted-photo", "One or more workout photos are missing. Current ROOK data was not changed.");
  for (const path of Object.keys(entries))
    if (!allowedPaths.has(path) && !path.endsWith("/"))
      fail("invalid-backup", "This backup contains unexpected data.");
  const actualCounts = countsFor(state, photos);
  for (const [key, value] of Object.entries(actualCounts))
    if (Number(manifest.counts?.[key]) !== value)
      fail("corrupted-backup", "Backup validation counts do not match its contents.");
  return { manifest, state, photos };
}

export async function createBackup(state, options) {
  const photoMetadata = await listWorkoutPhotoMetadata();
  return buildBackupArchive(state, photoMetadata, {
    ...options,
    photoLoader: getWorkoutPhoto,
    returnParts: true,
  });
}

export async function commitPreparedRestore(prepared, {
  currentState,
  storage = globalThis.localStorage,
  beginRestore = beginRestoreTransaction,
  stagePhotos = stageWorkoutPhotoRestore,
  recoverRestore = recoverInterruptedRestore,
  finishRestore = finishRestoreTransaction,
} = {}) {
  const journal = beginRestore(currentState, storage);
  const restoredState = serializeState(prepared.state);
  try {
    await stagePhotos(prepared.photos, journal.id);
    storage.setItem(STORAGE_KEY, restoredState);
    await finishRestore({ storage });
  } catch (error) {
    try {
      await recoverRestore({ storage });
    } catch {
      fail("rollback-failed", "Restore failed and ROOK could not verify the rollback. Keep this app open and try again.");
    }
    throw error instanceof BackupError
      ? error
      : new BackupError("restore-write-failed", "Restore failed. Your current ROOK data is unchanged.");
  }
  return prepared.state;
}

let persistentStorageRequest;
export function requestPersistentStorage() {
  if (persistentStorageRequest) return persistentStorageRequest;
  persistentStorageRequest = (async () => {
    try {
      if (!navigator.storage?.persisted || !navigator.storage?.persist) return "unsupported";
      if (await navigator.storage.persisted()) return "granted";
      return (await navigator.storage.persist()) ? "granted" : "not-granted";
    } catch {
      return "unsupported";
    }
  })();
  return persistentStorageRequest;
}

export function backupUserMessage(error, action = "restore") {
  if (error instanceof BackupError) return error.message;
  if (error?.name === "QuotaExceededError")
    return action === "backup"
      ? "There isn’t enough device storage to create this backup. Free some space and try again."
      : "There isn’t enough device storage to restore this backup. Free some space and try again.";
  return action === "backup"
    ? "Backup creation failed. Your ROOK data is unchanged."
    : "Restore failed. Your current ROOK data is unchanged.";
}

export function backupFile(archive) {
  return new File(archive.parts || [archive.bytes], archive.filename, {
    type: "application/zip",
  });
}

export function downloadBackupFile(file) {
  if (!globalThis.URL?.createObjectURL || !globalThis.document)
    fail("unsupported-browser", "This browser cannot save backup files.");
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function presentBackupFile(file) {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "ROOK backup" });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      // A browser can report file sharing support and still fail at runtime.
    }
  }
  downloadBackupFile(file);
  return "downloaded";
}
