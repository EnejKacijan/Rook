import { useEffect, useRef, useState } from 'react';
import { displayWeight, weightUnit } from './domain.js';

export function EstimatedOneRepMaxChart({ sessions, units }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(280);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const unit = weightUnit(units);
  const format = value => displayWeight(value, units);
  const date = value => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
  const values = sessions.map(s => s.estimatedOneRepMax);
  const min = Math.min(...values), max = Math.max(...values);
  const flat = max - min < .001;
  const padding = Math.max(5, max * .05, (max - min) * .15);
  const low = Math.max(0, flat ? min - padding : Math.floor(min - padding));
  const high = flat ? max + padding : Math.ceil(max + padding);
  const left = 48, right = width - 24, top = 24, bottom = 106;
  const points = sessions.map((s, i) => ({ ...s,
    x: sessions.length === 1 ? (left + right) / 2 : left + (right - left) * i / (sessions.length - 1),
    y: bottom - (s.estimatedOneRepMax - low) / (high - low) * (bottom - top),
  }));
  const delta = values.at(-1) - values[0];
  const summary = sessions.length === 1 ? 'Baseline · One session recorded'
    : flat ? `Unchanged · ${format(values[0])} ${unit} across ${sessions.length} sessions`
    : `Change ${delta > 0 ? '+' : delta < 0 ? '−' : ''}${format(Math.abs(delta))} ${unit} across ${sessions.length} sessions`;
  const active = points[selected];
  return <div className="exercise-e1rm-trend" ref={ref}>
    <div className="e1rm-heading"><strong>Estimated 1RM history</strong><small>{sessions.length ? `Last ${sessions.length} session${sessions.length === 1 ? '' : 's'}` : ''}</small></div>
    {points.length ? <>
      <svg viewBox={`0 0 ${width} 136`} aria-label={`Estimated 1RM history. ${summary}. Points are in session order.`}>
        {[high, (high + low) / 2, low].map((v, i) => <g key={i} className="e1rm-axis">
          <line x1={left} x2={right} y1={top + i * (bottom - top) / 2} y2={top + i * (bottom - top) / 2} />
          <text x={0} y={top + i * (bottom - top) / 2} dominantBaseline="middle">{format(v)}</text>
        </g>)}
        <text x={0} y={10} className="e1rm-axis-unit">{unit}</text>
        {points.length > 1 && <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" />}
        {points.map((p, i) => {
          const labelled = points.length <= 4 || i === 0 || i === points.length - 1;
          return <g key={`${p.date}-${i}`}>
            {labelled && <text className="e1rm-point-value" x={p.x} y={p.y - 11} textAnchor="middle">{format(p.estimatedOneRepMax)}</text>}
            {labelled && <text className="e1rm-date" x={p.x} y={128} textAnchor={i === points.length - 1 && points.length > 1 ? 'end' : i === 0 && points.length > 1 ? 'start' : 'middle'}>{date(p.date)}</text>}
            <g role="button" tabIndex={0} aria-label={`${date(p.date)}, Estimated 1RM ${format(p.estimatedOneRepMax)} ${unit}`} onClick={() => setSelected(i)} onFocus={() => setSelected(i)} onBlur={() => setSelected(null)} onKeyDown={e => { if (e.key === 'Escape' && selected !== null) { e.preventDefault(); e.stopPropagation(); setSelected(null); } if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(i); } }}>
              <rect className="e1rm-point-hit" x={p.x - 22} y={p.y - 22} width={44} height={44} rx={4} />
              <circle className="e1rm-point" cx={p.x} cy={p.y} r={3.5} />
            </g>
          </g>;
        })}
      </svg>
      <p className="e1rm-summary" aria-live="polite">{active ? `${date(active.date)} · Estimated 1RM ${format(active.estimatedOneRepMax)} ${unit}` : summary}</p>
    </> : <p className="e1rm-summary">No estimated 1RM history yet.</p>}
  </div>;
}
