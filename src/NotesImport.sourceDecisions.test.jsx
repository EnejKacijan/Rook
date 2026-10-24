import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,it,expect,vi} from 'vitest';
import {PlanEditor} from './App.jsx';
import {AIService} from './aiService.js';
import {blankState} from './domain.js';
import {preparePlanImport} from './planImportTransaction.js';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
afterEach(async()=>{await act(async()=>root?.unmount());host?.remove();vi.unstubAllGlobals();vi.restoreAllMocks();});
const button=name=>[...host.querySelectorAll('button')].find(b=>!b.closest('[hidden]')&&(b.textContent.trim()===name||b.getAttribute('aria-label')===name));
const click=async name=>act(async()=>button(name).click());
const fill=async(label,value)=>act(async()=>{const el=host.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
async function setup(source){
  const state=blankState(),result=await AIService.importTrainingPlan(state.profile,source,{review:true}),saved=vi.fn();
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));Element.prototype.scrollIntoView=vi.fn();
  host=document.createElement('main');host.className='screen import-plan-screen';document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(<PlanEditor source={result.program} sourceReview={result.sourceReview} profile={result.profile} exerciseState={state} mode="import" onSave={saved} onCancel={()=>{}}/>));
  return {state,result,saved,accept:program=>preparePlanImport(state,program,result.profile,{date:'2026-10-19',weekday:'Mon',initial:true})};
}
it('requires a timer choice, invalidates cleared/invalid input, and saves the chosen range timer',async()=>{
  const {saved,accept}=await setup('Monday\nBench Press 3x8\nRest 2-3 min');
  expect(button('REVIEW PLAN').disabled).toBe(true);
  await fill('Reviewed rest seconds','150');expect(button('REVIEW PLAN').disabled).toBe(false);
  await fill('Reviewed rest seconds','');expect(button('REVIEW PLAN').disabled).toBe(true);
  await fill('Reviewed rest seconds','-1');expect(button('REVIEW PLAN').disabled).toBe(true);
  await fill('Reviewed rest seconds','120');await click('REVIEW PLAN');await click('USE THIS PLAN');
  expect(saved).toHaveBeenCalledOnce();const program=saved.mock.calls[0][0];
  expect(program.importMetadata.pendingSourceDecisions).toEqual([]);
  expect(accept(program).program.days[0].exercises[0]).toMatchObject({restSeconds:120,importedRestRangeSeconds:[120,180]});
});
it('applies a rest-range decision consistently to both members of the pair',async()=>{
  const {saved,accept}=await setup('Monday\nA1 Bench Press 3x8\nA2 Cable Row 3x10\nRest 2-3 min after each pair');
  await fill('Reviewed rest seconds','120');await click('REVIEW PLAN');await click('USE THIS PLAN');
  expect(accept(saved.mock.calls[0][0]).program.days[0].exercises.map(e=>e.restSeconds)).toEqual([120,120]);
});
it('accepts an explicit unspecified RIR without carrying a guessed range bound',async()=>{
  const {saved,accept}=await setup('Monday\nBench Press 3x8 RIR 2-3');
  const select=host.querySelector('[aria-label="Reviewed RIR"]');
  await act(async()=>{select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await click('REVIEW PLAN');await click('USE THIS PLAN');
  expect(accept(saved.mock.calls[0][0]).program.days[0].exercises[0].targetRir).toBeNull();
});
it('shows a source-edit action for a pyramid and offers no accept shortcut',async()=>{
  const {saved}=await setup('Monday\nBench Press 3 sets: 12/10/8 reps at 50/55/60 kg');
  expect(host.textContent).toContain('different targets for each set');
  expect(button('EDIT NOTES')).toBeTruthy();expect(button('REVIEW PLAN')).toBeUndefined();expect(button('USE THIS PLAN')).toBeUndefined();expect(saved).not.toHaveBeenCalled();
});
it('clears the alternative guard only after an explicit choice in the production review',async()=>{
  const {saved,accept}=await setup('Monday\nLeg Press 3x9 155kg / Hack Squat 3x8 80kg');
  const option=[...host.querySelectorAll('.choice-row')].find(e=>e.textContent.startsWith('Leg Press'));
  await act(async()=>option.click());await click('REVIEW PLAN');await click('USE THIS PLAN');
  const accepted=accept(saved.mock.calls[0][0]);
  expect(accepted.program.days[0].exercises[0].sets.map(s=>s.weight)).toEqual([155,155,155]);
  expect(accepted.program.importMetadata.pendingSourceDecisions).toEqual([]);
});
it('requires an assistance-load decision and accepts explicit unspecified load without inventing lifted kg',async()=>{
  const {saved,accept}=await setup('Monday\nAssisted Pull-up 3x8 -25 kg');
  expect(button('REVIEW PLAN').disabled).toBe(true);
  await click('Leave load unspecified');await click('REVIEW PLAN');await click('USE THIS PLAN');
  const next=accept(saved.mock.calls[0][0]);
  expect(next.program.days[0].exercises[0].sets.map(s=>s.weight)).toEqual([null,null,null]);
  expect(next.program.importMetadata.sourceNotes.map(n=>n.text).join('\n')).toContain('-25 kg');
  expect(next.program.importMetadata.pendingSourceDecisions).toEqual([]);
});
