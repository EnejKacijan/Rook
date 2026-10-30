import {useId,useLayoutEffect,useRef,useState} from 'react';
import {focusNavigationTarget} from './navigationFocus.js';
import {SegmentedControl} from './SegmentedControl.jsx';
import {useDurableAction} from './useDurableAction.js';
import {progressionTipsEnabled, setProgressionTipsEnabled} from './progressionTipsPreference.js';
import './progressionTipsPreference.css';

export function ProgressionTipsPreference({state, update, information, showHeading=true, helpText}) {
  const {commit} = useDurableAction(state, update);
  const [error, setError] = useState('');
  return <section className="profile-progression-tips" aria-label="Progression tips">
    {showHeading&&<div className="profile-section-heading"><div className="eyebrow">PROGRESSION GUIDANCE</div>{information}</div>}
    <SegmentedControl label="Progression guidance" options={[{value:'off',label:'Off'},{value:'basic',label:'Basic'}]}
      value={progressionTipsEnabled(state.profile) ? 'basic' : 'off'} onChange={mode => {
        setError('');
        if(progressionTipsEnabled(state.profile)===(mode!=='off'))return;
        try {commit(current => setProgressionTipsEnabled(current, mode !== 'off'));}
        catch {setError('Couldn’t save this preference. Try again.');}
      }}/>
    <p className="progression-guidance-help">{helpText || (progressionTipsEnabled(state.profile) ? 'Next-step suggestions during workouts.' : 'Suggestions hidden. Your logs stay unchanged.')}</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}

// Both logger entries use the same persisted preference as Profile. Keeping
// this sheet over the mounted logger preserves raw inputs and the rest timer.
export function ProgressionGuidanceSettings({state,update,owner,Sheet,close}) {
  const titleId=useId(),heading=useRef(null);
  useLayoutEffect(()=>{focusNavigationTarget(heading.current);},[]);
  const valid=state.profile.id===owner.profileId && state.activeWorkout?.id===owner.sessionId;
  return <Sheet className="progression-guidance-settings" titleId={titleId} close={close}>
    <h2 ref={heading} tabIndex={-1} id={titleId}>Progression guidance</h2>
    {valid?<>
      <p>Applies to this workout and all future workouts.</p>
      <ProgressionTipsPreference state={state} update={update} showHeading={false} helpText="Basic shows next-step tips; Off hides them. Logs and Progress recommendations stay unchanged."/>
      <p className="progression-settings-location">Saved in Profile → Workout preferences.</p>
    </>:<p role="alert">This workout has changed. Close settings and reopen them from the current workout.</p>}
    <button type="button" className="button secondary progression-settings-return" onClick={close}>Back to workout</button>
  </Sheet>;
}
