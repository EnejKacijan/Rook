import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { TemporaryPlanSheet } from './TemporaryPlanSheet.jsx';
import { blankState, hydrateStoredState } from './domain.js';
import { createTrainingReviewState } from './fixtures/trainingReviewState.js';
import { proposeTemporaryPlan, applyTemporaryPlan } from './temporaryPlan.js';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, state, persist, update, close, continuation;
const Header = ({ title, onClose }) => <header><strong>{title}</strong><button onClick={onClose}>Close</button></header>;
const button = name => [...host.querySelectorAll('button')].find(item => item.textContent === name);
const click = name => act(() => button(name).click());
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T12:00:00'));
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 16)); vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  state = hydrateStoredState(createTrainingReviewState(blankState()));
  persist = vi.fn(() => true); update = vi.fn(); close = vi.fn(); continuation = null;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const render = () => act(() => root.render(<TemporaryPlanSheet state={state} persist={persist} update={update} close={close} Header={Header}/>));
it('prepares a full review and allows editing or closing without writes or access prompts', () => {
  render(); expect(host.querySelector('input[type="checkbox"]').checked).toBe(true); click('PREPARE TEMPORARY PLAN');
  expect(host.querySelectorAll('.temporary-plan-changes article')).toHaveLength(12);
  expect(host.querySelectorAll('details')).toHaveLength(9);
  expect(persist).not.toHaveBeenCalled();
  click('EDIT SETTINGS'); expect(button('PREPARE TEMPORARY PLAN')).toBeTruthy();
  click('CANCEL'); expect(close).toHaveBeenCalledOnce(); expect(update).not.toHaveBeenCalled();
});
it('applies for an ordinary user without a purchase or subscription check', () => {
  render(); click('PREPARE TEMPORARY PLAN'); click('APPLY TEMPORARY PLAN');
  expect(persist).toHaveBeenCalledOnce(); expect(update).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
});
it('does not double-save when Apply is clicked rapidly before React commits', () => {
  render(); click('PREPARE TEMPORARY PLAN');
  act(() => { button('APPLY TEMPORARY PLAN').click(); button('APPLY TEMPORARY PLAN').click(); });
  expect(persist).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
});
it('keeps failed saves reviewable, shows feedback in the action area and permits a retry', () => {
  persist.mockReturnValueOnce(false); render(); click('PREPARE TEMPORARY PLAN'); click('APPLY TEMPORARY PLAN');
  expect(host.querySelector('.sheet-action-footer [role="alert"]').textContent).toContain('could not be saved');
  expect(update).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  click('APPLY TEMPORARY PLAN'); expect(update).toHaveBeenCalledOnce();
});
it('ends an accepted period without a subscription, only after explicit confirmation', () => {
  const proposal = proposeTemporaryPlan(state, { startDate: '2026-10-05', weeks: 3, days: ['Mon', 'Wed', 'Fri'], equipment: ['dumbbells'] });
  state = applyTemporaryPlan(state, proposal, () => true).state; render();
  click('END EARLY…'); expect(persist).not.toHaveBeenCalled(); click('KEEP TEMPORARY PLAN');
  expect(persist).not.toHaveBeenCalled(); click('END EARLY…'); click('END TEMPORARY PLAN');
  expect(persist).toHaveBeenCalledOnce();
  expect(persist.mock.calls[0][0].program.temporaryPlanAdjustment.endedAt).toBeTruthy();
});
it('reports changed training context before any save, and invalid day selection before preparing', () => {
  render(); click('Mon'); click('Wed'); click('PREPARE TEMPORARY PLAN');
  expect(host.querySelector('[role="alert"]').textContent).toContain('Choose 2–4');
  click('Mon'); click('Wed'); click('PREPARE TEMPORARY PLAN'); state.program.version++;
  click('APPLY TEMPORARY PLAN'); expect(persist).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]').textContent).toContain('context changed');
});
