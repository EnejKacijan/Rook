// Dev-only demo for "Your year in Rook". Open /year-review-demo.html on the
// Vite dev server. It runs on in-memory demo data viewed on Jan 2, 2027 and
// never reads or writes the app's saved training state.
import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ModalLayer } from './App.jsx';
import { YearInReview, YearReviewTodayCard, YearReviewProgressEntry } from './YearInReview.jsx';
import { YEAR_REVIEW_DEMO_CASES, YEAR_REVIEW_DEMO_TODAY, yearReviewDemoState } from './yearReviewDemoData.js';
import './styles.css';
import './overrides.css';
import './overlay.css';
import './theme.css';
import './uiReadability.css';
import './yearReviewDemo.css';

const THEME_KEY = 'rook.year-review-demo.theme', DISMISS_KEY = 'rook.year-review.dismissed.v1';
const params = new URLSearchParams(location.search);

function resetDismissals() {
  // Only the demo profile's dismissals; real profiles keep theirs.
  try {
    const list = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
    localStorage.setItem(DISMISS_KEY, JSON.stringify(list.filter(item => !String(item).startsWith('year-review-demo'))));
  } catch { /* Storage may be unavailable. */ }
}

function Demo() {
  const [caseId, setCaseId] = useState(YEAR_REVIEW_DEMO_CASES.some(item => item.id === params.get('case')) ? params.get('case') : 'rich');
  const [revision, setRevision] = useState(0);
  const state = useMemo(() => yearReviewDemoState(caseId), [caseId, revision]);
  const [openYear, setOpenYear] = useState(params.has('open') ? Number(params.get('open')) || 2026 : null);
  const [appearance, setAppearance] = useState(document.documentElement.dataset.appearance);
  const background = useRef(null);
  const theme = next => {
    const root = document.documentElement;
    root.dataset.appearance = next; root.dataset.theme = next; root.style.colorScheme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Session only. */ }
    setAppearance(next);
  };
  const reset = () => { resetDismissals(); setOpenYear(null); setRevision(value => value + 1); };
  return <div className="app-shell">
    <div className="app-content" ref={background}>
      <main className="screen year-demo">
        <p className="eyebrow">DEMO · VIEWED ON JAN 2, 2027</p>
        <h1>Your year in Rook</h1>
        <p>Isolated demo data. Nothing here changes your saved training.</p>
        <fieldset className="year-demo-cases">
          <legend className="eyebrow">CASE</legend>
          {YEAR_REVIEW_DEMO_CASES.map(item => <label key={item.id} className={caseId === item.id ? 'is-selected' : undefined}>
            <input type="radio" name="case" value={item.id} checked={caseId === item.id} onChange={() => { setCaseId(item.id); setOpenYear(null); }} />
            <span><strong>{item.label}</strong><small>{item.detail}</small></span>
          </label>)}
        </fieldset>
        <div className="year-demo-tools">
          <button type="button" className="button secondary compact" onClick={() => theme(appearance === 'dark' ? 'light' : 'dark')}>{appearance === 'dark' ? 'LIGHT' : 'DARK'} THEME</button>
          <button type="button" className="button secondary compact" onClick={reset}>RESET DEMO</button>
        </div>
        <p className="eyebrow year-demo-label">TODAY</p>
        <div key={`today-${caseId}-${revision}`}>
          <YearReviewTodayCard state={state} open={setOpenYear} today={YEAR_REVIEW_DEMO_TODAY} />
        </div>
        <p className="eyebrow year-demo-label">PROGRESS</p>
        <YearReviewProgressEntry state={state} open={setOpenYear} today={YEAR_REVIEW_DEMO_TODAY} />
      </main>
    </div>
    {openYear && <ModalLayer key={`${caseId}-${revision}`} presentation="editor-page" close={() => setOpenYear(null)} backgroundRef={background}>
      <YearInReview state={state} initialYear={openYear} today={YEAR_REVIEW_DEMO_TODAY} />
    </ModalLayer>}
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><Demo /></React.StrictMode>);
