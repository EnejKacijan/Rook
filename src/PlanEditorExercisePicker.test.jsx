import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { PlanEditorExercisePicker } from './PlanEditorExercisePicker.jsx';
import { exerciseCatalog, exerciseMatchesQuery, rankExerciseSearch } from './domain.js';
import { createPlanEditorExerciseFilter } from './exerciseEligibility.js';
import { useAnimationClock } from './testAnimationClock.js';

let root, host, screen, viewport, select, cancel, create;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const day = { weekday: 'Mon', exercises: [{ exerciseId: 'plank' }] };
const catalog = Object.values(exerciseCatalog).filter(createPlanEditorExerciseFilter({ equipment: ['full gym'] })).sort((a,b) => a.name.localeCompare(b.name));
const names = () => [...host.querySelectorAll('[role=option]')].map(node => node.textContent.trim());
const input = () => host.querySelector('input');
const type = value => act(() => {
  input().focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input(), value);
  input().dispatchEvent(new Event('input', { bubbles: true }));
});
const frame = () => act(() => vi.advanceTimersByTime(32));
beforeEach(() => {
  useAnimationClock();
  viewport = new EventTarget(); Object.assign(viewport, {height:500,width:390,scale:1,offsetTop:0}); vi.stubGlobal('visualViewport',viewport);
  host=document.createElement('div');screen=document.createElement('main');screen.className='screen detail-screen';
  screen.innerHTML='<header class="detail-header"></header><div class="picker"></div><footer class="sheet-action-footer"></footer>';
  host.append(screen); document.body.append(host); root=createRoot(screen.querySelector('.picker'));
  select=vi.fn();cancel=vi.fn();create=vi.fn();
  act(() => root.render(<PlanEditorExercisePicker catalog={catalog} day={day} images={false} onSelect={select} onCancel={cancel} onCreate={create}/>));
});
afterEach(() => {act(() => root.unmount());host.remove();vi.unstubAllGlobals();vi.useRealTimers();});

it.each(['s','squat','zzqnoresult','press','pull ups','zgibi','---'])('query %s commits canonical membership and ranking with no debounce or timer wait',query => {
  type(query);
  const expected=rankExerciseSearch(catalog.filter(item => item.id !== 'plank' && exerciseMatchesQuery(item,query)),query);
  expect(names()).toEqual(expected.map(item=>item.name));expect(select).not.toHaveBeenCalled();
});
it('rapid old and new queries cannot overwrite the latest results, including no-results and clear',() => {
  for(const query of ['squ','squat','zzqnoresult','press','squat'])type(query);
  const final=names();expect(final).toContain('Squat');expect(final).not.toContain('Arnold Press');
  frame();expect(names()).toEqual(final);expect(input().value).toBe('squat');
  type('zzqnoresult');expect(names()).toEqual([]);expect(host.querySelector('[role=status]').textContent).toBe('No matching exercises');
  act(()=>host.querySelector('[aria-label="Clear search"]').click());expect(names().length).toBeGreaterThan(300);expect(input().value).toBe('');expect(document.activeElement).toBe(input());
});
it('typing retains the same input, focus and surviving option identity',() => {
  const field=input();type('squ');const squat=[...host.querySelectorAll('[role=option]')].find(node=>node.textContent==='Squat');
  type('squat');expect(input()).toBe(field);expect(document.activeElement).toBe(field);expect([...host.querySelectorAll('[role=option]')].find(node=>node.textContent==='Squat')).toBe(squat);
});
it('custom creation receives the current query without mutating or selecting a draft',() => {
  type('My custom movement');act(()=>host.querySelector('[aria-label="Create custom exercise"]').click());
  expect(create).toHaveBeenCalledWith('My custom movement');expect(select).not.toHaveBeenCalled();
  act(()=>[...host.querySelectorAll('button')].find(node=>node.textContent==='CANCEL').click());expect(cancel).toHaveBeenCalledOnce();
});

function geometry() {
  const rect=(top,bottom)=>({top,bottom,height:bottom-top});
  screen.getBoundingClientRect=()=>rect(12,500);
  screen.querySelector('header').getBoundingClientRect=()=>rect(12,100);
  screen.querySelector('footer').getBoundingClientRect=()=>rect(366,500);
  input().getBoundingClientRect=()=>rect(300-screen.scrollTop,340-screen.scrollTop);
  for(const node of host.querySelectorAll('[role=option]'))node.getBoundingClientRect=()=>rect(347-screen.scrollTop,411-screen.scrollTop);
  const status=host.querySelector('[role=status]');if(status)status.getBoundingClientRect=()=>rect(347-screen.scrollTop,380-screen.scrollTop);
}
it('reveals the complete first result above the footer while preserving field focus, then stays stable on typing',() => {
  geometry();act(()=>input().focus());frame();expect(screen.scrollTop).toBe(57);expect(document.activeElement).toBe(input());
  type('squat');geometry();frame();expect(screen.scrollTop).toBe(57);expect(host.scrollTop).toBe(0);
  viewport.dispatchEvent(new Event('resize'));frame();expect(screen.scrollTop).toBe(57);
});
it('closing or growing the keyboard never pulls the existing scroll back or blurs the field',() => {
  geometry();act(()=>input().focus());frame();const scroll=screen.scrollTop;
  viewport.height=844;viewport.dispatchEvent(new Event('resize'));frame();expect(screen.scrollTop).toBe(scroll);expect(document.activeElement).toBe(input());
});
it('a short keyboard viewport reveals field and first result when the search footer is hidden',()=>{
  geometry();screen.querySelector('footer').hidden=true;screen.getBoundingClientRect=()=>({top:12,bottom:350});viewport.height=350;
  act(()=>input().focus());frame();expect(screen.scrollTop).toBe(73);expect(input().getBoundingClientRect().top).toBeGreaterThan(112);
  expect(host.querySelector('[role=option]').getBoundingClientRect().bottom).toBe(338);expect(document.activeElement).toBe(input());
});
it('does not scroll an unfocused or inert editor, and cancels pending reveals on unmount',() => {
  geometry();frame();expect(screen.scrollTop).toBe(0);
  screen.inert=true;act(()=>input().focus());frame();expect(screen.scrollTop).toBe(0);
  screen.inert=false;viewport.height=460;viewport.dispatchEvent(new Event('resize'));act(()=>root.unmount());frame();expect(screen.scrollTop).toBe(0);
});
