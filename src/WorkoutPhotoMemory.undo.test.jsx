import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkoutPhotoMemory } from './App.jsx';
import { getWorkoutPhoto, deleteWorkoutPhoto, saveWorkoutPhoto, restoreWorkoutPhoto, workoutPhotoSaveMessage } from './workoutPhotos.js';

vi.mock('./workoutPhotos.js', async original => ({ ...await original(),
  getWorkoutPhoto: vi.fn(), deleteWorkoutPhoto: vi.fn(async () => {}), saveWorkoutPhoto: vi.fn(), restoreWorkoutPhoto: vi.fn(async () => {}) }));
vi.mock('./useWorkoutPhotoCollection.js', () => ({ useWorkoutPhotoCollection: () => ({ records: [], entries: [] }) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root, saved, updateState;
const blob = new Blob(['x'], { type: 'image/jpeg' });
const record = id => ({ id, workoutId: 'w1', blob, mimeType: 'image/jpeg', width: 10, height: 10, createdAt: '2026-10-23T12:00:00Z' });
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const button = pattern => [...host.querySelectorAll('button')].find(b => pattern.test(b.textContent.trim()));
const status = () => host.querySelector('.workout-photo-status').textContent;
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener(){}, removeEventListener(){} }));
  URL.createObjectURL = vi.fn(() => 'blob:photo'); URL.revokeObjectURL = vi.fn();
  getWorkoutPhoto.mockImplementation(async id => record(id));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount(photoId) {
  function Harness() {
    const [state, setState] = useState({ workouts: [{ id: 'w1', name: 'Upper B', ...(photoId ? { photoId } : {}) }] }); saved = state;
    updateState=fn=>setState(value=>fn(structuredClone(value)));
    return <WorkoutPhotoMemory workout={state.workouts[0]} workouts={state.workouts} update={updateState}/>;
  }
  await act(async () => root.render(<Harness/>)); await flush();
}
async function choose(file) {
  const input = host.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true }))); await flush();
}

it('says why a chosen file was refused', async () => {
  saveWorkoutPhoto.mockRejectedValueOnce(new Error('Choose a photo smaller than 15 MB.'));
  await mount(null); await choose(new File(['x'], 'big.jpg', { type: 'image/jpeg' }));
  expect(status()).toBe('Choose a photo smaller than 15 MB. Your workout was saved.');
});

it('maps storage and decode failures to plain messages', () => {
  expect(workoutPhotoSaveMessage(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))).toBe('Not enough storage on this device for the photo. Your workout was saved.');
  expect(workoutPhotoSaveMessage(new Error('That image format could not be read.'))).toBe('That photo couldn’t be opened. Try a JPEG or PNG. Your workout was saved.');
  expect(workoutPhotoSaveMessage(new Error('Photo storage failed.'))).toBe('Photo couldn’t be saved. Your workout was saved.');
});

it('offers Undo after deleting a photo and puts the same photo back', async () => {
  await mount('p1');
  await act(async () => button(/^DELETE$/).click());
  await act(async () => button(/^DELETE PHOTO$/).click()); await flush();
  expect(saved.workouts[0].photoId).toBeUndefined();
  expect(deleteWorkoutPhoto).toHaveBeenCalledWith('p1');
  expect(host.querySelector('.rook-snackbar').textContent).toContain('Photo deleted');
  await act(async () => button(/^Undo$/).click()); await flush();
  expect(restoreWorkoutPhoto).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', blob }));
  expect(saved.workouts[0].photoId).toBe('p1');
  expect(status()).toBe('Photo restored.');
});

it('offers Undo after changing a photo, restoring the old one and removing the new one', async () => {
  saveWorkoutPhoto.mockResolvedValueOnce({ ...record('p2'), blob: undefined });
  await mount('p1'); await choose(new File(['y'], 'new.jpg', { type: 'image/jpeg' }));
  expect(saved.workouts[0].photoId).toBe('p2');
  expect(deleteWorkoutPhoto).toHaveBeenCalledWith('p1');
  expect(host.querySelector('.rook-snackbar').textContent).toContain('Photo replaced');
  await act(async () => button(/^Undo$/).click()); await flush();
  expect(restoreWorkoutPhoto).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  expect(saved.workouts[0].photoId).toBe('p1');
  expect(deleteWorkoutPhoto).toHaveBeenLastCalledWith('p2');
});

it('explains a missing photo in plain words', async () => {
  getWorkoutPhoto.mockResolvedValue(null);
  await mount('gone');
  expect(host.textContent).toContain('This photo isn’t on this device.');
  await act(async () => button(/^REMOVE FROM WORKOUT$/).click());
  expect(saved.workouts[0].photoId).toBeUndefined();
});
it('does not revive an old photo when its replacement was cleared during a pending Undo',async()=>{
 saveWorkoutPhoto.mockResolvedValueOnce({...record('p2'),blob:undefined});await mount('p1');await choose(new File(['y'],'new.jpg',{type:'image/jpeg'}));
 let finish;restoreWorkoutPhoto.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));deleteWorkoutPhoto.mockClear();
 await act(async()=>button(/^Undo$/).click());
 await act(async()=>updateState(state=>{delete state.workouts[0].photoId;return state;}));
 await act(async()=>finish());await flush();
 expect(saved.workouts[0].photoId).toBeUndefined();expect(deleteWorkoutPhoto).toHaveBeenCalledWith('p1');
 expect(deleteWorkoutPhoto).not.toHaveBeenCalledWith('p2');
});
it('keeps the replacement and shows a visible error if photo recovery fails',async()=>{
 saveWorkoutPhoto.mockResolvedValueOnce({...record('p2'),blob:undefined});await mount('p1');await choose(new File(['y'],'new.jpg',{type:'image/jpeg'}));
 restoreWorkoutPhoto.mockRejectedValueOnce(new Error('Synthetic storage failure'));deleteWorkoutPhoto.mockClear();
 await act(async()=>button(/^Undo$/).click());await flush();
 expect(saved.workouts[0].photoId).toBe('p2');expect(deleteWorkoutPhoto).not.toHaveBeenCalled();
 expect(status()).toBe('Photo couldn’t be restored.');expect(host.querySelector('.workout-photo-status').classList.contains('visually-hidden')).toBe(false);
});
