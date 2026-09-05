import { describe, expect, it, vi } from "vitest";
import {
  createObjectUrlLease,
  groupWorkoutPhotoTimeline,
  workoutPhotoTimeline,
} from "./workoutPhotoTimeline.js";

const workout = (id, day, photoId = `photo-${id}`, extra = {}) => ({
  id,
  name: `Workout ${id}`,
  canonicalPlanDate: day,
  completedAt: `${day}T18:00:00.000Z`,
  photoId,
  ...extra,
});
const metadata = (id, workoutId, createdAt = "2026-09-05T18:01:00.000Z") => ({
  id,
  workoutId,
  createdAt,
  width: 1200,
  height: 1600,
});

describe("Workout Photo Timeline", () => {
  it("returns a calm empty collection with zero photos", () => {
    expect(workoutPhotoTimeline([workout("a", "2026-09-05", null)], [])).toEqual([]);
    expect(groupWorkoutPhotoTimeline([])).toEqual([]);
  });

  it("links one photo to its actual workout and date", () => {
    const result = workoutPhotoTimeline(
      [workout("a", "2026-09-05")],
      [metadata("photo-a", "a")],
    );
    expect(result[0]).toMatchObject({
      id: "photo-a",
      workoutId: "a",
      workoutName: "Workout a",
      day: "2026-09-05",
      metadataAvailable: true,
    });
  });

  it("orders same-date photos deterministically by creation time", () => {
    const result = workoutPhotoTimeline(
      [workout("a", "2026-09-05"), workout("b", "2026-09-05")],
      [
        metadata("photo-a", "a", "2026-09-05T18:01:00.000Z"),
        metadata("photo-b", "b", "2026-09-05T20:01:00.000Z"),
      ],
    );
    expect(result.map((entry) => entry.id)).toEqual(["photo-b", "photo-a"]);
  });

  it("groups naturally across month and year boundaries", () => {
    const entries = workoutPhotoTimeline([
      workout("jan", "2027-01-02"),
      workout("dec", "2026-12-31"),
      workout("nov", "2026-11-30"),
    ]);
    expect(groupWorkoutPhotoTimeline(entries).map((group) => group.key)).toEqual([
      "2027-01",
      "2026-12",
      "2026-11",
    ]);
  });

  it("keeps a missing or corrupted asset reference visible for recovery messaging", () => {
    const result = workoutPhotoTimeline([workout("a", "2026-09-05")], []);
    expect(result[0]).toMatchObject({ id: "photo-a", metadataAvailable: false });
  });

  it("does not surface an orphan after its workout is deleted", () => {
    expect(workoutPhotoTimeline([], [metadata("photo-a", "a")])).toEqual([]);
  });

  it("scales to hundreds using metadata only and without copying blobs", () => {
    const workouts = Array.from({ length: 500 }, (_, index) =>
      workout(String(index), `2026-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`),
    );
    const records = workouts.map((item) => metadata(item.photoId, item.id));
    const result = workoutPhotoTimeline(workouts, records);
    expect(result).toHaveLength(500);
    expect(result.every((entry) => !("blob" in entry))).toBe(true);
  });

  it("reconstructs the same timeline after backup-source JSON restoration", () => {
    const workouts = [workout("a", "2026-09-05"), workout("b", "2026-08-31")];
    const records = workouts.map((item) => metadata(item.photoId, item.id));
    const before = workoutPhotoTimeline(workouts, records).map(({ id, workoutId, day }) => ({ id, workoutId, day }));
    const restoredWorkouts = JSON.parse(JSON.stringify(workouts));
    const restoredMetadata = JSON.parse(JSON.stringify(records));
    expect(workoutPhotoTimeline(restoredWorkouts, restoredMetadata).map(({ id, workoutId, day }) => ({ id, workoutId, day }))).toEqual(before);
  });

  it("revokes an object URL exactly once", () => {
    const urlApi = {
      createObjectURL: vi.fn(() => "blob:private-photo"),
      revokeObjectURL: vi.fn(),
    };
    const lease = createObjectUrlLease(new Blob(["photo"]), urlApi);
    lease.revoke();
    lease.revoke();
    expect(urlApi.createObjectURL).toHaveBeenCalledTimes(1);
    expect(urlApi.revokeObjectURL).toHaveBeenCalledOnce();
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith("blob:private-photo");
  });
});
