import {useState} from 'react';
import {Disclosure} from './Disclosure.jsx';
import {useDurableAction} from './useDurableAction.js';
import {hideTemporaryScheduleSummary,temporaryScheduleSummaryHidden} from './temporarySchedulePresentation.js';

export function TemporaryScheduleSummary({state,review,update,onView}) {
  const {commit}=useDurableAction(state,update);
  const [error,setError]=useState('');
  if(!review.items.length)return null;
  const unresolved=review.unresolved.length,skipped=review.items.filter(item=>item.skipped).length;
  const hide=()=>{
    setError('');
    try{commit(hideTemporaryScheduleSummary);}
    catch{setError('Couldn’t save this preference. The summary is still visible. Try again.');}
  };
  return <Disclosure className="temporary-schedule-disclosure" open={!temporaryScheduleSummaryHidden(state,review)}>
    <aside className={`flexible-week-missed temporary-schedule-summary${unresolved?' needs-attention':' is-informational'}`} aria-label={unresolved?'Schedule needs attention':'Temporary schedule summary'}>
      {unresolved ? <>
        <span className="eyebrow temporary-schedule-label">SCHEDULE NEEDS ATTENTION</span>
        <strong>{unresolved} {unresolved===1?'workout still needs':'workouts still need'} a date</strong>
        <button type="button" className="text-button" onClick={onView}>REVIEW SCHEDULE</button>
      </> : <>
        <span className="eyebrow temporary-schedule-label">TEMPORARY SCHEDULE</span>
        <small>{[review.moved.length && `${review.moved.length} ${review.moved.length===1?'workout':'workouts'} moved`,skipped && `${skipped} skipped`].filter(Boolean).join(' · ') || 'Schedule adjusted'}</small>
        <div className="temporary-schedule-actions">
          <button type="button" className="text-button" onClick={onView}>View schedule</button>
          <button type="button" className="text-button" aria-label="Hide temporary schedule summary" onClick={hide}>Hide</button>
        </div>
        {error && <small role="alert">{error}</small>}
      </>}
    </aside>
  </Disclosure>;
}
