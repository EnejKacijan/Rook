import {NavigationChevron} from './NavigationChevron.jsx';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { focusNavigationTarget } from './navigationFocus.js';
import './accountSync.css';

function AccountConfirmation({ Modal, title, description, cancelLabel, confirmLabel, busy, close, confirm, returnFocusRef, backgroundRef }) {
  return createPortal(<Modal close={close} returnFocusRef={returnFocusRef} backgroundRef={backgroundRef}>{requestClose =>
    <section className="screen detail-screen account-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="account-confirm-title">
      <header className="sheet-header-chrome"><button type="button" className="sheet-close" aria-label="Close" disabled={busy} onClick={requestClose}>×</button></header>
      <h1 id="account-confirm-title">{title}</h1>
      <p>{description}</p>
      <div className="account-confirm-actions">
        <button type="button" className="button secondary" data-sheet-initial-focus disabled={busy} onClick={requestClose}>{cancelLabel}</button>
        <button type="button" className="button primary" disabled={busy} onClick={confirm}>{busy ? 'PLEASE WAIT…' : confirmLabel}</button>
      </div>
    </section>}</Modal>, document.body);
}

export function accountSyncStatus(sync) {
  switch (sync?.state) {
    case 'synced': return sync.pendingCount === 0 ? 'Synced' : 'Syncing…';
    case 'syncing': case 'connecting': case 'retry': return 'Syncing…';
    case 'offline': return sync.linked ? 'Sync needs attention · offline' : 'Offline · saved on this device';
    case 'auth-unavailable': return 'Account connection needs attention';
    case 'not-configured': return sync.category === 'rollout-off' ? 'Cloud backup is not available yet' : 'Cloud backup is not configured';
    case 'signed-out': return 'Signed out · data stays on this device';
    case 'waiting-for-training': return 'Ready when you start training';
    default: return 'Sync needs attention';
  }
}

export function AccountSyncPanel({ sync, Modal, backgroundRef }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [collision, setCollision] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const confirmTrigger = useRef(null);
  const savedTrigger = useRef(null);
  const panelRef = useRef(null);
  const act = async action => {
    if (busy) return;
    setBusy(true); setError(''); setCollision(false);
    try {
      const result = await action();
      if (result?.status === 'existing-account-conflict') setCollision(true);
      else setConfirmation(null);
    } catch (failure) {
      setError(failure?.code === 'auth/operation-not-allowed'
        ? 'Google sign-in needs to be enabled for ROOK before this can work.'
        : failure?.code === 'auth/popup-closed-by-user'
          ? ''
          : failure?.message || 'Account action could not be completed. Your local data is unchanged.');
    } finally { setBusy(false); }
  };
  return <section ref={panelRef} className="account-sync-panel" aria-label="Account and sync">
    <p className="eyebrow">ACCOUNT &amp; SYNC</p>
    <p className="account-sync-identity">{sync?.linked && sync?.email ? sync.email : sync?.state === 'synced' && sync.pendingCount === 0 ? 'Cloud copy for this device' : 'Your ROOK training data'}</p>
    <p className="account-sync-status" role="status">{accountSyncStatus(sync)}</p>
    {sync?.state === 'synced' && sync.lastSuccessAt && <small>Last synced {new Date(sync.lastSuccessAt).toLocaleString()}</small>}
    {sync?.state === 'not-configured' && <small>{sync.category === 'rollout-off' ? 'Cloud backup is not enabled in this build. Keep a ROOK backup file.' : 'Keep a ROOK backup file until cloud setup is complete.'}</small>}
    {sync?.state === 'needs-attention' && <small>Your saved data on this device is unchanged. Keep a ROOK backup file while this is reviewed.</small>}
    {sync?.linked && sync?.state === 'synced' && sync.pendingCount === 0 && <small>Google account connected. Your ROOK training data is backed up.</small>}
    {sync?.linked && sync?.state !== 'synced' && <small>Google account connected. Cloud backup still needs to finish; your data stays on this device.</small>}
    {sync?.state === 'synced' && <small>Workout photos stay on this device; cloud sync does not include them.</small>}
    {sync?.state !== 'not-configured' && !sync?.linked && !collision && <button type="button" className="list-row" disabled={busy || !sync?.canSecure} onClick={() => act(sync.secureWithGoogle)}><span><strong>Create account with Google</strong><small>Link this profile to Google so you can restore it on another device. Your training data stays here.</small></span><NavigationChevron/></button>}
    {collision && <div className="account-sync-collision" role="status">
      <p>This Google account already has a ROOK profile. Your current training data is unchanged; ROOK will not merge the profiles automatically.</p>
      <button type="button" className="button secondary" disabled={busy} onClick={() => { setCollision(false); setError(''); }}>KEEP THIS PROFILE</button>
      <button type="button" className="button quiet" disabled={busy || !sync?.canSecure} onClick={() => act(sync.secureWithGoogle)}>TRY A DIFFERENT GOOGLE ACCOUNT</button>
    </div>}
    {sync?.linked && !sync?.locked && <button type="button" className="list-row" ref={confirmTrigger} disabled={busy} onClick={() => setConfirmation('sign-out')}><span><strong>Sign out</strong><small>Your local data stays on this device</small></span><NavigationChevron/></button>}
    {sync?.separate && <button type="button" className="list-row" ref={savedTrigger} disabled={busy} onClick={() => setConfirmation('saved-profile')}><span><strong>Return to saved profile</strong><small>Sign in with its Google account to reopen it</small></span><NavigationChevron/></button>}
    {error && <p className="account-sync-error" role="alert">{error}</p>}
    {confirmation && <AccountConfirmation Modal={Modal}
      title={confirmation === 'sign-out' ? 'Sign out?' : 'Return to saved profile?'}
      description={confirmation === 'sign-out'
        ? 'Your ROOK data will stay on this device. This profile will remain protected until you sign back in.'
        : 'This separate profile will stay saved. The original profile will remain protected until you sign in with its Google account.'}
      cancelLabel="CANCEL" confirmLabel={confirmation === 'sign-out' ? 'SIGN OUT' : 'CONTINUE'} busy={busy}
      close={() => setConfirmation(null)} confirm={() => act(confirmation === 'sign-out' ? sync.signOutAccount : sync.switchToSavedProfile)} returnFocusRef={confirmation === 'sign-out' ? confirmTrigger : savedTrigger} backgroundRef={backgroundRef || panelRef}/>}
  </section>;
}

