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
export function completionRecordItems(personalBests) {
  if (!personalBests?.size) return [];
  return [...personalBests.entries()].map(([exercise, bests]) => ({ exercise, best: primaryRecord(bests) })).filter(item => item.best);
}

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

export function CompletionRecords({ personalBests, units, limit = 3 }) {
  const items = completionRecordItems(personalBests);
  if (!items.length) return null;
  const shown = items.slice(0, limit), more = items.length - shown.length;
  return <section className="completion-records" aria-labelledby="completion-records-title">
    <h2 className="completion-records-title" id="completion-records-title"><PersonalBestTrophy />{items.length === 1 ? 'New personal record' : `${items.length} new personal records`}</h2>
    <ol>
      {shown.map(({ exercise, best }, index) => {
        const src = exerciseArt(exercise);
        return <li key={exercise.id || `${exercise.exerciseId}-${index}`} style={{ '--i': index }}>
          <span className="completion-record-art" aria-hidden="true">{src && <ExerciseIllustration src={src} alt="" decoding="async" />}</span>
          <div><h3>{exerciseName(exercise)}</h3><RecordValue best={best} units={units} /></div>
        </li>;
      })}
    </ol>
    {more > 0 && <p className="completion-records-more">{plural(more, 'more record')} in the workout details below.</p>}
  </section>;
}
