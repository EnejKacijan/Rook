import React, {act, createRef} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, expect, it, vi} from 'vitest';
import {PlanEditor} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; host?.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent.trim() === text || node.getAttribute('aria-label') === text);
const click = async text => act(async () => button(text).click());
const cards = () => [...host.querySelectorAll('.plan-editor-exercise')];
const event = (target, type, fields = {}) => { const e = new Event(type, {bubbles:true,cancelable:true}); Object.assign(e,fields); target.dispatchEvent(e); return e; };
async function mount({mode = 'review', generatedAcceptance = true, pair = false} = {}) {
  vi.stubGlobal('matchMedia', () => ({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('scrollTo', () => {});
  const state = createReturningUserFixture(0), source = structuredClone(state.program);
  source.days = source.days.slice(0,2);
  source.days.forEach(day => { day.exercises = day.exercises.slice(0,3); });
  if (pair) source.days[0].exercises.slice(0,2).forEach(ex => { ex.supersetId = 'qa-pair'; });
  const saved = vi.fn(), cancelled = vi.fn(), navigation = createRef();
  host = document.createElement('main'); host.className = 'screen'; document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<PlanEditor source={source} profile={state.profile} mode={mode} generatedAcceptance={generatedAcceptance}
    onSave={saved} onCancel={cancelled} previewNavigationRef={navigation} />));
  return {source,saved,cancelled,navigation};
}
it('generated preview starts without reorder activators; explicit mode is not a live drag', async () => {
  const {saved} = await mount();
  expect(host.querySelector('[data-reorder-kind]')).toBeNull();
  expect(host.textContent).not.toContain('Press and hold');
  expect(host.querySelector('.plan-editor-summary').tagName).toBe('BUTTON');
  expect(button('USE THIS PLAN')).toBeTruthy();
  await click('Reorder');
  expect(host.querySelector('.is-preview-reorder')).not.toBeNull();
  expect(host.querySelector('.is-reordering')).toBeNull();
  expect(host.querySelector('.plan-editor-summary').tagName).toBe('DIV');
  expect(host.querySelector('.plan-editor-summary [data-reorder-kind]')).toBeNull();
  expect(host.querySelector('.plan-editor-summary .plan-review-illustration')).toBeNull();
  expect(host.querySelector('.plan-editor-summary-action')).toBeNull();
  expect(host.querySelector('.plan-exercise-drag-handle').getAttribute('aria-label')).toContain(' in ');
  expect(button('USE THIS PLAN')).toBeUndefined();
  expect(button('Reorder')).toBeUndefined();
  expect(host.querySelector('.plan-preview-mode-row [role="status"]').textContent).toBe('Reordering');
  expect([...host.querySelectorAll('button')].filter(b => /Done/.test(b.textContent))).toHaveLength(1);
  expect(button('Done reordering').closest('.sheet-action-footer')).not.toBeNull();
  await click('Done reordering');
  expect(saved).not.toHaveBeenCalled();
  expect(host.querySelector('[data-reorder-kind]')).toBeNull();
  expect(host.querySelector('.plan-editor-summary').tagName).toBe('BUTTON');
  expect(host.querySelector('.plan-preview-mode-status')).toBeNull();
  expect(button('Reorder')).toBe(document.activeElement);
  expect(button('USE THIS PLAN')).toBeTruthy();
});
it('Done retains moves and expanded input DOM; only Apply emits the reordered draft', async () => {
  const {source,saved} = await mount(); const before = JSON.stringify(source);
  await act(async () => cards()[0].querySelector('.plan-editor-summary').click());
  const expanded = cards()[0].querySelector('.plan-editor-fields'), input = expanded.querySelector('input');
  const first = cards()[0].id;
  await click('Reorder');
  await act(async () => event(host.querySelector('.plan-exercise-drag-handle'),'keydown',{altKey:true,key:'ArrowDown'}));
  expect(cards()[1].id).toBe(first);
  expect(cards()[1].querySelector('.plan-editor-fields')).toBe(expanded);
  expect(expanded.querySelector('input')).toBe(input);
  await click('Done reordering');
  expect(cards()[1].classList.contains('is-expanded')).toBe(true);
  expect(saved).not.toHaveBeenCalled(); expect(JSON.stringify(source)).toBe(before);
  await click('USE THIS PLAN');
  const result = saved.mock.calls[0][0];
  expect(result.days[0].exercises.map(ex => ex.id)).toEqual([source.days[0].exercises[1].id,source.days[0].exercises[0].id,source.days[0].exercises[2].id]);
  for (const day of source.days) for (const ex of day.exercises) expect(result.days.flatMap(d=>d.exercises).find(e=>e.id===ex.id)).toEqual(ex);
  expect(result.previewReordering).toBeUndefined();
});
it('header Back entry and footer Back leave mode first without navigating or applying', async () => {
  const {navigation,cancelled,saved} = await mount();
  await click('Reorder'); await act(async () => navigation.current.back());
  expect(host.querySelector('.is-preview-reorder')).toBeNull(); expect(cancelled).not.toHaveBeenCalled();
  await click('Reorder'); await click('Back'); expect(cancelled).not.toHaveBeenCalled();
  await click('Back'); expect(cancelled).toHaveBeenCalledTimes(1); expect(saved).not.toHaveBeenCalled();
});
it.each(['touchcancel','pointercancel','Escape','Done reordering','Back'])('cancels active workout gesture via %s, without committing its preview', async reason => {
  const {source,saved} = await mount(); await click('Reorder');
  const handle = host.querySelector('.plan-workout-drag-surface'), point = {identifier:5,clientX:30,clientY:200};
  await act(async () => event(handle,'touchstart',{touches:[point]}));
  expect(host.querySelector('.is-week-reordering')).not.toBeNull();
  if (reason === 'Done reordering' || reason === 'Back') await click(reason);
  else await act(async () => reason === 'Escape' ? event(window,'keydown',{key:reason}) : event(window,reason,{pointerType:'touch',changedTouches:[point],touches:[]}));
  expect(host.querySelector('.is-reordering,.is-week-reordering,.reorder-live-source,.plan-reorder-preview')).toBeNull();
  const nextMove = event(host,'touchmove',{touches:[{...point,clientY:100}]}); expect(nextMove.defaultPrevented).toBe(false);
  expect(host.querySelector('.plan-editor').style.minHeight).toBe('');
  expect([...host.querySelectorAll('.import-day')].map(d=>d.dataset.dayId)).toEqual(source.days.map(d=>d.id));
  expect(saved).not.toHaveBeenCalled();
  expect(!!host.querySelector('.is-preview-reorder')).toBe(!['Done reordering','Back'].includes(reason));
});
it('repeated exercise moves preserve atomic superset order and workout moves preserve selected slots', async () => {
  const {source,saved} = await mount({pair:true}); await click('Reorder');
  await act(async () => event(host.querySelector('.plan-exercise-drag-handle'),'keydown',{altKey:true,key:'ArrowDown'}));
  expect(cards().slice(0,3).map(c=>c.id)).toEqual([2,0,1].map(i=>`import-exercise-${source.days[0].exercises[i].id}`));
  await act(async () => event(host.querySelector('.plan-workout-drag-surface'),'keydown',{altKey:true,key:'ArrowDown'}));
  await click('Done reordering'); await click('USE THIS PLAN');
  const days = saved.mock.calls[0][0].days;
  expect(days.map(d=>d.weekday)).toEqual(source.days.map(d=>d.weekday));
  expect(days.map(d=>d.id)).toEqual([...source.days].reverse().map(d=>d.id));
  expect(days[1].exercises.slice(1).map(e=>e.supersetId)).toEqual(['qa-pair','qa-pair']);
});
it.each(['scratch','edit','import'])('does not opt %s into generated-preview mode', async mode => {
  await mount({mode,generatedAcceptance:false}); expect(button('Reorder')).toBeUndefined();
  if (mode !== 'import') expect(host.querySelector('.plan-exercise-drag-handle')).not.toBeNull();
});
it('a different generated source never inherits reorder mode', async () => {
  const {source,saved,cancelled} = await mount(); await click('Reorder');
  const replacement={...source,id:'fresh-generated-preview'};
  await act(async () => root.render(<PlanEditor source={replacement} profile={createReturningUserFixture(0).profile}
    generatedAcceptance onSave={saved} onCancel={cancelled} />));
  expect(host.querySelector('.is-preview-reorder,[data-reorder-kind]')).toBeNull();
  expect(button('USE THIS PLAN')).toBeTruthy(); expect(saved).not.toHaveBeenCalled();
});
it('a malformed superset stays locked in explicit mode', async () => {
  const {source} = await mount(); const broken=structuredClone(source);broken.id='broken-pair';
  broken.days[0].exercises[0].supersetId='not-adjacent';broken.days[0].exercises[2].supersetId='not-adjacent';
  await act(async () => root.render(<PlanEditor source={broken} profile={createReturningUserFixture(0).profile}
    generatedAcceptance onSave={()=>{}} onCancel={()=>{}} />));
  await click('Reorder');
  expect(cards()[0].querySelector('[data-reorder-kind]')).toBeNull();
  expect(cards()[2].querySelector('[data-reorder-kind]')).toBeNull();
  expect(cards()[1].querySelector('[data-reorder-kind]')).not.toBeNull();
});
