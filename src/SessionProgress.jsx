import './sessionProgress.css';

// Presentation only: callers supply canonical time/completion state. No clock,
// persistence, target editing or completion side effects belong in this primitive.
export function SessionProgress({ value, max, current, mode = 'continuous', label = 'Session progress', valueText }) {
  const total = Number(max);
  if (!Number.isFinite(total) || total <= 0 || (mode === 'segmented' && !Number.isInteger(total))) return null;
  const amount = Number(value);
  const bounded = Math.min(total, Math.max(0, Number.isFinite(amount) ? amount : 0));
  const completed = mode === 'segmented' ? Math.floor(bounded) : bounded;
  const active = Number.isInteger(current) && current >= 1 && current <= total ? current : null;
  return <div className={`session-progress session-progress-${mode}`} role="progressbar"
    aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}
    aria-valuetext={valueText || `${completed} of ${total}`}
    style={mode === 'segmented' ? { '--session-progress-segments': total } : undefined}>
    {mode === 'segmented' ? Array.from({ length: total }, (_, index) => <span key={index}
      aria-hidden="true" data-state={index < completed ? 'complete' : index + 1 === active ? 'current' : 'pending'}
      data-current={index + 1 === active || undefined} />)
      : <span aria-hidden="true" style={{ width: `${completed / total * 100}%` }} />}
  </div>;
}

export function sessionDurationValueText(elapsed, target) {
  const duration = seconds => {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(value / 60), remainder = value % 60;
    const minuteText = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    const secondText = `${remainder} ${remainder === 1 ? 'second' : 'seconds'}`;
    return minutes ? `${minuteText}${remainder ? ` ${secondText}` : ''}` : secondText;
  };
  return `${duration(Math.min(elapsed, target))} of ${duration(target)}`;
}
