import { STORAGE_KEY, serializeState } from "./domain.js";
import {
  discardWorkoutPhotoRestoreSnapshot,
  rollbackWorkoutPhotoRestore,
} from "./workoutPhotos.js";

export const RESTORE_JOURNAL_KEY = "rook-restore-journal-v1";
const RESTORE_JOURNAL_VERSION = 1;

function transactionId() {
  return globalThis.crypto?.randomUUID?.() ||
    `restore-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseJournal(raw) {
  if (!raw) return null;
  let journal;
  try {
    journal = JSON.parse(raw);
  } catch {
    throw new Error("ROOK could not safely recover an interrupted restore.");
  }
  if (
    journal?.version !== RESTORE_JOURNAL_VERSION ||
    typeof journal.id !== "string" ||
    (journal.previousState !== null && typeof journal.previousState !== "string")
  )
    throw new Error("ROOK could not safely recover an interrupted restore.");
  return journal;
}

export function beginRestoreTransaction(currentState, storage = globalThis.localStorage) {
  let previousState = serializeState(currentState);
  if (typeof storage.getItem === "function")
    previousState = storage.getItem(STORAGE_KEY);
  const journal = {
    version: RESTORE_JOURNAL_VERSION,
    id: transactionId(),
    startedAt: new Date().toISOString(),
    previousState,
  };
  storage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));
  return journal;
}

export async function recoverInterruptedRestore({
  storage = globalThis.localStorage,
  rollbackPhotos = rollbackWorkoutPhotoRestore,
  discardSnapshot = discardWorkoutPhotoRestoreSnapshot,
} = {}) {
  const journal = parseJournal(storage.getItem(RESTORE_JOURNAL_KEY));
  if (!journal) {
    await discardSnapshot().catch(() => {});
    return "clean";
  }
  await rollbackPhotos(journal.id);
  if (journal.previousState === null && typeof storage.removeItem === "function")
    storage.removeItem(STORAGE_KEY);
  else storage.setItem(STORAGE_KEY, journal.previousState);
  storage.removeItem(RESTORE_JOURNAL_KEY);
  await discardSnapshot().catch(() => {});
  return "recovered";
}

export async function finishRestoreTransaction({
  storage = globalThis.localStorage,
  discardSnapshot = discardWorkoutPhotoRestoreSnapshot,
} = {}) {
  // Removing the journal is the cross-store commit point. From here on the
  // new JSON and photo dataset are authoritative; a leftover snapshot is inert.
  storage.removeItem(RESTORE_JOURNAL_KEY);
  await discardSnapshot().catch(() => {});
}
