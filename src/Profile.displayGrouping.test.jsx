import React, {act, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {BottomNav, Detail, ModalLayer, Profile, SheetHeader} from './App.jsx';
import {PersonalThemesProvider} from './PersonalThemesContext.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {deserializeState, startWorkout, STORAGE_KEY} from './domain.js';
import {useDurableAction} from './useDurableAction.js';
import {readPersonalThemePreference, savePersonalThemePreference} from './personalThemePreference.js';
import {useAnimationClock} from './testAnimationClock.js';
import {THEME_DISCOVERY_KEY, readSeenThemeReleases} from './themeDiscovery.js';
import {PERSONAL_THEME_PREFERENCE} from './personalThemePreference.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, current, writes, details, navigate, standalone;
const tick = async (ms = 300) => act(async () => vi.advanceTimersByTimeAsync(ms));
const click = async node => {expect(node).toBeTruthy(); act(() => node.focus?.()); await act(async () => node.click()); await tick();};
const row = label => [...host.querySelectorAll('.profile-screen button.list-row')].find(button => button.querySelector('strong')?.textContent === label);
const open = area => click(host.querySelector(`[data-profile-area="${area}"]`));
const screen = () => host.querySelector('.profile-screen');
const title = () => host.querySelector('.profile-subpage-header strong')?.textContent;
beforeEach(() => {
  useAnimationClock(); standalone = true; writes = vi.fn(); details = vi.fn(); navigate = vi.fn();
  vi.stubGlobal('matchMedia', query => ({matches: query.includes('standalone') ? standalone : false, addEventListener() {}, removeEventListener() {}}));
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({left: 0, top: 0, width: 390, height: 700, right: 390, bottom: 700});
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {configurable: true, value: vi.fn(function(options) {this.scrollTop = options.top;})});
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {configurable: true, value: vi.fn()});
  localStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); await tick(32); host.remove();
  localStorage.clear();
  delete HTMLElement.prototype.scrollTo; delete HTMLElement.prototype.scrollIntoView;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

async function mount(initial = createReturningUserFixture(0), {sync = {state: 'not-configured', category: 'rollout-off'}, persist = false} = {}) {
  function Harness() {
    const [state, setState] = useState(initial), [detail, setDetail] = useState(null), background = useRef(null);
    current = state;
    const durable = useDurableAction(state, fn => setState(previous => {const next = fn(previous); writes(next); return next;}));
    const update = fn => persist ? durable.commit(previous => fn(structuredClone(previous)))
      : setState(previous => {const next = fn(structuredClone(previous)); writes(next); return next;});
    const requestDetail = next => {details(next); setDetail(next);};
    return <PersonalThemesProvider Modal={ModalLayer} Header={SheetHeader}><div className="app-shell">
      <div ref={background} className="app-content">
        <Profile state={state} update={update} setDetail={requestDetail} setPage={navigate} accountSync={sync}/>
        {!detail && <BottomNav page="profile" setPage={navigate}/>}
      </div>
      {detail && <ModalLayer backgroundRef={background} close={() => setDetail(null)}>
        <Detail detail={detail} state={state} update={update} setDetail={requestDetail} setPage={navigate}/>
      </ModalLayer>}
    </div></PersonalThemesProvider>;
  }
  await act(async () => root.render(<Harness/>)); await tick();
}

