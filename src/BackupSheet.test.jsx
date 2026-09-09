import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BackupSheet } from './App.jsx';
import { blankState } from './domain.js';
const mocks = vi.hoisted(() => ({ createBackup: vi.fn(), backupFile: vi.fn(), presentBackupFile: vi.fn(), requestPersistentStorage: vi.fn(), backupUserMessage: vi.fn(() => 'Preparation failed.') }));
vi.mock('./backup.js', () => mocks);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, state, archive, file, callback;
beforeEach(() => {
  vi.clearAllMocks(); state = blankState();
  archive = { manifest: { createdAt: '2026-09-07T10:00:00.000Z' }, bytes: new Uint8Array([1, 2, 3]), filename: 'ROOK-backup.zip' };
  file = new File([archive.bytes], archive.filename, { type: 'application/zip' });
  mocks.createBackup.mockResolvedValue(archive); mocks.backupFile.mockReturnValue(file); mocks.presentBackupFile.mockResolvedValue('downloaded');
  callback = vi.fn(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); render();
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
function render() { act(() => root.render(<BackupSheet state={state} update={fn => { state = fn(structuredClone(state)); render(); }} close={() => {}} onBackupCreated={callback} />)); }
const button = name => [...host.querySelectorAll('button')].find(b => b.textContent === name);
async function click(name) { await act(async () => { button(name).click(); await new Promise(resolve => setTimeout(resolve, 20)); }); }
it('prepares once without starting a handoff and promotes saving, preserving generator input/output', async () => {
  expect(button('CREATE BACKUP').classList.contains('primary')).toBe(true);
  const original = structuredClone(state), metadata = JSON.stringify(archive.manifest), bytes = [...archive.bytes];
  await click('CREATE BACKUP');
  expect(mocks.createBackup).toHaveBeenCalledExactlyOnceWith(original, { allowUnavailablePhotos: false });
  expect(mocks.backupFile).toHaveBeenCalledExactlyOnceWith(archive); expect(JSON.stringify(archive.manifest)).toBe(metadata); expect([...archive.bytes]).toEqual(bytes);
  expect(mocks.presentBackupFile).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Backup ready to save.'); expect(host.textContent).toContain('Prepared ');
  expect(host.textContent).not.toMatch(/Backup created\.|Last backup created|Backup saved/);
  expect(button('SAVE BACKUP').classList.contains('primary')).toBe(true);
  expect(button('CREATE A NEW BACKUP').classList.contains('secondary')).toBe(true);
  expect(host.textContent).toContain('ROOK does not upload it.'); expect(host.textContent).toContain('private workout photos');
});
it.each([['downloaded', 'Download started.'], ['shared', 'Share sheet opened.']])('truthfully describes %s and calls the existing handoff once', async (result, message) => {
  mocks.presentBackupFile.mockResolvedValue(result); await click('CREATE BACKUP'); await click('SAVE BACKUP');
  expect(mocks.presentBackupFile).toHaveBeenCalledExactlyOnceWith(file); expect(mocks.createBackup).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain(message); expect(host.textContent).not.toMatch(/Backup saved|safely stored/); expect(callback).toHaveBeenCalledTimes(1);
});
it.each(['cancelled', 'abort'])('keeps %s ready and retryable without an error', async result => {
  await click('CREATE BACKUP');
  if (result === 'abort') mocks.presentBackupFile.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'));
  else mocks.presentBackupFile.mockResolvedValueOnce('cancelled');
  await click('SAVE BACKUP'); expect(host.querySelector('[role="alert"]')).toBeNull(); expect(button('SAVE BACKUP').disabled).toBe(false); expect(callback).not.toHaveBeenCalled();
  await click('SAVE BACKUP'); expect(mocks.presentBackupFile).toHaveBeenLastCalledWith(file); expect(mocks.createBackup).toHaveBeenCalledTimes(1);
});
it('retains the file and persistent inline error until retry succeeds', async () => {
  await click('CREATE BACKUP'); mocks.presentBackupFile.mockRejectedValueOnce(new Error('handoff failed')); await click('SAVE BACKUP'); render();
  expect(host.querySelector('[role="alert"]').textContent).toContain('prepared file is still available');
  expect(button('TRY AGAIN').classList.contains('primary')).toBe(true); expect(button('TRY AGAIN').getAttribute('aria-describedby')).toBe('backup-handoff-error');
  await click('TRY AGAIN'); expect(host.querySelector('[role="alert"]')).toBeNull(); expect(mocks.presentBackupFile).toHaveBeenLastCalledWith(file); expect(mocks.createBackup).toHaveBeenCalledTimes(1);
});
it('replaces the file only after explicit regeneration and retains the old one if regeneration fails', async () => {
  await click('CREATE BACKUP'); render(); expect(mocks.createBackup).toHaveBeenCalledTimes(1);
  mocks.createBackup.mockRejectedValueOnce(new Error('generation failed')); await click('CREATE A NEW BACKUP'); await click('SAVE BACKUP'); expect(mocks.presentBackupFile).toHaveBeenLastCalledWith(file);
  const nextFile = new File(['new payload'], 'new.zip'); mocks.backupFile.mockReturnValueOnce(nextFile);
  await click('CREATE A NEW BACKUP'); await click('SAVE BACKUP'); expect(mocks.createBackup).toHaveBeenCalledTimes(3); expect(mocks.presentBackupFile).toHaveBeenLastCalledWith(nextFile);
});
it('reopening retains only the preparation timestamp, not an in-memory file or a durability claim', async () => {
  await click('CREATE BACKUP'); act(() => root.unmount()); root = createRoot(host); render();
  expect(button('SAVE BACKUP')).toBeUndefined(); expect(button('CREATE BACKUP')).toBeTruthy();
  expect(host.textContent).toContain('Prepared '); expect(host.textContent).toContain('Preparation does not confirm a saved copy.');
  expect(mocks.createBackup).toHaveBeenCalledTimes(1);
});
