import React, {act, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {ActiveWorkout, Detail, ModalLayer} from './App.jsx';
import * as domain from './domain.js';
import {exerciseNotePresentation} from './exerciseNotePresentation.js';
import {preparePlanImport} from './planImportTransaction.js';
import {applySyncDownloads, syncEntities, ACCOUNT_SYNC_SCHEMA} from './accountSyncModel.js';
import {useAnimationClock} from './testAnimationClock.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, initial, current, updates;
const advance = ms => act(() => vi.advanceTimersByTime(ms));
const click = node => act(() => node.click());
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const field = () => document.querySelector('.exercise-note-field textarea');
function fixture() {
  const state = domain.blankState();
  Object.assign(state.profile, {goal: 'Build muscle', experience: 'Intermediate', daysPerWeek: 2, availableDays: ['Sun', 'Tue'], sessionMinutes: 60, environment: 'Commercial gym', equipment: ['full gym'], priorities: ['Balanced'], onboardingComplete: true, showExerciseImages: false, restTimerEnabled: false});
  state.program = domain.buildProgram(state.profile);
  state.program.days.forEach((day, index) => {
    Object.assign(day.exercises[0], {exerciseId: 'step-down', notes: index ? 'pause at bottom' : 'pocasi dol, hitro gor', personalNote: index ? 'Tuesday reminder' : 'Use the same box height'});
  });
  state.selectedDate = domain.isoDay(); state.selectedDay = 'Sun';
  state.activeWorkout = domain.startWorkout(state, state.program.days[0]);
  return state;
}
beforeEach(() => {
  useAnimationClock(); vi.setSystemTime(new Date('2026-10-04T12:00:00'));
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({matches: true, addEventListener() {}, removeEventListener() {}}));
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLElement.prototype.scrollTo = function({top = 0} = {}) {this.scrollTop = top;};
  HTMLElement.prototype.scrollIntoView = () => {};
  initial = fixture(); updates = vi.fn();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();});
function mount(payload = initial.activeWorkout.exercises[0]) {
  function Harness() {
    const [state, setState] = useState(initial), [detail, setDetail] = useState({exerciseNote: payload}), background = useRef(null);
    current = state;
    const update = fn => {updates(); setState(before => fn(structuredClone(before)));};
    return <><div ref={background}><ActiveWorkout state={state} update={update} setDetail={setDetail} setPage={() => {}}/></div>
      {detail && <ModalLayer close={() => setDetail(null)} backgroundRef={background}>
        {close => <Detail detail={detail} state={state} update={update} close={close} setDetail={setDetail}/>}</ModalLayer>}</>;
  }
  act(() => root.render(<Harness/>)); advance(300);
}
function type(value) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field(), value);
    field().dispatchEvent(new Event('input', {bubbles: true}));
  });
}

