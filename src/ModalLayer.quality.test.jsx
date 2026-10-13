import React, {act, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {ModalLayer, SheetHeader} from './App.jsx';
import {PersonalThemesProvider, usePersonalThemes} from './PersonalThemesContext.jsx';
import {bindNavigationFocus} from './navigationFocus.js';
import {useAnimationClock} from './testAnimationClock.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, releaseFocus;
const tick = async (ms = 300) => act(async () => vi.advanceTimersByTimeAsync(ms));
const click = async node => { expect(node).toBeTruthy(); await act(async () => node.click()); await tick(); };
const key = async (target, key, shiftKey = false) => act(async () =>
  target.dispatchEvent(new KeyboardEvent('keydown', {key, shiftKey, bubbles: true, cancelable: true})));
beforeEach(() => {
  useAnimationClock();
  vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({left: 0, right: 390, top: 0, bottom: 600, width: 390, height: 600});
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {configurable: true, value: vi.fn()});
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {configurable: true, value: vi.fn()});
  releaseFocus = bindNavigationFocus();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  await tick(32); releaseFocus(); host.remove();
  delete HTMLElement.prototype.scrollTo;
  delete HTMLElement.prototype.scrollIntoView;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

async function nestedThemes() {
  const parentClose = vi.fn();
  function AppearanceContent({close}) {
    const themes = usePersonalThemes();
    return <main className="screen detail-screen appearance-screen">
      <SheetHeader title="Appearance" onClose={close} closeLabel="Close Appearance"/>
      <button type="button" onClick={() => themes.openThemes()}>Open personal themes</button>
    </main>;
  }
  function Harness() {
    const [open, setOpen] = useState(true), background = useRef(null);
    return <PersonalThemesProvider Modal={ModalLayer} Header={SheetHeader}>
      <div ref={background} className="app-shell"><button>Profile destination</button></div>
      {open && <ModalLayer backgroundRef={background} close={() => {parentClose(); setOpen(false);}}>
        <AppearanceContent/>
      </ModalLayer>}
    </PersonalThemesProvider>;
  }
  await act(async () => root.render(<Harness/>)); await tick();
  const parent = host.querySelector('.modal-layer'), trigger = [...host.querySelectorAll('button')].find(button => button.textContent === 'Open personal themes');
  act(() => trigger.focus()); await click(trigger);
  const top = document.querySelector('.pro-theme-studio');
  expect(top).toBeTruthy(); expect(parent.inert).toBe(true); expect(parent.getAttribute('aria-hidden')).toBe('true');
  return {parentClose, parent, top, trigger};
}

it('Escape dismisses only Personal themes over Appearance and restores focus to its surviving trigger', async () => {
  const {parentClose, parent, top, trigger} = await nestedThemes();
  const close = top.querySelector('[aria-label="Close personal themes"]');
  expect(document.activeElement).toBe(close);
  await key(close, 'Escape'); await tick(); await tick(32);
  expect(document.querySelector('.pro-theme-studio')).toBeNull();
  expect(parentClose).not.toHaveBeenCalled();
  expect(parent.isConnected).toBe(true); expect(parent.inert).toBe(false);
  expect(parent.hasAttribute('aria-hidden')).toBe(false); expect(document.activeElement).toBe(trigger);
  await key(trigger, 'Escape'); await tick();
  expect(parentClose).toHaveBeenCalledOnce();
});

it('only the top modal traps Tab; effectively inert ancestors cannot take focus', async () => {
  const {parentClose, parent, top} = await nestedThemes();
  const controls = [...top.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  const first = controls[0], last = controls.at(-1);
  expect(first).toBeTruthy(); expect(last).toBeTruthy();
  act(() => first.focus()); await key(first, 'Tab', true);
  expect(document.activeElement).toBe(last);
  await key(last, 'Tab'); expect(document.activeElement).toBe(first);
  // The parent remains visually present, but none of its controls belong to
  // the top modal's keyboard scope while the whole parent layer is inert.
  expect(top.contains(document.activeElement)).toBe(true); expect(parentClose).not.toHaveBeenCalled();
  await click(top.querySelector('[aria-label="Close personal themes"]'));
  expect(parent.inert).toBe(false); expect(parentClose).not.toHaveBeenCalled();
});

it('transfers dialog semantics to a child-owned destination and back without stale wrapper labels', async () => {
  function Destination({close}) {
    const [child, setChild] = useState(false);
    return child ? <main className="screen detail-screen" role="dialog" aria-modal="true" aria-label="Conditioning">
      <SheetHeader title="Conditioning" onBack={() => setChild(false)} backLabel="Back to workout details" onClose={close}/>
    </main> : <main className="screen detail-screen">
      <SheetHeader title="Workout details" onClose={close}/>
      <button onClick={() => setChild(true)}>Conditioning</button>
    </main>;
  }
  await act(async () => root.render(<ModalLayer backgroundRef={{current: null}} close={() => {}}><Destination/></ModalLayer>)); await tick();
  const wrapper = host.querySelector('.modal-layer');
  expect(wrapper.getAttribute('role')).toBe('dialog'); expect(wrapper.getAttribute('aria-label')).toBe('Workout details');
  await click([...host.querySelectorAll('button')].find(button => button.textContent === 'Conditioning'));
  expect(host.querySelectorAll('[role="dialog"],[role="alertdialog"]')).toHaveLength(1);
  expect(wrapper.hasAttribute('role')).toBe(false); expect(wrapper.hasAttribute('aria-modal')).toBe(false);
  expect(wrapper.hasAttribute('aria-label')).toBe(false);
  expect(wrapper.firstElementChild.getAttribute('aria-label')).toBe('Conditioning');
  await click(host.querySelector('[aria-label="Back to workout details"]'));
  expect(host.querySelectorAll('[role="dialog"],[role="alertdialog"]')).toHaveLength(1);
  expect(wrapper.getAttribute('role')).toBe('dialog'); expect(wrapper.getAttribute('aria-modal')).toBe('true');
  expect(wrapper.getAttribute('aria-label')).toBe('Workout details');
});

it('tracks child-owned semantics even when no canonical header existed on the previous destination', async () => {
  function Destination({close}) {
    const [child, setChild] = useState(false);
    return child ? <main className="sheet" role="alertdialog" aria-modal="true" aria-label="Confirm operation"><button onClick={close}>Keep changes</button></main>
      : <main className="sheet"><h2>Initial options</h2><button onClick={() => setChild(true)}>Review operation</button></main>;
  }
  await act(async () => root.render(<ModalLayer backgroundRef={{current: null}} close={() => {}}><Destination/></ModalLayer>)); await tick();
  await click([...host.querySelectorAll('button')].find(button => button.textContent === 'Review operation'));
  expect(host.querySelectorAll('[role="dialog"],[role="alertdialog"]')).toHaveLength(1);
  expect(host.querySelector('.modal-layer').hasAttribute('role')).toBe(false);
  expect(host.querySelector('[role="alertdialog"]').getAttribute('aria-label')).toBe('Confirm operation');
});

it('unmount cancels scheduled modal focus and dismissal rather than closing a replacement destination', async () => {
  const close = vi.fn(), background = document.createElement('div'); host.before(background);
  await act(async () => root.render(<ModalLayer backgroundRef={{current: background}} close={close}><main className="screen detail-screen"><SheetHeader title="Old dialog"/></main></ModalLayer>));
  await tick(); await key(window, 'Escape');
  await act(async () => root.render(<button>New destination</button>)); await tick();
  expect(close).not.toHaveBeenCalled(); expect(background.inert).toBe(false);
  expect(host.textContent).toBe('New destination'); expect(document.querySelector('.modal-layer')).toBeNull();
  background.remove();
});