it('consolidates four unchanged destinations under Settings while keeping contextual sections separate', async () => {
  await mount();
  const groups = [...host.querySelectorAll('.profile-manage')];
  expect(groups.map(group => group.getAttribute('aria-label'))).toEqual(['Settings']);
  expect(groups[0].querySelector('.eyebrow').textContent).toBe('SETTINGS');
  expect(host.querySelector('.profile-program-entry .eyebrow').textContent).toBe('CURRENT TRAINING');
  expect(groups.map(group => [...group.querySelectorAll('[data-profile-area]')].map(button => button.dataset.profileArea)))
    .toEqual([['training', 'preferences', 'display', 'data']]);
  expect(groups[0].querySelectorAll('.rook-navigation-chevron')).toHaveLength(4);
  expect(groups[0].textContent).toContain('Workout preferences');
  expect(host.querySelectorAll('[data-profile-area="display"]')).toHaveLength(1);
  expect(host.querySelectorAll('.profile-current-program[data-profile-area="program"]')).toHaveLength(1);
  expect(host.querySelector('.account-sync-panel')).not.toBeNull();
  expect(groups[0].querySelector('.account-sync-panel')).toBeNull();
  expect(writes).not.toHaveBeenCalled(); expect(details).not.toHaveBeenCalled();
});

it('guides new-theme discovery through the real navigation path and acknowledges only the visible picker', async () => {
  vi.setSystemTime(new Date('2026-10-19T12:00:00'));
  savePersonalThemePreference({basePalette:'ocean',appearance:'dark'});
  const stored=localStorage.getItem(PERSONAL_THEME_PREFERENCE);
  await mount();
  expect(host.querySelector('[aria-label="PROFILE"][aria-describedby] .theme-new-dot')).not.toBeNull();
  expect(host.querySelector('[data-profile-area="display"] .theme-new-badge')).not.toBeNull();
  await open('display');expect(row('Appearance').querySelector('.theme-new-badge')).not.toBeNull();
  expect(readSeenThemeReleases().size).toBe(0);
  await click(row('Appearance'));
  const choose=[...host.querySelectorAll('button')].find(node=>node.querySelector('strong')?.textContent==='Choose a theme');
  expect(choose.querySelector('.theme-new-badge')).not.toBeNull();
  expect(readSeenThemeReleases().size).toBe(0);
  await click(choose);
  const studio=document.querySelector('.pro-theme-studio');
  expect(studio.querySelector('[aria-label="Halloween"] .theme-new-badge')).not.toBeNull();
  expect(studio.querySelector('[aria-label="Christmas"]')).toBeNull();
  expect(readSeenThemeReleases().size).toBe(7);expect(readSeenThemeReleases().has('season:halloween:v1:2026')).toBe(true);
  expect(localStorage.getItem(PERSONAL_THEME_PREFERENCE)).toBe(stored);expect(writes).not.toHaveBeenCalled();
  await click([...studio.querySelectorAll('button')].find(node=>node.textContent==='Cancel'));
  expect(host.querySelector('.theme-new-dot')).toBeNull();
  expect(localStorage.getItem(PERSONAL_THEME_PREFERENCE)).toBe(stored);
  await act(async()=>root.unmount());root=createRoot(host);await mount();
  expect(host.querySelector('.theme-new-badge')).toBeNull();expect(host.querySelector('.theme-new-dot')).toBeNull();
});

it('refreshes new-season discovery after midnight, foreground and next year without re-announcing seen occurrences', async () => {
  vi.setSystemTime(new Date('2026-09-30T23:59:59'));await mount();
  expect(host.querySelector('.theme-new-dot')).toBeNull();
  await tick(1100);expect(host.querySelector('.theme-new-dot')).not.toBeNull();
  localStorage.setItem(THEME_DISCOVERY_KEY,JSON.stringify(['season:halloween:v1:2026']));
  await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:THEME_DISCOVERY_KEY})));
  expect(host.querySelector('.theme-new-dot')).toBeNull();
  localStorage.setItem(THEME_DISCOVERY_KEY,JSON.stringify(['season:halloween:v1:2026',...['forest','champagne','ocean','slate','plum','terracotta'].map(id=>`palette:${id}:v1`)]));
  vi.setSystemTime(new Date('2027-10-01T12:00:00'));
  await act(async()=>window.dispatchEvent(new Event('pageshow')));
  expect(host.querySelector('.theme-new-dot')).not.toBeNull();
  expect(host.querySelector('[data-profile-area="display"] .theme-new-badge').textContent).toContain('Back');
  vi.setSystemTime(new Date('2027-11-03T12:00:00'));
  await act(async()=>document.dispatchEvent(new Event('visibilitychange')));
  expect(host.querySelector('.theme-new-dot')).toBeNull();expect(writes).not.toHaveBeenCalled();
});

