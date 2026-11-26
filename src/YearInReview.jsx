import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ExerciseIllustration } from './ExerciseIllustration.jsx';
import { PersonalBestTrophy } from './WorkoutPersonalBestDetails.jsx';
import { exerciseArt } from './exerciseArt.js';
import { NavigationChevron } from './NavigationChevron.jsx';
import { shareYearCard } from './yearShareCard.js';
import { displayWeight, weightUnit, isoDay } from './domain.js';
import { yearInReview, yearReviewPages, yearReviewYears, yearHeadline, monthName } from './yearInReview.js';
import { observeVisibleMotion } from './visibleMotion.js';
import './yearInReview.css';

const number = value => new Intl.NumberFormat('en').format(value);
const plural = (count, word, many = `${word}s`) => `${number(count)} ${count === 1 ? word : many}`;
const shortDate = value => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
export function durationLabel(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
// Large totals read as hours with one decimal: 197.6 hours.
const hoursValue = seconds => Math.round(seconds / 360) / 10;

function usePrefersReducedMotion() {
  const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [reduced, setReduced] = useState(Boolean(query?.matches));
  useEffect(() => {
    if (!query) return;
    const change = () => setReduced(query.matches);
    query.addEventListener?.('change', change);
    return () => query.removeEventListener?.('change', change);
  }, []);
  return reduced;
}

// Counts up once when its page becomes active. The final value is the
// accessible text; animated digits are decoration.
function CountUp({ value, active, reduced, decimals = 0, format = number }) {
  const [shown, setShown] = useState(0);
  const ref = useRef(null);
  const played = useRef(false);
  useEffect(() => {
    if (reduced || played.current) { setShown(value); return; }
    if (!active) return;
    const node = ref.current;
    let frame, start;
    const duration = 900;
    const tick = time => {
      start ??= time;
      const progress = Math.min(1, (time - start) / duration), eased = 1 - (1 - progress) ** 3;
      setShown(progress === 1 ? value : Math.round(value * eased * 10 ** decimals) / 10 ** decimals);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    const stop = observeVisibleMotion([node], () => {
      played.current = true;
      frame = requestAnimationFrame(tick);
    }, { after: [node.closest('.year-track'), node.closest('.year-reveal')], threshold: .85 });
    return () => { stop(); cancelAnimationFrame(frame); };
  }, [active, reduced, value]);
  const visible = reduced || !active ? value : shown;
  const text = decimals ? Number(visible).toFixed(decimals) : format(visible);
  const final = decimals ? Number(value).toFixed(decimals) : format(value);
  return <span ref={ref} className="year-count"><span aria-hidden="true">{text}</span><span className="visually-hidden">{final}</span></span>;
}

function Art({ exerciseId, className = '' }) {
  const src = exerciseArt({ exerciseId });
  return <span className={`year-art ${className}`.trim()} aria-hidden="true">{src && <ExerciseIllustration src={src} alt="" decoding="async" />}</span>;
}

function Celebration() {
  return <span className="year-celebration" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} style={{ '--n': index }} />)}</span>;
}

function useFormat(units) {
  const unit = weightUnit(units);
  const load = kg => `${number(displayWeight(kg, units))} ${unit}`;
  const set = item => `${load(item.weight)} × ${item.reps}`;
  return { unit, load, set, volume: kg => Number(displayWeight(kg, units)) };
}

// Neutral: more reads as more, fewer simply names last year's number.
function versusLastYear(current, before, year, word) {
  if (current > before) return `${plural(current - before, word)} more than in ${year}.`;
  if (current === before) return `Same as ${year}.`;
  return `${year}: ${plural(before, word)}.`;
}
const lastYearNote = (stats, value, format = number) => stats.previous ? `${stats.previous.year}: ${format(value)}` : null;
const fullTime = time => time.counted > 0 && time.counted === time.of;

