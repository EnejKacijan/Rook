import {ExerciseNavigationButton} from './ExerciseNavigationButton.jsx';
import {NavigationChevron} from './NavigationChevron.jsx';

export function profileInitials(name) {
  const words = typeof name === 'string' ? name.trim().split(/\s+/).filter(Boolean) : [];
  const letter = word => Array.from(word).find(character => /\p{L}|\p{N}/u.test(character)) || '';
  return (words.length > 1 ? letter(words[0]) + letter(words.at(-1)) : letter(words[0] || '')).toLocaleUpperCase();
}

export function profileAccountStatus(sync) {
  if (sync?.state === 'signed-out') return {text:'Signed out · Local data retained'};
  if (sync?.state === 'not-configured') return {text:'Saved on this device', detail:'Cloud backup unavailable'};
  if (sync?.state === 'connecting' && sync.linked == null) return {text:'Checking account…'};
  const error = sync?.state === 'auth-unavailable' ? 'Account connection needs attention'
    : sync?.state === 'needs-attention' || sync?.locked ? 'Sync needs attention' : null;
  if (!sync?.linked) return {
    text:'No linked account · Recovery not set up',
    detail:error || (sync?.state === 'offline' ? 'Offline · Saved on this device' : sync?.state === 'connecting' ? 'Checking account…' : null),
    attention:Boolean(error),
  };
  if (error) return {text:error, attention:true};
  if (sync.state === 'offline') return {text:'Signed in · Offline', detail:sync.pendingCount > 0 ? 'Changes waiting to sync' : null};
  if ((sync.hasPassword || sync.providerName === 'Email') && !sync.emailVerified) return {text:'Verify your email', attention:true};
  if (sync.state === 'synced' && sync.pendingCount === 0) return {text:'Signed in · Synced'};
  if (sync.state === 'retry' || sync.state === 'synced') return {text:'Signed in · Changes waiting to sync'};
  if (['syncing','connecting'].includes(sync.state)) return {text:'Signed in · Syncing changes…'};
  return {text:'Sync needs attention', attention:true};
}

export function ProfileAccountEntry({name, sync, onClick}) {
  const initials = profileInitials(name), status = profileAccountStatus(sync);
  return <ExerciseNavigationButton data-profile-area="account" className="profile-account-entry" onClick={onClick} aria-label={`Account & sync: ${status.text}${status.detail ? `. ${status.detail}` : ''}`}>
    <span className="profile-account-avatar" aria-hidden="true">{initials || <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"/></svg>}</span>
    <span className="profile-account-copy"><strong>Account &amp; sync</strong>
      <span className={`profile-account-status${status.attention ? ' needs-attention' : ''}`} role="status">{status.attention && <span aria-hidden="true">!</span>}{status.text}{status.detail && <small>{status.detail}</small>}</span>
    </span>
    <NavigationChevron/>
  </ExerciseNavigationButton>;
}
