import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { AdjustTodaySheet, ModalLayer } from './App.jsx';
import * as domain from './domain.js';
import { hasMeaningfulEquipmentChange, todayEquipmentContext, toggleTodayEquipment } from './todayEquipmentSelection.js';
import { useAnimationClock } from './testAnimationClock.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, current, update, close, save;
function fixture() {
  const s = domain.blankState();
  Object.assign(s.profile, { onboardingComplete: true, environment: 'Commercial gym', equipment: ['full gym'],
    experience: 'Intermediate', goal: 'Build muscle', ageRange: '25–39', daysPerWeek: 2,
    availableDays: ['Mon', 'Thu'], sessionMinutes: 120, rirEnabled: true });
  s.gymProfiles = [{ id: 'main', name: 'Main Gym', equipment: ['full gym'] },
    { id: 'home', name: 'Home', equipment: ['dumbbells', 'barbell/rack/bench', 'cables'] }];
  s.defaultGymProfileId = 'main'; s.selectedDate = domain.isoDay(); s.selectedDay = 'Mon';
  const exercises = ['barbell-bench-press','barbell-row','machine-shoulder-press','cable-fly','lateral-raise'].map((id, i) => ({
    id: `entry-${id}`, exerciseId: id, programmingRole: i < 2 ? 'main' : 'accessory', requiredRole: i < 2,
    sets: [0,1,2].map(n => ({ id: `${id}-${n}`, weight: null, reps: 8, completed: false, rir: null })),
    repMin: 6, repMax: 10, targetRir: 2, restSeconds: 90, defaultIncrement: domain.exerciseCatalog[id].increment || 2.5,
  }));
  s.program = { id: 'program', version: 1, name: 'Upper / Lower', days: ['Mon','Thu'].map((weekday, i) => ({
    id: `day-${i}`, name: 'Upper A', weekday, type: 'workout', exercises: exercises.map(e => ({...structuredClone(e), id:`day-${i}-${e.id}`, sets:e.sets.map(set=>({...set,id:`day-${i}-${set.id}`}))})),
    estimatedMinutes: domain.estimateSessionMinutes(exercises),
  })) }; return s;
}
beforeEach(() => {
  useAnimationClock(); vi.setSystemTime(new Date('2026-10-12T12:00:00'));
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener(){}, removeEventListener(){} }));
  vi.stubGlobal('ResizeObserver', class { observe(){} disconnect(){} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = () => {}; HTMLElement.prototype.scrollIntoView = () => {};
  save = vi.spyOn(domain, 'saveState').mockReturnValue(true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  close = vi.fn(); update = vi.fn();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const click = el => act(() => el.click());
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text);
const input = text => [...host.querySelectorAll('input')].find(el => el.getAttribute('aria-label').startsWith(text));
const custom = () => click(input('Choose equipment'));
const check = label => click(input(label));
function mount(s = fixture(), modal = false) {
  function Harness() {
    const [state, setState] = useState(s); current = state;
    const change = fn => { update(fn); setState(prev => fn(structuredClone(prev))); };
    return modal ? <ModalLayer backgroundRef={{current:null}} close={close}>{dismiss => <AdjustTodaySheet state={state} update={change} close={dismiss}/>}</ModalLayer>
      : <AdjustTodaySheet state={state} update={change} close={close}/>;
  }
  act(() => root.render(<Harness/>));
  click([...host.querySelectorAll('.choice-row')].find(b => b.textContent.includes('Different equipment')));
}
const review = async () => { click(button('REVIEW CHANGES')); await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); };

it('initial effective saved gym is a radio selection and no-op review is disabled', () => {
  mount(); expect(input('Main Gym').type).toBe('radio'); expect(input('Main Gym').checked).toBe(true);
  expect(input('Choose equipment').checked).toBe(false); expect(button('REVIEW CHANGES').disabled).toBe(true);
  check('Main Gym'); expect(input('Main Gym').checked).toBe(true); expect(update).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
});
it('switches atomically both ways and repeating selected Custom is stable', () => {
  mount(); custom(); custom(); expect(input('Choose equipment').checked).toBe(true); expect(input('Main Gym').checked).toBe(false);
  expect(host.querySelectorAll('input[type=radio]:checked')).toHaveLength(1);
  check('Main Gym'); expect(input('Choose equipment').checked).toBe(false); expect(input('Main Gym').checked).toBe(true);
  expect(host.querySelectorAll('input[type=checkbox]')).toHaveLength(0);
});
it('Full gym is the canonical complete preset, visibly includes granular equipment and does not imply bodyweight-only', () => {
  mount(); custom(); expect(input('Full gym').checked).toBe(true);
  for (const label of ['Dumbbells','Cables','Machines','Barbell / rack / bench','Pull-up bar','Resistance bands']) {
    expect(input(label).checked).toBe(true); expect(input(label).disabled).toBe(true);
  }
  expect(input('Bodyweight only').checked).toBe(false); expect(input('Bodyweight only').disabled).toBe(false);
  expect(button('REVIEW CHANGES').disabled).toBe(true);
  check('Bodyweight only'); expect(input('Full gym').checked).toBe(false); expect(input('Dumbbells').checked).toBe(false);
});
it('custom rows are native whole-row multi-select controls with one mutation per label click and explicit empty validity', () => {
  mount(); custom(); check('Full gym'); expect(button('REVIEW CHANGES').disabled).toBe(true);
  expect(host.textContent).toContain('Choose at least one equipment option');
  click(input('Dumbbells').closest('label')); check('Cables');
  expect(input('Dumbbells').checked).toBe(true); expect(input('Cables').checked).toBe(true);
  expect(button('REVIEW CHANGES').disabled).toBe(false);
  check('Dumbbells'); expect(input('Dumbbells').checked).toBe(false); expect(input('Cables').checked).toBe(true);
  expect(update).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
});
it('change then revert to Full gym or the original saved gym restores no-op', () => {
  mount(); custom(); check('Full gym'); check('Dumbbells'); expect(button('REVIEW CHANGES').disabled).toBe(false);
  check('Full gym'); expect(button('REVIEW CHANGES').disabled).toBe(true);
  check('Home'); expect(button('REVIEW CHANGES').disabled).toBe(false); check('Main Gym'); expect(button('REVIEW CHANGES').disabled).toBe(true);
});
it('semantic comparison ignores order, duplicates, gym identity and implicit bodyweight but retains complete Full gym capabilities', () => {
  expect(hasMeaningfulEquipmentChange(['dumbbells','cables'], ['cables','dumbbells','cables'])).toBe(false);
  expect(hasMeaningfulEquipmentChange(['bodyweight only','dumbbells'], ['dumbbells'])).toBe(false);
  expect(hasMeaningfulEquipmentChange(['full gym'], ['full gym','cables'])).toBe(false);
  expect(hasMeaningfulEquipmentChange(['full gym'], [])).toBe(false);
  // Full gym also supports Bosu; selecting every granular option does not invent that capability.
  expect(hasMeaningfulEquipmentChange(['full gym'], ['dumbbells','cables','machines','barbell/rack/bench','pull-up bar','resistance bands'])).toBe(true);
  expect(toggleTodayEquipment(['cables','dumbbells'], 'full gym')).toEqual(['full gym']);
});
it('custom current context and current saved override initialize truthfully, while stale adjustments do not', () => {
  const s = fixture(); s.todayAdaptation = { date: domain.isoDay(), programDayId: 'day-0', temporaryEquipment: ['dumbbells'], gymProfileId: null };
  mount(s); expect(input('Choose equipment').checked).toBe(true); expect(input('Dumbbells').checked).toBe(true);
  expect(button('REVIEW CHANGES').disabled).toBe(true);
  expect(todayEquipmentContext({...s, todayAdaptation:{...s.todayAdaptation, date:'2026-10-11'}}).id).toBe('main');
  expect(todayEquipmentContext({...s, todayAdaptation:{...s.todayAdaptation, temporaryEquipment:s.gymProfiles[1].equipment, gymProfileId:'home'}}).id).toBe('home');
});
it('legacy states without a saved gym initialize a custom context without fabricating a valid empty equipment selection', () => {
  const s = fixture(); s.gymProfiles = []; s.defaultGymProfileId = null; s.profile.equipment = [];
  mount(s); expect(input('Choose equipment').checked).toBe(true); expect(button('REVIEW CHANGES').disabled).toBe(true);
});
it('review shows current and target delta; Apply persists only one-workout adjustment and leaves saved/default gyms and plan intact', async () => {
  const s = fixture(), original = structuredClone(s); mount(s); check('Home'); await review();
  const delta = host.querySelector('.adjust-equipment-delta'); expect(delta.textContent).toContain('CurrentMain Gym · Full gym');
  expect(delta.textContent).toContain('For this workoutHome · Dumbbells, Barbell / rack / bench, Cables');
  expect(host.textContent).toContain('WORKOUT PREVIEW');
  expect(host.textContent).not.toContain('KEEPING');
  expect(save).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  expect(button('USE THIS WORKOUT').disabled).toBe(false); click(button('USE THIS WORKOUT'));
  expect(current.todayAdaptation.gymProfileId).toBe('home'); expect(current.todayAdaptation.temporaryEquipment).toEqual(s.gymProfiles[1].equipment);
  expect(current.program).toEqual(original.program); expect(current.profile).toEqual(original.profile);
  expect(current.gymProfiles).toEqual(original.gymProfiles); expect(current.defaultGymProfileId).toBe('main');
  expect(current.activeWorkout).toBeNull(); expect(save).toHaveBeenCalledOnce(); expect(update).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
});
it('different equipment that already fits the workout produces a truthful non-applicable review', async () => {
  const s = fixture(); s.program.days[0].exercises = s.program.days[0].exercises.filter(e => ['barbell-bench-press','barbell-row','cable-fly','lateral-raise'].includes(e.exerciseId));
  mount(s); check('Home'); await review(); expect(host.textContent).toContain('All exercises already fit this equipment. No workout changes are needed.');
  expect(button('USE THIS WORKOUT').disabled).toBe(true); expect(update).not.toHaveBeenCalled();
});
it('a failed durable save keeps the original state and offers the existing explicit retry', async () => {
  mount(); check('Home'); await review(); save.mockReturnValueOnce(false); click(button('USE THIS WORKOUT'));
  expect(current.todayAdaptation).toBeNull(); expect(update).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Your original workout is unchanged'); click(button('TRY AGAIN'));
  expect(update).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
});
it('a real durable write and reload retain the one-off override and original gym', async () => {
  save.mockRestore(); const s=fixture(); expect(domain.validateProgram(s.program,null).valid).toBe(true);
  mount(s); check('Home'); await review(); click(button('USE THIS WORKOUT'));
  expect(update).toHaveBeenCalledOnce(); const loaded=domain.loadState();
  expect(loaded.todayAdaptation.gymProfileId).toBe('home'); expect(loaded.defaultGymProfileId).toBe('main');
  expect(loaded.profile.equipment).toEqual(['full gym']); expect(loaded.gymProfiles.find(g=>g.id==='main').equipment).toEqual(['full gym']);
});
it('Back from review preserves the draft; Back to mode and X never apply', async () => {
  mount(); custom(); check('Full gym'); check('Dumbbells'); check('Barbell / rack / bench'); check('Cables'); await review();
  click(host.querySelector('.detail-header-back')); expect(input('Cables').checked).toBe(true);
  expect(button('REVIEW CHANGES').disabled).toBe(false); click(host.querySelector('.detail-header-back'));
  expect(host.textContent).toContain('What changed today?'); click(host.querySelector('.detail-header-close'));
  expect(close).toHaveBeenCalledOnce(); expect(save).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it('canonical handle dismiss cancels a changed draft without applying it', async () => {
  mount(fixture(), true); custom(); check('Full gym'); check('Dumbbells');
  click(host.querySelector('.modal-drag-handle')); await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(close).toHaveBeenCalledOnce(); expect(save).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it('expanded equipment has one separator owner and no extra scroll container or new sticky footer', () => {
  mount(); custom(); const list = host.querySelector('.adjust-today-equipment-list');
  expect(list.previousElementSibling).toBe(host.querySelector('.adjust-gym-picker'));
  expect(host.querySelector('.sheet-action-footer')).toBeNull();
  const css = readFileSync('src/todayEquipmentSelection.css', 'utf8');
  expect(css).toMatch(/\.adjust-today-sheet \.adjust-today-equipment-list\s*\{[^}]*border-top: 0; margin-top: 0;/);
  expect(css).not.toMatch(/overflow(?:-y)?:\s*(?:auto|scroll)/);
  expect(css).toContain('.adjust-equipment-item > input:disabled { opacity: 0; }');
  expect(css).toContain('var(--rook-control-border, var(--rook-border-strong, var(--rook-secondary)))');
});