function Pair({ item, format }) {
  return <span className="year-pair"><span>{format.set(item.from)}</span><span className="year-pair-to"><span aria-hidden="true">→</span><span className="visually-hidden"> to </span><strong>{format.set(item.to)}</strong></span></span>;
}
function gainLabel(item, format) {
  const parts = [];
  if (item.loadGain > 0) parts.push(`+${format.load(item.loadGain)}`);
  if (item.repGain > 0) parts.push(`+${plural(item.repGain, 'rep')}`);
  return parts.join(' · ');
}

function Page({ page, stats, units, active, reduced, onStats }) {
  const format = useFormat(units);
  const p = { active, reduced };
  const year = stats.year;
  switch (page.kind) {
    case 'empty': return <div className="year-page-body is-centered">
      <p className="year-eyebrow year-reveal">YOUR YEAR IN ROOK</p>
      <h2 className="year-display year-reveal">{year}</h2>
      <p className="year-lede year-reveal">No training was logged in {year}. Workouts you log will appear in next year’s review.</p>
    </div>;
    case 'intro': {
      const headline = yearHeadline(stats), lead = stats.improvements[0];
      const line = headline.kind === 'improvement' ? `Your biggest jump this year: ${headline.name}.`
        : headline.kind === 'records' ? `New personal records on ${plural(headline.count, 'exercise')}.`
          : headline.kind === 'reps' ? `More reps on ${headline.name} than when you started.`
            : headline.kind === 'blocks' ? `${plural(headline.count, 'training block')} finished.` : 'Here is your year of training.';
      return <div className="year-page-body is-centered">
        {lead && <Art exerciseId={lead.exerciseId} className="is-hero year-parallax" />}
        <p className="year-eyebrow year-reveal">YOUR YEAR IN ROOK</p>
        <h2 className="year-display year-reveal">{year}</h2>
        <p className="year-lede year-reveal">{line}</p>
        <p className="year-hint year-reveal" aria-hidden="true">Swipe or tap Next</p>
      </div>;
    }
    case 'workouts': return <div className="year-page-body">
      <p className="year-eyebrow year-reveal">SHOWING UP</p>
      <p className="year-big year-reveal"><CountUp value={stats.workouts} {...p} /></p>
      <h2 className="year-title year-reveal">{stats.workouts === 1 ? 'workout' : 'workouts'}</h2>
      <p className="year-lede year-reveal">on {plural(stats.strengthDays, 'different day')}.</p>
      {stats.firstDay && stats.lastDay !== stats.firstDay && <p className="year-note year-reveal">First on {shortDate(stats.firstDay)}, last on {shortDate(stats.lastDay)}.</p>}
      {stats.previous && <p className="year-note year-reveal">{versusLastYear(stats.workouts, stats.previous.workouts, stats.previous.year, 'workout')}</p>}
    </div>;
    case 'rhythm': {
      const max = Math.max(1, ...stats.months.map(month => month.workouts + month.activities));
      return <div className="year-page-body">
        <p className="year-eyebrow year-reveal">YOUR RHYTHM</p>
        <p className="year-big year-reveal"><CountUp value={stats.activeWeeks} {...p} /><small> / {stats.weeksInYear}</small></p>
        <h2 className="year-title year-reveal">weeks with training</h2>
        <ol className="year-months year-reveal" aria-label="Workouts by month">
          {stats.months.map(month => <li key={month.index} className={stats.topMonth?.index === month.index ? 'is-top' : undefined}
            aria-label={`${monthName(month.index)}: ${plural(month.workouts, 'workout')}${month.activities ? `, ${plural(month.activities, 'activity', 'activities')}` : ''}`}>
            <span className="year-month-bar" aria-hidden="true"><i style={{ '--h': (month.workouts + month.activities) / max, '--a': month.activities / Math.max(1, month.workouts + month.activities), '--m': month.index }} /></span>
            <small aria-hidden="true">{monthName(month.index)[0]}</small>
          </li>)}
        </ol>
        {stats.topMonth && <p className="year-lede year-reveal">Busiest month: <strong>{new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(year, stats.topMonth.index, 1))}</strong>, {plural(stats.topMonth.workouts, 'workout')}.</p>}
      </div>;
    }
    case 'time': {
      const { time } = stats, big = time.totalSeconds >= 36000;
      return <div className="year-page-body">
        <p className="year-eyebrow year-reveal">LOGGED TRAINING TIME</p>
        <p className={`year-big year-reveal${big ? '' : ' is-text'}`}>{big ? <><CountUp value={hoursValue(time.totalSeconds)} decimals={1} {...p} /><small> hours</small></> : <span className="year-count-static">{durationLabel(time.totalSeconds)}</span>}</p>
        <dl className="year-facts year-reveal">
          <div><dt>Typical session</dt><dd>{durationLabel(time.typicalSeconds)}</dd></div>
          {time.longest && <div><dt>Longest</dt><dd>{durationLabel(time.longest.seconds)}<small>{time.longest.name} · {shortDate(time.longest.day)}</small></dd></div>}
        </dl>
        {time.counted < time.of && <p className="year-note year-reveal">From {time.counted} of {plural(time.of, 'workout')} with a recorded duration.</p>}
      </div>;
    }
    case 'work': return <div className="year-page-body">
      <p className="year-eyebrow year-reveal">THE WORK</p>
      <ul className="year-stack">
        <li className="year-reveal"><strong><CountUp value={stats.sets} {...p} /></strong><span>sets</span></li>
        <li className="year-reveal"><strong><CountUp value={stats.reps} {...p} /></strong><span>reps</span></li>
        {stats.volumeKg > 0 && <li className="year-reveal"><strong><CountUp value={Math.round(format.volume(stats.volumeKg))} {...p} /></strong><span>{format.unit} moved</span></li>}
      </ul>
      {stats.volumeKg > 0 && <p className="year-note year-reveal">Logged weight × reps. Bodyweight, assisted and timed sets are not included.</p>}
      {stats.holdSeconds >= 60 && <p className="year-note year-reveal">Plus {durationLabel(stats.holdSeconds)} of timed holds.</p>}
    </div>;
    case 'records': return <div className="year-page-body">
      {active && !reduced && <Celebration />}
      <p className="year-eyebrow year-reveal"><PersonalBestTrophy /> PERSONAL RECORDS</p>
      <p className="year-big year-reveal"><CountUp value={stats.records.sessions} {...p} /></p>
      <h2 className="year-title year-reveal">{stats.records.sessions === 1 ? 'new record' : 'new records'}</h2>
      <p className="year-lede year-reveal">across {plural(stats.records.exercises, 'exercise')}, measured against everything you logged before.</p>
      <ul className="year-list">
        {stats.records.top.map(item => <li key={item.exerciseId} className="year-reveal">
          <Art exerciseId={item.exerciseId} /><span><strong>{item.name}</strong><small>Best {format.set(item)} · {plural(item.count, 'record')}</small></span>
        </li>)}
      </ul>
    </div>;
    case 'improvements': return <div className="year-page-body">
      <p className="year-eyebrow year-reveal">BIGGEST IMPROVEMENTS</p>
      <h2 className="year-title year-reveal">From your first session of the year to your best</h2>
      <ul className="year-list is-cards">
        {stats.improvements.map(item => <li key={item.exerciseId} className="year-reveal">
          <Art exerciseId={item.exerciseId} className="year-parallax" /><span><strong>{item.name}</strong><Pair item={item} format={format} /><small>{gainLabel(item, format)}</small></span>
        </li>)}
      </ul>
    </div>;
    case 'favorites': return <div className="year-page-body">
      <p className="year-eyebrow year-reveal">YOUR REGULARS</p>
      <h2 className="year-title year-reveal">The exercises you came back to</h2>
      <ol className="year-list is-ranked">
        {stats.topExercises.map((item, index) => <li key={item.exerciseId || item.name} className="year-reveal">
          <b aria-hidden="true">{index + 1}</b><Art exerciseId={item.exerciseId} /><span><strong>{item.name}</strong><small>{plural(item.sessions, 'session')} · {plural(item.sets, 'set')}</small></span>
        </li>)}
      </ol>
      {!!stats.focus.length && <div className="year-focus year-reveal">
        <p className="year-note">Most of your sets went to</p>
        <ul>{stats.focus.map(item => <li key={item.muscle}><span>{item.muscle}</span><i style={{ '--w': item.share }} aria-hidden="true" /><small>{Math.round(item.share * 100)}%</small></li>)}</ul>
      </div>}
    </div>;
    case 'beyond': return <div className="year-page-body">
      <p className="year-eyebrow year-reveal">BEYOND THE LIFTS</p>
      <ul className="year-stack">
        {!!stats.blocks.length && <li className="year-reveal"><strong><CountUp value={stats.blocks.length} {...p} /></strong><span>{stats.blocks.length === 1 ? 'training block finished' : 'training blocks finished'}</span>
          <small>{stats.blocks.length === 1 ? stats.blocks[0].name : `Last: ${stats.blocks.at(-1).name}, ${shortDate(stats.blocks.at(-1).completedAt)}`}</small></li>}
        {!!stats.conditioning.sessions && <li className="year-reveal"><strong><CountUp value={stats.conditioning.sessions} {...p} /></strong><span>conditioning {stats.conditioning.sessions === 1 ? 'session' : 'sessions'}</span>
          {stats.conditioning.counted > 0 && <small>{durationLabel(stats.conditioning.seconds)} logged, separate from strength time</small>}</li>}
        {!!stats.otherActivities.sessions && <li className="year-reveal"><strong><CountUp value={stats.otherActivities.sessions} {...p} /></strong><span>cardio and mobility {stats.otherActivities.sessions === 1 ? 'session' : 'sessions'}</span>
          {stats.otherActivities.counted > 0 && <small>{durationLabel(stats.otherActivities.seconds)} logged</small>}</li>}
      </ul>
    </div>;
    case 'finale': return <div className="year-page-body">
      {active && !reduced && <Celebration />}
      <p className="year-eyebrow year-reveal">{year} IN NUMBERS</p>
      <h2 className="year-title year-reveal">That was your year.</h2>
      <dl className="year-grid">
        <div className="year-reveal"><dt>Workouts</dt><dd>{number(stats.workouts)}</dd></div>
        {stats.time.counted > 0 && <div className="year-reveal"><dt>Logged time</dt><dd>{stats.time.totalSeconds >= 36000 ? `${hoursValue(stats.time.totalSeconds)} h` : durationLabel(stats.time.totalSeconds)}</dd></div>}
        {stats.activeWeeks > 0 && <div className="year-reveal"><dt>Active weeks</dt><dd>{stats.activeWeeks}</dd></div>}
        <div className="year-reveal"><dt>Sets</dt><dd>{number(stats.sets)}</dd></div>
        {stats.records.sessions > 0 && <div className="year-reveal"><dt>Records</dt><dd>{number(stats.records.sessions)}</dd></div>}
        {stats.blocks.length > 0 && <div className="year-reveal"><dt>Blocks</dt><dd>{stats.blocks.length}</dd></div>}
      </dl>
      <div className="year-finale-actions year-reveal">
        <ShareButton stats={stats} units={units} />
        <button type="button" className="text-button year-finale-stats" onClick={onStats}>All year stats<NavigationChevron /></button>
      </div>
    </div>;
    default: return null;
  }
}

