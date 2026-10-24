import {NavigationChevron} from './NavigationChevron.jsx';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { focusNavigationTarget } from './navigationFocus.js';
import './accountSync.css';
import { AccountAccessOptions } from './AccountAccessOptions.jsx';
import {emailAccountError} from './emailAccountAuth.js';
import {AddAccountPassword} from './AddAccountPassword.jsx';

function EmailVerification({sync}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const pending=useRef(false);
  const run=async check=>{if(pending.current)return;pending.current=true;setBusy(true);setMessage('');try{
    if(check){const result=await sync.refreshEmailVerification();setMessage(result.verified?'Email verified.':'Email is not verified yet. Open the link in your inbox, then check again.');}
    else{await sync.verifyEmail();setMessage('Verification email sent. Check your inbox and spam folder.');}
  }catch(error){setMessage(emailAccountError(error));}finally{pending.current=false;setBusy(false);}};
  if(!sync.linked||(!sync.hasPassword&&sync.providerName!=='Email')||sync.emailVerified)return null;
  return <div className="account-email-verification" aria-busy={busy}><p>Verify your email to use Coach and photo review. Your local training is available.</p>
    <button type="button" className="button quiet" disabled={busy} onClick={()=>run(false)}>SEND VERIFICATION EMAIL</button>
    <button type="button" className="button quiet" disabled={busy} onClick={()=>run(true)}>I’VE VERIFIED MY EMAIL</button>
    {message&&<p role="status">{message}</p>}</div>;
}

function AccountConfirmation({ Modal, title, description, cancelLabel, confirmLabel, busy, close, confirm, returnFocusRef, backgroundRef }) {
  const dialog = useRef(null);
  useLayoutEffect(() => {
    const guard = event => {if (busy) event.preventDefault();};
    dialog.current?.addEventListener('rook:before-sheet-close', guard);
    return () => dialog.current?.removeEventListener('rook:before-sheet-close', guard);
  }, [busy]);
  return createPortal(<Modal close={close} returnFocusRef={returnFocusRef} backgroundRef={backgroundRef}>{requestClose =>
    <section ref={dialog} className="screen detail-screen account-confirm-sheet" role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby="account-confirm-title">
      <header className="sheet-header-chrome"><button type="button" className="sheet-close" aria-label="Close" disabled={busy} onClick={requestClose}>×</button></header>
      <h1 id="account-confirm-title">{title}</h1>
      <p>{description}</p>
      <div className="account-confirm-actions">
        <button type="button" className="button secondary" data-sheet-initial-focus disabled={busy} onClick={requestClose}>{cancelLabel}</button>
        <button type="button" className="button primary" disabled={busy} onClick={confirm}>{busy ? 'PLEASE WAIT…' : confirmLabel}</button>
      </div>
    </section>}</Modal>, document.body);
}

