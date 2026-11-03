import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Progress, Profile, Detail } from './App.jsx';
import * as domain from './domain.js';
import { createReturningUserFixture } from './demoFixture.js';
import { useAnimationClock } from './testAnimationClock.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, current;
beforeEach(() => {
  useAnimationClock(); vi.setSystemTime(new Date('2026-10-30T12:00:00'));
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener(){}, removeEventListener(){} }));
  vi.stubGlobal('ResizeObserver', class { observe(){} disconnect(){} });
  vi.stubGlobal('IntersectionObserver', class { observe(){} disconnect(){} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = () => {}; HTMLElement.prototype.scrollIntoView = () => {};
  vi.spyOn(domain, 'saveState').mockReturnValue(true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const click = el => act(() => el.click());
const button = pattern => [...host.querySelectorAll('button')].find(b => pattern.test((b.getAttribute('aria-label') || '') + ' ' + b.textContent.trim()));
const typeWeight=value=>act(()=>{
  const input=host.querySelector('.weight-input-wrap input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
});
const withCheckins = state => {
  state.weightTrackingEnabled = true;
  state.weightCheckins = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.parse('2026-10-30T12:00:00') - i * 2 * 86400000).toISOString().slice(0, 10);
    return { id: `w${i}`, localDate: day, weightKg: +(78.4 - i * 0.08).toFixed(1), createdAt: 0 };
  });
  return state;
};
function fixture(goal, edit = s => s) {
  const s = createReturningUserFixture(4);
  s.profile.goal = goal; s.profile.ageRange = '25–34';
  s.program.goalAtCreation = goal;
  return edit(s);
}
function mount(start, Screen) {
  current = start;
  function Harness() {
    const [state, setState] = useState(start); const [detail, setDetail] = useState(null);
    const update = fn => setState(prev => { const next = fn(structuredClone(prev)); current = next; return next; });
    return <>{detail
      ? <Detail detail={detail} state={state} update={update} close={() => setDetail(null)} setDetail={setDetail} setPage={() => {}}/>
      : <Screen state={state} update={update} setDetail={setDetail} setPage={() => {}} onLogout={() => {}}/>}</>;
  }
  act(() => root.render(<Harness/>));
}

it('offers check-ins on Progress for a muscle-building goal and shows the trend once on', () => {
  mount(fixture('Build muscle'), Progress);
  click(button(/ADD WEIGHT CHECK-INS/));
  click(button(/ENABLE CHECK-INS/));
  expect(current.weightTrackingEnabled).toBe(true);
  act(() => root.unmount()); root = createRoot(host);
  mount(withCheckins(fixture('Build muscle')), Progress);
  const card = host.querySelector('.goal-progress-weight');
  expect(card.textContent).toContain('TREND WEIGHT');
  expect(card.textContent).toMatch(/\+\d\.\d kg over 4 weeks/);
  expect(button(/Open weight history/)).toBeTruthy();
});

it.each(['Get stronger', 'General fitness', 'Athletic performance'])('does not push check-ins for %s but shows an opted-in trend', goal => {
  mount(fixture(goal), Progress);
  expect(button(/ADD WEIGHT CHECK-INS/)).toBeUndefined();
  expect(host.querySelector('.goal-progress-weight')).toBeNull();
  act(() => root.unmount()); root = createRoot(host);
  mount(withCheckins(fixture(goal)), Progress);
  expect(host.querySelector('.goal-progress-weight').textContent).toContain('Weight trend');
});

it('uses neutral wording for the flat-trend note outside fat loss', () => {
  const flat = withCheckins(fixture('Build muscle')); flat.weightCheckins.forEach(c => { c.weightKg = 78; });
  mount(flat, Progress);
  const note = host.querySelector('.weight-trend-notice');
  expect(note.textContent).toContain("ROOK won't tell you to eat more or train more from weight alone.");
  expect(note.textContent).not.toContain('eat less');
});

it('retains the existing fat-loss trend, training context and goal-specific flat-trend note', () => {
  const state=withCheckins(fixture('Lose fat'));state.weightCheckins.forEach(entry=>{entry.weightKg=78;});
  mount(state, Progress);
  expect(button(/Open weight history/)).toBeTruthy();
  expect(host.querySelector('.weight-trend-summary').textContent).toContain('78.0 kg');
  expect(host.querySelector('.goal-progress-card').textContent).toContain('STRENGTH WHILE LOSING');
  expect(host.querySelector('.weight-trend-notice').textContent).toContain("ROOK won't tell you to eat less or train more from weight alone.");
});

it('turns check-ins off from weight history, keeps the data, and turns back on from Profile', () => {
  mount(withCheckins(fixture('Build muscle')), Progress);
  click(button(/Open weight history/));
  click(button(/TURN OFF CHECK-INS/));
  expect(current.weightTrackingEnabled).toBe(false);
  expect(current.weightCheckins).toHaveLength(14);
  expect(host.querySelector('.goal-progress-weight')).toBeNull();
  act(() => root.unmount()); root = createRoot(host);
  mount(current, Profile);
  click(button(/Training setup/));
  const row = button(/Weight check-ins/);
  expect(row.textContent).toContain('Off');
  click(row);
  click(button(/ENABLE CHECK-INS/));
  expect(current.weightTrackingEnabled).toBe(true);
  expect(current.weightCheckins).toHaveLength(14);
});

it('hides the Profile entry for under-18 profiles that never turned check-ins on', () => {
  mount(fixture('Build muscle', s => { s.profile.ageRange = 'Under 18'; return s; }), Profile);
  click(button(/Training setup/));
  expect(button(/Weight check-ins/)).toBeUndefined();
});

it.each([['78,5','kg',78.5],['78.5','kg',78.5],['176,4','lb',80.0137]])('keeps and saves the typed decimal %s %s', (value,units,expectedKg) => {
  const state=fixture('Build muscle');state.profile.units=units;
  mount(state,Progress);
  click(button(/ADD WEIGHT CHECK-INS/));click(button(/ENABLE CHECK-INS/));
  typeWeight(value);
  expect(host.querySelector('.weight-input-wrap input').value).toBe(value);
  click(host.querySelector('button[type="submit"]'));
  expect(current.weightCheckins).toHaveLength(1);
  expect(current.weightCheckins[0].weightKg).toBeCloseTo(expectedKg,3);
  expect(host.querySelector('.weight-history-sheet')).toBeTruthy();
});

it('rejects malformed pasted decimal input without saving a check-in', () => {
  mount(fixture('Build muscle'),Progress);
  click(button(/ADD WEIGHT CHECK-INS/));click(button(/ENABLE CHECK-INS/));
  typeWeight('78,5.2');click(host.querySelector('button[type="submit"]'));
  expect(current.weightCheckins).toHaveLength(0);
  expect(host.querySelector('[role="alert"]').textContent).toContain('Enter a valid body weight');
});

it('does not offer check-ins on Progress for an under-18 muscle-building profile', () => {
  mount(fixture('Build muscle', s => { s.profile.ageRange = 'Under 18'; return s; }), Progress);
  expect(button(/ADD WEIGHT CHECK-INS/)).toBeUndefined();
});

it.each(['Build muscle', 'Lose fat', 'Get stronger', 'General fitness', 'Athletic performance'])('hides saved weight summaries while tracking is off for %s', goal => {
  const state=withCheckins(fixture(goal));state.weightTrackingEnabled=false;
  mount(state, Progress);
  expect(button(/Open weight history/)).toBeUndefined();
  expect(host.querySelector('.weight-trend-summary')).toBeNull();
  expect(host.querySelector('.weight-trend-notice')).toBeNull();
  expect(current.weightCheckins).toHaveLength(14);
});

it('shows an empty opted-in trend without inventing a weight value', () => {
  mount(fixture('Get stronger', state => { state.weightTrackingEnabled=true; return state; }), Progress);
  expect(button(/Open weight history/)).toBeTruthy();
  const summary=host.querySelector('.weight-trend-summary');
  expect(summary.textContent).not.toMatch(/\d\.\d (kg|lb)/);
  expect(summary.textContent).not.toMatch(/NaN|null|undefined/);
});

it('enables from Profile, saves pounds canonically, and preserves the goal and plan through reload', () => {
  const state=fixture('General fitness');state.profile.units='lb';
  const plan=structuredClone(state.program);
  mount(state, Profile);
  click(button(/Training setup/));click(button(/Weight check-ins/));click(button(/ENABLE CHECK-INS/));
  const input=host.querySelector('.weight-input-wrap input');
  act(()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'176.4');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  click(host.querySelector('button[type="submit"]'));
  expect(current.weightCheckins).toHaveLength(1);
  expect(current.weightCheckins[0].weightKg).toBeCloseTo(80,1);
  expect(current.weightTrackingEnabled).toBe(true);
  expect(current.profile.goal).toBe('General fitness');
  expect(current.program).toEqual(plan);
  const reloaded=domain.deserializeState(domain.serializeState(current),{strict:true});
  expect(reloaded.weightTrackingEnabled).toBe(true);
  expect(reloaded.weightCheckins).toEqual(current.weightCheckins);
  act(()=>root.unmount());root=createRoot(host);
  mount(reloaded, Profile);click(button(/Training setup/));
  expect(button(/Weight check-ins/).textContent).toContain('On · Last 176.4 lb');
});
