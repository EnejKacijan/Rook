import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RookProPaywall } from '/src/RookProPaywall.jsx';
import { ModalLayer, SheetHeader } from '/src/App.jsx';
import '/src/styles.css';
import '/src/overrides.css';
import '/src/overlay.css';
import '/src/theme.css';
import '/src/navigationFocus.css';

// Separate Vite development entry. No billing client, profile writes, purchase,
// or production route; the safety label is never part of RookProPaywall.
if (!import.meta.env.DEV || location.port !== '4198') throw Error('Local review only');
const example = (identifier, amount, period, eligible = false) => ({ product: {
  identifier, normalPeriodDuration: period,
  price: { amountMicros: Math.round(amount * 1_000_000), currency: 'EUR', formattedPrice: `€${amount.toFixed(2)}` },
  defaultSubscriptionOption: { trial: eligible ? { periodDuration: 'P7D', price: null, cycleCount: 1 } : null, introPrice: null },
} });
function Review() {
  const background = useRef(null);
  const [eligible, setEligible] = useState(true), [theme, setTheme] = useState('light-standard'), [large, setLarge] = useState(false);
  useEffect(() => {
    const [appearance, style] = theme.split('-');
    document.documentElement.dataset.appearance = appearance;
    document.documentElement.dataset.style = style;
    document.documentElement.style.colorScheme = appearance;
    document.documentElement.style.fontSize = large ? '24px' : '16px';
  }, [theme, large]);
  const Header = ({ onClose }) => <>
    <SheetHeader title="ROOK Pro" onClose={onClose} closeLabel="Close ROOK Pro" />
    <div style={{ flexShrink: 0, marginBottom: 12, fontSize: 10, color: 'var(--rook-secondary)' }}>
      <div>Local review · Example prices · No payment</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        <select aria-label="Review theme" value={theme} onChange={e => setTheme(e.target.value)} style={{ maxWidth: 130, fontSize: 11 }}>
          {['light-standard', 'dark-standard', 'light-premium', 'dark-premium'].map(value => <option key={value}>{value}</option>)}
        </select>
        <label><input type="checkbox" aria-label="Trial eligible" checked={eligible} onChange={e => setEligible(e.target.checked)} /> Trial eligible</label>
        <label><input type="checkbox" aria-label="Large text" checked={large} onChange={e => setLarge(e.target.checked)} /> Large text</label>
        <select aria-label="Review section" defaultValue="top" style={{ maxWidth: 65, fontSize: 11 }} onChange={e => {
          const content = document.querySelector('.rook-pro-content');
          const target = e.target.value === 'plans' ? document.querySelector('.rook-pro-options') : document.querySelector('.rook-pro-legal');
          content.scrollTop = e.target.value === 'top' ? 0 : target.offsetTop - content.offsetTop - 8;
        }}><option value="top">Top</option><option value="plans">Plans</option><option value="legal">Legal</option></select>
      </div>
    </div>
  </>;
  return <ModalLayer close={() => {}} backgroundRef={background}>{close => <RookProPaywall context="generated_plan_apply"
    products={{ annual: example('local-example-annual', 39.99, 'P1Y', eligible), monthly: example('local-example-monthly', 5.99, 'P1M') }}
    Header={Header} close={close} purchase={async () => ({ status: 'unavailable' })}
    refresh={async () => ({ status: 'free' })}/>}</ModalLayer>;
}
createRoot(document.getElementById('root')).render(<Review />);