function AccountSyncInformation({sync, Modal, close, returnFocusRef, backgroundRef}) {
  const titleId = useId();
  const current = sync?.state === 'synced' && sync.pendingCount === 0;
  const lastSync = sync?.lastSuccessAt ? new Date(sync.lastSuccessAt) : null;
  return createPortal(<Modal close={close} returnFocusRef={returnFocusRef} backgroundRef={backgroundRef}>{requestClose =>
    <section className="screen detail-screen account-confirm-sheet account-sync-information" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="sheet-header-chrome"><button type="button" className="sheet-close" aria-label="Close sync information" data-sheet-initial-focus onClick={requestClose}>×</button></header>
      <h1 id={titleId}>Sync information</h1>
      <p>{sync?.linked ? `${sync.providerName || 'Google'} account connected.${current ? ' Your ROOK training data is backed up.' : ''}` : 'Your training is saved on this device.'}</p>
      <p className="account-info-last-sync">Last successful sync: {lastSync && Number.isFinite(lastSync.getTime()) ? lastSync.toLocaleString() : 'Time unavailable'}</p>
      <p>Workout photos stay on this device; cloud sync does not include them.</p>
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

export function AccountSyncPanel({ sync, displayName, Modal, backgroundRef }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [collision, setCollision] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const infoTrigger = useRef(null);
  const [addingPassword,setAddingPassword]=useState(false),[passwordAdded,setPasswordAdded]=useState(false);
  const passwordTrigger=useRef(null);
  const confirmTrigger = useRef(null);
  const savedTrigger = useRef(null);
  const panelRef = useRef(null);
  const pending = useRef(false);
  const act = async (action,propagate=false) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setCollision(false);
    try {
      const result = await action();
      if (result?.status === 'existing-account-conflict') setCollision(true);
      else setConfirmation(null);
    } catch (failure) {
      if(propagate)throw failure;
      setError(failure?.code === 'auth/operation-not-allowed'
        ? 'This sign-in method needs to be enabled for ROOK before this can work.'
        : failure?.code === 'auth/popup-closed-by-user'
          ? ''
          : failure?.message || 'Account action could not be completed. Your local data is unchanged.');
    } finally { pending.current = false; setBusy(false); }
  };
  return <section ref={panelRef} className="account-sync-panel" aria-label="Account and sync" aria-busy={busy}>
    <div className="account-sync-summary">
    {typeof displayName === 'string' && displayName.trim() && <p className="account-sync-name">{displayName.trim()}</p>}
    <p className="account-sync-identity">{sync?.linked && sync?.email ? sync.email : sync?.state === 'synced' && sync.pendingCount === 0 ? 'Cloud copy for this device' : 'Your ROOK training data'}</p>
    <div className="account-sync-status-line">
      <p className="account-sync-status" role="status">{accountSyncStatus(sync)}</p>
      <button type="button" className="account-sync-info-trigger" ref={infoTrigger} aria-label="Sync information" aria-haspopup="dialog" aria-expanded={showInfo} onClick={()=>setShowInfo(true)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="8.5"/><path d="M12 10.5v6M12 7.2v.5" strokeLinecap="round"/></svg>
      </button>
    </div>
    {sync?.state === 'not-configured' && <small>{sync.category === 'rollout-off' ? 'Cloud backup is not enabled in this build. Keep a ROOK backup file.' : 'Keep a ROOK backup file until cloud setup is complete.'}</small>}
    {sync?.state === 'needs-attention' && <small>Your saved data on this device is unchanged. Keep a ROOK backup file while this is reviewed.</small>}
    {sync?.linked && !(sync?.state === 'synced' && sync.pendingCount === 0) && <small>Cloud backup still needs to finish; your data stays on this device.</small>}
    {!sync?.linked && sync?.state === 'synced' && <small>This cloud copy is not linked to Google or email. You cannot restore it by signing in until you link an account below.</small>}
    </div>
    <EmailVerification sync={sync||{}}/>
    {sync?.canAddPassword && !addingPassword && <button type="button" className="list-row account-add-password-entry" ref={passwordTrigger} disabled={busy}
      onClick={()=>{setAddingPassword(true);setPasswordAdded(false);setError('');}}><span><strong>Add password</strong><small>Also sign in with email</small></span><NavigationChevron/></button>}
    {sync?.canAddPassword && addingPassword && <AddAccountPassword key={sync.email} email={sync.email} busy={busy}
      onSubmit={async details=>{await act(()=>sync.addPassword(details),true);setAddingPassword(false);setPasswordAdded(true);}}
      onConfirm={()=>act(sync.confirmPasswordAccount,true)}
      onCancel={()=>{setAddingPassword(false);requestAnimationFrame(()=>passwordTrigger.current?.focus());}}/>}
    {passwordAdded&&<p className="account-password-added" role="status">You can now sign in with Google or email.</p>}
    {sync?.state !== 'not-configured' && !sync?.linked && !collision && !sync?.providers?.some(id=>id!=='google.com') && <button type="button" className="list-row" disabled={busy || !sync?.canSecure} onClick={() => act(sync.secureWithGoogle)}><span><strong>Create account with Google</strong><small>Link this profile to Google so you can restore it on another device. Your training data stays here.</small></span><NavigationChevron/></button>}
    {sync?.state !== 'not-configured' && !sync?.linked && !collision && sync?.providers?.some(id=>id!=='google.com') && <>
      <AccountAccessOptions providers={sync.providers} busy={busy} disabled={!sync?.canSecure} registrationOnly
        onEmail={sync.registerWithEmail?details=>act(()=>sync.registerWithEmail(details),true):undefined}
        onChoose={id=>act(id==='google.com'?sync.secureWithGoogle:()=>sync.secureWithProvider(id))}/>
      <small className="account-sync-link-hint">Link this profile to an account so you can restore it on another device. Your training data stays here.</small>
    </>}
    {collision && <div className="account-sync-collision" role="status">
      <p>This account already has a ROOK profile. Your current training data is unchanged; ROOK will not merge the profiles automatically.</p>
      <button type="button" className="button secondary" disabled={busy} onClick={() => { setCollision(false); setError(''); }}>KEEP THIS PROFILE</button>
      <button type="button" className="button quiet" disabled={busy || !sync?.canSecure} onClick={() => act(sync.secureWithGoogle)}>TRY A DIFFERENT GOOGLE ACCOUNT</button>
    </div>}
    {sync?.linked && !sync?.locked && <button type="button" className="list-row account-sync-sign-out" ref={confirmTrigger} disabled={busy} onClick={() => setConfirmation('sign-out')}><span><strong>Sign out</strong><small>Your local data stays on this device</small></span><NavigationChevron/></button>}
    {sync?.separate && <button type="button" className="list-row" ref={savedTrigger} disabled={busy} onClick={() => setConfirmation('saved-profile')}><span><strong>Return to saved profile</strong><small>Sign in with the account that owns it</small></span><NavigationChevron/></button>}
    {error && <p className="account-sync-error" role="alert">{error}</p>}
    {showInfo && <AccountSyncInformation sync={sync} Modal={Modal} close={()=>setShowInfo(false)} returnFocusRef={infoTrigger} backgroundRef={backgroundRef || panelRef}/>}
    {confirmation && <AccountConfirmation Modal={Modal}
      title={confirmation === 'sign-out' ? 'Sign out?' : 'Return to saved profile?'}
      description={confirmation === 'sign-out'
        ? 'Your ROOK data will stay on this device. This profile will remain protected until you sign back in.'
        : 'This separate profile will stay saved. The original profile will remain protected until you sign in with the account that owns it.'}
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
  const act = async (action,propagate=false) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (failure) { if(propagate)throw failure;setError(failure?.code === 'auth/popup-closed-by-user' ? '' : failure?.message || 'Could not open this profile. Your saved data is unchanged.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const closeChoice = () => { if (!pending.current) { setStep(null); setError(''); } };
  const backToChoice = () => { if (!pending.current) { setStep('choice'); setError(''); } };
  return <main ref={lockRef} className="screen account-sync-lock">
    <p className="eyebrow">ROOK ACCOUNT</p>
    <h1>This device has saved training data</h1>
    <p>Sign in with the account that owns this ROOK profile. Your data is still here.</p>
    <AccountAccessOptions providers={sync?.providers || ['google.com']} busy={busy} allowRegistration={false}
      onEmail={sync?.signInToThisDeviceWithEmail?details=>act(()=>sync.signInToThisDeviceWithEmail(details),true):undefined} onReset={sync?.resetPasswordWithEmail}
      onChoose={id=>act(()=>sync.signInToThisDevice(id))}/>
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
          {sync?.providers?.some(id=>id!=='google.com')
            ? <AccountAccessOptions providers={sync.providers} busy={busy} initialFocus allowRegistration={false}
                onEmail={sync.signInWithAnotherEmail?details=>act(()=>sync.signInWithAnotherEmail(details),true):undefined} onReset={sync.resetPasswordWithEmail}
                onChoose={id=>act(()=>sync.signInWithAnotherAccount(id))}/>
            : <button type="button" className="button primary" data-sheet-initial-focus disabled={busy} onClick={() => act(sync.signInWithAnotherAccount)}>{busy ? 'VERIFYING…' : 'SIGN IN WITH ANOTHER ACCOUNT'}</button>}
          <button type="button" className="button secondary" disabled={busy} onClick={() => { setError(''); setStep('local'); }}>START WITHOUT AN ACCOUNT</button>
          <button type="button" className="button quiet" disabled={busy} onClick={requestClose}>CANCEL</button>
        </div>}
        {error && <p className="account-sync-error" role="alert">{error}</p>}
      </section>}</Modal>, document.body)}
  </main>;
}
