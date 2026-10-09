// Runtime connectivity belongs to this session, never the saved training profile.
export const COACH_RETRY_DELAYS = [1000, 3000];
export const COACH_RECHECK_MS = 10000;
export const COACH_AUTH_WAIT_MS = 10000;
const transient = new Set(['timeout', 'network_error', 'server_error', 'provider_error', 'auth_failed', 'unknown']);

export function coachFailure(error = {}, now = Date.now()) {
  const code = error.code;
  if (code === 'sign-in-required' || code === 'invalid-identity' || code === 'auth-failed' || (code?.startsWith('auth/') && code !== 'auth/network-request-failed') || error.status === 401 || error.status === 403)
    return { state: 'auth_attention', reason: 'auth_failed' };
  if (code === 'ai-disabled' || code === 'config_missing') return { state: 'not_configured', reason: 'config_missing' };
  if (error.status === 429) return { state: 'rate_limited', reason: 'rate_limit', retryAt: error.retryAt || now + 60000 };
  if (code === 'timeout' || error.name === 'AbortError') return { state: 'temporary', reason: 'timeout' };
  if (code === 'provider-output' || code === 'ai-failed') return { state: 'temporary', reason: 'provider_error' };
  if (error.status >= 500) return { state: 'temporary', reason: 'server_error' };
  if (error.status >= 400) return { state: 'request_error', reason: 'request_error' };
  return { state: 'temporary', reason: code === 'network_error' || code === 'auth/network-request-failed' || error instanceof TypeError ? 'network_error' : 'unknown' };
}

