import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ callback: null, initial: 'ready' }));
vi.mock('./aiAuthorization.js', () => ({ watchCoachAuth: callback => { auth.callback = callback; callback(auth.initial); return () => {}; }, aiAuthorizationHeaders: vi.fn() }));
vi.mock('./domain.js', async original => ({ ...await original(), saveState: vi.fn(() => true) }));
vi.mock('./aiService.js', async original => ({ ...await original(), AIService: { ...(await original()).AIService, status: vi.fn(), coach: vi.fn() } }));
import { Coach } from './App.jsx';
import { useCoachAvailability } from './useCoachAvailability.js';
import { createReturningUserFixture } from './demoFixture.js';
import { AIService } from './aiService.js';
import { saveState } from './domain.js';
import { ANALYTICS_STORAGE_KEY } from './analytics.js';
let root, host, current, setVisit, initial;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const settle = async () => act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); });
const button = name => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === name || b.getAttribute('aria-label') === name);
const click = name => act(async () => button(name).click());
const type = text => act(() => { const input = host.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })); });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T12:00:00')); auth.initial = 'ready';
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 0)); vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  HTMLElement.prototype.getAnimations = () => []; HTMLElement.prototype.scrollIntoView = () => {};
  AIService.status.mockReset().mockResolvedValue({ available: true, requiresSignIn: true });
  AIService.coach.mockReset().mockResolvedValue({ text: 'Recovered reply.', source: 'ai' }); saveState.mockReset().mockReturnValue(true);
  initial = createReturningUserFixture(0); initial.ai.available = false; initial.activeCoachConversationId = 'current'; initial.conversations = []; initial.coachDraft = 'Saved draft';
  initial.coachConversationMeta = { current: { id: 'current', createdAt: Date.now(), lastActivityAt: Date.now(), localDateStarted: '2026-10-04' } };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  function Harness() {
    const [state, setState] = useState(initial), [visiting, visit] = useState(true); current = state; setVisit = visit;
    const availability = useCoachAvailability({ profileId: state.profile.id, visiting });
    return visiting ? <Coach state={state} update={fn => setState(previous => fn(structuredClone(previous)))} availability={availability} setPage={() => visit(false)} setDetail={() => {}} /> : <p>Local training stays usable.</p>;
  }
  act(() => root.render(<Harness />)); await settle();
}
it('A/B connecting auth enables automatically, preserves draft and ignores persisted stale ai.available=false', async () => {
  auth.initial = 'pending'; await mount(); expect(host.textContent).toContain('Connecting to Coach…'); expect(host.querySelector('textarea').disabled).toBe(true);
  expect(host.querySelector('textarea').value).toBe('Saved draft'); act(() => auth.callback('ready')); await settle();
  expect(host.querySelector('textarea').disabled).toBe(false); expect(host.textContent).not.toContain('Connecting to Coach');
  expect(current.ai.available).toBe(false); expect(AIService.coach).not.toHaveBeenCalled();
});
it('D/E offline preserves typed draft; reconnect restores shortcuts/composer and leaves training data unchanged', async () => {
  await mount(); type('Draft while switching networks'); const before = structuredClone(current);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); act(() => window.dispatchEvent(new Event('offline')));
  expect(host.textContent).toContain('You’re offline'); expect(host.querySelector('textarea').value).toBe('Draft while switching networks');
  expect(host.querySelector('textarea').disabled).toBe(true);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); act(() => window.dispatchEvent(new Event('online'))); await settle();
  expect(host.querySelector('textarea').disabled).toBe(false); expect(current).toEqual(before);
});
it('F/K failed real send retains one entry; health retry and double click retry issue one new send', async () => {
  await mount(); AIService.coach.mockRejectedValueOnce(Object.assign(new Error('private provider error'), { status: 502, code: 'ai-failed' }));
  type('Keep this question'); await click('Send message'); const entry = current.conversations.at(-1);
  expect(entry).toMatchObject({ user: 'Keep this question', reply: null, requestError: true });
  expect(host.textContent).toContain('Coach is temporarily unavailable'); expect(host.textContent).not.toContain('private provider error');
  await click('Try again'); expect(host.querySelector('textarea').disabled).toBe(false);
  let resolve; AIService.coach.mockImplementationOnce(() => new Promise(done => resolve = done));
  await act(async () => { button('Retry reply').click(); button('Retry reply').click(); });
  expect(AIService.coach).toHaveBeenCalledTimes(2); await act(async () => resolve({ text: 'Recovered reply.' }));
  expect(current.conversations).toHaveLength(1); expect(current.conversations[0].id).toBe(entry.id); expect(current.conversations[0].reply.text).toBe('Recovered reply.');
});
it('I config missing shows an accurate recoverable state instead of offline', async () => {
  AIService.status.mockResolvedValueOnce({ available: false, reason: 'config_missing' }); await mount();
  expect(host.textContent).toContain('Coach is not enabled for this app'); expect(host.textContent).not.toContain('You’re offline');
  await click('Try again'); expect(host.querySelector('textarea').disabled).toBe(false);
});
it('J background/foreground and tab revisit recover without reload', async () => {
  AIService.status.mockResolvedValueOnce({ available: false, reason: 'config_missing' }); await mount();
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  act(() => document.dispatchEvent(new Event('visibilitychange'))); await settle(); expect(host.querySelector('textarea').disabled).toBe(false);
  act(() => setVisit(false)); await act(async () => vi.advanceTimersByTimeAsync(10000)); act(() => setVisit(true)); await settle();
  expect(host.querySelector('textarea').value).toBe('Saved draft'); expect(AIService.status).toHaveBeenCalledTimes(3);
});
it('G 429 UI supplies timing and does not expose the raw provider message or change local profile/quota', async () => {
  await mount(); const profile = structuredClone(current.profile);
  AIService.coach.mockRejectedValueOnce({ status: 429, code: 'rate-limit', retryAt: Date.now() + 60000, message: 'private quota message' });
  await click('Send message'); expect(host.textContent).toContain('Coach’s usage limit was reached'); expect(host.textContent).toContain('Try again after');
  expect(current.profile).toEqual(profile); expect(host.textContent).not.toContain('private quota message');
});
it('L runtime errors never mutate program, logs, workouts, saved content, or preferences; telemetry contains classification only', async () => {
  await mount(); const before = structuredClone(current);
  AIService.coach.mockRejectedValueOnce({ status: 500, message: 'SECRET-COACH-TEXT' }); await click('Send message');
  for (const key of ['program', 'profile', 'workouts', 'savedWorkouts', 'activeWorkout', 'todayAdaptation']) expect(current[key]).toEqual(before[key]);
  const events = JSON.parse(localStorage.getItem(ANALYTICS_STORAGE_KEY));
  const availability = events.filter(event => event.name === 'coach_availability_changed'); expect(availability.length).toBeGreaterThan(0);
  expect(JSON.stringify(availability)).not.toContain('SECRET'); expect(JSON.stringify(availability)).not.toContain('Saved draft');
});
