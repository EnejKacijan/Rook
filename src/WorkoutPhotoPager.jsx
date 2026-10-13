import { useEffect, useRef, useState } from 'react';
import { getWorkoutPhoto } from './workoutPhotos.js';
import { createObjectUrlLease } from './workoutPhotoTimeline.js';
import './workoutPhotoPager.css';

// The timeline owns order and deletion. This controller owns only the active ID
// and a bounded window of local blob leases; it writes no preferences or media.
export function WorkoutPhotoPager({ entries, initialId, initialPhotoUrl, Viewer, onClose, onDelete, onViewWorkout, busy, returnFocusRef }) {
  const [selectedId, setSelectedId] = useState(initialId);
  const [removed, setRemoved] = useState([]);
  const [error, setError] = useState('');
  const [, refresh] = useState(0);
  const cache = useRef(null);
  // The completed-workout thumbnail already owns this URL. Borrow it until
  // paging leaves that window; its original owner retains revocation authority.
  if (!cache.current) cache.current = new Map(initialPhotoUrl ? [[initialId, { photoUrl: initialPhotoUrl, loading: false }]] : []);
  const deleting = useRef(false), alive = useRef(true), previousOrder = useRef(entries.map(entry => entry.id));
  const available = entries.filter(entry => !removed.includes(entry.id));
  let index = available.findIndex(entry => entry.id === selectedId);
  if (index < 0 && available.length) {
    const oldIndex = previousOrder.current.indexOf(selectedId);
    const next = previousOrder.current.slice(oldIndex + 1).find(id => available.some(entry => entry.id === id));
    const previous = previousOrder.current.slice(0, oldIndex).reverse().find(id => available.some(entry => entry.id === id));
    index = Math.max(0, available.findIndex(entry => entry.id === (next || previous)));
  }
  const current = available[index];
  const windowEntries = [available[index - 1], current, available[index + 1]];
  const windowKey = JSON.stringify(windowEntries.map(entry => entry?.id || null));
  const release = asset => { if (asset.preloader) asset.preloader.src = ''; asset.lease?.revoke(); };
  useEffect(() => {
    if (!current) { onClose(); return; }
    if (current.id !== selectedId) setSelectedId(current.id);
    previousOrder.current = available.map(entry => entry.id);
  }, [current?.id, selectedId, entries, removed, onClose]);
  useEffect(() => {
    const wanted = new Set(windowEntries.filter(Boolean).map(entry => entry.id));
    for (const [id, asset] of cache.current) if (!wanted.has(id)) { release(asset); cache.current.delete(id); }
    for (const entry of windowEntries.filter(Boolean)) {
      if (cache.current.has(entry.id)) continue;
      const asset = { loading: true }; cache.current.set(entry.id, asset);
      getWorkoutPhoto(entry.id).then(record => {
        if (!alive.current || cache.current.get(entry.id) !== asset) return;
        if (!record?.blob || !record.blob.type.startsWith('image/')) throw new Error('Unavailable photo');
        asset.lease = createObjectUrlLease(record.blob);
        asset.photoUrl = asset.lease.url;
        // Decode only these neighbors. A failure is displayed by the image's
        // normal error state, never by silently changing the selected workout.
        const image = asset.preloader = new Image(); image.decoding = 'async'; image.src = asset.photoUrl; image.decode?.().catch(() => {});
      }).catch(() => { asset.error = true; }).finally(() => {
        if (alive.current && cache.current.get(entry.id) === asset) { asset.loading = false; refresh(n => n + 1); }
      });
    }
  }, [windowKey]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; for (const asset of cache.current.values()) release(asset); cache.current.clear(); };
  }, []);
  if (!current) return null;
  const asset = cache.current.get(current.id);
  const navigate = direction => {
    if (busy || deleting.current) return;
    const target = available[index + direction];
    if (target) { setSelectedId(target.id); setError(''); }
  };
  const imageError = id => {
    const asset = cache.current.get(id);
    if (asset && !asset.error) { asset.error = true; refresh(n => n + 1); }
  };
  const remove = async () => {
    if (busy || deleting.current) return;
    deleting.current = true; setError('');
    const deletingId = current.id, nextId = available[index + 1]?.id || available[index - 1]?.id;
    try {
      if (await onDelete(current) === false) { if (alive.current) setError('Photo couldn’t be deleted. Try again.'); return; }
      if (!alive.current) return;
      setRemoved(ids => [...ids, deletingId]);
      if (nextId) setSelectedId(nextId); else onClose();
    } catch { if (alive.current) setError('Photo couldn’t be deleted. Try again.'); }
    finally { deleting.current = false; }
  };
  return <Viewer photoUrl={asset?.photoUrl || ''} photoId={current.id} loading={!asset || asset.loading}
    workout={current.workout} busy={busy} error={error} onClose={onClose} returnFocusRef={returnFocusRef}
    onDelete={remove} onViewWorkout={onViewWorkout ? () => onViewWorkout(current.workoutId) : undefined}
    paging={{ index, total: available.length, previous: index > 0, next: index < available.length - 1, navigate, imageError,
      pages: windowEntries.map(entry => entry ? { entry, ...cache.current.get(entry.id) } : null) }} />;
}
