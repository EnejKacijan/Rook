import { listWorkoutPhotoMetadata, subscribeWorkoutPhotoChanges } from "./workoutPhotos.js";
import { workoutPhotoTimeline } from "./workoutPhotoTimeline.js";

// Both entry summary and timeline use saved records linked to workouts, regardless
// of completed sets, exercise-history eligibility, or current program membership.
export function savedWorkoutPhotoEntries(workouts, metadata) {
  return workoutPhotoTimeline(workouts, metadata || []).filter(entry => entry.metadataAvailable);
}

export function createWorkoutPhotoCollection(read = () => listWorkoutPhotoMetadata({ savedAssetsOnly: true }), watch = subscribeWorkoutPhotoChanges) {
  let snapshot = { status: "loading", records: null };
  let generation = 0;
  let stopWatching;
  const listeners = new Set();
  const publish = next => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const refresh = async () => {
    const request = ++generation;
    publish({ ...snapshot, status: "loading" });
    try {
      const records = await read();
      if (request === generation) publish({ status: "ready", records });
    } catch {
      if (request === generation) publish({ ...snapshot, status: "error" });
    }
  };
  return {
    getSnapshot: () => snapshot,
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        stopWatching = watch(refresh);
        void refresh();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stopWatching?.();
          ++generation;
        }
      };
    },
  };
}

export const workoutPhotoCollection = createWorkoutPhotoCollection();
