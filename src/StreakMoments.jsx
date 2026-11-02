import {useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import './streakMoments.css';

// One flame for both moments: an ember when the week is still open, a lit
// flame when a new week counts. Decorative; the text carries the meaning.
export function StreakFlame({lit=false,igniting=false}) {
  const gradient=useId().replace(/:/g,'');
  return <span className={`streak-flame${lit?' is-lit':' is-ember'}${igniting?' is-igniting':''}`} aria-hidden="true">
    <span className="streak-flame-glow"/>
    <svg viewBox="0 0 96 120" focusable="false">
      <defs>
        <linearGradient id={`${gradient}-outer`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--streak-flame-base)"/><stop offset="1" stopColor="var(--streak-flame-tip)"/>
        </linearGradient>
      </defs>
      <path className="streak-flame-outer" fill={`url(#${gradient}-outer)`}
        d="M48 4c6 18 26 30 30 54 4 26-12 54-30 58C30 112 14 92 16 66c1-14 8-22 14-30 2 10 6 16 12 18-2-18 0-34 6-50z"/>
      <path className="streak-flame-inner" fill="var(--streak-flame-core)"
        d="M48 52c4 10 16 18 16 34 0 14-8 24-16 26-8-2-16-12-16-26 0-8 4-14 8-18 1 6 4 9 8 10-2-10-2-18 0-26z"/>
    </svg>
  </span>;
}

function MomentSheet({Modal,close,returnFocusRef,className,children,labelledBy}) {
  return createPortal(<Modal close={close} returnFocusRef={returnFocusRef}>{requestClose=>
    <section className={`screen detail-screen streak-moment-sheet ${className}`} data-sheet-motion="information"
      role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <header className="sheet-header-chrome"><button type="button" className="sheet-close" aria-label="Close" onClick={requestClose}>×</button></header>
      {children(requestClose)}
    </section>
  }</Modal>,document.body);
}

// Weekend: shown once per profile and week, on Today only. Copy states the
// rule plainly and leaves room to rest; no countdown, no red alarm.
// onClose(muted): muting is applied after the sheet has closed, so the sheet
// is never re-parented while its exit runs.
export function StreakAtRiskMoment({Modal,reminder,best,onClose}) {
  const titleId=useId(),muted=useRef(false);
  return <MomentSheet Modal={Modal} close={()=>onClose(muted.current)} className="is-at-risk" labelledBy={titleId}>{requestClose=><>
    <div className="streak-moment-body">
      <StreakFlame/>
      <p className="streak-moment-eyebrow">Weekly streak</p>
      <h1 id={titleId}>Keep your <span className="streak-moment-nowrap">{reminder.current}-week</span> streak alive</h1>
      <p className="streak-moment-lead">{reminder.lastDay?'Today is the last day of this week.':'This week stays open until Sunday.'} One finished workout keeps it going. A short one counts.</p>
      <p className="streak-moment-note">Need rest because you’re sore or unwell? That’s fine. {best>1?`Your best of ${best} weeks stays saved.`:'You can start again next week.'}</p>
    </div>
    <div className="streak-moment-actions">
      <button type="button" className="button primary" data-sheet-initial-focus onClick={requestClose}>GOT IT</button>
      <button type="button" className="text-button" onClick={()=>{muted.current=true;requestClose();}}>Don’t remind me this week</button>
    </div>
  </>}</MomentSheet>;
}

// First counted workout of a week: the flame lights once, the number rolls.
export function StreakGainMoment({Modal,gain,onClose}) {
  const titleId=useId(),started=gain.previous===0;
  return <MomentSheet Modal={Modal} close={onClose} className="is-gain" labelledBy={titleId}>{requestClose=><>
    <div className="streak-moment-body">
      <StreakFlame lit igniting/>
      <p className="streak-moment-eyebrow">{started?'Streak started':'+1 week'}</p>
      <h1 id={titleId} className="streak-moment-count"><span className="streak-moment-number">{gain.current}</span> {gain.current===1?'week':'weeks'}</h1>
      <p className="streak-moment-lead">{started?'This week counts. One workout next week keeps the fire going.':`${gain.current} weeks in a row. One workout next week keeps it going.`}</p>
    </div>
    <div className="streak-moment-actions">
      <button type="button" className="button primary" data-sheet-initial-focus onClick={requestClose}>KEEP GOING</button>
    </div>
  </>}</MomentSheet>;
}
