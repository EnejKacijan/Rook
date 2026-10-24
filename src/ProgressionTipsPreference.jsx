import {useState} from 'react';
import {SegmentedControl} from './SegmentedControl.jsx';
import {useDurableAction} from './useDurableAction.js';
import {progressionTipsEnabled, setProgressionTipsEnabled} from './progressionTipsPreference.js';
import './progressionTipsPreference.css';

export function ProgressionTipsPreference({state, update, information}) {
  const {commit} = useDurableAction(state, update);
  const [error, setError] = useState('');
  return <section className="profile-progression-tips" aria-label="Progression tips">
    <div className="profile-section-heading"><div className="eyebrow">PROGRESSION GUIDANCE</div>{information}</div>
    <SegmentedControl label="Progression guidance" options={[{value:'off',label:'Off'},{value:'basic',label:'Basic'}]}
      value={progressionTipsEnabled(state.profile) ? 'basic' : 'off'} onChange={mode => {
        setError('');
        try {commit(current => setProgressionTipsEnabled(current, mode !== 'off'));}
        catch {setError('Couldn’t save this preference. Try again.');}
      }}/>
    <p className="progression-guidance-help">{progressionTipsEnabled(state.profile) ? 'Next-step suggestions during workouts.' : 'Suggestions hidden. Your logs stay unchanged.'}</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
