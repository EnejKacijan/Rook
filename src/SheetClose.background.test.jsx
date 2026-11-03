import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach, afterEach, it, expect, vi} from 'vitest';
vi.mock('./useCoachAvailability.js', () => ({useCoachAvailability: () => ({state:'ready'})}));
import {RookRoot} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {saveState, serializeState, deserializeState} from './domain.js';
import {forgetStorageSession} from './localStateStorage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-03T14:21:00'));
  vi.stubGlobal('matchMedia', () => ({matches:false, addEventListener(){}, removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback,16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('ResizeObserver', class {observe(){} unobserve(){} disconnect(){}});
  vi.stubGlobal('scrollTo', () => {});
  localStorage.clear(); forgetStorageSession(localStorage);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); localStorage.clear(); forgetStorageSession(localStorage);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('keeps the same inert background navigation throughout sheet opening and dismissal', async () => {
  saveState(deserializeState(serializeState(createReturningUserFixture(0))));
  await act(async () => root.render(<RookRoot/>));
  const nav = host.querySelector('.bottom-nav'); expect(nav).toBeTruthy();
  const trigger = host.querySelector('[aria-label="Today options"]');
  await act(async () => trigger.click());
  await act(async () => vi.advanceTimersByTimeAsync(240));
  expect(host.querySelector('.bottom-nav')).toBe(nav);
  expect(nav.closest('.app-content').inert).toBe(true);
  expect(nav.closest('.app-content').getAttribute('aria-hidden')).toBe('true');
  const observer = new MutationObserver(() => {}); observer.observe(nav.parentElement,{childList:true});
  await act(async () => host.querySelector('[aria-label="Close More options"]').click());
  expect(host.querySelector('.bottom-nav')).toBe(nav);
  expect(observer.takeRecords()).toHaveLength(0); observer.disconnect();
  await act(async () => vi.advanceTimersByTimeAsync(240));
  expect(host.querySelector('.modal-layer')).toBeNull();
  expect(host.querySelector('.bottom-nav')).toBe(nav);
  expect(nav.closest('.app-content').inert).toBe(false);
});
