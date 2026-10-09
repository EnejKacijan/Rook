import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCoachAvailability, coachAvailabilityCopy, coachFailure } from './coachAvailability.js';
let runtime, auth, online, status, changes, release;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
beforeEach(() => { vi.useFakeTimers(); online = true; changes = []; release = vi.fn(); status = vi.fn(async () => ({ available: true, requiresSignIn: true })); });
afterEach(() => { runtime?.stop(); vi.useRealTimers(); });
async function start(initial = 'ready') {
  runtime = createCoachAvailability({ status, isOnline: () => online, onChange: value => changes.push(value),
    watchAuth: callback => { auth = callback; callback(initial); return release; } });
  runtime.start(); await flush(); return runtime;
}
it('A/B initial auth pending connects until restoration; ready automatically enables Coach without token/provider calls', async () => {
  await start('pending'); expect(runtime.getSnapshot()).toMatchObject({ state: 'connecting', reason: 'auth_pending' });
  auth('ready'); expect(runtime.getSnapshot().state).toBe('ready'); expect(status).toHaveBeenCalledOnce();
});
it('C timeout then a bounded backoff recovers; no infinite polling', async () => {
  status.mockResolvedValueOnce({ available: false, reason: 'timeout' }); await start();
  expect(runtime.getSnapshot()).toMatchObject({ state: 'temporary', reason: 'timeout' });
  await vi.advanceTimersByTimeAsync(1000); expect(runtime.getSnapshot().state).toBe('ready');
  await vi.advanceTimersByTimeAsync(600000); expect(status).toHaveBeenCalledTimes(2);
});
it('D/E offline startup does not request; reconnect succeeds', async () => {
  online = false; await start(); expect(runtime.getSnapshot().state).toBe('offline'); expect(status).not.toHaveBeenCalled();
  online = true; await runtime.check('online'); expect(runtime.getSnapshot().state).toBe('ready');
});
it('F 500 then manual retry recovers', async () => {
  status.mockRejectedValueOnce({ status: 500 }); await start(); expect(runtime.getSnapshot().reason).toBe('server_error');
  await runtime.check(); expect(runtime.getSnapshot().state).toBe('ready');
});
it('G fair-use 429 obeys retry time even on manual, resume, auth or online signals', async () => {
  await start(); const retryAt = Date.now() + 60000;
  runtime.failure({ status: 429, code: 'rate-limit', retryAt });
  expect(runtime.getSnapshot()).toMatchObject({ state: 'rate_limited', reason: 'rate_limit', retryAt });
  for (const signal of ['manual', 'resume', 'auth', 'online']) await runtime.check(signal);
  auth('ready'); expect(runtime.getSnapshot().retryAt).toBe(retryAt);
  expect(status).toHaveBeenCalledOnce(); expect(coachAvailabilityCopy(runtime.getSnapshot()).text).toContain('Try again after');
  await vi.advanceTimersByTimeAsync(60001); await runtime.check(); expect(runtime.getSnapshot().state).toBe('ready');
});
it('I explicit missing configuration is persistent, distinguishable and manually recheckable', async () => {
  status.mockResolvedValueOnce({ available: false, reason: 'config_missing' }); await start();
  expect(runtime.getSnapshot().state).toBe('not_configured'); await vi.advanceTimersByTimeAsync(600000); expect(status).toHaveBeenCalledOnce();
  await runtime.check(); expect(runtime.getSnapshot().state).toBe('ready');
});
it('J foreground/revisit rechecks stale status with a cooldown and recovers', async () => {
  status.mockResolvedValueOnce({ available: false, reason: 'config_missing' }); await start();
  await runtime.check('resume'); expect(status).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10000); await runtime.check('resume'); expect(runtime.getSnapshot().state).toBe('ready');
  await runtime.check('visit'); expect(status).toHaveBeenCalledTimes(2);
});
it('repeated server failures stop after two automatic retries; explicit retry opens a new bounded cycle', async () => {
  status.mockRejectedValue({ status: 503 }); await start(); await vi.advanceTimersByTimeAsync(600000);
  expect(status).toHaveBeenCalledTimes(3); expect(runtime.getSnapshot().state).toBe('temporary');
  status.mockResolvedValue({ available: true }); await runtime.check(); expect(runtime.getSnapshot().state).toBe('ready');
});
it('stopped/profile-switched controllers cannot publish a late check or auth event', async () => {
  let resolve; status.mockImplementation(() => new Promise(done => resolve = done)); await start('pending');
  runtime.stop(); const count = changes.length; resolve({ available: true }); auth('ready'); await flush();
  expect(changes).toHaveLength(count); expect(release).toHaveBeenCalledOnce();
});
it('network switch cancels stale result and preserves the newly recovered state', async () => {
  let resolve; status.mockImplementationOnce(() => new Promise(done => resolve = done)); await start();
  online = false; runtime.offline(); online = true; await runtime.check('online');
  resolve({ available: false, reason: 'config_missing' }); await flush(); expect(runtime.getSnapshot().state).toBe('ready');
});
it('auth errors, anonymous/missing identity, 4xx and provider failures are classified without exposing raw errors', async () => {
  await start('attention'); expect(runtime.getSnapshot().state).toBe('auth_attention'); auth('ready');
  for (const error of [{ status: 401 }, { status: 403 }, { code: 'auth/invalid-user-token' }]) expect(coachFailure(error).state).toBe('auth_attention');
  expect(coachFailure({ status: 400 }).state).toBe('request_error');
  expect(coachFailure({ status: 502, code: 'ai-failed', message: 'secret provider text' }).reason).toBe('provider_error');
  expect(coachAvailabilityCopy(coachFailure({ status: 502 })).text).not.toContain('secret');
});
it('auth initialization cannot hang forever, but late restoration still enables Coach', async () => {
  await start('pending'); await vi.advanceTimersByTimeAsync(10000); expect(runtime.getSnapshot().state).toBe('auth_attention');
  auth('ready'); expect(runtime.getSnapshot().state).toBe('ready');
});
it('failed auth initialization is retried on demand', async () => {
  const watch = vi.fn().mockRejectedValueOnce(new Error('import failed')).mockImplementation(callback => { callback('ready'); return release; });
  runtime = createCoachAvailability({ status, watchAuth: watch }); runtime.start(); await flush();
  expect(runtime.getSnapshot().state).toBe('auth_attention'); await runtime.check(); await flush(); expect(runtime.getSnapshot().state).toBe('ready');
});
