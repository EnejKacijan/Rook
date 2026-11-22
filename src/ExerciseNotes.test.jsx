import React, {act, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
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
function mount(payload = initial.activeWorkout.exercises[0], noteId = domain.LEGACY_PERSONAL_NOTE_ID) {
  function Harness() {
    const [state, setState] = useState(initial), [detail, setDetail] = useState(payload === null ? null : {exerciseNote: payload, noteId}), background = useRef(null);
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

function openOptions() {
  click(document.querySelector('button[aria-label="Exercise options"]')); advance(300);
  return document.querySelector('.active-exercise-note-action');
}

it('opens the canonical editor directly from the personal reminder and saves in its existing scope', () => {
  mount(null); const trigger = document.querySelector('.exercise-personal-note-action');
  expect(trigger.tagName).toBe('BUTTON'); expect(trigger.type).toBe('button');
  expect(trigger.getAttribute('aria-label')).toBe('Edit note: Use the same box height');
  expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  expect(document.querySelector('.exercise-program-note').closest('button')).toBeNull();
  click(trigger); advance(300); expect(field().value).toBe('Use the same box height');
  expect(document.querySelector('.active-exercise-options-sheet')).toBeNull();
  expect(current).toEqual(initial); expect(updates).not.toHaveBeenCalled();
  type('Use box 3'); click(button('SAVE')); advance(300);
  expect(document.querySelector('.exercise-personal-note-action').textContent).toContain('Use box 3');
  expect(domain.exercisePersonalNote(current.program.days[0].exercises[0])).toBe('Use box 3');
  expect(document.querySelector('.exercise-program-note').textContent).toBe('pocasi dol, hitro gor');
  advance(32); // The shared modal restores focus on the frame after unmount.
  expect(document.activeElement).toBe(trigger);
  expect(updates).toHaveBeenCalledOnce();
});

it('removing a note reached directly removes the shortcut while Add note remains available in the menu', () => {
  mount(null); click(document.querySelector('.exercise-personal-note-action')); advance(300);
  click(button('Remove note')); advance(300);
  expect(document.querySelector('.exercise-personal-note-action')).toBeNull();
  expect(openOptions().getAttribute('aria-label')).toBe('Add note');
  expect(document.querySelector('.exercise-program-note').textContent).toBe('pocasi dol, hitro gor');
});

it('opening, dismissing and saving the direct note preserves raw logger drafts and all set values', () => {
  initial.activeWorkout.exercises[0].exerciseId = 'barbell-bench-press';
  initial.activeWorkout.exercises[0].sets[0].weight = 35;
  mount(null); const input = document.querySelector('[data-workout-field="weight"] input');
  act(() => {
    input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '082,50');
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
  const before = structuredClone(current);
  const trigger = document.querySelector('.exercise-personal-note-action');
  act(() => trigger.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true, cancelable: true, button: 0})));
  click(trigger); advance(300);
  expect(input.value).toBe('082,50'); expect(current).toEqual(before);
  type('Unsaved'); click(document.querySelector('.exercise-note-sheet [aria-label="Close"]')); advance(300);
  expect(input.value).toBe('082,50'); expect(current).toEqual(before);
  act(() => input.focus()); click(trigger); advance(300);
  type('Use box 4'); click(button('SAVE')); advance(300);
  expect(input.value).toBe('082,50');
  expect(current.activeWorkout.exercises.map(row => row.sets)).toEqual(before.activeWorkout.exercises.map(row => row.sets));
  expect(current.workouts).toEqual(before.workouts); expect(updates).toHaveBeenCalledOnce();
});

it('puts the personal-note indicator and preview on Exercise notes, not above the overflow button', () => {
  mount(null); const overflow = document.querySelector('button[aria-label="Exercise options"]');
  expect(overflow.querySelector('.exercise-note-present')).toBeNull();
  expect(overflow.getAttribute('aria-description')).toContain('Note added');
  const action = openOptions();
  expect(action.getAttribute('aria-label')).toBe('Exercise notes');
  expect(action.querySelector('.exercise-note-present').getAttribute('aria-hidden')).toBe('true');
  expect(action.querySelector('small').textContent).toBe('Use the same box height');
  expect(action.getAttribute('aria-describedby')).toBe(action.querySelector('small').id);
  expect(action.querySelector('svg')).not.toBeNull();
  expect(current).toEqual(initial); expect(updates).not.toHaveBeenCalled();
  click(action); advance(300);
  // The menu opens the full list with an empty field for another note.
  expect(field().value).toBe('');
  expect(document.querySelector('.exercise-note-item p').textContent).toBe('Use the same box height');
  expect(document.querySelector('.exercise-plan-note p').textContent).toBe('pocasi dol, hitro gor');
});

it('Add note has no existing-note indicator or preview, even when a plan cue exists', () => {
  initial.activeWorkout.exercises[0].personalNote = '';
  mount(null); const action = openOptions();
  expect(action.getAttribute('aria-label')).toBe('Add note');
  expect(action.querySelector('.exercise-note-present,small')).toBeNull();
  expect(action.hasAttribute('aria-describedby')).toBe(false);
  click(action); advance(300); expect(field().value).toBe('');
  expect(document.querySelector('.exercise-plan-note p').textContent).toBe('pocasi dol, hitro gor');
  expect(updates).not.toHaveBeenCalled();
});

it('saving and removing through the same editor updates the menu and preserves instructions/history', () => {
  const history = structuredClone(initial.workouts);
  for (const row of [initial.program.days[0].exercises[0], initial.activeWorkout.exercises[0]]) delete row.personalNote;
  mount(null); click(openOptions()); advance(300); type('Seat 4, controlled pace');
  click(button('SAVE')); advance(300);
  let action = openOptions(); expect(action.querySelector('small').textContent).toBe('Seat 4, controlled pace');
  click(action); advance(300); click(document.querySelector('[aria-label="Remove note: Seat 4, controlled pace"]')); advance(300);
  expect(document.querySelector('.exercise-note-item')).toBeNull();
  click(document.querySelector('.exercise-note-sheet [aria-label="Close"]')); advance(300);
  action = openOptions(); expect(action.getAttribute('aria-label')).toBe('Add note');
  expect(action.querySelector('.exercise-note-present,small')).toBeNull();
  expect(domain.exercisePersonalNote(current.program.days[0].exercises[0])).toBeNull();
  expect(current.activeWorkout.exercises[0].notes).toBe('pocasi dol, hitro gor');
  expect(current.workouts).toEqual(history); expect(updates).toHaveBeenCalledTimes(2);
});

it('dismissal leaves existing personal notes intact and the menu shows the full multiline note', () => {
  const note = 'Use the same setup.\n' + 'Keep a controlled pace. '.repeat(4);
  initial.activeWorkout.exercises[0].personalNote = note;
  mount(null); const action = openOptions();
  expect(action.querySelector('small').textContent).toBe(note.trim());
  click(action); advance(300); type('Unsaved');
  click(document.querySelector('.exercise-note-sheet [aria-label="Close"]')); advance(300);
  expect(openOptions().querySelector('small').textContent).toBe(note.trim());
  expect(current).toEqual(initial); expect(updates).not.toHaveBeenCalled();
});

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
  expect(document.querySelector('.exercise-note-sheet').textContent).toContain(personal ? 'EDIT NOTE' : 'PERSONAL REMINDER');
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
  mount(); expect(document.querySelector('.exercise-note-meta').textContent).toContain(`Shown in Future ${initial.program.days[0].name} workouts.`);
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

describe('multiple notes per exercise', () => {
  const ex = () => current.activeWorkout.exercises[0];
  const tpl = () => current.program.days[0].exercises[0];
  const texts = row => domain.exercisePersonalNotes(row).map(note => note.text);

  it('keeps the existing reminder as a pinned note in its original scope', () => {
    const [note] = domain.exercisePersonalNotes(initial.activeWorkout.exercises[0]);
    expect(note).toEqual({id: domain.LEGACY_PERSONAL_NOTE_ID, text: 'Use the same box height', pinned: true});
    mount(); const item = document.querySelector('.exercise-note-item');
    expect(item.textContent).toContain(`Pinned · Future ${initial.program.days[0].name} workouts`);
  });

  it('adds a session-only note by default and keeps the pinned reminder under the name', () => {
    mount(null); click(openOptions()); advance(300);
    expect(document.querySelector('.exercise-note-option input').checked).toBe(false);
    expect(document.querySelector('.exercise-note-sheet').textContent).toContain(`Save for future workouts${'Future ' + initial.program.days[0].name + ' workouts'}`);
    type('Left shoulder felt tight'); click(button('ADD NOTE')); advance(300);
    expect(texts(ex())).toEqual(['Use the same box height', 'Left shoulder felt tight']);
    expect(texts(tpl())).toEqual(['Use the same box height']);
    expect(document.querySelector('.exercise-personal-note-action').textContent).toContain('Use the same box height');
    const more = document.querySelector('.exercise-more-notes');
    expect(more.textContent).toBe('+1 more note');
    click(more); advance(300);
    expect([...document.querySelectorAll('.exercise-note-item small')].map(node => node.textContent))
      .toEqual([`Pinned · Future ${initial.program.days[0].name} workouts`, 'This workout only']);
  });

  it('Save for future workouts copies the note to the planned workout only', () => {
    mount(null); click(openOptions()); advance(300); type('Bench 2 has the good bar');
    click(document.querySelector('.exercise-note-option input')); click(button('ADD NOTE')); advance(300);
    expect(texts(tpl())).toEqual(['Use the same box height', 'Bench 2 has the good bar']);
    expect(texts(current.program.days[1].exercises[0])).toEqual(['Tuesday reminder']);
  });

  it('pins another note in place and can unpin it', () => {
    mount(null); click(openOptions()); advance(300); type('Today: lighter warm-up'); click(button('ADD NOTE')); advance(300);
    click(document.querySelector('.exercise-more-notes')); advance(300);
    click(document.querySelector('[aria-label="Pin note: Today: lighter warm-up"]')); advance(50);
    expect(document.querySelector('.exercise-personal-note-action').textContent).toContain('Today: lighter warm-up');
    expect(ex().personalNote).toBe('Today: lighter warm-up');
    // A session note pinned today leaves next time’s pinned reminder alone.
    expect(domain.pinnedExercisePersonalNote(tpl()).text).toBe('Use the same box height');
    click(document.querySelector('[aria-label="Unpin note: Today: lighter warm-up"]')); advance(50);
    expect(domain.pinnedExercisePersonalNote(ex())).toBeNull();
    expect(document.querySelector('.exercise-personal-note-action')).toBeNull();
  });
});

describe('note scopes across sessions', () => {
  function upperState() {
    const state = fixture(); state.activeWorkout = null;
    state.program.days[0].name = 'Upper B'; state.program.days[1].name = 'Upper A';
    state.program.days.forEach(day => { day.exercises[0].exerciseId = 'barbell-bench-press'; });
    state.activeWorkout = domain.startWorkout(state, state.program.days[0]);
    return state;
  }
  it('shows a future note and the pinned reminder in the next Upper B, not in Upper A, and keeps today’s note in history', () => {
    const state = upperState(); const id = state.activeWorkout.exercises[0].id;
    expect(domain.saveActiveExerciseNote(state, id, {text: 'Today: elbow ok at 80 kg'}).scope).toBe('workout');
    expect(domain.saveActiveExerciseNote(state, id, {text: 'Pause first rep', scope: 'template'}).scope).toBe('template');
    state.activeWorkout.exercises[0].sets[0].completed = true;
    const done = domain.completeWorkout(state);
    const history = done.workouts.at(-1).exercises[0];
    expect(domain.exercisePersonalNotes(history).map(note => note.text)).toEqual(['Use the same box height', 'Today: elbow ok at 80 kg', 'Pause first rep']);
    const nextB = domain.startWorkout(done, done.program.days[0]).exercises[0];
    expect(domain.exercisePersonalNotes(nextB).map(note => [note.text, Boolean(note.pinned)]))
      .toEqual([['Use the same box height', true], ['Pause first rep', false]]);
    const upperA = domain.startWorkout(done, done.program.days[1]).exercises[0];
    expect(domain.exercisePersonalNotes(upperA).map(note => note.text)).toEqual(['Tuesday reminder']);
  });
  it('moving a note between scopes and removing a future note update the planned workout', () => {
    const state = upperState(); const id = state.activeWorkout.exercises[0].id;
    const {note} = domain.saveActiveExerciseNote(state, id, {text: 'Grip ring finger'});
    domain.saveActiveExerciseNote(state, id, {id: note.id, text: 'Grip ring finger', scope: 'template'});
    expect(domain.exercisePersonalNotes(state.program.days[0].exercises[0]).map(item => item.text)).toContain('Grip ring finger');
    domain.saveActiveExerciseNote(state, id, {id: note.id, text: 'Grip ring finger', scope: 'workout'});
    expect(domain.exercisePersonalNotes(state.program.days[0].exercises[0]).map(item => item.text)).toEqual(['Use the same box height']);
    domain.removeActiveExerciseNote(state, id, domain.LEGACY_PERSONAL_NOTE_ID);
    expect(state.program.days[0].exercises[0].personalNote).toBeUndefined();
    expect(domain.exercisePersonalNotes(state.activeWorkout.exercises[0]).map(item => item.text)).toEqual(['Grip ring finger']);
  });
  it('treats the legacy mirror as the pinned note when an older client edits it', () => {
    const state = upperState(); const id = state.activeWorkout.exercises[0].id;
    domain.saveActiveExerciseNote(state, id, {text: 'Second'});
    const row = state.activeWorkout.exercises[0];
    row.personalNote = 'Edited elsewhere';
    expect(domain.exercisePersonalNotes(row).map(note => note.text)).toEqual(['Edited elsewhere', 'Second']);
    row.personalNote = null;
    expect(domain.exercisePersonalNotes(row).map(note => note.text)).toEqual(['Second']);
  });
  it('limits each exercise to ten notes', () => {
    const state = upperState(); const id = state.activeWorkout.exercises[0].id;
    for (let i = 1; i < domain.EXERCISE_PERSONAL_NOTES_MAX; i++) expect(domain.saveActiveExerciseNote(state, id, {text: `n${i}`}).saved).toBe(true);
    expect(domain.saveActiveExerciseNote(state, id, {text: 'one too many'})).toMatchObject({saved: false});
  });
});