export function createCoachAvailability({ status, watchAuth, isOnline = () => navigator.onLine,
  onChange = () => {}, telemetry = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  let snapshot = { state: 'connecting', reason: 'unknown', auth: 'pending', network: 'online', checkedAt: null };
  let stopped = false, backend = null, auth = 'pending', inFlight = null, timer = null, attempts = 0, releaseAuth;
  let observingAuth = false, authTimer = null;
  let revision = 0;
  const publish = value => {
    if (stopped) return;
    const previous = snapshot;
    snapshot = { ...snapshot, retryAt: null, ...value, auth, network: isOnline() ? 'online' : 'offline' };
    if (value.reason && !['ready', 'unknown', 'auth_pending'].includes(value.reason)) snapshot.lastFailure = { reason: value.reason, at: now() };
    onChange(snapshot);
    if (previous.state !== snapshot.state || previous.reason !== snapshot.reason)
      telemetry({ reason: snapshot.reason, context: snapshot.state, source: snapshot.auth });
  };
  const clearRetry = () => { if (timer != null) cancel(timer); timer = null; };
  const available = () => {
    if (!isOnline()) return publish({ state: 'offline', reason: 'offline' });
    if (!backend) return publish({ state: 'connecting', reason: 'unknown' });
    if (!backend.available) return publish({ state: 'not_configured', reason: 'config_missing' });
    if (backend.requiresSignIn && auth !== 'ready')
      return publish({ state: auth === 'pending' ? 'connecting' : auth === 'not_configured' ? 'not_configured' : 'auth_attention',
        reason: auth === 'pending' ? 'auth_pending' : auth === 'not_configured' ? 'config_missing' : 'auth_failed' });
    if (snapshot.retryAt && now() < snapshot.retryAt) return;
    publish({ state: 'ready', reason: 'ready' });
  };
  const retryLater = () => {
    if (!transient.has(snapshot.reason) || attempts >= COACH_RETRY_DELAYS.length || !isOnline()) return;
    clearRetry();
    timer = schedule(() => { timer = null; void check('backoff'); }, COACH_RETRY_DELAYS[attempts++]);
  };
  const observeAuth = () => {
    if (observingAuth || stopped) return;
    observingAuth = true;
    auth = 'pending';
    authTimer = schedule(() => {
      authTimer = null;
      if (auth === 'pending') { auth = 'attention'; available(); }
    }, COACH_AUTH_WAIT_MS);
    Promise.resolve().then(() => watchAuth(value => {
      if (stopped) return;
      auth = value;
      if (value !== 'pending' && authTimer != null) { cancel(authTimer); authTimer = null; }
      if (backend) available();
      else if (value === 'ready') void check('auth');
      else publish({ auth });
    })).then(release => { if (stopped) release?.(); else releaseAuth = release; }).catch(() => {
      observingAuth = false;
      if (authTimer != null) { cancel(authTimer); authTimer = null; }
      auth = 'attention'; available();
    });
  };
  async function check(trigger = 'manual') {
    if (stopped) return;
    if (!isOnline()) { clearRetry(); publish({ state: 'offline', reason: 'offline' }); return; }
    if (snapshot.retryAt && now() < snapshot.retryAt) return;
    if (inFlight) return inFlight;
    if (!['manual', 'backoff', 'start', 'online', 'auth'].includes(trigger) && snapshot.checkedAt != null && now() - snapshot.checkedAt < COACH_RECHECK_MS) return;
    clearRetry();
    observeAuth();
    if (trigger !== 'backoff') attempts = 0;
    const epoch = revision;
    publish({ state: 'connecting', reason: auth === 'pending' ? 'auth_pending' : 'unknown' });
    const pending = (async () => {
      try {
        const result = await status();
        if (stopped || epoch !== revision) return;
        if (result.reason && result.reason !== 'config_missing' && !result.available) {
          backend = null;
          publish({ ...coachFailure({ code: result.reason, status: result.status, retryAt: result.retryAt }), checkedAt: now() });
          retryLater();
        } else {
          backend = result;
          publish({ checkedAt: now() });
          available();
        }
      } catch (error) {
        if (stopped || epoch !== revision) return;
        backend = null;
        publish({ ...coachFailure(error, now()), checkedAt: now() });
        retryLater();
      }
    })();
    inFlight = pending;
    try { await pending; } finally { if (inFlight === pending) inFlight = null; }
  }
  return {
    getSnapshot: () => snapshot,
    start() {
      observeAuth();
      void check('start');
    },
    check,
    offline() { revision++; backend = null; inFlight = null; clearRetry(); publish({ state: 'offline', reason: 'offline' }); },
    failure(error) { revision++; clearRetry(); publish(isOnline() ? coachFailure(error, now()) : { state: 'offline', reason: 'offline' }); retryLater(); },
    success() { revision++; clearRetry(); attempts = 0; publish({ state: 'ready', reason: 'ready', checkedAt: now() }); },
    stop() { stopped = true; revision++; clearRetry(); if (authTimer != null) cancel(authTimer); releaseAuth?.(); },
  };
}

export function coachAvailabilityCopy(value) {
  switch (value.state) {
    case 'ready': return null;
    case 'offline': return { text: "You’re offline. Coach will be available when you’re back online.", placeholder: 'You’re offline' };
    case 'connecting': return { text: 'Connecting to Coach…', placeholder: 'Connecting to Coach…' };
    case 'auth_attention': return { text: 'Account connection needs attention.', action: 'Retry connection', signIn: true, placeholder: 'Connect your account' };
    case 'not_configured': return { text: 'Coach is not enabled for this app. Your training data is safe and logging still works.', action: 'Try again', placeholder: 'Coach is not enabled' };
    case 'rate_limited': return { text: `Coach’s usage limit was reached. ${value.retryAt ? 'Try again after ' + new Date(value.retryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.' : 'Try again later.'}`, action: 'Try again', placeholder: 'Try again later' };
    case 'request_error': return { text: 'This request could not be sent. Your message is saved.', action: 'Try again', placeholder: 'Retry connection' };
    default: return { text: 'Coach is temporarily unavailable. Your training data is safe and logging still works.', action: 'Try again', placeholder: 'Coach is reconnecting' };
  }
}
