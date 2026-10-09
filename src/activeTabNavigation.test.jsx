import React, {act, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import {BottomNav, Profile, Today, Progress, Coach, Detail, ModalLayer, TabRouteNavigation} from './App.jsx';
import {retapActiveTab, rootScrollOwner, scrollTabRootToTop, TAB_ROOTS} from './activeTabNavigation.js';
import {createReturningUserFixture} from './demoFixture.js';
import {startFreestyleWorkout} from './freestyleWorkout.js';
import {saveState} from './domain.js';

vi.mock('./domain.js', async original => ({...await original(), saveState: vi.fn(() => true)}));
let host, root, current, reduced, setRoute, navigate, scroll, documentOwner;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T12:00:00'));
  reduced = false;
  vi.stubGlobal('matchMedia', () => ({matches: reduced, addEventListener() {}, removeEventListener() {}}));
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
  vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 16)); vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{width: 390, height: 44}]);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  scroll = vi.fn(function(options) {this.scrollTop = options.top;});
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {configurable: true, value: scroll});
  documentOwner = document.documentElement; documentOwner.scrollTop = 0;
  Object.defineProperty(document, 'scrollingElement', {configurable: true, value: documentOwner});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  navigate = vi.fn(); saveState.mockClear();
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); documentOwner.scrollTop = 0;
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  delete HTMLElement.prototype.scrollTo; delete document.scrollingElement;
});
function mount(tab = 'profile', initial = createReturningUserFixture(2)) {
  function Harness() {
    const [page, setPage] = useState(tab), [detail, setDetail] = useState(null), [state, setState] = useState(initial);
    const background = useRef(null), memory = useRef(new Map()); current = state; setRoute = setDetail;
    const update = fn => setState(previous => fn(structuredClone(previous)));
    const select = next => {navigate(next); setPage(next);};
    const screens = {profile: Profile, today: Today, progress: Progress, coach: Coach};
    const Screen = screens[page];
    return <div className="app-shell"><div ref={background} className="app-content">
      <Screen state={state} update={update} setDetail={setDetail} setPage={select} scrollMemory={memory.current}/>
      {!detail && <BottomNav page={page} setPage={select}/>}
    </div>{detail && <ModalLayer backgroundRef={background} close={() => setDetail(null)}
      presentation={detail?.editPlan?.fullscreen ? 'editor-page' : 'sheet'}
      tabNavigation={detail?.editPlan?.fullscreen ? leave => <TabRouteNavigation page={page} setPage={select} leave={leave} backgroundRef={background}/> : undefined}>
      <Detail detail={detail} state={state} update={update} setDetail={setDetail} setPage={select} close={() => setDetail(null)}/>
    </ModalLayer>}</div>;
  }
  act(() => root.render(<Harness/>)); settle();
}
const settle = () => act(() => vi.advanceTimersByTime(250));
const click = node => {expect(node).toBeTruthy(); act(() => node.click());};
const tab = id => host.querySelector(`.bottom-nav button[aria-label="${id.toUpperCase()}"]`);
const program = () => click(host.querySelector('[data-profile-area="program"]'));
const atRoot = () => expect(host.querySelector('.profile-hub h1')?.textContent).toBe('Training profile');

