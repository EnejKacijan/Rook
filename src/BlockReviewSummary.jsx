import { useLayoutEffect, useRef } from 'react';
import { ExerciseIllustration } from './ExerciseIllustration.jsx';
import { PersonalBestTrophy } from './WorkoutPersonalBestDetails.jsx';
import { NavigationChevron } from './NavigationChevron.jsx';
import { ReviewDetails } from './ReviewDetails.jsx';
import { exerciseArt } from './exerciseArt.js';
import { displayWeight, displayEstimatedOneRepMax, weightUnit } from './domain.js';
import { blockHeadline, blockHighlights, improvementOf } from './blockReviewStory.js';
import { observeVisibleMotion } from './visibleMotion.js';

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;
export const shortDate = value => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
export const blockDateRange = review => review.completedAt
  ? `${shortDate(review.startDate)} – ${shortDate(review.completedAt)}`
  : `Since ${shortDate(review.startDate)}`;

export function useBlockFormat(units) {
  const unit = units === 'lb' ? 'lb' : 'kg';
  const load = value => `${displayWeight(value, unit)} ${unit}`;
  const set = (weight, reps) => reps != null ? `${load(weight)} × ${reps}` : load(weight);
  return { unit, load, set };
}

function ExerciseArt({ exerciseId }) {
  const src = exerciseArt({ exerciseId });
  return <span className="block-art" aria-hidden="true">
    {src && <ExerciseIllustration src={src} alt="" decoding="async" loading="lazy" />}
  </span>;
}

// "50 kg × 8 → 55 kg × 10": the lowest working set of the first and the
// latest comparable session, so both improved numbers read as one change.
export function ChangePair({ row, format }) {
  const from = format.set(row.fromWeight, row.fromReps), to = format.set(row.currentWeight, row.currentReps);
  return <span className="block-pair">
    <span>{from}</span><span className="block-pair-to"><span className="block-pair-arrow" aria-hidden="true">→</span><span className="visually-hidden"> to </span><strong>{to}</strong></span>
  </span>;
}

const recordLabel = types => types?.includes('weight') ? 'Heaviest set yet' : types?.includes('reps') ? 'Most reps at this weight' : 'Best estimated 1RM · estimate';
function changeLabel(change, format) {
  if (change.kind === 'load') return [`+${format.load(change.loadGain)}`, change.repGain ? `+${plural(change.repGain, 'rep')}` : null].filter(Boolean).join(' · ');
  return `+${plural(change.repGain, 'rep')}`;
}

function Highlight({ item, format }) {
  return <li className={`block-highlight is-${item.kind}`}>
    <ExerciseArt exerciseId={item.exerciseId} />
    <div>
      <h3><span>{item.name}</span>{item.pr && <PersonalBestTrophy />}</h3>
      <div className="block-highlight-detail">
        {item.change
          ? <><ChangePair row={item.row} format={format} /><small>{changeLabel(item.change, format)}</small></>
          : <><span className="block-pair"><strong>{format.set(item.pr.weight, item.pr.reps)}</strong></span><small>{recordLabel(item.pr.types)}</small></>}
      </div>
    </div>
  </li>;
}

function headlineCopy(review, headline, top, format) {
  const { count } = headline;
  if (headline.kind === 'improved') {
    const lead = top?.change;
    return [`${plural(count, 'exercise')} improved`,
      lead?.kind === 'load' ? `Biggest jump: ${top.name}, +${format.load(lead.loadGain)}.`
        : lead ? `Biggest jump: ${top.name}, +${plural(lead.repGain, 'rep')} at ${format.load(top.row.currentWeight)}.` : null];
  }
  if (headline.kind === 'records') return [`New records on ${plural(count, 'exercise')}`, 'Measured against every earlier session.'];
  if (headline.kind === 'steady') return ['A steady block', `Working weights held on ${plural(count, 'exercise')}.`];
  if (headline.kind === 'start') return ['A starting point', `${plural(count, 'session')} logged. More comparable sessions will show change.`];
  if (headline.kind === 'rest-only') return ['Planned recovery', 'No training was logged in this block.'];
  return ['No training logged', 'Nothing to compare yet. Your plan is unchanged.'];
}

