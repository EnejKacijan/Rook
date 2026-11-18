import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Detail, Profile, Progress } from './App.jsx';
import { createReturningUserFixture } from './demoFixture.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, current;

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(initial, Screen) {
  function Harness() {
    const [state, setState] = useState(initial);
    const [detail, setDetail] = useState(null);
    current = state;
    const update = operation => setState(previous => operation(structuredClone(previous)));
    const props = { state, update, setDetail, setPage() {}, onLogout() {} };
    return detail ? <Detail {...props} detail={detail} close={() => setDetail(null)} /> : <Screen {...props} />;
  }
  act(() => root.render(<Harness />));
}

const button = name => [...host.querySelectorAll('button')].find(element =>
  name.test(element.getAttribute('aria-label') || element.textContent));
const click = element => act(() => element.click());

it('opens, saves and revisits weight check-ins on the muscle-building Progress screen', () => {
  const state = createReturningUserFixture(0);
  mount(state, Progress);
  click(button(/ADD WEIGHT CHECK-INS/));
  click(button(/ENABLE CHECK-INS/));
  const input = host.querySelector('.weight-input-wrap input');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '83.5');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  click(host.querySelector('.weight-entry-form button[type="submit"]'));
  expect(current.weightCheckins[0].weightKg).toBe(83.5);
  expect(current.program).toEqual(state.program);
  expect(host.querySelector('.weight-history-sheet').textContent).toContain('83.5 kg');
  click(host.querySelector('.detail-header-close'));
  expect(button(/Open weight history/)).toBeDefined();
  const summary = host.querySelector('.weight-trend-summary');
  expect(summary.textContent).toContain('LATEST CHECK-IN');
  expect(summary.querySelector('strong').textContent).toBe('83.5 kg');
  expect(summary.querySelector('time').dateTime).toBe(current.weightCheckins[0].localDate);
});

it('shows a Profile way to turn tracking on and lets it be switched off without losing entries', () => {
  const state = createReturningUserFixture(0);
  state.weightTrackingEnabled = true;
  state.weightCheckins = [{ id: 'sample-check-in', weightKg: 83.5, localDate: '2026-11-09' }];
  mount(state, Profile);
  click(button(/Training setup/));
  click(button(/Weight check-ins/));
  click(button(/TURN OFF CHECK-INS/));
  expect(current.weightTrackingEnabled).toBe(false);
  expect(current.weightCheckins).toEqual(state.weightCheckins);
  click(button(/Training setup/));
  click(button(/Weight check-ins/));
  expect(button(/ENABLE CHECK-INS/)).toBeDefined();
});

it('does not introduce a new opt-in on the muscle-building Progress screen for a known minor', () => {
  const state = createReturningUserFixture(0);
  state.profile.ageRange = 'Under 18';
  mount(state, Progress);
  expect(button(/ADD WEIGHT CHECK-INS/)).toBeUndefined();
});
