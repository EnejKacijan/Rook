import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Coach } from './App.jsx';
import { createReturningUserFixture } from './demoFixture.js';
import { saveState } from './domain.js';
import { AIService } from './aiService.js';
import './coach.css';
vi.mock('./domain.js', async original => ({ ...await original(), saveState: vi.fn(() => true) }));
vi.mock('./aiService.js', async original => ({ ...await original(), AIService: { ...(await original()).AIService, coach: vi.fn() } }));
let root, host, current, page, update, resolve, reject, scroller;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T12:00:00'));
  saveState.mockReset().mockReturnValue(true);
  AIService.coach.mockReset().mockImplementation(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('requestAnimationFrame', cb => setTimeout(() => cb(performance.now()), 16)); vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () { return this.classList.contains('coach-scroll') ? 500 : 0; });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
    return this.classList.contains('coach-scroll') ? this.querySelectorAll('.message-pair').length * 300 + this.textContent.length : this.tagName === 'TEXTAREA' ? 54 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const chat = this.closest('.coach-scroll');
    const index = chat ? [...chat.querySelectorAll('[data-coach-anchor]')].indexOf(this) : -1;
    const top = index >= 0 ? index * 100 - chat.scrollTop : 0;
    return { top, bottom: top + 100, left: 0, right: 390, width: 390, height: 100 };
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() {
  const initial = createReturningUserFixture(0);
  initial.activeCoachConversationId = 'current'; initial.coachDraft = ''; initial.ai.available = true;
  initial.conversations = Array.from({ length: 20 }, (_, i) => ({ id: `msg-${i}`, conversationId: 'current', createdAt: Date.now(), user: `Question ${i}`, reply: { text: `Answer ${i}` } }));
  function Harness() {
    const [state, setState] = useState(initial), [active, setActive] = useState(true), memory = useRef(new Map());
    current = state; page = setActive; update = fn => setState(previous => fn(structuredClone(previous)));
    return active ? <Coach state={state} update={update} setPage={() => setActive(false)} setDetail={() => {}} scrollMemory={memory.current} /> : <button onClick={() => setActive(true)}>Return</button>;
  }
  act(() => root.render(<Harness />)); tick(); scroller = host.querySelector('.coach-scroll');
}
const tick = () => act(() => vi.advanceTimersByTime(300));
const button = label => [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent === label);
const click = label => act(() => button(label).click());
const input = value => act(() => {
  const node = host.querySelector('textarea'); node.focus();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(node, value);
  node.dispatchEvent(new Event('input', { bubbles: true }));
});
const read = () => { act(() => { scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: -200 })); scroller.scrollTop = 400; scroller.dispatchEvent(new Event('scroll')); }); tick(); };

