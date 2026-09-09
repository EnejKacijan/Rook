import React, { useMemo, useState } from 'react';
import { compatibleReplacementCandidates, exerciseMatchesQuery, exerciseName, rankExerciseSearch } from './domain.js';
import { planEditorExerciseAllowed } from './exerciseEligibility.js';
export { planEditorExerciseAllowed, createPlanEditorExerciseFilter } from './exerciseEligibility.js';
import { SearchInput } from './SearchInput.jsx';
import { Disclosure } from './Disclosure.jsx';

export function conflictReplacementCandidates(exercise, day, profile, conflict) {
  // Preserve the restriction-review policy: symptom context is not clearance
  // to recommend an apparently equivalent movement.
  if (conflict?.reason !== 'movement' || conflict.context === 'pain') return [];
  return compatibleReplacementCandidates(exercise, profile, day.exercises.map(item => item.exerciseId))
    .filter(item => item.id !== exercise.exerciseId && !day.exercises.some(other => other.id !== exercise.id && other.exerciseId === item.id));
}

export function PlanConflictResolution({ exercise, day, profile, conflict, minimumRir, onReplace, onRemove, onEffort, allExercises = [], onCreateCustom }) {
  const [open, setOpen] = useState(false);
  const [broad, setBroad] = useState(false);
  const [query, setQuery] = useState('');
  const [rir, setRir] = useState('');
  // Opening the sheet does not rank substitutions. Search reuses this result.
  const candidates = useMemo(() => open ? conflictReplacementCandidates(exercise, day, profile, conflict) : [], [open, exercise, day, profile, conflict]);
  const broaderCandidates = useMemo(() => open && broad ? allExercises.filter(item => planEditorExerciseAllowed(item, profile) && !day.exercises.some(other => other.exerciseId === item.id)) : [], [open, broad, allExercises, profile, day]);
  const matches = rankExerciseSearch((broad ? broaderCandidates : candidates).filter(item => exerciseMatchesQuery(item, query)), query);
  const effort = conflict.reason === 'effort';
  const canRemove = day.exercises.length > 1;
  return <div className="plan-conflict-resolution">
    <span className="plan-conflict-kicker">{effort ? 'EFFORT CONFLICT' : 'RESTRICTION CONFLICT'}</span>
    <h3>{effort ? 'Adjust prescribed effort' : 'Choose a replacement'}</h3>
    <p>{effort
      ? `This exercise is prescribed below your minimum of ${minimumRir} RIR. Choose ${minimumRir} RIR or higher.`
      : conflict.context === 'pain'
        ? 'ROOK cannot recommend a replacement for a symptom-related restriction.'
        : broad ? 'Choose an exercise that does not conflict with your saved training restrictions.'
        : 'Choose a similar exercise that does not conflict with your saved training restrictions.'}</p>
    {effort ? <>
      <label className="plan-editor-select"><span>Target RIR</span><select aria-label="Target RIR" value={rir} onChange={event => {
        const value = Number(event.target.value);
        if (event.target.value !== '' && Number.isInteger(value) && value >= minimumRir && value <= 4) {
          setRir(value);
          onEffort(value);
        }
      }}>
        <option value="" disabled>Choose RIR</option>
        {[1, 2, 3, 4].filter(value => value >= minimumRir).map(value => <option key={value} value={value}>{value} RIR</option>)}
      </select></label>
    </> : <>
      {conflict.context !== 'pain' && <button type="button" className="plan-editor-picker-trigger plan-conflict-choose" aria-expanded={open} aria-controls={`conflict-picker-${exercise.id}`} onClick={() => { setOpen(!open); setQuery(''); }}>
        <strong>{open ? 'CLOSE REPLACEMENTS' : 'CHOOSE REPLACEMENT'}</strong><i aria-hidden="true" />
      </button>}
      <Disclosure open={open}><div className="plan-editor-picker" id={`conflict-picker-${exercise.id}`}>
        {broad && <p>Other exercises may change this workout’s focus. Saved restrictions still apply; these are not equivalent replacements.</p>}
        {(broad || candidates.length > 0) && <SearchInput aria-label={`Search replacement for ${exerciseName(exercise)}`} placeholder={broad ? 'Search exercises' : 'Search similar exercises'} value={query} onChange={event => setQuery(event.target.value)} onClear={() => setQuery('')} />}
        {matches.length > 0 ? <div role="listbox" aria-label={broad ? 'Other exercises' : 'Similar replacements'}>{matches.map(item => <button type="button" role="option" aria-selected={false} key={item.id} onClick={() => onReplace(item.id)}>{item.name}</button>)}</div>
          : <div className="plan-conflict-empty" role="status"><strong>{broad ? 'No eligible exercises match your search.' : candidates.length ? 'No similar exercises match your search.' : 'No matching replacement found'}</strong>{!broad && !candidates.length && <p>Search other exercises that do not conflict with your restrictions{canRemove ? ', or remove this exercise.' : '. A workout must keep at least one exercise.'}</p>}</div>}
        <button type="button" className="text-button" onClick={() => { setBroad(!broad); setQuery(''); }}>{broad ? 'SHOW SIMILAR EXERCISES' : 'SEARCH OTHER EXERCISES'}</button>
        {onCreateCustom && <button type="button" className="text-button" onClick={() => { setBroad(true); setQuery(''); onCreateCustom(query); }}>CREATE CUSTOM EXERCISE</button>}
        {broad && <small>Custom exercises that ROOK cannot verify against your restrictions are not offered.</small>}
      </div></Disclosure>
      {conflict.context === 'pain' && <p>Review your training restrictions before choosing another movement, or remove this exercise from the plan.</p>}
      <button type="button" className="text-button plan-conflict-remove" disabled={!canRemove} onClick={onRemove}>REMOVE EXERCISE</button>
    </>}
  </div>;
}
