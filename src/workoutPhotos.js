const DB_NAME = "rook-workout-media";
const DB_VERSION = 3;
const PHOTO_STORE = "photos";
const RESTORE_SNAPSHOT_STORE = "restore-snapshot";
const RESTORE_SNAPSHOT_MARKER = "__rook_restore_snapshot__";
const MAX_SOURCE_BYTES = 15_000_000;
const MAX_EDGE = 1600;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Photo storage failed."));
  });
}

function openPhotoDatabase() {
  if (typeof indexedDB === "undefined")
    return Promise.reject(new Error("Photo storage is unavailable on this device."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(PHOTO_STORE)
        ? request.transaction.objectStore(PHOTO_STORE)
        : database.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      if (store.indexNames.contains("workoutId") && store.index("workoutId").unique)
        store.deleteIndex("workoutId");
      if (!store.indexNames.contains("workoutId"))
        store.createIndex("workoutId", "workoutId");
      if (!store.indexNames.contains("createdAt"))
        store.createIndex("createdAt", "createdAt");
      if (!database.objectStoreNames.contains(RESTORE_SNAPSHOT_STORE))
        database.createObjectStore(RESTORE_SNAPSHOT_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Photo storage could not be opened."));
    request.onblocked = () => reject(new Error("Photo storage is busy. Close other ROOK tabs and try again."));
  });
}

async function usePhotoStore(mode, operation) {
  const database = await openPhotoDatabase();
  try {
    const transaction = database.transaction(PHOTO_STORE, mode);
    const completed = new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Photo storage failed."));
      transaction.onabort = () => reject(transaction.error || new Error("Photo storage was cancelled."));
    });
    try {
      const result = await operation(transaction.objectStore(PHOTO_STORE));
      await completed;
      return result;
    } catch (error) {
      try { transaction.abort(); } catch { /* The browser may already have aborted it. */ }
      await completed.catch(() => {});
      throw error;
    }
  } finally {
    database.close();
  }
}

async function decodeImage(file) {
  try {
    if (typeof createImageBitmap === "function")
      return { image: await createImageBitmap(file), objectUrl: null };
  } catch {
    // Some mobile formats need the browser image decoder fallback.
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("That image format could not be read."));
      element.src = objectUrl;
    });
    return { image, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function prepareWorkoutPhoto(file) {
  if (!file || !String(file.type || "").startsWith("image/"))
    throw new Error("Choose an image file.");
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error("Choose a photo smaller than 15 MB.");
  const { image, objectUrl } = await decodeImage(file);
  try {
    const sourceWidth = Number(image.width);
    const sourceHeight = Number(image.height);
    if (!sourceWidth || !sourceHeight)
      throw new Error("That image has no readable dimensions.");
    const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser could not prepare the photo.");
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("The photo could not be prepared.")),
        "image/jpeg",
        0.82,
      ),
    );
    return { blob, width, height, mimeType: "image/jpeg" };
  } finally {
    image.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function photoId() {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `workout-photo-${Date.now()}-${random}`;
}

export async function saveWorkoutPhoto(workoutId, file) {
  if (!workoutId) throw new Error("The completed workout could not be found.");
  const prepared = await prepareWorkoutPhoto(file);
  const record = {
    id: photoId(),
    workoutId,
    blob: prepared.blob,
    mimeType: prepared.mimeType,
    width: prepared.width,
    height: prepared.height,
    createdAt: new Date().toISOString(),
  };
  await usePhotoStore("readwrite", (store) => requestResult(store.put(record)));
  return { ...record, blob: undefined };
}

export function getWorkoutPhoto(id) {
  if (!id) return Promise.resolve(null);
  return usePhotoStore("readonly", (store) => requestResult(store.get(id))).then(
    (record) => record || null,
  );
}

export function deleteWorkoutPhoto(id) {
  if (!id) return Promise.resolve();
  return usePhotoStore("readwrite", (store) => requestResult(store.delete(id)));
}

export function clearWorkoutPhotos() {
  return usePhotoStore("readwrite", (store) => requestResult(store.clear()));
}

export function getAllWorkoutPhotos() {
  return usePhotoStore("readonly", (store) => requestResult(store.getAll())).then(
    (records) => Array.isArray(records) ? records : [],
  );
}

export function listWorkoutPhotoMetadata() {
  return usePhotoStore("readonly", (store) => new Promise((resolve, reject) => {
    const records = [];
    const request = store.openCursor();
    request.onerror = () => reject(request.error || new Error("Photo storage failed."));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(records);
        return;
      }
      const { blob, ...metadata } = cursor.value;
      records.push(metadata);
      cursor.continue();
    };
  }));
}