// Drawn on the device; Rook uploads nothing. Cancelling the share sheet is
// not an error.
function ShareButton({ stats, units }) {
  const [status, setStatus] = useState('idle');
  const share = async () => {
    if (status === 'working') return;
    setStatus('working');
    try {
      const result = await shareYearCard(stats, { units });
      setStatus(result === 'downloaded' ? 'saved' : 'idle');
    } catch { setStatus('error'); }
  };
  return <>
    <button type="button" className="button primary" onClick={share} disabled={status === 'working'} aria-describedby="year-share-status">{status === 'working' ? 'PREPARING IMAGE…' : 'SHARE'}</button>
    <p id="year-share-status" className="year-share-status" role="status">{status === 'saved' ? 'Image saved. Only totals and one lift are shown.' : status === 'error' ? 'The image could not be created. Try again.' : ''}</p>
  </>;
}

function AllStats({ stats, units, onBack }) {
  const format = useFormat(units);
  const rows = [
    ['Workouts', number(stats.workouts), lastYearNote(stats, stats.previous?.workouts)],
    ['Training days', number(stats.trainingDays), stats.trainingDays !== stats.strengthDays ? 'Includes conditioning and cardio days' : null],
    ['Weeks with training', `${stats.activeWeeks} of ${stats.weeksInYear}`, lastYearNote(stats, stats.previous?.activeWeeks)],
    stats.topMonth && ['Busiest month', `${new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(stats.year, stats.topMonth.index, 1))} · ${plural(stats.topMonth.workouts, 'workout')}`],
    ['Logged training time', stats.time.counted ? durationLabel(stats.time.totalSeconds) : 'Not recorded', stats.time.counted < stats.time.of ? `${stats.time.counted} of ${stats.time.of} workouts have a recorded duration`
      : stats.previous && fullTime(stats.previous.time) ? lastYearNote(stats, stats.previous.time.totalSeconds, durationLabel) : null],
    stats.time.counted > 0 && ['Typical session', durationLabel(stats.time.typicalSeconds), 'Median of recorded durations'],
    stats.time.longest && ['Longest session', durationLabel(stats.time.longest.seconds), `${stats.time.longest.name} · ${shortDate(stats.time.longest.day)}`],
    ['Sets', number(stats.sets), lastYearNote(stats, stats.previous?.sets)],
    ['Reps', number(stats.reps)],
    stats.volumeKg > 0 && ['Weight moved', `${number(Math.round(format.volume(stats.volumeKg)))} ${format.unit}`, `From ${plural(stats.volumeSets, 'set')} with logged external weight`],
    stats.holdSeconds > 0 && ['Timed holds', durationLabel(stats.holdSeconds)],
    ['Personal records', number(stats.records.sessions), stats.records.sessions ? `On ${plural(stats.records.exercises, 'exercise')}` : null],
    ['Different exercises', number(stats.distinctExercises)],
    stats.deloadWorkouts > 0 && ['Deload workouts', number(stats.deloadWorkouts), 'Counted as training, kept apart from records'],
    stats.movedWorkouts > 0 && ['Moved workouts', number(stats.movedWorkouts), 'Counted on the day you trained'],
    stats.importedWorkouts > 0 && ['Imported workouts', number(stats.importedWorkouts)],
    ['Training blocks finished', number(stats.blocks.length)],
    stats.conditioning.sessions > 0 && ['Conditioning', plural(stats.conditioning.sessions, 'session'), stats.conditioning.counted ? `${durationLabel(stats.conditioning.seconds)} logged` : null],
    stats.otherActivities.sessions > 0 && ['Cardio and mobility', plural(stats.otherActivities.sessions, 'session'), stats.otherActivities.counted ? `${durationLabel(stats.otherActivities.seconds)} logged` : null],
  ].filter(Boolean);
  return <div className="year-stats">
    <p className="eyebrow">ALL YEAR STATS</p>
    <h2>{stats.year}</h2>
    <dl>{rows.map(([label, value, note]) => <div key={label}><dt>{label}{note && <small>{note}</small>}</dt><dd>{value}</dd></div>)}</dl>
    <p className="sheet-footnote">Counted from completed workouts on the day you trained. Corrections replace the original record. Records compare against all earlier history and leave out deload sessions. Logged time uses saved durations only; missing durations are not filled in.</p>
    <button type="button" className="button secondary" onClick={onBack}>BACK TO STORY</button>
  </div>;
}

