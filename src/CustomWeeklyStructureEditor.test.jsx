import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CustomWeeklyStructureEditor} from './CustomWeeklyStructureEditor.jsx';
import {customWorkoutDraft} from './customWeeklyWorkouts.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,rows;
beforeEach(()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  HTMLElement.prototype.scrollBy=()=>{};
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals();});
function mount(value='',frequency=3){
  function Harness(){
    const [workouts,setWorkouts]=useState(()=>customWorkoutDraft(value,3));rows=workouts;
    return <CustomWeeklyStructureEditor workouts={workouts} frequency={frequency} onChange={(index,focus)=>setWorkouts(current=>current.map((row,i)=>i===index?{...row,focus}:row))}/>;
  }
  act(()=>root.render(<Harness/>));
}
const block=i=>host.querySelectorAll('.custom-workout-block')[i];
const click=node=>{expect(node).toBeTruthy();act(()=>node.click());};
const select=(i,key)=>click(block(i).querySelector(`button[data-focus="${key}"]`));
const open=i=>click(block(i).querySelector('.custom-workout-toggle'));

it('supports multiple muscle selections per workout without text entry',()=>{
  mount();expect(host.querySelector('input,textarea')).toBeNull();
  select(0,'chest');select(0,'back');expect(rows[0].focus).toBe('Chest & Back');
  expect(block(0).querySelector('[data-focus="chest"]').getAttribute('aria-pressed')).toBe('true');
  expect(block(0).querySelector('.custom-workout-copy > span').textContent).toBe('Chest · Back');
  select(0,'chest');expect(rows[0].focus).toBe('Back');
  open(1);select(1,'biceps');select(1,'triceps');
  expect(rows.map(row=>row.focus).slice(0,3)).toEqual(['Back','Biceps & Triceps','']);
  expect(block(0).querySelector('.custom-workout-toggle').getAttribute('aria-expanded')).toBe('false');
  open(0);expect(block(0).querySelector('[data-focus="back"]').getAttribute('aria-pressed')).toBe('true');
});
it('keeps saved focus semantics until explicitly replaced, retaining existing explicit muscles',()=>{
  mount('Day 1: Push & Chest\nDay 2: Pull\nDay 3: Legs');
  expect(block(0).querySelector('.custom-workout-legacy').textContent).toContain('Push');
  expect(block(0).querySelector('[data-focus]')).toBeNull();
  click(block(0).querySelector('.custom-keep-focus'));expect(rows[0].focus).toBe('Push & Chest');
  open(0);click(block(0).querySelector('.custom-switch-focus'));expect(rows[0].focus).toBe('Chest');
  expect(block(0).querySelector('[data-focus="chest"]').getAttribute('aria-pressed')).toBe('true');
  select(0,'triceps');expect(rows[0].focus).toBe('Chest & Triceps');expect(rows[1].focus).toBe('Pull');
  expect(block(0).querySelector('[data-focus="rear-delts"]')).toBeNull();
});
it('shows unrecognized saved input until a deliberate new muscle choice replaces it',()=>{
  mount('Day 1: Quantum\nDay 2: Back\nDay 3: Legs');
  expect(block(0).querySelector('.custom-workout-legacy').textContent).toContain('Quantum');
  click(block(0).querySelector('.custom-switch-focus'));
  select(0,'chest');expect(rows[0].focus).toBe('Chest');
  expect(block(0).querySelector('.custom-workout-legacy')).toBeNull();
});
it('offers only ten muscles, with no additive workout types, extra tags or More focuses',()=>{
  mount();
  expect([...block(0).querySelectorAll('[data-focus]')].map(node=>node.dataset.focus)).toEqual(['chest','back','shoulders','biceps','triceps','quads','hamstrings','glutes','calves','core']);
  expect(host.querySelector('.custom-more-focuses,.custom-selected-focuses')).toBeNull();
  expect(host.textContent).not.toContain('More focuses');
});
it('allows a two-day full-body selection without disabling additional muscle choices',()=>{
  mount('',2);expect(host.querySelectorAll('.custom-workout-block')).toHaveLength(2);
  for(const key of ['chest','back','quads','hamstrings','glutes','core'])select(0,key);
  expect(block(0).querySelectorAll('[aria-pressed="true"]')).toHaveLength(6);
  expect([...block(0).querySelectorAll('[data-focus]')].every(node=>!node.disabled)).toBe(true);
});
it('explains the compact full-body interpretation only when every muscle is selected',()=>{
  mount();
  for(const node of block(0).querySelectorAll('[data-focus]'))click(node);
  expect(block(0).querySelector('.custom-workout-copy > span').textContent).toBe('Full Body · all muscle groups');
  expect(host.textContent).toContain('extra exercises spread across the week');
  select(0,'calves');
  expect(block(0).querySelector('.custom-workout-copy > span').textContent).not.toContain('Full Body');
  expect(host.textContent).not.toContain('extra exercises spread across the week');
});
