import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FirstRunNavigation, FirstRunStepMotion } from './FirstRunNavigation.jsx';
import { EntryLanding, BringPlanLanding, FirstRunSignIn, Onboarding, ImportPlan, ScratchPlan, RestoreBackupSheet, FirstRunFreestyleConfirm, SheetHeader, PlanEditor, ModalLayer, Profile } from './App.jsx';
import { SavedWorkouts } from './SavedWorkouts.jsx';
import { blankState } from './domain.js';
import { useSemanticSwipeBack } from './useSemanticSwipeBack.js';
import { pageBackMotion } from './swipePageMotion.js';

const backup = vi.hoisted(() => ({ parseBackupArchive: vi.fn(), commitPreparedRestore: vi.fn(), backupUserMessage: vi.fn(() => 'Could not restore.') }));
vi.mock('./backup.js', () => backup);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, state, animations, standalone, reduced;
function FirstRunHeader(props) { return <SheetHeader {...props} firstRunBack />; }
function Harness() {
  const [mode, setMode] = useState('landing');
  useSemanticSwipeBack();
  return <FirstRunNavigation mode={mode} parents={{import:"bring",scratch:"bring"}}>{route => {
    const close = () => setMode(current => current === route ? (['import','scratch'].includes(route) ? 'bring' : 'landing') : current);
    if (route === 'bring') return <BringPlanLanding back={close} importPlan={()=>setMode('import')} startFromScratch={()=>setMode('scratch')}/>;
    if (route === 'personalize') return <Onboarding update={() => {}} exit={close}/>;
    if (route === 'import') return <ImportPlan state={state} update={() => {}} close={close} initial/>;
    if (route === 'scratch') return <ScratchPlan state={state} update={() => {}} close={close} preserveDraftOnClose/>;
    if (route === 'restore') return <RestoreBackupSheet state={state} update={() => {}} close={close} firstRun/>;
    if (route === 'create-workout') return <SavedWorkouts state={state} update={() => {}} close={close} Header={FirstRunHeader} Editor={PlanEditor} Modal={ModalLayer} createNew firstRun/>;
    if (route === 'freestyle-confirm') return <FirstRunFreestyleConfirm back={close} start={()=>true}/>;
    return <EntryLanding personalize={() => setMode('personalize')} bringPlan={() => setMode('bring')} restoreBackup={() => setMode('restore')} ownWorkouts={() => setMode('create-workout')} trainFreestyle={() => setMode('freestyle-confirm')}/>;
  }}</FirstRunNavigation>;
}
function AccountEntryHarness() {
  const [mode, setMode] = useState('landing');
  useSemanticSwipeBack();
  return <FirstRunNavigation mode={mode} parents={{ restore: 'sign-in' }}>{route => {
    if (route === 'sign-in') return <FirstRunSignIn back={() => setMode('landing')}
      restoreBackup={() => setMode('restore')} providerReady signInWithGoogle={async () => ({ status: 'new-account' })}
      onSignedIn={() => setMode('landing')}/>;
    if (route === 'restore') return <RestoreBackupSheet state={state} update={() => {}} close={() => setMode('sign-in')} backLabel="Back to sign in" firstRun/>;
    return <EntryLanding signIn={() => setMode('sign-in')} personalize={() => {}} bringPlan={() => {}}
      ownWorkouts={() => {}} trainFreestyle={() => {}}/>;
  }}</FirstRunNavigation>;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 0)); vi.stubGlobal('cancelAnimationFrame', clearTimeout); standalone = true; reduced = false; state = blankState(); animations = [];
  vi.stubGlobal('matchMedia', query => ({ matches: query.includes('standalone') ? standalone : reduced, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () { return this.closest('[hidden],[inert]') ? [] : [{}]; });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 390, height: 800 });
  HTMLElement.prototype.scrollTo = function ({ top = 0 }) { this.scrollTop = top; };
  HTMLElement.prototype.scrollIntoView = () => {};
  HTMLElement.prototype.getAnimations = () => [];
  HTMLElement.prototype.animate = function (frames, timing) { const animation = { cancel: vi.fn(), frames, timing, node: this }; animations.push(animation); return animation; };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(<Harness/>));
});
afterEach(() => { act(() => root.unmount()); host.remove(); document.documentElement.scrollTop = 0; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const page = () => host.querySelector('.first-run-page:not([hidden])');
const button = text => [...page().querySelectorAll('button')].find(node => node.textContent.includes(text) || node.getAttribute('aria-label') === text);
function prepare(text) { if (['Import a plan','Enter it myself'].includes(text) && page().dataset.firstRunPage === 'landing') { act(()=>button('Bring my plan').click()); settle(); } }
function click(text) { prepare(text); act(() => button(text).click()); }
function settle() { act(() => vi.advanceTimersByTime(220)); }
function edit(node, value) { act(() => { Object.getOwnPropertyDescriptor(node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }); }
function touch(type, x, y = 200, target = page().querySelector('main')) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ identifier: 1, clientX: x, clientY: y }] });
  act(() => target.dispatchEvent(event));
}
function swipe(start = 4, end = 200, dy = 0) { touch('touchstart', start); touch('touchmove', end, 200 + dy); touch('touchend', end, 200 + dy); settle(); }

