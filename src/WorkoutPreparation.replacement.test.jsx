import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PlanEditor} from './App.jsx';
import {WorkoutPreparation} from './WorkoutPreparation.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {adaptedTemplateForToday,startWorkout,exerciseCatalog,saveState} from './domain.js';
import {prepareTodayReplacementValues} from './previousValues.js';
vi.mock('./domain.js',async original=>({...await original(),saveState:vi.fn(()=>true)}));
let root,host,current,closed;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-19T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('scrollTo',()=>{});Element.prototype.scrollIntoView=vi.fn();
  saveState.mockClear();closed=vi.fn();host=document.createElement('main');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===text||node.getAttribute('aria-label')===text);
const click=async node=>act(async()=>node.click());
const field=label=>host.querySelector(`input[aria-label="${label}"]`);
async function input(node,value){await act(async()=>{node.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>node.blur());}
function fixture(){
  const state=createReturningUserFixture(0),day=state.program.days[0],row=day.exercises[0];
  state.profile.showExerciseImages=false;state.profile.units='kg';state.program.source='ai-import';
  day.exercises=[row];Object.assign(row,{repMin:5,repMax:6});row.sets.forEach(set=>Object.assign(set,{weight:78,reps:5}));
  state.workouts=[{id:'old-session',completedAt:'2026-10-12T12:00:00Z',exercises:[{...structuredClone(row),sets:row.sets.map(set=>({...set,weight:53,reps:5,completed:true}))}]},
    {id:'new-session',completedAt:'2026-10-16T12:00:00Z',exercises:[{id:'past-curl',exerciseId:'cable-curl',repMin:8,repMax:12,restSeconds:60,sets:[
      {id:'past-1',weight:14,reps:12,completed:true,completedAt:123,rir:2},
      {id:'past-2',weight:16,reps:10,completed:true,completedAt:456,rir:1},
    ]}]}];
  return state;
}
async function mount(state){
  function Harness(){const[value,setValue]=useState(state);current=value;
    return <WorkoutPreparation state={value} update={fn=>setValue(previous=>fn(structuredClone(previous)))}
      close={closed} back={vi.fn()} Header={({title})=><h2>{title}</h2>} Editor={PlanEditor}/>;}
  await act(async()=>root.render(<Harness/>));
  await click(host.querySelector('.plan-editor-summary'));
}
async function replace(name){
  await click(host.querySelector('.plan-editor-picker-trigger'));
  await click([...host.querySelectorAll('[role="option"]')].find(node=>node.querySelector('strong')?.textContent.trim()===name));
}
async function add(name){
  await click(button('+ Add exercise'));
  await click([...host.querySelectorAll('[role="option"]')].find(node=>node.querySelector('strong')?.textContent.trim()===name));
}
it('opens a newly added exercise with its previous weights and reps before Apply',async()=>{
  const state=fixture(),before=structuredClone(state);await mount(state);await add('Cable Curl');
  expect(button('Collapse Cable Curl')).toBeDefined();
  const history=host.querySelector('[aria-label="Last workout for Cable Curl"]');
  expect(history.textContent).toContain('14 kg · 12 reps');expect(history.textContent).toContain('16 kg · 10 reps');
  expect(field('Minimum reps for Cable Curl').value).toBe('8');expect(field('Maximum reps for Cable Curl').value).toBe('12');
  expect([...history.closest('article').querySelectorAll('.plan-editor-weights input')].map(node=>node.value)).toEqual(['14','16','']);
  expect(current).toEqual(before);expect(saveState).not.toHaveBeenCalled();
  await click(button('SAVE FOR TODAY'));
  const prepared=adaptedTemplateForToday(current).exercises.find(row=>row.exerciseId==='cable-curl');
  expect(prepared.sets.map(set=>[set.weight,set.reps])).toEqual([[14,12],[16,10],[null,8]]);
  expect(prepared.replacementOfExerciseId).toBeUndefined();
  expect(prepared.sets.every(set=>!set.completed&&!set.completedAt&&!set.touched&&set.rir==null)).toBe(true);
  expect(current.program).toEqual(before.program);expect(current.workouts).toEqual(before.workouts);
  const active=startWorkout(current,adaptedTemplateForToday(current));
  expect(active.exercises.find(row=>row.exerciseId==='cable-curl').sets.map(set=>[set.weight,set.reps])).toEqual([[14,12],[16,10],[null,8]]);
});
it('opens an added exercise without history with blank weights and its own default reps',async()=>{
  await mount(fixture());await add('Leg Extension');
  expect(button('Collapse Leg Extension')).toBeDefined();
  expect(host.querySelector('[aria-label="Last workout for Leg Extension"]').textContent).toContain('No previous logged sets');
  expect(field('Minimum reps for Leg Extension').value).toBe('10');
  await click(button('SAVE FOR TODAY'));
  expect(current.todayAdaptation.workout.exercises.find(row=>row.exerciseId==='leg-extension').sets.every(set=>set.weight==null&&set.reps===10)).toBe(true);
});
it('does not seed newly added recurring-plan exercises from session history',async()=>{
  const state=fixture(),saved=vi.fn();
  await act(async()=>root.render(<PlanEditor source={state.program} profile={state.profile} exerciseState={state} mode="edit" workoutOnly onSave={saved} onCancel={()=>{}}/>));
  await add('Cable Curl');expect(host.querySelector('.plan-editor-last-session')).toBeNull();
  await click(button('SAVE TO WEEKLY PLAN'));
  const added=saved.mock.calls[0][0].days[0].exercises.find(row=>row.exerciseId==='cable-curl');
  expect(added.sets.every(set=>set.weight==null&&set.reps===10)).toBe(true);
});
it('loads the new exercise history before Apply, then starts with those same values',async()=>{
  const state=fixture(),before=structuredClone(state),ids=state.program.days[0].exercises[0].sets.map(set=>set.id);
  await mount(state);expect(host.querySelector('.plan-editor-last-session').textContent).toContain('53 kg');
  await replace('Cable Curl');
  const history=host.querySelector('.plan-editor-last-session');
  expect(history.getAttribute('aria-label')).toBe('Last workout for Cable Curl');
  expect(history.textContent).toContain('14 kg · 12 reps');expect(history.textContent).toContain('16 kg · 10 reps');expect(history.textContent).not.toContain('53 kg');
  expect(field('Minimum reps for Cable Curl').value).toBe('8');expect(field('Maximum reps for Cable Curl').value).toBe('12');
  expect([...host.querySelectorAll('.plan-editor-weights input')].map(node=>node.value)).toEqual(['14','16','']);
  expect(current).toEqual(before);await click(button('SAVE FOR TODAY'));expect(closed).toHaveBeenCalledOnce();expect(saveState).toHaveBeenCalledOnce();
  const prepared=adaptedTemplateForToday(current).exercises[0];
  expect(prepared.sets.map(set=>set.id)).toEqual(ids);
  expect(prepared.sets.map(set=>[set.weight,set.reps])).toEqual([[14,12],[16,10],[null,8]]);
  expect(prepared.sets.every(set=>!set.completed&&!set.completedAt&&!set.touched&&set.rir==null)).toBe(true);
  expect(current.program).toEqual(before.program);expect(current.workouts).toEqual(before.workouts);
  const active=startWorkout(current,adaptedTemplateForToday(current));
  expect(active.exercises[0].sets.map(set=>[set.weight,set.reps])).toEqual([[14,12],[16,10],[null,8]]);
});
it('replacing again with an unlogged exercise clears the prior history and numbers immediately',async()=>{
  await mount(fixture());await replace('Cable Curl');await replace('Leg Extension');
  expect(host.querySelector('.plan-editor-last-session').textContent).toContain('No previous logged sets');
  expect(field('Minimum reps for Leg Extension').value).toBe('10');expect(field('Maximum reps for Leg Extension').value).toBe('15');
  expect([...host.querySelectorAll('.plan-editor-weights input')].map(node=>node.value)).toEqual(['','','']);
  await click(button('SAVE FOR TODAY'));expect(current.todayAdaptation.workout.exercises[0].sets.every(set=>set.weight==null&&set.reps===10)).toBe(true);
});
it('selecting the current exercise preserves edits already made to its draft',async()=>{
  await mount(fixture());await replace('Cable Curl');await input(host.querySelector('.plan-editor-weights input'),'21');
  await replace('Cable Curl');expect(host.querySelector('.plan-editor-weights input').value).toBe('21');
});
it('clears the old open-target and starting-load metadata on the prepared replacement',async()=>{
  const state=fixture(),row=state.program.days[0].exercises[0];
  Object.assign(row,{repMin:null,repMax:null,failureTarget:'AMRAP',nextBlockStartingLoad:{weight:99}});
  await mount(state);await replace('Cable Curl');await click(button('SAVE FOR TODAY'));
  const prepared=current.todayAdaptation.workout.exercises[0];
  expect(prepared).toMatchObject({repMin:8,repMax:12});expect(prepared.failureTarget).toBeUndefined();expect(prepared.nextBlockStartingLoad).toBeUndefined();
});
it('keeps history seeding scoped to today, leaving recurring plan edits unchanged',async()=>{
  const state=fixture(),saved=vi.fn();
  await act(async()=>root.render(<PlanEditor source={state.program} profile={state.profile} exerciseState={state} mode="edit" workoutOnly onSave={saved} onCancel={()=>{}}/>));
  await click(host.querySelector('.plan-editor-summary'));await replace('Cable Curl');
  expect(host.querySelector('.plan-editor-last-session')).toBeNull();expect(field('Minimum reps for Cable Curl').value).toBe('5');
  await click(button('SAVE TO WEEKLY PLAN'));expect(saved.mock.calls[0][0].days[0].exercises[0].sets.every(set=>set.weight==null&&set.reps===5)).toBe(true);
});
it.each(['pull-up','plank'])('does not carry external weights or old rep units into %s',id=>{
  const state=fixture(),row=state.program.days[0].exercises[0];
  const result=prepareTodayReplacementValues(state,row,exerciseCatalog[id]);
  expect(result.sets.every(set=>set.weight==null&&!set.completed)).toBe(true);
  expect(result.repMin).not.toBe(5);expect(result.measure).toBe(id==='plank'?'seconds':'reps');
  expect(row.sets[0].weight).toBe(78);
});
