import { useMemo, useSyncExternalStore } from "react";
import { savedWorkoutPhotoEntries, workoutPhotoCollection } from "./workoutPhotoCollection.js";

export function useWorkoutPhotoCollection(workouts) {
  const snapshot = useSyncExternalStore(workoutPhotoCollection.subscribe, workoutPhotoCollection.getSnapshot);
  const entries = useMemo(() => savedWorkoutPhotoEntries(workouts, snapshot.records), [workouts, snapshot.records]);
  return { ...snapshot, entries, refresh: workoutPhotoCollection.refresh };
}
