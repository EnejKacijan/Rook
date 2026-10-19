import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './accountSync.css';

function AccountConfirmation({ Modal, title, description, cancelLabel, confirmLabel, busy, close, confirm, returnFocusRef, backgroundRef }) {
  return createPortal(<Modal close={close} returnFocusRef={returnFocusRef} backgroundRef={backgroundRef}>{requestClose =>
    <section className="screen detail-screen account-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="account-confirm-title">
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
    case 'offline': case 'auth-unavailable': return 'Offline · saved on this device';
    case 'not-configured': return 'Cloud backup is not configured';
    case 'signed-out': return 'Signed out · data stays on this device';
    case 'waiting-for-training': return 'Ready when you start training';
    default: return 'Sync needs attention';
  }
}

export function AccountSyncPanel({ sync, Modal, backgroundRef }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const confirmTrigger = useRef(null);
  const savedTrigger = useRef(null);
  const panelRef = useRef(null);
  const act = async action => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await action();
      if (result?.status === 'existing-account-conflict') setError('That Google account already has ROOK data. Your current workout data is unchanged.');
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
    <p className="account-sync-identity">{sync?.linked && sync?.email ? sync.email : sync?.state === 'synced' && sync.pendingCount === 0 ? "Backed up on this device's account" : 'Your ROOK training data'}</p>
    <p className="account-sync-status" role="status">{accountSyncStatus(sync)}</p>
    {sync?.state === 'synced' && sync.lastSuccessAt && <small>Last synced {new Date(sync.lastSuccessAt).toLocaleString()}</small>}
    {sync?.state === 'not-configured' && <small>Keep a ROOK backup file until cloud setup is complete.</small>}
    {sync?.state === 'needs-attention' && <small>Your saved data on this device is unchanged. Keep a ROOK backup file while this is reviewed.</small>}
    {sync?.state !== 'not-configured' && !sync?.linked && <button type="button" className="list-row" disabled={busy || sync?.state !== 'synced'} onClick={() => act(sync.secureWithGoogle)}><span><strong>Secure your account with Google</strong><small>Connect Google to restore your training data on another device or after reinstalling ROOK</small></span><span aria-hidden="true">›</span></button>}
    {sync?.linked && !sync?.locked && <button type="button" className="list-row" ref={confirmTrigger} disabled={busy} onClick={() => setConfirmation('sign-out')}><span><strong>Sign out</strong><small>Your local data stays on this device</small></span><span aria-hidden="true">›</span></button>}
    {sync?.separate && <button type="button" className="list-row" ref={savedTrigger} disabled={busy} onClick={() => setConfirmation('saved-profile')}><span><strong>Return to saved profile</strong><small>Sign in with its Google account to reopen it</small></span><span aria-hidden="true">›</span></button>}
    {error && <p className="account-sync-error" role="alert">{error}</p>}
    {confirmation && <AccountConfirmation Modal={Modal}
      title={confirmation === 'sign-out' ? 'Sign out?' : 'Return to saved profile?'}
      description={confirmation === 'sign-out'
        ? 'Your training data will stay on this device, but this profile will be protected until you sign back in with its account.'
        : 'This separate profile will stay saved. The original profile will remain protected until you sign in with its Google account.'}
      cancelLabel="CANCEL" confirmLabel={confirmation === 'sign-out' ? 'SIGN OUT' : 'CONTINUE'} busy={busy}
      close={() => setConfirmation(null)} confirm={() => act(confirmation === 'sign-out' ? sync.signOutAccount : sync.switchToSavedProfile)} returnFocusRef={confirmation === 'sign-out' ? confirmTrigger : savedTrigger} backgroundRef={backgroundRef || panelRef}/>}
  </section>;
}

export function AccountSyncLock({ sync, Modal }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmSeparate, setConfirmSeparate] = useState(false);
  const separateTrigger = useRef(null);
  const lockRef = useRef(null);
  return <main ref={lockRef} className="screen account-sync-lock">
    <p className="eyebrow">ROOK ACCOUNT</p>
    <h1>This device has saved training data</h1>
    <p>Sign in with the Google account that owns this ROOK profile. Your data has not been deleted.</p>
    <button type="button" className="button primary" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await sync.signInToThisDevice(); }
      catch (failure) { setError(failure?.message || 'Could not verify this account. Your local data is unchanged.'); }
      finally { setBusy(false); }
    }}>{busy ? 'VERIFYING…' : 'CONTINUE WITH GOOGLE'}</button>
    <button type="button" className="account-sync-secondary" ref={separateTrigger} disabled={busy} onClick={() => setConfirmSeparate(true)}>Use ROOK without signing in</button>
    <small>Your saved profile will stay protected.</small>
    {error && <p role="alert">{error}</p>}
    {confirmSeparate && <AccountConfirmation Modal={Modal} title="Use a separate profile?"
      description="Your saved profile will stay protected on this device. You'll start a separate ROOK profile and can sign back in to reopen the original one."
      cancelLabel="GO BACK" confirmLabel="CONTINUE" busy={busy} returnFocusRef={separateTrigger} backgroundRef={lockRef}
      close={() => setConfirmSeparate(false)} confirm={async () => {
        setBusy(true); setError('');
        try { await sync.useSeparateProfile(); setConfirmSeparate(false); }
        catch (failure) { setError(failure?.message || 'Could not open a separate profile. Your saved data is unchanged.'); }
        finally { setBusy(false); }
      }}/>}
  </main>;
}