export function replaceWorkoutPhotos(records) {
  const prepared = Array.isArray(records) ? records : [];
  return usePhotoStore("readwrite", async (store) => {
    await requestResult(store.clear());
    for (const record of prepared) await requestResult(store.put(record));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Photo storage failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Photo storage was cancelled."));
  });
}

function copyStoreWithCursor(source, destination) {
  return new Promise((resolve, reject) => {
    const request = source.openCursor();
    request.onerror = () => reject(request.error || new Error("Photo snapshot failed."));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const put = destination.put(cursor.value);
      put.onerror = () => reject(put.error || new Error("Photo snapshot failed."));
      put.onsuccess = () => cursor.continue();
    };
  });
}

async function useRestoreStores(operation) {
  const database = await openPhotoDatabase();
  try {
    const transaction = database.transaction(
      [PHOTO_STORE, RESTORE_SNAPSHOT_STORE],
      "readwrite",
    );
    const completed = transactionDone(transaction);
    try {
      const result = await operation(
        transaction.objectStore(PHOTO_STORE),
        transaction.objectStore(RESTORE_SNAPSHOT_STORE),
      );
      await completed;
      return result;
    } catch (error) {
      try { transaction.abort(); } catch { /* The browser may already have aborted it. */ }
      await completed.catch(() => {});
      throw error;
    }
  } finally {
    database.close();
  }
}

export function stageWorkoutPhotoRestore(records, transactionId) {
  if (!transactionId) return Promise.reject(new Error("Restore transaction is invalid."));
  const incoming = Array.isArray(records) ? records : [];
  return useRestoreStores(async (photos, snapshot) => {
    await requestResult(snapshot.clear());
    await copyStoreWithCursor(photos, snapshot);
    await requestResult(snapshot.put({
      id: RESTORE_SNAPSHOT_MARKER,
      transactionId,
      createdAt: new Date().toISOString(),
    }));
    await requestResult(photos.clear());
    for (const record of incoming) await requestResult(photos.put(record));
  });
}

export function rollbackWorkoutPhotoRestore(transactionId) {
  if (!transactionId) return Promise.resolve(false);
  return useRestoreStores(async (photos, snapshot) => {
    const marker = await requestResult(snapshot.get(RESTORE_SNAPSHOT_MARKER));
    if (marker?.transactionId !== transactionId) return false;
    await requestResult(photos.clear());
    await new Promise((resolve, reject) => {
      const request = snapshot.openCursor();
      request.onerror = () => reject(request.error || new Error("Photo recovery failed."));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        if (cursor.key === RESTORE_SNAPSHOT_MARKER) {
          cursor.continue();
          return;
        }
        const put = photos.put(cursor.value);
        put.onerror = () => reject(put.error || new Error("Photo recovery failed."));
        put.onsuccess = () => cursor.continue();
      };
    });
    await requestResult(snapshot.clear());
    return true;
  });
}

export function discardWorkoutPhotoRestoreSnapshot() {
  return usePhotoDatabaseStore(RESTORE_SNAPSHOT_STORE, "readwrite", (store) =>
    requestResult(store.clear()),
  );
}

async function usePhotoDatabaseStore(storeName, mode, operation) {
  const database = await openPhotoDatabase();
  try {
    const transaction = database.transaction(storeName, mode);
    const completed = transactionDone(transaction);
    const result = await operation(transaction.objectStore(storeName));
    await completed;
    return result;
  } finally {
    database.close();
  }
}
