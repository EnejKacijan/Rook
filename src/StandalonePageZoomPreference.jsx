import { useState, useSyncExternalStore } from 'react';
import { setStandalonePageZoomAllowed, standalonePageZoomMode, subscribeStandalonePageZoom } from './standalonePageZoom.js';

export function StandalonePageZoomPreference({ Switch }) {
  const mode = useSyncExternalStore(subscribeStandalonePageZoom, standalonePageZoomMode, () => 'browser');
  const [error, setError] = useState('');
  if (mode === 'browser') return null;
  return <section className="standalone-zoom-preference">
    <div className="eyebrow">ACCESSIBILITY</div>
    <Switch label="Allow app zoom" help="Pinch to enlarge text and the whole app. This setting applies on this device."
      checked={mode === 'allowed'} onChange={allowed => {
        try { setStandalonePageZoomAllowed(allowed); setError(''); }
        catch { setError('Couldn’t save this preference. Please try again.'); }
      }} />
    {error && <p role="status">{error}</p>}
  </section>;
}