function WeekStrip({ weeks }) {
  if (!weeks?.length) return null;
  return <ol className="block-week-strip" aria-label="Planned sessions by week">
    {weeks.map(week => {
      const rest = week.choice === 'rest' && week.plannedRest > 0, deload = week.phase === 'deload' && !rest;
      const label = `Week ${week.weekNumber}: ${rest && !week.completed ? 'planned recovery' : `${week.completed} of ${plural(week.planned, 'session')}`}${rest && week.completed ? ', then planned recovery' : ''}${deload ? ', deload' : ''}`;
      return <li key={week.weekNumber} className={`${rest ? 'is-rest' : ''}${deload ? ' is-deload' : ''}`.trim() || undefined} aria-label={label}>
        <span className="block-week-dots" aria-hidden="true">
          {Array.from({ length: week.planned }, (_, index) => <i key={index} style={{ '--i': index }} className={index < week.completed ? 'is-done' : index < week.completed + week.plannedRest ? 'is-rest' : ''} />)}
        </span>
        <small aria-hidden="true">W{week.weekNumber}</small>
      </li>;
    })}
  </ol>;
}

function notes(review) {
  const items = [];
  if (review.plannedRest) items.push(`Week ${review.plannedRest.weekNumber} planned recovery · ${shortDate(review.plannedRest.restFrom)} – ${shortDate(review.plannedRest.restThrough)}`);
  else if (review.deloadCompleted) {
    const week = review.weeks?.find(item => item.phase === 'deload' && item.completed);
    items.push(week ? `Week ${week.weekNumber} deload, kept apart from progress` : 'Deload kept apart from progress');
  }
  if (review.moved) items.push(`${review.moved} moved`);
  if (review.skipped) items.push(`${review.skipped} skipped`);
  if (review.endedEarly) items.push(`${review.endedEarly} ended early`);
  if (review.optionalCompleted) items.push(plural(review.optionalCompleted, 'extra session'));
  return items;
}