it('maps all four existing canonical surfaces, with an explicit conversation exception', () => {
  expect(Object.keys(TAB_ROOTS)).toEqual(['today','coach','progress','profile']);
  expect(TAB_ROOTS.coach.scroll).toBe('conversation');
});
it('A Program → active Profile returns directly to Training profile without tab switching', () => {
  mount(); program(); expect(host.querySelector('.profile-management-screen')).not.toBeNull();
  click(tab('profile')); atRoot(); expect(navigate).not.toHaveBeenCalled();
});
it('B deeper Data → diagnostics → active Profile skips the intermediate Data page', () => {
  mount(); click(host.querySelector('[data-profile-area="data"]')); click(host.querySelector('[data-profile-area="diagnostics"]'));
  click(tab('profile')); atRoot(); expect(host.textContent).not.toContain('Storage diagnostics');
});
it('B/L expanded Edit plan → active Profile uses its existing dirty guard once, then reaches root', () => {
  mount(); program(); act(() => setRoute({editPlan: {fullscreen: true}})); settle();
  const editor = host.querySelector('.edit-plan-screen'); expect(editor).not.toBeNull();
  const input = editor.querySelector('input[aria-label="Weekly plan name"]');
  act(() => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Unsaved workout name'); input.dispatchEvent(new Event('input', {bubbles: true}));});
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const before = JSON.stringify(current);
  click(tab('profile')); expect(confirm).toHaveBeenCalledWith('Discard unsaved plan changes?');
  expect(host.querySelector('.edit-plan-screen')).not.toBeNull(); expect(input.value).toBe('Unsaved workout name');
  expect(JSON.stringify(current)).toBe(before);
  confirm.mockReturnValue(true); click(tab('profile')); atRoot();
  expect(confirm).toHaveBeenCalledTimes(2); expect(host.querySelector('.modal-layer')).toBeNull();
  expect(navigate).not.toHaveBeenCalled(); expect(JSON.stringify(current)).toBe(before);
});
it.each(['profile','today','progress'])('C/F/I %s root re-tap scrolls only its actual document owner', page => {
  mount(page); const content = host.querySelector('.app-content'), surface = content.querySelector('.screen');
  const nested = document.createElement('div'); nested.scrollTop = 73; surface.append(nested);
  documentOwner.scrollTop = 340; scroll.mockClear(); click(tab(page));
  expect(scroll).toHaveBeenCalledWith({top: 0, behavior: 'smooth'}); expect(documentOwner.scrollTop).toBe(0); expect(nested.scrollTop).toBe(73);
});
it('D at root/top is stable no-op; repeated activations do not navigate or remount', () => {
  mount(); const surface = host.querySelector('.profile-hub'); scroll.mockClear();
  click(tab('profile')); click(tab('profile')); click(tab('profile'));
  expect(scroll).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); expect(host.querySelector('.profile-hub')).toBe(surface);
});
it('uses a bounded root container when it owns scroll, never a nested detail scroller', () => {
  const surface = document.createElement('main'); surface.style.overflowY = 'auto'; host.append(surface);
  Object.defineProperty(surface, 'scrollHeight', {value: 1800}); Object.defineProperty(surface, 'clientHeight', {value: 700});
  surface.scrollTop = 450; expect(rootScrollOwner(surface)).toBe(surface);
  scrollTabRootToTop(surface); expect(surface.scrollTop).toBe(0); expect(documentOwner.scrollTop).toBe(0);
});
it('Reduced Motion jumps directly; very long pages never start an extended scroll animation', () => {
  mount(); reduced = true; documentOwner.scrollTop = 400; scroll.mockClear(); click(tab('profile'));
  expect(scroll).toHaveBeenLastCalledWith({top: 0, behavior: 'instant'});
  reduced = false; documentOwner.scrollTop = 12000; click(tab('profile'));
  expect(scroll).toHaveBeenLastCalledWith({top: 0, behavior: 'instant'});
});
it('E/H Today and Progress detail sheets keep modal ownership until explicit dismissal', () => {
  for (const page of ['today','progress']) {
    mount(page); act(() => setRoute({exercise: current.program.days[0].exercises[0]})); settle();
    const sheet = host.querySelector('.modal-layer'); expect(sheet).not.toBeNull(); expect(tab(page)).toBeNull();
    expect(retapActiveTab(page, host.querySelector('.app-content'))).toBe(false); expect(sheet.isConnected).toBe(true);
    act(() => root.render(null));
  }
});
it('G/O/P retap never writes session/date/timer/domain state or resets another tab', () => {
  const initial = startFreestyleWorkout(createReturningUserFixture(2));
  initial.selectedDate = '2026-10-02'; initial.selectedDay = 'Fri';
  initial.activeWorkout.rest = {endsAt: Date.now() + 90000, pending: false};
  mount('today', initial); const before = JSON.stringify(current), saved = saveState.mock.calls.length;
  click(tab('today')); expect(JSON.stringify(current)).toBe(before); expect(saveState.mock.calls.length).toBe(saved);
  expect(current.activeWorkout.rest.endsAt).toBe(initial.activeWorkout.rest.endsAt);
  click(tab('profile')); program(); click(tab('profile')); atRoot(); expect(JSON.stringify(current)).toBe(before);
});
it('inactive activation retains accepted direct navigation and accessible current state', () => {
  mount(); expect(tab('profile').getAttribute('aria-current')).toBe('page');
  click(tab('progress')); expect(navigate).toHaveBeenCalledExactlyOnceWith('progress');
  expect(tab('progress').getAttribute('aria-current')).toBe('page'); expect(tab('profile').getAttribute('aria-current')).toBeNull();
});
it('J Coach History and archived conversation return directly to main Coach, without a new chat', () => {
  const initial = createReturningUserFixture(2);
  initial.activeCoachConversationId = 'current';
  initial.conversations = [{id: 'old-message', conversationId: 'archived', createdAt: Date.now() - 86400000,
    user: 'Old question', reply: {text: 'Old answer'}}, {id: 'current-message', conversationId: 'current', createdAt: Date.now(),
    user: 'Current question', reply: {text: 'Current answer'}}];
  mount('coach', initial); const before = JSON.stringify(current);
  click(host.querySelector('.coach-history-trigger')); settle(); expect(host.querySelector('.coach-menu-open')).not.toBeNull();
  expect(host.querySelector('.coach-history-surface').getAttribute('role')).toBe('region'); expect(tab('coach')).not.toBeNull();
  click(tab('coach')); expect(host.querySelector('.coach-menu-open')).toBeNull(); expect(JSON.stringify(current)).toBe(before);
  click(host.querySelector('.coach-history-trigger')); settle(); click(host.querySelector('.coach-history-group button')); settle();
  expect(host.querySelector('.coach-conversation-back')).not.toBeNull(); click(tab('coach'));
  expect(host.querySelector('.coach-conversation-back')).toBeNull(); expect(JSON.stringify(current)).toBe(before);
});
it('K Coach root preserves transcript position, draft and manual/latest-follow mode', () => {
  mount('coach'); const transcript = host.querySelector('.coach-scroll'); transcript.scrollTop = 274;
  const mode = transcript.dataset.scrollMode, before = JSON.stringify(current); scroll.mockClear();
  click(tab('coach')); expect(transcript.scrollTop).toBe(274); expect(transcript.dataset.scrollMode).toBe(mode);
  expect(scroll).not.toHaveBeenCalled(); expect(JSON.stringify(current)).toBe(before);
});
it('M a blocking portal modal or nested editor decision cannot be bypassed even by virtual activation', () => {
  mount(); program(); const layer = document.createElement('div'); layer.className = 'modal-layer'; layer.setAttribute('role','alertdialog'); document.body.append(layer);
  click(tab('profile')); expect(host.querySelector('.profile-management-screen')).not.toBeNull(); layer.remove();
  act(() => setRoute({editPlan: {fullscreen: true}})); settle();
  const nested = document.createElement('div'); nested.setAttribute('role','dialog'); host.querySelector('.edit-plan-screen').append(nested);
  const confirm = vi.spyOn(window,'confirm'); click(tab('profile'));
  expect(host.querySelector('.edit-plan-screen')).not.toBeNull(); expect(confirm).not.toHaveBeenCalled(); nested.remove();
});
it('N pop-to-root creates no history entries or phantom child resurrection on browser Back', () => {
  mount(); const push = vi.spyOn(history,'pushState'), replace = vi.spyOn(history,'replaceState'), back = vi.spyOn(history,'back');
  program(); act(() => setRoute({editPlan: {fullscreen: true}})); settle(); click(tab('profile')); atRoot();
  act(() => window.dispatchEvent(new PopStateEvent('popstate'))); atRoot();
  expect(push).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled(); expect(back).not.toHaveBeenCalled();
  expect(host.querySelector('.edit-plan-screen')).toBeNull();
});
it('keyboard/assistive activation in the full-screen editor leaves focus on the surviving active tab', () => {
  mount(); program(); act(() => setRoute({editPlan: {fullscreen: true}})); settle();
  act(() => tab('profile').focus()); click(tab('profile')); settle(); atRoot();
  expect(document.activeElement).toBe(tab('profile'));
});
