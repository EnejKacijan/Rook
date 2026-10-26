import {NavigationChevron} from './NavigationChevron.jsx';

export function TemporaryScheduleSummary({review,onView}) {
  const count=review.unresolved.length;
  // Successful changes already appear in the calendar and the Undo notice.
  // Only work that still needs attention belongs above today's workout.
  if(!count)return null;
  return <aside className="temporary-schedule-summary needs-attention" aria-label="Schedule needs attention">
    <button type="button" className="schedule-attention-open" onClick={onView}>
      <span><strong>Review schedule</strong><small>{count} {count===1?'workout needs':'workouts need'} attention</small></span>
      <NavigationChevron/>
    </button>
  </aside>;
}