export function BlockReviewSummary({ review, block, units, historical, onOutcomes, next }) {
  const heroRef = useRef(null), highlightsRef = useRef(null);
  useLayoutEffect(() => {
    const hero = heroRef.current;
    const sheet = hero.closest('.block-review-sheet');
    if (!sheet || !window.IntersectionObserver || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    const targets = [hero, hero.querySelector('.block-week-strip'), ...(highlightsRef.current?.children || [])]
      .filter(node => node && node.dataset.blockReveal !== 'visible');
    for (const target of targets) target.dataset.blockReveal = 'waiting';
    const headerHeight = Math.ceil(sheet.querySelector(':scope > .detail-header')?.getBoundingClientRect().height ?? 0);
    return observeVisibleMotion(targets, node => { node.dataset.blockReveal = 'visible'; }, {
      after: [sheet], root: sheet, rootMargin: `-${headerHeight}px 0px 0px`, threshold: .2,
    });
  }, [review]);
  const format = useBlockFormat(units);
  const highlights = blockHighlights(review, 3), headline = blockHeadline(review);
  const [title, detail] = headlineCopy(review, headline, highlights[0], format);
  const records = review.prExercises ?? review.prs;
  const extra = notes(review);
  return <>
    <p className="eyebrow">{historical ? 'PAST BLOCK' : 'BLOCK COMPLETE'}</p>
    <h1>{review.name}</h1>
    <p className="block-review-dates">{plural(review.totalWeeks, 'week')} · {blockDateRange(review)}</p>
    {block?.historyCorrectedAt && <p className="sheet-footnote">Historical data changed after this block was reviewed. This summary reflects corrected history; approved plan decisions remain unchanged.</p>}
    <section ref={heroRef} className={`block-review-hero is-${headline.kind}`} aria-labelledby="block-review-headline">
      <h2 id="block-review-headline">{title}</h2>
      {detail && <p>{detail}</p>}
      <WeekStrip weeks={review.weeks} />
      <dl className="block-review-stats">
        <div><dt>Sessions</dt><dd>{review.completedSessions}/{review.plannedSessions}</dd></div>
        <div><dt>Working sets</dt><dd>{review.loggedSets === review.prescribedSets ? review.loggedSets : `${review.loggedSets}/${review.prescribedSets}`}</dd></div>
        <div><dt>{review.prExercises != null ? 'Exercises with PRs' : 'PR highlights'}</dt><dd>{records}</dd></div>
      </dl>
      {!!extra.length && <p className="block-review-notes">{extra.join(' · ')}</p>}
    </section>
    {!!highlights.length && <section className="block-review-highlights" aria-labelledby="block-highlights-title">
      <h2 className="eyebrow" id="block-highlights-title">{highlights.length === 1 ? 'TOP RESULT' : 'TOP RESULTS'}</h2>
      <ol ref={highlightsRef}>{highlights.map(item => <Highlight key={item.exerciseId} item={item} format={format} />)}</ol>
    </section>}
    {review.sessionFeedback && <p className="sheet-footnote session-feedback-block">{review.sessionFeedback.text}</p>}
    <button className="list-row block-review-outcomes-row" onClick={onOutcomes}>
      <span><strong>All exercise results</strong><small>{plural(review.rows.length, 'exercise')} · {review.progressed} progressed · {review.held} held{review.review ? ` · ${review.review} to review` : ''}</small></span><NavigationChevron />
    </button>
    <ReviewDetails title="How results are measured">
      <p>Each exercise compares its first and latest sessions with the same targets. Pairs show the lowest working set, so every set reached at least that.</p>
      <p>Records compare against all earlier sessions. Deload sessions stay in your history but are not used for progress or records.</p>
      {review.plannedRest && <p>Your rest week was planned recovery. Its sessions are not counted as skipped.</p>}
      {!!review.endedEarly && <p>{plural(review.endedEarly, 'session')} ended early. Only logged work is counted.</p>}
      {!!review.optionalCompleted && <p>Extra sessions are counted separately from planned sessions.</p>}
      {!!review.adjusted && <p>Sessions changed with Adjust Today count as logged work, not as comparable progress.</p>}
      {review.sessionFeedback && <p>Session difficulty reflects your feedback, not a recovery measurement.</p>}
    </ReviewDetails>
    {next}
  </>;
}

const groups = [['progressed', 'IMPROVED'], ['review', 'TO REVIEW'], ['held', 'HELD'], ['insufficient', 'NOT ENOUGH DATA']];
export function BlockOutcomes({ review, units }) {
  const format = useBlockFormat(units);
  const prs = new Set((review.prBests || []).map(best => best.exerciseId));
  return <>
    <p className="eyebrow">BLOCK RESULTS</p><h1>All exercises</h1>
    <p>Comparable sessions only. Held is a neutral result.</p>
    {groups.map(([status, title]) => {
      const rows = review.rows.filter(row => row.status === status);
      if (!rows.length) return null;
      return <section className="block-outcomes" key={status} aria-label={title}>
        <h2 className="eyebrow">{title} · {rows.length}</h2>
        {rows.map(row => {
          const change = improvementOf(row);
          return <article key={row.id}>
            <ExerciseArt exerciseId={row.exerciseId} />
            <div>
              <h3>{row.name}{prs.has(row.exerciseId) && <PersonalBestTrophy />}</h3>
              {change ? <p><ChangePair row={row} format={format} /></p>
                : row.currentWeight != null && <p className="block-pair"><span>{format.set(row.currentWeight, row.currentReps)}</span></p>}
              <small>{plural(row.comparableSessions, 'comparable session')}</small>
              <p className="block-outcome-reason">{row.reason}</p>
              {row.estimatedOneRepMax != null && <small>Estimated 1RM {displayEstimatedOneRepMax(row.estimatedOneRepMax, units)} {weightUnit(units)} · an estimate, not a tested max</small>}
            </div>
          </article>;
        })}
      </section>;
    })}
  </>;
}