it.each(['no-plan','freestyle','saved-first','imported','manual','generated'])('keeps the %s training summary and canonical row navigation', async kind => {
  const state=createReturningUserFixture(0);
  if(['no-plan','freestyle','saved-first'].includes(kind)) {
    state.program=null;state.profile.preferredTrainingStyle=kind==='saved-first'?'own-workouts':'freestyle';
  } else if(kind==='imported')state.program.source='imported';
  else if(kind==='manual')state.program.source='manual';
  const before=structuredClone(state);await mount(state);
  expect([...host.querySelectorAll('.profile-manage [data-profile-area]')].map(button => button.dataset.profileArea))
    .toEqual(['training', 'preferences', 'display', 'data']);
  const program=host.querySelector('.profile-program-entry');
  expect(program.querySelector('.eyebrow').textContent).toBe('CURRENT TRAINING');
  expect(program.querySelector('p').textContent).toBeTruthy();
  if(!state.program)expect(program.querySelector('h2').textContent).toBe('No fixed plan');
  await open('program');expect(title()).toBe('Program');expect(current).toEqual(before);expect(writes).not.toHaveBeenCalled();
});

it.each([
  ['training', 'Training setup'], ['preferences', 'Workout preferences'],
  ['display', 'Display'], ['data', 'Data & backup'],
])('Settings row %s opens and returns through its existing destination without domain writes', async (area, heading) => {
  await mount(); const before = structuredClone(current);
  await open(area); expect(title()).toBe(heading);
  await click(host.querySelector('[aria-label="Back to Profile"]'));
  expect(host.querySelector('.profile-manage').getAttribute('aria-label')).toBe('Settings');
  expect(host.querySelectorAll('.profile-manage [data-profile-area]')).toHaveLength(4);
  expect(current).toEqual(before); expect(writes).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
});

it.each([true, false].flatMap(complete => [
  ['local', {state: 'offline', linked: false, canSecure: false}],
  ['synced', {state: 'synced', linked: true, pendingCount: 0, email: 'long.training.profile.account@example.test', lastSuccessAt: '2026-10-14T10:00:00Z'}],
  ['unavailable', {state: 'auth-unavailable', linked: false, canSecure: false}],
  ['disabled', {state: 'not-configured', category: 'rollout-off'}],
].map(([name, sync]) => [complete, name, sync])))('profile complete=%s, account=%s keeps optional content and Settings independent', async (complete, name, sync) => {
  const initial = createReturningUserFixture(0); initial.profile.ageRange = complete ? '25–34' : '';
  await mount(initial, {sync});
  expect(host.querySelectorAll('.complete-profile')).toHaveLength(complete ? 0 : 1);
  expect(host.querySelectorAll('.profile-manage')).toHaveLength(1);
  expect(host.querySelector('.profile-manage').querySelectorAll('[data-profile-area]')).toHaveLength(4);
  const account = host.querySelector('.account-sync-panel');
  expect(account.textContent).toContain('ACCOUNT & SYNC');
  if (name === 'synced') {
    expect(account.textContent).toContain(sync.email); expect(account.textContent).toContain('Synced');
    expect(account.textContent).toContain('Workout photos stay on this device; cloud sync does not include them.');
  }
  expect(current).toEqual(initial); expect(writes).not.toHaveBeenCalled();
});

