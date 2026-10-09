import React, { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createExerciseSearchIndex } from './domain.js';
import { SearchInput } from './SearchInput.jsx';
import { ExercisePickerIdentity } from './ExercisePickerIdentity.jsx';
import { CustomExerciseFallback } from './CustomExerciseFallback.jsx';
import { observeVisibleViewport } from './sheetVisibleViewport.js';

const ExerciseOption = memo(function ExerciseOption({ item, images, onSelect }) {
  return <button type="button" role="option" onClick={() => onSelect(item.id)}>
    <ExercisePickerIdentity item={item} enabled={images} deferOffscreen />
  </button>;
});

// Query edits belong to this local picker, not the whole workout draft. The
// parent supplies its canonical equipment/restriction-filtered catalog and
// still validates every selection against the current draft before adding it.
export function PlanEditorExercisePicker({ catalog, day, images, onSelect, onCancel, onCreate }) {
  const [query, setQuery] = useState('');
  const root = useRef(null);
  const search = useMemo(() => createExerciseSearchIndex(catalog), [catalog]);
  const candidates = useMemo(() => {
    const occupied = new Set(day.exercises.map(exercise => exercise.exerciseId));
    return search(query, occupied);
  }, [search, day.exercises, query]);

  useLayoutEffect(() => {
    const picker = root.current;
    const screen = picker?.closest('.detail-screen, .sheet');
    if (!screen) return;
    let frame = 0;
    const reveal = () => {
      frame = 0;
      const input = picker.querySelector('input');
      if (document.activeElement !== input || screen.inert) return;
      const first = picker.querySelector('[role=option]') || picker.querySelector('[role=status]');
      if (!first) return;
      const field = input.getBoundingClientRect(), result = first.getBoundingClientRect();
      const panel = screen.getBoundingClientRect();
      const headerBottom = screen.querySelector('.detail-header, .sheet-header-chrome')?.getBoundingClientRect().bottom || panel.top;
      const footer = screen.querySelector('.sheet-action-footer:not([hidden])');
      const viewport = window.visualViewport;
      const top = Math.max(panel.top, headerBottom) + 12;
      const bottom = Math.min(panel.bottom, footer?.getBoundingClientRect().top ?? panel.bottom, viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 12;
      // Reserve one result as well as the caret. The shared footer already
      // reveals the field; revealing only that field leaves results behind it.
      // Move this existing panel only as far as needed, never the backdrop.
      const available = Math.max(0, field.top - top);
      const covered = Math.max(0, result.bottom - bottom);
      if (covered && available) screen.scrollTop += Math.min(covered, available);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(reveal); };
    picker.addEventListener('focusin', schedule);
    const release = observeVisibleViewport(schedule);
    schedule();
    return () => { cancelAnimationFrame(frame); picker.removeEventListener('focusin', schedule); release(); };
  }, [candidates]);

  return <div ref={root} className="plan-editor-add-picker">
    <div className="scratch-exercise-search">
      <SearchInput resultsRoot=".plan-editor-add-picker" resultsSelector="[role=listbox]" onClear={() => setQuery('')}
        aria-label={`Search exercise for ${day.weekday}`} placeholder="Search exercises" value={query}
        onChange={event => setQuery(event.target.value)} />
      <button type="button" onClick={onCancel}>CANCEL</button>
    </div>
    {onCreate && <CustomExerciseFallback onCreate={() => onCreate(query)} />}
    <div className="scratch-exercise-results" role="listbox" aria-label={`Exercises for ${day.weekday}`}>
      {candidates.map(item => <ExerciseOption key={item.id} item={item} images={images} onSelect={onSelect} />)}
    </div>
    {!candidates.length && <p className="plan-picker-empty" role="status">No matching exercises</p>}
    <small>Saved restrictions apply. Custom exercises that cannot be verified are not offered.</small>
  </div>;
}
