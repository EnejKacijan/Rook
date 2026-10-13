import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkoutPhotoPager } from './WorkoutPhotoPager.jsx';
import { PrivateWorkoutPhotoViewer, WorkoutPhotoMemory } from './App.jsx';
import { getWorkoutPhoto, deleteWorkoutPhoto } from './workoutPhotos.js';
import { exportWorkoutPhoto } from './exportWorkoutPhoto.js';
import { PHOTO_PAGER, commitPhotoPager, photoPagerIntent } from './workoutPhotoPagerGesture.js';
vi.mock('./workoutPhotos.js', async original => ({ ...await original(), getWorkoutPhoto: vi.fn(), deleteWorkoutPhoto: vi.fn(async () => {}) }));
vi.mock('./exportWorkoutPhoto.js', async original => ({ ...await original(), exportWorkoutPhoto: vi.fn(async () => 'downloaded') }));
vi.mock('./useWorkoutPhotoCollection.js', () => ({ useWorkoutPhotoCollection: workouts => ({ records: [], entries: workouts.filter(w => w.photoId).map(workout => ({id:workout.photoId,workoutId:workout.id,workout})) }) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const entries = ['a','b','c','d','e'].map((id, index) => ({ id, workoutId: `workout-${id}`, workout: {
  id: `workout-${id}`, name: `Workout ${id}`, workoutDateKey: `2026-10-${String(10 - index).padStart(2,'0')}`, exercises: [{ sets: [{ completed: true, reps: index + 1, weight: 20 }] }],
} }));
let root, host, now, view, remove, close, revoked, counter, mutate;
const current = () => document.querySelector('.workout-photo-page[aria-hidden="false"]');
const viewport = () => document.querySelector('.workout-photo-pager');
const button = text => [...document.querySelectorAll('.workout-photo-viewer button')].find(el => el.textContent === text);
const click = async el => { await act(async () => el.click()); };
const advance = ms => act(() => { now += ms; vi.advanceTimersByTime(ms); });
function touch(type, x, y = 150, target = viewport()) {
  const point = { identifier: 1, clientX: x, clientY: y }, event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : [point] }, changedTouches: { value: [point] } });
  act(() => target.dispatchEvent(event));
}
function drag(distance, elapsed = 350) { touch('touchstart',200); advance(elapsed); touch('touchmove',200+distance); touch('touchend',200+distance); }
async function mount(initialId = 'b', source = entries, options = {}) {
  function Harness() {
    const [photos, setPhotos] = useState(source), [open, setOpen] = useState(true); mutate = setPhotos;
    return <main>{open && <WorkoutPhotoPager {...options} entries={photos} initialId={initialId} Viewer={PrivateWorkoutPhotoViewer}
      onClose={() => { close(); setOpen(false); }} onViewWorkout={view} onDelete={async entry => {
        const result = await remove(entry.id); if (result !== false) setPhotos(list => list.filter(item => item.id !== entry.id)); return result;
      }} />}</main>;
  }
  await act(async () => root.render(<Harness/>));
}
beforeEach(() => {
  vi.useFakeTimers(); now = 0; counter = 0;
  vi.spyOn(performance,'now').mockImplementation(() => now);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener(){}, removeEventListener(){} }));
  vi.spyOn(window,'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{ width: 44, height: 44 }]);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({ width: 390, height: 800, x: 0, y: 0 });
  vi.stubGlobal('fetch',vi.fn(async () => ({ ok:true, blob:async () => new Blob(['export'],{type:'image/jpeg'}) })));
  URL.createObjectURL = vi.fn(() => `blob:photo-${++counter}`); URL.revokeObjectURL = revoked = vi.fn();
  getWorkoutPhoto.mockReset().mockImplementation(async id => ({ blob: new Blob([id],{type:'image/jpeg'}) }));
  deleteWorkoutPhoto.mockClear();
  exportWorkoutPhoto.mockClear(); view = vi.fn(); remove = vi.fn(async () => true); close = vi.fn();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('single photo has no position or paging controls', async () => {
  await mount('a', entries.slice(0,1)); expect(document.querySelector('.workout-photo-position')).toBeNull();
  expect(document.querySelector('[aria-label="Next photo"]')).toBeNull(); expect(getWorkoutPhoto).toHaveBeenCalledTimes(1);
});
it('tracks the finger with both image and metadata, then commits atomically and updates every action', async () => {
  await mount(); const initialUrl = current().querySelector('img').src;
  touch('touchstart',200); advance(350); touch('touchmove',65);
  expect(document.querySelector('.workout-photo-pager-track').style.transform).toContain('-135px');
  expect(current().textContent).toContain('Workout b'); expect(current().querySelector('img').src).toBe(initialUrl);
  expect(button('VIEW WORKOUT').disabled).toBe(true); touch('touchend',65); advance(179);
  expect(current().textContent).toContain('Workout b'); await act(async () => advance(1));
  expect(current().textContent).toContain('Workout c'); expect(current().textContent).toContain('3 of 5');
  expect(current().querySelector('img').src).not.toBe(initialUrl); expect(document.querySelector('[aria-live="polite"]').textContent).toBe('Photo 3 of 5');
  await click(button('VIEW WORKOUT')); expect(view).toHaveBeenLastCalledWith('workout-c');
  act(() => current().querySelector('img').dispatchEvent(new Event('load'))); await click(button('SAVE PHOTO'));
  expect(exportWorkoutPhoto.mock.calls[0][0].name).toContain('2026-10-08');
  await click(button('DELETE PHOTO')); await click(button('DELETE PHOTO')); expect(remove).toHaveBeenCalledExactlyOnceWith('c');
  expect(current().textContent).toContain('Workout d'); expect(document.querySelector('[aria-label="Confirm photo deletion"]')).toBeNull();
});
it('right swipe navigates back; short and vertical drags retain the current photo', async () => {
  await mount(); drag(130); await act(async () => advance(PHOTO_PAGER.settleMs)); expect(current().textContent).toContain('Workout a');
  drag(-20); advance(180); expect(current().textContent).toContain('Workout a');
  touch('touchstart',200,150); touch('touchmove',210,70); touch('touchend',210,70); advance(250); expect(current().textContent).toContain('Workout a');
});
it.each([['a',140],['e',-140]])('boundary %s resists and settles without wrap', async (id, distance) => {
  await mount(id); touch('touchstart',200); advance(350); touch('touchmove',200+distance);
  expect(document.querySelector('.workout-photo-pager-track').style.transform).toContain(`${distance*.22}px`);
  touch('touchend',200+distance); advance(180); expect(current().textContent).toContain(`Workout ${id}`);
});
it('a recent fast flick commits; a held flick does not borrow stale velocity', async () => {
  await mount(); drag(-45,40); await act(async () => advance(180)); expect(current().textContent).toContain('Workout c');
  touch('touchstart',200); advance(40); touch('touchmove',155); advance(200); touch('touchend',155); advance(180);
  expect(current().textContent).toContain('Workout c');
});
it('preloads only the current window and revokes displaced and unmounted leases', async () => {
  await mount(); expect(getWorkoutPhoto.mock.calls.map(call => call[0])).toEqual(['a','b','c']);
  await click(document.querySelector('[aria-label="Next photo"]')); expect(getWorkoutPhoto.mock.calls.map(call => call[0])).toEqual(['a','b','c','d']);
  expect(revoked).toHaveBeenCalledTimes(1); await click(document.querySelector('[aria-label="Close workout photo"]'));
  expect(revoked).toHaveBeenCalledTimes(4);
});
it('reuses a completed-workout thumbnail URL without taking over its lease', async () => {
  await mount('b',entries,{initialPhotoUrl:'blob:borrowed-thumbnail'});
  expect(getWorkoutPhoto.mock.calls.map(call=>call[0])).toEqual(['a','c']);
  expect(current().querySelector('img').src).toBe('blob:borrowed-thumbnail');
  await click(document.querySelector('[aria-label="Close workout photo"]'));
  expect(revoked).toHaveBeenCalledTimes(2); expect(revoked).not.toHaveBeenCalledWith('blob:borrowed-thumbnail');
});
it('the completed-workout entry opens the same timeline pager and deletes only the swiped photo', async () => {
  let saved;
  function MemoryHarness() {
    const [state,setState] = useState({workouts:entries.slice(0,3).map(entry=>({...entry.workout,photoId:entry.id}))}); saved=state;
    return <WorkoutPhotoMemory workout={state.workouts[0]} workouts={state.workouts} update={fn=>setState(value=>fn(structuredClone(value)))} onViewWorkout={view}/>;
  }
  await act(async()=>root.render(<MemoryHarness/>)); await click(document.querySelector('[aria-label="View workout photo"]'));
  expect(current().textContent).toContain('1 of 3'); await click(document.querySelector('[aria-label="Next photo"]'));
  expect(current().textContent).toContain('Workout b'); await click(button('VIEW WORKOUT')); expect(view).toHaveBeenLastCalledWith('workout-b');
  await click(button('DELETE PHOTO')); await click(button('DELETE PHOTO'));
  expect(saved.workouts[0].photoId).toBe('a'); expect(saved.workouts[1].photoId).toBeUndefined();
  expect(deleteWorkoutPhoto).toHaveBeenCalledExactlyOnceWith('b');
  expect(current().textContent).toContain('Workout c'); expect(current().textContent).toContain('2 of 2');
  await click(document.querySelector('[aria-label="Close workout photo"]')); expect(viewport()).toBeNull();
});
it.each([['a','b'],['b','c'],['c','b']])('deleting %s chooses %s, keeping the original order', async (id,next) => {
  await mount(id,entries.slice(0,3)); await click(button('DELETE PHOTO')); await click(button('DELETE PHOTO'));
  expect(remove).toHaveBeenCalledExactlyOnceWith(id); expect(current().textContent).toContain(`Workout ${next}`); expect(close).not.toHaveBeenCalled();
});
it('deleting the last photo closes once; duplicate confirmation activation cannot delete twice', async () => {
  let finish; remove.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await mount('a', entries.slice(0,1)); await click(button('DELETE PHOTO'));
  const confirm = button('DELETE PHOTO'); await act(async () => { confirm.click(); confirm.click(); }); expect(remove).toHaveBeenCalledExactlyOnceWith('a');
  await act(async () => finish(true)); expect(close).toHaveBeenCalledOnce(); expect(viewport()).toBeNull();
});
it('confirmation blocks gestures and keyboard, and failed deletion retains the same target for retry', async () => {
  remove.mockResolvedValue(false); await mount(); await click(button('DELETE PHOTO')); drag(-150); advance(180);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  expect(current().textContent).toContain('Workout b'); await click(button('DELETE PHOTO'));
  expect(current().textContent).toContain('Workout b'); expect(document.querySelector('[role="alert"]').textContent).toContain('couldn’t be deleted');
  await click(button('KEEP PHOTO')); expect(remove).toHaveBeenCalledTimes(1);
});
it('external removal resolves to the next stable ID; an empty collection closes', async () => {
  await mount(); await act(async () => mutate(list => list.filter(entry => entry.id !== 'b'))); expect(current().textContent).toContain('Workout c');
  await act(async () => mutate([])); expect(close).toHaveBeenCalledOnce();
});
it('reduced motion commits immediately and keyboard navigation has equivalent IDs', async () => {
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}})); await mount();
  await act(async () => drag(-130)); expect(current().textContent).toContain('Workout c');
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))); expect(current().textContent).toContain('Workout b');
});
it('touchcancel, pointercancel, lost capture, and unmount leave no delayed navigation', async () => {
  await mount(); touch('touchstart',200); touch('touchmove',65); touch('touchcancel',65); advance(250);
  expect(current().textContent).toContain('Workout b'); expect(viewport().dataset.paging).toBeUndefined();
  const pointer = (type,x) => { const event = new Event(type,{bubbles:true,cancelable:true}); Object.assign(event,{pointerType:'mouse',pointerId:2,button:0,clientX:x,clientY:150}); act(()=>viewport().dispatchEvent(event)); };
  for (const reason of ['pointercancel','lostpointercapture']) { pointer('pointerdown',200); pointer('pointermove',60); pointer(reason,60); advance(250); expect(current().textContent).toContain('Workout b'); }
  drag(-130); await click(document.querySelector('[aria-label="Close workout photo"]')); advance(250); expect(close).toHaveBeenCalledOnce();
});
it('missing local data keeps its metadata and actions bound to that ID', async () => {
  getWorkoutPhoto.mockImplementation(async id => id === 'b' ? null : {blob:new Blob([id],{type:'image/jpeg'})});
  await mount(); expect(current().textContent).toContain('Photo unavailable'); expect(current().textContent).toContain('Workout b');
  expect(button('SAVE PHOTO').disabled).toBe(true); await click(button('VIEW WORKOUT')); expect(view).toHaveBeenLastCalledWith('workout-b');
});
it('uses directional intent and both distance and velocity without accidental diagonal paging', () => {
  expect(photoPagerIntent(120,10)).toBe('drag'); expect(photoPagerIntent(10,120)).toBe('yield'); expect(photoPagerIntent(20,20)).toBe('pending');
  expect(commitPhotoPager(-100,390,0)).toBe(true); expect(commitPhotoPager(-40,390,-.8)).toBe(true);
  expect(commitPhotoPager(-40,390,.8)).toBe(false); expect(commitPhotoPager(-20,390,-2)).toBe(false);
});
