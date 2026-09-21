import { STORAGE_KEY, serializeState } from "./domain.js";
import { INSTALL_META_KEY, forgetStorageSession, withStorageTransaction } from './localStateStorage.js';
import {
  discardWorkoutPhotoRestoreSnapshot,
  rollbackWorkoutPhotoRestore,
  notifyWorkoutPhotoChanges,
} from "./workoutPhotos.js";

export const RESTORE_JOURNAL_KEY = "rook-restore-journal-v1";
const RESTORE_JOURNAL_VERSION = 1;

function transactionId() {
  return globalThis.crypto?.randomUUID?.() ||
    `restore-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseJournal(raw) {
  if (raw === null) return null;
  let journal;
  try {
    journal = JSON.parse(raw);
  } catch {
    throw new Error("ROOK could not safely recover an interrupted restore.");
  }
  if (
    journal?.version !== RESTORE_JOURNAL_VERSION ||
    typeof journal.id !== "string" ||
    (journal.previousState !== null && typeof journal.previousState !== "string") ||
    (Object.hasOwn(journal, 'previousMeta') && journal.previousMeta !== null && typeof journal.previousMeta !== 'string')
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
    previousMeta: storage.getItem?.(INSTALL_META_KEY) ?? null,
  };
  storage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));
  return journal;
}

export function recoverInterruptedRestore(options = {}) {
  return options.lockHeld ? recoverRestoreLocked(options) : withStorageTransaction(() => recoverRestoreLocked(options));
}
async function recoverRestoreLocked({
  storage = globalThis.localStorage,
  rollbackPhotos = rollbackWorkoutPhotoRestore,
  discardSnapshot = discardWorkoutPhotoRestoreSnapshot,
} = {}) {
  const journalRaw = storage.getItem(RESTORE_JOURNAL_KEY);
  if (journalRaw === null) return 'clean';
  const metaRaw = storage.getItem(INSTALL_META_KEY);
  if (metaRaw && JSON.parse(metaRaw)?.deletePending) return 'delete-incomplete';
  const journal = parseJournal(journalRaw);
  if (!journal) {
    return "clean";
  }
  await rollbackPhotos(journal.id);
  if (journal.previousState === null && typeof storage.removeItem === "function")
    storage.removeItem(STORAGE_KEY);
  else storage.setItem(STORAGE_KEY, journal.previousState);
  if (Object.hasOwn(journal, 'previousMeta')) {
    if (journal.previousMeta === null) storage.removeItem(INSTALL_META_KEY);
    else storage.setItem(INSTALL_META_KEY, journal.previousMeta);
  }
  storage.removeItem(RESTORE_JOURNAL_KEY);
  forgetStorageSession(storage);
  await discardSnapshot().catch(() => {});
  notifyWorkoutPhotoChanges();
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
  notifyWorkoutPhotoChanges();
}