it('A sends exact multiline text once immediately, clears accepted draft, keeps a stable response shell and follows', async () => {
  mount(); read(); const text = '  My training\nnext question  '; input(text); expect(scroller.scrollTop).toBe(400);
  click('Send message'); expect(current.conversations.at(-1).user).toBe(text); expect(host.querySelector('textarea').value).toBe('');
  expect(host.querySelectorAll('.message-pair')).toHaveLength(21); const shell = host.querySelector('.coach-thinking'); expect(shell).not.toBeNull();
  tick(); expect(scroller.scrollTop).toBeCloseTo(scroller.scrollHeight - scroller.clientHeight, 0); expect(scroller.dataset.scrollMode).toBe('FOLLOWING_LATEST');
  await act(async () => resolve({ text: 'Finished response\n\nA second paragraph' })); tick();
  expect(host.querySelector('.message-pair:last-child .coach-message')).toBe(shell); expect(scroller.scrollTop).toBeCloseTo(scroller.scrollHeight - scroller.clientHeight, 0);
  expect(document.activeElement).toBe(host.querySelector('textarea')); expect(host.querySelector('[role="log"]').getAttribute('aria-live')).toBe('off');
});
it('B/C incoming incremental content leaves history alone; latest resumes following without focus theft', () => {
  mount(); read(); const top = scroller.scrollTop;
  for (let i = 0; i < 10; i++) { act(() => update(state => { state.conversations.at(-1).reply.text += '\n\nMore content'; return state; })); tick(); }
  expect(scroller.scrollTop).toBe(top); expect(button('Jump to latest message')).toBeTruthy();
  input('Draft retained'); click('Jump to latest message'); tick(); tick(); expect(button('Jump to latest message')).toBeUndefined();
  expect(scroller.scrollTop).toBeCloseTo(scroller.scrollHeight - scroller.clientHeight, 0); expect(host.querySelector('textarea').value).toBe('Draft retained');
});
it('latest control keeps an inert transparent dock and only the button is interactive', () => {
  mount(); read();
  const dock = host.querySelector('.coach-latest-dock');
  const latest = button('Jump to latest message');
  expect(dock).not.toBeNull();
  expect(getComputedStyle(dock).backgroundColor).toMatch(/rgba?\(0, 0, 0, 0\)|transparent/);
  expect(getComputedStyle(dock).boxShadow).toMatch(/^$|none$/);
  expect(dock.getAttribute('role')).toBeNull();
  expect(dock.getAttribute('tabindex')).toBeNull();
  expect(dock.querySelectorAll('button')).toHaveLength(1);
  expect(latest.className).toContain('coach-latest');
});
it('failed acceptance retains draft and reading intention; no AI request or duplicate message', () => {
  mount(); read(); input('Do not lose this'); saveState.mockReturnValue(false); click('Send message'); tick();
  expect(host.textContent).toContain('Couldn’t save your message.'); expect(host.querySelector('textarea').value).toBe('Do not lose this');
  expect(current.conversations).toHaveLength(20); expect(AIService.coach).not.toHaveBeenCalled(); expect(scroller.dataset.scrollMode).toBe('READING_HISTORY');
});
it('I errors preserve reading position and retry reuses the same entry and returns to latest', async () => {
  mount(); input('Please answer'); click('Send message'); tick(); read(); const id = current.conversations.at(-1).id;
  await act(async () => reject(new Error('Offline'))); tick(); expect(scroller.scrollTop).toBe(400); expect(button('Retry reply')).toBeTruthy();
  click('Retry reply'); tick(); expect(current.conversations).toHaveLength(21); expect(current.conversations.at(-1).id).toBe(id); expect(scroller.dataset.scrollMode).toBe('FOLLOWING_LATEST');
  await act(async () => resolve({ text: 'Recovered' })); tick(); expect(scroller.scrollTop).toBeCloseTo(scroller.scrollHeight - scroller.clientHeight, 0);
});
it('returning to Coach in the same mounted app restores reading position; Send still resumes latest', () => {
  mount(); read(); act(() => page(false)); click('Return'); tick(); scroller = host.querySelector('.coach-scroll');
  expect(scroller.scrollTop).toBe(400); expect(scroller.dataset.scrollMode).toBe('READING_HISTORY');
  input('Continue'); click('Send message'); tick(); expect(scroller.dataset.scrollMode).toBe('FOLLOWING_LATEST'); expect(scroller.scrollTop).toBeCloseTo(scroller.scrollHeight - scroller.clientHeight, 0);
});
it('keyboard activation of jump retains a useful focus target when the button disappears', () => {
  mount(); read(); act(() => button('Jump to latest message').focus()); click('Jump to latest message'); tick(); tick();
  expect(document.activeElement).toBe(scroller); expect(button('Jump to latest message')).toBeUndefined();
});
it('Send/latest preserve composer focus at mousedown without cancelling the touch pointerdown/click sequence', () => {
  mount(); read(); input('One accepted tap');
  for (const label of ['Send message', 'Jump to latest message']) {
    const pointer = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    const mouse = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    act(() => { button(label).dispatchEvent(pointer); button(label).dispatchEvent(mouse); });
    expect(pointer.defaultPrevented).toBe(false); expect(mouse.defaultPrevented).toBe(true); expect(document.activeElement).toBe(host.querySelector('textarea'));
  }
  click('Send message'); expect(current.conversations).toHaveLength(21); expect(current.coachDraft).toBe('');
});
it('Coach choice sends use the same focus-safe event phase and preserve an unrelated draft', () => {
  mount(); act(() => update(state => { state.conversations.at(-1).reply = { text: 'How much time?', combineRequest: { step: 'time' } }; return state; }));
  input('Draft stays here'); const choice = button('45 min');
  const pointer = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
  const mouse = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
  act(() => { choice.dispatchEvent(pointer); choice.dispatchEvent(mouse); choice.click(); });
  expect(pointer.defaultPrevented).toBe(false); expect(mouse.defaultPrevented).toBe(true);
  expect(current.conversations.at(-1).user).toBe('45 min'); expect(current.conversations).toHaveLength(21); expect(host.querySelector('textarea').value).toBe('Draft stays here');
});