it('Sign in and Restore use the same two-level Back and interactive edge hierarchy', () => {
  act(() => root.render(<AccountEntryHarness/>));
  click('Sign in'); settle(); expect(page().dataset.firstRunPage).toBe('sign-in');
  const iconPath = page().querySelector('.first-run-back-button svg path')?.getAttribute('d');
  click('Restore from backup'); settle(); expect(page().dataset.firstRunPage).toBe('restore');
  expect(page().querySelector('.first-run-back-button svg path')?.getAttribute('d')).toBe(iconPath);
  swipe(); expect(page().dataset.firstRunPage).toBe('sign-in');
  swipe(); expect(page().dataset.firstRunPage).toBe('landing');
  expect(page().textContent).toContain('A plan that fits your week.');
});

for (const [name, route, back] of [['BUILD MY PLAN', 'personalize', 'Back to plan options'], ['Bring my plan', 'bring', 'Back to start'], ['Import a plan', 'import', 'Back to start'], ['Enter it myself', 'scratch', 'Back to start'], ['Restore', 'restore', 'Back to start'], ['Create a workout', 'create-workout', 'Back to start'], ['Freestyle', 'freestyle-confirm', 'Back to start']]) {
  it(`${route}: enters immediately, uses an opaque inaccessible page stack, restores exact Landing scroll and focus`, () => {
    prepare(name); const parent = ['import','scratch'].includes(route) ? 'bring' : 'landing';
    const trigger = button(name); trigger.focus(); document.documentElement.scrollTop = 173;
    click(name);
    expect(page().dataset.firstRunPage).toBe(route);
    expect(button(back).querySelector('.rook-navigation-chevron')).not.toBeNull();
    expect(document.documentElement.scrollTop).toBe(0);
    const layer = document.querySelector('[data-swipe-parent]');
    expect(layer.hasAttribute('inert')).toBe(true); expect(layer.getAttribute('aria-hidden')).toBe('true'); expect(layer.querySelector('[id]')).toBeNull();
    expect(host.querySelectorAll('.first-run-page:not([hidden])')).toHaveLength(1);
    expect(animations.every(a => a.timing.duration === 200)).toBe(true);
    settle(); click(back);
    expect(document.documentElement.scrollTop).toBe(173); expect(document.activeElement).toBe(trigger);
    expect(page().dataset.firstRunPage).toBe(parent); settle(); expect(document.querySelector('[data-swipe-parent]')).toBeNull();
  });
  it(`${route}: shared semantic edge Back returns once, preserves live fields during partial drag`, () => {
    click(name); settle(); const screen = page().querySelector('main'), field = page().querySelector('input,textarea');
    const callback = vi.fn(); button(back).addEventListener('click', callback);
    touch('touchstart', 4); touch('touchmove', 28); // below both completion thresholds
    expect(page().querySelector('main')).toBe(screen); expect(page().querySelector('input,textarea')).toBe(field);
    touch('touchend', 28); settle(); expect(page().dataset.firstRunPage).toBe(route); expect(callback).not.toHaveBeenCalled();
    swipe(); expect(page().dataset.firstRunPage).toBe(['import','scratch'].includes(route) ? 'bring' : 'landing'); expect(callback).toHaveBeenCalledOnce();
  });
}
it('preserves the same Import textarea, text, selection and child scroll across Back/reopen', () => {
  click('Import a plan'); settle(); const field = page().querySelector('textarea');
  edit(field, 'Monday: Push\nBench Press 3×8 @ 2 RIR'); field.setSelectionRange(3, 7); page().querySelector('main').scrollTop = 73;
  click('Back to start'); settle(); click('Import a plan'); settle();
  expect(page().querySelector('textarea')).toBe(field); expect(field.value).toBe('Monday: Push\nBench Press 3×8 @ 2 RIR');
  expect([field.selectionStart, field.selectionEnd]).toEqual([3, 7]); expect(page().querySelector('main').scrollTop).toBe(73);
});
it('nested edge Back reveals Bring my plan first, then Landing; never skips a level', () => {
  click('Import a plan'); settle();
  touch('touchstart', 4); touch('touchmove', 100);
  expect(document.querySelector('[data-swipe-parent]').textContent).toContain('Add the program you already follow.');
  expect(document.querySelector('[data-swipe-parent]').textContent).not.toContain('A plan that fits your week.');
  touch('touchend', 200); settle();
  expect(page().dataset.firstRunPage).toBe('bring');
  swipe(); expect(page().dataset.firstRunPage).toBe('landing');
});
it('preserves Scratch name, days and the same manual editor across a full Landing round trip', () => {
  click('Enter it myself'); settle(); edit(page().querySelector('input'), 'Retained week'); click('Mon'); click('CONTINUE');
  const editor = page().querySelector('.scratch-editor-screen');
  click('Back to plan setup'); click('Back to start'); settle(); click('Enter it myself'); settle();
  expect(page().querySelector('input[aria-label="Weekly plan name"]').value).toBe('Retained week');
  expect(button('Mon').getAttribute('aria-pressed')).toBe('true'); click('CONTINUE'); expect(page().querySelector('.scratch-editor-screen')).toBe(editor);
});
it('does not navigate on a non-edge, vertical or leftward gesture, or during typing', () => {
  click('Import a plan'); settle(); swipe(50); swipe(4, 28, 130); swipe(20, 0);
  const field = page().querySelector('textarea'); field.focus(); edit(field, 'Draft stays'); swipe();
  expect(page().dataset.firstRunPage).toBe('import'); expect(field.value).toBe('Draft stays');
  field.blur(); swipe(); expect(page().dataset.firstRunPage).toBe('bring');
});
it('does not borrow the page Back under a sheet, including one opening during the gesture', () => {
  click('Import a plan'); settle(); const screen = page().querySelector('main');
  touch('touchstart', 4); touch('touchmove', 100);
  const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); screen.append(dialog);
  touch('touchend', 200); settle(); expect(page().dataset.firstRunPage).toBe('import');
  swipe(); expect(page().dataset.firstRunPage).toBe('import'); dialog.remove(); swipe(); expect(page().dataset.firstRunPage).toBe('bring');
});
it('gives portalled sheets priority over their Landing child page', () => {
  click('Import a plan'); settle();
  const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.append(dialog);
  swipe(); expect(page().dataset.firstRunPage).toBe('import'); dialog.remove(); swipe(); expect(page().dataset.firstRunPage).toBe('bring');
});
it('releases the utility Restore screen on Back while retaining form drafts', () => {
  click('Restore'); settle(); const original = page().querySelector('main');
  click('Back to start'); settle(); expect(original.isConnected).toBe(false);
  click('Restore'); settle(); expect(page().querySelector('main')).not.toBe(original);
});
it('retains native browser history policy and has no Landing forward/back target', () => {
  expect(pageBackMotion(page().querySelector('main'))).toBeNull(); swipe(); expect(page().dataset.firstRunPage).toBe('landing');
  standalone = false; click('Enter it myself'); settle(); swipe(); expect(page().dataset.firstRunPage).toBe('scratch');
});
it('does not reuse a touch that dismisses the age picker as page Back', () => {
  click('BUILD MY PLAN'); settle(); click('Age range');
  const screen = page().querySelector('main');
  const event = new Event('pointerdown', { bubbles: true }); Object.defineProperty(event, 'pointerType', { value: 'touch' });
  act(() => screen.dispatchEvent(event));
  swipe(); expect(page().dataset.firstRunPage).toBe('personalize');
  swipe(); expect(page().dataset.firstRunPage).toBe('landing');
});
it('consumes the step swipe marker so a later button Back to Landing still animates', () => {
  click('BUILD MY PLAN'); settle(); click('Age range'); click('18–29'); click('CONTINUE'); settle();
  swipe(); expect(page().textContent).toContain('Set the right starting point.');
  expect(page().querySelector('main').dataset.swipeBackCommitted).toBeUndefined();
  click('Back to plan options'); expect(page().dataset.firstRunPage).toBe('landing');
  expect(document.querySelector('[data-swipe-parent]')).not.toBeNull();
});
it('reduced motion is immediate while semantic edge Back still works', () => {
  reduced = true; click('Import a plan'); expect(animations).toHaveLength(0); expect(document.querySelector('[data-swipe-parent]')).toBeNull();
  swipe(); expect(page().dataset.firstRunPage).toBe('bring'); expect(animations).toHaveLength(0);
});
it('rapid Forward/Back/Forward leaves one destination and no stale animation callbacks', () => {
  click('Import a plan'); click('Back to start'); click('Enter it myself'); settle();
  expect(page().dataset.firstRunPage).toBe('scratch'); expect(host.querySelectorAll('.first-run-page:not([hidden])')).toHaveLength(1);
  expect(document.querySelector('[data-swipe-parent]')).toBeNull(); expect(animations.every(a => a.cancel.mock.calls.length)).toBe(true);
});
it('tracks the complete first-run page 1:1 and restores exact inline styles on cancel', () => {
  click('Import a plan'); settle(); const screen = page().querySelector('main');
  const motion = pageBackMotion(screen), input = screen.querySelector('textarea');
  motion.render(195, 0); act(() => vi.advanceTimersByTime(1)); expect(screen.style.transform).toBe('translate3d(195px,0,0)');
  expect(screen.style.opacity).toBe('1'); expect(screen.querySelector('textarea')).toBe(input);
  motion.clear(); expect(screen.style.opacity).toBe(''); expect(screen.firstElementChild.style.transform).toBe('');
});
it('uses the same opaque physical stack for questionnaire button push/pop', () => {
  act(() => root.render(<FirstRunStepMotion step={0}><main><h1>First</h1></main></FirstRunStepMotion>));
  act(() => root.render(<FirstRunStepMotion step={1}><main><h1>Second</h1></main></FirstRunStepMotion>));
  expect(animations[0].node.tagName).toBe('MAIN'); expect(animations[0].frames[0].transform).toBe('translate3d(390px,0,0)'); expect(animations.every(a => a.frames.every(frame => frame.opacity === undefined))).toBe(true);
  expect(document.querySelector('[data-swipe-parent]').textContent).toBe('First'); expect(host.querySelector('main').textContent).toBe('Second');
  settle(); animations = [];
  act(() => root.render(<FirstRunStepMotion step={0}><main><h1>First</h1></main></FirstRunStepMotion>));
  expect(animations[0].node.dataset.swipeParent).toBe('true'); expect(animations[0].frames[1].transform).toBe('translate3d(390px,0,0)');
});
it('previews the previous question during a physical Back drag and commits without a second entrance', () => {
  click('BUILD MY PLAN'); settle();
  edit(page().querySelector('input'), 'Alex');
  click('Age range'); click('18–29'); click('CONTINUE'); settle();
  const screen = page().querySelector('main'), content = screen.querySelector('.onboarding-content');
  animations = [];
  touch('touchstart', 4); touch('touchmove', 199);
  act(() => vi.advanceTimersByTime(1));
  expect(content.style.transform).toBe('');
  expect(screen.style.transform).toBe('translate3d(195px,0,0)');
  expect(screen.style.opacity).toBe('1');
  const preview = document.querySelector('[data-swipe-parent]');
  expect(preview.hasAttribute('inert')).toBe(true);
  expect(preview.getAttribute('aria-hidden')).toBe('true');
  expect(preview.textContent).toContain('Set the right starting point.');
  expect(preview.querySelector('input').value).toBe('Alex');
  touch('touchend', 199); settle();
  expect(page().querySelector('main')).toBe(screen);
  expect(page().querySelector('input').value).toBe('Alex');
  expect(button('Age range').textContent).toContain('18–29');
  expect(page().dataset.firstRunPage).toBe('personalize');
  expect(animations).toHaveLength(0);
  expect(document.querySelector('[data-swipe-parent]')).toBeNull();
  click('Back to plan options');
  expect(page().dataset.firstRunPage).toBe('landing');
  expect(document.querySelector('[data-swipe-parent]')).not.toBeNull();
});
it('cancels a partial question Back without remounting content, losing scroll or replaying an entrance', () => {
  click('BUILD MY PLAN'); settle(); click('Age range'); click('18–29'); click('CONTINUE'); settle();
  const screen = page().querySelector('main'), content = screen.querySelector('.onboarding-content');
  screen.scrollTop = 70; content.scrollTop = 35; animations = [];
  swipe(4, 28);
  expect(page().querySelector('main')).toBe(screen);
  expect(screen.querySelector('.onboarding-content')).toBe(content);
  expect(screen.scrollTop).toBe(70); expect(content.scrollTop).toBe(35);
  expect(content.style.transform).toBe(''); expect(screen.style.opacity).toBe('');
  expect(document.querySelector('[data-swipe-parent]')).toBeNull();
  expect(animations).toHaveLength(0);
});
it('uses full-page motion at every later question and keeps the existing Forward direction distinct from Back', () => {
  const renderStep = step => act(() => root.render(<FirstRunStepMotion step={step}><main className="onboarding"><h1>Question {step}</h1><div data-swipe-back-content><input defaultValue="Answer"/></div></main></FirstRunStepMotion>));
  renderStep(0);
  for (let step = 1; step <= 9; step++) {
    renderStep(step); settle();
    const screen = host.querySelector('main'), input = screen.querySelector('input'), motion = pageBackMotion(screen);
    motion.render(195, 0);
    act(() => vi.advanceTimersByTime(1)); expect(screen.style.transform).toBe('translate3d(195px,0,0)');
    expect(document.querySelector('[data-swipe-parent] h1').textContent).toBe(`Question ${step - 1}`);
    motion.render(-195, 0);
    act(() => vi.advanceTimersByTime(1)); expect(screen.style.transform).toBe('translate3d(-195px,0,0)');
    expect(document.querySelector('[data-swipe-parent]').style.visibility).toBe('hidden');
    motion.render(0, 100); motion.clear();
    expect(screen.querySelector('input')).toBe(input);
    expect(screen.firstElementChild.style.transform).toBe('');
    expect(document.querySelector('[data-swipe-parent]')).toBeNull();
  }
});
it('keeps later-question Back immediate under reduced motion and disabled in a normal browser tab', () => {
  click('BUILD MY PLAN'); settle(); click('Age range'); click('18–29'); click('CONTINUE'); settle();
  standalone = false; swipe(); expect(page().querySelector('.onboarding-goal')).not.toBeNull();
  standalone = true; reduced = true; animations = []; swipe();
  expect(page().querySelector('.onboarding-personal')).not.toBeNull();
  expect(animations).toHaveLength(0); expect(document.querySelector('[data-swipe-parent]')).toBeNull();
});
it('blocks Restore Back and edge dismissal during parsing and the critical restore write', async () => {
  let finishParse, finishRestore;
  backup.parseBackupArchive.mockReturnValue(new Promise(resolve => { finishParse = resolve; }));
  backup.commitPreparedRestore.mockReturnValue(new Promise(resolve => { finishRestore = resolve; }));
  click('Restore'); settle(); const input = page().querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [new File(['fixture'], 'review.zip')] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(button('Back to start').disabled).toBe(true); swipe(); expect(page().dataset.firstRunPage).toBe('restore');
  await act(async () => finishParse({ manifest: { createdAt: new Date().toISOString(), counts: { workouts: 0, workoutPhotos: 0 } }, state }));
  expect(button('Back to start').disabled).toBe(false);
  await act(async () => button('RESTORE & REPLACE').click());
  expect(button('Back to start').disabled).toBe(true); swipe(); expect(page().dataset.firstRunPage).toBe('restore');
  await act(async () => finishRestore(state)); expect(backup.commitPreparedRestore).toHaveBeenCalledOnce(); expect(page().textContent).toContain('ROOK has been restored.');
});

