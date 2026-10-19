import React, { useRef, useState } from 'react';
import { annualMonthlyEquivalent, annualSavingPercent, paywallSelection } from './proPaywallPresentation.js';
import './rookPro.css';

const contexts = {
  generated_plan_apply: ['YOUR TRAINING PLAN', 'A plan built around you', 'Keep your first personal plan. Build your next plans around new goals, schedules and equipment.'],
  premium_style: ['YOUR ROOK', 'Make ROOK feel like you', 'Choose Premium appearance and keep your training in focus.'],
  saved_workout_limit: ['YOUR SAVED WORKOUTS', 'Keep your go-to workouts', 'Save more reusable workouts. Your existing workouts always remain yours.'],
  coach_limit: ['YOUR COACH', 'Keep training with ROOK Coach', 'More conversations to help you make the most of your training.'],
};
const benefits = ['ROOK-built plans', 'More conversations with Coach', 'More saved workouts', 'Premium appearance'];

export function RookProPaywall({ context, products, managementUrl, close, purchase, refresh, Header }) {
  const [selected, setSelected] = useState('annual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [restoredActive, setRestoredActive] = useState(false);
  const operation = useRef(false);
  const ready = ['annual', 'monthly'].every(key => products?.[key]?.product?.price?.formattedPrice);
  const choice = paywallSelection(selected, products);
  const [eyebrow, title, description] = contexts[context] || contexts.generated_plan_apply;
  const saving = annualSavingPercent(products?.annual, products?.monthly);
  const equivalent = annualMonthlyEquivalent(products?.annual);
  const buy = async () => {
    if (operation.current || !ready) return;
    operation.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await purchase(products[selected]);
      if (result.status === 'pending') setNotice('Purchase pending. ROOK Pro will unlock after verification.');
      else if (result.status !== 'active') setError('Purchase could not be verified. Please try again.');
    } catch (failure) {
      // RevenueCat's ErrorCode.UserCancelledError is 1 in the Web SDK.
      if (failure?.errorCode !== 1) setError(failure?.code === 'offer-changed'
        ? 'Subscription options changed. Review the updated price and try again.'
        : 'Purchase could not be completed. Please try again.');
    } finally { operation.current = false; setBusy(false); }
  };
  const restore = async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await refresh();
      setRestoredActive(result?.status === 'active');
      setNotice(result?.status === 'active'
        ? 'ROOK Pro is active on this account. Close this sheet and retry your action.'
        : result?.status === 'free'
          ? 'No active ROOK Pro purchase was found for this account.'
          : 'Purchase status could not be verified. Try again.');
    } catch { setError('Purchase status could not be checked. Try again.'); }
    finally { operation.current = false; setBusy(false); }
  };
  return <main className="screen detail-screen rook-pro-paywall" role="dialog" aria-modal="true" aria-labelledby="rook-pro-title" aria-busy={busy}>
    <Header title="ROOK Pro" onClose={close} closeLabel="Close ROOK Pro" />
    <div className="rook-pro-content">
    <span className="eyebrow">{eyebrow}</span>
    <h1 id="rook-pro-title">{title}</h1>
    <p className="rook-pro-intro">{description}</p>
    <ul className="rook-pro-benefits">{benefits.map(benefit => <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>)}</ul>
    {restoredActive ? null : ready ? <div className="rook-pro-options" role="group" aria-label="Subscription plan">
      {['annual', 'monthly'].map(key => {
        const annual = key === 'annual';
        const plan = paywallSelection(key, products);
        const price = products[key].product.price.formattedPrice;
        return <button className={`rook-pro-plan${annual ? ' rook-pro-annual' : ''}`} key={key} type="button"
          disabled={busy} aria-pressed={selected === key} onClick={() => { setSelected(key); setError(''); setNotice(''); }}>
          <span className="rook-pro-plan-heading"><strong>{annual ? 'ANNUAL' : 'MONTHLY'}</strong>
            {annual && saving !== null && <span className="rook-pro-saving">SAVE {saving}%</span>}
            <span className="rook-pro-plan-radio" aria-hidden="true">{selected === key ? '●' : ''}</span>
          </span>
          <span className="rook-pro-price" aria-label={annual && equivalent ? `${equivalent} per month equivalent, billed yearly` : undefined}>
            <strong>{annual && equivalent ? equivalent : price}</strong><span> / {annual && !equivalent ? 'year' : 'month'}</span>
          </span>
          {annual && <span className="rook-pro-disclosure">{plan.disclosure}</span>}
          <span className="rook-pro-renewal">{plan.renewal}</span>
        </button>;
      })}
    </div> : <p role="status">Subscription options are temporarily unavailable.</p>}
    <div className="rook-pro-secondary">
      <button type="button" disabled={busy} onClick={restore}>Restore purchases</button>
      {managementUrl && <a href={managementUrl} target="_blank" rel="noopener noreferrer">Manage subscription</a>}
    </div>
    {notice && <p className="rook-pro-message" role="status">{notice}</p>}{error && <p className="rook-pro-message" role="alert">{error}</p>}
    <p className="rook-pro-legal"><a href={import.meta.env.VITE_ROOK_PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy</a><a href={import.meta.env.VITE_ROOK_TERMS_URL} target="_blank" rel="noopener noreferrer">Terms</a></p>
    </div>
    {ready && !restoredActive && <footer className="rook-pro-footer">
      <p className="rook-pro-summary" aria-live="polite" aria-atomic="true">{choice.summary}</p>
      <button className="button primary rook-pro-cta" type="button" disabled={busy} onClick={buy}>{busy ? 'VERIFYING…' : choice.cta}</button>
    </footer>}
  </main>;
}