it('a setting changed through the existing Display route survives back navigation and canonical storage reload', async () => {
  const initial = deserializeState(JSON.stringify(createReturningUserFixture(0)), {strict: true}); initial.profile.showExerciseImages = true;
  await mount(initial, {persist: true}); const before = structuredClone(current);
  await open('display'); await click(row('Appearance'));
  await click(host.querySelector('[role="switch"][aria-label="Exercise illustrations"]'));
  await click(host.querySelector('[aria-label="Close Appearance"]'));
  await click(host.querySelector('[aria-label="Back to Profile"]'));
  expect(host.querySelector('[data-profile-area="display"] small').textContent).toContain('Illustrations off');
  const restored = deserializeState(localStorage.getItem(STORAGE_KEY), {strict: true});
  expect(restored.profile.showExerciseImages).toBe(false);
  expect(restored.program).toEqual(before.program); expect(restored.workouts).toEqual(before.workouts);
  await act(async () => root.unmount()); root = createRoot(host);
  await mount(restored, {persist: true});
  expect(host.querySelector('[data-profile-area="display"] small').textContent).toContain('Illustrations off');
  await open('display'); await click(row('Appearance'));
  expect(host.querySelector('[role="switch"][aria-label="Exercise illustrations"]').checked).toBe(false);
});

it('Workout preferences retains training and logging callbacks while Display owns visual/device controls', async () => {
  await mount(); const before = structuredClone(current);
  await open('preferences'); expect(title()).toBe('Workout preferences');
  expect(host.querySelector('.profile-training-style')).not.toBeNull(); expect(row('Logging & increments')).toBeTruthy();
  expect(row('Appearance')).toBeUndefined(); expect(host.querySelector('.standalone-zoom-preference')).toBeNull();
  await click(row('Logging & increments')); expect(details).toHaveBeenLastCalledWith('logging');
  await click(host.querySelector('[aria-label="Close Logging & increments"]') || host.querySelector('.modal-layer .detail-header-close'));
  await click(host.querySelector('[aria-label="Back to Profile"]')); await open('display');
  expect(title()).toBe('Display'); expect(row('Appearance')).toBeTruthy(); expect(row('Logging & increments')).toBeUndefined();
  expect(host.querySelector('.profile-training-style')).toBeNull(); expect(host.querySelectorAll('.standalone-zoom-preference')).toHaveLength(1);
  expect(current).toEqual(before); expect(writes).not.toHaveBeenCalled();
});

it('Display uses saved Personal Theme and illustration state in its root and child summaries', async () => {
  savePersonalThemePreference({basePalette: 'ocean', appearance: 'dark'});
  const initial = createReturningUserFixture(0); initial.profile.showExerciseImages = false;
  await mount(initial); const summary = host.querySelector('[data-profile-area="display"] small').textContent;
  expect(summary).toContain('Ocean'); expect(summary).toContain('Dark'); expect(summary).toContain('Illustrations off');
  await open('display'); expect(row('Appearance').querySelector('small').textContent).toBe(summary);
  expect(host.querySelectorAll('.profile-screen button.list-row').length).toBe(1);
  expect(current).toEqual(initial); expect(writes).not.toHaveBeenCalled();
});

it('opens the canonical Appearance modal and closes back to Display without replacing Profile state', async () => {
  await mount(); await open('display'); const before = structuredClone(current), display = screen(), trigger = row('Appearance');
  await click(trigger);
  expect(details).toHaveBeenCalledExactlyOnceWith('appearance');
  expect(host.querySelectorAll('.appearance-screen')).toHaveLength(1);
  expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(host.querySelector('.app-content').inert).toBe(true);
  await click(host.querySelector('[aria-label="Close Appearance"]')); await tick(32);
  expect(host.querySelector('.modal-layer')).toBeNull(); expect(screen()).toBe(display); expect(title()).toBe('Display');
  expect(document.activeElement).toBe(trigger); expect(host.querySelector('.app-content').inert).toBe(false);
  expect(current).toEqual(before); expect(writes).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
});