it.each(['program', 'training', 'preferences', 'data'])('Profile %s uses the same physical stack for tap Back and one edge pop', area => {
  const update = vi.fn();
  function ProfileHarness() { useSemanticSwipeBack(); return <Profile state={state} update={update} setDetail={() => {}}/>; }
  act(() => root.render(<ProfileHarness/>));
  const open = () => { act(() => host.querySelector(`[data-profile-area="${area}"]`).click()); settle(); };
  open(); animations = [];
  act(() => host.querySelector('[aria-label="Back to Profile"]').click());
  expect(animations[0].frames).toEqual([{ transform: 'translate3d(0px,0,0)' }, { transform: 'translate3d(390px,0,0)' }]);
  expect(animations.every(a => a.frames.every(frame => frame.opacity === undefined))).toBe(true);
  settle(); open(); animations = [];
  const screen = host.querySelector('.profile-management-screen');
  touch('touchstart', 4, 200, screen); touch('touchmove', 200, 200, screen);
  act(() => vi.advanceTimersByTime(1));
  expect(screen.style.transform).toBe('translate3d(196px,0,0)'); expect(screen.style.opacity).toBe('1');
  touch('touchend', 200, 200, screen); settle();
  expect(host.querySelector('.profile-management-screen')).toBeNull();
  expect(animations).toHaveLength(0); expect(update).not.toHaveBeenCalled();
});
