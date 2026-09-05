import { buildBackupArchive } from "../src/backup.js";
import { blankState, serializeState } from "../src/domain.js";
import { createReturningUserFixture } from "../src/demoFixture.js";

const bytes = (value) => Buffer.byteLength(serializeState(value), "utf8");
const mib = (value) => Math.round((value / 1024 / 1024) * 10) / 10;

const fresh = blankState();
const typical = createReturningUserFixture(6);
typical.workouts.forEach((workout, index) => {
  workout.sessionNote = `Typical workout note ${index}: controlled reps and stable setup.`;
});
const stress = createReturningUserFixture(0);
const sample = createReturningUserFixture(1).workouts[0];
stress.workouts = Array.from({ length: 1200 }, (_, index) => ({
  ...structuredClone(sample),
  id: `stress-workout-${index}`,
  sessionNote: `Stress history note ${index}: representative long-term training context.`,
  photoId: null,
}));

console.log(JSON.stringify({
  localStorageBytes: {
    fresh: bytes(fresh),
    typical: bytes(typical),
    workouts1200: bytes(stress),
  },
}, null, 2));

function serializationTiming(state, iterations) {
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    serializeState(state);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return {
    medianMs: Math.round(samples[Math.floor(samples.length / 2)] * 100) / 100,
    p95Ms: Math.round(samples[Math.floor(samples.length * 0.95)] * 100) / 100,
  };
}

console.log(JSON.stringify({
  serializeTiming: {
    typical: serializationTiming(typical, 100),
    workouts1200: serializationTiming(stress, 20),
  },
}, null, 2));

async function memoryCase(photoCount) {
  const state = structuredClone(stress);
  const payload = new Uint8Array(400_000);
  payload.set([0xff, 0xd8, 0xff, 0xe0]);
  const sharedBlob = new Blob([payload], { type: "image/jpeg" });
  const metadata = [];
  for (let index = 0; index < photoCount; index += 1) {
    const id = `stress-photo-${index}`;
    state.workouts[index].photoId = id;
    metadata.push({
      id,
      workoutId: state.workouts[index].id,
      mimeType: "image/jpeg",
      width: 1200,
      height: 1600,
      createdAt: "2026-09-05T10:00:00.000Z",
    });
  }
  global.gc?.();
  const baseline = process.memoryUsage();
  let peak = baseline;
  const sampler = setInterval(() => {
    const usage = process.memoryUsage();
    if (usage.rss > peak.rss) peak = usage;
  }, 5);
  const archive = await buildBackupArchive(state, metadata, {
    photoLoader: async (id) => {
      const record = metadata.find((entry) => entry.id === id);
      return { ...record, blob: sharedBlob };
    },
    returnParts: true,
  });
  clearInterval(sampler);
  const final = process.memoryUsage();
  const archiveBytes = archive.parts.reduce((sum, part) => sum + part.byteLength, 0);
  return {
    photoCount,
    sourcePhotoBytes: photoCount * payload.byteLength,
    archiveBytes,
    peakRssIncrease: Math.max(0, peak.rss - baseline.rss),
    finalRssIncrease: Math.max(0, final.rss - baseline.rss),
    formatted: {
      sourcePhotosMiB: mib(photoCount * payload.byteLength),
      archiveMiB: mib(archiveBytes),
      sampledPeakRssIncreaseMiB: mib(Math.max(0, peak.rss - baseline.rss)),
    },
  };
}

for (const count of [100, 300])
  console.log(JSON.stringify(await memoryCase(count), null, 2));