it('the existing illustration switch changes only its profile flag and refreshes both Display summaries', async () => {
  const initial = createReturningUserFixture(0); initial.profile.showExerciseImages = true;
  initial.activeWorkout = startWorkout(initial, initial.program.days[0]);
  initial.activeWorkout.rest = {endsAt: Date.now() + 90000, pending: false};
  await mount(initial); const before = structuredClone(current);
  await open('display'); await click(row('Appearance'));
  await click(host.querySelector('[role="switch"][aria-label="Exercise illustrations"]'));
  const expected = structuredClone(before); expected.profile.showExerciseImages = false;
  expect(current).toEqual(expected); expect(writes).toHaveBeenCalledOnce();
  await click(host.querySelector('[aria-label="Close Appearance"]'));
  expect(row('Appearance').querySelector('small').textContent).toContain('Illustrations off');
  await click(host.querySelector('[aria-label="Back to Profile"]'));
  expect(host.querySelector('[data-profile-area="display"] small').textContent).toContain('Illustrations off');
  expect(current.activeWorkout).toEqual(before.activeWorkout); expect(current.workouts).toEqual(before.workouts);
});

it('canonical Personal Themes apply refreshes Display without modifying training data or adding another Appearance route', async () => {
  savePersonalThemePreference({basePalette: 'ocean', appearance: 'dark'});
  await mount(); const before = structuredClone(current);
  await open('display'); await click(row('Appearance'));
  await click(host.querySelector('.appearance-palettes-group button'));
  const studio = document.querySelector('.pro-theme-studio'); expect(studio).not.toBeNull();
  expect(host.querySelectorAll('.appearance-screen')).toHaveLength(1);
  await click(studio.querySelector('[aria-label="Plum"]'));
  await click([...studio.querySelectorAll('button')].find(button => button.textContent === 'Apply theme'));
  expect(document.querySelector('.pro-theme-studio')).toBeNull(); expect(readPersonalThemePreference().basePalette).toBe('plum');
  await click(host.querySelector('[aria-label="Close Appearance"]'));
  expect(row('Appearance').querySelector('small').textContent).toContain('Plum');
  await click(host.querySelector('[aria-label="Back to Profile"]'));
  expect(host.querySelector('[data-profile-area="display"] small').textContent).toContain('Plum');
  expect(current).toEqual(before); expect(writes).not.toHaveBeenCalled(); expect(details).toHaveBeenCalledExactlyOnceWith('appearance');
});

it.each(['Back', 'Escape', 'active Profile tab'])('%s returns Display directly to the same canonical Profile root without domain writes', async action => {
  const initial = createReturningUserFixture(0); initial.activeWorkout = startWorkout(initial, initial.program.days[0]);
  initial.activeWorkout.rest = {endsAt: Date.now() + 90000, pending: false};
  await mount(initial); const before = structuredClone(current); await open('display');
  if (action === 'Back') await click(host.querySelector('[aria-label="Back to Profile"]'));
  else if (action === 'Escape') {await act(async () => screen().dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}))); await tick();}
  else await click(host.querySelector('.bottom-nav [aria-label^="PROFILE"]'));
  expect(host.querySelector('.profile-hub h1').textContent).toBe('Training profile');
  expect(host.querySelector('.profile-management-screen')).toBeNull(); expect(host.querySelectorAll('[data-profile-area="display"]')).toHaveLength(1);
  expect(current).toEqual(before); expect(writes).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
});

it('Data & backup remains a separate unchanged destination after regrouping', async () => {
  await mount(); const before = structuredClone(current); await open('data');
  expect(title()).toBe('Data & backup'); expect(row('Back up ROOK')).toBeTruthy(); expect(row('Restore backup')).toBeTruthy();
  expect(row('Appearance')).toBeUndefined(); expect(host.querySelector('.standalone-zoom-preference')).toBeNull();
  expect(current).toEqual(before); expect(writes).not.toHaveBeenCalled();
});
