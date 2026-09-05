const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function safeDay(value) {
  if (ISO_DAY.test(String(value || ""))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function workoutPhotoDay(workout) {
  return (
    safeDay(workout?.canonicalPlanDate) ||
    safeDay(workout?.workoutDateKey) ||
    safeDay(workout?.completedAt) ||
    safeDay(workout?.endedAt) ||
    safeDay(workout?.startedAt)
  );
}

export function workoutPhotoTimeline(workouts = [], metadata = []) {
  const metadataById = new Map(
    (Array.isArray(metadata) ? metadata : [])
      .filter((record) => record?.id)
      .map((record) => [record.id, record]),
  );
  const seen = new Set();
  const entries = [];

  for (const workout of Array.isArray(workouts) ? workouts : []) {
    if (!workout?.id || !workout.photoId || seen.has(workout.photoId)) continue;
    seen.add(workout.photoId);
    const day = workoutPhotoDay(workout);
    if (!day) continue;
    const photo = metadataById.get(workout.photoId) || null;
    entries.push({
      id: workout.photoId,
      workoutId: workout.id,
      workoutName: String(workout.name || "Completed workout"),
      day,
      createdAt: photo?.createdAt || workout.completedAt || `${day}T12:00:00`,
      width: Number(photo?.width) || null,
      height: Number(photo?.height) || null,
      metadataAvailable: Boolean(photo),
      workout,
    });
  }

  entries.sort((left, right) =>
    right.day.localeCompare(left.day) ||
    String(right.createdAt).localeCompare(String(left.createdAt)) ||
    right.id.localeCompare(left.id),
  );
  return entries;
}

export function groupWorkoutPhotoTimeline(entries = [], locale = "en") {
  const groups = [];
  const byKey = new Map();
  for (const entry of entries) {
    const key = entry.day.slice(0, 7);
    let group = byKey.get(key);
    if (!group) {
      const date = new Date(`${entry.day}T12:00:00`);
      group = {
        key,
        label: new Intl.DateTimeFormat(locale, {
          month: "long",
          year: "numeric",
        }).format(date),
        entries: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

export function createObjectUrlLease(blob, urlApi = URL) {
  const url = urlApi.createObjectURL(blob);
  let active = true;
  return {
    url,
    revoke() {
      if (!active) return;
      active = false;
      urlApi.revokeObjectURL(url);
    },
  };
}
