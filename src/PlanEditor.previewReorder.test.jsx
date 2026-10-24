import React, {act, createRef} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, expect, it, vi} from 'vitest';
import {PlanEditor} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; host?.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent.trim() === text || node.getAttribute('aria-label') === text);
const click = async text => act(async () => button(text).click());
const cards = () => [...host.querySelectorAll('.plan-editor-exercise')];
const event = (target, type, fields = {}) => { const e = new Event(type, {bubbles:true,cancelable:true}); Object.assign(e,fields); target.dispatchEvent(e); return e; };
async function mount({mode = 'review', generatedAcceptance = true, pair = false} = {}) {
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});vi.stubGlobal('matchMedia', () => ({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('scrollTo', () => {});
  const state = createReturningUserFixture(0), source = structuredClone(state.program);
  state.profile.showExerciseImages = true;
  source.days = source.days.slice(0,2);
  source.days.forEach(day => { day.exercises = day.exercises.slice(0,3); });
  if (pair) source.days[0].exercises.slice(0,2).forEach(ex => { ex.supersetId = 'qa-pair'; });
  const saved = vi.fn(), cancelled = vi.fn(), navigation = createRef();
  host = document.createElement('main'); host.className = 'screen'; document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<PlanEditor source={source} profile={state.profile} mode={mode} generatedAcceptance={generatedAcceptance}
    onSave={saved} onCancel={cancelled} previewNavigationRef={navigation} />));
  return {source,saved,cancelled,navigation};
}
it('generated preview exposes handles alongside editable summaries without a separate reorder mode', async () => {
  const {saved} = await mount();
  expect(host.querySelector('[data-reorder-kind="workout"]')).not.toBeNull();
  expect(host.querySelector('[data-reorder-kind="exercise"]')).not.toBeNull();
  expect(host.textContent).not.toContain('Press and hold');
  expect(host.querySelector('.plan-editor-summary').tagName).toBe('BUTTON');
  expect(button('USE THIS PLAN')).toBeTruthy();
  expect(button('USE THIS PLAN').disabled).toBe(false);
  expect(button('Reorder')).toBeUndefined();
  expect(button('Done reordering')).toBeUndefined();
  expect(host.querySelector('.is-reordering')).toBeNull();
  expect(host.querySelector('.plan-editor-summary [data-reorder-kind]')).toBeNull();
  expect(host.querySelector('.plan-editor-summary .plan-review-illustration')).not.toBeNull();
  expect(host.querySelector('.plan-editor-summary-action')).not.toBeNull();
  expect(host.querySelector('.plan-exercise-drag-handle').getAttribute('aria-label')).toContain(' in ');
  expect(host.querySelector('#plan-reorder-help').textContent).toContain('Drag handles to reorder.');
  expect(saved).not.toHaveBeenCalled();
});
it('direct moves retain expanded input DOM and handle focus; only Apply emits the reordered draft', async () => {
  const {source,saved} = await mount(); const before = JSON.stringify(source);
  await act(async () => cards()[0].querySelector('.plan-editor-summary').click());
  const expanded = cards()[0].querySelector('.plan-editor-fields'), input = expanded.querySelector('input');
  const first = cards()[0].id;
  const handle=host.querySelector('.plan-exercise-drag-handle');handle.focus();
  await act(async () => event(handle,'keydown',{altKey:true,key:'ArrowDown'}));
  expect(cards()[1].id).toBe(first);
  expect(cards()[1].querySelector('.plan-editor-fields')).toBe(expanded);
  expect(expanded.querySelector('input')).toBe(input);
  expect(document.activeElement).toBe(handle);
  expect(cards()[1].classList.contains('is-expanded')).toBe(true);
  expect(saved).not.toHaveBeenCalled(); expect(JSON.stringify(source)).toBe(before);
  await click('USE THIS PLAN');
  const result = saved.mock.calls[0][0];
  expect(result.days[0].exercises.map(ex => ex.id)).toEqual([source.days[0].exercises[1].id,source.days[0].exercises[0].id,source.days[0].exercises[2].id]);
  for (const day of source.days) for (const ex of day.exercises) expect(result.days.flatMap(d=>d.exercises).find(e=>e.id===ex.id)).toEqual(ex);
  expect(result.previewReordering).toBeUndefined();
});
it('Back outside a live drag uses existing navigation without an extra mode-exit step or applying', async () => {
  const {navigation,cancelled,saved} = await mount();
  await act(async () => navigation.current.back());
  expect(cancelled).toHaveBeenCalledTimes(1);
  await click('Back');expect(cancelled).toHaveBeenCalledTimes(2);expect(saved).not.toHaveBeenCalled();
});
it.each(['touchcancel','pointercancel','Escape','header Back','Back'])('cancels active workout gesture via %s, without committing or leaving the preview', async reason => {
  const {source,saved,cancelled,navigation} = await mount();
  const handle = host.querySelector('.plan-workout-drag-surface'), point = {identifier:5,clientX:30,clientY:200};
  await act(async () => event(handle,'touchstart',{touches:[point]}));
  expect(host.querySelector('.is-week-reordering')).toBeNull();
  await act(async () => vi.advanceTimersByTime(300));
  await act(async () => event(handle,'touchmove',{touches:[{...point,clientY:220}]}));
  expect(host.querySelector('.is-week-reordering')).not.toBeNull();
  expect(button('USE THIS PLAN').disabled).toBe(true);
  await click('USE THIS PLAN');expect(saved).not.toHaveBeenCalled();
  if (reason === 'header Back') await act(async()=>navigation.current.back());
  else if (reason === 'Back') await click('Back');
  else await act(async () => reason === 'Escape' ? event(window,'keydown',{key:reason}) : event(window,reason,{pointerType:'touch',changedTouches:[point],touches:[]}));
  expect(host.querySelector('.is-reordering,.is-week-reordering,.reorder-live-source,.plan-reorder-preview')).toBeNull();
  const nextMove = event(host,'touchmove',{touches:[{...point,clientY:100}]}); expect(nextMove.defaultPrevented).toBe(false);
  expect(host.querySelector('.plan-editor').style.minHeight).toBe('');
  expect([...host.querySelectorAll('.import-day')].map(d=>d.dataset.dayId)).toEqual(source.days.map(d=>d.id));
  expect(saved).not.toHaveBeenCalled();
  expect(cancelled).not.toHaveBeenCalled();expect(button('USE THIS PLAN').disabled).toBe(false);
  if(reason==='Back'||reason==='header Back')expect(document.activeElement).toBe(handle);
});
it('repeated exercise moves preserve atomic superset order and workout moves preserve selected slots', async () => {
  const {source,saved} = await mount({pair:true});
  await act(async () => event(host.querySelector('.plan-exercise-drag-handle'),'keydown',{altKey:true,key:'ArrowDown'}));
  expect(cards().slice(0,3).map(c=>c.id)).toEqual([2,0,1].map(i=>`import-exercise-${source.days[0].exercises[i].id}`));
  await act(async () => event(host.querySelector('.plan-workout-drag-surface'),'keydown',{altKey:true,key:'ArrowDown'}));
  await click('USE THIS PLAN');
  const days = saved.mock.calls[0][0].days;
  expect(days.map(d=>d.weekday)).toEqual(source.days.map(d=>d.weekday));
  expect(days.map(d=>d.id)).toEqual([...source.days].reverse().map(d=>d.id));
  expect(days[1].exercises.slice(1).map(e=>e.supersetId)).toEqual(['qa-pair','qa-pair']);
});
it.each(['scratch','edit','import'])('does not opt %s into generated-preview mode', async mode => {
  await mount({mode,generatedAcceptance:false}); expect(button('Reorder')).toBeUndefined();
  if (mode !== 'import') expect(host.querySelector('.plan-exercise-drag-handle')).not.toBeNull();
});
it('a different generated source resets the draft order without introducing a mode', async () => {
  const {source,saved,cancelled} = await mount();
  await act(async () => event(host.querySelector('.plan-exercise-drag-handle'),'keydown',{altKey:true,key:'ArrowDown'}));
  const replacement={...source,id:'fresh-generated-preview'};
  await act(async () => root.render(<PlanEditor source={replacement} profile={createReturningUserFixture(0).profile}
    generatedAcceptance onSave={saved} onCancel={cancelled} />));
  expect(host.querySelector('.is-reordering')).toBeNull();
  expect(cards()[0].id).toBe(`import-exercise-${source.days[0].exercises[0].id}`);
  expect(host.querySelector('[data-reorder-kind]')).not.toBeNull();
  expect(button('USE THIS PLAN')).toBeTruthy(); expect(saved).not.toHaveBeenCalled();
});
it('a malformed superset stays locked while valid adjacent exercises can move', async () => {
  const {source} = await mount(); const broken=structuredClone(source);broken.id='broken-pair';
  broken.days[0].exercises[0].supersetId='not-adjacent';broken.days[0].exercises[2].supersetId='not-adjacent';
  await act(async () => root.render(<PlanEditor source={broken} profile={createReturningUserFixture(0).profile}
    generatedAcceptance onSave={()=>{}} onCancel={()=>{}} />));
  expect(cards()[0].querySelector('[data-reorder-kind]')).toBeNull();
  expect(cards()[2].querySelector('[data-reorder-kind]')).toBeNull();
  expect(cards()[1].querySelector('[data-reorder-kind]')).not.toBeNull();
});