// Horizontal pages with a gesture that follows the finger. The committed page
// index is the only navigation state, so fast taps can't skip or desync pages.
export function YearInReview({ state, close, initialYear, today = isoDay() }) {
  const years = useMemo(() => yearReviewYears(state, today), [state.workouts, state.optionalSessions, today]);
  const [year, setYear] = useState(initialYear && years.includes(initialYear) ? initialYear : years[0]);
  const stats = useMemo(() => year ? yearInReview(state, year) : null, [state.workouts, state.optionalSessions, state.completedTrainingBlocks, state.program?.trainingBlock, year]);
  const pages = useMemo(() => stats ? yearReviewPages(stats) : [{ kind: 'empty' }], [stats]);
  const [index, setIndex] = useState(0), [view, setView] = useState('story');
  const reduced = usePrefersReducedMotion();
  const viewport = useRef(null), track = useRef(null), drag = useRef(null), live = useRef(null);
  const last = pages.length - 1;
  const goTo = useCallback(next => setIndex(current => Math.max(0, Math.min(last, typeof next === 'function' ? next(current) : next))), [last]);
  useEffect(() => { setIndex(0); setView('story'); }, [year]);
  useLayoutEffect(() => { track.current?.style.setProperty('--drag', '0'); }, [index]);
  useEffect(() => { viewport.current?.querySelectorAll('.year-page')[index]?.scrollTo?.({ top: 0 }); }, [index]);
  // Stagger each page's content in reading order.
  useLayoutEffect(() => {
    viewport.current?.querySelectorAll('.year-page').forEach(page => page.querySelectorAll('.year-reveal').forEach((item, order) => item.style.setProperty('--r', order)));
  }, [index, pages, view]);

  const onPointerDown = event => {
    if (event.button > 0 || event.target.closest('button, a, select, input')) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, dx: 0, width: viewport.current.clientWidth, lastX: event.clientX, lastTime: event.timeStamp, velocity: 0 };
  };
  const onPointerMove = event => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x, dy = event.clientY - state.y;
    if (!state.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      state.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (state.axis === 'y') { drag.current = null; return; }
      viewport.current.setPointerCapture?.(event.pointerId);
      track.current.classList.add('is-dragging');
    }
    // Resist past the first and last page.
    const edge = index === 0 && dx > 0 || index === last && dx < 0;
    state.dx = edge ? dx / 3 : dx;
    // Velocity over the latest move, so a quick flick turns the page.
    const elapsed = event.timeStamp - state.lastTime;
    if (elapsed > 0) state.velocity = (event.clientX - state.lastX) / elapsed;
    state.lastX = event.clientX; state.lastTime = event.timeStamp;
    track.current.style.setProperty('--drag', String(state.dx / state.width));
  };
  const endDrag = (event, cancelled = false) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    if (state.axis !== 'x') return;
    track.current.classList.remove('is-dragging');
    const distance = state.dx / state.width;
    const velocity = event.timeStamp - state.lastTime < 80 ? state.velocity : 0;
    track.current.style.setProperty('--drag', '0');
    if (!cancelled && (distance < -0.22 || velocity < -0.5)) goTo(i => i + 1);
    else if (!cancelled && (distance > 0.22 || velocity > 0.5)) goTo(i => i - 1);
  };
  const onKeyDown = event => {
    if (view !== 'story' || event.target.closest('select')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(i => i + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(i => i - 1); }
  };
  const pageLabel = kind => ({ empty: 'No training', intro: 'Introduction', workouts: 'Workouts', rhythm: 'Weeks and months', time: 'Logged training time', work: 'Sets, reps and weight', records: 'Personal records', improvements: 'Biggest improvements', favorites: 'Your regulars', beyond: 'Blocks and conditioning', finale: 'Your year in numbers' })[kind];
  const units = state.profile?.units;

  return <section role="dialog" aria-modal="true" className={`screen year-review${reduced ? ' is-reduced-motion' : ''}`} aria-label={`Your year in Rook${year ? `, ${year}` : ''}`} onKeyDown={onKeyDown}>
    <header className="year-review-bar">
      {view === 'story' && pages.length > 1 && <ol className="year-progress" aria-label="Pages">
        {pages.map((page, i) => <li key={page.kind}><button type="button" aria-label={`Page ${i + 1} of ${pages.length}: ${pageLabel(page.kind)}`} aria-current={i === index ? 'step' : undefined}
          className={i < index ? 'is-done' : i === index ? 'is-current' : undefined} onClick={() => goTo(i)}><i /></button></li>)}
      </ol>}
      <div className="year-review-controls">
        {years.length > 1 ? <label className="year-select"><span className="visually-hidden">Year</span>
          <select value={year} onChange={event => setYear(Number(event.target.value))}>{years.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
          : <span className="year-select-static">{year}</span>}
        <button type="button" className="year-close" aria-label="Close year in review" onClick={close}><span aria-hidden="true">×</span></button>
      </div>
    </header>
    {view === 'stats' && stats ? <div className="year-stats-scroll"><AllStats stats={stats} units={units} onBack={() => setView('story')} /></div> : <>
      <div ref={viewport} className="year-viewport" data-horizontal-gesture="true" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)} onLostPointerCapture={event => { if (event.target === viewport.current) endDrag(event, true); }}>
        <div ref={track} className="year-track" style={{ '--index': index }}>
          {pages.map((page, i) => <section key={`${year}-${page.kind}`} className={`year-page is-${page.kind}${i === index ? ' is-active' : ''}`}
            style={{ '--offset': i - index }} aria-hidden={i !== index} inert={i !== index ? '' : undefined} aria-roledescription="page" aria-label={pageLabel(page.kind)}>
            {Math.abs(i - index) <= 1 && <Page page={page} stats={stats || { year }} units={units} active={i === index} reduced={reduced} onStats={() => setView("stats")} />}
          </section>)}
        </div>
      </div>
      <p ref={live} className="visually-hidden" aria-live="polite">{`Page ${index + 1} of ${pages.length}: ${pageLabel(pages[index]?.kind)}`}</p>
      {pages.length > 1 && <footer className="year-review-nav">
        <button type="button" className="year-nav-button" aria-label="Previous page" disabled={index === 0} onClick={() => goTo(i => i - 1)}><NavigationChevron direction="left" /></button>
        <span aria-hidden="true">{index + 1} / {pages.length}</span>
        {index < last ? <button type="button" className="year-nav-button is-next" aria-label="Next page" onClick={() => goTo(i => i + 1)}><span>NEXT</span><NavigationChevron /></button>
          : <button type="button" className="year-nav-button is-next is-done" onClick={close}><span>DONE</span></button>}
      </footer>}
    </>}
  </section>;
}

