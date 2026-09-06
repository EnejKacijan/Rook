import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getWorkoutPhoto } from './workoutPhotos.js';
import { createObjectUrlLease, groupWorkoutPhotoTimeline } from './workoutPhotoTimeline.js';
import { canComparePhotos, chronologicalPhotoPair, toggleComparePhoto } from './workoutPhotoCompare.js';
import './workoutPhotoCompare.css';

export function WorkoutPhotoCompare({ entries, availability, onAvailability, onBack, onClose, onDeletePhoto, onViewWorkout, busy, status, Header, Thumbnail, Viewer }) {
  const [selection, setSelection] = useState([]);
  const [comparing, setComparing] = useState(false);
  const [images, setImages] = useState({});
  const [inspecting, setInspecting] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const root = useRef(null);
  const groups = useMemo(() => groupWorkoutPhotoTimeline(entries), [entries]);
  const pair = useMemo(() => chronologicalPhotoPair(selection), [selection]);
  const availableIds = entries.filter(entry => entry.metadataAvailable).map(entry => entry.id).join('|');
  const ready = canComparePhotos(selection, entries, availability);
  const title = comparing ? 'Compare photos' : selection.length === 0 ? 'Choose first photo' : selection.length === 1 ? 'Choose second photo' : 'Two photos selected';
  const back = () => comparing ? setComparing(false) : onBack();

  useLayoutEffect(() => {
    root.current.scrollTop = 0;
    root.current.querySelector('h1')?.focus({ preventScroll: true });
  }, [comparing]);

  useEffect(() => {
    if (!comparing) return;
    const recheck = () => setRefresh(value => value + 1);
    const visible = () => { if (document.visibilityState === 'visible') recheck(); };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', recheck);document.removeEventListener('visibilitychange', visible); };
  }, [comparing]);

  useEffect(() => {
    let current = true;
    const leases = [];
    setImages({});
    if (!comparing) return;
    for (const entry of pair) {
      if (!entries.some(item => item.id === entry.id && item.metadataAvailable)) {
        setImages(value => ({ ...value, [entry.id]: { unavailable: true } }));
        continue;
      }
      getWorkoutPhoto(entry.id).then(record => {
        if (!current) return;
        if (!record?.blob || !String(record.mimeType || record.blob.type).startsWith('image/')) throw Error('Unavailable');
        const lease = createObjectUrlLease(record.blob);leases.push(lease);
        setImages(value => ({ ...value, [entry.id]: { url: lease.url } }));
      }).catch(() => {
        if (current) {
          setImages(value => ({ ...value, [entry.id]: { unavailable: true } }));
          onAvailability(entry.id, false);
        }
      });
    }
    return () => { current = false; leases.forEach(lease => lease.revoke()); };
  }, [comparing, pair, availableIds, refresh, onAvailability]);

  const chooseAnother = id => { setInspecting(null);setSelection(value => value.filter(entry => entry.id !== id));setComparing(false); };
  const inspected = pair.find(entry => entry.id === inspecting);
  return <main ref={root} className="screen detail-screen workout-photo-compare-screen">
    <Header title={title} onBack={back} onClose={onClose} closeLabel="Close photo comparison" />
    <p className="eyebrow">PRIVATE PHOTOS</p>
    <h1 tabIndex={-1}>{title}</h1>
    <p className="photo-compare-intro">{comparing ? 'Tap either photo to inspect it.' : 'Choose two photos from your timeline.'}</p>
    {status && <p role="status">{status}</p>}
    {comparing ? <>
      <div className="photo-compare-pair">
        {pair.map(entry => <div className="photo-compare-context" key={`context-${entry.id}`} id={`compare-${entry.id}`}>
          <time dateTime={entry.day}>{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${entry.day}T12:00:00`))}</time>
          <strong>{entry.workoutName}</strong>
        </div>)}
        {pair.map(entry => <div className="photo-compare-frame" key={entry.id}>
          {images[entry.id]?.unavailable ? <div className="photo-compare-unavailable" role="status"><p>This photo is no longer available.</p><button className="text-button" onClick={() => chooseAnother(entry.id)}>Choose another</button></div> :
            <button className="photo-compare-inspect" aria-labelledby={`compare-${entry.id}`} disabled={!images[entry.id]?.ready} onClick={() => {setDeleteError('');setInspecting(entry.id);}}>
              {images[entry.id]?.url && <img src={images[entry.id].url} alt={`Private workout photo, ${entry.workoutName}, ${entry.day}`} onLoad={() => setImages(value => ({ ...value, [entry.id]: { ...value[entry.id], ready: true } }))} onError={() => {setImages(value => ({ ...value, [entry.id]: { unavailable: true } }));onAvailability(entry.id, false);}} />}
              {!images[entry.id]?.ready && <span role="status">Loading photo…</span>}
            </button>}
        </div>)}
      </div>
      <p className="photo-compare-privacy">Stored privately on this device. ROOK does not upload or analyze photos.</p>
      <button className="button secondary photo-compare-change" onClick={() => setComparing(false)}>CHANGE PHOTOS</button>
    </> : <>
      <div className="workout-photo-timeline-groups">
        {groups.map(group => <section key={group.key} className="workout-photo-timeline-group"><p className="eyebrow">{group.label}</p><div className="workout-photo-timeline-grid">
          {group.entries.map(entry => <Thumbnail key={entry.id} entry={entry} selectionMode selectionIndex={selection.findIndex(photo => photo.id === entry.id) + 1} disabled={!entry.metadataAvailable || availability[entry.id] !== true || selection.length === 2 && !selection.some(photo => photo.id === entry.id)} onAvailability={onAvailability} onOpen={() => setSelection(value => toggleComparePhoto(value, entry))} />)}
        </div></section>)}
      </div>
      <footer className="photo-compare-selection-footer"><p role="status">{selection.length} of 2 selected</p><button className="button primary" disabled={!ready} onClick={() => setComparing(true)}>COMPARE PHOTOS</button><button className="button quiet" onClick={onBack}>CANCEL</button></footer>
    </>}
    {inspected && images[inspected.id]?.ready && <Viewer photoUrl={images[inspected.id].url} workout={inspected.workout} busy={busy} error={deleteError} onClose={() => setInspecting(null)} onViewWorkout={() => onViewWorkout(inspected.workoutId)} onDelete={async () => { setDeleteError('');if (await onDeletePhoto(inspected)) setInspecting(null);else setDeleteError('Photo couldn’t be deleted. Try again.'); }} />}
  </main>;
}
