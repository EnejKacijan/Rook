import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {WorkoutExerciseList} from './WorkoutExerciseList.jsx';
import {AdjustmentExerciseList} from './AdjustmentExerciseList.jsx';

let root,host;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
const press=(id='press',weights=[40,40,40])=>({id,exerciseId:'barbell-bench-press',repMin:8,repMax:10,targetRir:2,restSeconds:120,
  sets:weights.map((weight,index)=>({id:`${id}-${index}`,reps:8,weight,completed:false,planned:true}))});
const render=(exercises,profile={})=>act(()=>root.render(<WorkoutExerciseList exercises={exercises} profile={profile}/>));
const expand=()=>act(()=>{const details=host.querySelector('details');details.open=true;details.dispatchEvent(new Event('toggle'));});

it('shows the same compact targets, artwork and rest without repeating uniform set rows',()=>{
  render([press()]);
  expect(host.querySelector('.workout-exercise-name').textContent).toBe('Bench Press');
  expect(host.querySelector('.workout-exercise-target').textContent).toBe('3 × 8–10 · 2 RIR · 40 kg · 120 sec rest');
  expect(host.querySelectorAll('img')).toHaveLength(1);
  expect(host.querySelector('details')).toBeNull();
  expect(host.querySelectorAll('button,input')).toHaveLength(0);
});
it('keeps repeated exercise instances and their targets in their original order',()=>{
  const exercises=[press('first',[40]),press('second',[60,60])],before=structuredClone(exercises);
  render(exercises);
  expect([...host.querySelectorAll('[data-workout-entry-id]')].map(row=>row.dataset.workoutEntryId)).toEqual(['first','second']);
  expect([...host.querySelectorAll('.workout-exercise-target')].map(row=>row.textContent)).toEqual(['1 × 8–10 · 2 RIR · 40 kg · 120 sec rest','2 × 8–10 · 2 RIR · 60 kg · 120 sec rest']);
  expect(exercises).toEqual(before);
});
it('retains different per-set weights in an optional detail using the selected units',()=>{
  render([press('press',[45.359237,40.8233133])],{units:'lb',rirEnabled:false});
  expect(host.textContent).not.toMatch(/RIR|kg/);
  expect(host.querySelector('.workout-exercise-target').textContent).not.toContain('100 lb');
  expand();
  expect(host.textContent).toContain('Set 1 · 8–10 reps · 100 lb');
  expect(host.textContent).toContain('Set 2 · 8–10 reps · 90 lb');
  expect(host.textContent).not.toMatch(/RIR|kg/);
});
it('honours hidden artwork and leaves unspecified weights quiet',()=>{
  render([press('press',[null,null])],{showExerciseImages:false,rirEnabled:false});
  expect(host.querySelector('img')).toBeNull();
  expect(host.textContent).not.toMatch(/Load not|RIR|kg/);
  expect(host.textContent).toContain('2 × 8–10');
});
it('keeps timed and per-side targets explicit',()=>{
  render([{...press('hold',[null]),exerciseId:'plank',repMin:30,repMax:45}, {...press('side',[10]),exerciseId:'walking-lunge',loggingMode:'per_side'}]);
  const targets=[...host.querySelectorAll('.workout-exercise-target')].map(row=>row.textContent);
  expect(targets[0]).toContain('1 × 30–45 sec');
  expect(targets[0]).not.toContain('RIR');
  expect(targets[1]).toContain('per side');
});
it('shows genuine superset members without inventing a pair for an orphan',()=>{
  render([{...press('first'),supersetId:'pair'},{...press('second'),supersetId:'pair'}, {...press('third'),supersetId:'orphan'}]);
  expect([...host.querySelectorAll('.workout-exercise-pair')].map(row=>row.textContent)).toEqual(['A1 · Superset','A2 · Superset']);
});
it('preserves imported names without guessing a matching illustration',()=>{
  render([{...press(),exerciseId:'unresolved-custom',exerciseSource:'custom',importedName:'My cable press'}]);
  expect(host.querySelector('.workout-exercise-name').textContent).toBe('My cable press');
  expect(host.querySelector('img')).toBeNull();
});
it('uses the shared list for applied adjustments without editor or persistence actions',()=>{
  const edit=vi.fn(),remove=vi.fn(),toggle=vi.fn(),exercises=[press()],before=structuredClone(exercises);
  act(()=>root.render(<AdjustmentExerciseList exercises={exercises} profile={{units:'kg'}} readOnly onEdit={edit} onRemove={remove} onToggle={toggle}/>));
  expect(host.querySelector('.workout-exercise-list')).not.toBeNull();
  expect(host.querySelectorAll('button,input,.adjust-exercise-card')).toHaveLength(0);
  expect(edit).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();expect(toggle).not.toHaveBeenCalled();
  expect(exercises).toEqual(before);
});
