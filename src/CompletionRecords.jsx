import { useId, useState } from 'react';
import { ExerciseIllustration } from './ExerciseIllustration.jsx';
import { PersonalBestTrophy } from './WorkoutPersonalBestDetails.jsx';
import { exerciseArt } from './exerciseArt.js';
import { displayWeight, displayEstimatedOneRepMax, exerciseName, weightUnit } from './domain.js';
import './completionRecords.css';

const plural = (count, word) => `${count} ${count === 1 ? word : `${word}s`}`;
// One record per exercise, strongest kind first, so one set is never shown
// twice as a weight, rep and estimated-1RM record.
export function primaryRecord(bests = []) {
  return bests.find(best => best.previousHeaviest) || bests.find(best => best.previousReps != null) || bests.find(best => best.estimate) || null;
}
const recordRank = best => best.previousHeaviest ? 0 : best.previousReps != null ? 1 : 2;
// Heaviest-set records lead, then rep records, then estimates; workout order
// breaks ties, so the first cards are always the strongest wins.
export function completionRecordItems(personalBests) {
  if (!personalBests?.size) return [];
  return [...personalBests.entries()].map(([exercise, bests]) => ({ exercise, best: primaryRecord(bests) }))
    .filter(item => item.best)
    .sort((a, b) => recordRank(a.best) - recordRank(b.best));
}
// Up to four records fit on one phone screen next to the summary, so all
// show. Past that, hiding a single card behind a button saves nothing, so
// the list opens with three and one tap reveals the rest in place.
export const RECORDS_SHOWN_IN_FULL = 4;
export const RECORDS_PREVIEW = 3;

function RecordValue({ best, units }) {
  const unit = weightUnit(units), load = kg => `${displayWeight(kg, units)} ${unit}`;
  let from, to, label;
  if (best.previousHeaviest) {
    from = `${load(best.previousHeaviest.weight)} × ${best.previousHeaviest.reps}`; to = `${load(best.weight)} × ${best.reps}`;
    const reps = best.reps - best.previousHeaviest.reps;
    label = `Heaviest set yet · +${load(best.weight - best.previousHeaviest.weight)}${reps > 0 ? ` · +${plural(reps, 'rep')}` : ''}`;
  } else if (best.previousReps != null) {
    from = `${load(best.weight)} × ${best.previousReps}`; to = `${load(best.weight)} × ${best.reps}`;
    label = `Most reps at this weight · +${plural(best.reps - best.previousReps, 'rep')}`;
  } else {
    from = `${displayEstimatedOneRepMax(best.estimate.previous, units)} ${unit}`; to = `${displayEstimatedOneRepMax(best.estimate.current, units)} ${unit}`;
    label = `Best estimated 1RM · from ${load(best.weight)} × ${best.reps}, an estimate`;
  }
  return <>
    <p className="completion-record-pair"><span>{from}</span><span className="completion-record-to"><span aria-hidden="true">→</span><span className="visually-hidden"> to </span><strong>{to}</strong></span></p>
    <small>{label}</small>
  </>;
}

function RecordItem({ exercise, best, units, index, revealed }) {
  const src = exerciseArt(exercise);
  return <li style={{ '--i': index }} className={revealed ? 'is-revealed' : undefined}>
    <span className="completion-record-art" aria-hidden="true">{src && <ExerciseIllustration src={src} alt="" decoding="async" />}</span>
    <div><h3>{exerciseName(exercise)}</h3><RecordValue best={best} units={units} /></div>
  </li>;
}

export function CompletionRecords({ personalBests, units }) {
  const items = completionRecordItems(personalBests);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (!items.length) return null;
  const collapsible = items.length > RECORDS_SHOWN_IN_FULL;
  const visible = collapsible && !expanded ? items.slice(0, RECORDS_PREVIEW) : items;
  const hidden = items.length - RECORDS_PREVIEW;
  return <section className="completion-records" aria-labelledby="completion-records-title">
    <h2 className="completion-records-title" id="completion-records-title"><PersonalBestTrophy />{items.length === 1 ? 'New personal record' : `${items.length} new personal records`}</h2>
    <ol id={listId}>
      {visible.map(({ exercise, best }, index) => {
        const revealed = collapsible && index >= RECORDS_PREVIEW;
        return <RecordItem key={exercise.id || `${exercise.exerciseId}-${index}`} exercise={exercise} best={best} units={units}
          index={revealed ? index - RECORDS_PREVIEW : index} revealed={revealed} />;
      })}
    </ol>
    {collapsible && <button type="button" className="text-button completion-records-toggle" aria-expanded={expanded} aria-controls={listId}
      onClick={() => setExpanded(open => !open)}>
      {expanded ? 'Show fewer' : `Show ${plural(hidden, 'more record')}`}
    </button>}
  </section>;
}
