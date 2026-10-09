import { afterEach, expect, it, vi } from 'vitest';
const authorization = vi.hoisted(() => ({ get: vi.fn(async () => ({ authorization: 'Bearer synthetic' })) }));
vi.mock('./aiAuthorization.js', () => ({ aiAuthorizationHeaders: () => authorization.get() }));
import { AIService } from './aiService.js';
import { createReturningUserFixture } from './demoFixture.js';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); authorization.get.mockReset().mockResolvedValue({ authorization: 'Bearer synthetic' }); });
const response = (status, body, retry = null) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => retry } });
it('status distinguishes config absence, malformed responses, HTTP errors and network failure without provider/auth calls', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(200, { available: false, requiresSignIn: true }))
    .mockResolvedValueOnce(response(500, {})).mockRejectedValueOnce(new TypeError('network failed'))
    .mockResolvedValueOnce(response(200, {})));
  expect(await AIService.status()).toMatchObject({ reason: 'config_missing' });
  expect(await AIService.status()).toMatchObject({ reason: 'server_error', status: 500 });
  expect(await AIService.status()).toMatchObject({ reason: 'network_error' });
  expect(await AIService.status()).toMatchObject({ reason: 'server_error' });
  expect(authorization.get).not.toHaveBeenCalled(); expect(fetch.mock.calls.every(([url]) => url === '/api/ai/status')).toBe(true);
});
it('a status deadline is identified as timeout after 10 seconds', async () => {
  vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn((url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))));
  const pending = AIService.status(); await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toMatchObject({ reason: 'timeout' });
});
it('real UI send skips preflight and preserves structured auth, provider and rate errors for retry', async () => {
  const state = createReturningUserFixture(0);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(429, { code: 'rate-limit', error: 'PRIVATE' }, '120'))
    .mockResolvedValueOnce(response(401, { code: 'invalid-identity', error: 'PRIVATE' }))
    .mockResolvedValueOnce(response(502, { code: 'ai-failed', error: 'PRIVATE' })));
  for (const status of [429, 401, 502]) {
    await expect(AIService.coach(state, 'Please suggest a useful recovery routine.', { requireRemoteSuccess: true })).rejects.toMatchObject({ status });
  }
  expect(fetch).toHaveBeenCalledTimes(3); expect(fetch.mock.calls.every(([url]) => url === '/api/ai')).toBe(true);
});
it('auth/token wait shares the send deadline and cannot make a late paid request', async () => {
  vi.useFakeTimers(); let resolve; authorization.get.mockImplementationOnce(() => new Promise(done => resolve = done)); vi.stubGlobal('fetch', vi.fn());
  const send = AIService.coach(createReturningUserFixture(0), 'Please suggest a useful recovery routine.', { requireRemoteSuccess: true });
  const assertion = expect(send).rejects.toMatchObject({ code: 'timeout' });
  await vi.advanceTimersByTimeAsync(60000); await assertion; resolve({ authorization: 'Bearer synthetic' }); await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
});
