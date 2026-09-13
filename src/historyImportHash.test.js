import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { hashCanonicalImportData, HistoryImportHashError } from './historyImportHash.js';
import { HistoryImportBatch } from './historyImportBatch.js';
import { blankState, serializeState, deserializeState } from './domain.js';
import { buildBackupArchive, parseBackupArchive } from './backup.js';
import { hevyCsv, hevyRow } from '../scripts/history-import-fixtures.mjs';

const fault = vi.hoisted(() => ({ fail: false }));
vi.mock('@noble/hashes/sha2.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, sha256: bytes => {
    if (fault.fail) throw new Error('Private internal implementation failure');
    return actual.sha256(bytes);
  } };
});
afterEach(() => { fault.fail = false; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const modes = { native: webcrypto, noSubtle: {}, noCrypto: undefined };
const file = (name, text) => ({ name, buffer: new TextEncoder().encode(text).buffer });
const workoutFile = file('renamed-workouts(1).csv', hevyCsv([
  hevyRow({ exercise_title: 'Bench Press', set_index: 0, exercise_notes: 'Čisto · število', reps: 8 }),
  hevyRow({ exercise_title: 'Bench Press', set_index: 1, reps: 7 }),
]));
const measurementFile = file('renamed-measurements(1).csv',
  'date,weight_kg,fat_percent,neck_cm,waist_cm,left_bicep_cm,right_bicep_cm\n2025-01-02,80,18,,,,\n2025-01-03,81,,,,,');
async function parse(files, state = blankState()) {
  const batch = new HistoryImportBatch();
  const setup = await batch.read(files);
  const settings = setup.files.map(f => ({ sheetIndex: f.sheetIndex, options: {} }));
  const preview = await batch.parse(settings, state);
  return { batch, preview, settings };
}

describe('local SHA-256 import compatibility', () => {
  it.each(Object.keys(modes))('%s: standard vectors, UTF-8 and padding/block boundaries match SHA-256', async mode => {
    vi.stubGlobal('crypto', modes[mode]);
    expect(await hashCanonicalImportData('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await hashCanonicalImportData('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    for (const value of ['čšž · 💪\n"notes"', ...[1, 55, 56, 63, 64, 65, 127, 128, 129, 4096, 1000000].map(n => 'a'.repeat(n))]) {
      expect(await hashCanonicalImportData(value)).toBe(createHash('sha256').update(value, 'utf8').digest('hex'));
    }
  });
  it('uses native digest when available and a local fallback if it rejects', async () => {
    const digest = vi.fn((...args) => webcrypto.subtle.digest(...args));
    vi.stubGlobal('crypto', { subtle: { digest } });
    const expected = await hashCanonicalImportData('same source');
    expect(digest).toHaveBeenCalledOnce();
    digest.mockRejectedValue(new Error('Web Crypto unavailable'));
    expect(await hashCanonicalImportData('same source')).toBe(expected);
  });
  it('both implementations failing produces only the safe import error', async () => {
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockRejectedValue(new Error('private source')) } });
    fault.fail = true;
    await expect(hashCanonicalImportData('sensitive')).rejects.toMatchObject({
      code: 'import-verification-failed',
      message: "ROOK couldn't verify this import file on this device. Your existing history was not changed.",
    });
  });
});

describe('production import pipeline with fallback identities', () => {
  it.each(['workouts', 'measurements', 'both'])('%s: identical preview, persisted identity and cross-capability duplicates', async category => {
    const files = category === 'workouts' ? [workoutFile] : category === 'measurements' ? [measurementFile] : [workoutFile, measurementFile];
    let nativePreview;
    for (const [mode, crypto] of Object.entries(modes)) {
      vi.stubGlobal('crypto', crypto);
      const { batch, preview } = await parse(files);
      expect(preview.summary.invalidRows).toBe(0);
      // Timings are transient measured diagnostics, not source/identity data.
      const {timing,...semanticPreview}=preview;
      expect(timing).toBeDefined();
      if (mode === 'native') nativePreview = semanticPreview;
      else expect(semanticPreview).toEqual(nativePreview);
      const state = batch.apply(blankState(), { now: '2026-01-01T12:00:00Z' }).state;
      const reloaded = deserializeState(serializeState(state));
      expect(reloaded.workouts.map(w => w.sourceFingerprint)).toEqual(state.workouts.map(w => w.sourceFingerprint));
      expect(reloaded.importedMeasurementSources).toEqual(state.importedMeasurementSources);
      vi.stubGlobal('crypto', webcrypto);
      const repeated = await parse(files, reloaded);
      const result = repeated.batch.apply(reloaded, {});
      expect(result.result).toMatchObject({ imported: 0, sets: 0, measurements: 0 });
      expect(result.state).toEqual(reloaded);
      if (category !== 'workouts') expect(reloaded.importedMeasurementSources[0].values.neck.value).toBeNull();
    }
  });
  it('local edits survive fallback import → reload → native reimport and backup/restore', async () => {
    vi.stubGlobal('crypto', undefined);
    const files = [workoutFile, measurementFile];
    const { batch } = await parse(files);
    const state = batch.apply(blankState(), {}).state;
    state.workouts[0].name = 'Local title';
    state.workouts[0].exercises[0].sets[0].reps = 11;
    state.weightCheckins[0].weightKg = 83;
    const backup = await buildBackupArchive(state, []);
    vi.stubGlobal('crypto', webcrypto);
    const restored = (await parseBackupArchive(backup.bytes)).state;
    const repeated = await parse(files, restored);
    const result = repeated.batch.apply(restored, {});
    expect(result.result).toMatchObject({ imported: 0, sets: 0, measurements: 0 });
    expect(result.state.workouts[0].name).toBe('Local title');
    expect(result.state.workouts[0].exercises[0].sets[0].reps).toBe(11);
    expect(result.state.weightCheckins[0].weightKg).toBe(83);
  });
  it.each([{files:[workoutFile]}, {files:[measurementFile]}, {files:[workoutFile, measurementFile]}])('hash failure blocks entire batch, retains files, and is retryable', async ({files}) => {
    vi.stubGlobal('crypto', undefined);
    const state = blankState(), before = serializeState(state);
    const { batch, settings } = await parse(files, state);
    fault.fail = true;
    await expect(batch.parse(settings, state)).rejects.toBeInstanceOf(HistoryImportHashError);
    expect(batch.files).toHaveLength(files.length);
    expect(() => batch.apply(state, {})).toThrow('Review all selected files');
    expect(serializeState(state)).toBe(before);
    fault.fail = false;
    expect((await batch.parse(settings, state)).summary.invalidRows).toBe(0);
  });
  it('failed storage commit leaves the input/durable state unchanged and draft retryable', async () => {
    vi.stubGlobal('crypto', undefined);
    const state = blankState(), before = serializeState(state);
    const { batch } = await parse([workoutFile, measurementFile], state);
    const transaction = batch.apply(state, {});
    const storage = { setItem: vi.fn(() => { throw new DOMException('Full', 'QuotaExceededError'); }) };
    expect(() => storage.setItem('lift-v2-state', serializeState(transaction.state))).toThrow('Full');
    expect(serializeState(state)).toBe(before);
    expect(batch.apply(state, {}).result).toMatchObject({ imported: 1, sets: 2, measurements: 2 });
  });
});
