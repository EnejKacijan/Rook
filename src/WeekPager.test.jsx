import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import {WeekPager, weekLabel} from './WeekPager.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {isoDay, weekday} from './domain.js';

let root, host, change, selection, commits, haptic, renders, reduced, geometryStyle;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T12:00:00'));
  reduced = false; vi.stubGlobal('matchMedia', () => ({matches: reduced}));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({width:300});
  geometryStyle = document.createElement('style'); geometryStyle.textContent = '.week-pager-track { column-gap: 14px; }'; document.head.append(geometryStyle);
  host = document.createElement('main'); document.body.append(host); root = createRoot(host);
  commits = vi.fn(); haptic = vi.fn(); renders = 0;
});
afterEach(() => {act(() => root.unmount()); host.remove(); geometryStyle.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();});
function mount(date='2026-09-21') {
  const fixture = createReturningUserFixture(0);
  function Harness() {
    const [value, setValue] = useState(date); selection = value; change = setValue; renders++;
    return <><WeekPager state={fixture} date={new Date(`${value}T12:00:00`)} canGoBack canGoForward
      selectDate={(day,date) => {commits(day,isoDay(date)); setValue(isoDay(date));}} onCommit={haptic}
      programName="Imported plan" openCalendar={()=>{}} calendarOpen={false}/><section data-body>{value}</section></>;
  }
  act(() => root.render(<Harness/>));
}
function pointer(type,x,y=40) {
  const e = new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});
  Object.defineProperties(e,{pointerId:{value:1},pointerType:{value:'mouse'}});
  act(() => host.querySelector('.week-pager-viewport').dispatchEvent(e));
}
const advance = ms => act(() => vi.advanceTimersByTime(ms));
it.each([...Array.from({length:7},(_,i)=>`2026-09-${21+i}`), '2026-03-29', '2026-10-25'])('arrows preserve %s weekday, commit once after motion, and recenter without body animation', date => {
  mount(date); const before = new Date(`${date}T12:00:00`); before.setDate(before.getDate()-7);
  act(() => host.querySelector('[aria-label="Previous week"]').click());
  expect(selection).toBe(date); expect(host.querySelector('[data-body]').textContent).toBe(date); expect(haptic).not.toHaveBeenCalled();
  advance(260); expect(selection).toBe(isoDay(before)); expect(commits).toHaveBeenCalledExactlyOnceWith(weekday(date),isoDay(before)); expect(haptic).toHaveBeenCalledOnce();
  expect(host.querySelector('.week-pager-track').style.transform).toContain('-314px');
  expect(host.querySelector('[data-week-offset="0"] [aria-pressed="true"]').getAttribute('aria-label')).toMatch(new RegExp(`^${weekday(date)} `));
  expect(host.querySelector('[data-body]').getAttribute('style')).toBeNull();
});
it('dragging never rerenders the owner or changes the canonical date/Today body', () => {
  mount(); const initialRenders = renders; pointer('pointerdown',200);
  for(let x=190;x>=60;x-=10) {pointer('pointermove',x); advance(17);}
  expect(renders).toBe(initialRenders); expect(selection).toBe('2026-09-21'); expect(commits).not.toHaveBeenCalled();
  pointer('pointerup',60); advance(260); expect(selection).toBe('2026-09-28'); expect(commits).toHaveBeenCalledOnce(); expect(renders).toBe(initialRenders+1);
});
it('keeps one accessible page; normal date taps and direct month-style jumps do not animate', () => {
  mount(); expect(host.querySelectorAll('.week-pager-page:not([aria-hidden]) button')).toHaveLength(7);
  for (const page of host.querySelectorAll('.week-pager-page[aria-hidden]')) {
    expect(page.hasAttribute('inert')).toBe(true); expect([...page.querySelectorAll('button')].every(button=>button.tabIndex===-1)).toBe(true);
  }
  act(() => host.querySelector('[data-week-offset="0"] button[aria-label^="Tue "]').click());
  expect(selection).toBe('2026-09-22'); expect(haptic).not.toHaveBeenCalled();
  act(() => change('2026-12-31'));
  expect(host.querySelector('.week-calendar-trigger').getAttribute('aria-label')).toBe('Open calendar, Dec 28–Jan 3');
  expect(host.querySelector('.week-pager-track').style.transition).toBe('none'); expect(host.querySelector('.week-pager-track').style.transform).toContain('-314px');
});
it('a direct date change interrupts an old pending settle', () => {
  mount(); act(() => host.querySelector('[aria-label="Next week"]').click());
  act(() => change('2026-10-15')); advance(1000); expect(selection).toBe('2026-10-15'); expect(commits).not.toHaveBeenCalled();
});
it('reduced arrows navigate immediately with the same date and haptic semantics', () => {
  reduced = true; mount('2026-12-31'); act(() => host.querySelector('[aria-label="Next week"]').click());
  expect(selection).toBe('2027-01-07'); expect(commits).toHaveBeenCalledExactlyOnceWith('Thu','2027-01-07'); expect(haptic).toHaveBeenCalledOnce();
});
it('retains the canonical local week-range copy', () => {
  expect(weekLabel(new Date('2026-09-21T12:00:00'))).toBe('Sep 21–27');
  expect(weekLabel(new Date('2026-09-28T12:00:00'))).toBe('Sep 28–Oct 4');
});
it.each([
  ['2026-09-21',['Sep 21–27','Sep 14–20','Sep 28–Oct 4']],
  ['2026-09-28',['Sep 28–Oct 4','Sep 21–27','Oct 5–11']],
  ['2026-12-28',['Dec 28–Jan 3','Dec 21–27','Jan 4–10']],
])('keeps each range one atomic label across %s', (date,labels) => {
  mount(date);
  const pages=[...host.querySelector('.week-range-track').children];
  expect(pages.map(page=>page.textContent)).toEqual(labels);
  expect(pages.every(page=>page.childElementCount===0)).toBe(true);
  expect(pages.map(page=>page.style.order)).toEqual(['1','0','2']);
  expect(host.querySelector('.week-range-viewport').getAttribute('aria-hidden')).toBe('true');
  expect(host.querySelector('.week-calendar-trigger').getAttribute('aria-label')).toBe(`Open calendar, ${labels[0]}`);
});