// Calm entry on Today during January only. Dismissal is a per-device display
// preference and never changes training data.
const DISMISS_KEY = 'rook.year-review.dismissed.v1';
export function yearReviewCardYear(state, today = isoDay()) {
  if (today.slice(5, 7) !== '01' || state.activeWorkout || state.activeOptionalSession) return null;
  const year = Number(today.slice(0, 4)) - 1;
  if (!yearReviewYears(state, today).includes(year)) return null;
  try { if (JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]').includes(`${state.profile?.id}:${year}`)) return null; } catch { /* Storage may be unavailable; show the card. */ }
  return year;
}
export function YearReviewTodayCard({ state, open, today = isoDay() }) {
  const [hidden, setHidden] = useState(false);
  const year = yearReviewCardYear(state, today);
  if (!year || hidden) return null;
  const dismiss = () => {
    try { const list = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); localStorage.setItem(DISMISS_KEY, JSON.stringify([...new Set([...list, `${state.profile?.id}:${year}`])].slice(-10))); } catch { /* Hide for this visit only. */ }
    setHidden(true);
  };
  return <section className="year-review-card" aria-label={`Your year in Rook ${year}`}>
    <div><p className="eyebrow">YOUR YEAR IN ROOK</p><strong>{year} is ready</strong><p>A look back at your training year.</p></div>
    <div className="year-review-card-actions"><button type="button" className="text-button" onClick={() => open(year)}>OPEN</button>
      <button type="button" className="text-button is-quiet" onClick={dismiss}>NOT NOW</button></div>
    <span className="year-review-card-mark" aria-hidden="true">{year}</span>
  </section>;
}
export function YearReviewProgressEntry({ state, open, today = isoDay() }) {
  const years = yearReviewYears(state, today);
  if (!years.length) return null;
  return <section className="year-review-entry">
    <p className="eyebrow">YEAR IN REVIEW</p>
    {years.map(year => <button type="button" key={year} className="list-row year-review-entry-row" onClick={() => open(year)}>
      <span><strong>Your year in Rook · {year}</strong><small>Your training year as a short story</small></span>
      <NavigationChevron />
    </button>)}
  </section>;
}