it('A/B/C: displays the canonical logger cue read-only, independently from the editable reminder', () => {
  mount(); const plan = document.querySelector('.exercise-plan-note');
  expect(plan.getAttribute('aria-label')).toBe('From your plan');
  expect(plan.querySelector('.eyebrow').textContent).toBe('FROM YOUR PLAN');
  expect(plan.querySelector('p').textContent).toBe(document.querySelector('.exercise-program-note').textContent);
  expect(plan.querySelector('input,textarea,[contenteditable]')).toBeNull();
  expect(plan.querySelector('p').classList.contains('rook-selectable')).toBe(true);
  expect(document.querySelectorAll('.exercise-note-sheet textarea')).toHaveLength(1);
  expect(field().value).toBe('Use the same box height'); expect(field().readOnly).toBe(false);
  expect(field().maxLength).toBe(120); expect(updates).not.toHaveBeenCalled(); expect(current).toEqual(initial);
});
it('D: Save changes only the canonical personal reminder and preserves plan instruction and prescription', () => {
  mount(); type('Keep the same setup'); const expected = structuredClone(initial);
  domain.saveActiveExercisePersonalNote(expected, initial.activeWorkout.exercises[0].id, 'Keep the same setup');
  click(button('SAVE')); advance(220);
  expect(current).toEqual(expected); expect(updates).toHaveBeenCalledOnce();
  expect(current.program.days[0].exercises[0].notes).toBe('pocasi dol, hitro gor');
  expect(document.querySelector('.exercise-program-note').textContent).toBe('pocasi dol, hitro gor');
  expect(document.querySelector('.exercise-personal-note').textContent).toContain('Keep the same setup');
  expect(document.querySelector('.exercise-note-sheet')).toBeNull();
});
it('Remove note clears only Personal Reminder, leaving the applicable instruction intact', () => {
  mount(); click(button('Remove note')); advance(220);
  expect(domain.exercisePersonalNote(current.activeWorkout.exercises[0])).toBeNull();
  expect(domain.exercisePersonalNote(current.program.days[0].exercises[0])).toBeNull();
  expect(document.querySelector('.exercise-program-note').textContent).toBe('pocasi dol, hitro gor');
  expect(document.querySelector('.exercise-personal-note')).toBeNull();
});
it('an unchanged Save retains the existing close/save behavior without copying plan text', () => {
  mount(); click(button('SAVE')); advance(220);
  expect(updates).toHaveBeenCalledOnce();
  expect(current.activeWorkout.exercises[0].personalNote).toBe('Use the same box height');
  expect(current.activeWorkout.exercises[0].notes).toBe('pocasi dol, hitro gor');
});
it('closing a dirty personal draft does not mutate either field', () => {
  mount(); type('Unsaved reminder'); click(document.querySelector('.exercise-note-sheet [aria-label="Close"]')); advance(220);
  expect(current).toEqual(initial); expect(updates).not.toHaveBeenCalled();
});
it.each([[true,true],[true,false],[false,true],[false,false]])('J: plan=%s/personal=%s renders cleanly without empty provenance headers', (plan, personal) => {
  for (const row of [initial.program.days[0].exercises[0], initial.activeWorkout.exercises[0]]) {
    row.notes = plan ? 'pocasi dol, hitro gor' : ''; row.personalNote = personal ? 'Use the same box height' : '';
  }
  mount(); expect(Boolean(document.querySelector('.exercise-plan-note'))).toBe(plan);
  expect(document.querySelector('.exercise-note-sheet').textContent).toContain('PERSONAL REMINDER');
  expect(field().value).toBe(personal ? 'Use the same box height' : '');
  expect(field().value).not.toContain('pocasi dol');
  expect(document.querySelector('.exercise-source-reference')).toBeNull();
});
it('uses the active occurrence row rather than a stale sheet payload or another template instruction', () => {
  const row = initial.activeWorkout.exercises[0]; mount({...row, notes: 'stale instruction', personalNote: 'stale reminder'});
  expect(document.querySelector('.exercise-plan-note p').textContent).toBe('pocasi dol, hitro gor');
  expect(field().value).toBe('Use the same box height');
  expect(document.querySelector('.exercise-plan-note').textContent).not.toContain('pause at bottom');
});
it('keeps original mixed import prescriptions as reference-only without promoting them to instructions', () => {
  const raw = 'Step-down 3x8 / Step-up 3x10';
  initial.program.importMetadata = {sourceNotes: [{text: raw}]};
  initial.activeWorkout.exercises[0].notes = `pocasi dol, hitro gor\n${raw}`;
  mount(); expect(document.querySelector('.exercise-plan-note p').textContent).toBe('pocasi dol, hitro gor');
  expect(document.querySelector('.exercise-source-reference blockquote').textContent).toBe(raw);
  expect(document.querySelector('.exercise-source-reference').textContent).toContain('REFERENCE ONLY');
  expect(field().value).toBe('Use the same box height');
});
it('reference-only import notes do not produce an empty FROM YOUR PLAN section', () => {
  const raw = 'Step-down 3x8 / Step-up 3x10'; initial.program.importMetadata = {sourceNotes: [{text: raw}]};
  initial.activeWorkout.exercises[0].notes = raw; mount();
  expect(document.querySelector('.exercise-plan-note')).toBeNull();
  expect(document.querySelector('.exercise-source-reference blockquote').textContent).toBe(raw);
});
it('keeps a long multiline plan instruction intact outside the 120-character editable reminder', () => {
  const cue = `slow eccentric\n${'Keep a controlled pace. '.repeat(30)}`;
  initial.activeWorkout.exercises[0].notes = cue; mount();
  expect(document.querySelector('.exercise-plan-note p').textContent).toBe(cue.trim());
  expect(field().value).toBe('Use the same box height'); expect(field().maxLength).toBe(120);
});
it('preserves the template-slot and session-only reminder scopes', () => {
  mount(); expect(document.querySelector('.exercise-note-meta').textContent).toContain(`Shown next time in ${initial.program.days[0].name}.`);
  const scoped = structuredClone(initial); scoped.activeWorkout.programDayId = 'not-a-template';
  const id = scoped.activeWorkout.exercises[0].id;
  expect(domain.saveActiveExercisePersonalNote(scoped, id, 'One-session reminder').scope).toBe('workout');
  expect(scoped.program.days[0].exercises[0].personalNote).toBe('Use the same box height');
});
it('E/G: revisions affect the next canonical occurrence, and the same exercise can have distinct day instructions/reminders', () => {
  const active = structuredClone(initial.activeWorkout.exercises[0]);
  initial.program.days[0].exercises[0].notes = 'new revised cue';
  expect(exerciseNotePresentation(active, initial.program).cue).toBe('pocasi dol, hitro gor');
  const fresh = {...initial, activeWorkout: null};
  const sunday = domain.startWorkout(fresh, fresh.program.days[0]), tuesday = domain.startWorkout(fresh, fresh.program.days[1]);
  expect(sunday.exercises[0].exerciseId).toBe(tuesday.exercises[0].exerciseId);
  expect(sunday.exercises[0].id).not.toBe(tuesday.exercises[0].id);
  expect(exerciseNotePresentation(sunday.exercises[0], fresh.program).cue).toBe('new revised cue');
  expect(exerciseNotePresentation(tuesday.exercises[0], fresh.program).cue).toBe('pause at bottom');
  expect([sunday.exercises[0].personalNote,tuesday.exercises[0].personalNote]).toEqual(['Use the same box height','Tuesday reminder']);
});
it('history snapshots both note fields instead of retroactively reading edited plan data', () => {
  initial.activeWorkout.exercises[0].sets[0].completed = true;
  const finished = domain.completeWorkout(initial), historical = structuredClone(finished.workouts.at(-1));
  finished.program.days[0].exercises[0].notes = 'new plan instruction';
  finished.program.days[0].exercises[0].personalNote = 'new personal reminder';
  expect(finished.workouts.at(-1)).toEqual(historical);
  expect(historical.exercises[0]).toMatchObject({notes: 'pocasi dol, hitro gor',personalNote: 'Use the same box height'});
});
it('F/H: replacement/repeated import follows new plan data while preserving existing historical reminders', () => {
  initial.activeWorkout.exercises[0].sets[0].completed = true;
  const finished = domain.completeWorkout(initial), historical = structuredClone(finished.workouts);
  const candidate = structuredClone(finished.program); candidate.id = 'replacement-plan'; candidate.source = 'ai-import';
  candidate.days.forEach(day => {
    day.id += '-new'; delete day.durationPlanningVersion; // Imported plans use their existing duration estimator.
    day.exercises.forEach(row => {row.id += '-new'; delete row.personalNote;});
    day.estimatedMinutes = domain.estimateSessionMinutes(day.exercises);
  });
  candidate.days[0].exercises[0].notes = 'replacement instruction';
  expect(domain.validateProgram(candidate,{...finished.profile,sessionMinutes:null},{allowImportedExercises:true,preserveSchedule:true,ignoreTrainingSafety:true})).toEqual({valid:true,errors:[]});
  const imported = preparePlanImport(finished,candidate,finished.profile,{date:domain.isoDay(),weekday:'Sun'});
  const repeated = preparePlanImport(imported,candidate,imported.profile,{date:domain.isoDay(),weekday:'Sun'});
  const restored = domain.deserializeState(JSON.stringify(repeated),{strict:true});
  expect(restored.workouts).toEqual(historical);
  const next = domain.startWorkout(restored,restored.program.days[0]);
  expect(exerciseNotePresentation(next.exercises[0],restored.program).cue).toBe('replacement instruction');
  expect(next.exercises[0].personalNote).toBeUndefined(); // New slot; existing scope is not global by catalog ID.
  expect(domain.exerciseNote(next.exercises[0]).split('replacement instruction')).toHaveLength(2);
  expect(restored.workouts.at(-1).exercises[0].personalNote).toBe('Use the same box height');
});
it('H/I: reload and existing program/active-workout sync preserve separate fields without a new note entity', () => {
  const before = syncEntities(initial), row = initial.activeWorkout.exercises[0];
  const sender = structuredClone(initial); domain.saveActiveExercisePersonalNote(sender,row.id,'Updated personal reminder');
  const entities = syncEntities(sender);
  expect([...entities.keys()]).toEqual([...before.keys()]);
  expect([...entities].filter(([key,item]) => item.digest !== before.get(key).digest).map(([key]) => key).sort()).toEqual(['activeWorkout:"root"','program:"root"']);
  const downloads = ['program:"root"','activeWorkout:"root"'].map(key => ({key,operation:'upsert',entity:{...entities.get(key),revision:1,syncSchemaVersion:ACCOUNT_SYNC_SCHEMA,deleted:false}}));
  const receiver = applySyncDownloads(initial,downloads);
  const restored = domain.deserializeState(JSON.stringify(receiver),{strict:true});
  for (const row of [restored.program.days[0].exercises[0],restored.activeWorkout.exercises[0]]) {
    expect(row.notes).toBe('pocasi dol, hitro gor'); expect(row.personalNote).toBe('Updated personal reminder');
    expect(exerciseNotePresentation(row,restored.program).cue).toBe('pocasi dol, hitro gor');
  }
  expect(domain.saveState(restored)).toBe(true);
  expect(domain.loadState().activeWorkout.exercises[0]).toMatchObject({notes:'pocasi dol, hitro gor',personalNote:'Updated personal reminder'});
});
