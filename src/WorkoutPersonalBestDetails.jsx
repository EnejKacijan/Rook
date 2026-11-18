import { displayWeight, weightUnit } from './domain.js';
import './workoutPersonalBestDetails.css';

export function PersonalBestTrophy() {
  return <>
    <svg className="session-log-trophy" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M8 4h8v6a4 4 0 0 1-8 0V4ZM8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 14v5M8 20h8" />
    </svg>
    <span className="visually-hidden">, Personal best</span>
  </>;
}

function weightGain(kg, units) {
  const amount = displayWeight(kg, units);
  return `${amount > 0 ? `+${amount}` : '<0.01'} ${weightUnit(units)}`;
}

function repGain(reps) {
  return `+${reps} ${reps === 1 ? 'rep' : 'reps'}`;
}

export function PersonalBestGain({ best, units }) {
  const { previousHeaviest, previousReps, estimate } = best;
  const estimateGain = estimate && weightGain(estimate.current - estimate.previous, units);
  let label, description;
  if (previousHeaviest) {
    const extraReps = best.reps - previousHeaviest.reps;
    label = weightGain(best.weight - previousHeaviest.weight, units);
    if (extraReps > 0) label += ` · ${repGain(extraReps)}`;
    description = `${label} compared with your previous heaviest set`;
  } else if (previousReps != null) {
    label = repGain(best.reps - previousReps);
    description = `${label} compared with your previous best at this weight`;
  } else {
    label = `${estimateGain} e1RM`;
    description = `${estimateGain} in estimated one-rep max`;
  }
  if (estimateGain && (previousHeaviest || previousReps != null))
    description += `. ${estimateGain} in estimated one-rep max`;
  return <span className="session-log-best-gain" title={description}>
    <span aria-hidden="true">{label}</span>
    <span className="visually-hidden">{description}</span>
  </span>;
}
