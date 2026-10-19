import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { coachBillingTicket, isDevPaywallPreview } from './devPaywallPreview.js';
import { createPreviewSession, getPreviewSession } from './devPaywallPreviewSession.js';

beforeEach(() => {
  vi.stubEnv('DEV', true);
  vi.stubGlobal('location', { port: '4198', search: '?paywallPreview=1' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('requires an explicit development URL; production cannot enable preview', () => {
  expect(isDevPaywallPreview()).toBe(true);
  vi.stubGlobal('location', { port: '4198', search: '' });
  expect(isDevPaywallPreview()).toBe(false);
  expect(() => getPreviewSession()).toThrow('not enabled');
  vi.stubGlobal('location', { port: '3000', search: '?paywallPreview=1' });
  expect(isDevPaywallPreview()).toBe(false);
  vi.stubEnv('DEV', false);
  vi.stubGlobal('location', { port: '4198', search: '?paywallPreview=1' });
  expect(isDevPaywallPreview()).toBe(false);
  expect(() => createPreviewSession()).toThrow('development-only');
});

it('only explicit preview tickets are removed from real AI billing requests', () => {
  const actual = { requestId: 'real', token: 'test-token' };
  expect(coachBillingTicket(actual)).toBe(actual);
  expect(coachBillingTicket({ localPaywallPreview: true })).toBeNull();
  vi.stubGlobal('location', { port: '4198', search: '' });
  expect(() => coachBillingTicket({ localPaywallPreview: true })).toThrow('no longer open');
  vi.stubEnv('DEV', false);
  expect(coachBillingTicket(actual)).toBe(actual);
});

it('simulates purchase, restoration and reset without network or persisted entitlement', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
  const session = createPreviewSession(), listener = vi.fn();
  const stop = session.subscribe(listener);
  const initial = session.getSnapshot();
  expect(initial.status).toBe('free');
  expect(await session.refresh()).toBe(initial);
  await expect(session.purchase({ product: {} })).rejects.toThrow('Unknown');
  expect(session.getSnapshot()).toBe(initial);
  await expect(session.purchase(initial.products.annual)).resolves.toMatchObject({ status: 'active', localPaywallPreview: true });
  expect(session.getSnapshot().entitlement).toBe('rook_pro');
  expect((await session.refresh()).status).toBe('active');
  session.resetAccess();
  expect(session.getSnapshot()).toMatchObject({ status: 'free', entitlement: null });
  expect(listener).toHaveBeenCalledTimes(2);
  stop();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(storageSpy).not.toHaveBeenCalled();
});

it('preview Coach reservations are idempotent and resetting access retains Free usage', async () => {
  const session = createPreviewSession();
  const failed = session.beginCoach('retry');
  expect(session.beginCoach('retry')).toBe(failed);
  session.finishCoach(failed, false);
  expect(session.getSnapshot().freeCoachResponsesUsed).toBe(0);
  const tickets = ['one', 'two', 'three'].map(id => session.beginCoach(id));
  expect(session.beginCoach('four').status).toBe('limit');
  tickets.forEach(ticket => session.finishCoach(ticket, true));
  session.finishCoach(tickets[0], true);
  expect(session.getSnapshot().freeCoachResponsesUsed).toBe(3);
  await session.purchase(session.getSnapshot().products.monthly);
  session.finishCoach(session.beginCoach('pro'), true);
  session.resetAccess();
  expect(session.getSnapshot().freeCoachResponsesUsed).toBe(3);
  expect(session.beginCoach('free-again').status).toBe('limit');
});