export function AccountSyncLock({ sync, Modal }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [step, setStep] = useState(null);
  const pending = useRef(false);
  const separateTrigger = useRef(null);
  const lockRef = useRef(null);
  const dialogRef = useRef(null);
  useLayoutEffect(() => {
    if (step) focusNavigationTarget(dialogRef.current?.querySelector('[data-sheet-initial-focus]'));
    const dialog = dialogRef.current;
    const guard = event => { if (pending.current) event.preventDefault(); };
    dialog?.addEventListener('rook:before-sheet-close', guard);
    return () => dialog?.removeEventListener('rook:before-sheet-close', guard);
  }, [step]);
  const act = async action => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (failure) { setError(failure?.code === 'auth/popup-closed-by-user' ? '' : failure?.message || 'Could not open this profile. Your saved data is unchanged.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const closeChoice = () => { if (!pending.current) { setStep(null); setError(''); } };
  const backToChoice = () => { if (!pending.current) { setStep('choice'); setError(''); } };
  return <main ref={lockRef} className="screen account-sync-lock">
    <p className="eyebrow">ROOK ACCOUNT</p>
    <h1>This device has saved training data</h1>
    <p>Sign in with the Google account that owns this ROOK profile. Your data is still here.</p>
    <button type="button" className="button primary" disabled={busy} onClick={() => act(sync.signInToThisDevice)}>{busy && !step ? 'VERIFYING…' : 'CONTINUE WITH GOOGLE'}</button>
    <button type="button" className="account-sync-secondary" ref={separateTrigger} disabled={busy} onClick={() => { setError(''); setStep('choice'); }}>Use another ROOK profile</button>
    {error && !step && <p role="alert">{error}</p>}
    {step && createPortal(<Modal close={closeChoice} returnFocusRef={separateTrigger} backgroundRef={lockRef}>{requestClose =>
      <section ref={dialogRef} className="screen detail-screen account-confirm-sheet account-profile-choice" role="dialog" aria-modal="true" aria-labelledby="account-profile-choice-title" aria-busy={busy}>
        <header className="detail-header">
          {step === 'local' ? <button type="button" className="detail-header-back" aria-label="Back to profile choices" disabled={busy} onClick={backToChoice}>‹</button> : <span/>}
          <button type="button" className="detail-header-close" aria-label="Close profile choices" disabled={busy} onClick={requestClose}>×</button>
        </header>
        <h1 id="account-profile-choice-title">{step === 'local' ? 'Start a separate ROOK profile?' : 'Use another ROOK profile'}</h1>
        {step === 'local' ? <>
          <p>Your saved profile will stay protected on this device. You can sign back into it anytime.</p>
          <div className="account-confirm-actions">
            <button type="button" className="button secondary" data-sheet-initial-focus disabled={busy} onClick={backToChoice}>GO BACK</button>
            <button type="button" className="button primary" disabled={busy} onClick={() => act(sync.useSeparateProfile)}>{busy ? 'PLEASE WAIT…' : 'CONTINUE'}</button>
          </div>
        </> : <div className="account-profile-options">
          <button type="button" className="button primary" data-sheet-initial-focus disabled={busy} onClick={() => act(sync.signInWithAnotherAccount)}>{busy ? 'VERIFYING…' : 'SIGN IN WITH ANOTHER ACCOUNT'}</button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => { setError(''); setStep('local'); }}>START WITHOUT AN ACCOUNT</button>
          <button type="button" className="button quiet" disabled={busy} onClick={requestClose}>CANCEL</button>
        </div>}
        {error && <p className="account-sync-error" role="alert">{error}</p>}
      </section>}</Modal>, document.body)}
  </main>;
}
