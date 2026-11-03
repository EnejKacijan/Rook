import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AdjustTodaySheet } from './App.jsx';
import * as domain from './domain.js';
import { createReturningUserFixture } from './demoFixture.js';
import { useAnimationClock } from './testAnimationClock.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => {
  useAnimationClock(); vi.setSystemTime(new Date('2026-10-12T12:00:00'));
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener(){}, removeEventListener(){} }));
  vi.stubGlobal('ResizeObserver', class { observe(){} disconnect(){} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = () => {}; HTMLElement.prototype.scrollIntoView = () => {};
  vi.spyOn(domain, 'saveState').mockReturnValue(true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const click = el => act(() => el.click());
const button = pattern => [...host.querySelectorAll('button')].find(b => pattern.test(b.textContent.trim()));
async function reviewFor(minutes) {
  const s = createReturningUserFixture(4); s.selectedDate = domain.isoDay();
  function Harness() { const [state, setState] = useState(s); return <AdjustTodaySheet state={state} update={fn => setState(prev => fn(structuredClone(prev)))} close={() => {}}/>; }
  act(() => root.render(<Harness/>));
  click([...host.querySelectorAll('.choice-row')].find(b => b.textContent.includes('Less time')));
  click(button(new RegExp(`^${minutes} min$`)));
  click(button(/^REVIEW \d+-MINUTE WORKOUT/));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(button(/^USE THIS WORKOUT$/)).toBeTruthy();
}
it('says when the shortened workout is the closest fit above the chosen time', async () => {
  await reviewFor(40);
  expect(host.textContent).toContain('→ 45 min');
  const note = host.querySelector('.adjust-time-fit');
  expect(note.textContent).toBe('Closest fit for 40 min. Main sets stay. Remove an exercise in Edit workout to shorten it more.');
});
it('stays quiet when the result fits the chosen time', async () => {
  await reviewFor(45);
  expect(host.textContent).toContain('→ 45 min');
  expect(host.querySelector('.adjust-time-fit')).toBeNull();
});
